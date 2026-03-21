"""Autoresearch-compatible training/evaluation script for Astar Island.

This is the MUTABLE file — the autoresearch agent edits this.
Runs offline 5-fold LORO evaluation using local GT data (~75s).

Usage:
    cd tasks/astar-island && python train.py > run.log 2>&1
    grep "^val_metric:" run.log

Contract:
    - TIME_BUDGET: ~75 seconds (5-fold LORO with XGBoost retraining)
    - Prints val_metric: <float> (higher is better, max 100)
    - Prints per-round breakdown for diagnostics
"""

import json
import os
import sys
import time
import numpy as np
import warnings

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(__file__))

import xgboost as xgb
from model import (
    _extract_cell_features,
    build_static_prediction,
    fill_unobserved_dynamic,
    compute_obs_stats,
    build_round_empirical_tables,
    _dist_to_bucket,
    _is_coastal_4connected,
)
from evaluate import compute_score
from utils import normalize_prediction, load_observations
from dtos import TERRAIN_TO_CLASS, NUM_CLASSES, PROB_FLOOR

# ──────────────────────────────────────────────────────────────
# TUNABLE PARAMETERS — edit these to experiment
# ──────────────────────────────────────────────────────────────

# GBT blend weight: how much to trust XGBoost vs heuristic (0-1)
BLEND_WEIGHT = 0.35
# Per-terrain blend overrides (None = use BLEND_WEIGHT)
BLEND_TERRAIN = {"plains": 0.55, "forest": 0.65, "settl": 0.75}

# Smoothing: blend final prediction with uniform prior to reduce overconfidence
# This helps on rounds where hidden params deviate most from training data
SMOOTH_WEIGHT = 0.0  # disabled — hurts score

# L7 observation-ratio correction strengths per class:
# [empty, settlement, port, ruin, forest, mountain]
# Safe L7: zero for rare classes (port, ruin) — prevents catastrophic KL
L7_STRENGTHS = np.array([1.60, 1.20, 0.0, 0.0, 1.70, 0.0])
L7_MIN_OBS = np.array([200, 50, 30, 20, 100, 0])  # min obs count per class
L7_ADJ_MIN = 0.80  # hard safety clamp
L7_ADJ_MAX = 1.25

# Per-terrain XGBoost hyperparameters
XGB_HPARAMS = {
    "plains": dict(n_estimators=300, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.9, min_child_weight=3),
    "forest": dict(n_estimators=300, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.9, min_child_weight=3),
    "settl":  dict(n_estimators=300, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.9, min_child_weight=3),
}

# ──────────────────────────────────────────────────────────────
# Round data
# ──────────────────────────────────────────────────────────────

