import { generateText, tool, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type { SolveRequest, SolveResponse } from "./dtos.js";
import { TripletexClient, type TxResult } from "./tripletex.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { logSolve } from "./logger.js";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

const MODEL_ID = process.env.MODEL_ID || "gemini-3.1-pro-preview";

/** Oslo timezone date (avoids UTC midnight drift) */
function getOsloDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

/** Truncate large GET list responses to prevent context overflow */
export function truncateForLLM(result: TxResult, method: string): TxResult {
  if (!result.ok || method !== "GET") return result;
  const data = result.data as Record<string, unknown>;
  if (data?.values && Array.isArray(data.values) && data.values.length > 5) {
    return {
      ok: true,
      data: {
        ...data,
        values: data.values.slice(0, 5),
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
    return "The email already exists. GET /employee?email=<the email> to find the existing employee and use their ID instead of creating a new one.";
  }

  // Product number already in use
  if (vm?.some((v) => v.field === "number" && v.message.includes("i bruk"))) {
    return "The product number already exists. GET /product?number=<the number>&fields=id,name to find the existing product and use its ID.";
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

/**
 * Main agent entrypoint. Uses Claude to interpret the prompt and
 * execute Tripletex API calls via tool use.
 */
export async function solve(
  request: SolveRequest,
  signal?: AbortSignal
): Promise<SolveResponse> {
  const startMs = Date.now();
  const client = new TripletexClient(request.tripletex_credentials, signal);

  // Track failed POST bodies per entity identity to detect value-change on retry
  const failedPosts = new Map<string, Record<string, unknown>>();

  // Build user message content parts
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string; filename?: string }
  > = [{ type: "text", text: request.prompt }];

  for (const f of request.files) {
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

  const result = await generateText({
    model: google(MODEL_ID),
    temperature: 0, // Deterministic: reduces random errors on tool calls
    system: SYSTEM_PROMPT + `\n\nToday's date: ${today}`,
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
        execute: async ({ method, body, path, params }) => {
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

          // Only track failed POSTs; clear on success
          if (method === "POST" && body) {
            const key = retryKey(path, body as Record<string, unknown>);
            if (!callResult.ok) {
              failedPosts.set(key, body as Record<string, unknown>);
            } else {
              failedPosts.delete(key);
            }
          }

          // Enrich unhelpful 422 errors with actionable hints
          if (!callResult.ok && callResult.status === 422) {
            callResult = enrichError(callResult, method, path);
          }

          // Truncate large GET list responses to prevent context overflow
          return truncateForLLM(callResult, method);
        },
      }),
    },
    stopWhen: stepCountIs(30),
    abortSignal: signal,
  });

  // Change A: Derive logging from result.steps instead of closure variables
  const toolCallDetails = result.steps.flatMap((step) =>
    step.staticToolCalls.map((tc, i) => {
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
  const apiErrors = toolCallDetails.filter((d) => !d.ok).length;

  logSolve({
    timestamp: new Date().toISOString(),
    model: MODEL_ID,
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
