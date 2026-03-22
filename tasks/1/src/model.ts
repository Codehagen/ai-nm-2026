import { generateText, tool, stepCountIs } from "ai";
import type { StopCondition, StepResult } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { SolveRequest, SolveResponse } from "./dtos.js";
import { TripletexClient, type TxResult } from "./tripletex.js";
import { classifyTask } from "./task-classifier.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { logSolve } from "./logger.js";
import { preprocessFiles } from "./file-utils.js";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL_ID = "anthropic/claude-opus-4.6";
const FALLBACK_MODEL_ID = process.env.FALLBACK_MODEL_ID || "gemini-3.1-flash-lite-preview";

/** Select the right provider based on model ID */
function getModel(modelId: string) {
  if (modelId.startsWith("anthropic/")) {
    // Strip prefix for direct provider — "anthropic/claude-opus-4.6" → "claude-opus-4-6"
    const bareId = modelId.replace("anthropic/", "").replace(/\./g, "-");
    return anthropic(bareId);
  }
  if (modelId.startsWith("claude-")) {
    return anthropic(modelId);
  }
  return google(modelId);
}

/** Oslo timezone date (avoids UTC midnight drift) */
function getOsloDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

/** Truncate large GET list responses to prevent context overflow */
export function truncateForLLM(result: TxResult, method: string, path?: string): TxResult {
  if (!result.ok || method !== "GET") return result;
  const data = result.data as Record<string, unknown>;
  if (!data?.values || !Array.isArray(data.values)) return result;

  // Lookup paths — reference data the LLM needs in full to pick the right entry
  const isLookup = path && (
    path.includes("/costCategory") ||
    path.includes("/paymentType") ||
    path.includes("/rateCategory") ||
    path.includes("/activity") ||
    path.includes("/salary/type")
  );
  // Analytical paths need more data (ledger postings for cost analysis, voucher inspection)
  const isAnalytical = path && (
    path.includes("/ledger/posting") ||
    path.includes("/ledger/voucher")
  );
  const limit = isAnalytical ? 200 : isLookup ? 50 : 5;

  if (data.values.length > limit) {
    return {
      ok: true,
      data: {
        ...data,
        values: data.values.slice(0, limit),
        _truncated: true,
        _totalCount: data.values.length,
      },
    };
  }
  return result;
}

/** Fields derived from the prompt that scoring checks exactly */
export const PROMPT_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "name",
  "organizationNumber",
];

/** Enrich unhelpful 422 errors with actionable hints based on known failure patterns */
export function enrichError(
  result: TxResult & { ok: false },
  method: string,
  path: string
): TxResult & { ok: false } {
  const hint = getErrorHint(method, path, result);
  if (!hint) return result;
  return { ...result, message: (result.message || "Validering feilet.") + " " + hint };
}

