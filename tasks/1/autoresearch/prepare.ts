/**
 * Autoresearch evaluator: runs a subset of prompts through the agent,
 * verifies results with GET requests (like competition scoring), outputs val_metric.
 *
 * Usage:
 *   npx tsx autoresearch/prepare.ts                    # fast subset (15 prompts)
 *   npx tsx autoresearch/prepare.ts --subset all       # all prompts
 *   npx tsx autoresearch/prepare.ts --id t2-salary-nb  # single prompt
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createMockApp } from "../src/mock/server.js";
import { BENCHMARK_PROMPTS, PRESEED, type BenchmarkPrompt, type VerifyCheck } from "../tests/prompts.js";
import { FAST_SUBSET_IDS } from "./prompts-subset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AGENT_URL = process.env.AGENT_URL || "http://localhost:9053";
const MOCK_TOKEN = "mock-session-token";
const PARALLEL_COUNT = parseInt(process.env.PARALLEL || "4");

// ─── Args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const subsetArg = args.includes("--subset") ? args[args.indexOf("--subset") + 1] : "fast";
const filterId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

// ─── Mock Instance Pool ─────────────────────────────────────────

interface MockInstance {
  port: number;
  url: string;
  auth: string;
  store: ReturnType<typeof createMockApp>["store"];
  server?: ReturnType<typeof serve>;
}

const BASE_MOCK_PORT = 29054; // Different from benchmark to avoid conflicts

async function createMockInstance(port: number): Promise<MockInstance> {
  const { app, store } = createMockApp();
  const url = `http://localhost:${port}`;
  const auth = "Basic " + Buffer.from(`0:${MOCK_TOKEN}`).toString("base64");

  const server = serve({ fetch: app.fetch, port });

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

// ─── HTTP Helpers ───────────────────────────────────────────────

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
      mock.store.reset();
    },
  };
}

async function solveViaAgent(prompt: string, mockUrl: string): Promise<{ status: number; elapsed: number; apiCalls: number; apiErrors: number }> {
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

  let apiCalls = 0, apiErrors = 0;
  try {
    const logPath = join(__dirname, "..", "logs", "solves.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    apiCalls = last?.apiCalls ?? 0;
    apiErrors = last?.apiErrors ?? 0;
  } catch {}

  return { status: res.status, elapsed, apiCalls, apiErrors };
}

// ─── Verification (reused from benchmark.ts) ─────────────────────

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

// ─── Pre-seeding (reused from benchmark.ts) ──────────────────────

async function preseed(promptId: string, client: ReturnType<typeof makeMockClient>): Promise<void> {
  const seeds = PRESEED[promptId];
  if (!seeds) return;

  for (const seed of seeds) {
    await client.post(getEntityPath(seed.entity), seed.data);
  }

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

// ─── Run Single Prompt ──────────────────────────────────────────

interface PromptResult {
  id: string;
  category: string;
  status: "pass" | "fail" | "error";
  checksPassed: number;
  totalChecks: number;
  apiCalls: number;
  optimalCalls: number;
  apiErrors: number;
  elapsedMs: number;
  failedChecks: string[];
}

async function runPrompt(prompt: BenchmarkPrompt, mock: MockInstance): Promise<PromptResult> {
  const client = makeMockClient(mock);
  await client.reset();
  await preseed(prompt.id, client);

  const { status, elapsed, apiCalls, apiErrors } = await solveViaAgent(prompt.prompt, mock.url);

  if (status !== 200) {
    return {
      id: prompt.id, category: prompt.category, status: "error",
      checksPassed: 0, totalChecks: prompt.verify.length,
      apiCalls, optimalCalls: prompt.optimalCalls, apiErrors,
      elapsedMs: elapsed, failedChecks: [`HTTP ${status}`],
    };
  }

  const checks = await runVerification(prompt.verify, client);
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass);

  return {
    id: prompt.id, category: prompt.category,
    status: failed.length === 0 ? "pass" : "fail",
    checksPassed: passed, totalChecks: checks.length,
    apiCalls, optimalCalls: prompt.optimalCalls, apiErrors,
    elapsedMs: elapsed,
    failedChecks: failed.map((c) => `${c.check}: ${c.detail}`),
  };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  // Check agent is up
  try {
    await fetch(`${AGENT_URL}/`);
  } catch {
    console.error(`Agent not running at ${AGENT_URL}. Start with:\n  source .env.local && export GOOGLE_API_KEY && npx tsx src/api.ts`);
    process.exit(1);
  }

  // Select prompts
  let prompts: BenchmarkPrompt[];
  if (filterId) {
    prompts = BENCHMARK_PROMPTS.filter((p) => p.id === filterId);
  } else if (subsetArg === "all") {
    prompts = BENCHMARK_PROMPTS;
  } else {
    prompts = BENCHMARK_PROMPTS.filter((p) => FAST_SUBSET_IDS.includes(p.id));
  }

  if (prompts.length === 0) {
    console.error("No prompts match filter.");
    process.exit(1);
  }

  const concurrency = Math.min(PARALLEL_COUNT, prompts.length);

  console.error(`\nAutoresearch evaluator: ${prompts.length} prompts, ${concurrency} parallel\n`);

  // Create mock instances
  const mocks: MockInstance[] = [];
  for (let i = 0; i < concurrency; i++) {
    mocks.push(await createMockInstance(BASE_MOCK_PORT + i));
  }

  const results: PromptResult[] = [];
  const startTime = Date.now();

  // Run in batches
  for (let batchStart = 0; batchStart < prompts.length; batchStart += concurrency) {
    const batch = prompts.slice(batchStart, batchStart + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (p, i) => {
        const mock = mocks[i % mocks.length];
        try {
          return await runPrompt(p, mock);
        } catch (err) {
          return {
            id: p.id, category: p.category, status: "error" as const,
            checksPassed: 0, totalChecks: 0, apiCalls: 0, optimalCalls: p.optimalCalls,
            apiErrors: 0, elapsedMs: 0, failedChecks: [`Runtime: ${err instanceof Error ? err.message : err}`],
          };
        }
      })
    );

    for (const result of batchResults) {
      results.push(result);
      const icon = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "ERR ";
      const checks = `${result.checksPassed}/${result.totalChecks}`;
      const calls = `${result.apiCalls}/${result.optimalCalls}`;
      const time = `${(result.elapsedMs / 1000).toFixed(1)}s`;
      console.error(`  [${String(results.length).padStart(2)}/${prompts.length}] ${result.id.padEnd(30)} ${icon} ${checks.padEnd(6)} calls:${calls.padEnd(6)} ${time}`);
      if (result.failedChecks.length > 0) {
        for (const fc of result.failedChecks) console.error(`          FAIL: ${fc}`);
      }
    }
  }

  // Clean up
  for (const mock of mocks) closeMockInstance(mock);

  const totalTime = Date.now() - startTime;

  // ─── Compute metrics ────────────────────────────────────────

  const totalChecks = results.reduce((s, r) => s + r.totalChecks, 0);
  const totalPassed = results.reduce((s, r) => s + r.checksPassed, 0);
  const totalCalls = results.reduce((s, r) => s + r.apiCalls, 0);
  const totalOptimal = results.reduce((s, r) => s + r.optimalCalls, 0);
  const passedPrompts = results.filter((r) => r.status === "pass").length;
  const failedPrompts = results.filter((r) => r.status === "fail").length;
  const errorPrompts = results.filter((r) => r.status === "error").length;

  const valMetric = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 1000) / 10 : 0;
  const efficiency = totalOptimal > 0 && totalCalls > 0
    ? Math.round((totalOptimal / totalCalls) * 1000) / 10 : 0;

  // Per-category breakdown
  const categories = [...new Set(results.map((r) => r.category))];
  const perCategory: Record<string, string> = {};
  for (const cat of categories) {
    const cr = results.filter((r) => r.category === cat);
    const cp = cr.reduce((s, r) => s + r.checksPassed, 0);
    const ct = cr.reduce((s, r) => s + r.totalChecks, 0);
    const pct = ct > 0 ? Math.round((cp / ct) * 100) : 0;
    perCategory[cat] = `${cp}/${ct} (${pct}%)`;
  }

  // ─── Output (stdout — machine-readable) ─────────────────────

  console.log("---");
  console.log(`val_metric:       ${valMetric}`);
  console.log(`checks_passed:    ${totalPassed}`);
  console.log(`total_checks:     ${totalChecks}`);
  console.log(`efficiency:       ${efficiency}`);
  console.log(`prompts_run:      ${prompts.length}`);
  console.log(`prompts_pass:     ${passedPrompts}`);
  console.log(`prompts_fail:     ${failedPrompts}`);
  console.log(`prompts_error:    ${errorPrompts}`);
  console.log(`total_time_s:     ${Math.round(totalTime / 1000)}`);
  console.log(`per_category:`);
  for (const [cat, score] of Object.entries(perCategory)) {
    console.log(`  ${cat}: ${score}`);
  }

  // ─── Summary on stderr ──────────────────────────────────────

  console.error(`\n${"─".repeat(60)}`);
  console.error(`  val_metric: ${valMetric}%  (${totalPassed}/${totalChecks} checks)`);
  console.error(`  efficiency: ${efficiency}%  (${totalOptimal}/${totalCalls} calls)`);
  console.error(`  pass/fail/error: ${passedPrompts}/${failedPrompts}/${errorPrompts}`);
  console.error(`  time: ${Math.round(totalTime / 1000)}s`);
  console.error(`${"─".repeat(60)}\n`);

  process.exit(0);
}

main();
