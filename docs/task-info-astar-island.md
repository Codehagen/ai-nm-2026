# Astar Island — Viking Civilisation Prediction

Observe a black-box Norse civilisation simulator through a limited viewport and predict the final world state.

- **Task type**: Observation + probabilistic prediction (REST API)
- **Weight**: 25% of total score
- **API**: REST endpoints at `api.ainm.no/astar-island/`
- **Rounds**: Time-boxed (~2h45m prediction windows)

## How It Works

1. **A round starts** — admin creates a round with a fixed map, hidden parameters, and 5 random seeds
2. **Observe through a viewport** — call `POST /astar-island/simulate` with viewport coordinates to observe one stochastic run through a window (max 15×15 cells). **50 queries total per round**, shared across all 5 seeds.
3. **Learn the hidden rules** — analyze viewport observations to understand the forces governing the world
4. **Generate predictions** — build probability distributions for the full map
5. **Submit predictions** — for each seed, submit a W×H×6 probability tensor predicting terrain type probabilities per cell
6. **Scoring** — entropy-weighted KL divergence (0-100)

## The Core Challenge

The simulation is **stochastic** — same map + parameters produce different outcomes every run. With only **50 queries** shared across **5 seeds**, and each query revealing a **15×15 viewport** of the 40×40 map, you must be strategic.

---

# Simulation Mechanics

## The World

Rectangular grid (default 40×40) with 8 terrain types mapping to **6 prediction classes**:

| Internal Code | Terrain | Class Index | Description |
|--------------|---------|-------------|-------------|
| 10 | Ocean | 0 (Empty) | Impassable water, borders the map |
| 11 | Plains | 0 (Empty) | Flat land, buildable |
| 0 | Empty | 0 | Generic empty cell |
| 1 | Settlement | 1 | Active Norse settlement |
| 2 | Port | 2 | Coastal settlement with harbour |
| 3 | Ruin | 3 | Collapsed settlement |
| 4 | Forest | 4 | Provides food to adjacent settlements |
| 5 | Mountain | 5 | Impassable terrain |

Ocean, Plains, and Empty all map to **class 0**. Mountains are static. Forests mostly static but can reclaim ruins.

## Map Generation

Each map procedurally generated from a **map seed** (visible to you):
- Ocean borders surround the map
- Fjords cut inland from random edges
- Mountain chains form via random walks
- Forest patches cover land with clustered groves
- Initial settlements placed on land cells, spaced apart

## Simulation Lifecycle (50 years)

Each year cycles through:

### Growth
Settlements produce food from adjacent terrain. Prosperous settlements expand by founding new ones.

### Conflict
Settlements raid each other. Longships extend range. Desperate settlements raid more aggressively. Conquered settlements may change allegiance.

### Trade
Ports within range trade if not at war. Generates wealth/food, diffuses technology.

### Winter
Varying severity. Settlements lose food. Can collapse from starvation/raids/winters → become Ruins.

### Environment
Nearby thriving settlements may reclaim ruins. If no settlement steps in, ruins overtaken by forest or fade to plains.

## Settlement Properties

Each settlement tracks: position, population, food, wealth, defense, tech level, port status, longship ownership, faction allegiance (owner_id).

Initial states expose position and port status only. Internal stats visible through simulation queries.

---

# API Endpoint Specification

## Base URL

```
https://api.ainm.no/astar-island
```

