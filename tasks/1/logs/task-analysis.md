# Tripletex Agent Task Analysis

**Date**: 2026-03-21 21:00 CET
**Deadline**: 2026-03-22 15:00 CET (~18 hours remaining)
**Current Score**: 59.12 (sum of all task scores)
**Rank**: ~76/376

---

## Scoring System Summary

- `correctness = points_earned / max_points`
- `leaderboard_score = correctness x tier` (T1=1x, T2=2x, T3=3x)
- Efficiency bonus: ONLY on **perfect correctness** (1.0), can **double** the score
- GETs are free, only WRITE calls count
- 4xx errors reduce efficiency bonus
- Best score per task kept forever
- Benchmarks recalculated every 12h

---

## Per-Task Breakdown

### Tier 1 Tasks (max score = 2.00 per task, efficiency bonus can reach 2.00)

| # | Score | Max | Tries | Type | Has Files | Notes |
|---|-------|-----|-------|------|-----------|-------|
| 01 | 1.50 | 2.00 | 17 | employee | No | Create employee with name, DOB, email, start date |
| 02 | 2.00 | 2.00 | 16 | unknown | No | **MAXED** |
| 04 | 2.00 | 2.00 | 19 | supplier | No | **MAXED** |
| 05 | 1.33 | 2.00 | 20 | unknown | No | Unknown type, consistently low |
| 06 | 1.40 | 2.00 | 18 | unknown | No | Unknown type, improved from 1.20 recently |
| 08 | 1.40 | 2.00 | 17 | unknown | No | Unknown type |
| 13 | 1.13 | 2.00 | 13 | unknown | No | Unknown type, lowest T1 |
| 16 | 1.00 | 2.00 | 17 | timesheet | No | Register hours + project invoice |

### Tier 2 Tasks (max score = 4.00 per task, efficiency bonus can reach 4.00)

| # | Score | Max | Tries | Type | Has Files | Notes |
|---|-------|-----|-------|------|-----------|-------|
| 03 | 2.00 | 4.00 | 17 | unknown | No | Half score, unknown type |
| 07 | 2.00 | 4.00 | 15 | unknown | No | Half score |
| 09 | 2.50 | 4.00 | 14 | unknown | No | OK |
| 10 | 2.67 | 4.00 | 15 | unknown | No | Good |
| 14 | 3.00 | 4.00 | 13 | unknown | No | Great |
| 15 | 2.23 | 4.00 | 13 | unknown | No | OK |
| 17 | 3.50 | 4.00 | 15 | unknown | No | Near-max |
| 18 | 2.67 | 4.00 | 14 | unknown | No | Good |

### Tier 3 Tasks (max score = 6.00 per task, efficiency bonus can reach 6.00)

| # | Score | Max | Tries | Type | Has Files | Notes |
|---|-------|-----|-------|------|-----------|-------|
| 11 | 0.00 | 6.00 | 15 | supplier-invoice | Yes (PDF receipt) | Receipt + dept, fix deployed but still 0 |
| 12 | 1.00 | 6.00 | 17 | unknown | ? | First scored recently |
| 19 | 1.77 | 6.00 | 8 | salary | Yes (PDF contract) | PDF employment contract |
| 20 | 1.50 | 6.00 | 7 | supplier-invoice | Yes (PDF invoice) | PDF supplier invoice |
| 21 | 2.36 | 6.00 | 8 | salary | Yes (PDF offer letter) | Offer letter onboarding |
| 22 | 0.00 | 6.00 | 8 | supplier-invoice | Yes (PDF receipt) | Receipt expense in dept, STILL 0 |
| 23 | 0.60 | 6.00 | 8 | voucher | Yes (CSV) | Bank reconciliation |
| 24 | 2.25 | 6.00 | 6 | voucher | No | Error correction in ledger |
| 25 | 3.86 | 6.00 | 10 | voucher | No | Reminder fee, improved massively |
| 26 | 6.00 | 6.00 | 10 | invoice-payment | No | **PERFECT** |
| 27 | 1.50 | 6.00 | 10 | invoice-payment | No | Foreign currency EUR |
| 28 | 1.50 | 6.00 | 9 | voucher | No | Cost analysis |
| 29 | 0.55 | 6.00 | 7 | project | No | Project lifecycle |
| 30 | 2.40 | 6.00 | 10 | unknown | No | Unknown T3, improved from 1.35 |