function getErrorHint(
  method: string,
  path: string,
  result: TxResult & { ok: false }
): string | null {
  // Bank account number must pass Norwegian MOD11 validation
  if (method === "PUT" && path.includes("ledger/account")) {
    return 'Use bankAccountNumber "86011117947" — it passes Norwegian MOD11 validation. Do NOT guess random numbers.';
  }

  // Email collision — employee already exists from a previous attempt
  const vm = result.validationMessages;
  if (vm?.some((v) => v.field === "email" && v.message.includes("allerede"))) {
    return "The email already exists. GET /employee?email=<the email>&fields=id,firstName,lastName,version,dateOfBirth to find them. If firstName or lastName differs from the prompt, PUT /employee/{id} with {id, version, firstName, lastName, dateOfBirth} to update. Email is IMMUTABLE — do NOT include email in PUT body.";
  }

  // Product number already in use
  if (vm?.some((v) => v.field === "number" && v.message.includes("i bruk"))) {
    return "The product number already exists. GET /product?number=<the number>&fields=id,name,priceExcludingVatCurrency,vatType,version to find it. If name or price differs from the prompt, PUT /product/{id} to update it.";
  }

  // Division creation missing required fields
  if (method === "POST" && path.includes("division")) {
    return 'Division requires ALL of: name, startDate, municipalityDate, organizationNumber, municipality. Use: {"name": "Hovedenhet", "startDate": "2026-01-01", "municipalityDate": "2026-01-01", "organizationNumber": "000000000", "municipality": {"id": <mun_id>}}. GET /municipality?count=1&fields=id first.';
  }

  // 409 RevisionException — transient version conflict, just retry
  if (result.status === 409) {
    return 'RevisionException = transient version conflict. Retry the exact same request once — it will succeed.';
  }

  // Invoice creation fails because bank account not set up
  if (method === "POST" && path.includes("invoice") && vm?.some((v) => v.message?.includes("bankkontonummer"))) {
    return 'Bank account missing. Do: GET /ledger/account?number=1920&fields=id,version,bankAccountNumber,name → PUT /ledger/account/{id} with {"id":..,"version":..,"name":..,"bankAccountNumber":"86011117947"} → then retry POST /invoice.';
  }

  // Travel expense cost — missing required fields
  if (method === "POST" && path.includes("travelExpense/cost")) {
    return 'Travel expense cost requires: travelExpense.id, costCategory.id, paymentType.id, date, amountCurrencyIncVat. GET /travelExpense/costCategory and /travelExpense/paymentType first to find valid IDs.';
  }

  // Supplier invoice — voucher posting row numbering
  if (method === "POST" && path.includes("supplierInvoice")) {
    return 'Voucher posting rows MUST start at 1 (not 0). Row 0 is system-reserved. amountGrossCurrency MUST equal amountGross. Expense row is POSITIVE, supplier row is NEGATIVE. MUST pass params: {"sendToLedger": "true"}.';
  }

  // Salary specification — employment required
  if (method === "POST" && path.includes("salary/specification")) {
    return 'Salary specification requires an active employment. POST /employee/employment first with employee.id, startDate, and division.id. Also check that year and month match the current payroll period.';
  }

  // Employee standard time — BLOCK POST, require PUT
  if (method === "POST" && path.includes("employee/standardTime")) {
    return 'STOP: POST /employee/standardTime does NOT work. You MUST use PUT. Steps: (1) GET /employee/standardTime?employeeId=<id>&fields=* to find existing entries and see the field names. (2) PUT /employee/standardTime/{id} with the fields from the GET response. Do NOT guess field names — copy them from the GET response exactly.';
  }

  // Voucher postings invalid field (type, isDebit, etc.)
  if (method === "POST" && path.includes("ledger/voucher") && vm?.some((v) => v.field?.includes("type") || v.field?.includes("isDebit"))) {
    return 'STOP adding invalid fields to voucher postings. Valid fields ONLY: row, date, description, account (object with id), amountGross, amountGrossCurrency, vatType (optional). Do NOT include "type", "isDebit", "debit", "credit", or any other fields.';
  }

  // Voucher postings don't balance
  if (method === "POST" && path.includes("ledger/voucher") && vm?.some((v) => v.message.includes("balanse") || v.message.includes("balance"))) {
    return 'Voucher postings MUST balance (sum of all amountGross = 0). Check that debit (positive) and credit (negative) amounts are equal.';
  }

  // Employment POST — invalid fields
  if (method === "POST" && path.includes("/employee/employment") && !path.includes("details") &&
      (vm?.some((v) => v.message?.includes("mapping")) || result.message?.includes("mapping"))) {
    return 'STOP: POST /employee/employment accepts ONLY: employee.id, startDate, division.id. Do NOT include employmentType, percentageOfFullTimeEquivalent, occupationCode, annualSalary, or shiftDurationHours — those go on POST /employee/employment/details (separate endpoint). Remove the invalid fields and retry.';
  }

  // Invoice GET — invalid field names
  if (method === "GET" && path.includes("/invoice") && !path.includes("supplierInvoice") &&
      result.status === 400 && result.message?.includes("does not match a field")) {
    return 'InvoiceDTO valid fields: id, invoiceNumber, invoiceDate, invoiceDueDate, customer, amount, ehfSendStatus, orders, isCreditNote. Do NOT use: totalAmount, remainingAmount, dueDate, status, balance, isClosed. Use fields=* for full list.';
  }

  // Order line — invalid fields (orderDate/deliveryDate belong on order, not orderline)
  if (method === "POST" && path.includes("/order/orderline") &&
      vm?.some((v) => v.field === "orderDate" || v.field === "deliveryDate")) {
    return 'STOP: orderDate and deliveryDate do NOT go on order lines — they belong on the ORDER. OrderLine fields: order.id, product.id or description, count, unitPriceExcludingVatCurrency, vatType.id. Remove orderDate and deliveryDate.';
  }

  // Wrong payment type endpoint — /ledger/paymentType doesn't exist
  if (method === "GET" && path.includes("/ledger/paymentType") && result.status === 404) {
    return 'WRONG ENDPOINT: /ledger/paymentType does not exist. Use GET /invoice/paymentType?fields=id,description instead.';
  }

  // supplierInvoice invalid field names
  if (method === "GET" && path.includes("/supplierInvoice") &&
      result.status === 400 && result.message?.includes("does not match a field")) {
    return 'SupplierInvoiceDTO does NOT have amountOutstanding or balance fields. Use fields=* to see all available fields, or use: id, invoiceNumber, invoiceDate, supplier, amount.';
  }

  // Employment invalid fields — these belong on employment/details, not employment
  if (method === "POST" && path.includes("employee/employment") && !path.includes("details") &&
      vm?.some((v) => ["employmentType","percentageOfFullTimeEquivalent","occupationCode","workingHoursScheme"].includes(v.field ?? ""))) {
    return 'STOP: employmentType, percentageOfFullTimeEquivalent, occupationCode, workingHoursScheme do NOT go on POST /employee/employment. They go on POST /employee/employment/details. Employment only needs: employee.id, startDate, division.id.';
  }

  // Voucher posting missing customer/supplier on receivables/payables accounts
  if (method === "POST" && path.includes("ledger/voucher") &&
      vm?.some((v) => v.message?.includes("Kunde mangler") || v.message?.includes("Leverandør mangler"))) {
    return 'Posting to account 1500 (kundefordringer) REQUIRES customer.id on the posting. Posting to account 2400 (leverandørgjeld) REQUIRES supplier.id. Add the customer or supplier object to EACH posting row that uses these accounts.';
  }

  // Voucher already sent to ledger — don't retry
  if (path.includes("voucher") && vm?.some((v) => v.message?.includes("Bokførte bilag"))) {
    return 'This voucher is already sent to the ledger. Do NOT try to send it again or modify it. Move on to the next step.';
  }

  return null;
}

