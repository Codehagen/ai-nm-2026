/**
 * Deterministic orchestrator entry point.
 * classify → extract (1 LLM call) → execute (deterministic) → fallback to LLM agent
 */

import type { SolveRequest, SolveResponse } from "../dtos.js";
import { TripletexClient } from "../tripletex.js";
import { classifyTask, type TaskType } from "../task-classifier.js";
import { classifyFromFiles } from "../file-utils.js";
import { logSolve } from "../logger.js";
import { solve } from "../model.js";
import { extractForTask, hasSchema } from "./extract.js";
import { OrchestratorContext } from "./helpers.js";

import { executeInvoice } from "./execute/invoice.js";
import { executeSalary } from "./execute/salary.js";
import { executeProject } from "./execute/project.js";
import { executeSupplierInvoice } from "./execute/supplier-invoice.js";
import { executeTimesheet } from "./execute/timesheet.js";
import { executeCreditNote } from "./execute/credit-note.js";

import type { InvoiceData } from "./schemas/invoice.js";
import type { SalaryData } from "./schemas/salary.js";
import type { ProjectData } from "./schemas/project.js";
import type { SupplierInvoiceData } from "./schemas/supplier-invoice.js";
import type { TimesheetData } from "./schemas/timesheet.js";
import type { CreditNoteData } from "./schemas/credit-note.js";

/** Task types that have deterministic orchestrators */
const ORCHESTRATED_TASKS = new Set<TaskType>([
  "invoice",
  "invoice-payment",
  "invoice-send",
  "salary",
  "project",
  "supplier-invoice",
  "timesheet",
  "credit-note",
]);

/** Execute the deterministic handler for a given task type */
async function executeTask(
  taskType: TaskType,
  ctx: OrchestratorContext,
  data: unknown,
): Promise<void> {
  switch (taskType) {
    case "invoice":
    case "invoice-payment":
    case "invoice-send":
      return executeInvoice(ctx, data as InvoiceData);
    case "salary":
      return executeSalary(ctx, data as SalaryData);
    case "project":
      return executeProject(ctx, data as ProjectData);
    case "supplier-invoice":
      return executeSupplierInvoice(ctx, data as SupplierInvoiceData);
    case "timesheet":
      return executeTimesheet(ctx, data as TimesheetData);
    case "credit-note":
      return executeCreditNote(ctx, data as CreditNoteData);
    default:
      throw new Error(`No executor for task type: ${taskType}`);
  }
}

/**
 * Main orchestrator entry point.
 * Replaces solve() for known task types with deterministic execution.
 * Falls back to LLM agent for unknown tasks or on failure.
 */
export async function orchestrate(
  request: SolveRequest,
  signal?: AbortSignal,
): Promise<SolveResponse> {
  const startMs = Date.now();
  let taskType = classifyTask(request.prompt);

  // File hints override weak text classifications (e.g. "department" when a receipt PDF is attached)
  // Strong task types (salary, invoice, supplier-invoice, project, timesheet, credit-note) are kept.
  // Weak matches (department, customer, product, employee, unknown) can be overridden by file hints.
  if (request.files.length > 0) {
    const fileHint = classifyFromFiles(request.files);
    if (fileHint) {
      const weakTypes = new Set(["unknown", "department", "customer", "product", "employee", "contact"]);
      if (weakTypes.has(taskType)) {
        console.log(`[orchestrator] File hint overrides ${taskType} → ${fileHint}`);
        taskType = fileHint as TaskType;
      }
    }
  }

  console.log(`[orchestrator] Task type: ${taskType}`);

  if (ORCHESTRATED_TASKS.has(taskType) && hasSchema(taskType)) {
    const client = new TripletexClient(request.tripletex_credentials, signal);
    const ctx = new OrchestratorContext(client);

    try {
      // Phase 1: Extract structured data (ONE LLM call)
      console.log(`[orchestrator] Extracting data for ${taskType}...`);
      const extractStart = Date.now();
      const data = await extractForTask(taskType, request, signal);
      console.log(`[orchestrator] Extraction done in ${Date.now() - extractStart}ms`);

      // Phase 2: Execute deterministically
      console.log(`[orchestrator] Executing ${taskType}...`);
      await executeTask(taskType, ctx, data);

      // Log success
      const apiErrors = ctx.apiCalls.filter((c) => !c.ok).length;
      logSolve({
        timestamp: new Date().toISOString(),
        model: process.env.EXTRACT_MODEL_ID || process.env.MODEL_ID || "gemini-3.1-pro-preview",
        taskType: `orchestrator:${taskType}`,
        prompt: request.prompt,
        filesCount: request.files.length,
        steps: 1, // 1 LLM step (extraction)
        toolCalls: ctx.apiCalls.length,
        apiCalls: ctx.apiCalls.length,
        apiErrors,
        elapsedMs: Date.now() - startMs,
        status: "completed",
        toolCallDetails: ctx.apiCalls,
      });

      return { status: "completed" };
    } catch (e: unknown) {
      // Re-throw AbortError for timeout handling
      if (e instanceof Error && e.name === "AbortError") throw e;

      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn(`[orchestrator] Failed for ${taskType}: ${errMsg}`);
      console.warn(`[orchestrator] Falling back to LLM agent...`);

      // Log the failed orchestrator attempt
      const apiErrors = ctx.apiCalls.filter((c) => !c.ok).length;
      logSolve({
        timestamp: new Date().toISOString(),
        model: "orchestrator-failed",
        taskType: `orchestrator:${taskType}:failed`,
        prompt: request.prompt,
        filesCount: request.files.length,
        steps: 1,
        toolCalls: ctx.apiCalls.length,
        apiCalls: ctx.apiCalls.length,
        apiErrors,
        elapsedMs: Date.now() - startMs,
        status: "error",
        error: errMsg,
        toolCallDetails: ctx.apiCalls,
      });

      // Fallback to LLM agent
      return solve(request, signal);
    }
  }

  // Not an orchestrated task — use LLM agent directly
  console.log(`[orchestrator] Task type ${taskType} not orchestrated, using LLM agent`);
  return solve(request, signal);
}