---

## Score Summary

| Category | Current Total | Max Possible | Gap |
|----------|--------------|-------------|-----|
| T1 tasks (8 tasks) | 12.16 | 16.00 | 3.84 |
| T2 tasks (8 tasks) | 20.57 | 32.00 | 11.43 |
| T3 tasks (14 tasks) | 23.29 | 84.00 | 60.71 |
| **TOTAL** | **59.12** | **132.00** | **72.88** |

Note: With perfect efficiency on perfect correctness, the theoretical max is even higher (up to 264 with 2x on every task). But 132 assumes correctness=1.0 with no efficiency bonus.

---

## Priority Group Analysis

### Priority 1: 0-Score Tasks (Tasks 11, 22) -- potential gain: up to 12.00 pts

#### Task 11 (Score: 0.00, Tier 3, 15 tries)
- **Type**: supplier-invoice (receipt + department)
- **Has Files**: Yes (PDF receipt)
- **Representative prompt**: "Vi treng [item] fra denne kvitteringa bokfort pa avdeling [dept]. Bruk rett utgiftskonto basert pa kjopet, og sorg for korrekt MVA-behandling."
- **File examples**: `kvittering_pt_03.pdf`, `kvittering_nb_08.pdf`, `kvittering_nn_08.pdf`
- **What scoring likely checks**: Supplier created from receipt vendor, invoice registered with correct expense account, correct VAT, voucher booked to ledger, correct department on posting
- **Known issues**:
  - Description says "clean 7c/0e at 18:15" but score not updated -- possibly scoring checks something the logs don't track
  - The receipt needs to be parsed for: vendor name, amount, VAT, date, item description
  - Department assignment on the voucher posting is likely critical
  - Expense account mapping: receipt items need the RIGHT account (6800 for meetings, 6540 for storage, 7140 for flights, etc.)
- **Failure pattern**: Despite "working" in logs, the 0 score suggests:
  1. Voucher postings might lack department assignment (`department: {id: N}` on posting rows)
  2. Wrong expense account for the receipt category
  3. Amount parsing error (European format: `1.234,56`)
  4. Missing `sendToLedger` step
- **Specific fix needed**:
  - Verify supplier-invoice recipe handles receipts with department
  - Add department to voucher posting rows
  - Map receipt categories to correct expense accounts
  - Ensure `sendToLedger` is called

#### Task 22 (Score: 0.00, Tier 3, 8 tries)
- **Type**: supplier-invoice (receipt expense in department)
- **Has Files**: Yes (PDF receipt)
- **Representative prompt**: "Precisamos da despesa de [item] deste recibo registada no departamento [dept]. Use a conta de despesas correta e garanta o tratamento correto do IVA."
- **File examples**: `kvittering_pt_01.pdf`, `kvittering_pt_03.pdf`, `kvittering_pt_06.pdf`
- **Known issues**: Same as Task 11 -- receipt parsing + department + expense account
- **Key difference**: Prompts are in Portuguese, which may cause classifier or LLM issues
- **Failure pattern**: "Wrong expense account or amount" per task-map description
- **Specific fix needed**:
  - Same as Task 11
  - Ensure Portuguese keywords in classifier still route to supplier-invoice
  - Map common receipt items to accounts: office supplies (6540), food/coffee (6800), storage (6540), flights (7140)

**Combined potential gain**: If both reach correctness 0.5, that's 2x3=6 pts. If correctness 0.8, that's 9.6 pts.

---

### Priority 2: Low T3 Tasks (high potential per-point gain)

