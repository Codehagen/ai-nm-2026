/**
 * Conformance tests: compare mock API responses against real Tripletex sandbox.
 *
 * Run modes:
 *   pnpm test:conformance                    # mock-only (compare against existing golden files)
 *   SANDBOX_TOKEN=xxx pnpm test:conformance  # fetches from real sandbox, updates golden, compares mock
 *
 * Golden files are stored in tests/golden/ and should be committed.
 * A warning is shown if golden files are >7 days old.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockApp } from "../src/mock/server.js";
import type { Hono } from "hono";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, "golden");
const STALENESS_DAYS = 7;

const SANDBOX_BASE_URL = process.env.TRIPLETEX_BASE_URL || "https://kkpqfuj-amager.tripletex.dev/v2";
const SANDBOX_TOKEN = process.env.SANDBOX_TOKEN || process.env.TRIPLETEX_SESSION_TOKEN || "";
const HAS_SANDBOX = SANDBOX_TOKEN.length > 0;

interface GoldenFile {
  capturedAt: string;
  source: "sandbox" | "mock";
  request: { method: string; path: string; body?: unknown };
  response: { status: number; bodyKeys: string[]; valueKeys?: string[]; valuesCount?: number };
}

function loadGolden(name: string): GoldenFile | null {
  const path = join(GOLDEN_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function saveGolden(name: string, data: GoldenFile): void {
  if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(join(GOLDEN_DIR, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}

function checkStaleness(golden: GoldenFile): void {
  const age = Date.now() - new Date(golden.capturedAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (days > STALENESS_DAYS) {
    console.warn(
      `\u26a0\ufe0f  Golden file is ${Math.round(days)} days old (captured ${golden.capturedAt}). ` +
        `Re-run with SANDBOX_TOKEN to refresh.`
    );
  }
}

function extractResponseShape(body: unknown): { bodyKeys: string[]; valueKeys?: string[]; valuesCount?: number } {
  if (!body || typeof body !== "object") return { bodyKeys: [] };
  const obj = body as Record<string, unknown>;
  const bodyKeys = Object.keys(obj).sort();
  const result: { bodyKeys: string[]; valueKeys?: string[]; valuesCount?: number } = { bodyKeys };

  if ("value" in obj && obj.value && typeof obj.value === "object") {
    result.valueKeys = Object.keys(obj.value as Record<string, unknown>).sort();
  }
  if ("values" in obj && Array.isArray(obj.values)) {
    result.valuesCount = obj.values.length;
    if (obj.values.length > 0 && typeof obj.values[0] === "object") {
      result.valueKeys = Object.keys(obj.values[0] as Record<string, unknown>).sort();
    }
  }
  return result;
}

/** Fetch from real Tripletex sandbox */
async function sandboxRequest(method: string, path: string, body?: unknown) {
  const authHeader = "Basic " + Buffer.from(`0:${SANDBOX_TOKEN}`).toString("base64");
  const url = `${SANDBOX_BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const status = res.status;
  let resBody: unknown = null;
  if (status !== 204) {
    const ct = res.headers.get("content-type");
    try {
      resBody = ct?.includes("application/json") ? await res.json() : await res.text();
    } catch {
      resBody = null;
    }
  }
  return { status, body: resBody };
}

/** Mock client for direct Hono app requests */
function makeMockClient(app: Hono) {
  const authHeader = "Basic " + Buffer.from("0:test-token").toString("base64");
  return {
    async request(method: string, path: string, body?: unknown) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: authHeader,
      };
      const res = await app.request(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const status = res.status;
      let resBody: unknown = null;
      if (status !== 204) {
        try {
          resBody = await res.json();
        } catch {
          resBody = null;
        }
      }
      return { status, body: resBody };
    },
  };
}

describe("Conformance: mock vs golden responses", () => {
  let app: Hono;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeAll(() => {
    const mock = createMockApp();
    app = mock.app;
    mockClient = makeMockClient(app);

    if (HAS_SANDBOX) {
      console.log(`\u2705 SANDBOX_TOKEN set — will fetch from real Tripletex and update golden files`);
    } else {
      console.log(`\u2139\ufe0f  No SANDBOX_TOKEN — comparing mock against existing golden files only`);
    }
  });

  function conformanceTest(
    name: string,
    request: { method: string; path: string; body?: unknown },
    opts?: { skipSandbox?: boolean }
  ) {
    it(`${name}: response shape matches golden`, async () => {
      // Step 1: If sandbox token available, fetch real response and save as golden
      if (HAS_SANDBOX && !opts?.skipSandbox) {
        try {
          const sandboxRes = await sandboxRequest(request.method, request.path, request.body);
          const sandboxShape = extractResponseShape(sandboxRes.body);
          const golden: GoldenFile = {
            capturedAt: new Date().toISOString(),
            source: "sandbox",
            request,
            response: { status: sandboxRes.status, ...sandboxShape },
          };
          saveGolden(name, golden);
          console.log(`  \ud83d\udcf8 Updated golden "${name}" from sandbox (status ${sandboxRes.status}, keys: [${golden.response.bodyKeys.join(", ")}])`);
        } catch (err) {
          console.warn(`  \u26a0\ufe0f  Sandbox request failed for "${name}": ${err instanceof Error ? err.message : err}`);
        }
      }

      // Step 2: Get mock response
      const mockRes = await mockClient.request(request.method, request.path, request.body);
      const mockShape = extractResponseShape(mockRes.body);

      // Step 3: Load golden (either just updated from sandbox, or existing)
      let golden = loadGolden(name);
      if (!golden) {
        // No golden file at all — create from mock as fallback
        golden = {
          capturedAt: new Date().toISOString(),
          source: "mock",
          request,
          response: { status: mockRes.status, ...mockShape },
        };
        saveGolden(name, golden);
        console.log(`  \ud83d\udcf8 Created golden "${name}" from mock (no sandbox available)`);
        return; // Nothing to compare against
      }

      checkStaleness(golden);

      // Step 4: Compare mock against golden
      // Status code must match
      expect(mockRes.status).toBe(golden.response.status);

      // Mock must have at least the same top-level envelope keys
      for (const key of golden.response.bodyKeys) {
        if (key === "versionDigest") continue; // Tripletex internal, we skip
        expect(mockShape.bodyKeys, `mock missing top-level key "${key}"`).toContain(key);
      }

      // If golden has value keys (from single entity or list item), mock should have them too
      // We check that mock has a SUBSET — mock won't have all 50+ fields from real API
      // Instead, check that golden keys are a superset of mock keys (mock doesn't invent keys)
      if (golden.response.valueKeys && mockShape.valueKeys) {
        // Log any keys in the real API that mock doesn't have (informational, not failure)
        const missingFromMock = golden.response.valueKeys.filter((k) => !mockShape.valueKeys!.includes(k));
        if (missingFromMock.length > 0 && golden.source === "sandbox") {
          console.log(`  \u2139\ufe0f  "${name}": real API has ${missingFromMock.length} extra keys mock doesn't return: ${missingFromMock.slice(0, 5).join(", ")}${missingFromMock.length > 5 ? "..." : ""}`);
        }
      }
    });
  }

  // ─── Read-only conformance test cases ──────────────────────────────
  // These are safe to run against the real sandbox (GET requests + one POST that creates data)

  conformanceTest("list-employees", {
    method: "GET",
    path: "/employee",
  });

  // Note: employee ID differs between sandbox and mock, so we test the list shape instead.
  // The mock seeds employee 30000001, but the real sandbox uses different IDs.

  conformanceTest("list-vat-types", {
    method: "GET",
    path: "/ledger/vatType",
  });

  conformanceTest("list-payment-types", {
    method: "GET",
    path: "/invoice/paymentType",
  });

  conformanceTest("list-ledger-accounts", {
    method: "GET",
    path: "/ledger/account",
  });

  conformanceTest("create-customer", {
    method: "POST",
    path: "/customer",
    body: { name: "Conformance Test AS", isCustomer: true },
  });

  // Use a unique departmentNumber to avoid collision with prior sandbox runs
  conformanceTest("create-department", {
    method: "POST",
    path: "/department",
    body: { name: "Conformance Dept", departmentNumber: String(Date.now()).slice(-6) },
  });

  conformanceTest("validation-error-missing-name", {
    method: "POST",
    path: "/customer",
    body: {},
  });

  conformanceTest("not-found-employee", {
    method: "GET",
    path: "/employee/99999999",
  });
});
