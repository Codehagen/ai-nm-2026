"""NLP-specific utilities: text preprocessing, tokenization helpers."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import re


def clean_text(text: str) -> str:
    """Basic text cleaning."""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


def truncate_text(text: str, max_length: int = 512) -> str:
    """Truncate text to max token-approximate length."""
    words = text.split()
    if len(words) > max_length:
        words = words[:max_length]
    return " ".join(words)