#### Task 29 (Score: 0.55, Tier 3, 7 tries) -- potential gain: ~2-4 pts
- **Type**: project (lifecycle)
- **Representative prompt**: Mentions "cycle de vie"/"lifecycle"/"livssyklus" -- full project lifecycle including creating project, adding activities, invoicing, payment
- **What scoring checks**: Customer, employee/PM, project, activities, fixed price, invoice, payment -- the ENTIRE lifecycle
- **Known issues**: PM entitlements deployed but no improvement. Classifier correctly routes to "project" for lifecycle prompts.
- **Failure pattern**: Agent gets the project+PM right but fails on downstream steps (invoice creation, payment)
- **Specific fix**: The project recipe doesn't include invoice+payment after project creation. Lifecycle tasks need the full chain: project -> order -> invoice -> payment.
- **Expected gain**: If lifecycle handling added, could reach 0.5-0.7 correctness = 3.0-4.2 pts (gain of 1.5-2.6)

#### Task 23 (Score: 0.60, Tier 3, 8 tries) -- potential gain: ~2-4 pts
- **Type**: voucher (bank reconciliation CSV)
- **Representative prompt**: "Avstem bankutskrifta (vedlagt CSV) mot opne fakturaer i Tripletex. Match innbetalingar til kundefakturaer og utbetalingar til leverandorfakturaer. Handter delbetalingar korrekt."
- **Has Files**: Yes (CSV bank statement)
- **CSV structure**: `Dato;Forklaring;Inn;Ut;Saldo` with entries like "Innbetaling fra Weber GmbH / Faktura 1001"
- **What scoring checks**: Each payment in the CSV matched to the correct invoice, partial payments handled correctly
- **Known issues**: The agent must parse the CSV, find matching invoices in Tripletex, and register payments/supplier payments
- **Failure pattern**: Low score suggests most transactions aren't being matched correctly. The CSV contains customer payments (incoming) and supplier payments (outgoing) + misc items (interest, tax).
- **Specific fix**:
  - Parse CSV rows, identify customer invoices vs supplier invoices vs other entries
  - For customer payments: PUT /invoice/{id}/:payment
  - For supplier payments: POST voucher with correct accounts
  - Handle non-invoice items (interest income, tax withholding) as journal vouchers
- **Expected gain**: If matching improves to 0.5 correctness = 3.0 pts (gain of 2.4)

#### Task 12 (Score: 1.00, Tier unknown, 17 tries) -- unknown potential
- **Type**: Unknown
- **Description**: "First scored! Unknown type. Needs investigation."
- **No file info available**
- **Specific need**: Run a submission and map what this task type actually is

#### Task 27 (Score: 1.50, Tier 3, 10 tries) -- potential gain: ~2-3 pts
- **Type**: invoice-payment (foreign currency EUR)
- **Representative prompt**: "Me sende ein faktura pa 10781 EUR til Elvdal AS... kursen var 11.03 NOK/EUR. Kunden har no betalt, men kursen er 11.41 NOK/EUR. Registrer betalinga og bokfor valutadifferansen (agio/disagio)."
- **What scoring checks**: Invoice created in EUR, payment registered at different rate, exchange rate difference (agio/disagio) posted as journal voucher
- **Known issues**: No improvement in 10 tries. The foreign currency handling is complex:
  1. Create invoice in foreign currency (EUR)
  2. Register payment with exchange rate difference
  3. Post agio/disagio to correct accounts (8060 for gain, 8160 for loss)
- **Failure pattern**: Agent likely creates the invoice OK but fails on the exchange rate difference posting
- **Specific fix**: Add foreign currency recipe with agio/disagio voucher posting
- **Expected gain**: With proper agio/disagio handling, could reach 0.6-0.8 correctness = 3.6-4.8 pts (gain of 1.5-2.4)

