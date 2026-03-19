# NM i AI 2026 — Competition Rules

Source: app.ainm.no

## Timeline

- **Start**: March 19, 2026 at 18:00 CET
- **End**: March 22, 2026 at 15:00 CET
- **Duration**: 69 hours

## Scoring

- 3 tasks, each scored 0-100 (normalized)
- Final score = average of all 3 task scores
- Equal weight across tasks
- **Breadth wins**: reliable solutions across all 3 tasks beats excellence in 1

## Code Requirements

- All code must be in a **public GitHub repository**
- Must use **MIT license**
- **No hardcoded or pre-computed responses** — solutions must reflect genuine model capabilities
- Code must be your own work (AI assistants explicitly allowed)

## Inference Constraints

- **No cloud API calls during inference** (OpenAI, Azure, Google AI, etc.)
- Models must run locally or on your own infrastructure
- Respect per-task timeout constraints
- FastAPI endpoint submission format expected

## What's Allowed

- AI coding assistants (Claude, Copilot, etc.)
- Pre-trained models and transfer learning
- Any open-source libraries
- Cloud compute for training (GCP, etc.)
- Ensemble methods

## What's Prohibited

- Cloud AI APIs at inference time
- Hardcoded/pre-computed responses
- Private repos (must be public)
- Non-MIT licenses

## Task Categories

1. **Computer Vision** — image-based task
2. **Machine Learning** — tabular/structured data task
3. **NLP / Language Models** — text-based task (Tripletex as provider)

## Sponsors

- NorgesGruppen (Grocery Bot)
- Tripletex (3rd task provider)
- Google Cloud (compute sponsorship)
