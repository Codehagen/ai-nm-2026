"""Local sandbox simulator — test run.py exactly as the competition does.

Simulates: python run.py --input <images> --output <predictions.json>
Then scores with eval_local.py formula: 0.7 * det_mAP + 0.3 * cls_mAP

Usage:
    # Quick test on sample image (smoke test)
    python test_local.py --quick

    # Full eval on val set (matches competition scoring)
    python test_local.py

    # Test a specific model
    python test_local.py --model models/best.pt

    # Test the submission zip directly
    python test_local.py --zip submission.zip

Prints val_metric for autoresearch compatibility.
"""

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

import torch

# Patch torch.load for ultralytics 8.1.0 compat
_orig = torch.load
torch.load = lambda *a, **kw: _orig(*a, **{**kw, "weights_only": False})

TASK_DIR = Path(__file__).parent.resolve()
VAL_IMAGES = TASK_DIR / "data" / "yolo" / "images" / "val"
SAMPLE_IMAGES = TASK_DIR / "sample-img"
GT_FILE = TASK_DIR / "data" / "train" / "annotations.json"
MODELS_DIR = TASK_DIR / "models"


def run_inference(run_py, model_pt, input_dir, output_json):
    """Execute run.py as subprocess, exactly like the sandbox."""
    # Create a temp dir with run.py + model
    tmp = Path("/tmp/_sandbox_sim")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()

    shutil.copy2(run_py, tmp / "run.py")
    shutil.copy2(model_pt, tmp / "best.pt")

    output_json.parent.mkdir(parents=True, exist_ok=True)

    import os
    env = os.environ.copy()
    env["WANDB_DISABLED"] = "true"
    env["WANDB_MODE"] = "disabled"

    start = time.time()
    result = subprocess.run(
        ["python", str(tmp / "run.py"),
         "--input", str(input_dir),
         "--output", str(output_json)],
        capture_output=True, text=True, timeout=300, env=env,
    )
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"ERROR: run.py exited with code {result.returncode}")
        print(result.stderr[-500:] if result.stderr else result.stdout[-500:])
        return None, elapsed

    print(result.stdout.strip())
    return output_json, elapsed


def evaluate(predictions_path, gt_path, val_image_dir):
    """Score predictions using eval_local.py logic."""
    import numpy as np

    with open(predictions_path) as f:
        predictions = json.load(f)
    with open(gt_path) as f:
        coco = json.load(f)

    # Filter GT to val images only
    val_ids = set()
    for p in Path(val_image_dir).iterdir():
        if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
            val_ids.add(int(p.stem.split("_")[-1]))

    gt_list = [
        {"image_id": a["image_id"], "category_id": a["category_id"], "bbox": a["bbox"]}
        for a in coco["annotations"] if a["image_id"] in val_ids
    ]

    # Import eval functions
    import sys
    sys.path.insert(0, str(TASK_DIR))
    from eval_local import evaluate_map

    det_map = evaluate_map(predictions, gt_list, iou_threshold=0.5, use_category=False)
    cls_map = evaluate_map(predictions, gt_list, iou_threshold=0.5, use_category=True)
    combined = 0.7 * det_map + 0.3 * cls_map

    return det_map, cls_map, combined, len(predictions), len(gt_list)


