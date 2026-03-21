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

const EXTRACT_MODEL_ID = process.env.EXTRACT_MODEL_ID || process.env.MODEL_ID || "gemini-3.1-pro-preview";

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
  "salary": "Extract employee name and salary components. Map: 'fastlønn/fast lønn/base salary/grunnlønn' → fastlonn, 'bonus' → bonus, 'timelønn/hourly' → timelonn, 'faste tillegg/fixed supplement/tillegg' → faste_tillegg, 'overtid/overtime' → overtid. If unclear, use 'fastlonn'. The 'amount' is the NOK value. 'count' is 1 for monthly salary or number of hours for hourly.",
  "project": "Extract project details, project manager (employee), and customer. If the prompt mentions invoicing, set invoice.create=true and extract products.",
  "supplier-invoice": "Extract supplier details, invoice number, dates, amounts, and description. Figure out the appropriate expense account (7300=office services, 6300=insurance/rent, 4300=goods for resale, 6800=IT/software). Calculate amount including VAT from amount excluding VAT if needed.",
  "timesheet": "Extract employee, project, customer, and time entries (activity name, date, hours). If the prompt also asks to invoice, set invoice.create=true and extract invoice products.",
  "credit-note": "Extract customer and determine if this is for an existing invoice (isExistingInvoice=true) or needs a new invoice created first (createNewInvoice=true). Extract products if creating a new invoice.",
};

function buildExtractionPrompt(request: SolveRequest, taskType: string): string {
  const instructions = TASK_INSTRUCTIONS[taskType] || "";
  return `Extract structured data from this accounting task prompt.

${instructions}

IMPORTANT RULES:
- Extract names, numbers, amounts EXACTLY as written in the prompt (they are used for scoring)
- Dates should be in YYYY-MM-DD format
- If a date is not specified, leave it empty (the system will use today's date)
- Amounts should be numbers (no currency symbols)
- VAT defaults to 25% unless otherwise specified
- Product/item names should be preserved exactly as in the prompt

PROMPT:
${request.prompt}`;
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

  const { experimental_output } = await generateText({
    model: getModel(EXTRACT_MODEL_ID),
    output: Output.object({ schema }),
    messages,
    temperature: 0,
    abortSignal: signal,
  });

  if (!experimental_output) throw new Error("LLM extraction returned no structured output");
  return experimental_output;
}

export function hasSchema(taskType: string): boolean {
  return taskType in TASK_SCHEMAS;
}
