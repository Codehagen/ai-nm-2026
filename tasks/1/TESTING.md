# Testing — Task 1 (Tripletex Agent)

## Quick Start

```bash
cd tasks/1
pnpm install

# Unit tests (no network, ~1s)
pnpm test

# Conformance tests against real sandbox (updates golden files)
SANDBOX_TOKEN=<your-token> pnpm test:conformance

# Conformance tests offline (compares mock vs existing golden files)
pnpm test:conformance

# TypeScript type check
pnpm typecheck
```

## End-to-End Testing (Agent + Mock)

This is the main way to test the agent locally — send real prompts through Claude, which calls the mock API. No sandbox quota used, unlimited retries.

```bash
# Terminal 1: start mock Tripletex on :9054
pnpm mock:start

# Terminal 2: start agent on :9053 (needs AI_GATEWAY_API_KEY in .env.local)
source .env.local && export AI_GATEWAY_API_KEY && pnpm start

# Terminal 3: send a test prompt
curl -s -X POST http://localhost:9053/solve \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Opprett en kunde med navn Acme AS, e-post post@acme.no og organisasjonsnummer 987654321.",
    "files": [],
    "tripletex_credentials": {
      "base_url": "http://localhost:9054",
      "session_token": "mock-session-token"
    }
  }'
# → {"status":"completed"}

# Inspect what the agent created
curl -s -u "0:mock-session-token" http://localhost:9054/customer

# Reset mock state between tests
curl -s -X POST http://localhost:9054/_reset
```

### Verified End-to-End Workflows

These have been tested and confirmed working (agent → mock):

| Workflow | Prompt | API Calls | Errors |
|----------|--------|-----------|--------|
| Create customer | "Opprett en kunde med navn Nordlys AS..." | 1 | 0 |
| Create employee | "Opprett en ansatt med navn Erik Hansen..." | 5 | 1 |
| Full invoice chain | "Opprett en faktura for kunde Acme AS..." | 8 | 0 |
| Create project | "Create a project called Website Redesign..." | 5 | 0 |

### Using Replay

If you have logged prompts from previous runs (in `logs/`), replay them against the mock:

```bash
# Replay against mock (no sandbox token needed)
pnpm replay:mock

# Replay a specific prompt
pnpm replay:mock --prompt "Opprett en ansatt med navn Ola Nordmann"

# Replay all previously failed prompts
pnpm replay:mock --all-failed
```

## End-to-End Testing (Agent + Real Sandbox)

The sandbox has **no rate limit** — you can test as much as you want. Only competition submissions are rate-limited (4/task/day).

```bash
# Terminal 1: start agent on :9053
source .env.local && export AI_GATEWAY_API_KEY && pnpm start

# Terminal 2: send a test prompt against real sandbox
curl -s -X POST http://localhost:9053/solve \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Opprett en kunde med navn Test AS og organisasjonsnummer 123456789.",
    "files": [],
    "tripletex_credentials": {
      "base_url": "https://kkpqfuj-amager.tripletex.dev/v2",
      "session_token": "<your-session-token>"
    }
  }'

# Or use replay with env vars
TRIPLETEX_SESSION_TOKEN=<your-token> pnpm replay --prompt "Opprett en kunde med navn Test AS"
```

### Sandbox vs Mock vs Competition

| | Mock (:9054) | Sandbox | Competition |
|---|---|---|---|
| State | Fresh every `/_reset` | Accumulates forever | Fresh every submission |
| Rate limit | None | None | 4/task/day |
| Speed | <1ms/call | ~200-1500ms/call | ~200ms/call |
| Offline | Yes | No | No |
| Validation | Basic (required fields, refs) | Full Tripletex rules | Full Tripletex rules |
| Cost | Free | Free | Free (but limited attempts) |

**When to use what:**
- **Mock** — fast iteration on agent logic, prompt tuning, unit tests
- **Sandbox** — validate against real API behavior, check response shapes
- **Competition** — only when confident, limited attempts

### Sandbox Details

- URL: `https://kkpqfuj-amager.tripletex.dev/v2`
- Session token: set in competition platform sandbox card
- Token expires: March 31, 2026
- Data persists — everything accumulates (47 customers, 21 employees, etc.)
- Admin employee ID: `18443378` (Christer Hagen)

## Mock Tripletex API

In-memory mock of the Tripletex v2 REST API. Response shapes verified against real sandbox (2026-03-20).

### Architecture

```
src/mock/
├── server.ts         Hono app on :9054, Basic Auth, mounts all routes
├── store.ts          EntityStore: Maps, auto-increment IDs (30000001+), version tracking
├── seed.ts           Default state matching real Tripletex fresh account
├── crud-factory.ts   Generic GET/POST/PUT/DELETE route generator
├── entities.ts       12 entity configs with required fields, search, ref validation
├── custom-routes.ts  Invoice actions (:payment, :send, :createCreditNote), entitlements
└── helpers.ts        Response envelopes, validation errors (matches real API shape)
```

