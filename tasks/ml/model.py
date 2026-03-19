"""ML model loading and inference."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from dtos import PredictRequest, PredictResponse

# Load model at startup
# import joblib
# model = joblib.load("models/model.pkl")


def predict(request: PredictRequest) -> PredictResponse:
    """Run ML inference. Replace with actual logic."""
    return PredictResponse(prediction=0.0)
