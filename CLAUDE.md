# Claude Code Instructions

Read `AGENTS.md` for full project navigation and golden rules.

## Local Dev

```bash
# Setup
cd ai-nm-2026
bash scripts/setup.sh

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
