# Claude Code Instructions

Read `AGENTS.md` for full project navigation and golden rules.

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