#### Task 28 (Score: 1.50, Tier 3, 9 tries) -- potential gain: ~2-3 pts
- **Type**: voucher (cost analysis)
- **Representative prompt**: "Os custos totais aumentaram significativamente de janeiro a fevereiro de 2026. Analise o livro razao e identifique as tres contas de despesa com o maior aumento em valor. Crie um projeto interno para cada..."
- **What scoring checks**: Correct identification of top 3 expense accounts, internal projects created with correct names, activities created
- **Known issues**: Activity endpoint fix deployed (POST /activity, not /projectActivity). Score went from 0 to 1.50 with that fix.
- **Failure pattern**: The cost analysis recipe exists but may not be handling the data analysis correctly (summing by account, comparing periods)
- **Specific fix**: Ensure truncation limit is high enough for ledger postings (currently 200). Improve analysis logic in the LLM prompt to correctly aggregate and compare.
- **Expected gain**: With better analysis, could reach 0.5-0.6 correctness = 3.0-3.6 (gain of 1.5-2.1)

#### Task 20 (Score: 1.50, Tier 3, 7 tries) -- potential gain: ~2-3 pts
- **Type**: supplier-invoice (PDF)
- **Has Files**: Yes (PDF supplier invoice, e.g., `leverandorfaktura_pt_05.pdf`, `leverandorfaktura_de_02.pdf`)
- **Representative prompt**: "Voce recebeu uma fatura de fornecedor (ver PDF anexo). Registe a fatura no Tripletex. Crie o fornecedor se nao existir. Use a conta de despesas correta e o IVA de entrada."
- **What scoring checks**: Supplier created with correct name/org number from PDF, invoice registered with correct amount/dates/invoice number, correct expense account, VAT, voucher booked
- **Known issues**: No improvement in 7 tries. PDF parsing may miss fields or amounts.
- **Failure pattern**: Likely issues with PDF data extraction (amounts, dates, invoice numbers in European format)
- **Specific fix**: Improve PDF extraction accuracy, ensure all fields from the invoice PDF are captured
- **Expected gain**: If extraction improves, could reach 0.5-0.6 = 3.0-3.6 (gain of 1.5-2.1)

#### Task 19 (Score: 1.77, Tier 3, 8 tries) -- potential gain: ~2-3 pts
- **Type**: salary (PDF employment contract)
- **Has Files**: Yes (PDF arbeidskontrakt)
- **Representative prompt**: "Du har mottatt en arbeidskontrakt (se vedlagt PDF). Opprett den ansatte i Tripletex med alle detaljer fra kontrakten..."
- **Scored fields** (from reference doc):
  - firstName, lastName, email (basic, already extracted)
  - dateOfBirth (DD.MM.YYYY format -- agent defaults to 1990-01-15 instead of PDF value)
  - nationalIdentityNumber (personnummer, 11-digit)
  - bankAccountNumber
  - department name
  - occupationCode (stillingskode/STYRK, 4-digit)
  - percentageOfFullTimeEquivalent (stillingsprosent, e.g. 80.0)
  - annualSalary (converted to monthly: arslonn/12)
  - employment startDate
- **Known issues**: Salary executor already handles these fields. The issue is likely in the LLM extraction not pulling all fields from the PDF. The salary schema may also need employment details (occupationCode, percentage).
- **Specific fix**:
  - Ensure LLM extracts dateOfBirth, nationalIdentityNumber, bankAccountNumber from PDF
  - POST /employee/employment/details with occupationCode and percentageOfFullTimeEquivalent
  - Verify annualSalary -> monthly conversion
- **Expected gain**: If most fields extracted, could reach 0.5-0.7 = 3.0-4.2 (gain of 1.2-2.4)

#### Task 30 (Score: 2.40, Tier 3, 10 tries) -- potential gain: ~1-2 pts
- **Type**: Unknown T3
- **Description**: "Unknown T3. Improved from 1.35 to 1.80 to 2.40."
- **Has steady improvement** -- whatever the agent is doing is partially working
- **Need**: Identify what this task actually is to target improvements

---

### Priority 3: Low T1/T2 Tasks (smaller per-point gain but easier to fix)

