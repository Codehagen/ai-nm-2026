# NM i AI 2026 — Agent Navigation

**Competition repo. 3 AI tasks (CV, ML, NLP), 69 hours, agent-first.**

## Quick Start

```bash
cd ai-nm-2026
bash scripts/setup.sh          # install deps
source .venv/bin/activate
cd tasks/cv && python api.py   # run a task API
pytest tasks/cv/tests/         # test a task
bash scripts/validate.sh       # pre-submit check
```

## Where to Find Things

| What | Where |
|------|-------|
| Task code | `tasks/{cv,ml,nlp}/` |
| Shared utilities | `shared/` |
| Competition rules | `RULES.md` |
| Architecture overview | `ARCHITECTURE.md` |
| Strategy & time budget | `docs/STRATEGY.md` |
| Task analysis | `docs/task-analysis/{cv,ml,nlp}-analysis.md` |
| Execution plans | `docs/exec-plans/active/` |
| GCP scripts | `scripts/gcp/` |
| Validation | `scripts/validate.sh` |
| Autoresearch protocol | `~/Utvikling/autoresearch-mlx/program.md` |

## Competition Rules (Summary)

Read `RULES.md` for full rules. Key points:
- Code must be public, MIT licensed
- No hardcoded or pre-computed responses
- AI assistants explicitly allowed
- **No cloud AI APIs at inference time** (OpenAI, Azure, etc.)
- Scoring = average of 3 normalized task scores (0-100 each)
- Deadline: March 22, 2026 at 15:00 CET

## Golden Rules

1. **Each task is independent.** Never cross-import between task directories.
2. **FastAPI + Pydantic for all endpoints.** Match the DTO schema exactly.
3. **Load models at startup, not per-request.**
4. **No cloud APIs during inference** (OpenAI, Azure, etc. prohibited).
5. **Respect per-task timeout constraints.**
6. **Parse/validate at boundaries.** Use Pydantic DTOs.
7. **Repository is the system of record.** All task analysis, strategies, and findings go in `docs/`.
8. **No hardcoded or pre-computed responses.** Solutions must reflect genuine model capabilities.

## Task Workflow

1. **Receive task** — read the challenge description
2. **Analyze** — fill `docs/task-analysis/<category>-analysis.md`
3. **Write exec-plan** — create `docs/exec-plans/active/EP-<category>.md`
4. **Implement** — code in `tasks/<category>/`, following the layer pattern: `dtos.py` -> `utils.py` -> `model.py` -> `api.py`
5. **Validate** — run `scripts/validate.sh`
6. **Submit** — deploy to GCP VM, submit endpoint URL

## Per-Task Layer Pattern

```
dtos.py    — Pydantic request/response models (define first)
utils.py   — Task-specific data processing utilities
model.py   — ML model loading + inference logic
train.py   — Training script (autoresearch-compatible)
api.py     — FastAPI server (imports from above)
```

## GCP Compute

**Project**: `ai-nm26osl-1823` | **Region**: `europe-west4`

### Fleet Management

```bash
# Spin up full fleet
scripts/gcp/fleet-up.sh baseline              # 3 VMs (cv=L4, ml=T4, nlp=L4) — ~$1.75/hr
scripts/gcp/fleet-up.sh baseline --spot       # same, 70% cheaper — ~$0.53/hr
scripts/gcp/fleet-up.sh overnight --spot      # 7-9 VMs, parallel A100s — ~$5.50/hr
scripts/gcp/fleet-up.sh max --spot            # 9x A100 — ~$8/hr

# Deploy to all running VMs
scripts/gcp/fleet-deploy.sh                   # all tasks
scripts/gcp/fleet-deploy.sh cv                # just cv variants

# Status and teardown
scripts/gcp/status.sh                         # fleet overview with GPU/cost
scripts/gcp/teardown.sh                       # tear down everything
scripts/gcp/teardown.sh cv --all              # all cv variants only
```

