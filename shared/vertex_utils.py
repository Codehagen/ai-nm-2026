"""Vertex AI utilities for training scripts.

Reports metrics to Vertex AI Vizier during hyperparameter tuning.
Auto-detects whether running on Vertex AI or locally — no-op locally
so train.py works in both contexts without changes.

Usage in train.py:
    from shared.vertex_utils import report_metric

    # After each validation epoch:
    report_metric("val_metric", 0.85)

    # Also prints val_metric: 0.85 for autoresearch compatibility
"""

import os


def is_vertex_ai() -> bool:
    """Check if running on Vertex AI (via environment variables)."""
    return bool(
        os.environ.get("CLOUD_ML_JOB_ID")
        or os.environ.get("CLOUD_ML_TRIAL_ID")
        or os.environ.get("AIP_MODEL_DIR")
    )


def report_metric(metric_name: str, value: float) -> None:
    """Report a metric value to Vertex AI Vizier and stdout.

    On Vertex AI: reports via cloudml-hypertune for HPO trial tracking.
    Locally: prints val_metric line for autoresearch compatibility.

    Args:
        metric_name: Metric identifier (e.g. "val_metric", "val_loss")
        value: Metric value
    """
    # Always print for autoresearch protocol compatibility
    print(f"val_metric: {value}")

    if not is_vertex_ai():
        return

    try:
        import hypertune

        hpt = hypertune.HyperTune()
        hpt.report_hyperparameter_tuning_metric(
            hyperparameter_metric_tag=metric_name,
            metric_value=value,
        )
    except ImportError:
        # cloudml-hypertune not installed — skip silently
        pass
    except Exception as e:
        # Don't crash training if metric reporting fails
        print(f"WARNING: Failed to report metric to Vertex AI: {e}")