/** Build a retry key from path + entity identity so different entities don't collide */
export function retryKey(path: string, body: Record<string, unknown>): string {
  const norm = path.replace(/\/\d+/g, "");
  const id =
    body.firstName && body.lastName
      ? `${body.firstName}|${body.lastName}`
      : body.name
        ? String(body.name)
        : "";
  return `${norm}:${id}`;
}

/** Known-invalid fields that the model hallucinates in GET requests */
export const INVALID_GET_FIELDS = new Set(["isClosed", "amountIncVat", "company", "address", "dueDate", "balance", "amountOutstanding"]);

/** Strip known-invalid fields from a GET fields parameter string */
export function stripInvalidFields(fields: string): string {
  return fields
    .split(",")
    .filter((f) => !INVALID_GET_FIELDS.has(f.trim()))
    .join(",");
}

/** Custom stop condition: halt after error budget exceeded (saves API calls when bonus is already lost) */
export function errorBudgetExceeded(threshold = 12): StopCondition<any> {
  return ({ steps }: { steps: Array<StepResult<any>> }) => {
    const errors = steps
      .flatMap((s) => s.staticToolResults)
      .filter((r) => {
        const output = r?.output as TxResult | undefined;
        return output && !output.ok;
      }).length;
    return errors >= threshold;
  };
}

/**
 * Build adaptive per-step guidance based on error patterns from previous steps.
 * Returns system prompt override when corrective action is needed.
 */
