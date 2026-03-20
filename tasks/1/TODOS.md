# TODOs

## ~~Baseline versioning for test results~~ Done
Implemented in `scripts/replay.ts` — `getVersionInfo()` adds `modelId`, `gitCommit`, `promptHash`.

## ~~Mock Tripletex API~~ Done
44 unit tests + 8 conformance tests passing. Response shapes verified against real sandbox (2026-03-20). End-to-end tested with agent: customer, employee, invoice chain, project all work.

## Conformance: refresh golden files periodically
Run `SANDBOX_TOKEN=xxx pnpm test:conformance` to capture fresh responses from real sandbox. Golden files older than 7 days trigger a staleness warning. Last refreshed: 2026-03-20.
