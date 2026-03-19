"""Training script — autoresearch-compatible.

Run directly: python train.py
Or via Docker: TASK_MODE=train docker compose up
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def train():
    """Main training loop. Replace with actual training logic."""
    print("Training started...")

    # TODO: Load data from data/train/
    # TODO: Define model architecture
    # TODO: Training loop with validation
    # TODO: Save best model to models/

    print("Training complete. Model saved to models/")


if __name__ == "__main__":
    train()