### Single VM Operations

```bash
scripts/gcp/create-vm.sh cv heavy --spot              # A100, preemptible
scripts/gcp/create-vm.sh cv heavy --spot --name=vit   # named variant
scripts/gcp/deploy-task.sh cv                          # deploy code
scripts/gcp/deploy-task.sh cv --name=vit               # deploy to named VM
scripts/gcp/train-task.sh cv                           # run training
```

### Vertex AI (Serverless Training + HPO)

Serverless training on Vertex AI — no VM management, prebuilt PyTorch containers.
Hybrid approach: Vertex AI for large training jobs & HPO, raw VMs for serving & autoresearch.

```bash
# One-time setup
scripts/gcp/vertex-setup.sh

# Submit training job (uploads code to GCS, runs on Vertex AI, downloads models)
scripts/gcp/vertex-train.sh cv heavy               # A100 training
scripts/gcp/vertex-train.sh ml light               # T4 training
scripts/gcp/vertex-train.sh cv heavy --spot        # spot pricing

# Hyperparameter tuning (parallel trials via Vertex AI Vizier)
scripts/gcp/vertex-hpo.sh cv config.yaml           # HPO with config
scripts/gcp/vertex-hpo.sh cv config.yaml --spot    # spot pricing
```

HPO config YAML example:
```yaml
studySpec:
  metrics:
    - metricId: val_metric
      goal: MAXIMIZE
  parameters:
    - parameterId: learning_rate
      doubleValueSpec: { minValue: 0.0001, maxValue: 0.01 }
    - parameterId: batch_size
      discreteValueSpec: { values: [8, 16, 32, 64] }
maxTrialCount: 20
parallelTrialCount: 3
```

In train.py, use `shared.vertex_utils.report_metric("val_metric", score)` to report metrics (no-op locally).

### GPU Tiers

| Tier | Machine | GPU | VRAM | Cost/hr | Spot |
|------|---------|-----|------|---------|------|
| light | n1-standard-8 | T4 | 16GB | ~$0.35 | ~$0.11 |
| medium | g2-standard-8 | L4 | 24GB | ~$0.70 | ~$0.21 |
| heavy | a2-highgpu-1g | A100 | 40GB | ~$2.95 | ~$0.89 |

### Parallel Experiments

Spin up multiple VMs per task with `--name=suffix` for different approaches:

```bash
scripts/gcp/create-vm.sh cv heavy --spot --name=resnet
scripts/gcp/create-vm.sh cv heavy --spot --name=vit
scripts/gcp/create-vm.sh cv heavy --spot --name=effnet
```

Each runs its own autoresearch branch. Pick the best in the morning.

## Autoresearch (Overnight Optimization)

Uses the [autoresearch-mlx](https://github.com/Walgermo/autoresearch-mlx) protocol (Karpathy's autonomous experiment loop).

**Two modes:**
- **GCP (PyTorch/CUDA)**: `shared/autoresearch.py` helpers on GPU VMs
- **Local (Apple Silicon/MLX)**: `~/Utvikling/autoresearch-mlx/` directly

**Protocol** (from `autoresearch-mlx/program.md`):
1. Edit `train.py` with an experimental idea
2. Commit: `git add tasks/<task>/train.py && git commit -m "experiment: <desc>"`
3. Run: `python train.py > run.log 2>&1`
4. Read: `grep "^val_metric:" run.log`
5. If improved → keep (amend commit with `results.tsv`)
6. If worse → discard (`git reset --hard <previous kept commit>`)
7. Log to `results.tsv`, repeat indefinitely

**Task contract:**
- `prepare.py` exports: `TIME_BUDGET`, `evaluate()` — **READ-ONLY**
- `train.py` prints `val_metric: <float>` — **MUTABLE** (the file the agent edits)
- `task.md` declares: `metric_name`, `metric_direction` (lower/higher)

Spot VMs handle preemption gracefully — autoresearch reverts and retries on restart.