Auth: Cookie `access_token` JWT or `Authorization: Bearer <token>` header.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/astar-island/rounds` | Public | List all rounds |
| `GET` | `/astar-island/rounds/{round_id}` | Public | Round details + initial states |
| `GET` | `/astar-island/budget` | Team | Query budget for active round |
| `POST` | `/astar-island/simulate` | Team | Observe one simulation (costs 1 query) |
| `POST` | `/astar-island/submit` | Team | Submit prediction tensor |
| `GET` | `/astar-island/my-rounds` | Team | Your scores, rank, budget |
| `GET` | `/astar-island/my-predictions/{round_id}` | Team | Your predictions with argmax |
| `GET` | `/astar-island/analysis/{round_id}/{seed_index}` | Team | Post-round ground truth |
| `GET` | `/astar-island/leaderboard` | Public | Leaderboard |

## GET /rounds/{round_id}

Returns initial states for all seeds:

```json
{
  "id": "uuid",
  "map_width": 40,
  "map_height": 40,
  "seeds_count": 5,
  "initial_states": [
    {
      "grid": [[10, 10, 10, ...], ...],
      "settlements": [
        {"x": 5, "y": 12, "has_port": true, "alive": true}
      ]
    }
  ]
}
```

### Grid Cell Values

| Value | Terrain |
|-------|---------|
| 0 | Empty |
| 1 | Settlement |
| 2 | Port |
| 3 | Ruin |
| 4 | Forest |
| 5 | Mountain |
| 10 | Ocean |
| 11 | Plains |

## POST /simulate

Core observation endpoint. Each call = 1 query from budget (50 per round).

### Request

```json
{
  "round_id": "uuid",
  "seed_index": 3,
  "viewport_x": 10,
  "viewport_y": 5,
  "viewport_w": 15,
  "viewport_h": 15
}
```

| Field | Type | Description |
|-------|------|-------------|
| `round_id` | string | UUID of the active round |
| `seed_index` | int (0-4) | Which seed to simulate |
| `viewport_x` | int (>=0) | Left edge of viewport |
| `viewport_y` | int (>=0) | Top edge of viewport |
| `viewport_w` | int (5-15) | Viewport width |
| `viewport_h` | int (5-15) | Viewport height |

### Response

```json
{
  "grid": [[4, 11, 1, ...], ...],
  "settlements": [
    {
      "x": 12, "y": 7,
      "population": 2.8,
      "food": 0.4,
      "wealth": 0.7,
      "defense": 0.6,
      "has_port": true,
      "alive": true,
      "owner_id": 3
    }
  ],
  "viewport": {"x": 10, "y": 5, "w": 15, "h": 15},
  "width": 40,
  "height": 40,
  "queries_used": 24,
  "queries_max": 50
}
```

Grid contains only viewport region. Each call uses different random sim_seed.

Rate limit: max 5 req/sec. Budget: 50 queries per round.

## POST /submit

Submit prediction for one seed. Must submit all 5 seeds for complete score.

### Request

```json
{
  "round_id": "uuid",
  "seed_index": 3,
  "prediction": [
    [
      [0.85, 0.05, 0.02, 0.03, 0.03, 0.02],
      [0.10, 0.40, 0.30, 0.10, 0.05, 0.05]
    ]
  ]
}
```

`prediction[y][x][class]` — H×W×6 tensor. Probabilities must sum to 1.0 (±0.01).

### Class Indices

| Index | Class |
|-------|-------|
| 0 | Empty (Ocean, Plains, Empty) |
| 1 | Settlement |
| 2 | Port |
| 3 | Ruin |
| 4 | Forest |
| 5 | Mountain |

Resubmitting overwrites previous prediction.

---

# Scoring

## Score Formula

Entropy-weighted KL divergence between prediction and ground truth.

### Ground Truth

Organizers pre-compute by running simulation **hundreds of times** with true hidden parameters. Produces probability distribution per cell.

### KL Divergence

```
KL(p || q) = Σ pᵢ × log(pᵢ / qᵢ)
```

Where `p` = ground truth, `q` = your prediction. Lower = better.

### Entropy Weighting

Only **dynamic cells** (those that change between runs) contribute, weighted by entropy:
```
entropy(cell) = -Σ pᵢ × log(pᵢ)
```

Higher entropy cells count more.

### Final Score

```
weighted_kl = Σ entropy(cell) × KL(ground_truth[cell], prediction[cell])
              ─────────────────────────────────────────────────────────
                            Σ entropy(cell)

score = max(0, min(100, 100 × exp(-3 × weighted_kl)))
```

- **100** = perfect prediction
- **0** = terrible prediction

## CRITICAL: Never Assign Probability 0.0

If ground truth has `pᵢ > 0` but your prediction has `qᵢ = 0`, KL divergence = **infinity**.

**Always enforce minimum floor of 0.01:**

```python
prediction = np.maximum(prediction, 0.01)
prediction = prediction / prediction.sum(axis=-1, keepdims=True)
```

## Per-Round Score

Average of 5 seed scores. Missing seeds score **0** — always submit something.

## Leaderboard

Weighted average across all rounds. Later rounds may have higher weights.

---

# Quickstart

## Authentication

```python
import requests

BASE = "https://api.ainm.no"
session = requests.Session()
session.cookies.set("access_token", "YOUR_JWT_TOKEN")
# OR: session.headers["Authorization"] = "Bearer YOUR_JWT_TOKEN"
```

## Step 1: Get Active Round

```python
rounds = session.get(f"{BASE}/astar-island/rounds").json()
active = next((r for r in rounds if r["status"] == "active"), None)
round_id = active["id"]
```

## Step 2: Get Round Details

```python
detail = session.get(f"{BASE}/astar-island/rounds/{round_id}").json()
width = detail["map_width"]      # 40
height = detail["map_height"]    # 40
seeds = detail["seeds_count"]    # 5

for i, state in enumerate(detail["initial_states"]):
    grid = state["grid"]
    settlements = state["settlements"]
```

## Step 3: Query Simulator (50 budget)

```python
result = session.post(f"{BASE}/astar-island/simulate", json={
    "round_id": round_id,
    "seed_index": 0,
    "viewport_x": 10,
    "viewport_y": 5,
    "viewport_w": 15,
    "viewport_h": 15,
}).json()

grid = result["grid"]                # 15x15 terrain after simulation
settlements = result["settlements"]  # settlements with full stats
```

## Step 4: Submit Predictions

```python
import numpy as np

for seed_idx in range(seeds):
    prediction = np.full((height, width, 6), 1/6)  # uniform baseline

    # TODO: replace with your model's predictions

    # IMPORTANT: enforce minimum floor
    prediction = np.maximum(prediction, 0.01)
    prediction = prediction / prediction.sum(axis=-1, keepdims=True)

    resp = session.post(f"{BASE}/astar-island/submit", json={
        "round_id": round_id,
        "seed_index": seed_idx,
        "prediction": prediction.tolist(),
    })
    print(f"Seed {seed_idx}: {resp.status_code}")
```

Uniform prediction scores ~1-5. Use queries to build better predictions.

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Map seed** | Determines terrain layout (fixed per seed, visible to you) |
| **Sim seed** | Random seed for each simulation run (different every query) |
| **Hidden parameters** | Values controlling behavior (same for all seeds in a round) |
| **50 queries** | Budget per round, shared across all 5 seeds |
| **Viewport** | Each query reveals max 15×15 window |
| **W×H×6 tensor** | Your prediction — probability of each terrain class per cell |
| **50 years** | Each simulation runs for 50 time steps |
