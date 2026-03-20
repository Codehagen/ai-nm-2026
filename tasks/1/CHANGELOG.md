# Changelog — Task 1 (Tripletex Agent)

Each entry tracks a system prompt or mock fix, what caused it, and the benchmark result after.

## 2026-03-20

### Fix: Travel expense with costs & per diem (competition submission — 10/16 errors)
**Trigger**: Competition task — English travel expense with flight, taxi, and per diem. 16 calls, 10 errors, agent couldn't add cost items or per diem.
**Root cause**: System prompt had no recipe for travel expense sub-endpoints (POST /travelExpense/cost, POST /travelExpense/perDiemCompensation). Agent blindly tried endpoints and failed repeatedly.
**Fix (system-prompt.ts)**:
- Added complete tested recipe for travel expenses with costs & per diem
- Includes: GET costCategory, GET paymentType, POST cost, GET rateCategory, GET rate, POST perDiemCompensation
- Documents travelDetails nested object (departureDate/returnDate go inside travelDetails, not top-level)
- Documents overnightAccommodation enum, rate category date sensitivity, amountCurrencyIncVat field
**Fix (mock)**:
- Added travelExpenseCostCategory, travelExpensePaymentType, travelExpenseRateCategory, travelExpenseRate seed data
- Added POST /travelExpense/cost, POST /travelExpense/perDiemCompensation custom routes with validation
- Added GET endpoints for all travel expense lookups with filtering support
**Fix (system-prompt.ts)**: Credit note Corrections section used POST instead of PUT for :createCreditNote — fixed to match tested recipe
**Benchmark**: Added `t2-travel-expense-full-en` and `t2-travel-expense-full-nb`. Verified on real sandbox: 0 errors.
**Tests**: 48 unit tests (was 44), all passing.

