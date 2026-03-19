# Autoresearch Program — Astar Island

## Setup
- Requires `ASTAR_TOKEN` env var set
- Requires at least one completed round (for ground truth via `/analysis` endpoint)
- Run `python analyze.py` first to extract calibration from completed rounds

## Mutable File
`model.py` — the prediction engine. The agent edits this file.

## Read-Only
- `evaluate.py` — scores predictions against ground truth (prints `val_metric: <float>`)
- `client.py` — HTTP client (do not modify)
- `dtos.py` — constants and models (do not modify)
- `utils.py` — normalization, viewport strategy (do not modify)

## Run Command
```bash
python evaluate.py > run.log 2>&1
```

## What to Tune in model.py

### High Impact
- `EMPIRICAL_TRANSITIONS` — transition probability vectors per initial terrain code
- `fill_unobserved_dynamic()` — priors for cells not directly observed, especially:
  - Distance-based colonization rates for empty plains
  - Coastal vs inland settlement survival
  - Forest adjacency effects on settlement survival
  - Context-specific priors (combine coastal + forests + distance)

### Medium Impact
- `apply_cross_seed_transfer()` — `weight` parameter (currently 0.3)
- `ensemble_predictions()` weights in evaluate.py (currently 0.7/0.3)
- `PROB_FLOOR` in dtos.py (currently 0.01 — lower = sharper but riskier)

### Lower Impact
- `apply_calibration()` — `blend_weight` (currently 0.5)
- Adding more context features (settlement density, faction count, etc.)

## Scoring
Score = 100 × exp(-3 × entropy_weighted_KL_divergence)
- 100 = perfect match to ground truth
- 0 = terrible predictions
- Only dynamic cells (non-zero entropy) count
- NEVER let any probability be 0.0 (KL → infinity)

## Strategy Notes
- Each round has different hidden parameters but same mechanics
- Calibration from past rounds helps but hidden params change
- The empirical transitions are the strongest signal
- Focus on getting the settlement expansion radius right
- Forests near settlements get cleared — tune the distance threshold