### Seed Data

| Entity | ID | Details |
|--------|----|---------|
| Admin employee | 30000001 | "Admin Bruker", userType: null |
| Ledger account 1920 | 30000001 | "Bankinnskudd", empty bankAccountNumber |
| Ledger account 3000 | 30000002 | "Salgsinntekt, avgiftspliktig" |
| Ledger account 1500 | 30000003 | "Kundefordringer" |
| VatType 25% | 3 | "25 % inngående mva. (høy sats)" |
| VatType 0% | 6 | "0 % avgiftsfritt" |
| PaymentType | 30000001 | "Kontant" |
| PaymentType | 30000002 | "Betalt til bank" |

### Supported Endpoints

**CRUD (12 entity types: employee, customer, department, product, order, invoice, project, travelExpense, account, voucher, contact, activity):**
- `GET /<entity>` — list with `?fields=`, `?from=`, `?count=`, search by name/number
- `GET /<entity>/:id` — get by ID with `?fields=`
- `POST /<entity>` — create (validates required fields + references)
- `PUT /<entity>/:id` — update (checks version for conflict → 409)
- `DELETE /<entity>/:id` — delete → 204 (not all entities support delete)

**Entity-specific rules (matching real API):**
- `GET /invoice` requires `?invoiceDateFrom=...&invoiceDateTo=...`
- `GET /order` requires `?orderDateFrom=...&orderDateTo=...`
- `DELETE /employee` is not supported (returns 404, real API returns 403)
- `?fields=id,name` returns only requested fields (no auto-include of id/version)

**Invoice actions:**
- `PUT /invoice/:id/:payment?paymentDate=...&paymentTypeId=...&paidAmount=...`
- `PUT /invoice/:id/:send?sendType=EMAIL`
- `POST /invoice/:id/:createCreditNote`

**Static lookups:**
- `GET /invoice/paymentType` — "Kontant", "Betalt til bank"
- `GET /ledger/vatType` — id 3 = 25%, id 6 = 0%

**Employee entitlements:**
- `PUT /employee/entitlement/:grantEntitlementsByTemplate`
- `POST /employee/entitlement`
- `GET /employee/entitlement`

**Test-only:**
- `POST /_reset` — reset store to seed state

### Error Response Shape (matches real API)

```json
{
  "status": 422,
  "code": 18000,
  "message": "Validering feilet.",
  "link": "https://tripletex.no/v2-docs/",
  "developerMessage": null,
  "validationMessages": [
    { "field": "name", "message": "Kan ikke være null.", "path": "null.name", "rootId": null }
  ],
  "requestId": "mock-request-id"
}
```

Error codes: 18000 (validation), 8000 (version conflict), 12000 (not found).

## Test Structure

### Unit Tests — `pnpm test` (44 tests, ~1s)

**File:** `tests/mock-crud.test.ts`

- Auth: valid/invalid/missing header, unauthenticated health check
- GET list: no filters, `?fields=` (only requested keys), pagination, search, empty results
- GET list: required date range for invoice and order
- GET by ID: found, 404 with real error shape
- POST: valid creation, missing required → 422, invalid refs → 422, custom validation
- PUT: correct version, version conflict → 409 (code 8000), not found → 404
- DELETE: customer → 204, travel expense → 204, not found → 404
- Invoice actions: payment, payment missing params, send, send missing sendType, credit note, 404
- Static lookups: payment types ("Kontant", "Betalt til bank"), VAT types with displayName
- Store reset: clean slate + re-seed
- Response envelopes: wrapValue, wrapList with versionDigest, error shape
- Full workflows: employee recipe, invoice chain, project, delete travel expense

### Conformance Tests — `pnpm test:conformance` (8 tests)

**File:** `tests/conformance.test.ts`

Compares mock response shapes against golden files in `tests/golden/`. When `SANDBOX_TOKEN` is set, fetches fresh responses from the real sandbox and updates golden files.

```bash
# Update golden files from real sandbox
SANDBOX_TOKEN=<token> pnpm test:conformance

# Compare mock against existing golden files (offline)
pnpm test:conformance
```

Golden files older than 7 days trigger a staleness warning. The test logs which keys the real API has that the mock doesn't (informational, not failure).

## Agent Logs

After running the agent, check `logs/` for results:

```bash
# View solve results
pnpm review

# Log format (logs/solves.jsonl)
# {"timestamp":"...","status":"completed","apiCalls":8,"apiErrors":0,"elapsedMs":28600,"prompt":"..."}
```

## Replay Versioning

Every replay logs baseline metadata for comparison across runs:
- `modelId` — from `MODEL_ID` env var (default: `anthropic/claude-sonnet-4-20250514`)
- `gitCommit` — from `git rev-parse --short HEAD`
- `promptHash` — SHA256 prefix of `system-prompt.ts` content
