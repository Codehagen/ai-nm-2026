"""NLP training script."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def train():
    print("NLP training started...")
    # TODO: Load text data from data/train/
    # TODO: Tokenize with transformers
    # TODO: Fine-tune pretrained model
    # TODO: Validate on data/val/
    # TODO: Save best model to models/
    print("Training complete.")


if __name__ == "__main__":
    train()