#### Task 16 (Score: 1.00, Tier 1, 17 tries) -- potential gain: 1.00 pts
- **Type**: timesheet
- **Representative prompt**: "Registrer N timer for [person] pa aktiviteten [activity] i prosjektet [project] for [customer]. Timesats: XXXX NOK/h. Generer faktura."
- **What scoring checks**: Employee, customer, project, activity, timesheet entry, product, order, invoice
- **Known issues**: Date hardening fix deployed. Still at 1.00 after 17 tries.
- **Failure pattern**: High error rate in logs (avg 8.3 errors for timesheet type). Agent struggles with the full chain: employee -> project -> activity -> timesheet -> product -> order -> invoice.
- **Specific fix**: The timesheet recipe exists but execution is error-prone. Need to reduce write errors.
- **Expected gain**: If correctness reaches 0.75, score = 1.50 (gain of 0.50). With efficiency bonus at correctness=1.0, score = 2.00.

#### Task 13 (Score: 1.13, Tier 1, 13 tries) -- potential gain: 0.87 pts
- **Type**: Unknown T1
- **Needs investigation** to identify task type

#### Task 05 (Score: 1.33, Tier 1, 20 tries) -- potential gain: 0.67 pts
- **Type**: Unknown T1
- **20 tries with no improvement** -- likely a consistency issue, not a logic issue
- **Needs investigation**

#### Task 06 (Score: 1.40, Tier 1, 18 tries) -- potential gain: 0.60 pts
- **Type**: Unknown T1, recently improved from 1.20 to 1.40
- **Trend**: Positive, suggesting recent fixes are helping

#### Task 08 (Score: 1.40, Tier 1, 17 tries) -- potential gain: 0.60 pts
- **Type**: Unknown T1

#### Task 01 (Score: 1.50, Tier 1, 17 tries) -- potential gain: 0.50 pts
- **Type**: employee
- **Known issues**: Low efficiency (too many write errors or unnecessary writes)
- **Fix**: Reduce write errors in employee creation flow

#### Task 03 (Score: 2.00, Tier 2, 17 tries) -- potential gain: 2.00 pts
- **Type**: Unknown T2
- **At exactly half max** -- suggests correctness ~0.5 with no efficiency bonus
- **Needs investigation** to improve

#### Task 07 (Score: 2.00, Tier 2, 15 tries) -- potential gain: 2.00 pts
- **Type**: Unknown T2
- Same pattern as Task 03

#### Task 09 (Score: 2.50, Tier 2, 14 tries) -- potential gain: 1.50 pts
- **Type**: Unknown T2

#### Task 10 (Score: 2.67, Tier 2, 15 tries) -- potential gain: 1.33 pts

#### Task 15 (Score: 2.23, Tier 2, 13 tries) -- potential gain: 1.77 pts

---

### Priority 4: Near-Max Tasks (minimal gain)

| # | Score | Max | Gap | Notes |
|---|-------|-----|-----|-------|
| 02 | 2.00 | 2.00 | 0.00 | **MAXED** |
| 04 | 2.00 | 2.00 | 0.00 | **MAXED** |
| 14 | 3.00 | 4.00 | 1.00 | T2 great |
| 17 | 3.50 | 4.00 | 0.50 | T2 near-max |
| 18 | 2.67 | 4.00 | 1.33 | T2 good |
| 25 | 3.86 | 6.00 | 2.14 | Reminder fee, improving |
| 26 | 6.00 | 6.00 | 0.00 | **PERFECT** |

---

## Common Failure Patterns

### 1. Unknown Task Types (affects Tasks 03, 05, 06, 07, 08, 12, 13, 30)
Many T1/T2 tasks are classified as "unknown" -- the task map has `taskType: null`. This means we don't know what the competition evaluator sends for these tasks. Without knowing the task type, we can't optimize.

**Impact**: ~8 tasks with unknown types across all tiers.
**Fix**: Submit more runs and capture request logs to identify task types. Use `/map-task N` workflow.

### 2. PDF Data Extraction (affects Tasks 11, 19, 20, 21, 22)
PDF-based T3 tasks struggle with extracting all required fields from documents. The LLM needs to parse:
- European number format (1.234,56)
- Norwegian dates (DD.MM.YYYY)
- Invoice numbers, amounts, VAT breakdown
- Employment contract fields (personnummer, stillingskode, etc.)

