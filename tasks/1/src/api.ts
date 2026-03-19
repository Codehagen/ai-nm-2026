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

  const startMs = Date.now();
  try {
    const response = await solve(request, ac.signal);
    console.log(`[solve] Completed in ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
    return c.json(response);
  } catch (e: unknown) {
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    if (e instanceof Error && e.name === "AbortError") {
      console.error(`[solve] TIMEOUT after ${elapsed}s — returning completed with partial work`);
      return c.json({ status: "completed" as const });
    }
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[solve] FAILED after ${elapsed}s: ${errMsg}`);
    return c.json({ status: "completed" as const });
  } finally {
    clearTimeout(timer);
  }
});

console.log(`Tripletex agent running on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });
