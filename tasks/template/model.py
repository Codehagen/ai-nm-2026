"""Model loading and inference. Load model at module level, not per-request."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from dtos import PredictRequest, PredictResponse

# Load model at module level (runs once at startup)
# model = torch.load("models/model.pt")


def predict(request: PredictRequest) -> PredictResponse:
    """Run inference on a single request. Replace with actual logic."""
    return PredictResponse()
