import { generateText, tool, stepCountIs } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";
import type { SolveRequest, SolveResponse } from "./dtos.js";
import { TripletexClient } from "./tripletex.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { logSolve, type SolveLog } from "./logger.js";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL:
    process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1/ai",
});

/** Oslo timezone date (avoids UTC midnight drift) */
function getOsloDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
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

  // Track API calls for observability
  let apiCalls = 0;
  let apiErrors = 0;
  const toolCallDetails: SolveLog["toolCallDetails"] = [];

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
    model: gateway("anthropic/claude-sonnet-4-20250514"),
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
          apiCalls++;
          let result;
          switch (method) {
            case "GET":
              result = await client.get(path, params);
              break;
            case "POST":
              result = await client.post(path, body, params);
              break;
            case "PUT":
              result = await client.put(path, body, params);
              break;
            case "DELETE":
              result = await client.delete(path);
              break;
          }
          toolCallDetails!.push({
            method,
            path,
            ok: result.ok,
            status: result.ok ? undefined : result.status,
          });
          if (!result.ok) apiErrors++;
          return result;
        },
      }),
    },
    stopWhen: stepCountIs(30),
    abortSignal: signal,
  });

  const toolCalls = result.steps.reduce(
    (n, s) => n + s.toolCalls.length,
    0
  );

  logSolve({
    timestamp: new Date().toISOString(),
    prompt: request.prompt,
    filesCount: request.files.length,
    steps: result.steps.length,
    toolCalls,
    apiCalls,
    apiErrors,
    elapsedMs: Date.now() - startMs,
    status: "completed",
    toolCallDetails,
  });

  return { status: "completed" };
}
