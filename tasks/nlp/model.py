"""NLP model loading and inference."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from dtos import PredictRequest, PredictResponse

# Load model at startup
# from transformers import AutoModelForSequenceClassification, AutoTokenizer
# tokenizer = AutoTokenizer.from_pretrained("models/tokenizer")
# model = AutoModelForSequenceClassification.from_pretrained("models/model")
# model.eval()


def predict(request: PredictRequest) -> PredictResponse:
    """Run NLP inference. Replace with actual logic."""
    return PredictResponse(prediction="placeholder")
