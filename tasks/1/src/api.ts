import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { SolveRequestSchema } from "./dtos.js";
import { solve } from "./model.js";

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("FATAL: AI_GATEWAY_API_KEY environment variable is not set");
  process.exit(1);
}

const app = new Hono();
const startupTime = Date.now();
const SOLVE_TIMEOUT_MS = 270_000; // 4.5 min (30s buffer before 5 min competition limit)

const PORT = 9053;

app.get("/", (c) => {
  return c.json({ status: "ok", service: "tripletex-agent" });
});

app.get("/api", (c) => {
  const uptimeMs = Date.now() - startupTime;
  return c.json({ service: "tripletex-agent", uptime: `${uptimeMs}ms` });
});

app.post("/solve", zValidator("json", SolveRequestSchema), async (c) => {
  const request = c.req.valid("json");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SOLVE_TIMEOUT_MS);

  try {
    const response = await solve(request, ac.signal);
    return c.json(response);
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      console.warn("[timeout] 4.5min hit — returning completed with partial work");
      return c.json({ status: "completed" as const });
    }
    console.error("[solve] Unhandled error:", e);
    return c.json({ status: "completed" as const });
  } finally {
    clearTimeout(timer);
  }
});

console.log(`Tripletex agent running on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });
