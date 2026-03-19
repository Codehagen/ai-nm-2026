import { generateText, tool, stepCountIs } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: process.env.AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1/ai",
});
import type { SolveRequest, SolveResponse } from "./dtos.js";
import { TripletexClient } from "./tripletex.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

/**
 * Main agent entrypoint. Uses Claude to interpret the prompt and
 * execute Tripletex API calls via tool use.
 */
export async function solve(
  request: SolveRequest,
  signal?: AbortSignal
): Promise<SolveResponse> {
  const client = new TripletexClient(request.tripletex_credentials);

  // Build user message content parts
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string; filename?: string }
  > = [{ type: "text", text: request.prompt }];

  // Add file attachments as content parts
  for (const f of request.files) {
    if (f.mime_type.startsWith("image/")) {
      content.push({
        type: "image",
        image: f.content_base64,
      });
    } else {
      content.push({
        type: "file",
        data: f.content_base64,
        mediaType: f.mime_type,
        filename: f.filename,
      });
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const result = await generateText({
    model: gateway("anthropic/claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT + `\n\nToday's date: ${today}`,
    messages: [{ role: "user", content }],
    tools: {
      tripletex_request: tool({
        description:
          "Call the Tripletex v2 REST API. Returns {ok: true, data: ...} on success or {ok: false, status: number, error: string} on failure.",
        inputSchema: z.object({
          method: z
            .enum(["GET", "POST", "PUT", "DELETE"])
            .describe("HTTP method"),
          path: z
            .string()
            .describe("API path, e.g. /employee, /customer, /invoice/{id}/:payment"),
          body: z
            .any()
            .optional()
            .describe("JSON body for POST/PUT requests"),
          params: z
            .record(z.string())
            .optional()
            .describe("Query parameters, e.g. {fields: 'id,name', count: '100'}"),
        }),
        execute: async ({ method, body, path, params }) => {
          switch (method) {
            case "GET":
              return client.get(path, params);
            case "POST":
              return client.post(path, body, params);
            case "PUT":
              return client.put(path, body, params);
            case "DELETE":
              return client.delete(path);
          }
        },
      }),
    },
    stopWhen: stepCountIs(25),
    abortSignal: signal,
  });

  console.log(
    `[agent] Done. Steps: ${result.steps.length}, ` +
      `Tool calls: ${result.steps.reduce((n, s) => n + s.toolCalls.length, 0)}`
  );

  return { status: "completed" };
}
