# Autoresearch Program — Astar Island

## Task Selection

This task optimizes a probabilistic prediction model for a Norse civilization simulator.
Each eval takes <2 seconds (pure numpy). No GPU required.

## Setup

1. **Requires**: `ASTAR_TOKEN` env var set + at least one completed round (Round 1 ground truth)
2. **Branch**: `git checkout -b autoresearch/<tag>` from main
3. **Read**: `task.md` (metric), `prepare.py` (fixed eval), `model.py` (mutable)
4. **Baseline**: `cd tasks/astar-island && python prepare.py > run.log 2>&1`
5. **Init results.tsv**: header + baseline entry

## In-scope files

- `prepare.py` — **READ ONLY**. Evaluation harness. Loads Round 1 observations, builds predictions with current model.py, scores against ground truth. Prints `val_metric:`.
- `model.py` — **MUTABLE**. The file you edit. Prediction engine with empirical transitions, distance-based priors, Bayesian blending, and calibration.
- `task.md` — metric metadata.

## What to tune in model.py

### High Impact
- `EMPIRICAL_TRANSITIONS` — global transition probability vectors per initial terrain code
- `PLAINS_BY_DISTANCE` — distance-based colonization priors for plains cells (10 buckets)
- `N_PRIOR` — Bayesian blending strength (currently 20). Controls how much single observations override the prior.
- `fill_unobserved_dynamic()` — context-specific priors for settlement/port/ruin/forest cells

### Medium Impact
- `PROB_FLOOR` in dtos.py — probability floor (currently 0.001). Lower = sharper but riskier.
- `apply_calibration()` blend_weight (currently 0.5)
- Adding more context features to `fill_unobserved_dynamic` (settlement density, faction adjacency)

### Lower Impact
- Re-enabling `apply_cross_seed_transfer()` with different weight (currently disabled — hurts by ~0.5 pts)
- Ensemble strategies

## Run command

```bash
cd tasks/astar-island && python prepare.py > run.log 2>&1
grep "^val_metric:" run.log
```

## The experiment loop

LOOP FOREVER:

1. Look at git state and results.tsv for context
2. Edit `model.py` with an experimental idea
3. `git add tasks/astar-island/model.py && git commit -m "experiment: <description>"`
4. `cd tasks/astar-island && python prepare.py > run.log 2>&1`
5. `grep "^val_metric:" tasks/astar-island/run.log`
6. If empty/crash: `tail -n 50 tasks/astar-island/run.log` to debug
7. Log to results.tsv
8. If improved: `git add tasks/astar-island/results.tsv && git commit --amend --no-edit`
9. If worse: record hash, then `git reset --hard <previous kept commit>`

## Scoring

score = 100 × exp(-3 × entropy_weighted_KL_divergence)
- 100 = perfect, 0 = terrible
- Only dynamic cells (non-zero entropy) count
- NEVER let any probability be 0.0

## Current best: 80.07

Progression: 8.2 (Round 1 submission) → 77.3 (Bayesian fix) → 80.1 (tuned priors + floor)
