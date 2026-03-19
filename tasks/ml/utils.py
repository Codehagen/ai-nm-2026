"""ML-specific utilities: tabular data processing, feature engineering."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pandas as pd
import numpy as np


def load_csv(path: str) -> pd.DataFrame:
    """Load CSV data with basic preprocessing."""
    df = pd.read_csv(path)
    return df


def describe_dataset(df: pd.DataFrame) -> dict:
    """Quick dataset summary for analysis."""
    return {
        "shape": df.shape,
        "dtypes": df.dtypes.value_counts().to_dict(),
        "missing": df.isnull().sum().to_dict(),
        "numeric_cols": df.select_dtypes(include=[np.number]).columns.tolist(),
        "categorical_cols": df.select_dtypes(include=["object", "category"]).columns.tolist(),
    }
