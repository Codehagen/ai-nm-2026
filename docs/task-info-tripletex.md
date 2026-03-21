# Tripletex — AI Accounting Agent

Build an AI agent that completes accounting tasks in Tripletex. You receive a task prompt (in one of 7 languages), use the Tripletex API to execute it, and get scored on correctness and efficiency.

- **Task type**: AI agent (HTTPS endpoint)
- **Weight**: 25% of total score
- **Timeout**: 5 minutes per submission
- **Rate limits**: Verified teams: 3 concurrent, 5 per task/day; Unverified: 1 concurrent, 2 per task/day

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
| Scoring | Field-by-field checks + efficiency bonus, best score per task kept |
| Score range | 0.0 (failed) — up to 6.0 (perfect Tier 3 + best efficiency) |
| Files | Some tasks include PDF or image attachments |

## Quick Start

1. Build a `/solve` endpoint that accepts POST requests with a task prompt and Tripletex credentials
2. Use an LLM to interpret the prompt and decide which API calls to make
3. Call the Tripletex API using the provided proxy URL and session token
4. Return `{"status": "completed"}` when done
5. Submit your endpoint URL at `https://app.ainm.no/submit/tripletex`

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
| Tier 3 | ×3 | Bank reconciliation from CSV, error correction in ledger, year-end closing |

## Efficiency Bonus

If correctness = 1.0, you get an efficiency bonus (up to **double** the tier score):

- **Call efficiency** — fewer WRITE calls (POST, PUT, DELETE, PATCH) = higher bonus. **GET requests are NOT counted** — read as much as you need.
- **Error cleanliness** — fewer 4xx errors on WRITE calls = higher bonus

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

Each submission gets one task, weighted toward tasks you've attempted less. Tasks are grouped into three tiers:

- **Tier 1** — foundational tasks (e.g., create employee, create customer, create invoice)
- **Tier 2** — multi-step workflows (e.g., invoice with payment, credit notes, project billing)
- **Tier 3** — complex scenarios (e.g., bank reconciliation from CSV, error correction in ledger, year-end closing)

Each task has 56 unique variants (7 languages × 8 data sets), so you'll rarely see the same prompt twice.

## Tier Release Schedule

Tasks are released in tiers throughout the competition:

- **Tier 1** — available from competition start
- **Tier 2** — opens early Friday. Check the competition page for updates.
- **Tier 3** — opens early Saturday. Check the competition page for updates.

This gives you time to build a solid agent on simpler tasks before tackling the harder ones.

## Rate Limits

| Limit | Verified teams | Unverified teams |
|-------|---------------|-----------------|
| Concurrent submissions | 3 | 1 |
| Per task per day | 10 | 3 |

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
2. Enter the email shown on your sandbox card
3. Click "Forgot password" to set up your Visma Connect account (first time only)
4. Set a password and log in

Once you've set up Visma Connect, the same credentials work for all Tripletex test accounts — including the ones created during competition submissions.

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

## What You Can Do

The sandbox is a full Tripletex test environment. Use it to:

- **Explore the API** — try creating employees, customers, invoices, and more
- **See the UI** — understand what the accounting data looks like in the interface
- **Test your agent** — point your `/solve` endpoint at the sandbox to debug
- **Learn the data model** — see how resources relate to each other

## Sandbox vs Competition

| | Sandbox | Competition |
|---|---|---|
| Account | Persistent, yours to keep | Fresh account per submission |
| API access | Direct to Tripletex | Via authenticated proxy |
| Data | Accumulates over time | Starts empty each time |
| Scoring | None | Automated field-by-field |

**Tips:**
- Create test data manually in the UI, then query via API to understand the response format
- The sandbox token expires **March 31, 2026**
- Each team gets one sandbox — all team members share it

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

Run with:
```bash
pip install fastapi uvicorn requests
uvicorn main:app --host 0.0.0.0 --port 8000
```

