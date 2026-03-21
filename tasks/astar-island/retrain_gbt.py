"""Retrain the GBT models using local ground truth data (offline).

Trains with 75 features: 30 cell + 22 enhanced obs stats + 23 per-cell obs.

Usage:
    cd tasks/astar-island
    python retrain_gbt.py
"""

import json
import os
import sys
import pickle
import numpy as np
import warnings

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(__file__))

import xgboost as xgb
from model import _extract_cell_features, compute_obs_stats, compute_cell_obs_features
from utils import load_observations


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
    11: "324fde07-1670-4202-b199-7aa92ecb40ee",
    12: "795bfb1f-54bd-4f39-a526-9868b36f7ebd",
    13: "7b4bda99-6165-4221-97cc-27880f5e6d95",
}
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

ROUND_WEIGHTS = {1: 1.0, 2: 1.05, 4: 1.05**3, 5: 1.05**4, 6: 1.05**5, 7: 1.05**6, 8: 1.05**7, 9: 1.05**8, 10: 1.05**9, 11: 1.05**10, 12: 1.05**11, 13: 1.05**12}

# Per-terrain XGBoost hyperparameters — must match train.py LORO-validated config
XGB_HPARAMS = {
    "plains": dict(n_estimators=600, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.55, min_child_weight=3),
    "forest": dict(n_estimators=600, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.55, min_child_weight=3),
    "settl":  dict(n_estimators=600, max_depth=5, learning_rate=0.08,
                   reg_alpha=0.1, reg_lambda=2.0, subsample=0.9,
                   colsample_bytree=0.55, min_child_weight=3),
}


def main():
    print("Retraining GBT models (75 features: 30 cell + 22 obs + 23 cell obs)...")

    X_data = {"plains": [], "forest": [], "settl": []}
    Y_data = {"plains": [], "forest": [], "settl": []}
    W_data = {"plains": [], "forest": [], "settl": []}

    for rnum, round_id in sorted(ROUNDS.items()):
        init_path = os.path.join(DATA_DIR, f"round{rnum}_initial.json")
        if not os.path.exists(init_path):
            continue

        with open(init_path) as f:
            info = json.load(f)

        # Enhanced obs stats (22 features)
        all_obs = load_observations(round_id)
        obs_stats = compute_obs_stats(all_obs) if all_obs else np.zeros(23)
        rw = ROUND_WEIGHTS.get(rnum, 1.0)

        # Per-cell obs features (23 features per cell)
        g0 = info["initial_states"][0]["grid"]
        h0, w0 = len(g0), len(g0[0]) if g0 else 0
        cell_obs = compute_cell_obs_features(all_obs, h0, w0) if all_obs else np.zeros((h0, w0, 23))

        for seed in range(5):
            gt_path = os.path.join(DATA_DIR, f"gt_r{rnum}_seed{seed}.npy")
            if not os.path.exists(gt_path):
                continue

            gt = np.load(gt_path)
            grid = info["initial_states"][seed]["grid"]
            settlements = info["initial_states"][seed]["settlements"]
            feats, coords = _extract_cell_features(grid, settlements)
            targets = np.array([gt[y, x] for y, x in coords])

            # Append obs stats (30 + 22 = 52)
            feats = np.hstack([feats, np.tile(obs_stats, (len(feats), 1))])
            # Append per-cell obs features (52 + 23 = 75)
            cell_feats = np.array([cell_obs[y, x] for y, x in coords])
            feats = np.hstack([feats, cell_feats])

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

        print(f"  Round {rnum}: loaded 5 seeds")

    # Train terrain-specific XGBoost models
    models = {}
    for terrain_type in ["plains", "forest", "settl"]:
        X = np.array(X_data[terrain_type])
        Y = np.array(Y_data[terrain_type])
        W = np.array(W_data[terrain_type])
        hp = XGB_HPARAMS[terrain_type]
        print(f"  {terrain_type}: {X.shape[0]} samples, {X.shape[1]} features")

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
                random_state=42,
                verbosity=0,
            )
            m.fit(X, Y[:, cls], sample_weight=W)
            terrain_models.append(m)
        models[terrain_type] = terrain_models

    # Save
    path = os.path.join(os.path.dirname(__file__), "data", "gbt_models.pkl")
    with open(path, "wb") as f:
        pickle.dump(models, f)

    total = sum(len(X_data[t]) for t in X_data)
    print(f"\nSaved GBT models: {total} total samples, {len(ROUNDS)} rounds, 75 features")


if __name__ == "__main__":
    main()
