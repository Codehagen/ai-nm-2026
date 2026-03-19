# Competition Strategy

**Duration**: 69 hours (March 19 18:00 — March 22 15:00 CET)
**Tasks**: 3 (CV, ML, NLP) — equal weight
**Key insight**: Reliability across all 3 > excellence in 1

## Time Budget

### Phase 1: Rapid Baseline (Hours 0-2)
- Read all 3 challenge descriptions
- Fill task-analysis docs
- Deploy dummy FastAPI endpoints
- Submit naive baselines (even random/constant)
- **Goal**: Non-zero score on ALL 3 tasks

### Phase 2: Strong Baselines (Hours 2-8)
- CV: Pretrained model (ResNet/EfficientNet), basic augmentation
- ML: AutoGluon/XGBoost with default params
- NLP: Pretrained transformer, basic fine-tuning
- Establish cross-validation for each task
- **Goal**: Competitive baselines on all 3

### Phase 3: Overnight Optimization (Night 1, ~Hours 8-20)
- Launch autoresearch agents on GCP VMs
- Set up program.md for each task
- Agent iterates: architecture, hyperparams, augmentation
- Monitor via `scripts/gcp/status.sh`

### Phase 4: Iteration (Hours 20-60)
- Review overnight results
- Manual architecture improvements
- Feature engineering (ML), augmentation (CV), prompt tuning (NLP)
- Ensemble construction

### Phase 5: Final Polish (Hours 60-69)
- Ensemble all models per task
- Threshold optimization
- Stress-test APIs (latency, memory)
- Final validation: `scripts/validate.sh`
- Submit final endpoints
- **DO NOT make risky changes in last 3 hours**

## Task Priority

Equal time allocation by default. Shift resources to the most improvable task after baselines are set.

## Sponsors

- NorgesGruppen — likely grocery/retail related CV or ML task
- Tripletex — accounting/ERP, likely NLP task (document understanding?)
- Google Cloud — compute sponsor (use GCP for all training)
