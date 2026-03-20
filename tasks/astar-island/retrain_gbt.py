"""Retrain the GBT models using all available ground truth data.

Run this before each new round to incorporate GT from all completed rounds.
The more training data, the better the model generalizes.

Usage:
    cd tasks/astar-island
    ASTAR_TOKEN=... python retrain_gbt.py
"""

import os
import sys
import pickle
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import xgboost as xgb
from client import AstarClient
from model import _extract_cell_features


def main():
    token = os.environ.get("ASTAR_TOKEN", "")
    if not token:
        print("ERROR: Set ASTAR_TOKEN env var")
        return

    client = AstarClient(token=token)
    rounds = client.get_my_rounds()
    completed = [r for r in rounds if r["status"] in ("completed", "scoring")]

    if not completed:
        print("No completed rounds to train on.")
        return

    print(f"Found {len(completed)} completed round(s)")

    # Collect training data from all completed rounds
    X_data = {"plains": [], "forest": [], "settl": []}
    Y_data = {"plains": [], "forest": [], "settl": []}

    for r in completed:
        round_id = r["id"]
        round_num = r["round_number"]
        detail = client.get_round_detail(round_id)

        for seed in range(detail.seeds_count):
            try:
                analysis = client.get_analysis(round_id, seed)
            except Exception as e:
                print(f"  R{round_num} seed {seed}: skipped ({e})")
                continue

            gt = np.array(analysis.ground_truth)
            grid = detail.initial_states[seed].grid
            feats, coords = _extract_cell_features(grid, detail.initial_states[seed].settlements)
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

            # Also save GT for offline evaluation
            np.save(f"data/gt_r{round_num}_seed{seed}.npy", gt)

        print(f"  Round {round_num}: loaded {detail.seeds_count} seeds")

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
    print(f"\nSaved GBT models: {total} total training samples from {len(completed)} round(s)")


if __name__ == "__main__":
    main()
