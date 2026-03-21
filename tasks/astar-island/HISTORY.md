# Astar Island — Full History & Architecture

Complete record of our model evolution, autoresearch process, and round-by-round results.

## Architecture Overview

We predict the final state of a Norse civilisation simulator as a 40x40x6 probability tensor.
The model is a multi-layer pipeline where each layer refines the previous prediction:

```
Initial Grid (known)
    │
    ▼
Layer 1: Static Heuristic ─── distance-based probability tables
    │                         4 variants: plains/forest × inland/coastal
    │                         calibrated from R1-R13 ground truth
    ▼
Layer 3: Context Priors ───── settlement adjacency, coastal port priors
    │                         applied to ALL cells (fills unobserved)
    ▼
Layer 6: XGBoost Blend ────── terrain-specific models (plains/forest/settl)
    │                         76 features: 30 cell + 23 obs stats + 23 cell obs
    │                         blend: plains=90%, forest=75%, settl=80%
    ▼
Layer 6.7: Empirical Tables ─ cross-seed (terrain, distance, coastal) → prob
    │                         pools all 50 observations across seeds
    │                         50% blend weight
    ▼
Layer 7: Safe L7 ──────────── observation ratio correction
    │                         rare-class protection (port/ruin zeroed)
    │                         safety clamp [0.75-1.35]
    ▼
Layer 8: Per-cell Empirical ─ direct cell observation counts
    │                         requires 50+ samples (rarely triggered)
    ▼
Normalize + Submit
```

Disabled layers: Layer 2 (observation-based), Layer 4, Layer 5, Simulator.

## Feature Engineering (76 features)

### Cell Features (30) — from initial grid only
- Terrain code, manhattan distance to nearest/2nd settlement
- Adjacent terrain counts (ocean, forest, settlement, mountain)
- One-hot terrain type (plains, forest, settlement, port)
- Coastal flag (2+ adjacent ocean)
- Nearby settlement counts (r1-2, r3, r4, r5-7)
- Total settlement count, distance to nearest port
- Connected component size and settlement count
- Distance to edge, BFS distance over passable terrain
- Passable cells in 5x5, land ratio in 7x7
- Interaction: land_ratio / (1 + bfs_dist)

### Observation Stats (23) — round-level aggregates from 50 queries
- Base 7: avg pop/food/wealth/defense, alive_rate, factions/query, port_rate
- Extended 16: min/max/std of food/pop/defense, faction norm, grid settl/ruin rates,
  food deficit, dead rate, wealth mean/std

### Per-Cell Observation Features (23) — from viewport grids
- Settlement/empty/ruin observation rates per cell
- Observation frequency (how often cell was observed)
- Neighbor settlement density (r1, r2, sum and count)
- Nearest observed settlement stats (pop, food, wealth, defense, distance)
- Spatial aggregates (sum_settl_r2, sum_ruin_r2, dynamic_rate)
- Log-normalized counts (settl, ruin, total, dynamic)
- Neighbor log aggregates (sum_log_settl_r2, sum_log_ruin_r2)

## Autoresearch Process

### How It Works

Two autonomous Claude Code agents edit `train.py` and run backtests in a loop:

```
1. ANALYZE    — run analyze_observations.py to find correlations with GT
2. HYPOTHESIZE — pick a feature or hyperparameter to test
3. IMPLEMENT  — edit train.py (the mutable file)
4. BACKTEST   — python train.py → 9-12 fold LORO cross-validation (~6 min)
               prints val_metric: XX.XXXX (weighted avg score)
5. DECIDE     — if WAVG improved → git commit with delta, new baseline
               if worse → git revert, try next hypothesis
6. REPEAT     — go to step 2
```

### Feature Agent Results (overnight 2026-03-20/21)

Started at WAVG=87.36, ended at WAVG=88.53 (+1.17).

#### Phase 1: Round-Level Obs Stats (7 → 23 features, +0.52)

| Experiment | Features Added | WAVG | Delta |
|-----------|---------------|------|-------|
| Baseline | 7 obs stats | 87.36 | — |
| +min_food, max_pop, food_std | 10 | 87.67 | +0.31 |
| +min_defense, defense_std, n_factions | 13 | 87.72 | +0.05 |
| +obs_settl_rate, obs_ruin_rate | 15 | 87.73 | +0.01 |
| +food_deficit | 16 | 87.75 | +0.02 |
| +dead_rate, wealth_std, max_food | 19 | 87.78 | +0.03 |
| +pop_std, min_pop, max_defense, wealth_mean | 23 | 87.88 | +0.10 |

Key insight: `min_food` was the single most valuable stat — signals winter severity.

#### Phase 2: Per-Cell Obs Features (0 → 21 features, +0.33)

Each feature added one at a time, tested, kept only if LORO improved:

| Feature | Why it works |
|---------|-------------|
| obs_settl_rate | Direct Monte Carlo estimate (r=0.41 with GT!) |
| obs_empty_rate, obs_ruin_rate | Inverse/collapse signals |
| obs_freq | Coverage signal |
| neighbor_settl_rate_r2 | Spatial expansion pressure |
| neighbor_settl_count_r2 | Expansion cluster detection |
| max_neighbor_settl_rate_r1 | Immediate expansion source |
| nearest_obs_settl_pop/food/dist | Strength of expansion source |
| sum_settl_r2, sum_ruin_r2 | Aggregated expansion/collapse |
| log counts + spatial log aggregates | Magnitude-aware versions |
| nearest_obs_settl_wealth/defense | Trade and raid indicators |

