/**
 * LLM-based task classifier for ambiguous prompts.
 * Only used as fallback when keyword classifier returns "unknown".
 */

import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const ClassificationSchema = z.object({
  taskType: z.enum([
    "customer", "employee", "employee-admin", "invoice", "invoice-payment",
    "invoice-send", "credit-note", "project", "salary", "supplier-invoice",
    "supplier", "contact", "department", "product", "voucher", "timesheet",
    "travel-expense", "travel-expense-full", "update-employee", "update-customer",
    "delete-travel", "delete-voucher", "unknown",
  ]).describe("The task type that best matches the prompt"),
});

export async function classifyWithLLM(prompt: string, signal?: AbortSignal): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000); // 8s max
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  try {
    const { experimental_output } = await generateText({
      model: google("gemini-3.1-flash-lite-preview"),
      output: Output.object({ schema: ClassificationSchema }),
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `Classify this Tripletex accounting task into one type. The task is in one of 7 languages (Norwegian, English, Spanish, Portuguese, German, French, Nynorsk).

Task types:
- customer: Create a customer
- employee: Create an employee (with start date, employment)
- employee-admin: Create employee with admin role
- invoice: Create an invoice
- invoice-payment: Register payment on invoice, or create order+invoice+payment
- invoice-send: Create and send invoice
- credit-note: Credit/reverse an invoice
- project: Create project, project lifecycle
- salary: Run payroll, salary from PDF contract
- supplier-invoice: Register supplier invoice or receipt expense
- supplier: Register a supplier
- contact: Create a contact person
- department: Create departments
- product: Create a product
- voucher: Bank reconciliation, error correction, reminder fees, monthly closing, year-end closing, custom dimensions, journal vouchers, foreign currency agio/disagio
- timesheet: Register hours, time tracking
- travel-expense: Simple travel expense
- travel-expense-full: Travel expense with per diem, costs
- update-employee: Update existing employee
- update-customer: Update existing customer
- delete-travel: Delete travel expense
- delete-voucher: Delete/reverse voucher
- unknown: Cannot determine

PROMPT:
${prompt.slice(0, 500)}`,
        }],
      }],
      temperature: 0,
      abortSignal: ac.signal,
    });
    clearTimeout(timer);
    return (experimental_output as { taskType: string })?.taskType || "unknown";
  } catch {
    clearTimeout(timer);
    return "unknown";
  }
}