**Impact**: ~5 tasks, all T3 (high value).
**Fix**: Improve system prompt for PDF parsing, add explicit field extraction instructions.

### 3. Receipt -> Expense Account Mapping (affects Tasks 11, 22)
Receipts need to be mapped to the correct expense account based on the purchase type:
- Office supplies: 6540
- Travel/flights: 7140
- Food/meetings: 6800
- Representation: 7350
- IT equipment: 6540 or 1200
- Accommodation: 7130

**Impact**: 2 tasks at 0 score (12.00 pts potential).
**Fix**: Add expense account mapping logic or hints to the supplier-invoice recipe for receipt handling.

### 4. Foreign Currency (affects Task 27)
EUR invoicing + payment with exchange rate difference (agio/disagio) is not handled by any recipe.

**Impact**: 1 task, ~3 pts potential gain.
**Fix**: Add foreign currency recipe with exchange rate difference voucher posting.

### 5. Bank Reconciliation (affects Task 23)
CSV bank statement matching is complex: parse CSV, match to invoices, handle customer vs supplier payments, handle non-invoice items.

**Impact**: 1 task, ~3 pts potential gain.
**Fix**: Improve voucher recipe's bank reconciliation section with better matching logic.

### 6. Efficiency Losses (affects many T1/T2 tasks)
Many tasks have correct results but too many write errors, which reduces the efficiency bonus. Example:
- Task 01: 1.50/2.00 (employee, simple task but errors in flow)
- Task 16: 1.00/2.00 (timesheet, high error rate avg 8.3 errors)

**Impact**: Across many tasks, ~5-10 pts total from efficiency improvements.
**Fix**: Reduce unnecessary writes, fix error-prone API call sequences, pre-validate payloads.

### 7. Department on Voucher Postings (may affect Tasks 11, 22)
Receipts mentioning a department likely need `department: {id: N}` on each voucher posting row. This is not in the current supplier-invoice recipe.

**Impact**: 2 tasks, critical for scoring.
**Fix**: Add department linking to voucher posting rows in the supplier-invoice recipe for receipt tasks.

---

## Recommended Action Plan (18 hours remaining)

### Tier S -- Highest ROI (do first)

1. **Fix Tasks 11 + 22 (receipt + department)** -- potential +6 to +12 pts
   - Add department lookup and linking to voucher postings
   - Add expense account mapping for common receipt categories
   - Test with Portuguese (Task 22) and Norwegian (Task 11) prompts
   - Time estimate: 1-2 hours

2. **Map unknown T2 tasks (03, 07)** -- potential +4 pts
   - Submit runs and capture request logs
   - Identify task types, add targeted recipes
   - These are at exactly 50% correctness (2.00/4.00) which suggests half the checks pass
   - Time estimate: 1-2 hours

### Tier A -- High ROI

3. **Improve Task 27 (foreign currency)** -- potential +2-3 pts
   - Add agio/disagio recipe
   - Handle EUR invoicing with exchange rate difference
   - Time estimate: 1 hour

4. **Improve Task 23 (bank reconciliation)** -- potential +2-3 pts
   - Better CSV parsing and invoice matching logic
   - Handle customer payments, supplier payments, and misc items
   - Time estimate: 1-2 hours

5. **Improve Task 29 (project lifecycle)** -- potential +2-3 pts
   - Extend project recipe to handle full lifecycle (project -> invoice -> payment)
   - Time estimate: 1 hour

6. **Improve Task 19/21 (salary PDF)** -- potential +2-4 pts combined
   - Ensure employment details (occupationCode, percentage) are set
   - Better PDF field extraction in LLM prompt
   - Time estimate: 1-2 hours

### Tier B -- Medium ROI

7. **Fix Task 16 (timesheet)** -- potential +1 pt
   - Reduce error rate in timesheet execution chain
   - Time estimate: 30 min

