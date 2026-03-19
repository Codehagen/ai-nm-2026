# Autoresearch Program: NLP

Metric: [competition metric]
Direction: maximize
Timeout: 5 minutes per experiment

## Current approach
[description of current model]

## Ideas to explore
1. Models: BERT-base, NorBERT, mBERT, XLM-R, Llama-3 (small)
2. Fine-tuning: LoRA, full fine-tune, adapter layers
3. Data: augmentation via back-translation, synonym replacement
4. Ensemble: model averaging, majority vote
5. Post-processing: calibration, threshold tuning

## Constraints
- Must fit in 24GB VRAM (L4 GPU)
- Inference must complete within timeout
- No cloud API calls
