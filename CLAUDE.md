# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` for full project navigation and golden rules.

## gstack

Use the /browse skill from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- /office-hours — YC-style brainstorming and idea validation
- /plan-ceo-review — CEO-level plan review
- /plan-eng-review — Engineering plan review
- /plan-design-review — Design review
- /design-consultation — Design consultation
- /review — Code review
- /ship — Ship/deploy workflow
- /browse — Headless browser for web browsing, QA testing, and site dogfooding
- /qa — QA testing
- /qa-only — Report-only QA testing
- /design-review — Visual design QA review
- /setup-browser-cookies — Set up browser cookies for authenticated browsing
- /retro — Retrospective
- /investigate — Systematic debugging with root cause analysis
- /document-release — Post-ship documentation update
- /codex — OpenAI Codex second opinion (review, challenge, consult)
- /careful — Safety guardrails for destructive commands
- /freeze — Restrict edits to a specific directory
- /guard — Full safety mode (careful + freeze)
- /unfreeze — Remove edit restrictions
- /gstack-upgrade — Upgrade gstack to latest version

If gstack skills aren't working, run `cd .claude/skills/gstack && ./setup` to build the binary and register skills.

## Local Dev

```bash
cd ai-nm-2026
bash scripts/setup.sh
source .venv/bin/activate

# Run a task API
cd tasks/cv && python api.py

# Run tests
pytest tasks/cv/tests/ -v

# Validate all tasks before submit
bash scripts/validate.sh
```

## Package Management

Use `uv` for fast installs. Fallback to pip if needed.

```bash
uv pip install -r requirements.txt
uv pip install -r tasks/cv/requirements.txt
```

## GCP Compute

Project: `ai-nm26osl-1823` | Region: `europe-west4` | Auth: `devstar18232@gcplab.me`

```bash
# Fleet management (spin up all VMs at once)
scripts/gcp/fleet-up.sh baseline              # 3 VMs: cv=L4, ml=T4, nlp=L4
scripts/gcp/fleet-up.sh baseline --spot       # same, 70% cheaper
scripts/gcp/fleet-up.sh overnight --spot      # 7-9 VMs for parallel autoresearch
scripts/gcp/fleet-up.sh max --spot            # 9x A100

# Single VM
scripts/gcp/create-vm.sh cv heavy --spot              # A100, preemptible
scripts/gcp/create-vm.sh cv heavy --spot --name=vit   # named variant for parallel experiments

# Deploy, train, status, teardown
scripts/gcp/deploy-task.sh cv                 # deploy to ainm-cv
scripts/gcp/deploy-task.sh cv --name=vit      # deploy to ainm-cv-vit
scripts/gcp/fleet-deploy.sh                   # deploy to ALL running VMs
scripts/gcp/train-task.sh cv                  # run training
scripts/gcp/status.sh                         # fleet status with GPU/cost info
scripts/gcp/teardown.sh                       # tear down everything
scripts/gcp/teardown.sh cv --all              # tear down all cv variants
```

GPU tiers: light (T4 16GB ~$0.35/hr), medium (L4 24GB ~$0.70/hr), heavy (A100 40GB ~$2.95/hr). Spot is ~70% off.

Deep Learning VMs have PyTorch+CUDA pre-installed. API runs via systemd-run (survives SSH disconnect).

## Vertex AI Training

Serverless training + HPO — no VM management. Complements raw VMs (which are better for serving + autoresearch).

```bash
# One-time setup (enable API + create GCS bucket)
scripts/gcp/vertex-setup.sh

# Submit training job
scripts/gcp/vertex-train.sh cv heavy           # A100 training job
scripts/gcp/vertex-train.sh ml light            # T4 training job
scripts/gcp/vertex-train.sh cv heavy --spot     # Spot pricing

# Hyperparameter tuning
scripts/gcp/vertex-hpo.sh cv config.yaml        # HPO with config
scripts/gcp/vertex-hpo.sh cv config.yaml --spot  # Spot pricing
```

Uses prebuilt PyTorch containers. Models auto-upload to GCS and download to `tasks/<task>/models/`.

For HPO, use `shared/vertex_utils.report_metric("val_metric", score)` in train.py to report metrics to Vizier.

## Autoresearch

Two modes for overnight autonomous optimization:

- **GCP (PyTorch/CUDA)**: `shared/autoresearch.py` helpers. Run on GPU VMs.
- **Local (Apple Silicon/MLX)**: `~/Utvikling/autoresearch-mlx/` — full Karpathy protocol.

Protocol: edit `train.py` → run → read `val_metric` → keep if improved, revert if not → repeat.

See `autoresearch-mlx/program.md` for the full protocol.

## Commit Conventions

- Prefix with task: `cv: add segmentation model`, `ml: tune xgboost params`, `nlp: implement rag pipeline`
- Shared changes: `shared: add dice score metric`
- Infra: `infra: update docker config`

## Pre-Submit Checklist

Run `scripts/validate.sh` before submitting. It checks:
- All APIs boot and respond to health checks
- `/predict` returns valid responses matching DTO schema
- Response times within timeout limits
- No prohibited cloud API imports in inference path

## NorgesGruppen Task (Object Detection)

Task docs: `docs/task-info-norgesgruppen.md`. Task code: `tasks/norgesgruppen/`.

### Local Testing

```bash
cd tasks/norgesgruppen
python test_local.py --zip submission.zip --quick     # smoke test (2 images)
python test_local.py --zip submission.zip --data data/yolo-3way  # held-out eval (pycocotools)
python test_local.py --data data/yolo-3way            # eval current models/best.pt
```

### Sandbox Pitfalls (Hard-won)

- **torch.load patch required**: PyTorch 2.6 + ultralytics 8.1.0 — must monkey-patch `weights_only=False` before importing YOLO
- **Never use `model.half()`** on ultralytics YOLO objects — crashes sandbox (exit code 1)
- **WANDB_DISABLED=true** must be in subprocess env, not just in script
- **GCP VMs**: install `numpy==1.26.4` BEFORE opencv (order matters). Use `systemd-run` not `nohup`
- **Local scores unreliable** for full-dataset models (test set leaked). Only live score matters

### Best Known Configuration

- **Model**: YOLOv8l, cls=1.5 loss weight, full dataset, 300 epochs
- **Inference**: 3-pass WBF (960 + 1280 + 1280+TTA), weights [1,2,3]
- **WBF params**: iou_thr=0.65, skip_box_thr=0.01, conf_type=avg
- **Precision**: bbox round(2), score round(6)
- **Best live**: 0.9208 (3-model diverse ensemble)

### What Doesn't Work (Don't Retry)

- Two-stage YOLO + classifier (ConvNeXt): hurts classification on unseen data
- SWA weight averaging: produces degenerate models
- conf_type='max': consistently worst in all sweeps
- Different seeds/optimizers: score ±0.005 randomly, not worth submissions
