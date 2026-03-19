"""Autoresearch: autonomous experiment loop for overnight optimization.

Based on Karpathy's autoresearch pattern. Reads program.md, runs experiments,
commits improvements, reverts failures.
"""

import json
import os
import subprocess
import time
from datetime import datetime
from pathlib import Path


def run_experiment(train_fn, metric_fn, timeout_minutes: float = 5.0) -> dict:
    """Run a single experiment with timeout.

    Args:
        train_fn: Callable that trains/modifies the model. Returns any result.
        metric_fn: Callable that evaluates the model. Returns a float score.
        timeout_minutes: Max time for the experiment.

    Returns:
        dict with keys: score, duration_s, success, error
    """
    start = time.time()
    try:
        train_fn()
        score = metric_fn()
        duration = time.time() - start

        if duration > timeout_minutes * 60:
            return {"score": score, "duration_s": duration, "success": False, "error": "timeout"}

        return {"score": score, "duration_s": duration, "success": True, "error": None}
    except Exception as e:
        return {"score": 0.0, "duration_s": time.time() - start, "success": False, "error": str(e)}


def git_commit(message: str):
    """Commit current changes."""
    subprocess.run(["git", "add", "-A"], check=True)
    subprocess.run(["git", "commit", "-m", message], check=True)


def git_revert():
    """Revert uncommitted changes."""
    subprocess.run(["git", "checkout", "."], check=True)
    subprocess.run(["git", "clean", "-fd"], check=True)


def log_experiment(log_path: str, entry: dict):
    """Append experiment result to log file."""
    log_file = Path(log_path)
    log_file.parent.mkdir(parents=True, exist_ok=True)

    logs = []
    if log_file.exists() and log_file.stat().st_size > 0:
        logs = json.loads(log_file.read_text())
    logs.append({**entry, "timestamp": datetime.now().isoformat()})
    log_file.write_text(json.dumps(logs, indent=2))


def experiment_loop(
    program_md_path: str,
    train_fn,
    metric_fn,
    iterations: int = 100,
    timeout_minutes: float = 5.0,
    log_path: str = "experiment_log.json",
):
    """Main autoresearch loop.

    Reads program.md for context, runs experiments, commits improvements.
    Designed for overnight autonomous runs.
    """
    best_score = metric_fn()
    print(f"Starting autoresearch. Baseline score: {best_score:.4f}")

    for i in range(iterations):
        print(f"\n--- Experiment {i+1}/{iterations} ---")

        result = run_experiment(train_fn, metric_fn, timeout_minutes)
        result["iteration"] = i + 1
        log_experiment(log_path, result)

        if result["success"] and result["score"] > best_score:
            improvement = result["score"] - best_score
            best_score = result["score"]
            git_commit(f"autoresearch: score {best_score:.4f} (+{improvement:.4f})")
            print(f"IMPROVED: {best_score:.4f} (+{improvement:.4f})")
        else:
            git_revert()
            if result["error"]:
                print(f"FAILED: {result['error']}")
            else:
                print(f"NO IMPROVEMENT: {result['score']:.4f} <= {best_score:.4f}")

    print(f"\nAutoresearch complete. Best score: {best_score:.4f}")
    return best_score
