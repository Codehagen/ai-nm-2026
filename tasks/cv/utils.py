"""CV-specific utilities: image loading, augmentation, preprocessing."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import base64
import io
import numpy as np
from PIL import Image


def decode_image_b64(b64_string: str) -> Image.Image:
    """Decode base64 string to PIL Image."""
    image_bytes = base64.b64decode(b64_string)
    return Image.open(io.BytesIO(image_bytes))


def encode_image_b64(image: Image.Image, fmt: str = "PNG") -> str:
    """Encode PIL Image to base64 string."""
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def image_to_numpy(image: Image.Image) -> np.ndarray:
    """Convert PIL Image to numpy array (H, W, C)."""
    return np.array(image)


def numpy_to_image(arr: np.ndarray) -> Image.Image:
    """Convert numpy array to PIL Image."""
    return Image.fromarray(arr.astype(np.uint8))
