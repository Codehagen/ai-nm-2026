# NM i AI 2026

**Norway's National AI Championship 2026** — 69-hour AI competition, March 19–22.

**Prize pool**: 1,000,000 NOK | **Team**: Solo competitor

## Results

| Task | Description | Tech | Best Score |
|------|-------------|------|------------|
| **NorgesGruppen** | Grocery product detection (object detection) | YOLOv8l + 3-model WBF ensemble | **0.9208** |
| **Astar Island** | Terrain mapping & pathfinding | GBT models + A* search | — |
| **Tripletex** | Accounting agent (PDF/invoice processing) | TypeScript + LLM orchestrator | — |

## Project Structure

```
├── tasks/
│   ├── norgesgruppen/       # Object detection (YOLOv8, WBF ensemble)
│   ├── astar-island/        # Terrain mapping & pathfinding
│   ├── 1/                   # Tripletex accounting agent (TypeScript)
│   ├── cv/                  # CV task template (port 9050)
│   ├── ml/                  # ML task template (port 9051)
│   ├── nlp/                 # NLP task template (port 9052)
│   └── template/            # Reference template
├── shared/                  # Cross-task utilities
├── scripts/
│   ├── setup.sh             # Environment setup
│   ├── validate.sh          # Pre-submit validation
│   └── gcp/                 # GPU VM fleet management
└── docs/                    # Strategy, task analysis, exec plans
```

## NorgesGruppen — Best Score: 0.9208

3-model diverse YOLOv8l ensemble with Weighted Box Fusion.

**Ensemble models** (backed up as [GitHub Release](https://github.com/Codehagen/ai-nm-2026/releases/tag/v0.9208-ensemble)):
- `model_a` — seed=35, local mAP 0.9747
- `model_b` — seed=25, local mAP 0.9656
- `model_c` — seed=30, local mAP 0.9639

**Inference**: 3-pass WBF (960 + 1280 + 1280+TTA), weights [1,2,3], iou_thr=0.65, skip_box_thr=0.01, conf_type=avg

**What didn't work**: Two-stage YOLO+classifier, SWA weight averaging, conf_type='max', seed/optimizer variants.

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | Python 3.11+, TypeScript (Tripletex) |
| API | FastAPI + Pydantic |
| ML | PyTorch, Ultralytics YOLOv8, scikit-learn, XGBoost |
| Compute | GCP (T4/L4/A100), Vertex AI |
| Package mgr | uv (Python), pnpm (TypeScript) |
| AI assistants | Claude Code, autoresearch loops |

## GCP Compute

```bash
scripts/gcp/fleet-up.sh baseline --spot    # 3 VMs: cv=L4, ml=T4, nlp=L4
scripts/gcp/deploy-task.sh cv              # deploy to VM
scripts/gcp/status.sh                      # fleet status
scripts/gcp/teardown.sh                    # tear down everything
```

| Tier | GPU | VRAM | Cost/hr | Spot |
|------|-----|------|---------|------|
| Light | T4 | 16GB | ~$0.35 | ~$0.11 |
| Medium | L4 | 24GB | ~$0.70 | ~$0.21 |
| Heavy | A100 | 40GB | ~$2.95 | ~$0.89 |

## Quick Start

```bash
bash scripts/setup.sh
source .venv/bin/activate
cd tasks/norgesgruppen && python run_ensemble.py  # run winning inference
```

## License

MIT — code must be public per competition rules.
