# /run-task — Full Single-Task Submission Pipeline

Complete workflow for running one competition task, mapping it, analyzing it, and improving.

## Prerequisites
- GCP VM running with ngrok tunnel (use `/tunnel` if not)
- ngrok URL: `https://hypertragical-birdie-unjocose.ngrok-free.dev` (persistent)
- Competition dashboard open at https://app.ainm.no/submit/tripletex
- Logs are ON THE VM, not local. SSH: `ssh -i ~/.ssh/gcp_ainm walgermo@<VM_IP>`

## Pipeline

### Phase 1: Before Snapshot

Ask the user:
> "Take a screenshot of the current task scores on the dashboard, then submit ONE task."

Wait for the user to provide:
1. A "before" screenshot of the task grid
2. Confirmation that they submitted

### Phase 2: After Snapshot + Identify Task

Ask the user:
> "Take a screenshot of the scores AFTER the submission. Which task number changed?"

The user provides:
1. An "after" screenshot
2. The task number that changed (e.g. "Task 19")

### Phase 3: Map Task (`/map-task` logic)

Find the latest solve entry on the GCP VM:

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "tail -1 ~/task1/logs/solves.jsonl"
```

Get the request log to check for files:

```bash
LATEST=$(ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "ls -t ~/task1/logs/requests/ | head -1")
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "python3 -c \"import json; d=json.load(open('/root/task1/logs/requests/$LATEST' if __import__('os').path.exists('/root/task1/logs/requests/$LATEST') else '/home/walgermo/task1/logs/requests/$LATEST')); print(f'Files: {len(d.get(\\\"files\\\", []))}'); [print(f'  {f[\\\"filename\\\"]} ({f[\\\"mime_type\\\"]})') for f in d.get('files',[])]\"" 2>/dev/null
```

If the task has files, download them locally:

```bash
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44:~/task1/logs/requests/$LATEST tasks/1/logs/task-map/task-${TASK_NUM}-request.json
```

Extract attached files (PDFs, images, CSVs):

```bash
python3 -c "
import json, base64, os
d = json.load(open('tasks/1/logs/task-map/task-${TASK_NUM}-request.json'))
os.makedirs('tasks/1/logs/task-map/files', exist_ok=True)
for f in d.get('raw_files', []):
    name = f['filename'].replace('/', '_')
    path = f'tasks/1/logs/task-map/files/task-${TASK_NUM}-{name}'
    open(path, 'wb').write(base64.b64decode(f['content_base64']))
    print(f'Saved: {path}')
"
```

Update `tasks/1/logs/task-map/tasks.json` with the task number, taskType, prompt, score, tier, hasFiles.

### Phase 4: Analyze (`/check-logs` logic)

Read the detail log from the VM:

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "cat ~/task1/logs/details/$(ls -t ~/task1/logs/details/ | head -1)"
```

Analyze the API call flow. Render ASCII diagram:

```
─── task: salary (Task 19, T3, 1.77/6.0, 24s) ─────────────────────────
  POST /dept ✅ → POST /employee ✅ → GET /division ✅ → POST /division ✅
  → POST /employment ✅ → GET /salary/type ✅ → ❌ CRASHED: "type not found"
```

Report:
- What scored (fields matched)
- What's missing (fields not set)
- Root cause of errors
- Specific fix with file and function

### Phase 5: Fix + Redeploy

If fixes are needed:
1. Make code changes locally
2. Run `cd tasks/1 && npx tsc --noEmit && npx vitest run tests/model-helpers.test.ts`
3. Redeploy: `/tunnel`

### Phase 6: Report

Show comparison table:

```
Task XX: before → after
  Score: 1.77 → ???
  Calls: 7 → ???
  Errors: 0 → ???
  Missing fields: dateOfBirth, personnummer, ... → ???
```

Suggest: re-submit the same task to see improvement, or move to next priority task.
