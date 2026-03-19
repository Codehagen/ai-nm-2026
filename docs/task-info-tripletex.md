# Tripletex — AI Accounting Agent

Build an AI agent that completes accounting tasks in Tripletex. You receive a task prompt (in one of 7 languages), use the Tripletex API to execute it, and get scored on correctness and efficiency.

- **Task type**: AI agent (HTTPS endpoint)
- **Weight**: 25% of total score
- **Submissions**: Unlimited per day, 10 concurrent
- **Timeout**: 5 minutes per submission

## How It Works

1. Submit your HTTPS endpoint URL on the platform
2. We provision a fresh Tripletex sandbox account
3. We send a randomly selected accounting task to your `/solve` endpoint
4. Your agent reads the prompt, optionally processes attached files (PDFs, images)
5. Your agent calls the Tripletex API via a proxy to complete the task
6. We verify the result field-by-field against expected values
7. Your score updates on the rolling leaderboard

Each submission gets a brand new Tripletex account — you always start from scratch.

## Key Facts

| | |
|---|---|
| Task types | 30 different accounting tasks |
| Variants | 56 per task (7 languages × 8 data sets) |
| Languages | Norwegian, English, Spanish, Portuguese, Nynorsk, German, French |
| Timeout | 5 minutes per submission |
| API | Tripletex v2 REST API via authenticated proxy |
| Score range | 0.0 (failed) — up to 6.0 (perfect Tier 3 + best efficiency) |
| Files | Some tasks include PDF or image attachments |

## Task Categories

- **Employees** — Create employees, set roles, update contact info
- **Customers & Products** — Register customers, create products
- **Invoicing** — Create invoices, register payments, issue credit notes
- **Travel Expenses** — Register or delete travel expense reports
- **Projects** — Create projects linked to customers
- **Corrections** — Delete or reverse incorrect entries
- **Departments** — Create departments, enable accounting modules

Tasks range from single-API-call to multi-step workflows.

---

# Endpoint Specification

## `/solve` Endpoint

**Method:** POST | **Content-Type:** application/json | **Timeout:** 300 seconds

### Request Format

```json
{
  "prompt": "Opprett en ansatt med navn Ola Nordmann, ola@example.org. Han skal være kontoadministrator.",
  "files": [
    {
      "filename": "faktura.pdf",
      "content_base64": "JVBERi0xLjQg...",
      "mime_type": "application/pdf"
    }
  ],
  "tripletex_credentials": {
    "base_url": "https://tx-proxy.ainm.no/v2",
    "session_token": "abc123..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | The task in natural language (one of 7 languages) |
| `files` | array | Attachments (PDFs, images) — may be empty |
| `files[].filename` | string | Original filename |
| `files[].content_base64` | string | Base64-encoded file content |
| `files[].mime_type` | string | MIME type |
| `tripletex_credentials.base_url` | string | Proxy API URL |
| `tripletex_credentials.session_token` | string | Session token for authentication |

### Response Format

```json
{"status": "completed"}
```

## Authentication

**Basic Auth** with username `0` and session token as password:

```python
import requests
response = requests.get(
    f"{base_url}/employee",
    auth=("0", session_token),
    params={"fields": "id,firstName,lastName,email"}
)
```

## API Key (Optional)

If you set an API key when submitting, it's sent as `Authorization: Bearer <your-api-key>`.

## Requirements

- Endpoint must be **HTTPS**
- Must respond within **5 minutes**
- Must return `{"status": "completed"}` with HTTP 200
- All Tripletex API calls must go through the provided `base_url` (proxy)

## Tripletex API Reference

Common endpoints:

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/employee` | GET, POST, PUT | Manage employees |
| `/customer` | GET, POST, PUT | Manage customers |
| `/product` | GET, POST | Manage products |
| `/invoice` | GET, POST | Create and query invoices |
| `/order` | GET, POST | Manage orders |
| `/travelExpense` | GET, POST, PUT, DELETE | Travel expense reports |
| `/project` | GET, POST | Manage projects |
| `/department` | GET, POST | Manage departments |
| `/ledger/account` | GET | Query chart of accounts |
| `/ledger/posting` | GET | Query ledger postings |
| `/ledger/voucher` | GET, POST, DELETE | Manage vouchers |

**API tips:**
- Use `fields` to select specific fields: `?fields=id,firstName,lastName,*`
- Use `count` and `from` for pagination: `?from=0&count=100`
- List responses wrapped: `{"fullResultSize": N, "values": [...]}`
- DELETE uses ID in URL: `DELETE /employee/123`

---

