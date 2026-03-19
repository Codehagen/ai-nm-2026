# NM i AI 2026 🏆

**Norway's National AI Championship 2026** — Agent-first competition harness for 3 AI tasks across 69 hours.

**Competition**: March 19 (18:00) → March 22 (15:00) CET | **Prize pool**: 1,000,000 NOK

## Overview

Three unknown AI tasks (Computer Vision, Machine Learning, NLP) are revealed at kickoff. This repo provides a pre-built harness so we can immediately import task specs and start solving at maximum velocity.

**Strategy**: Breadth wins — reliable solutions across all 3 tasks beats excellence in 1.

## Project Structure

```
├── AGENTS.md              # Agent navigation guide (start here)
├── ARCHITECTURE.md        # System architecture & conventions
├── CLAUDE.md              # Claude Code instructions
├── RULES.md               # Competition rules reference
├── tasks/
│   ├── cv/                # Computer Vision task (port 9050)
│   ├── ml/                # Machine Learning task (port 9051)
│   ├── nlp/               # NLP / Language Models task (port 9052)
│   └── template/          # Reference template
├── shared/                # Cross-task utilities
│   ├── ml_utils.py        # Metrics, encoding, ensembles, timing
│   ├── api_utils.py       # Health checks, endpoint profiling
│   ├── data_utils.py      # Data loading, splitting, cross-validation
│   └── autoresearch.py    # Overnight autonomous optimization loop
├── scripts/
│   ├── setup.sh           # One-command environment setup
│   ├── validate.sh        # Pre-submit validation checks
│   ├── test-task.sh       # Per-task testing
│   ├── import-task.sh     # Quick-import when tasks are revealed
│   └── gcp/               # GPU VM management scripts
├── docs/
│   ├── STRATEGY.md        # Time budget & competition strategy
│   ├── task-analysis/     # Per-task analysis (filled at kickoff)
│   ├── exec-plans/        # Execution plans
│   └── design-docs/       # Core principles
├── docker-compose.yml     # Run all 3 tasks with GPU
└── .github/workflows/     # CI validation on push
```

## Quick Start

```bash
# Setup
bash scripts/setup.sh
source .venv/bin/activate

# Run a task API
cd tasks/cv && python api.py

# Run tests
pytest tasks/cv/tests/ -v

# Validate before submitting
bash scripts/validate.sh
```

## Per-Task Architecture

Each task follows an identical layout and layer pattern:

```
tasks/<category>/
├── dtos.py      # Pydantic request/response models (define first)
├── utils.py     # Data processing & helpers
├── model.py     # Model loading + inference
├── train.py     # Training script
├── api.py       # FastAPI server
├── Dockerfile   # GPU-ready container
└── tests/       # Endpoint tests
```

**Layer flow**: `dtos.py` → `utils.py` → `model.py` → `api.py`

| Task | Port | Category |
|------|------|----------|
| CV   | 9050 | Computer Vision |
| ML   | 9051 | Machine Learning |
| NLP  | 9052 | NLP / Language Models |

## When Tasks Drop (18:00 Kickoff)

```bash
# 1. Import a task
bash scripts/import-task.sh cv "image-segmentation"

# 2. Edit the DTOs to match the actual schema
#    tasks/cv/dtos.py

# 3. Implement the model
#    tasks/cv/model.py

# 4. Test locally
pytest tasks/cv/tests/ -v

# 5. Deploy to GCP GPU
bash scripts/gcp/create-vm.sh cv medium
bash scripts/gcp/deploy-task.sh cv
```

## GCP Deployment

Solo competitor, no local GPU — all compute runs on sponsored GCP.

```bash
# Create GPU VMs (one per task)
bash scripts/gcp/create-vm.sh cv medium    # L4 24GB
bash scripts/gcp/create-vm.sh ml light     # T4 16GB
bash scripts/gcp/create-vm.sh nlp medium   # L4 24GB

# Deploy & train
bash scripts/gcp/deploy-task.sh cv         # deploy code to VM
bash scripts/gcp/train-task.sh cv          # run training on GPU

# Monitor
bash scripts/gcp/status.sh                 # check all endpoints

# Cleanup
bash scripts/gcp/teardown.sh               # delete all VMs
```

**GPU tiers:**

| Tier | Machine | GPU | VRAM | Use case |
|------|---------|-----|------|----------|
| Light | n1-standard-8 + T4 | 1x T4 | 16GB | Tabular ML, small models |
| Medium | g2-standard-8 + L4 | 1x L4 | 24GB | CV, NLP fine-tuning |
| Heavy | a2-highgpu-1g + A100 | 1x A100 | 40GB | Large transformers |

## Docker

```bash
# Run all 3 tasks locally
docker compose up

# Run a single task
cd tasks/cv && docker compose up

# Training mode
TASK_MODE=train docker compose up
```

## Autoresearch (Overnight Optimization)

Uses the [autoresearch-mlx](https://github.com/Walgermo/autoresearch-mlx) protocol — Karpathy's autonomous experiment loop. The sibling repo lives at `~/Utvikling/autoresearch-mlx/`.

**Two modes:**
- **Local (Apple Silicon)**: Run autoresearch-mlx directly with MLX. Best for NLP/small models.
- **GCP (PyTorch/CUDA)**: Use `shared/autoresearch.py` helpers on GPU VMs. Best for CV/large models.

**The loop** (from `autoresearch-mlx/program.md`):
1. Edit `train.py` with an experimental idea
2. Commit the change
3. Run training within fixed time budget
4. If `val_metric` improved → keep (amend commit with results)
5. If worse → discard (`git reset --hard`)
6. Log to `results.tsv`, repeat indefinitely

Set it up before sleep, wake up to optimized models.

## Competition Rules

- ✅ AI coding assistants (Claude, Copilot)
- ✅ Pre-trained models & transfer learning
- ✅ Cloud compute for training
- ❌ Cloud AI APIs at inference time (OpenAI, Azure, etc.)
- ❌ Hardcoded / pre-computed responses
- 📋 Code must be public + MIT licensed
- 📋 Scoring = average of 3 normalized task scores (0-100)

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | Python 3.11+ |
| API | FastAPI + Pydantic |
| ML | PyTorch, Transformers, scikit-learn, XGBoost, LightGBM |
| Package mgr | uv |
| Testing | pytest |
| Compute | GCP (T4/L4/A100) |
| CI | GitHub Actions |

## Time Budget (69 hours)

| Phase | Hours | Goal |
|-------|-------|------|
| Rapid baseline | 0–2 | Non-zero score on all 3 tasks |
| Strong baselines | 2–8 | Competitive scores with pretrained models |
| Overnight optimization | 8–20 | Autoresearch agents iterate autonomously |
| Iteration | 20–60 | Architecture improvements, ensembles |
| Final polish | 60–69 | Stress-test, threshold tuning, submit |

---

**Built for speed.** Read `AGENTS.md` to get started.
