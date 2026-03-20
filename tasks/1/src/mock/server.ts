/**
 * Mock Tripletex API server.
 * Hono app on :9054 with Basic Auth, CRUD factory routes, and custom endpoints.
 *
 * Usage:
 *   tsx src/mock/server.ts           # start standalone server
 *   import { createMockApp } from ... # use in tests
 */

import { Hono } from "hono";
import { EntityStore } from "./store.js";
import { seedStore } from "./seed.js";
import { ENTITY_CONFIGS } from "./entities.js";
import { registerCrudRoutes } from "./crud-factory.js";
import { registerCustomRoutes } from "./custom-routes.js";

const MOCK_TOKEN = "mock-session-token";
const MOCK_PORT = 9054;

export function createMockApp(store?: EntityStore): { app: Hono; store: EntityStore } {
  const entityStore = store ?? new EntityStore(seedStore);
  const app = new Hono();

  // ─── Basic Auth Middleware ──────────────────────────────────────────
  app.use("*", async (c, next) => {
    // Skip auth for test-only endpoints
    if (c.req.path === "/_reset" || c.req.path === "/") {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return c.json({ status: 401, message: "Unauthorized: Missing or invalid Authorization header" }, 401);
    }

    // Decode and validate Basic Auth (username "0", password = session token)
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
      const [username] = decoded.split(":");
      if (username !== "0") {
        return c.json({ status: 401, message: "Unauthorized: Invalid credentials" }, 401);
      }
    } catch {
      return c.json({ status: 401, message: "Unauthorized: Malformed Authorization header" }, 401);
    }

    return next();
  });

  // ─── Health Check ──────────────────────────────────────────────────
  app.get("/", (c) => c.json({ status: "ok", service: "mock-tripletex" }));

  // ─── Custom Routes (must be registered before CRUD to take priority) ─
  registerCustomRoutes(app, entityStore);

  // ─── CRUD Routes ───────────────────────────────────────────────────
  for (const config of ENTITY_CONFIGS) {
    registerCrudRoutes(app, config, entityStore);
  }

  return { app, store: entityStore };
}

// ─── Standalone Server ─────────────────────────────────────────────────
const isMain = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");

if (isMain) {
  const { serve } = await import("@hono/node-server");
  const { app } = createMockApp();

  serve({ fetch: app.fetch, port: MOCK_PORT }, (info) => {
    console.log(`Mock Tripletex API running on http://localhost:${info.port}`);
    console.log(`Auth: Basic (username: "0", password: any token)`);
    console.log(`Reset: POST /_reset`);
  });
}

export { MOCK_TOKEN, MOCK_PORT };
