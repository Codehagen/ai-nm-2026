"""CV model loading and inference."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from dtos import PredictRequest, PredictResponse

# Load model at startup
# import torch
# import torchvision.transforms as T
# model = torch.load("models/model.pt", map_location="cpu")
# model.eval()


def predict(request: PredictRequest) -> PredictResponse:
    """Run CV inference. Replace with actual logic."""
    # image = shared.ml_utils.decode_image(request.image)
    # prediction = model(transform(image))
    return PredictResponse(prediction="placeholder")
