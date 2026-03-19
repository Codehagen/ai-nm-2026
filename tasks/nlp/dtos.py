"""NLP DTOs — update with actual task schema at kickoff."""

from pydantic import BaseModel


class PredictRequest(BaseModel):
    """Replace with actual NLP task request schema.
    Common patterns: text input, question+context, document.
    """
    text: str = ""


class PredictResponse(BaseModel):
    """Replace with actual NLP task response schema.
    Common patterns: label, generated text, extracted entities.
    """
    prediction: str = ""
