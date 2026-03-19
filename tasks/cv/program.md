# Autoresearch Program: Computer Vision

Metric: [competition metric]
Direction: maximize
Timeout: 5 minutes per experiment

## Current approach
[description of current model]

## Ideas to explore
1. Architecture: EfficientNet, ResNet, U-Net, ViT
2. Augmentation: albumentations pipeline (flip, rotate, color jitter, cutout)
3. Training: cosine annealing, warmup, mixed precision
4. Ensemble: TTA (test-time augmentation), model averaging
5. Post-processing: threshold optimization, CRF (if segmentation)

## Constraints
- Must fit in 24GB VRAM (L4 GPU)
- Inference must complete within timeout
- No cloud API calls
