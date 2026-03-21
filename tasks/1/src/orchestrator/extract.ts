/**
 * LLM extraction layer.
 * ONE LLM call with task-specific Zod schema.
 * Extracts structured data from prompt + files.
 */

import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ZodSchema } from "zod";
import type { SolveRequest } from "../dtos.js";
import { preprocessFiles } from "../file-utils.js";

import { getOsloDate } from "./helpers.js";

import { InvoiceSchema } from "./schemas/invoice.js";
import { SalarySchema } from "./schemas/salary.js";
import { ProjectSchema } from "./schemas/project.js";
import { SupplierInvoiceSchema } from "./schemas/supplier-invoice.js";
import { TimesheetSchema } from "./schemas/timesheet.js";
import { CreditNoteSchema } from "./schemas/credit-note.js";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACT_MODEL_ID = process.env.EXTRACT_MODEL_ID || "gemini-3.1-pro-preview";
const FALLBACK_MODEL_ID = process.env.FALLBACK_MODEL_ID || "gemini-3.1-flash-lite-preview";
const EXTRACT_TIMEOUT_MS = 45_000; // 45s before falling back to faster model

function getModel(modelId: string) {
  if (modelId.startsWith("claude-") || modelId.startsWith("anthropic/")) {
    return anthropic(modelId);
  }
  return google(modelId);
}

// Map task types to their schemas
const TASK_SCHEMAS: Record<string, ZodSchema> = {
  "invoice": InvoiceSchema,
  "invoice-payment": InvoiceSchema,
  "invoice-send": InvoiceSchema,
  "salary": SalarySchema,
  "project": ProjectSchema,
  "supplier-invoice": SupplierInvoiceSchema,
  "timesheet": TimesheetSchema,
  "credit-note": CreditNoteSchema,
};

// Task-specific extraction instructions
const TASK_INSTRUCTIONS: Record<string, string> = {
  "invoice": "Extract customer, products, and whether to send/register payment. If no VAT rate is specified, default to 25%.",
  "invoice-payment": "This is about registering a PAYMENT on an invoice. Set registerPayment=true. If the invoice already exists (the task mentions finding/locating it), set isExistingInvoice=true. Extract the payment amount INCLUDING VAT.",
  "invoice-send": "Extract customer, products. Set sendInvoice=true since the task asks to send the invoice.",
  "salary": `Extract employee name and salary components. Map: 'fastlønn/fast lønn/base salary/grunnlønn' → fastlonn, 'bonus' → bonus, 'timelønn/hourly' → timelonn, 'faste tillegg/fixed supplement/tillegg' → faste_tillegg, 'overtid/overtime' → overtid. If unclear, use 'fastlonn'. The 'amount' is the NOK value. 'count' is 1 for monthly salary or number of hours for hourly.

IF A PDF/IMAGE IS ATTACHED (employment contract / arbeidskontrakt):
- Extract ALL fields from the document: dateOfBirth (fødselsdato → convert DD.MM.YYYY to YYYY-MM-DD), nationalIdentityNumber (personnummer, 11 digits), bankAccountNumber (bankkonto), departmentName (avdeling), occupationCode (stillingskode/STYRK, 4 digits), percentageOfFullTimeEquivalent (stillingsprosent, e.g. 80.0), startDate (tiltredelse → convert DD.MM.YYYY to YYYY-MM-DD).
- CRITICAL: If the salary is listed as 'årslønn' (annual salary), set isAnnual=true. The executor will divide by 12 to get monthly rate. Do NOT divide yourself.
- Use the exact department name from the document (e.g. 'Lager', 'IT'), not a generic name.`,
  "project": "Extract project details, project manager (employee), and customer. If the prompt mentions invoicing, set invoice.create=true and extract products.",
  "supplier-invoice": `Extract supplier details, invoice number, dates, amounts, and description. Figure out the appropriate expense account (7300=office services, 6300=insurance/rent, 4300=goods for resale, 6800=IT/software, 6540=office supplies, 6100=freight/shipping). Calculate amount including VAT from amount excluding VAT if needed.

IF the attached document is a RECEIPT (kvittering/recibo/receipt/Quittung/reçu):
- The STORE/VENDOR on the receipt is the supplier name
- IMPORTANT: If the prompt names a SPECIFIC item from the receipt (e.g. "despesa de Kundemøte lunsj"), use THAT item's price as amountInclVat — NOT the receipt total. Only use the total if the prompt asks for the full receipt.
- Calculate amountExclVat = amountInclVat / (1 + vatRate). For 25% VAT: amountExclVat = amountInclVat / 1.25
- Set invoiceDate from the receipt date
- If the prompt mentions a department name, extract it as departmentName
- Match the expense account to the SPECIFIC item: kundemøte/lunsj/middag → 7350 (representation), kontorrekvisita/utstyr → 6540, flybillett/reise → 7100, overnatting/hotell → 7100
- The description should match the specific item name from the prompt`,
  "timesheet": "Extract employee, project, customer, and time entries (activity name, date, hours). If the prompt also asks to invoice, set invoice.create=true and extract invoice products.",
  "credit-note": "Extract customer and determine if this is for an existing invoice (isExistingInvoice=true) or needs a new invoice created first (createNewInvoice=true). Extract products if creating a new invoice.",
};

