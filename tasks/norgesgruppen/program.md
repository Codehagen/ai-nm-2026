# Autoresearch Program: NorgesGruppen Object Detection

Metric: Combined score = 0.7 * det_mAP@0.5 + 0.3 * cls_mAP@0.5
Direction: maximize
Timeout: 300 seconds inference on NVIDIA L4

## Current best

| Model | Size | Local (pycocotools) | Live Score | Notes |
|-------|------|---------------------|------------|-------|
| YOLOv8l + WBF (latest) | 84 MB | 0.8669 | 0.9007 | 3-pass WBF, precision rounding |
| YOLOv8l + WBF | 84 MB | 0.8635 | 0.8966 | 3-pass WBF (960, 1280, 1280+TTA) |
| YOLOv8m (tweaked) | 299 MB | — | 0.6915 | Single-scale, tweaked conf/iou |
| YOLOv8m (initial) | 299 MB | — | 0.6894 | First submission |

**Note:** Local scores use pycocotools (per-category AP, matches competition). Live is consistently ~0.03-0.04 higher than local — likely due to different test set.

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

# Honest eval on held-out test split (pycocotools, matches competition)
python test_local.py --data data/yolo-3way

# Test submission zip
python test_local.py --zip submission.zip
```

## Data splits

- `data/yolo/` — Original 80/20 split (199 train, 49 val). Use for FINAL training before submission.
- `data/yolo-3way/` — 70/15/15 split (174 train, 37 val, 37 test). Use for honest evaluation. Test split never seen during training.

## Ideas to explore (priority order)

1. ~~Model size: yolov8m → yolov8l~~ DONE — YOLOv8l is current best
2. ~~Longer training~~ DONE — 150-200 epochs tested, diminishing returns
3. ~~Multi-model ensemble~~ TESTED — 3-model WBF scored lower than single best + too slow (228s)
4. ~~Inference param sweep~~ DONE — 35+ experiments, found optimal WBF/conf/precision params
5. **SWA (Stochastic Weight Averaging)** — IN PROGRESS, +0.005 cls_mAP, -0.003 det_mAP vs best
6. **Different optimizers/LR** — IN PROGRESS on VM (SGD, AdamW, cos_lr variants)
7. **Product reference images**: Use the 327 product reference photos for few-shot category matching
8. **RT-DETR-l**: Transformer-based, in ultralytics 8.1.0
9. **YOLOv8x**: Larger model, check if fits in 420MB and 300s timeout

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
| `eval_local.py` | Scoring: det_mAP + cls_mAP (old global AP — superseded by pycocotools) |
| `test_local.py` | Local sandbox simulator + pycocotools scoring (matches competition) |
| `swa.py` | Stochastic Weight Averaging — merge checkpoints |
| `autoresearch_inference.py` | Inference param sweep (WBF, conf, scales) |
| `sweep_final.py` | Final sweep (conf_type, NMW, precision) |
| `package.sh` | Build submission.zip |
| `results.tsv` | Experiment log |
| `results_inference.tsv` | Inference sweep results |
