"""Machine Learning DTOs — update with actual task schema at kickoff."""

from pydantic import BaseModel
from typing import Any


class PredictRequest(BaseModel):
    """Replace with actual ML task request schema.
    Common patterns: feature dict, tabular row, JSON payload.
    """
    features: dict[str, Any] = {}


class PredictResponse(BaseModel):
    """Replace with actual ML task response schema.
    Common patterns: class label, regression value, probability.
    """
    prediction: float = 0.0
