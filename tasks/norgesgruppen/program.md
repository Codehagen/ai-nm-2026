# Autoresearch Program: NorgesGruppen Object Detection

Metric: Combined score = 0.7 * det_mAP@0.5 + 0.3 * cls_mAP@0.5
Direction: maximize
Timeout: 300 seconds inference on NVIDIA L4

## Current best

| Model | Size | Local Score | Live Score | Notes |
|-------|------|-------------|------------|-------|
| YOLOv8l + WBF (optimized) | 84 MB | 0.8831 | 0.8966 | 3-pass WBF, precision rounding |
| YOLOv8l + WBF | 84 MB | 0.8823 | 0.8966 | 3-pass WBF (960, 1280, 1280+TTA) |
| YOLOv8m (tweaked) | 299 MB | — | 0.6915 | Single-scale, tweaked conf/iou |
| YOLOv8m (initial) | 299 MB | — | 0.6894 | First submission |

## Architecture

- **Model**: YOLOv8l, trained at imgsz=1280, ultralytics 8.1.0
- **Inference**: Multi-scale WBF (Weighted Boxes Fusion)
  - Pass 1: 960 no TTA (fast, catches large products)
  - Pass 2: 1280 no TTA (training scale, clean signal)
  - Pass 3: 1280 + TTA (augmented)
  - WBF fusion with weights [1, 2, 3]
- **Key settings**: conf=0.01, iou=0.7 (per-pass NMS), WBF iou_thr=0.55, skip_box_thr=0.001
- **Precision**: bbox round(2), score round(6) — free +0.0008 from better IoU matching

## Known issues

- **PyTorch 2.6 + ultralytics 8.1.0**: torch.load defaults to weights_only=True, breaking ultralytics model loading. Fixed with monkey-patch in run.py.
- **model.half()**: Crashes in sandbox — ultralytics 8.1.0 YOLO wrapper doesn't support it. Don't use.
- **wandb**: Must set WANDB_DISABLED=true in env when running train.py as subprocess.

## Local testing

```bash
# Quick smoke test
python test_local.py --quick

# Eval on val split (inflated — model saw these during training)
python test_local.py

# Honest eval on held-out test split (best predictor of live score)
python test_local.py --data data/yolo-3way

# Test submission zip
python test_local.py --zip submission.zip
```

## Data splits

- `data/yolo/` — Original 80/20 split (199 train, 49 val). Use for FINAL training before submission.
- `data/yolo-3way/` — 70/15/15 split (174 train, 37 val, 37 test). Use for honest evaluation. Test split never seen during training.

## Ideas to explore (priority order)

1. ~~Model size: yolov8m → yolov8l~~ DONE — YOLOv8l is current best
2. **Longer training**: 150-200 epochs on full data (yolo/ split)
3. **YOLOv8x**: Larger model, check if fits in 420MB and 300s timeout
4. **RT-DETR-l**: Transformer-based, in ultralytics 8.1.0
5. **Augmentation tuning**: mosaic, mixup, copy_paste ratios
6. **Loss weights**: Higher cls loss (currently 0.5) to boost classification mAP
7. **Multi-model ensemble**: Pack 2 small models, WBF merge in run.py
8. **Product reference images**: Use the 327 product reference photos for few-shot category matching

## Constraints

- Max zip size: 420 MB uncompressed
- Max weight files: 3, max 420 MB total
- Inference timeout: 300 seconds on NVIDIA L4 (24 GB VRAM)
- Pin ultralytics==8.1.0 (sandbox version)
- No network in sandbox
- 3 submissions per day (reset at midnight UTC)
- Blocked imports: os, sys, subprocess, pickle, yaml, etc. Use pathlib + json.

## Files

| File | Purpose |
|------|---------|
| `run.py` | Submission inference script (multi-scale WBF) |
| `train.py` | Training script (autoresearch-compatible) |
| `convert_coco.py` | COCO → YOLO format (2-way split) |
| `convert_coco_3way.py` | COCO → YOLO format (3-way split with held-out test) |
| `eval_local.py` | Scoring: det_mAP + cls_mAP |
| `test_local.py` | Local sandbox simulator + scoring |
| `package.sh` | Build submission.zip |
| `autoresearch_fast.py` | Fast 5-min experiment loops |
| `results.tsv` | Experiment log |
