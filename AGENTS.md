# NM i AI 2026 — Agent Navigation

**Competition repo. 3 AI tasks (CV, ML, NLP), 69 hours, agent-first.**

## Quick Start

```bash
cd ai-nm-2026
bash scripts/setup.sh          # install deps
uvicorn tasks/cv/api:app       # run a task API
pytest tasks/cv/tests/          # test a task
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

## Competition Rules (Summary)

Read `RULES.md` for full rules. Key points:
- Code must be public, MIT licensed
- No hardcoded or pre-computed responses
- AI assistants explicitly allowed
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

## GCP Workflow

```bash
scripts/gcp/create-vm.sh cv medium   # provision GPU VM
scripts/gcp/deploy-task.sh cv        # deploy task code
scripts/gcp/train-task.sh cv         # run training
scripts/gcp/status.sh                # check all endpoints
```
