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
)
from evaluate import compute_score
from utils import normalize_prediction, load_observations
from dtos import TERRAIN_TO_CLASS, NUM_CLASSES, PROB_FLOOR

# ──────────────────────────────────────────────────────────────
# TUNABLE PARAMETERS — edit these to experiment
# ──────────────────────────────────────────────────────────────

# GBT blend weight: how much to trust XGBoost vs heuristic (0-1)
BLEND_WEIGHT = 0.35

# Smoothing: blend final prediction with uniform prior to reduce overconfidence
# This helps on rounds where hidden params deviate most from training data
SMOOTH_WEIGHT = 0.02  # 2% uniform prior

# L7 observation-ratio correction strengths per class:
# [empty, settlement, port, ruin, forest, mountain]
# Safe L7: zero for rare classes (port, ruin) — prevents catastrophic KL
L7_STRENGTHS = np.array([1.20, 0.80, 0.0, 0.0, 1.30, 0.0])
L7_MIN_OBS = np.array([200, 50, 30, 20, 100, 0])  # min obs count per class
L7_ADJ_MIN = 0.80  # hard safety clamp
L7_ADJ_MAX = 1.25

# Per-terrain XGBoost hyperparameters
XGB_HPARAMS = {
    "plains": dict(n_estimators=200, max_depth=4, learning_rate=0.1,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.9, min_child_weight=3),
    "forest": dict(n_estimators=200, max_depth=4, learning_rate=0.1,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.9, min_child_weight=3),
    "settl":  dict(n_estimators=200, max_depth=4, learning_rate=0.1,
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
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def load_round_data(round_num):
    with open(os.path.join(DATA_DIR, f"round{round_num}_initial.json")) as f:
        info = json.load(f)
    initial_states = info["initial_states"]
    gts = []
    for seed in range(5):
        gts.append(np.load(os.path.join(DATA_DIR, f"gt_r{round_num}_seed{seed}.npy")))
    return initial_states, gts


def train_gbt_models(train_rounds):
    """Train terrain-specific XGBoost on given rounds."""
    X_data = {"plains": [], "forest": [], "settl": []}
    Y_data = {"plains": [], "forest": [], "settl": []}

    for rnum in train_rounds:
        initial_states, gts = load_round_data(rnum)
        for seed in range(5):
            grid = initial_states[seed]["grid"]
            settlements = initial_states[seed]["settlements"]
            gt = gts[seed]
            feats, coords = _extract_cell_features(grid, settlements)
            targets = np.array([gt[y, x] for y, x in coords])
            for i, (y, x) in enumerate(coords):
                code = grid[y][x]
                if code in {11, 0}:
                    X_data["plains"].append(feats[i])
                    Y_data["plains"].append(targets[i])
                elif code == 4:
                    X_data["forest"].append(feats[i])
                    Y_data["forest"].append(targets[i])
                elif code in {1, 2}:
                    X_data["settl"].append(feats[i])
                    Y_data["settl"].append(targets[i])

    models = {}
    for terrain_type in ["plains", "forest", "settl"]:
        X = np.array(X_data[terrain_type])
        Y = np.array(Y_data[terrain_type])
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
            m.fit(X, Y[:, cls])
            terrain_models.append(m)
        models[terrain_type] = terrain_models
    return models


def gbt_predict_with_models(models_dict, initial_grid, settlements):
    h = len(initial_grid)
    w = len(initial_grid[0]) if h > 0 else 0
    features, coords = _extract_cell_features(initial_grid, settlements)
    if len(features) == 0:
        return None
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
    """Run full 6-fold LORO and return (avg, per_round_dict)."""
    test_rounds = [1, 2, 4, 5, 6, 7]
    results = {}

    for held_out in test_rounds:
        train_on = [r for r in test_rounds if r != held_out]
        gbt_models = train_gbt_models(train_on)

        round_id = ROUNDS[held_out]
        initial_states, gts = load_round_data(held_out)
        all_observations = load_observations(round_id)

        scores = []
        for seed in range(5):
            grid = initial_states[seed]["grid"]
            settlements = initial_states[seed]["settlements"]
            gt = gts[seed]

            # Layer 1+3: Static + context priors
            tensor = build_static_prediction(grid)
            tensor = fill_unobserved_dynamic(tensor, grid, settlements, [], seed)

            # Layer 6: GBT blend
            gbt_pred = gbt_predict_with_models(gbt_models, grid, settlements)
            if gbt_pred is not None:
                h, w, _ = tensor.shape
                for y in range(h):
                    for x in range(w):
                        if grid[y][x] not in {10, 5}:
                            tensor[y, x] = (1 - BLEND_WEIGHT) * tensor[y, x] + BLEND_WEIGHT * gbt_pred[y, x]

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
                        adj = np.clip(adj, L7_ADJ_MIN, L7_ADJ_MAX)
                        for y in range(h):
                            for x in range(w):
                                if grid[y][x] in {10, 5}:
                                    continue
                                tensor[y, x] *= adj
                                tensor[y, x] = np.maximum(tensor[y, x], PROB_FLOOR)
                                tensor[y, x] /= tensor[y, x].sum()

            # Smoothing: blend with uniform to reduce overconfidence
            if SMOOTH_WEIGHT > 0:
                uniform = np.full(NUM_CLASSES, 1.0 / NUM_CLASSES)
                h, w, _ = tensor.shape
                for y in range(h):
                    for x in range(w):
                        if grid[y][x] not in {10, 5}:
                            tensor[y, x] = (1 - SMOOTH_WEIGHT) * tensor[y, x] + SMOOTH_WEIGHT * uniform

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

    # Autoresearch-compatible output
    print("---")
    print(f"val_metric: {avg:.6f}")
    print(f"training_seconds: {elapsed:.1f}")
    print(f"total_seconds: {elapsed:.1f}")
    print(f"peak_vram_mb: 0.0")
