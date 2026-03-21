# Astar Island Round Pipeline

Step-by-step for each new round. ~5 min per round.

## When a round opens

### 1. Submit (2 min)
```bash
cd tasks/astar-island
ASTAR_TOKEN=<token> python run.py
```
This queries 50 observations, builds predictions with the current model, and submits all 5 seeds.
Now uses ALL 50 observations across all seeds for L7 correction and empirical tables.

### 2. Check observation stats (30 sec)
```bash
ASTAR_TOKEN=<token> python3 -c "
from client import AstarClient
c = AstarClient()
rounds = c.get_rounds()
for r in rounds:
    if r.status == 'active' or r.round_number >= 9:
        print(f'R{r.round_number}: {r.status}')
"
```

### 3. Gauge the round (30 sec)
After submission, check `settl_per_obs` in the logs. Compare to training data:

| Round | settl/obs | Expansion | Type |
|-------|-----------|-----------|------|
| R1 | 38.6 | Medium | Archipelago |
| R2 | 43.9 | High | Archipelago |
| R4 | 22.1 | Low | Continental |
| R5 | 29.3 | Medium | Continental |
| R6 | 57.1 | Very high | Continental |
| R7 | 35.9 | Medium | Continental (sharp cutoff) |
| R8 | 7.5 | Very low | Extreme extinction |
| R9 | ~30 | Medium | Continental |
| R10 | 2.8 | Very low | Extreme extinction |

If settl/obs is within 20-60 range, the model is in-distribution. Outside that = novel round.
R8 and R10 are extinction rounds: all settlements died, GT is ~75% empty + 25% forest.

## When a round completes (scoring done)

### 4. Download GT + save initial states (1 min)
```bash
ASTAR_TOKEN=<token> python3 -c "
from client import AstarClient
import numpy as np, json
c = AstarClient()
ROUND_NUM = 11  # <-- change this
rounds = c.get_rounds()
round_id = [r for r in rounds if r.round_number==ROUND_NUM][0].id
detail = c.get_round_detail(round_id)

# Save initial states
states = {'initial_states': []}
for seed in range(5):
    s = detail.initial_states[seed]
    states['initial_states'].append({'grid': s.grid, 'settlements': [x.model_dump() for x in s.settlements]})
with open(f'data/round{ROUND_NUM}_initial.json', 'w') as f:
    json.dump(states, f)

# Save GT
for seed in range(5):
    a = c.get_analysis(round_id, seed)
    np.save(f'data/gt_r{ROUND_NUM}_seed{seed}.npy', np.array(a.ground_truth))
    print(f'Seed {seed}: score={a.score:.2f}')
print(f'Round {ROUND_NUM} GT saved.')
"
```

### 5. Update ROUNDS + retrain GBT (2 min)
1. Add round ID to `ROUNDS` dict in both `train.py` and `retrain_gbt.py`
2. Add round weight to `ROUND_WEIGHTS` in both files
3. Update `test_rounds` list in `evaluate_loro()` in `train.py`
4. Update `weights` dict in `__main__` of `train.py`
5. Retrain: `python retrain_gbt.py`

### 6. Run LORO to verify (optional, ~175 sec)
```bash
python train.py
```
Check that val_metric improved or stayed stable with the new data.

## Model Architecture (current, WAVG=87.36)

```
Layer 1: build_static_prediction()
  └── Distance tables calibrated from R1-R10 GT (45 maps)

Layer 3: fill_unobserved_dynamic()
  └── Context priors (adj_forests, coastal, settlement adjacency)

Layer 6: gbt_predict() with obs_stats
  └── XGBoost (37 features: 30 cell + 7 obs stats)
  └── Per-terrain blend: plains=0.55, forest=0.65, settl=0.75
  └── Terrain-specific models (plains/forest/settlement)
  └── Hparams: 300 trees, depth 5, lr 0.08, reg_alpha=0.1, reg_lambda=2.0

Layer 6.7: Cross-seed empirical distance tables
  └── Pool ALL observations across ALL seeds
  └── Group by (initial_terrain, distance_bucket, coastal)
  └── EMP_BLEND = 0.40

Layer 7: Safe L7 observation ratio correction
  └── Strengths: [1.60, 1.20, 0.0, 0.0, 1.70, 0.0]
  └── Per-class clamp: empty [0.75-1.30], settl [0.35-1.35], forest [0.75-1.30]
  └── Obs count gating: [200, 50, 30, 20, 100, 0]
  └── Zero for port (cls=2) and ruin (cls=3)

Layer 8: Per-cell empirical (MIN_SAMPLES=50, effectively disabled)

Normalize → Submit
```

## Key Files

| File | Purpose |
|------|---------|
| `run.py` | Main entry: query + predict + submit |
| `model.py` | Prediction pipeline (production) |
| `train.py` | LORO evaluation (autoresearch) |
| `retrain_gbt.py` | Retrain XGBoost on all rounds |
| `evaluate.py` | Scoring function |
| `gen_experiments.py` | Generate fleet experiment variants |
| `data/gbt_models.pkl` | Trained XGBoost models (37 features) |
| `data/obs_<round_id>.jsonl` | Saved observations per round |
| `data/gt_r<N>_seed<S>.npy` | Ground truth per round/seed |
| `data/round<N>_initial.json` | Initial states per round |
| `results.tsv` | Experiment log |

## Key Learnings

1. **Leaderboard = MAX(round_score x round_weight)** — only best weighted round matters
2. **Can resubmit** — only last submission counts
3. **Use ALL 50 observations** for L7/empirical tables — same-seed only cost 13 pts on R10
4. **Settlement stats (population, food, wealth, defense)** are 40-63% of XGBoost feature importance
5. **Safe L7** — never correct port/ruin classes (observation under-sampling + KL asymmetry)
6. **settl_per_obs** predicts expansion rate with r²=0.96
7. **PROB_FLOOR=0.0001** — higher floors hurt badly
8. Each round has 50 queries, 5 seeds, 15x15 viewport, 40x40 map
9. Round weights: 1.05^(round-1) — later rounds worth more
10. R8 and R10 are extinction rounds — model handles these via L7 correction