Expose locally via HTTPS for testing:
```bash
npx cloudflared tunnel --url http://localhost:8000
```

## Tripletex API Examples

List employees:
```python
resp = requests.get(
    f"{base_url}/employee",
    auth=auth,
    params={"fields": "id,firstName,lastName,email"}
)
employees = resp.json()["values"]
```

Create a customer:
```python
resp = requests.post(
    f"{base_url}/customer",
    auth=auth,
    json={
        "name": "Acme AS",
        "email": "post@acme.no",
        "isCustomer": True
    }
)
customer_id = resp.json()["value"]["id"]
```

Create an invoice:
```python
today = "2026-03-03"
resp = requests.post(
    f"{base_url}/invoice",
    auth=auth,
    json={
        "invoiceDate": today,
        "invoiceDueDate": today,
        "customer": {"id": customer_id},
        "orders": [{"id": order_id}]
    }
)
```

Search for a specific entity:
```python
resp = requests.get(
    f"{base_url}/customer",
    auth=auth,
    params={
        "name": "Acme",
        "fields": "id,name,email",
        "count": 10
    }
)
matches = resp.json()["values"]
```

## Building an Effective Agent

1. **Parse the prompt** — Use an LLM to extract the task type, entity names, field values, and relationships from the prompt
2. **Handle files** — Some tasks include PDFs with invoices, contracts, or expense reports. Decode from base64 and extract relevant data
3. **Map to API calls** — Determine which Tripletex endpoints to call and in what order. Some tasks require creating prerequisites first
4. **Verify your work** — After creating entities, query back to confirm they exist with correct values
5. **Handle errors** — Tripletex returns detailed error messages. Parse them to retry with corrections

## Common Task Patterns

| Pattern | Example | API Flow |
|---------|---------|----------|
| Create single entity | "Create employee Ola Nordmann" | POST /employee |
| Create with linking | "Create invoice for customer" | GET /customer → POST /order → POST /invoice |
| Modify existing | "Add phone to contact" | GET /customer → PUT /customer/{id} |
| Delete/reverse | "Delete travel expense" | GET /travelExpense → DELETE /travelExpense/{id} |
| Multi-step setup | "Register payment" | POST /customer → POST /invoice → POST /payment |

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Wrong auth format | Use Basic Auth with username `0` and session token as password |
| 404 Not Found | Wrong endpoint path | Check the Tripletex v2 API docs for correct paths |
| 422 Validation Error | Missing required fields | Read error message — it specifies which fields are required |
| Empty values array | No results found | Check search parameters, try broader search |
| Timeout (5 min) | Agent too slow | Optimize API calls, reduce unnecessary requests |

## Tips

- Sandbox starts empty — you may need to create prerequisites (customer, product) before creating invoices
- Use `?fields=*` to see all available fields on an entity
- Some tasks require enabling modules first (e.g., department accounting)
- Norwegian characters (æ, ø, å) work fine in API requests — send as UTF-8
- All API calls through the proxy are logged — use them for debugging in the submissions view
- Prompts come in 7 languages (nb, en, es, pt, nn, de, fr) — your agent should handle all of them

## Optimizing for Efficiency

Your score can go above 1.0 if you achieve perfect correctness with minimal API calls and zero errors. Higher tiers have higher score ceilings (up to 6.0 for Tier 3). Tips:

- **Plan before calling** — Parse the prompt fully before making API calls. Understand what needs to be created/modified before starting
- **Avoid trial-and-error** — Every 4xx error (400, 404, 422) reduces your efficiency bonus. Validate inputs before sending
- **Minimize GET calls** — Don't fetch entities you don't need. If you created something, you already know its ID from the response
- **Batch where possible** — Some Tripletex endpoints accept lists. Use them instead of multiple individual calls
- **Read error messages** — If a call fails, the Tripletex error message tells you exactly what's wrong. Fix it in one retry, not several