8. **Fix Task 28 (cost analysis)** -- potential +1-2 pts
   - Improve ledger analysis accuracy
   - Time estimate: 30 min

9. **Improve Task 20 (supplier invoice PDF)** -- potential +1-2 pts
   - Better PDF invoice field extraction
   - Time estimate: 1 hour

### Tier C -- Low ROI (only if time permits)

10. **Map remaining unknown T1 tasks (05, 06, 08, 13)** -- potential +2 pts total
11. **Efficiency optimization across all tasks** -- potential +3-5 pts total
12. **Improve Task 30 (unknown T3)** -- need to identify type first

---

## Realistic Score Targets

| Scenario | Total Score | Gain | Key Tasks |
|----------|------------|------|-----------|
| Current | 59.12 | -- | -- |
| Fix 0-score tasks (11, 22) to 2.0 each | 63.12 | +4.00 | 11, 22 |
| + Map and fix T2 unknowns (03, 07) to 3.0 | 65.12 | +2.00 | 03, 07 |
| + Foreign currency fix (27) to 3.0 | 66.62 | +1.50 | 27 |
| + Bank reconciliation (23) to 2.0 | 68.02 | +1.40 | 23 |
| + Project lifecycle (29) to 2.0 | 69.47 | +1.45 | 29 |
| + Salary PDF improvements (19, 21) | 71.47 | +2.00 | 19, 21 |
| + Timesheet fix (16) to 1.5 | 71.97 | +0.50 | 16 |
| + Cost analysis (28) to 2.5 | 72.97 | +1.00 | 28 |
| **Realistic target** | **~70-73** | **+11-14** | -- |
| **Optimistic target** | **~80** | **+21** | All Tier A+B fixes land |

---

## Representative Prompts by Task Type

### Receipt + Department (Tasks 11, 22)
```
NO: "Vi treng Tastatur fra denne kvitteringa bokfort pa avdeling Kundeservice. Bruk rett utgiftskonto basert pa kjopet, og sorg for korrekt MVA-behandling."
PT: "Precisamos da despesa de Kaffemote deste recibo registada no departamento HR. Use a conta de despesas correta e garanta o tratamento correto do IVA."
```

### PDF Employment Contract (Task 19)
```
NO: "Du har mottatt en arbeidskontrakt (se vedlagt PDF). Opprett den ansatte i Tripletex med alle detaljer fra kontrakten: personnummer, fodselsdato, avdeling, stillingskode, lonn, stillingsprosent og startdato."
FR: "Vous avez recu un contrat de travail (voir PDF ci-joint). Creez l'employe dans Tripletex avec tous les details du contrat..."
```

### PDF Offer Letter (Task 21)
```
NO: "Du har mottatt et tilbudsbrev (se vedlagt PDF) for en ny ansatt. Utfor komplett onboarding: opprett den ansatte, tilknytt riktig avdeling, sett opp ansettelsesforhold med stillingsprosent og arslonn, og kjor lonnsspesifikasjon."
NN: "Du har motteke eit tilbodsbrev (sjaa vedlagt PDF) for ein ny tilsett..."
```

### PDF Supplier Invoice (Task 20)
```
PT: "Voce recebeu uma fatura de fornecedor (ver PDF anexo). Registe a fatura no Tripletex. Crie o fornecedor se nao existir. Use a conta de despesas correta e o IVA de entrada."
DE: "Sie haben eine Lieferantenrechnung erhalten (siehe beigefugte PDF). Registrieren Sie die Rechnung in Tripletex..."
```

### Bank Reconciliation CSV (Task 23)
```
NN: "Avstem bankutskrifta (vedlagt CSV) mot opne fakturaer i Tripletex. Match innbetalingar til kundefakturaer og utbetalingar til leverandorfakturaer. Handter delbetalingar korrekt."
DE: "Gleichen Sie den Kontoauszug (beigefuegte CSV) mit den offenen Rechnungen in Tripletex ab..."
```

