# NM i AI 2026

**Norway's National AI Championship 2026** — Team Christer

**Competition**: March 19 (18:00) → March 22 (15:00) CET

## Tasks

| Task | Directory | Description |
|------|-----------|-------------|
| **Astar Island** | `tasks/astar-island/` | Probabilistic terrain prediction for Norse civilization simulator. Multi-layer heuristic + XGBoost model with 1000+ VM autoresearch swarm. |
| **Norgesgruppen** | `tasks/norgesgruppen/` | Object detection (YOLOv8). 3-pass WBF ensemble. |
| **Tripletex** | `tasks/1/` | Accounting agent — LLM-based task classification and execution. |

## Astar Island (Main Focus)

Our most developed task. Architecture:

```
params.py       ← Single source of truth for all tunable parameters
  ↓
train.py        ← LORO evaluation (offline backtesting against 19 rounds of GT)
model.py        ← Inference engine (build_prediction for submissions)
retrain_gbt.py  ← XGBoost model training
run.py          ← Query simulator + submit predictions
```

Key results:
- **WAVG 90.19** (Leave-One-Round-Out cross-validation)
- 19 rounds of ground truth data (R1-R22, excl R3/R12/R20)
- Terrain-specific XGBoost (76 features: cell + obs stats + spatial)
- Round-type adaptive L7 observation correction (expansion/extinction/normal)
- 1000+ VM autoresearch swarm using Gemini for parameter optimization

See `tasks/astar-island/READTHIS.md` for the parameter sync guide.

## Infrastructure

```
scripts/gcp/
├── scale-astar.sh       # Create VM fleets (GCS-based startup)
├── fast-redeploy.sh     # Deploy code to 1000+ VMs in ~5 min via GCS
├── collect-fleet.sh     # Collect results from fleet
├── swarm-start-remote.sh # VM startup script
└── ...
```

## How to Run

```bash
bash scripts/setup.sh
source .venv/bin/activate

# Astar Island
cd tasks/astar-island
python train.py          # Run LORO evaluation
python retrain_gbt.py    # Retrain XGBoost models
ASTAR_TOKEN=... python run.py  # Submit to active round

# Norgesgruppen
cd tasks/norgesgruppen
python test_local.py --data data/yolo-3way

# Tripletex
cd tasks/1
python api.py
```

## Tech Stack

Python 3.11+, FastAPI, XGBoost, PyTorch, Pydantic, GCP (n2-highcpu-32 VMs), Gemini 3.1 Flash Lite (autoresearch)