ROUNDS = {
    1: "71451d74-be9f-471f-aacd-a41f3b68a9cd",
    2: "76909e29-f664-4b2f-b16b-61b7507277e9",
    4: "8e839974-b13b-407b-a5e7-fc749d877195",
    5: "fd3c92ff-3178-4dc9-8d9b-acf389b3982b",
    6: "ae78003a-4efe-425a-881a-d16a39bca0ad",
    7: "36e581f1-73f8-453f-ab98-cbe3052b701b",
    8: "c5cdf100-a876-4fb7-b5d8-757162c97989",
    9: "2a341ace-0f57-4309-9b89-e59fe0f09179",
    10: "75e625c3-60cb-4392-af3e-c86a98bde8c2",
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def enhanced_obs_stats(observations):
    """Compute enhanced round-level obs stats (16 features: base 7 + min_food, max_pop, food_std, min_defense, defense_std, n_factions_norm, obs_settl_rate, obs_ruin_rate, food_deficit)."""
    base = compute_obs_stats(observations) if observations else np.zeros(7)
    pops, foods, defenses = [], [], []
    factions = set()
    # Grid-level settlement/ruin rate
    grid_settl_count, grid_ruin_count, grid_total = 0, 0, 0
    for obs in (observations or []):
        for s in obs.get("settlements", []):
            if s.get("alive", True):
                pops.append(s.get("population", 0))
                foods.append(s.get("food", 0))
                defenses.append(s.get("defense", 0))
                factions.add(s.get("owner_id", -1))
        for row in obs.get("grid", []):
            for code in row:
                if code not in {10, 5}:  # skip ocean/mountain
                    grid_total += 1
                    if code in {1, 2}:  # settlement or port
                        grid_settl_count += 1
                    elif code == 3:  # ruin
                        grid_ruin_count += 1
    min_food = float(np.min(foods)) if foods else 0.0
    max_pop = float(np.max(pops)) if pops else 0.0
    food_std = float(np.std(foods)) if foods else 0.0
    min_defense = float(np.min(defenses)) if defenses else 0.0
    defense_std = float(np.std(defenses)) if defenses else 0.0
    n_factions_norm = len(factions) / 10.0  # normalize: typically 1-10 factions
    obs_settl_rate = grid_settl_count / max(grid_total, 1)
    obs_ruin_rate = grid_ruin_count / max(grid_total, 1)
    avg_food = float(np.mean(foods)) if foods else 0.0
    avg_pop = float(np.mean(pops)) if pops else 0.0
    food_deficit = avg_food - avg_pop  # positive = surplus, negative = deficit
    return np.concatenate([base, [min_food, max_pop, food_std, min_defense, defense_std, n_factions_norm, obs_settl_rate, obs_ruin_rate, food_deficit]])


def compute_cell_obs_features(observations, h, w):
    """Compute per-cell observation features (9 features per cell):
    [obs_settl_rate, obs_empty_rate, obs_ruin_rate, obs_freq,
     neighbor_settl_rate_r2, neighbor_settl_count_r2,
     neighbor_settl_rate_r4, neighbor_ruin_rate_r2, max_neighbor_settl_rate_r2]
    """
    cell_counts = np.zeros((h, w), dtype=np.int32)
    cell_settl = np.zeros((h, w), dtype=np.int32)
    cell_empty = np.zeros((h, w), dtype=np.int32)
    cell_ruin = np.zeros((h, w), dtype=np.int32)
    for obs in (observations or []):
        vp = obs.get("viewport", {})
        vy, vx = vp.get("y", 0), vp.get("x", 0)
        obs_grid = obs.get("grid", [])
        for dy in range(len(obs_grid)):
            row = obs_grid[dy]
            for dx in range(len(row)):
                y2, x2 = vy + dy, vx + dx
                if 0 <= y2 < h and 0 <= x2 < w:
                    cell_counts[y2, x2] += 1
                    code = row[dx]
                    if code in {1, 2}:
                        cell_settl[y2, x2] += 1
                    elif code in {0, 11}:
                        cell_empty[y2, x2] += 1
                    elif code == 3:
                        cell_ruin[y2, x2] += 1
    total_obs = max(len(observations or []), 1)
    settl_rate = np.zeros((h, w), dtype=np.float32)
    ruin_rate = np.zeros((h, w), dtype=np.float32)
    result = np.zeros((h, w, 9), dtype=np.float32)
    for y in range(h):
        for x in range(w):
            n = cell_counts[y, x]
            if n > 0:
                sr = cell_settl[y, x] / n
                rr = cell_ruin[y, x] / n
                settl_rate[y, x] = sr
                ruin_rate[y, x] = rr
                result[y, x, 0] = sr
                result[y, x, 1] = cell_empty[y, x] / n
                result[y, x, 2] = rr
                result[y, x, 3] = n / total_obs
    # Compute neighbor features
    for y in range(h):
        for x in range(w):
            nbr_r2_settl, nbr_r2_ruin, nbr_r4_settl = [], [], []
            nbr_r2_count = 0
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    if dy == 0 and dx == 0:
                        continue
                    md = abs(dy) + abs(dx)
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        if md <= 2:
                            nbr_r2_settl.append(settl_rate[ny, nx])
                            nbr_r2_ruin.append(ruin_rate[ny, nx])
                            if settl_rate[ny, nx] > 0.1:
                                nbr_r2_count += 1
                        if md <= 4:
                            nbr_r4_settl.append(settl_rate[ny, nx])
            result[y, x, 4] = float(np.mean(nbr_r2_settl)) if nbr_r2_settl else 0.0
            result[y, x, 5] = float(nbr_r2_count)
            result[y, x, 6] = float(np.mean(nbr_r4_settl)) if nbr_r4_settl else 0.0
            result[y, x, 7] = float(np.mean(nbr_r2_ruin)) if nbr_r2_ruin else 0.0
            result[y, x, 8] = float(np.max(nbr_r2_settl)) if nbr_r2_settl else 0.0
    return result


def load_round_data(round_num):
    with open(os.path.join(DATA_DIR, f"round{round_num}_initial.json")) as f:
        info = json.load(f)
    initial_states = info["initial_states"]
    gts = []
    for seed in range(5):
        gts.append(np.load(os.path.join(DATA_DIR, f"gt_r{round_num}_seed{seed}.npy")))
    return initial_states, gts


ROUND_WEIGHTS = {1: 1.0, 2: 1.05, 4: 1.05**3, 5: 1.05**4, 6: 1.05**5, 7: 1.05**6, 8: 1.05**7, 9: 1.05**8, 10: 1.05**9}


def train_gbt_models(train_rounds):
    """Train terrain-specific XGBoost on given rounds (55 features: 30 cell + 16 obs stats + 9 cell obs)."""
    X_data = {"plains": [], "forest": [], "settl": []}
    Y_data = {"plains": [], "forest": [], "settl": []}
    W_data = {"plains": [], "forest": [], "settl": []}

    for rnum in train_rounds:
        initial_states, gts = load_round_data(rnum)
        all_obs = load_observations(ROUNDS[rnum])
        obs_stats = enhanced_obs_stats(all_obs)
        rw = ROUND_WEIGHTS.get(rnum, 1.0)
        # Compute cell-level obs features (shared across seeds for this round)
        # Use seed 0 grid dimensions (all seeds same map size)
        g0 = initial_states[0]["grid"]
        h0, w0 = len(g0), len(g0[0]) if g0 else 0
        cell_obs = compute_cell_obs_features(all_obs, h0, w0)
        for seed in range(5):
            grid = initial_states[seed]["grid"]
            settlements = initial_states[seed]["settlements"]
            gt = gts[seed]
            feats, coords = _extract_cell_features(grid, settlements)
            # Append round-level obs stats (46 total so far)
            feats = np.hstack([feats, np.tile(obs_stats, (len(feats), 1))])
            # Append per-cell obs features (50 total)
            cell_feats = np.array([cell_obs[y, x] for y, x in coords])
            feats = np.hstack([feats, cell_feats])
            targets = np.array([gt[y, x] for y, x in coords])
            for i, (y, x) in enumerate(coords):
                code = grid[y][x]
                if code in {11, 0}:
                    X_data["plains"].append(feats[i])
                    Y_data["plains"].append(targets[i])
                    W_data["plains"].append(rw)
                elif code == 4:
                    X_data["forest"].append(feats[i])
                    Y_data["forest"].append(targets[i])
                    W_data["forest"].append(rw)
                elif code in {1, 2}:
                    X_data["settl"].append(feats[i])
                    Y_data["settl"].append(targets[i])
                    W_data["settl"].append(rw)

    models = {}
    for terrain_type in ["plains", "forest", "settl"]:
        X = np.array(X_data[terrain_type])
        Y = np.array(Y_data[terrain_type])
        W = np.array(W_data[terrain_type])
        hp = XGB_HPARAMS[terrain_type]
        terrain_models = []
        for cls in range(6):
            m = xgb.XGBRegressor(
                n_estimators=hp["n_estimators"],
                max_depth=hp["max_depth"],
                learning_rate=hp["learning_rate"],
                reg_alpha=hp["reg_alpha"],
                reg_lambda=hp["reg_lambda"],
                subsample=hp["subsample"],
                colsample_bytree=hp["colsample_bytree"],
                min_child_weight=hp["min_child_weight"],
                random_state=42, verbosity=0,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            terrain_models.append(m)
        models[terrain_type] = terrain_models
    return models


def gbt_predict_with_models(models_dict, initial_grid, settlements, obs_stats=None, cell_obs=None):
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    features, coords = _extract_cell_features(initial_grid, settlements)
    if len(features) == 0:
        return None
    # Append obs stats to match training (46 features)
    if obs_stats is not None:
        features = np.hstack([features, np.tile(obs_stats, (len(features), 1))])
    # Append per-cell obs features (50 features total)
    if cell_obs is not None:
        cell_feats = np.array([cell_obs[y, x] for y, x in coords])
        features = np.hstack([features, cell_feats])
    tensor = np.zeros((h, w, NUM_CLASSES))
    for y in range(h):
        for x in range(w):
            if initial_grid[y][x] == 10:
                tensor[y, x] = [1, 0, 0, 0, 0, 0]
            elif initial_grid[y][x] == 5:
                tensor[y, x] = [0, 0, 0, 0, 0, 1]
    for i, (y, x) in enumerate(coords):
        code = initial_grid[y][x]
        ttype = "plains" if code in {11, 0} else ("forest" if code == 4 else ("settl" if code in {1, 2} else "plains"))
        models = models_dict.get(ttype)
        if models is None:
            continue
        pred_v = np.zeros(NUM_CLASSES)
        for cls in range(NUM_CLASSES):
            pred_v[cls] = models[cls].predict(features[i:i + 1])[0]
        tensor[y, x] = np.maximum(pred_v, PROB_FLOOR)
        tensor[y, x] /= tensor[y, x].sum()
    return tensor


def evaluate_loro():
    """Run full 7-fold LORO and return (avg, per_round_dict)."""
    test_rounds = [1, 2, 4, 5, 6, 7, 8, 9, 10]
    results = {}

    for held_out in test_rounds:
        train_on = [r for r in test_rounds if r != held_out]
        gbt_models = train_gbt_models(train_on)

        round_id = ROUNDS[held_out]
        initial_states, gts = load_round_data(held_out)
        all_observations = load_observations(round_id)

        # Build cross-seed empirical distance tables
        all_grids = [initial_states[s]["grid"] for s in range(5)]
        all_settl = [initial_states[s]["settlements"] for s in range(5)]
        round_empirical = build_round_empirical_tables(
            all_observations, all_grids, all_settlements=all_settl
        ) if all_observations else {}

        # Pre-compute cell-level obs features (shared across seeds)
        g0 = initial_states[0]["grid"]
        h0, w0 = len(g0), len(g0[0]) if g0 else 0
        cell_obs = compute_cell_obs_features(all_observations, h0, w0) if all_observations else None

        scores = []
        for seed in range(5):
            grid = initial_states[seed]["grid"]
            settlements = initial_states[seed]["settlements"]
            gt = gts[seed]

            # Layer 1+3: Static + context priors
            tensor = build_static_prediction(grid)
            tensor = fill_unobserved_dynamic(tensor, grid, settlements, [], seed)

            # Layer 6: GBT blend (with enhanced obs stats + per-cell obs features)
            obs_stats = enhanced_obs_stats(all_observations) if all_observations else None
            gbt_pred = gbt_predict_with_models(gbt_models, grid, settlements, obs_stats=obs_stats, cell_obs=cell_obs)
            if gbt_pred is not None:
                h, w, _ = tensor.shape
                for y in range(h):
                    for x in range(w):
                        code = grid[y][x]
                        if code not in {10, 5}:
                            ttype = "plains" if code in {11, 0} else ("forest" if code == 4 else ("settl" if code in {1, 2} else "plains"))
                            bw = BLEND_TERRAIN.get(ttype, BLEND_WEIGHT)
                            tensor[y, x] = (1 - bw) * tensor[y, x] + bw * gbt_pred[y, x]

            # Layer 6.7: Cross-seed empirical distance tables
            if all_observations and round_empirical:
                h, w, _ = tensor.shape
                EMP_BLEND = 0.50
                settl_pos = [(s['x'] if isinstance(s, dict) else s.x,
                              s['y'] if isinstance(s, dict) else s.y) for s in settlements]
                for y in range(h):
                    for x in range(w):
                        code = grid[y][x]
                        if code in {10, 5}:
                            continue
                        dist = min((abs(y-sy)+abs(x-sx) for sx,sy in settl_pos), default=99)
                        dist_bucket = _dist_to_bucket(dist)
                        coastal = _is_coastal_4connected(grid, y, x)
                        key = (code, dist_bucket, coastal)
                        if key in round_empirical:
                            tensor[y, x] = (1 - EMP_BLEND) * tensor[y, x] + EMP_BLEND * round_empirical[key]

            # Layer 7: Observation ratio correction
            if all_observations:
                obs_cls = np.zeros(NUM_CLASSES)
                obs_total = 0
                for obs in all_observations:
                    for row in obs.get("grid", []):
                        for code in row:
                            if code not in {10, 5}:
                                obs_cls[TERRAIN_TO_CLASS.get(code, 0)] += 1
                                obs_total += 1
                if obs_total > 100:
                    obs_freq = obs_cls / obs_total
                    h, w, _ = tensor.shape
                    model_avg = np.zeros(NUM_CLASSES)
                    m_count = 0
                    for y in range(h):
                        for x in range(w):
                            if grid[y][x] not in {10, 5}:
                                model_avg += tensor[y, x]
                                m_count += 1
                    if m_count > 0:
                        model_avg /= m_count
                        ratio = obs_freq / np.maximum(model_avg, 1e-6)
                        # Safe L7: gate by observation count, clamp adjustments
                        strengths = L7_STRENGTHS.copy()
                        for c in range(NUM_CLASSES):
                            if obs_cls[c] < L7_MIN_OBS[c]:
                                strengths[c] = 0.0
                        adj = 1.0 + strengths * (ratio - 1.0)
                        # Per-class clamp: wider for settlement (handles extreme rounds)
                        adj_min = np.array([0.75, 0.35, 1.00, 1.00, 0.75, 1.00])
                        adj_max = np.array([1.30, 1.35, 1.00, 1.00, 1.30, 1.00])
                        adj = np.clip(adj, adj_min, adj_max)
                        for y in range(h):
                            for x in range(w):
                                if grid[y][x] in {10, 5}:
                                    continue
                                tensor[y, x] *= adj
                                tensor[y, x] = np.maximum(tensor[y, x], PROB_FLOOR)
                                tensor[y, x] /= tensor[y, x].sum()

            # Layer 8: Per-cell empirical correction from observation grids
            if all_observations:
                h, w, _ = tensor.shape
                cell_counts = np.zeros((h, w), dtype=np.int32)
                cell_terrain = np.zeros((h, w, NUM_CLASSES))
                for obs in all_observations:
                    vp = obs.get("viewport", {})
                    vy, vx = vp.get("y", 0), vp.get("x", 0)
                    obs_grid = obs.get("grid", [])
                    for dy in range(len(obs_grid)):
                        for dx in range(len(obs_grid[0]) if obs_grid else 0):
                            y2, x2 = vy + dy, vx + dx
                            if 0 <= y2 < h and 0 <= x2 < w:
                                cell_counts[y2, x2] += 1
                                cls = TERRAIN_TO_CLASS.get(obs_grid[dy][dx], 0)
                                cell_terrain[y2, x2, cls] += 1

                MIN_SAMPLES = 50  # effectively disabled until repeated viewports
                EMP_WEIGHT_PER_SAMPLE = 0.03
                MAX_EMP_WEIGHT = 0.30
                for y in range(h):
                    for x in range(w):
                        n = cell_counts[y, x]
                        if n >= MIN_SAMPLES and grid[y][x] not in {10, 5}:
                            emp = cell_terrain[y, x] / n
                            emp = np.maximum(emp, PROB_FLOOR)
                            emp /= emp.sum()
                            alpha = min(MAX_EMP_WEIGHT, n * EMP_WEIGHT_PER_SAMPLE)
                            tensor[y, x] = (1 - alpha) * tensor[y, x] + alpha * emp
                            tensor[y, x] = np.maximum(tensor[y, x], PROB_FLOOR)
                            tensor[y, x] /= tensor[y, x].sum()

            tensor = normalize_prediction(tensor)
            score = compute_score(tensor, gt)
            scores.append(score)

        results[held_out] = np.mean(scores)

    return np.mean(list(results.values())), results


if __name__ == "__main__":
    start = time.time()

    avg, per_round = evaluate_loro()

    elapsed = time.time() - start

    # Per-round diagnostics
    for r, s in sorted(per_round.items()):
        print(f"round_{r}_score: {s:.4f}")

    # Weighted average (competition metric: 1.05^(round-1))
    weights = {1: 1.0, 2: 1.05, 4: 1.05**3, 5: 1.05**4, 6: 1.05**5, 7: 1.05**6, 8: 1.05**7, 9: 1.05**8, 10: 1.05**9}
    w_avg = sum(per_round[r] * weights[r] for r in per_round) / sum(weights[r] for r in per_round)
    print(f"weighted_avg: {w_avg:.4f}")

    # Autoresearch-compatible output (val_metric = weighted avg for competition alignment)
    print("---")
    print(f"val_metric: {w_avg:.6f}")
    print(f"val_metric_unweighted: {avg:.6f}")
    print(f"training_seconds: {elapsed:.1f}")
    print(f"total_seconds: {elapsed:.1f}")
    print(f"peak_vram_mb: 0.0")