# Scoring

## Field-by-Field Verification

Each task has specific checks worth different point values. Example for "Create employee" (max 10 points):

| Check | Points |
|-------|--------|
| Employee found | 2 |
| Correct first name | 1 |
| Correct last name | 1 |
| Correct email | 1 |
| Administrator role assigned | 5 |

Raw score normalized: `correctness = points_earned / max_points`

## Tier Multiplier

| Tier | Multiplier | Example tasks |
|------|-----------|---------------|
| Tier 1 | ×1 | Create employee, create customer |
| Tier 2 | ×2 | Create invoice, register payment |
| Tier 3 | ×3 | Complex multi-step workflows |

## Efficiency Bonus

If correctness = 1.0, you get an efficiency bonus (up to **double** the tier score):

- **Call efficiency** — fewer API calls = higher bonus
- **Error cleanliness** — fewer 4xx errors = higher bonus

| Scenario (Tier 2 task) | Score |
|------------------------|-------|
| Failed all checks | 0.0 |
| 80% of checks passed | 1.6 |
| Perfect, many errors/extra calls | ~2.1 |
| Perfect, efficient, few errors | ~2.6 |
| Perfect, best efficiency, zero errors | 4.0 |

Efficiency benchmarks recalculated every 12 hours.

## Best Score Per Task

- Best score per task is kept forever
- Bad runs never lower your score
- 30 tasks track independently
- **Leaderboard** = sum of best scores across all task types

## Task Assignment

Each submission gets one task, weighted toward tasks you've attempted less. 56 variants per task (7 languages × 8 data sets).

## Rate Limits

| Limit | Value |
|-------|-------|
| Concurrent submissions | 10 |
| Per day | Unlimited |

---

# Sandbox Account

Every team gets a free Tripletex sandbox to explore before competing.

## Getting Your Sandbox

1. Go to the Tripletex submission page
2. Click "Get Sandbox Account"
3. Provisioned instantly

You get: UI URL, API base URL, session token.

## Web UI Login

1. Go to `https://kkpqfuj-amager.tripletex.dev`
2. Enter the email from sandbox card
3. Click "Forgot password" to set up Visma Connect (first time)
4. Same credentials work for all test accounts

## API Usage

```python
import requests
BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2"
SESSION_TOKEN = "your-session-token-here"

response = requests.get(
    f"{BASE_URL}/employee",
    auth=("0", SESSION_TOKEN),
    params={"fields": "id,firstName,lastName,email"}
)
```

## Sandbox vs Competition

| | Sandbox | Competition |
|---|---|---|
| Account | Persistent | Fresh per submission |
| API access | Direct | Via proxy |
| Data | Accumulates | Starts empty |
| Scoring | None | Automated |

---

# Examples

## Minimal `/solve` Endpoint

```python
import base64
from pathlib import Path
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.post("/solve")
async def solve(request: Request):
    body = await request.json()
    prompt = body["prompt"]
    files = body.get("files", [])
    creds = body["tripletex_credentials"]

    base_url = creds["base_url"]
    token = creds["session_token"]
    auth = ("0", token)

    for f in files:
        data = base64.b64decode(f["content_base64"])
        Path(f["filename"]).write_bytes(data)

    # TODO: Use an LLM to interpret the prompt and execute
    # the appropriate Tripletex API calls

    return JSONResponse({"status": "completed"})
```

Run: `uvicorn main:app --host 0.0.0.0 --port 8000`
Expose: `npx cloudflared tunnel --url http://localhost:8000`

## Common Task Patterns

| Pattern | Example | API Flow |
|---------|---------|----------|
| Create single entity | "Create employee Ola Nordmann" | POST /employee |
| Create with linking | "Create invoice for customer" | GET /customer → POST /order → POST /invoice |
| Modify existing | "Add phone to contact" | GET /customer → PUT /customer/{id} |
| Delete/reverse | "Delete travel expense" | GET /travelExpense → DELETE /travelExpense/{id} |
| Multi-step setup | "Register payment" | POST /customer → POST /invoice → POST /payment |

## Tips

- Sandbox starts empty — create prerequisites before invoices
- Use `?fields=*` to see all available fields
- Some tasks require enabling modules first (e.g., department accounting)
- Norwegian characters (æ, ø, å) work fine — send as UTF-8
- All API calls through proxy are logged — use for debugging
- Prompts come in 7 languages — agent must handle all
- **Plan before calling** — parse prompt fully, avoid trial-and-error
- Every 4xx error reduces efficiency bonus
- Minimize GET calls — if you created something, you know its ID
