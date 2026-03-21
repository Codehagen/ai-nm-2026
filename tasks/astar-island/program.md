# Autoresearch Program — Astar Island

## Task Selection

This task optimizes a probabilistic prediction model for a Norse civilization simulator.
Each eval takes ~175 seconds (9-fold LORO with XGBoost retraining). No GPU required.

## Setup

1. **Branch**: `git checkout -b autoresearch/<tag>` from main
2. **Read**: `train.py` (eval harness + tunable params), `model.py` (production pipeline, READ ONLY)
3. **Baseline**: `cd tasks/astar-island && python train.py > run.log 2>&1`
4. **Init results.tsv**: header + baseline entry

## In-scope files

- `train.py` — **MUTABLE**. The ONLY file you edit. Contains tunable parameters at the top and the LORO evaluation loop. Prints `val_metric:` (weighted avg, higher is better, max 100).
- `model.py` — **READ ONLY**. Production prediction engine. Read to understand the pipeline, but do NOT edit.
- `dtos.py` — **READ ONLY**. Terrain constants (PROB_FLOOR, TERRAIN_TO_CLASS, etc.)
- `data/` — **READ ONLY**. Ground truth, models, observations.

## Current model architecture (in train.py)

The LORO evaluation builds predictions in layers for each held-out round:

1. **Layer 1 (Static)**: Distance-based coastal/inland priors from GT tables (calibrated R1-R10, 45 maps)
2. **Layer 3 (Context)**: adj_forests, coastal, settlement adjacency priors for all dynamic cells
3. **Layer 6 (GBT Blend)**: Terrain-specific XGBoost (37 features: 30 cell + 7 obs stats)
   - Per-terrain blend weights: plains=0.55, forest=0.65, settl=0.75
4. **Layer 6.7 (Cross-seed Empirical)**: Pool observations across all seeds, group by (terrain, distance, coastal), blend at EMP_BLEND=0.40
5. **Layer 7 (L7 Correction)**: Observation ratio correction — adjusts predictions to match observed terrain frequencies
   - Strengths: [1.60, 1.20, 0.0, 0.0, 1.70, 0.0] (zero for port/ruin)
   - Per-class clamp: empty [0.75-1.30], settl [0.35-1.35], forest [0.75-1.30]
6. **Layer 8 (Per-cell Empirical)**: Blend model with per-cell observation frequencies (MIN_SAMPLES=50, effectively disabled)

## Tunable parameters in train.py

Located in the `TUNABLE PARAMETERS` section at the top of train.py:

```python
BLEND_WEIGHT = 0.35                    # Global GBT blend (overridden by per-terrain)
BLEND_TERRAIN = {"plains": 0.55, "forest": 0.65, "settl": 0.75}
L7_STRENGTHS = np.array([1.60, 1.20, 0.0, 0.0, 1.70, 0.0])
L7_MIN_OBS = np.array([200, 50, 30, 20, 100, 0])
L7_ADJ_MIN = 0.80
L7_ADJ_MAX = 1.25
XGB_HPARAMS = {per-terrain dicts with n_estimators, max_depth, learning_rate, etc.}
```

Also tunable within evaluate_loro():
- `EMP_BLEND = 0.40` — weight for cross-seed empirical tables
- L7 per-class clamp bounds (adj_min, adj_max arrays)

## What to try

### Likely gains (+0.05 to +0.30)
- Fine-tune EMP_BLEND (try 0.38, 0.42, 0.35, 0.45)
- Fine-tune per-terrain blend weights (try +-0.05 on each)
- L7 strength tuning (try stronger empty/forest correction)
- XGB regularization (reg_alpha, reg_lambda, min_child_weight)
- L7 per-class clamp bounds (wider for settlement on extinction rounds)

### Possible gains (+0.00 to +0.10)
- XGB learning rate (0.05, 0.10)
- n_estimators (400, 500 — slower but potentially better)
- Per-terrain XGB hyperparameters (different depth/lr per terrain)
- L7 MIN_OBS thresholds

### What NOT to do (proven failures)
- KNN round matching (-9.80)
- Probability sharpening (-0.28)
- LightGBM (-0.33)
- Spatial L7 BFS (-0.39)
- Viability scoring (-0.15 to -0.66)
- Cross-seed transfer in Layer 4 (-0.50)
- Re-enable Layer 2 Bayesian observations (adds noise)
- Increase PROB_FLOOR (hurts badly)

## Run command

```bash
cd tasks/astar-island && python train.py > run.log 2>&1
grep "^val_metric:" run.log
```

Time budget: ~175 seconds per eval (9-fold LORO with XGBoost retraining per fold).

## The experiment loop

LOOP FOREVER:

1. Look at git state and results.tsv for context
2. Edit `train.py` tunable parameters section
3. `git add tasks/astar-island/train.py && git commit -m "experiment: <description>"`
4. `cd tasks/astar-island && python train.py > run.log 2>&1`
5. `grep "^val_metric:" run.log`
6. If empty/crash: `tail -n 50 run.log` to debug
7. Log to results.tsv: `commit\tval_metric\tmemory_gb\tdiff_lines\tstatus\tdescription\treject_reason`
8. If improved: `git add tasks/astar-island/results.tsv && git commit --amend --no-edit`
9. If worse: record hash+result in results.tsv, then `git reset --hard <previous kept commit>`

## Scoring

score = 100 * exp(-3 * entropy_weighted_KL_divergence)
- 100 = perfect, 0 = terrible
- Only dynamic cells (non-zero entropy in ground truth) count, weighted by entropy
- NEVER let any probability be 0.0 (KL divergence -> infinity)
- Entropy weighting means high-uncertainty cells matter most

## Current best: WAVG=87.36

Progression: 80.07 (baseline) -> 89.01 (coastal split) -> 93.88 (GBT) -> 86.91 (9-round LORO) -> 87.36 (10-round LORO)

Per-round scores (LORO): R1=86.48 R2=89.15 R4=93.44 R5=84.93 R6=85.47 R7=70.70 R8=94.03 R9=91.85 R10=89.71
