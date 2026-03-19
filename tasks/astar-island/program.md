# Autoresearch Program — Astar Island

## Task Selection

This task optimizes a probabilistic prediction model for a Norse civilization simulator.
Each eval takes <2 seconds (pure numpy). No GPU required.

## Setup

1. **Requires**: `ASTAR_TOKEN` env var set + Round 1 ground truth available via API
2. **Branch**: `git checkout -b autoresearch/<tag>` from main
3. **Read**: `task.md` (metric), `prepare.py` (fixed eval), `model.py` (mutable)
4. **Baseline**: `cd tasks/astar-island && python prepare.py > run.log 2>&1`
5. **Init results.tsv**: header + baseline entry

## In-scope files

- `prepare.py` — **READ ONLY**. Evaluation harness. Loads Round 1 observations, builds predictions with current model.py, scores against ground truth. Prints `val_metric:`.
- `model.py` — **MUTABLE**. The only file you edit. Prediction engine with coastal/inland distance tables, calibration blending, and context-specific priors.
- `data/calibration.json` — **MUTABLE**. Calibration priors and blend_weight. Can tune blend_weight here.
- `task.md` — metric metadata (higher is better).
- `dtos.py` — **READ ONLY**. Terrain constants (PROB_FLOOR, TERRAIN_TO_CLASS, etc.)

## Current model architecture

The model builds predictions in layers:

1. **Layer 1 (Static)**: Distance-based priors using coastal/inland split tables
   - `PLAINS_COASTAL_BY_DISTANCE` / `PLAINS_INLAND_BY_DISTANCE` — P(class) by distance to nearest settlement
   - `FOREST_COASTAL_BY_DISTANCE` / `FOREST_INLAND_BY_DISTANCE` — same for forests
   - `EMPIRICAL_TRANSITIONS` — global priors for settlements, ports, mountains, ocean
   - Key insight: inland cells NEVER become ports; only coastal cells can

2. **Layer 2 (Observations)**: Currently DISABLED — noisy Bayesian frequency update from viewport queries hurts score. The GT-calibrated static tables outperform raw observation frequencies with only ~10 queries per seed.

3. **Layer 3 (Unobserved fill)**: Context-specific priors for unobserved cells using same distance+coastal tables as Layer 1, plus settlement adj_forests heuristic.

4. **Layer 4 (Cross-seed)**: DISABLED — hurts by ~0.5 pts.

5. **Layer 5 (Calibration)**: Blends calibration.json context_priors at blend_weight=0.2. Keyed by terrain_code + coastal + adj_forests.

## What to tune in model.py

### High Impact (remaining ~11 pts of error)
- Plains transitions account for **61.5%** of remaining error. The distance+coastal tables are good but per-cell variation exists based on local settlement configuration.
- Forest transitions account for **33.2%** of error. Forests near dense settlement clusters get colonized more than our tables predict.
- Settlement-specific features: using observed settlement stats (population, food, defense, faction/owner_id) to create per-cell adjustments.
- Per-seed global scaling: if observations suggest a high-expansion seed, scale P(settlement) up globally.

### Medium Impact
- Calibration blend_weight (currently 0.2 in data/calibration.json). Already tuned — 0.2 is sweet spot.
- Re-enabling observations selectively (e.g., only use observation data for settlement cells where we get stats, not raw terrain frequencies).
- Faction-based spatial reasoning (settlements of same owner cluster together).

### Lower Impact
- `PROB_FLOOR` in dtos.py (currently 0.0001). Already near optimal.
- Re-enabling cross-seed transfer with different logic.
- Ensemble strategies.

### What NOT to do
- Don't increase PROB_FLOOR — it hurts score.
- Don't blindly re-enable the Bayesian observation layer — it adds noise.
- Don't modify prepare.py, dtos.py, or client.py.

## Run command

```bash
cd tasks/astar-island && python prepare.py > run.log 2>&1
grep "^val_metric:" run.log
```

Time budget: ~2 seconds per eval. You can run hundreds of experiments quickly.

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
- Only dynamic cells (non-zero entropy in ground truth) count, weighted by entropy
- NEVER let any probability be 0.0 (KL divergence → infinity)
- Entropy weighting means high-uncertainty cells matter most

## Error analysis (from Round 1 GT)

Where the remaining error lives (all 5 seeds pooled):
- Plains: 61.5% of error — the biggest target
- Forest: 33.2% of error
- Settlement: 5.2% — already well-modeled
- Port: 0.1% — solved

Worst cells tend to be observed cells where local conditions cause GT to deviate significantly from population averages. Example: a coastal plain next to a very strong settlement may have P(settlement)=0.59 while our table says 0.15.

## Current best: 89.34

Progression: 8.2 (R1 submission) → 80.07 (baseline) → 80.62 (tuned floor) → 89.01 (coastal/inland split) → 89.34 (disable obs + reduce cal blend)
