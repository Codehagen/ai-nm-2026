"""ML training script."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def train():
    print("ML training started...")
    # TODO: Load tabular data from data/train/
    # TODO: Feature engineering
    # TODO: Train XGBoost/LightGBM/AutoGluon
    # TODO: Cross-validate
    # TODO: Save best model to models/
    print("Training complete.")


if __name__ == "__main__":
    train()