### Fix: Credit note creation (competition submission — French complaint)
**Trigger**: Competition task — French credit note for complaint. 11 calls, 4 errors.
**Root cause**: (1) GET /invoice without date range → 400. (2) POST /invoice/:createCreditNote → 400 because invoice not sent. (3) Real API uses PUT for :createCreditNote, not POST.
**Fix (system-prompt.ts)**:
- Added date range params to Critical Rules section (rule #5)
- Credit note recipe: must send invoice first (PUT /:send), then PUT /:createCreditNote (not POST)
- Added fallback instruction: if createCreditNote returns 400, send invoice first then retry
**Benchmark**: Added `t2-credit-note-complaint-fr`. Verified credit note creation on real sandbox.

### Fix: Supplier invoice / leverandørfaktura (competition submission — 0/8 score)
**Trigger**: Competition task — Spanish supplier invoice: register invoice from vendor Montaña SL for 19500 NOK incl VAT to account 7300. 19 calls, 15 errors, 0/4 checks.
**Root cause**: No supplier invoice recipe. Agent tried POST /supplierInvoice (500), POST /ledger/voucher (422 — row 0 is system-reserved), POST /expense (403).
**Fix (system-prompt.ts)**: Added complete supplier invoice recipe via voucher system: POST /supplier → GET accounts (7300 + 2400) → POST /ledger/voucher with row numbering starting at 1, amountGrossCurrency = amountGross, vatType id 1 for 25% input VAT.
**Fix (mock)**: Added supplier entity config.
**Benchmark**: Added `t2-supplier-invoice-es`. Result: 7 calls, 0 errors (was 19/15).

### Fix: Salary/payroll task (competition submission — 0/8 score)
**Trigger**: Competition task — German payroll: create employee, set base salary 33000 + bonus 17850. 30 calls, 14 errors, 0/4 checks.
**Root cause**: No salary recipe in system prompt. Agent tried /salary/transaction (403), /salary/payslip (403), fell back to travel expenses and vouchers.
**Fix (system-prompt.ts)**: Added complete salary recipe: POST employment → GET salary/type → POST salary/specification per component
**Fix (mock)**: Added employment and salary/specification entities, salary type seed data, custom routes for /employee/employment and /salary/type
**Benchmark**: Added `t2-salary-de` and `t2-salary-nb`. Result: 6/6 calls, 100% efficiency, 0 errors.

### Fix: Order → invoice → payment with product numbers (competition submission — 0/8 score)
**Trigger**: Competition task — German order with 2 products (with product numbers in parens), convert to invoice, register payment. 12 calls, 4 errors, 0/8 checks.
**Root cause**: Agent failed `POST /product` 4 times — likely missing `vatType` field (required by real API). Product numbers in parentheses confused the agent.
**Fix (system-prompt.ts)**:
- Product: "ALWAYS include vatType — without it you get 422. Default to id 3 (25%)"
- Added: "numbers in parentheses are product numbers for scoring — include as `number` field"
**Benchmark**: Added `t2-order-invoice-payment-de`. Verified on real sandbox: 8 calls, 0 errors.

### Fix: Multi-line invoice with multiple VAT rates (competition submission — 0/8 score)
**Trigger**: Competition task — Spanish multi-line invoice with 25%, 15% (food), 0% (exempt) VAT. 19 calls, 9 errors, 0/6 checks passed.
**Root cause**: System prompt only listed VAT type id 3 (25%) and id 6 (0%). Missing id 31 (15% food), id 32 (12%), id 5 (0% within VAT law). Agent guessed wrong IDs → products with wrong VAT → order line errors → invoice with wrong amounts.
**Fix (system-prompt.ts)**:
- Added complete VAT type ID table: 3=25%, 31=15%(food), 32=12%, 5=0%(exempt within), 6=0%(exempt outside)
- Added "Do NOT guess VAT type IDs" instruction
- Removed `priceIncludingVatCurrency` from product example (Tripletex calculates it)
**Fix (mock/seed.ts)**: Added VAT types 5, 31, 32 to seed data
**Benchmark**: Added `t2-invoice-multiline-es` and `t2-invoice-multiline-nb`. Result: 33/33 pass, 97% efficiency, 0 errors.

### Fix: Project fixed price + milestone invoice (competition submission)
**Trigger**: Live competition submission — 14 calls, 4 errors on "Set a fixed price on project, invoice 33%"
**Errors**:
- `POST /employee → 422` — missing `dateOfBirth` or `email`
- `POST /project → 422` — missing `startDate`
- `PUT /ledger/account → 422` (x2) — missing `name` field, version mismatch
**Fix (system-prompt.ts)**:
- Employee: ALWAYS include `dateOfBirth` (default "1990-01-15") and `email` (default firstname.lastname@example.org)
- Project: Added "CRITICAL: startDate is REQUIRED" emphasis
- Ledger account: Include `name` in PUT body, skip PUT if `bankAccountNumber` already set, re-GET on 422
**Benchmark**: Added `t2-project-fixedprice-en`. Result: 31/31 pass, 99% efficiency, 0 errors.

### Fix: Credit note — invoice GET requires date range
**Trigger**: Benchmark run — `GET /invoice → 422` (missing `invoiceDateFrom`/`invoiceDateTo`)
**Fix (system-prompt.ts)**: Added required date range params to invoice GET instructions
**Benchmark**: 0 errors on `t2-credit-note-nb` (was 1 error, 3 calls → 0 errors, 2 calls)

### Fix: Employee admin — wrong entitlement method
**Trigger**: Benchmark run — `POST /employee/entitlement/:grantEntitlementsByTemplate → 404` (should be PUT)
**Fix (system-prompt.ts)**: Added exact 3-step tested recipe: POST dept + POST employee + PUT entitlement (not POST/GET)
**Benchmark**: 0 errors on `t1-employee-admin-nb` (was 1 error, 5 calls → 0 errors, 3 calls)

### Mock conformance fixes (verified against real sandbox)
**Trigger**: Running `SANDBOX_TOKEN=xxx pnpm test:conformance` against real Tripletex
**Fixes (mock)**:
- Error codes: 18000 (validation), 8000 (conflict), 12000 (not found) — was all 15000
- Error shape: Added `developerMessage: null`, `link`, `requestId`, `path`, `rootId` fields
- Validation messages: Norwegian text "Kan ikke være null." — was English "is required"
- Payment types: "Kontant" + "Betalt til bank" — was "Bankoverføring"
- Invoice/order GET: requires date range params (`invoiceDateFrom`/`invoiceDateTo`)
- Employee DELETE: not supported (real API returns 403)
- `fields` param: only returns requested keys, no auto-include of id/version
- `versionDigest`: matches real API string
- Ledger 1920 name: "Bankinnskudd" — was "Bankkonto"
**Benchmark**: 44 unit tests, 8 conformance tests, all passing
