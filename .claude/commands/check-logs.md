# /check-logs — Review Latest Tripletex Agent Logs

Analyze the most recent agent runs, diagnose failures, and propose fixes.

## Context

- Logs are at `tasks/1/logs/` — `solves.jsonl` (summary), `details/` (full API traces), `requests/` (raw incoming)
- GCP VM at `34.158.87.44` — SSH: `ssh -i ~/.ssh/gcp_ainm walgermo@34.158.87.44`
- VM logs: `ssh ... "tail -50 /tmp/api.log"` for server-side logs not captured locally
- Scoring: only WRITE calls (POST/PUT/DELETE) count for efficiency. GETs are free.
- Tier multipliers: T1=×1, T2=×2, T3=×3. Max score per task: tier × 2 (with efficiency bonus).

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
- `taskType` contains "failed" (orchestrator failure → LLM fallback)

### 3. Read detail logs for flagged entries

For each flagged entry, find the matching detail log in `tasks/1/logs/details/` by timestamp. Read it and analyze the full `toolCallDetails` array.

Look for these patterns:
- **Thrashing**: 3+ errors on the same endpoint path
- **Field hallucination**: `isClosed`, `amountIncVat`, `company`, `address` in GET fields params
- **Missing dates**: POST /order without orderDate/deliveryDate, empty date strings
- **Bank account not set up**: 422 with "bankkontonummer" message before invoice creation
- **Redundant GETs**: Multiple GET calls to the same endpoint (e.g. costCategory called 3+ times)
- **409 cascade**: Multiple 409 RevisionException errors
- **Classifier mismatch**: taskType doesn't match the prompt content
- **Unnecessary verification**: GET after PUT /:payment or /:send
- **Employee dateOfBirth missing**: 422 on POST /employee/employment with dateOfBirth error
- **File handling**: CSV not decoded, PDF data not extracted
- **Voucher/project misclass**: "dimension"/"dimensión" in prompt routed to wrong task type

### 4. Cross-reference with recent code changes

Read `tasks/1/src/model.ts` (lines 143-235 for adaptive guidance and error budget), `tasks/1/src/prompt-builder.ts` (recipe blocks), and `tasks/1/src/task-classifier.ts` (classifier logic) to check if existing mitigations should have caught the issue.

Also check orchestrator: `tasks/1/src/orchestrator/helpers.ts` (ensureEmployee, ensureDepartment) and `tasks/1/src/orchestrator/execute/*.ts` for executor-specific bugs.

### 5. Report findings

For each flagged entry, report:
- **Task**: taskType + first 80 chars of prompt
- **Result**: calls/errors/elapsed
- **Root cause**: what went wrong and why
- **Fix**: specific code change with file and function
- **Priority**: P0 (loses whole task), P1 (loses efficiency bonus), P2 (cosmetic)

### 6. Propose fixes

If there are actionable fixes:
- Show the exact file, function, and code change needed
- Ask the user if they want to apply the fixes
- If yes, make the changes, run `cd tasks/1 && npx vitest run tests/model-helpers.test.ts` to verify
- Then redeploy to GCP: `cd tasks/1 && tar --exclude=node_modules --exclude=logs --exclude='.env*' -czf /tmp/task1.tar.gz . && scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no /tmp/task1.tar.gz walgermo@34.158.87.44:~/task1.tar.gz && scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no .env.local walgermo@34.158.87.44:~/task1/.env.local`
- Then restart on VM: upload and run the redeploy script

If $ARGUMENTS is provided (e.g. a number like "3" or "5"), use that as the number of entries to analyze instead of the default flagged-only approach. If $ARGUMENTS is "all", analyze all entries from the last 24 hours.

### 7. Visualize API call flow

For each flagged entry, render an ASCII flow diagram showing the API call sequence. Use this format:

```
─── task: supplier-invoice (08:06, 18s, FAILED) ────────────────────────
  POST /supplier ✅ → GET /ledger/acct ✅ → GET /ledger/acct ✅ → POST /supplierInvoice ❌ 422
                                                                    └─ date: "" (empty!)
```

Rules:
- ✅ for ok: true, ❌ for ok: false (with status code)
- Show error details on a continuation line with └─
- For timeouts: show `⏱ TIMEOUT (Xs, 0 steps)`
- For long chains (>6 calls), wrap to next line with continuation indent
- Keep it compact — one task = 2-4 lines max

This renders directly in the terminal without external tools.

### 8. Check GCP VM logs (if local logs are stale)

If the latest local logs are old (>10 min) but a submission was recent, the logs may only be on the VM:

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "tail -30 /tmp/api.log"
```

This captures orchestrator console output, errors, and step-by-step progress that may not appear in the detail JSON logs.
