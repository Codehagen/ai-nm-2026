# /map-task — Map Competition Task Number After a Single Run

After running ONE submission and checking the dashboard, use this to record which task number was assigned.

## Usage

`/map-task <task_number> [score]`

Example: `/map-task 19 1.77`

## Steps

### 1. Find the latest solve entry on the GCP VM

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "tail -1 ~/task1/logs/solves.jsonl"
```

### 2. Get the latest request log to check for files

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "ls -t ~/task1/logs/requests/ | head -1"
```

Then read it:

```bash
ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "cat ~/task1/logs/requests/$(ls -t ~/task1/logs/requests/ | head -1) | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'Files: {len(d.get(\\\"files\\\", []))}'); [print(f'  {f[\\\"filename\\\"]} ({f[\\\"mime_type\\\"]})') for f in d.get('files',[])]\"" 2>/dev/null
```

### 3. Update the task map

Read `tasks/1/logs/task-map/tasks.json`, update the entry for `$ARGUMENTS` (the task number) with:
- `taskType` from the solve log
- `description` from the first 100 chars of the prompt
- `hasFiles` from the request log
- `score` if provided as second argument
- `tier` from the score (T1: max 2, T2: max 4, T3: max 6)

### 4. If the task had files, download them locally

```bash
LATEST=$(ssh -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44 "ls -t ~/task1/logs/requests/ | head -1")
scp -i ~/.ssh/gcp_ainm -o StrictHostKeyChecking=no walgermo@34.158.87.44:~/task1/logs/requests/$LATEST tasks/1/logs/task-map/task-${TASK_NUM}-request.json
```

Then extract files from the request JSON:

```bash
python3 -c "
import json, base64, os
d = json.load(open('tasks/1/logs/task-map/task-${TASK_NUM}-request.json'))
os.makedirs('tasks/1/logs/task-map/files', exist_ok=True)
for f in d.get('files', []):
    path = f'tasks/1/logs/task-map/files/task-{TASK_NUM}-{f[\"filename\"]}'
    open(path, 'wb').write(base64.b64decode(f['content_base64']))
    print(f'Saved: {path} ({len(base64.b64decode(f[\"content_base64\"]))} bytes)')
"
```

### 5. Show summary

Print what was mapped and the current task overview table.
