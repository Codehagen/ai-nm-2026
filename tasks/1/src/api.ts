import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { PredictRequestSchema } from "./dtos.js";
import { predict } from "./model.js";

const app = new Hono();
const startupTime = Date.now();

const PORT = 9053;

app.get("/", (c) => {
  return c.json({ status: "ok", service: "tripletex-task" });
});

app.get("/api", (c) => {
  const uptimeMs = Date.now() - startupTime;
  return c.json({ service: "tripletex-task", uptime: `${uptimeMs}ms` });
});

app.post("/predict", zValidator("json", PredictRequestSchema), (c) => {
  const request = c.req.valid("json");
  const response = predict(request);
  return c.json(response);
});

console.log(`Tripletex task API running on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });
