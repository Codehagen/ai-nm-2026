# /check-logs — Review Latest Tripletex Agent Logs

Analyze the most recent agent runs, diagnose failures, and propose fixes.

## Steps

### 1. Load the latest solve entries

Read the last 10 lines from the summary log to get an overview:

```bash
tail -10 tasks/1/logs/solves.jsonl
```

Parse each line and display a table with: timestamp, status, taskType, apiCalls, apiErrors, elapsedMs, error (if any).

### 2. Identify failures and anomalies

Flag any entries where:
- `status` is "error" or "timeout"
- `apiErrors` > 2
- `elapsedMs` > 80000 (close to timeout)
- `apiCalls` is 0 (model never started)
- All calls returned 403 (credentials issue)

### 3. Read detail logs for flagged entries

For each flagged entry, find the matching detail log in `tasks/1/logs/details/` by timestamp. Read it and analyze the full `toolCallDetails` array.

Look for these patterns:
- **Thrashing**: 3+ errors on the same endpoint path
- **Field hallucination**: `isClosed`, `amountIncVat`, `company`, `address` in GET fields params
- **Missing deliveryDate**: POST /order without deliveryDate
- **Bank account not set up**: 422 with "bankkontonummer" message before invoice creation
- **Redundant GETs**: Multiple GET calls to the same endpoint (e.g. costCategory called 3+ times)
- **409 cascade**: Multiple 409 RevisionException errors
- **Classifier mismatch**: taskType doesn't match the prompt content
- **Unnecessary verification**: GET after PUT /:payment or /:send

### 4. Cross-reference with recent code changes

Read `tasks/1/src/model.ts` (lines 143-235 for adaptive guidance and error budget), `tasks/1/src/prompt-builder.ts` (recipe blocks), and `tasks/1/src/task-classifier.ts` (classifier logic) to check if existing mitigations should have caught the issue.

### 5. Report findings

For each flagged entry, report:
- **Task**: taskType + first 80 chars of prompt
- **Result**: calls/errors/elapsed
- **Root cause**: what went wrong and why
- **Fix**: specific code change in model.ts, prompt-builder.ts, or task-classifier.ts
- **Priority**: P0 (loses whole task), P1 (loses efficiency bonus), P2 (cosmetic)

### 6. Propose fixes

If there are actionable fixes:
- Show the exact file, function, and code change needed
- Ask the user if they want to apply the fixes
- If yes, make the changes and run `cd tasks/1 && npx vitest run tests/model-helpers.test.ts` to verify

If $ARGUMENTS is provided (e.g. a number like "3" or "5"), use that as the number of entries to analyze instead of the default flagged-only approach. If $ARGUMENTS is "all", analyze all entries from the last 24 hours.
