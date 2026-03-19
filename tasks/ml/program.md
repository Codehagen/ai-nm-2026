# Autoresearch Program: Machine Learning

Metric: [competition metric]
Direction: maximize
Timeout: 5 minutes per experiment

## Current approach
[description of current model]

## Ideas to explore
1. AutoGluon with different presets (best_quality, high_quality)
2. XGBoost/LightGBM hyperparameter tuning via Optuna
3. Feature engineering: interactions, polynomial, target encoding
4. Ensemble: stacking, weighted averaging
5. Cross-validation strategy: stratified k-fold

## Constraints
- Must fit in 16GB VRAM (T4 GPU) or CPU
- Inference must complete within timeout
- No cloud API calls
