/**
 * Benchmark runner: sends all test prompts through agent → mock,
 * verifies correctness, measures API call efficiency.
 *
 * Usage:
 *   # Start mock (:9054) and agent (:9053) first, then:
 *   pnpm benchmark
 *   pnpm benchmark --id t1-customer-nb    # run single test
 *   pnpm benchmark --category create-employee  # run category
 *   pnpm benchmark --tier 1              # run tier
 *
 * Requires:
 *   - Mock server on :9054 (pnpm mock:start)
 *   - Agent server on :9053 (source .env.local && export AI_GATEWAY_API_KEY && pnpm start)
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BENCHMARK_PROMPTS, PRESEED, type BenchmarkPrompt, type VerifyCheck } from "./prompts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, "benchmark-results");

const MOCK_URL = process.env.MOCK_URL || "http://localhost:9054";
const AGENT_URL = process.env.AGENT_URL || "http://localhost:9053";
const MOCK_TOKEN = "mock-session-token";
const MOCK_AUTH = "Basic " + Buffer.from(`0:${MOCK_TOKEN}`).toString("base64");

// ─── Args ────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;
const filterCategory = args.includes("--category") ? args[args.indexOf("--category") + 1] : null;
const filterTier = args.includes("--tier") ? parseInt(args[args.indexOf("--tier") + 1]) : null;

// ─── HTTP Helpers ────────────────────────────────────────────────

async function mockGet(path: string): Promise<any> {
  const res = await fetch(`${MOCK_URL}${path}`, {
    headers: { Authorization: MOCK_AUTH, "Content-Type": "application/json" },
  });
  if (res.status === 204) return null;
  return res.json();
}

async function mockPost(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${MOCK_URL}${path}`, {
    method: "POST",
    headers: { Authorization: MOCK_AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

async function mockReset(): Promise<void> {
  await fetch(`${MOCK_URL}/_reset`, { method: "POST" });
}

async function solveViaAgent(prompt: string): Promise<{ status: number; elapsed: number }> {
  const start = Date.now();
  const res = await fetch(`${AGENT_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      files: [],
      tripletex_credentials: {
        base_url: MOCK_URL,
        session_token: MOCK_TOKEN,
      },
    }),
  });
  const elapsed = Date.now() - start;
  return { status: res.status, elapsed };
}

/** Read solves.jsonl and return the last entry */
async function getLastSolveLog(): Promise<{
  apiCalls: number;
  apiErrors: number;
  toolCallDetails?: Array<{ method: string; path: string; ok: boolean; status?: number }>;
} | null> {
  try {
    const { readFileSync } = await import("node:fs");
    const logPath = join(__dirname, "..", "logs", "solves.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

// ─── Verification ────────────────────────────────────────────────

async function runVerification(checks: VerifyCheck[]): Promise<Array<{ check: string; pass: boolean; detail: string }>> {
  const results: Array<{ check: string; pass: boolean; detail: string }> = [];

  for (const check of checks) {
    const entityPath = getEntityPath(check.entity);
    let listUrl = entityPath;
    // Add required date params for invoice/order
    if (check.entity === "invoice") listUrl += "?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-01-01";
    if (check.entity === "order") listUrl += "?orderDateFrom=2020-01-01&orderDateTo=2030-01-01";

    const data = await mockGet(listUrl);
    const entities = data?.values || [];

    if (check.find === "count") {
      // Exclude seeded entities (admin employee)
      let count = entities.length;
      if (check.entity === "employee") count -= 1; // subtract admin
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
            pass,
            detail: pass ? "ok" : `got ${JSON.stringify(actual)}`,
          });
        }
      } else {
        results.push({ check: `${check.entity} exists`, pass: true, detail: "found" });
      }
      continue;
    }

    // find by field
    const { field, value } = check.find;
    const found = entities.find((e: any) => {
      const val = e[field];
      if (typeof val === "string" && typeof value === "string") {
        return val.toLowerCase().includes(value.toLowerCase());
      }
      return val === value;
    });

    if (!found) {
      results.push({
        check: `${check.entity} with ${field}=${JSON.stringify(value)}`,
        pass: false,
        detail: `not found among ${entities.length} entities`,
      });
      continue;
    }

    results.push({
      check: `${check.entity} with ${field}=${JSON.stringify(value)}`,
      pass: true,
      detail: "found",
    });

    if (check.expectFields) {
      for (const [ef, expected] of Object.entries(check.expectFields)) {
        const actual = found[ef];
        const pass = String(actual).toLowerCase() === String(expected).toLowerCase()
          || actual === expected;
        results.push({
          check: `  .${ef} = ${JSON.stringify(expected)}`,
          pass,
          detail: pass ? "ok" : `got ${JSON.stringify(actual)}`,
        });
      }
    }
  }

  return results;
}

