# Autoresearch Program: NorgesGruppen Object Detection

Metric: mAP@0.5 (val set)
Direction: maximize
Timeout: 30 minutes per experiment

## Current approach
YOLOv8m fine-tuned on 248 COCO shelf images, 356 categories, imgsz=1280

## Ideas to explore (in priority order)
1. **Model size**: yolov8n → yolov8s → yolov8m → yolov8l → yolov8x
2. **Image resolution**: 640, 960, 1280 (higher = better for small products)
3. **Augmentation**: mosaic strength, mixup ratio, copy_paste ratio
4. **Training**: epochs (50-200), patience, learning rate
5. **Architecture**: RT-DETR-l (transformer-based, in ultralytics 8.1.0)
6. **Ensemble**: submit best 2-3 models, ensemble in run.py with NMS merge

## Constraints
- Model weights must fit in 420 MB (uncompressed zip)
- Inference must complete in 300 seconds on NVIDIA L4 (24 GB VRAM)
- Pin ultralytics==8.1.0 (sandbox version)
- No cloud API calls, no network in sandbox
- 3 submissions per day

## Sweep plan
1. Fix imgsz=1280, sweep model size (n/s/m/l/x) — find best size
2. Fix best model size, sweep imgsz (640/960/1280) — confirm resolution
3. Fix model+resolution, sweep augmentation params
4. Final: train best config on full dataset (no val split), submit

## Key metrics to track
- val_metric (mAP@0.5)
- Model size (MB)
- Inference time per image (seconds)
- Peak VRAM usage (GB)