export function buildAdaptiveGuidance(
  steps: Array<StepResult<any>>,
  stepNumber: number,
  baseSystem: string,
): { system?: string } {
  if (steps.length === 0) return {};

  const corrections: string[] = [];

  // Detect bank account missing error → inject fix instructions
  const hasBankError = steps.some((s) =>
    s.staticToolResults.some((r) => {
      const output = r?.output as TxResult | undefined;
      if (!output || output.ok) return false;
      return (
        output.message?.includes("bankkontonummer") ||
        output.validationMessages?.some((v: { message: string }) =>
          v.message?.includes("bankkontonummer")
        )
      );
    })
  );
  if (hasBankError) {
    corrections.push(
      'BANK ACCOUNT REQUIRED: You MUST set up the bank account BEFORE creating invoices. ' +
      'Do: GET /ledger/account?number=1920&fields=id,version,bankAccountNumber,name → ' +
      'PUT /ledger/account/{id} with {"id":..,"version":..,"name":..,"bankAccountNumber":"86011117947"} → then retry.'
    );
  }

  // Detect 403 cascade: credentials are broken, no point continuing
  const allResults = steps.flatMap((s) =>
    s.staticToolResults.map((r) => r?.output as TxResult | undefined)
  ).filter(Boolean) as TxResult[];
  if (allResults.length >= 2 && allResults.every((r) => !r.ok && r.status === 403)) {
    corrections.push(
      'STOP IMMEDIATELY: All API calls returned 403 Forbidden. The credentials are invalid. ' +
      'No further calls will succeed. Output your final answer now.'
    );
  }

  // Detect thrashing: 3+ consecutive errors on the same endpoint
  const recentResults = steps.slice(-3).flatMap((s) =>
    s.staticToolCalls.map((tc, i) => ({
      path: (tc.input as { path: string }).path,
      ok: ((s.staticToolResults[i]?.output as TxResult | undefined)?.ok) ?? false,
    }))
  );
  const recentErrors = recentResults.filter((r) => !r.ok);
  if (recentErrors.length >= 3) {
    const paths = [...new Set(recentErrors.map((r) => r.path))];
    if (paths.length === 1) {
      corrections.push(
        `STOP THRASHING: You've failed 3+ times on ${paths[0]}. Read the error messages carefully. ` +
        'Try a completely different approach or skip this step and move on.'
      );
    }
  }

  if (corrections.length === 0) return {};

  return {
    system: baseSystem + "\n\n## ADAPTIVE CORRECTIONS\n" + corrections.join("\n\n"),
  };
}