def test_from_zip(zip_path, input_dir, output_json):
    """Extract zip and run."""
    import zipfile
    tmp = Path("/tmp/_sandbox_sim")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()

    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp)

    output_json.parent.mkdir(parents=True, exist_ok=True)

    import os
    env = os.environ.copy()
    env["WANDB_DISABLED"] = "true"
    env["WANDB_MODE"] = "disabled"

    start = time.time()
    result = subprocess.run(
        ["python", str(tmp / "run.py"),
         "--input", str(input_dir),
         "--output", str(output_json)],
        capture_output=True, text=True, timeout=300, env=env,
    )
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"ERROR: run.py exited with code {result.returncode}")
        print(result.stderr[-500:] if result.stderr else result.stdout[-500:])
        return None, elapsed

    print(result.stdout.strip())
    return output_json, elapsed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="Smoke test on sample image only")
    parser.add_argument("--model", default=None, help="Path to .pt model (default: models/best.pt)")
    parser.add_argument("--zip", default=None, help="Test a submission zip directly")
    parser.add_argument("--data", default=None,
                        help="YOLO data dir with test/ split (e.g. data/yolo-3way). "
                             "Uses held-out test images for honest scoring.")
    args = parser.parse_args()

    output_json = Path("/tmp/_sandbox_sim_output/predictions.json")

    if args.quick:
        # Copy sample images to temp dir with proper naming (img_XXXXX.ext)
        tmp_input = Path("/tmp/_sandbox_sim_input")
        if tmp_input.exists():
            shutil.rmtree(tmp_input)
        tmp_input.mkdir()
        idx = 1
        for img in sorted(SAMPLE_IMAGES.iterdir()):
            if img.suffix.lower() in (".jpg", ".jpeg", ".png"):
                dst = tmp_input / f"img_{idx:05d}{img.suffix.lower()}"
                shutil.copy2(img, dst)
                idx += 1
        input_dir = tmp_input
        print(f"Quick smoke test on {idx-1} sample image(s)")
    elif args.data:
        # Use held-out test split from 3-way data
        data_dir = TASK_DIR / args.data
        input_dir = data_dir / "images" / "test"
        if not input_dir.exists():
            print(f"ERROR: No test split at {input_dir}")
            print("Run: python convert_coco_3way.py first")
            return
        print(f"Held-out test eval on {input_dir} ({len(list(input_dir.iterdir()))} images)")
    else:
        input_dir = VAL_IMAGES
        print(f"Full eval on {input_dir} ({len(list(input_dir.iterdir()))} images)")

    # Run inference
    if args.zip:
        print(f"Testing zip: {args.zip}")
        pred_path, elapsed = test_from_zip(args.zip, input_dir, output_json)
    else:
        model_pt = Path(args.model) if args.model else MODELS_DIR / "best.pt"
        run_py = TASK_DIR / "run.py"
        print(f"Model: {model_pt} ({model_pt.stat().st_size/1e6:.1f}MB)")
        pred_path, elapsed = run_inference(run_py, model_pt, input_dir, output_json)

    if pred_path is None:
        print("FAILED — run.py crashed")
        return

    print(f"Inference time: {elapsed:.1f}s")

    # Load and check predictions
    with open(pred_path) as f:
        preds = json.load(f)
    print(f"Predictions: {len(preds)}")

    if args.quick:
        # Just show predictions, no scoring (no GT for sample images)
        print(f"\nSmoke test PASSED — {len(preds)} detections in {elapsed:.1f}s")
        if preds:
            cats = set(p["category_id"] for p in preds)
            scores = [p["score"] for p in preds]
            print(f"Categories: {len(cats)} unique")
            print(f"Scores: min={min(scores):.4f} max={max(scores):.4f} mean={sum(scores)/len(scores):.4f}")
        print(f"\nval_metric: -1")  # no GT available
        return

    # Full eval
    if not GT_FILE.exists():
        print(f"WARNING: No GT file at {GT_FILE} — cannot score")
        return

    det_map, cls_map, combined, n_pred, n_gt = evaluate(pred_path, GT_FILE, input_dir)

    print(f"\n{'='*50}")
    print(f"Detection mAP@0.5:       {det_map:.4f} (weight: 70%)")
    print(f"Classification mAP@0.5:  {cls_map:.4f} (weight: 30%)")
    print(f"{'='*50}")
    print(f"Combined score:          {combined:.4f}")
    print(f"{'='*50}")
    print(f"Predictions: {n_pred}, GT: {n_gt}")
    print(f"Time: {elapsed:.1f}s (limit: 300s)")
    print(f"\nval_metric: {combined}")


if __name__ == "__main__":
    main()
