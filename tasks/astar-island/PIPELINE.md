# Astar Island Round Pipeline

Step-by-step for each new round. ~5 min per round.

## When a round opens

### 1. Submit (2 min)
```bash
cd tasks/astar-island
ASTAR_TOKEN=<token> python run.py
```
This queries 50 observations, builds predictions with the current model, and submits all 5 seeds.

### 2. Check observation stats (30 sec)
```bash
ASTAR_TOKEN=<token> python3 -c "
from client import AstarClient
c = AstarClient()
rounds = c.get_my_rounds()
for r in rounds:
    if r['status'] == 'active' or r['round_number'] >= 7:
        print(f'R{r[\"round_number\"]}: {r[\"status\"]} score={r.get(\"round_score\",\"?\")} rank={r.get(\"rank\",\"?\")}')
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
| R8 | 7.5 | Very low | Extreme low expansion |

If settl/obs is within 20-60 range, the model is in-distribution. Outside that = novel round.

## When a round completes (scoring done)

### 4. Download GT + save initial states (1 min)
```bash
ASTAR_TOKEN=<token> python3 -c "
from client import AstarClient
import numpy as np, json
c = AstarClient()
ROUND_NUM = 8  # <-- change this
round_id = [r for r in c.get_my_rounds() if r['round_number']==ROUND_NUM][0]['id']
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

### 5. Check score + retrain GBT (2 min)
```bash
# Retrain with new round included
python retrain_gbt.py
```
Update `ROUNDS` dict in `retrain_gbt.py` and `train.py` with the new round ID first.

### 6. Run LORO to verify (optional, ~90 sec)
```bash
python train.py
```
Check that val_metric improved or stayed stable with the new data.

## Model Architecture (current)

```
Layer 1: build_static_prediction()
  └── Distance tables calibrated from R1-R7 GT (30 maps)

Layer 3: fill_unobserved_dynamic()
  └── Context priors (adj_forests, coastal, settlement adjacency)

Layer 6: gbt_predict() with obs_stats
  └── XGBoost (37 features: 30 cell + 7 obs stats)
  └── Blend weight: 0.35
  └── Terrain-specific models (plains/forest/settlement)

Layer 7: Safe L7 observation ratio correction
  └── Strengths: [1.20, 0.80, 0.0, 0.0, 1.30, 0.0]
  └── Clamp: [0.80, 1.25]
  └── Obs count gating: [200, 50, 30, 20, 100, 0]
  └── Zero for port (cls=2) and ruin (cls=3)

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
| `data/gbt_models.pkl` | Trained XGBoost models (37 features) |
| `data/obs_<round_id>.jsonl` | Saved observations per round |
| `data/gt_r<N>_seed<S>.npy` | Ground truth per round/seed |
| `data/round<N>_initial.json` | Initial states per round |
| `results.tsv` | Experiment log |

## Key Learnings

1. **Leaderboard = MAX(round_score x round_weight)** — only best weighted round matters
2. **Can resubmit** — only last submission counts
3. **Settlement stats (population, food, wealth, defense)** are 40-63% of XGBoost feature importance
4. **Safe L7** — never correct port/ruin classes (observation under-sampling + KL asymmetry)
5. **settl_per_obs** predicts expansion rate with r²=0.96
6. **PROB_FLOOR=0.0001** — higher floors hurt badly
7. Each round has 50 queries, 5 seeds, 15x15 viewport, 40x40 map
8. Round weights: 1.05^(round-1) — later rounds worth more
