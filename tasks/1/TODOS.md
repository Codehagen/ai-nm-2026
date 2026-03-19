# TODOs

## Baseline versioning for test results
**What:** Add model ID, system prompt hash, and git commit hash to each test-results.jsonl entry.
**Why:** Without versioning, comparing test results across model/prompt changes is noise — you can't tell if a regression was caused by a prompt change or sandbox state.
**Context:** Currently test-results.jsonl only tracks per-test metrics (calls, errors, time). Adding `modelId`, `gitCommit`, and optionally a hash of system-prompt.ts would make comparisons meaningful over time. ~5 lines of code in replay.ts.
**Depends on:** Test runner (replay.ts rewrite) must be completed first.