function getEntityPath(entity: string): string {
  const paths: Record<string, string> = {
    employee: "/employee",
    customer: "/customer",
    department: "/department",
    product: "/product",
    order: "/order",
    invoice: "/invoice",
    project: "/project",
    travelExpense: "/travelExpense",
    account: "/ledger/account",
    voucher: "/ledger/voucher",
    contact: "/contact",
    activity: "/activity",
  };
  return paths[entity] || `/${entity}`;
}

// ─── Pre-seeding ─────────────────────────────────────────────────

async function preseed(promptId: string): Promise<void> {
  const seeds = PRESEED[promptId];
  if (!seeds) return;

  for (const seed of seeds) {
    const path = getEntityPath(seed.entity);
    await mockPost(path, seed.data);
  }

  // Special handling for credit note test: need to create order + invoice
  if (promptId === "t2-credit-note-nb") {
    const customers = await mockGet("/customer");
    const products = await mockGet("/product");
    if (customers?.values?.length && products?.values?.length) {
      const custId = customers.values[customers.values.length - 1].id;
      const prodId = products.values[products.values.length - 1].id;

      const order = await mockPost("/order", {
        customer: { id: custId },
        deliveryDate: "2026-03-20",
        orderDate: "2026-03-20",
        orderLines: [{ product: { id: prodId }, count: 1, unitPriceExcludingVatCurrency: 1000, vatType: { id: 3 } }],
      });
      const orderId = order?.value?.id;
      if (orderId) {
        // Set up bank account
        const accts = await mockGet("/ledger/account?number=1920");
        if (accts?.values?.length) {
          const acct = accts.values[0];
          await fetch(`${MOCK_URL}/ledger/account/${acct.id}`, {
            method: "PUT",
            headers: { Authorization: MOCK_AUTH, "Content-Type": "application/json" },
            body: JSON.stringify({ id: acct.id, version: acct.version, bankAccountNumber: "12345678901" }),
          });
        }
        await mockPost("/invoice", {
          invoiceDate: "2026-03-20",
          invoiceDueDate: "2026-04-20",
          orders: [{ id: orderId }],
        });
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────

interface BenchmarkResult {
  id: string;
  category: string;
  tier: number;
  lang: string;
  status: "pass" | "fail" | "error";
  apiCalls: number;
  apiErrors: number;
  optimalCalls: number;
  callEfficiency: string; // e.g., "100%" or "67%"
  elapsedMs: number;
  checks: Array<{ check: string; pass: boolean; detail: string }>;
  failedChecks: string[];
}

async function runBenchmark(prompt: BenchmarkPrompt): Promise<BenchmarkResult> {
  // Reset mock
  await mockReset();

  // Pre-seed if needed
  await preseed(prompt.id);

  // Run agent
  const { status, elapsed } = await solveViaAgent(prompt.prompt);

  // Get solve log
  const log = await getLastSolveLog();
  const apiCalls = log?.apiCalls ?? 0;
  const apiErrors = log?.apiErrors ?? 0;

  // Run verification
  const checks = await runVerification(prompt.verify);
  const failedChecks = checks.filter((c) => !c.pass).map((c) => `${c.check}: ${c.detail}`);
  const allPassed = failedChecks.length === 0;

  const efficiency = prompt.optimalCalls > 0
    ? Math.round((prompt.optimalCalls / Math.max(apiCalls, 1)) * 100)
    : 100;

  return {
    id: prompt.id,
    category: prompt.category,
    tier: prompt.tier,
    lang: prompt.lang,
    status: status !== 200 ? "error" : allPassed ? "pass" : "fail",
    apiCalls,
    apiErrors,
    optimalCalls: prompt.optimalCalls,
    callEfficiency: `${Math.min(efficiency, 100)}%`,
    elapsedMs: elapsed,
    checks,
    failedChecks,
  };
}

async function main() {
  // Check servers are up
  try {
    await fetch(`${MOCK_URL}/`);
  } catch {
    console.error(`Mock server not running at ${MOCK_URL}. Start with: pnpm mock:start`);
    process.exit(1);
  }
  try {
    await fetch(`${AGENT_URL}/`);
  } catch {
    console.error(`Agent server not running at ${AGENT_URL}. Start with: source .env.local && export AI_GATEWAY_API_KEY && pnpm start`);
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

  console.log(`\n${"═".repeat(90)}`);
  console.log(`  TRIPLETEX AGENT BENCHMARK — ${prompts.length} prompts`);
  console.log(`${"═".repeat(90)}\n`);

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    process.stdout.write(`[${i + 1}/${prompts.length}] ${p.id} (${p.lang}) ... `);

    try {
      const result = await runBenchmark(p);
      results.push(result);

      const icon = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "ERR ";
      const callInfo = `${result.apiCalls}/${result.optimalCalls} calls (${result.callEfficiency})`;
      const errInfo = result.apiErrors > 0 ? ` ${result.apiErrors} errors` : "";
      const time = `${(result.elapsedMs / 1000).toFixed(1)}s`;

      console.log(`${icon} | ${callInfo}${errInfo} | ${time}`);

      if (result.failedChecks.length > 0) {
        for (const fc of result.failedChecks) {
          console.log(`       FAIL: ${fc}`);
        }
      }
    } catch (err) {
      console.log(`ERR  | ${err instanceof Error ? err.message : err}`);
      results.push({
        id: p.id,
        category: p.category,
        tier: p.tier,
        lang: p.lang,
        status: "error",
        apiCalls: 0,
        apiErrors: 0,
        optimalCalls: p.optimalCalls,
        callEfficiency: "0%",
        elapsedMs: 0,
        checks: [],
        failedChecks: [`Runtime error: ${err instanceof Error ? err.message : err}`],
      });
    }
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

  console.log(`  Pass: ${passed}/${results.length} | Fail: ${failed} | Error: ${errors}`);
  console.log(`  Total API calls: ${totalCalls} (optimal: ${totalOptimal}, efficiency: ${Math.round((totalOptimal / Math.max(totalCalls, 1)) * 100)}%)`);
  console.log(`  Total API errors: ${totalErrors}`);
  console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s (avg ${(totalTime / results.length / 1000).toFixed(1)}s/prompt)`);

  // Per-category breakdown
  const categories = [...new Set(results.map((r) => r.category))];
  console.log(`\n  Per-category:`);
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.status === "pass").length;
    const catCalls = catResults.reduce((s, r) => s + r.apiCalls, 0);
    const catOptimal = catResults.reduce((s, r) => s + r.optimalCalls, 0);
    const catErrors = catResults.reduce((s, r) => s + r.apiErrors, 0);
    const eff = Math.round((catOptimal / Math.max(catCalls, 1)) * 100);
    const status = catPassed === catResults.length ? "OK" : `${catPassed}/${catResults.length}`;
    console.log(`    ${cat.padEnd(25)} ${status.padEnd(6)} calls: ${catCalls}/${catOptimal} (${eff}%)  errors: ${catErrors}`);
  }

  console.log(`\n${"═".repeat(90)}\n`);

  // Save results
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const resultPath = join(RESULTS_DIR, `${timestamp}.json`);
  writeFileSync(resultPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed, failed, errors, totalCalls, totalOptimal, totalErrors, totalTimeMs: totalTime },
    results,
  }, null, 2) + "\n");
  console.log(`Results saved to ${resultPath}`);

  process.exit(failed + errors > 0 ? 1 : 0);
}

main();
