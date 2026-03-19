# NM i AI 2026 — Competition Rules

Source: https://app.ainm.no/rules (last checked March 19, 2026)

## Timeline

- **Kickoff & start**: Thursday March 19, 2026 at 18:00 CET
- **Deadline**: Sunday March 22, 2026 at 15:00 CET
- **Winners announced**: Sunday March 22, 2026 at ~17:00 CET
- **Duration**: 69 hours

The kickoff will be streamed nationwide. Competition is fully virtual.

In-flight submissions (queued or processing) at the deadline will be completed and scored normally.

## Prizes

| Placement | Prize |
|-----------|-------|
| 1st place | 400,000 NOK |
| 2nd place | 300,000 NOK |
| 3rd place | 200,000 NOK |
| Category X | 100,000 NOK |

Category X prize revealed at kickoff. Combinable with placement prizes.
Ties broken by submission timestamp.

## Prize Eligibility

Both requirements must be met before the deadline:

1. **Vipps verification** — all team members must complete Vipps verification (linked to Norwegian BankID)
2. **Public code repository** — MIT license (or equivalent permissive license), submitted via platform

Verified teams get higher submission rate limits and confirmed Google account eligibility.

## Teams

- 1 to 4 members per team
- Each person on one team only
- **Roster locks after first submission** in any main task — no adding/removing members after that
- Teams provide their own infrastructure and compute

## Tasks

Three independent AI challenges. Task types, scoring, submission formats, and rate limits revealed at kickoff.

Teams are not required to participate in all tasks but only accumulate points for tasks they submit to.

## Scoring

1. Each task's scores normalized to 0–100 by dividing by the highest score in that task
2. Overall score = average of three normalized task scores (equal weight: 33.33% each)
3. Tasks without submissions score 0
4. **Competing in all three tasks is strongly advantageous**

Leaderboard updates in real-time. Snapshot at deadline = preliminary rankings.
Official results published after code review and verification.

## Code Requirements

- Must be in a **public repository** (GitHub, GitLab, Bitbucket, etc.)
- Must use **MIT license** (or equivalent permissive)
- Must contain inference code, training scripts, and custom tooling
- Must demonstrate the work is original and produced by the team
- **No hardcoded or pre-computed responses** designed to game specific test cases

## What's Allowed

- AI coding assistants (ChatGPT, Claude, Copilot, etc.) — **explicitly permitted and encouraged**
- Publicly available models, datasets, research papers
- Open-source libraries
- Cloud compute for training
- Any hosting platform

## What's Prohibited

- Sharing code, model weights, or task-specific solutions between teams
- Sharing competition-specific observations that provide competitive advantage
- Hardcoded or pre-computed responses that don't reflect genuine model capabilities
- Submissions designed to manipulate scoring normalization
- Circumventing rate limits, cooldowns, or submission quotas
- Attacking platform infrastructure or other teams' endpoints
- Attempting to extract test data, ground truth, or evaluation logic
- Multiple accounts or teams per person
- Score falsification or result tampering

## Monitoring & Enforcement

Organizers actively monitor:
- Automated code similarity analysis across repos
- Submission pattern analysis (timing, frequency, score progression)
- Slack workspace moderation
- API call logs, query patterns, gameplay data

Consequences range from warning → prize ineligibility → score removal → platform ban.

**No formal appeals process** due to compressed 69-hour timeline. Teams may raise concerns but jury decisions are immediate and binding.

## Notes for Our Team

The following are our own constraints (not in official rules — task-specific rules TBD at kickoff):

- **Assume no cloud AI APIs at inference time** — task rules may prohibit this; safer to be self-contained
- **FastAPI + Pydantic** — our chosen API framework (official submission format TBD at kickoff)
- **Breadth wins** — reliable solutions across all 3 tasks beats excellence in 1 (from scoring formula)
