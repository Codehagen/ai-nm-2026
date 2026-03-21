# /debug-task — Deep-Dive Task Debugging with Sandbox Verification

Combined workflow: fetch logs → identify failure → replay against sandbox → verify via API + browse UI → diagnose → fix.

## Context

- **GCP VM logs**: SSH to `walgermo@34.158.87.44` with `-i ~/.ssh/gcp_ainm`
- **Sandbox API**: `https://kkpqfuj-amager.tripletex.dev/v2` (Basic Auth: `0:<session_token>`)
- **Sandbox Web UI**: `https://kkpqfuj-amager.tripletex.dev` (login: christer.hagen@gmail.com)
- **Competition dashboard**: `https://app.ainm.no/submit/tripletex` (shows per-check pass/fail)
- **Local agent**: `http://localhost:9053/solve`
- **Task map**: `tasks/1/logs/task-map/tasks.json`
- **Replay**: `cd tasks/1 && pnpm replay --index N` or `pnpm replay --prompt "text"`

## Steps

### Phase 1: Identify the Target Task

If $ARGUMENTS is a task number (e.g. "19"), use that task.
If $ARGUMENTS is "latest" or empty, fetch the latest failed run from GCP VM logs.

```bash
# Get latest log entries from VM
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "tail -5 ~/task1/logs/solves.jsonl"
```

Read `tasks/1/logs/task-map/tasks.json` to find task metadata (tier, score, taskType, description).

Report:
```
Target: Task XX (Tier Y, current score: Z/max, tries: N)
Type: <taskType>
Description: <first 100 chars>
Has files: yes/no
```

### Phase 2: Fetch Detailed Logs from GCP VM

Get the latest detail log for this task type:
```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "cat ~/task1/logs/details/\$(ls -t ~/task1/logs/details/ | head -1)"
```

Also get the request log (which has the actual prompt + files):
```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "cat ~/task1/logs/requests/\$(ls -t ~/task1/logs/requests/ | head -1)"
```

Render API call flow:
```
─── task: salary (Task 19, T3, 1.77/6.0, 24s) ─────────────────────────
  POST /dept ✅ → POST /employee ✅ → GET /division ✅ → POST /division ✅
  → POST /employment ✅ → GET /salary/type ✅ → POST /salary/spec ❌ 422
                                                  └─ "type not found"
```

### Phase 3: Browse Competition Dashboard

Use /browse to check the competition dashboard for per-check results:

```bash
$B goto https://app.ainm.no/submit/tripletex
```

Look at "Recent Results" for matching task. Click to expand and read the check breakdown:
- Which checks passed? Which failed?
- How many points per check?
- What's the max score for this task?

Screenshot the expanded result for reference.

### Phase 4: Replay Against Sandbox + API Verification

Replay the failed prompt against the sandbox to see what the agent creates:

```bash
# If we have the prompt from the request log, replay it
cd tasks/1
TRIPLETEX_SESSION_TOKEN=<from .env.local or sandbox card> pnpm replay --prompt "<prompt from log>"

# Or replay by index from local logs
pnpm replay --index <N>
```

After replay completes, **verify what was created in the sandbox** using the Tripletex API:

```bash
# Check employees
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/employee?fields=id,firstName,lastName,email,dateOfBirth,department&count=5&sorting=-id" | python3 -m json.tool

# Check customers
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/customer?fields=id,name,email,organizationNumber&count=5&sorting=-id" | python3 -m json.tool

# Check invoices
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/invoice?fields=id,invoiceNumber,customer,amount,invoiceDate&invoiceDateFrom=2020-01-01&invoiceDateTo=2030-01-01&count=5&sorting=-id" | python3 -m json.tool

# Check projects
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/project?fields=id,name,customer,projectManager&count=5&sorting=-id" | python3 -m json.tool

# Check supplier invoices
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/supplierInvoice?fields=id,supplier,invoiceNumber,invoiceDate,amount&count=5&sorting=-id" | python3 -m json.tool

# Check salary specs
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/salary/specification?fields=id,employee,salaryType,rate,count&count=10&sorting=-id" | python3 -m json.tool

# Check vouchers
curl -s -u "0:$TOKEN" "https://kkpqfuj-amager.tripletex.dev/v2/ledger/voucher?fields=id,description,date,postings&dateFrom=2020-01-01&dateTo=2030-01-01&count=5&sorting=-id" | python3 -m json.tool
```

Pick the relevant endpoints based on task type. Compare created entities against what the prompt asked for.

### Phase 5: Browse Sandbox UI (Visual Verification)

Use /browse to visually inspect what was created in the Tripletex UI:

```bash
$B goto https://kkpqfuj-amager.tripletex.dev
```

Navigate to the relevant section:
- **Employees**: Ansatte → list → check newest entry
- **Customers**: Kunder → check newest
- **Invoices**: Faktura → Utgående faktura → check newest
- **Projects**: Prosjekter → check newest
- **Supplier invoices**: Faktura → Inngående faktura → check newest
- **Salary**: Lønn → Lønnskjøring → check payslips

Screenshot relevant pages for evidence. Compare what's in the UI against what the prompt asked for.

### Phase 6: Diagnose Root Cause

Cross-reference three data sources:
1. **Agent logs**: What API calls did the agent make? Any errors?
2. **Sandbox API**: What entities actually exist? Are fields correct?
3. **Dashboard checks**: Which specific checks passed/failed?

Common root causes:
| Symptom | Root Cause | Fix Area |
|---------|-----------|----------|
| Entity not found | Agent created nothing or wrong entity | Classifier or extraction |
| Wrong name/email | Extraction error from prompt | extract.ts prompt or schema |
| Missing field (dateOfBirth, etc.) | Default not applied | helpers.ts or executor |
| Wrong amount | VAT calculation error | Schema or executor math |
| Extra entities created | Classifier misroute to wrong task type | task-classifier.ts |
| 0 checks passed | Agent timed out or credential failure | model.ts timeout or preflight |

Report findings:
```
DIAGNOSIS for Task XX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prompt asked for: [summary]
Agent created:    [what was actually created]
Scoring expects:  [what checks look for]

Check 1 (2pts): PASS — Employee found ✅
Check 2 (1pt):  FAIL — firstName mismatch ("Ola" expected, "Unknown" created)
Check 3 (1pt):  FAIL — email not set
Check 4 (5pts): FAIL — admin role not assigned

Root cause: Extraction returned firstName: "Unknown" because PDF was not parsed
Fix: Update extract.ts salary instructions to handle this PDF format
File: tasks/1/src/orchestrator/extract.ts, line ~57
```

### Phase 7: Fix + Verify

If fixes are needed:
1. Make code changes locally
2. Run `cd tasks/1 && npx tsc --noEmit && npx vitest run`
3. Replay the same prompt against sandbox to verify the fix
4. Compare before/after API results
5. Redeploy to GCP VM if fix is confirmed

### Phase 8: Update Task Map

Update `tasks/1/logs/task-map/tasks.json` with any new information discovered:
- taskType (if not set)
- description (from prompt)
- hasFiles
- tier (from check count and scoring)
- Notes about what checks verify