/** Normalize API path — strips /v2/ prefix Gemini sometimes adds */
export function normalizePath(path: string): string {
  if (path.startsWith("/v2/")) path = path.slice(3);
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

/** Auto-inject required defaults on POST /employee body */
export function applyEmployeeDefaults(body: Record<string, unknown>): void {
  if (!body.userType) body.userType = "STANDARD";
  if (!body.dateOfBirth) body.dateOfBirth = "1990-01-15";
}

/** Auto-inject vatType on POST /product body */
export function applyProductDefaults(body: Record<string, unknown>): void {
  if (!body.vatType) body.vatType = { id: 3 };
}

/** Auto-inject date range params for GET endpoints that require them */
export function applyDateRangeDefaults(
  path: string,
  params: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const p = params ?? {};
  let injected = false;
  if (
    path.includes("/invoice") &&
    !path.includes("/paymentType") &&
    !path.includes("/payment")
  ) {
    if (!p.invoiceDateFrom) { p.invoiceDateFrom = "2020-01-01"; injected = true; }
    if (!p.invoiceDateTo) { p.invoiceDateTo = "2030-01-01"; injected = true; }
  }
  if (path.includes("/order") && !path.includes("/orderLine")) {
    if (!p.orderDateFrom) { p.orderDateFrom = "2020-01-01"; injected = true; }
    if (!p.orderDateTo) { p.orderDateTo = "2030-01-01"; injected = true; }
  }
  if (path.includes("/ledger/voucher") || path.includes("/ledger/posting")) {
    if (!p.dateFrom) { p.dateFrom = "2020-01-01"; injected = true; }
    if (!p.dateTo) { p.dateTo = "2030-01-01"; injected = true; }
  }
  return injected ? p : params;
}

/**
 * Main agent entrypoint. Uses Claude to interpret the prompt and
 * execute Tripletex API calls via tool use.
 */
export async function solve(
  request: SolveRequest,
  signal?: AbortSignal,
  fallbackHint?: string,
): Promise<SolveResponse> {
  const startMs = Date.now();
  const client = new TripletexClient(request.tripletex_credentials, signal);

  // Track failed POST bodies per entity identity to detect value-change on retry
  const failedPosts = new Map<string, Record<string, unknown>>();

  // Preprocess files: decode CSVs to text (LLMs can't read CSV content parts)
  const { csvText, nativeFiles } = preprocessFiles(request.files);

  // Build user message content parts
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string; filename?: string }
  > = [{ type: "text", text: csvText ? `${request.prompt}\n\n${csvText}` : request.prompt }];

  for (const f of nativeFiles) {
    if (f.mime_type.startsWith("image/")) {
      content.push({ type: "image", image: f.content_base64 });
    } else {
      content.push({
        type: "file",
        data: f.content_base64,
        mediaType: f.mime_type,
        filename: f.filename,
      });
    }
  }

  const today = getOsloDate();

  // Phase 2: Composable prompt — classify task and build focused prompt
  const taskType = classifyTask(request.prompt);
  const baseSystem = buildSystemPrompt(taskType) + `\n\nToday's date: ${today}` + (fallbackHint || "");

  let selectedModel = MODEL_ID;
  const doGenerate = (modelId: string) => generateText({
    model: getModel(modelId),
    temperature: 0, // Deterministic: reduces random errors on tool calls
    system: baseSystem,
    messages: [{ role: "user", content }],
    tools: {
      tripletex_request: tool({
        description:
          "Call the Tripletex v2 REST API. Returns {ok: true, data: ...} on success or {ok: false, status, message, validationMessages} on failure. Read validationMessages to understand exactly which fields are wrong.",
        inputSchema: z.object({
          method: z
            .enum(["GET", "POST", "PUT", "DELETE"])
            .describe("HTTP method"),
          path: z
            .string()
            .describe(
              "API path, e.g. /employee, /customer, /invoice/{id}/:payment"
            ),
          body: z
            .any()
            .optional()
            .describe("JSON body for POST/PUT requests"),
          params: z
            .record(z.string())
            .optional()
            .describe(
              "Query parameters, e.g. {fields: 'id,name', count: '100'}"
            ),
        }),
        execute: async ({ method, body, path: rawPath, params }) => {
          // === Phase 1A: Path normalization (Gemini fix) ===
          const path = normalizePath(rawPath);

          // Block retries that change prompt-derived fields (identity-aware)
          if (method === "POST" && body) {
            const key = retryKey(path, body as Record<string, unknown>);
            const prev = failedPosts.get(key);
            if (prev) {
              const changed = PROMPT_FIELDS.filter(
                (f) =>
                  prev[f] !== undefined &&
                  body[f] !== undefined &&
                  prev[f] !== body[f]
              );
              if (changed.length > 0) {
                return {
                  ok: false,
                  status: 0,
                  message: `BLOCKED: You changed ${changed.join(", ")} from your first attempt. The scoring checks EXACT values from the prompt. Fix other fields instead, or check the error message from your first attempt.`,
                };
              }
            }
          }

          // === Phase 1B: Auto-inject defaults on POST /employee ===
          if (
            method === "POST" &&
            /\/employee\b/.test(path) &&
            !path.includes("/employment") &&
            !path.includes("/entitlement") &&
            body
          ) {
            applyEmployeeDefaults(body as Record<string, unknown>);
          }

          // === Phase 1C: Fix vatType id 0 (invalid) → id 6 (no VAT) ===
          if ((method === "POST" || method === "PUT") && body) {
            const fixVat = (obj: Record<string, unknown>) => {
              if (obj.vatType && typeof obj.vatType === "object") {
                const vt = obj.vatType as Record<string, unknown>;
                if (vt.id === 0) vt.id = 6;
              }
              // Fix nested postings
              const voucher = obj.voucher as Record<string, unknown> | undefined;
              if (voucher?.postings && Array.isArray(voucher.postings)) {
                for (const p of voucher.postings as Array<Record<string, unknown>>) {
                  if (p.vatType && typeof p.vatType === "object") {
                    const vt = p.vatType as Record<string, unknown>;
                    if (vt.id === 0) vt.id = 6;
                  }
                }
              }
            };
            fixVat(body as Record<string, unknown>);
          }

          // === Phase 1C2: Auto-inject vatType on POST /product ===
          if (method === "POST" && /\/product\b/.test(path) && body) {
            applyProductDefaults(body as Record<string, unknown>);
          }

          // === Phase 1D: Auto-fill PUT /ledger/account ===
          if (method === "PUT" && path.includes("/ledger/account") && !path.includes("/:") && body) {
            const b = body as Record<string, unknown>;
            if (!b.bankAccountNumber) b.bankAccountNumber = "86011117947";
            if (!b.id || !b.version) {
              const match = path.match(/\/ledger\/account\/(\d+)/);
              if (match) {
                const getResult = await client.get(
                  `/ledger/account/${match[1]}`,
                  { fields: "id,version,name,bankAccountNumber" },
                );
                if (getResult.ok) {
                  const val = (getResult.data as Record<string, unknown>)
                    ?.value as Record<string, unknown> | undefined;
                  if (val) {
                    if (!b.id) b.id = val.id;
                    if (!b.version) b.version = val.version;
                    if (!b.name) b.name = val.name;
                  }
                }
              }
            }
          }

          // === Phase 1F: Auto-inject orderDate/deliveryDate on POST /order ===
          if (method === "POST" && /\/order\b/.test(path) && !path.includes("/orderLine") && body) {
            const b = body as Record<string, unknown>;
            if (!b.orderDate) b.orderDate = today;
            if (!b.deliveryDate) b.deliveryDate = today;
          }

          // === Phase 1E: Auto-inject date ranges on GET ===
          if (method === "GET") {
            params = applyDateRangeDefaults(path, params);
            // Strip known-invalid fields the model hallucinates
            if (params?.fields && typeof params.fields === "string") {
              const cleaned = stripInvalidFields(params.fields);
              if (cleaned !== params.fields) params = { ...params, fields: cleaned };
            }
          }

          let callResult: TxResult;
          switch (method) {
            case "GET":
              callResult = await client.get(path, params);
              break;
            case "POST":
              callResult = await client.post(path, body, params);
              break;
            case "PUT":
              callResult = await client.put(path, body, params);
              break;
            case "DELETE":
              callResult = await client.delete(path);
              break;
          }

          // Auto-retry 409 RevisionException (transient version conflict)
          if (!callResult.ok && callResult.status === 409) {
            await new Promise((r) => setTimeout(r, 800));
            switch (method) {
              case "POST":
                callResult = await client.post(path, body, params);
                break;
              case "PUT":
                callResult = await client.put(path, body, params);
                break;
            }
            // Second retry if still failing
            if (!callResult.ok && (callResult.status === 409 || callResult.status === 500)) {
              await new Promise((r) => setTimeout(r, 1200));
              switch (method) {
                case "POST":
                  callResult = await client.post(path, body, params);
                  break;
                case "PUT":
                  callResult = await client.put(path, body, params);
                  break;
              }
            }
          }

          // Auto-fix employee name after 422 email-exists
          if (
            method === "POST" &&
            /\/employee\b/.test(path) &&
            !path.includes("/employment") &&
            !path.includes("/entitlement") &&
            !callResult.ok &&
            callResult.status === 422 &&
            callResult.validationMessages?.some(
              (v) => v.field === "email" && v.message.includes("allerede")
            ) &&
            body
          ) {
            const b = body as Record<string, unknown>;
            const email = b.email as string | undefined;
            const wantFirst = b.firstName as string | undefined;
            const wantLast = b.lastName as string | undefined;
            if (email && (wantFirst || wantLast)) {
              const getRes = await client.get("/employee", {
                email,
                fields: "id,firstName,lastName,version,dateOfBirth",
              });
              if (getRes.ok) {
                const values = (getRes.data as Record<string, unknown>)
                  ?.values as Array<Record<string, unknown>> | undefined;
                const existing = values?.[0];
                if (existing) {
                  const needsUpdate =
                    (wantFirst && existing.firstName !== wantFirst) ||
                    (wantLast && existing.lastName !== wantLast);
                  if (needsUpdate) {
                    const putBody: Record<string, unknown> = {
                      id: existing.id,
                      version: existing.version,
                      firstName: wantFirst || existing.firstName,
                      lastName: wantLast || existing.lastName,
                      dateOfBirth: existing.dateOfBirth || "1990-01-15",
                    };
                    await client.put(`/employee/${existing.id}`, putBody);
                  }
                  // Return the existing employee as success so the model has the ID
                  callResult = {
                    ok: true,
                    data: { value: existing },
                  };
                }
              }
            }
          }

          // Auto-book supplier invoice vouchers (sendToLedger param doesn't work)
          if (method === "POST" && path.includes("supplierInvoice") && callResult.ok) {
            const voucherId = (callResult.data as Record<string, unknown>)?.value
              ? ((callResult.data as Record<string, unknown>).value as Record<string, unknown>)?.voucher
              : undefined;
            const vid = (voucherId as Record<string, unknown>)?.id;
            if (vid) {
              await client.put(`/ledger/voucher/${vid}/:sendToLedger`, {});
            }
          }

          // Only track failed POSTs; clear on success
          if (method === "POST" && body) {
            const key = retryKey(path, body as Record<string, unknown>);
            if (!callResult.ok) {
              failedPosts.set(key, body as Record<string, unknown>);
            } else {
              failedPosts.delete(key);
            }
          }

          // Enrich unhelpful errors with actionable hints
          if (!callResult.ok && (callResult.status === 409 || callResult.status === 422 || callResult.status === 500)) {
            callResult = enrichError(callResult, method, path);
          }

          // Truncate large GET list responses to prevent context overflow
          return truncateForLLM(callResult, method, path);
        },
      }),
    },
    stopWhen: [stepCountIs(30), errorBudgetExceeded(12)],
    prepareStep: ({ steps, stepNumber }) => {
      return buildAdaptiveGuidance(steps, stepNumber, baseSystem);
    },
    onStepFinish: (event) => {
      try {
        for (const tc of event.toolCalls ?? []) {
          const input = tc.input as { method?: string; path?: string } | undefined;
          if (input?.method && input?.path) {
            console.log(`[step ${event.stepNumber}] ${input.method} ${input.path}`);
          }
        }
      } catch {
        // Never let logging crash the agent
      }
    },
    timeout: { totalMs: 180_000, stepMs: 55_000 }, // 180s primary, 55s/step — leaves 100s for fallback model
    abortSignal: signal,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  try {
    result = await doGenerate(selectedModel);
  } catch (e: unknown) {
    // If parent signal aborted (real timeout from api.ts), re-throw
    if (signal?.aborted) throw e;
    // If the model timed out on first step with 0 work done, try fallback model
    const isTimeout = e instanceof Error && (e.name === "AbortError" || e.message.includes("timeout"));
    const isCreditExhausted = e instanceof Error && (e.message.includes("credit balance") || e.message.includes("billing") || e.message.includes("rate_limit"));
    if ((isTimeout || isCreditExhausted) && FALLBACK_MODEL_ID !== selectedModel) {
      console.warn(`[solve] Primary model ${isTimeout ? 'timed out' : 'credit exhausted'}, retrying with ${FALLBACK_MODEL_ID}`);
      selectedModel = FALLBACK_MODEL_ID;
      result = await doGenerate(selectedModel);
    } else {
      throw e;
    }
  }

  // Derive logging from result.steps
  const toolCallDetails = (result.steps as any[]).flatMap((step: any) =>
    step.staticToolCalls.map((tc: any, i: number) => {
      const tr = step.staticToolResults[i];
      const res = tr?.output as TxResult | undefined;
      return {
        method: tc.input.method,
        path: tc.input.path,
        ok: res?.ok ?? false,
        status: res && !res.ok ? res.status : undefined,
        params: tc.input.params || undefined,
        body: tc.input.body || undefined,
        errorMessage: res && !res.ok ? res.message : undefined,
        validationMessages:
          res && !res.ok ? res.validationMessages : undefined,
      };
    })
  );

  const apiCalls = toolCallDetails.length;
  const apiErrors = toolCallDetails.filter((d: any) => !d.ok).length;

  logSolve({
    timestamp: new Date().toISOString(),
    model: selectedModel,
    taskType,
    prompt: request.prompt,
    filesCount: request.files.length,
    steps: result.steps.length,
    toolCalls: apiCalls,
    apiCalls,
    apiErrors,
    elapsedMs: Date.now() - startMs,
    status: "completed",
    toolCallDetails,
  });

  return { status: "completed" };
}