function buildExtractionPrompt(request: SolveRequest, taskType: string): string {
  const instructions = TASK_INSTRUCTIONS[taskType] || "";
  const hasFiles = request.files.length > 0;
  const fileContext = hasFiles
    ? `\nATTACHED FILES: ${request.files.map((f) => f.filename).join(", ")}. Extract ALL data from these documents — they are the source of truth. Data in documents takes precedence over the text prompt.`
    : "";

  return `Extract structured data from this accounting task prompt.${fileContext}

EXTRACTION PROCESS — THINK STEP BY STEP:
1. Identify the document type (invoice, receipt, contract, bank statement) and language
2. Extract entity info (names, org numbers, emails, bank accounts)
3. Extract dates — convert DD.MM.YYYY to YYYY-MM-DD
4. Extract financial data (amounts, VAT rates, account numbers)
5. Validate: does amountExclVat × (1 + vatRate) ≈ amountInclVat?

${instructions}

FORMAT RULES:
- Names, numbers, amounts: extract EXACTLY as written (used for scoring)
- Dates: YYYY-MM-DD format. Convert DD.MM.YYYY → YYYY-MM-DD
- Norwegian numbers: 1.234,56 → 1234.56 (period = thousands, comma = decimal)
- Norwegian personnummer: 11 digits (DDMMYYXXXXX)
- Annual salary (årslønn): set isAnnual=true, do NOT divide by 12 yourself
- VAT defaults to 25% unless specified
- If a date is not specified, leave it empty (system uses today)

PROMPT:
${request.prompt}`;
}

/** Known date field names across all schemas */
const DATE_FIELDS = new Set([
  "dueDate", "invoiceDate", "startDate", "dateOfBirth", "date",
  "invoiceDueDate", "orderDate", "deliveryDate", "municipalityDate",
]);

/**
 * Recursively replace empty-string date fields with today's date.
 * Prevents 422 errors from Tripletex when extraction returns "" for dates.
 */
function sanitizeDates(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(sanitizeDates);
  if (typeof data === "object") {
    const today = getOsloDate();
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (DATE_FIELDS.has(key) && typeof value === "string" && value.trim() === "") {
        result[key] = today;
      } else if (typeof value === "object" && value !== null) {
        result[key] = sanitizeDates(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
}

export async function extractForTask(taskType: string, request: SolveRequest, signal?: AbortSignal): Promise<unknown> {
  const schema = TASK_SCHEMAS[taskType];
  if (!schema) throw new Error(`No schema for task type: ${taskType}`);

  // Build content parts (text + files)
  const messages: Array<{
    role: "user";
    content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; data: string; mediaType: string; filename?: string }
    >;
  }> = [{
    role: "user" as const,
    content: [
      { type: "text" as const, text: buildExtractionPrompt(request, taskType) },
    ],
  }];

  // Preprocess files: decode CSVs to text, keep PDFs/images as native content parts
  const { csvText, nativeFiles } = preprocessFiles(request.files);
  if (csvText) {
    messages[0].content[0] = {
      type: "text" as const,
      text: buildExtractionPrompt(request, taskType) + "\n\n" + csvText,
    };
  }
  for (const f of nativeFiles) {
    if (f.mime_type.startsWith("image/")) {
      messages[0].content.push({ type: "image" as const, image: f.content_base64 });
    } else {
      messages[0].content.push({
        type: "file" as const,
        data: f.content_base64,
        mediaType: f.mime_type,
        filename: f.filename,
      });
    }
  }

  // Try primary model with timeout, fallback to faster model
  let experimental_output: unknown = null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), EXTRACT_TIMEOUT_MS);
    // Respect parent abort signal
    signal?.addEventListener("abort", () => ac.abort(), { once: true });

    const result = await generateText({
      model: getModel(EXTRACT_MODEL_ID),
      output: Output.object({ schema }),
      messages,
      temperature: 0,
      abortSignal: ac.signal,
    });
    clearTimeout(timer);
    experimental_output = result.experimental_output;
  } catch (e: unknown) {
    // Re-throw if parent signal aborted (real timeout)
    if (signal?.aborted) throw e;
    const isTimeout = e instanceof Error && e.name === "AbortError";
    if (!isTimeout) throw e;

    console.warn(`[extract] Primary model timed out after ${EXTRACT_TIMEOUT_MS}ms, falling back to ${FALLBACK_MODEL_ID}`);
    const result = await generateText({
      model: getModel(FALLBACK_MODEL_ID),
      output: Output.object({ schema }),
      messages,
      temperature: 0,
      abortSignal: signal,
    });
    experimental_output = result.experimental_output;
  }

  if (!experimental_output) throw new Error("LLM extraction returned no structured output");
  return sanitizeDates(experimental_output);
}

export function hasSchema(taskType: string): boolean {
  return taskType in TASK_SCHEMAS;
}
