/**
 * Benchmark runner: sends all test prompts through agent → mock,
 * verifies correctness, measures API call efficiency.
 *
 * Supports parallel execution via --parallel N (spins up N mock instances).
 *
 * Usage:
 *   pnpm benchmark                        # sequential (needs mock:start + agent)
 *   pnpm benchmark --parallel 4           # 4 concurrent tests
 *   pnpm benchmark --id t1-customer-nb    # run single test
 *   pnpm benchmark --category create-employee
 *   pnpm benchmark --tier 1
 *
 * Requires:
 *   - Mock server on :9054 (pnpm mock:start) — or auto-started with --parallel
 *   - Agent server on :9053 (source .env.local && export AI_GATEWAY_API_KEY && pnpm start)
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createMockApp } from "../src/mock/server.js";
import { BENCHMARK_PROMPTS, PRESEED, type BenchmarkPrompt, type VerifyCheck } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "benchmark-results");

const AGENT_URL = process.env.AGENT_URL || "http://localhost:9053";
const MOCK_TOKEN = "mock-session-token";

// ─── Args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const filterCategory = args.includes("--category") ? args[args.indexOf("--category") + 1] : null;
const filterTier = args.includes("--tier") ? parseInt(args[args.indexOf("--tier") + 1]) : null;
const parallelCount = args.includes("--parallel") ? parseInt(args[args.indexOf("--parallel") + 1]) : 0;

// ─── Mock Instance Pool ─────────────────────────────────────────

interface MockInstance {
  port: number;
  url: string;
  auth: string;
  store: ReturnType<typeof createMockApp>["store"];
  server?: ReturnType<typeof serve>;
}

const BASE_MOCK_PORT = 19054; // Use high ports for parallel instances

async function createMockInstance(port: number): Promise<MockInstance> {
  const { app, store } = createMockApp();
  const url = `http://localhost:${port}`;
  const auth = "Basic " + Buffer.from(`0:${MOCK_TOKEN}`).toString("base64");

  const server = serve({ fetch: app.fetch, port });

  // Wait for server to be ready
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`${url}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return { port, url, auth, store, server };
}

function closeMockInstance(instance: MockInstance) {
  instance.server?.close();
}

// ─── HTTP Helpers (parameterized by mock instance) ───────────────

function makeMockClient(mock: MockInstance) {
  return {
    async get(path: string) {
      const res = await fetch(`${mock.url}${path}`, {
        headers: { Authorization: mock.auth, "Content-Type": "application/json" },
      });
      if (res.status === 204) return null;
      return res.json();
    },
    async post(path: string, body?: unknown) {
      const res = await fetch(`${mock.url}${path}`, {
        method: "POST",
        headers: { Authorization: mock.auth, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) return null;
      return res.json();
    },
    async put(path: string, body: unknown) {
      const res = await fetch(`${mock.url}${path}`, {
        method: "PUT",
        headers: { Authorization: mock.auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 204) return null;
      return res.json();
    },
    async reset() {
      if (mock.server) {
        // In-process mock: reset store directly
        mock.store.reset();
      } else {
        // External mock: HTTP reset
        await fetch(`${mock.url}/_reset`, { method: "POST" });
      }
    },
  };
}

async function solveViaAgent(prompt: string, mockUrl: string): Promise<{ status: number; elapsed: number; solveLog: any }> {
  const start = Date.now();
  const res = await fetch(`${AGENT_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      files: [],
      tripletex_credentials: {
        base_url: mockUrl,
        session_token: MOCK_TOKEN,
      },
    }),
  });
  const elapsed = Date.now() - start;

  // Read last solve log
  let solveLog = null;
  try {
    const logPath = join(__dirname, "..", "logs", "solves.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    solveLog = JSON.parse(lines[lines.length - 1]);
  } catch {}

  return { status: res.status, elapsed, solveLog };
}

// ─── Verification ────────────────────────────────────────────────

function getEntityPath(entity: string): string {
  const paths: Record<string, string> = {
    employee: "/employee", customer: "/customer", department: "/department",
    product: "/product", order: "/order", invoice: "/invoice",
    project: "/project", travelExpense: "/travelExpense",
    account: "/ledger/account", voucher: "/ledger/voucher",
    contact: "/contact", activity: "/activity",
    employment: "/employee/employment", salarySpecification: "/salary/specification",
    salaryType: "/salary/type", supplier: "/supplier",
  };
  return paths[entity] || `/${entity}`;
}

async function runVerification(checks: VerifyCheck[], client: ReturnType<typeof makeMockClient>): Promise<Array<{ check: string; pass: boolean; detail: string }>> {
  const results: Array<{ check: string; pass: boolean; detail: string }> = [];

  for (const check of checks) {
    let listUrl = getEntityPath(check.entity);
    if (check.entity === "invoice") listUrl += "?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-01-01";
    if (check.entity === "order") listUrl += "?orderDateFrom=2020-01-01&orderDateTo=2030-01-01";

    const data = await client.get(listUrl);
    const entities = data?.values || [];

    if (check.find === "count") {
      let count = entities.length;
      if (check.entity === "employee") count -= 1;
      const pass = count === (check.expectedCount ?? 0);
      results.push({
        check: `${check.entity} count = ${check.expectedCount}`,
        pass,
        detail: pass ? `${count}` : `expected ${check.expectedCount}, got ${count}`,
      });
      continue;
    }

    if (check.find === "any") {
      const found = entities.length > 0 ? entities[entities.length - 1] : null;
      if (!found) {
        results.push({ check: `${check.entity} exists`, pass: false, detail: "no entities found" });
        continue;
      }
      if (check.expectFields) {
        for (const [field, expected] of Object.entries(check.expectFields)) {
          const actual = found[field];
          const pass = actual === expected;
          results.push({
            check: `${check.entity}.${field} = ${JSON.stringify(expected)}`,
            pass, detail: pass ? "ok" : `got ${JSON.stringify(actual)}`,
          });
        }
      } else {
        results.push({ check: `${check.entity} exists`, pass: true, detail: "found" });
      }
      continue;
    }

    const { field, value } = check.find;
    const found = entities.find((e: any) => {
      const val = e[field];
      if (typeof val === "string" && typeof value === "string") return val.toLowerCase().includes(value.toLowerCase());
      return val === value;
    });

    if (!found) {
      results.push({ check: `${check.entity} with ${field}=${JSON.stringify(value)}`, pass: false, detail: `not found among ${entities.length} entities` });
      continue;
    }

    results.push({ check: `${check.entity} with ${field}=${JSON.stringify(value)}`, pass: true, detail: "found" });

    if (check.expectFields) {
      for (const [ef, expected] of Object.entries(check.expectFields)) {
        const actual = found[ef];
        const pass = String(actual).toLowerCase() === String(expected).toLowerCase() || actual === expected;
        results.push({ check: `  .${ef} = ${JSON.stringify(expected)}`, pass, detail: pass ? "ok" : `got ${JSON.stringify(actual)}` });
      }
    }
  }
  return results;
}

// ─── Pre-seeding ─────────────────────────────────────────────────

async function preseed(promptId: string, client: ReturnType<typeof makeMockClient>): Promise<void> {
  const seeds = PRESEED[promptId];
  if (!seeds) return;

  for (const seed of seeds) {
    await client.post(getEntityPath(seed.entity), seed.data);
  }

  // Credit note tests need full invoice chain pre-seeded
  if (promptId.startsWith("t2-credit-note")) {
    const customers = await client.get("/customer");
    const products = await client.get("/product");
    if (customers?.values?.length && products?.values?.length) {
      const custId = customers.values[customers.values.length - 1].id;
      const prodId = products.values[products.values.length - 1].id;
      const order = await client.post("/order", {
        customer: { id: custId }, deliveryDate: "2026-03-20", orderDate: "2026-03-20",
        orderLines: [{ product: { id: prodId }, count: 1, unitPriceExcludingVatCurrency: 1000, vatType: { id: 3 } }],
      });
      if (order?.value?.id) {
        const accts = await client.get("/ledger/account?number=1920");
        if (accts?.values?.length) {
          const acct = accts.values[0];
          await client.put(`/ledger/account/${acct.id}`, { id: acct.id, version: acct.version, bankAccountNumber: "12345678901" });
        }
        await client.post("/invoice", { invoiceDate: "2026-03-20", invoiceDueDate: "2026-04-20", orders: [{ id: order.value.id }] });
      }
    }
  }
}

// ─── Run Single Benchmark ────────────────────────────────────────

interface BenchmarkResult {
  id: string;
  category: string;
  tier: number;
  lang: string;
  status: "pass" | "fail" | "error";
  apiCalls: number;
  apiErrors: number;
  optimalCalls: number;
  callEfficiency: string;
  elapsedMs: number;
  checks: Array<{ check: string; pass: boolean; detail: string }>;
  failedChecks: string[];
  toolCallDetails?: Array<{ method: string; path: string; ok: boolean; status?: number }>;
}

async function runBenchmark(prompt: BenchmarkPrompt, mock: MockInstance): Promise<BenchmarkResult> {
  const client = makeMockClient(mock);
  await client.reset();
  await preseed(prompt.id, client);

  const { status, elapsed, solveLog } = await solveViaAgent(prompt.prompt, mock.url);
  const apiCalls = solveLog?.apiCalls ?? 0;
  const apiErrors = solveLog?.apiErrors ?? 0;
  const toolCallDetails = solveLog?.toolCallDetails;

  const checks = await runVerification(prompt.verify, client);
  const failedChecks = checks.filter((c) => !c.pass).map((c) => `${c.check}: ${c.detail}`);
  const allPassed = failedChecks.length === 0;

  const efficiency = prompt.optimalCalls > 0
    ? Math.round((prompt.optimalCalls / Math.max(apiCalls, 1)) * 100) : 100;

  return {
    id: prompt.id, category: prompt.category, tier: prompt.tier, lang: prompt.lang,
    status: status !== 200 ? "error" : allPassed ? "pass" : "fail",
    apiCalls, apiErrors, optimalCalls: prompt.optimalCalls,
    callEfficiency: `${Math.min(efficiency, 100)}%`,
    elapsedMs: elapsed, checks, failedChecks, toolCallDetails,
  };
}

// ─── Print Result ────────────────────────────────────────────────

function printResult(result: BenchmarkResult, index: number, total: number) {
  const icon = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "ERR ";
  const callInfo = `${result.apiCalls}/${result.optimalCalls} calls (${result.callEfficiency})`;
  const errInfo = result.apiErrors > 0 ? ` ${result.apiErrors} err` : "";
  const time = `${(result.elapsedMs / 1000).toFixed(1)}s`;
  console.log(`[${String(index).padStart(2)}/${total}] ${result.id.padEnd(28)} ${icon} | ${callInfo.padEnd(20)}${errInfo.padEnd(6)} | ${time}`);
  if (result.failedChecks.length > 0) {
    for (const fc of result.failedChecks) console.log(`       FAIL: ${fc}`);
  }
  if (result.apiErrors > 0 && result.toolCallDetails) {
    for (const tc of result.toolCallDetails) {
      if (!tc.ok) console.log(`       ERR:  ${tc.method} ${tc.path} -> ${tc.status}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  // Check agent is up
  try {
    await fetch(`${AGENT_URL}/`);
  } catch {
    console.error(`Agent server not running at ${AGENT_URL}.\nStart with: source .env.local && export AI_GATEWAY_API_KEY && pnpm start`);
    process.exit(1);
  }

  // Filter prompts
  let prompts = BENCHMARK_PROMPTS;
  if (filterId) prompts = prompts.filter((p) => p.id === filterId);
  if (filterCategory) prompts = prompts.filter((p) => p.category === filterCategory);
  if (filterTier) prompts = prompts.filter((p) => p.tier === filterTier);

  if (prompts.length === 0) {
    console.error("No prompts match filter.");
    process.exit(1);
  }

  const isParallel = parallelCount > 0;
  const concurrency = isParallel ? Math.min(parallelCount, prompts.length) : 1;

  console.log(`\n${"═".repeat(90)}`);
  console.log(`  TRIPLETEX AGENT BENCHMARK — ${prompts.length} prompts${isParallel ? ` (${concurrency} parallel)` : ""}`);
  console.log(`${"═".repeat(90)}\n`);

  // Create mock instances
  const mocks: MockInstance[] = [];
  if (isParallel) {
    console.log(`  Starting ${concurrency} mock instances...`);
    for (let i = 0; i < concurrency; i++) {
      mocks.push(await createMockInstance(BASE_MOCK_PORT + i));
    }
    console.log(`  Mock instances ready on ports ${mocks.map((m) => m.port).join(", ")}\n`);
  } else {
    // Check external mock
    const externalMockUrl = process.env.MOCK_URL || "http://localhost:9054";
    try {
      await fetch(`${externalMockUrl}/`);
    } catch {
      console.error(`Mock server not running at ${externalMockUrl}. Start with: pnpm mock:start\nOr use --parallel N to auto-start mocks.`);
      process.exit(1);
    }
    // Create a wrapper for the external mock (store not used for reset — uses HTTP)
    mocks.push({
      port: 9054,
      url: externalMockUrl,
      auth: "Basic " + Buffer.from(`0:${MOCK_TOKEN}`).toString("base64"),
      store: null as any, // not used — external mock resets via HTTP
    });
  }

  const results: BenchmarkResult[] = [];
  let completedCount = 0;

  if (isParallel) {
    // Parallel execution: process prompts in batches of `concurrency`
    for (let batchStart = 0; batchStart < prompts.length; batchStart += concurrency) {
      const batch = prompts.slice(batchStart, batchStart + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (p, i) => {
          const mock = mocks[i % mocks.length];
          try {
            return await runBenchmark(p, mock);
          } catch (err) {
            return {
              id: p.id, category: p.category, tier: p.tier, lang: p.lang,
              status: "error" as const, apiCalls: 0, apiErrors: 0,
              optimalCalls: p.optimalCalls, callEfficiency: "0%",
              elapsedMs: 0, checks: [], failedChecks: [`Runtime: ${err instanceof Error ? err.message : err}`],
            };
          }
        })
      );
      for (const result of batchResults) {
        completedCount++;
        results.push(result);
        printResult(result, completedCount, prompts.length);
      }
    }
  } else {
    // Sequential execution
    for (const p of prompts) {
      completedCount++;
      try {
        const result = await runBenchmark(p, mocks[0]);
        results.push(result);
        printResult(result, completedCount, prompts.length);
      } catch (err) {
        const result: BenchmarkResult = {
          id: p.id, category: p.category, tier: p.tier, lang: p.lang,
          status: "error", apiCalls: 0, apiErrors: 0,
          optimalCalls: p.optimalCalls, callEfficiency: "0%",
          elapsedMs: 0, checks: [], failedChecks: [`Runtime: ${err instanceof Error ? err.message : err}`],
        };
        results.push(result);
        printResult(result, completedCount, prompts.length);
      }
    }
  }

  // Clean up parallel mocks
  if (isParallel) {
    for (const mock of mocks) closeMockInstance(mock);
  }

  // ─── Summary ──────────────────────────────────────────────────

  console.log(`\n${"─".repeat(90)}`);
  console.log("  SUMMARY");
  console.log(`${"─".repeat(90)}`);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const errors = results.filter((r) => r.status === "error").length;
  const totalCalls = results.reduce((s, r) => s + r.apiCalls, 0);
  const totalOptimal = results.reduce((s, r) => s + r.optimalCalls, 0);
  const totalErrors = results.reduce((s, r) => s + r.apiErrors, 0);
  const totalTime = results.reduce((s, r) => s + r.elapsedMs, 0);
  const wallTime = isParallel
    ? results.reduce((max, r) => Math.max(max, r.elapsedMs), 0) * Math.ceil(prompts.length / concurrency)
    : totalTime;

  console.log(`  Pass: ${passed}/${results.length} | Fail: ${failed} | Error: ${errors}`);
  console.log(`  API calls: ${totalCalls} (optimal: ${totalOptimal}, efficiency: ${Math.round((totalOptimal / Math.max(totalCalls, 1)) * 100)}%)`);
  console.log(`  API errors: ${totalErrors}`);
  console.log(`  Time: ${(totalTime / 1000).toFixed(1)}s total, ${(totalTime / results.length / 1000).toFixed(1)}s avg${isParallel ? `, ~${(wallTime / 1000).toFixed(0)}s wall` : ""}`);

  const categories = [...new Set(results.map((r) => r.category))];
  console.log(`\n  Per-category:`);
  for (const cat of categories) {
    const cr = results.filter((r) => r.category === cat);
    const cp = cr.filter((r) => r.status === "pass").length;
    const cc = cr.reduce((s, r) => s + r.apiCalls, 0);
    const co = cr.reduce((s, r) => s + r.optimalCalls, 0);
    const ce = cr.reduce((s, r) => s + r.apiErrors, 0);
    const eff = Math.round((co / Math.max(cc, 1)) * 100);
    const st = cp === cr.length ? "OK" : `${cp}/${cr.length}`;
    console.log(`    ${cat.padEnd(25)} ${st.padEnd(6)} calls: ${cc}/${co} (${eff}%)  errors: ${ce}`);
  }

  console.log(`\n${"═".repeat(90)}\n`);

  // Save results
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const resultPath = join(RESULTS_DIR, `${timestamp}.json`);
  writeFileSync(resultPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    parallel: concurrency,
    summary: { passed, failed, errors, totalCalls, totalOptimal, totalErrors, totalTimeMs: totalTime },
    results,
  }, null, 2) + "\n");
  console.log(`Results saved to ${resultPath}`);

  process.exit(failed + errors > 0 ? 1 : 0);
}

main();
