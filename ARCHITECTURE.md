# Architecture

## Monorepo Structure

```
ai-nm-1/
├── tasks/
│   ├── cv/          # Computer Vision (port 9050)
│   ├── ml/          # Machine Learning (port 9051)
│   ├── nlp/         # NLP / Language Models (port 9052)
│   └── template/    # Reference template
├── shared/          # Cross-task utilities (no task-specific logic)
├── docs/            # Strategy, analysis, exec plans
├── scripts/         # Setup, validation, GCP deployment
└── docker-compose.yml  # Run all 3 tasks
```

## Task Independence

Each task is a self-contained unit. **No cross-task imports.**
All tasks share the same internal layout:

```
tasks/<category>/
├── api.py              # FastAPI server
├── dtos.py             # Pydantic request/response models
├── model.py            # Model loading + inference
├── train.py            # Training script
├── utils.py            # Task-specific utilities
├── example.py          # Baseline/test script
├── requirements.txt    # Task-specific dependencies
├── README.md           # Task analysis & findings
├── program.md          # Autoresearch overnight config
├── Dockerfile          # GPU-ready container
├── docker-compose.yml  # Local run with GPU
├── data/{train,val}/   # Datasets
├── models/             # Saved weights
├── notebooks/          # Exploration
└── tests/test_api.py   # Endpoint tests
```

## Layer Pattern (per task)

```
dtos.py  →  utils.py  →  model.py  →  api.py
```

1. **dtos.py** — Define Pydantic models first. This is the contract.
2. **utils.py** — Data processing, augmentation, helpers.
3. **model.py** — Load model at module level, expose `predict(request) -> response`.
4. **api.py** — FastAPI app, imports `predict` from model.py.

## Shared Utilities

`shared/` contains reusable code across all tasks:
- `ml_utils.py` — Metrics, encoding, timing, ensembles
- `api_utils.py` — Health checks, response profiling
- `data_utils.py` — Dataset splitting, loading, cross-validation
- `autoresearch.py` — Overnight autonomous optimization loop

## Ports

| Task | Port |
|------|------|
| CV   | 9050 |
| ML   | 9051 |
| NLP  | 9052 |

## Docker

Each task has its own Dockerfile (multi-stage, GPU-ready).
Root `docker-compose.yml` runs all 3 tasks simultaneously.
`TASK_MODE` env var switches between `inference` (default) and `train`.
