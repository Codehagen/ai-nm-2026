"""Computer Vision DTOs — update with actual task schema at kickoff."""

from pydantic import BaseModel


class PredictRequest(BaseModel):
    """Replace with actual CV task request schema.
    Common patterns: base64 image, image URL, image array.
    """
    image: str = ""  # base64-encoded image


class PredictResponse(BaseModel):
    """Replace with actual CV task response schema.
    Common patterns: class label, bounding boxes, segmentation mask.
    """
    prediction: str = ""