### Foreign Currency (Task 27)
```
NN: "Me sende ein faktura pa 10781 EUR til Elvdal AS (org.nr 964825114) da kursen var 11.03 NOK/EUR. Kunden har no betalt, men kursen er 11.41 NOK/EUR. Registrer betalinga og bokfor valutadifferansen (agio/disagio)."
EN: "We sent an invoice for 19858 EUR to Northwave Ltd (org no. 923909583) when the exchange rate was 11.66 NOK/EUR. The customer has now paid, but the rate is 11.00 NOK/EUR."
```

### Cost Analysis (Task 28)
```
PT: "Os custos totais aumentaram significativamente de janeiro a fevereiro de 2026. Analise o livro razao e identifique as tres contas de despesa com o maior aumento em valor. Crie um projeto interno para cada..."
```

### Project Lifecycle (Task 29)
```
(Prompts include full lifecycle: create project, create activities, set fixed price, invoice the customer, register payment)
```

### Reminder Fee (Task 25)
```
ES: "Uno de sus clientes tiene una factura vencida. Encuentre la factura vencida y registre un cargo por recordatorio de 55 NOK. Debito cuentas por cobrar (1500), credito ingresos por recordatorio (3400)."
```

### Year-End / Month Close (Tasks in T2 range)
```
NN: "Gjer forenkla arsoppgjer for 2025: 1) Rekn ut og bokfor arlege avskrivingar for tre eigedelar..."
FR: "Effectuez la cloture mensuelle de mars 2026. Comptabilisez la regularisation..."
```

---

## Solves Log Statistics

- **Total entries**: 561
- **Clean runs (0 errors)**: ~450 (80%)
- **High error runs (>3 errors)**: ~30 (5%)
- **File-based entries**: ~37 in request logs
- **Models used**: Primarily `anthropic/claude-sonnet-4-20250514`, with some `claude-opus-4.6` and Gemini fallback

### Error Rate by Task Type (from logged taskType field)
| Type | Count | Clean | Avg Errors | Avg Calls |
|------|-------|-------|------------|-----------|
| customer | 7 | 6 | 0.3 | 1.4 |
| employee | 6 | 6 | 0.0 | 3.3 |
| department | 7 | 7 | 0.0 | 3.0 |
| product | 8 | 7 | 0.2 | 2.0 |
| supplier | 6 | 6 | 0.0 | 1.0 |
| invoice | 14 | 10 | 0.5 | 7.8 |
| invoice-payment | 21 | 12 | 1.2 | 7.3 |
| credit-note | 4 | 4 | 0.0 | 5.0 |
| project | 10 | 2 | 1.5 | 7.8 |
| supplier-invoice | 7 | 5 | 0.4 | 4.4 |
| salary | 2 | 0 | 9.5 | 22.5 |
| timesheet | 3 | 0 | 8.3 | 18.3 |
| travel-expense-full | 4 | 0 | 3.0 | 18.0 |
| voucher | 2 | 1 | 0.5 | 6.5 |

**Key insight**: Salary and timesheet task types have extremely high error rates. Every run has errors. This directly impacts Tasks 16 (timesheet), 19/21 (salary). These need targeted error reduction.

---

## Key Files

- Task map: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/logs/task-map/tasks.json`
- Solve log: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/logs/solves.jsonl`
- Request logs: `/tmp/tripletex-requests/`
- Task classifier: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/src/task-classifier.ts`
- Prompt builder: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/src/prompt-builder.ts`
- Main agent: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/src/model.ts`
- Salary executor: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/src/orchestrator/execute/salary.ts`
- Supplier-invoice executor: `/Users/walgermo/Utvikling/ai-nm-2026/tasks/1/src/orchestrator/execute/supplier-invoice.ts`
- Known patterns: `/Users/walgermo/.claude/projects/-Users-walgermo-Utvikling-ai-nm-2026/memory/feedback_tripletex_patterns.md`
- Task 19 reference: `/Users/walgermo/.claude/projects/-Users-walgermo-Utvikling-ai-nm-2026/memory/reference_task19_pdf_contract.md`