#### Phase 3: Hyperparameter Co-optimization (+0.32)

With more features, optimal parameters shifted:

| Parameter | Before | After | Why |
|-----------|--------|-------|-----|
| plains blend | 0.55 | 0.90 | More features = trust XGBoost more |
| forest blend | 0.65 | 0.75 | Slight increase |
| settl blend | 0.75 | 0.80 | Slight increase |
| n_estimators | 300 | 600 | More features need more trees |
| colsample_bytree | 0.90 | 0.55 | More subsampling for 76 features |

### Parameter Agent Results

Ran in parallel with feature agent, tuning:
- EMP_BLEND: 0.20 → 0.50 (+0.15)
- L7 strengths: tightened rare-class protection
- XGB reg_alpha, reg_lambda, subsample: minor gains

### Key Learnings

1. **Feature engineering > parameter tuning.** Features gave +0.85, parameters gave +0.32.
2. **Per-cell obs features are the biggest lever.** obs_settl_rate (r=0.41) is basically what the competition measures.
3. **Correlation analysis guides feature selection.** `analyze_observations.py` identifies promising features before spending compute.
4. **Blend weights must co-evolve with features.** Adding features made XGBoost stronger, so optimal blend jumped.
5. **colsample_bytree scales inversely with feature count.** 76 features → 0.55 colsample beats 0.90.

## Round History

### Score Progression

| Round | Date | Live Score | Rank | LORO Score | Weighted | Notes |
|-------|------|-----------|------|-----------|----------|-------|
| R1 | 2026-03-10 | 8.17 | 89 | 86.00 | 86.00 | First attempt, learning |
| R2 | 2026-03-11 | 81.37 | 23 | 92.03 | 96.63 | Basic heuristic working |
| R3 | — | — | — | — | — | Skipped (different dynamics) |
| R4 | 2026-03-12 | 91.80 | 5 | 94.20 | 109.04 | Strong result |
| R5 | 2026-03-13 | 80.36 | 18 | 86.65 | 105.32 | |
| R6 | 2026-03-14 | 84.91 | 8 | 86.53 | 110.44 | |
| R7 | 2026-03-15 | 63.19 | 57 | 71.80 | 96.21 | L7 crushed rare classes |
| R8 | 2026-03-16 | 76.12 | 75 | 93.94 | 132.18 | Cross-seed tables deployed |
| R9 | 2026-03-17 | 91.77 | 17 | 93.09 | 137.54 | |
| R10 | 2026-03-18 | 75.72 | 87 | 91.69 | 142.24 | Extinction round |
| R11 | 2026-03-19 | 85.09 | 35 | 86.12 | 140.28 | |
| R12 | 2026-03-20 | — | — | 32.27* | — | Skipped (no observations) |
| R13 | 2026-03-20 | **93.94** | **1** | 93.35 | **167.64** | Autoresearch model, top score |
| R14 | 2026-03-21 | pending | — | — | — | Retrained on R1-R13 |

*R12: no observations available, can't retroactively query simulator

### Key Milestones

- **R1-R6**: Building the heuristic + XGBoost pipeline, learning from mistakes
- **R7**: Post-mortem revealed L7 was destroying rare classes → implemented Safe L7
- **R8**: Cross-seed empirical tables deployed (+16.5 points on R8 backtest)
- **R10**: Fixed critical bug where cross-seed observations weren't being passed
- **R13**: Autoresearch overnight session (76 features, +1.17 WAVG) → rank #1
- **R14**: Retrained GBT on 12 rounds (81,535 samples), submitted 2026-03-21

### Leaderboard Position (as of R14 submission)

Our R13 weighted score: 93.94 × 1.8856 = **~177.15** (competing for #1)
R14 weight: 1.9799 — a score of 93+ would give **~184**, clear #1.

## Files

| File | Role |
|------|------|
| `run.py` | Production runner — queries, predicts, submits |
| `model.py` | Production model — all layers, feature extraction |
| `train.py` | Backtest — LORO cross-validation (autoresearch edits this) |
| `retrain_gbt.py` | Retrain XGBoost on all rounds |
| `evaluate.py` | Score predictions against GT |
| `client.py` | API client with rate limiting |
| `utils.py` | Viewport planning, observation I/O, normalization |
| `analyze_observations.py` | Deep observation analysis → feature candidates |
| `AUTORESEARCH.md` | Detailed autoresearch session writeup |
| `data/gbt_models.pkl` | Production XGBoost models (76 features, 12 rounds) |
| `data/round{N}_initial.json` | Initial states per round |
| `data/gt_r{N}_seed{S}.npy` | Ground truth tensors |
| `data/obs_{uuid}.jsonl` | Observation checkpoints |

## How to Run

```bash
# Backtest (LORO cross-validation)
cd tasks/astar-island && python3 train.py

# Retrain production GBT on all available data
python3 retrain_gbt.py

# Submit to active round
ASTAR_TOKEN="..." python3 run.py

# Dry run (no submission)
ASTAR_TOKEN="..." python3 run.py --dry-run

# Resume from checkpoint
ASTAR_TOKEN="..." python3 run.py --resume
```
