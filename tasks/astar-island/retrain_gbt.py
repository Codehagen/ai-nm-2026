"""Retrain the GBT models using local ground truth data (offline).

Trains with 37 features: 30 cell features + 7 round-level observation stats.

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
from model import _extract_cell_features, compute_obs_stats
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
}
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def main():
    print("Retraining GBT models from local data (37 features)...")

    X_data = {"plains": [], "forest": [], "settl": []}
    Y_data = {"plains": [], "forest": [], "settl": []}

    for rnum, round_id in sorted(ROUNDS.items()):
        init_path = os.path.join(DATA_DIR, f"round{rnum}_initial.json")
        if not os.path.exists(init_path):
            continue

        with open(init_path) as f:
            info = json.load(f)

        # Load observation stats for this round (7 features)
        all_obs = load_observations(round_id)
        obs_stats = compute_obs_stats(all_obs) if all_obs else np.zeros(7)

        for seed in range(5):
            gt_path = os.path.join(DATA_DIR, f"gt_r{rnum}_seed{seed}.npy")
            if not os.path.exists(gt_path):
                continue

            gt = np.load(gt_path)
            grid = info["initial_states"][seed]["grid"]
            settlements = info["initial_states"][seed]["settlements"]
            feats, coords = _extract_cell_features(grid, settlements)
            targets = np.array([gt[y, x] for y, x in coords])

            # Append obs stats to get 37 features per cell
            stats_tile = np.tile(obs_stats, (len(feats), 1))
            feats = np.hstack([feats, stats_tile])

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

        print(f"  Round {rnum}: loaded 5 seeds")

    # Train terrain-specific XGBoost models
    models = {}
    for terrain_type in ["plains", "forest", "settl"]:
        X = np.array(X_data[terrain_type])
        Y = np.array(Y_data[terrain_type])
        print(f"  {terrain_type}: {X.shape[0]} samples, {X.shape[1]} features")

        terrain_models = []
        for cls in range(6):
            m = xgb.XGBRegressor(
                n_estimators=200,
                max_depth=4,
                learning_rate=0.1,
                reg_alpha=0.1,
                reg_lambda=2.0,
                subsample=0.9,
                colsample_bytree=0.9,
                min_child_weight=3,
                random_state=42,
                verbosity=0,
            )
            m.fit(X, Y[:, cls])
            terrain_models.append(m)
        models[terrain_type] = terrain_models

    # Save
    path = os.path.join(os.path.dirname(__file__), "data", "gbt_models.pkl")
    with open(path, "wb") as f:
        pickle.dump(models, f)

    total = sum(len(X_data[t]) for t in X_data)
    print(f"\nSaved GBT models: {total} total samples, {len(ROUNDS)} rounds, 37 features")


if __name__ == "__main__":
    main()
