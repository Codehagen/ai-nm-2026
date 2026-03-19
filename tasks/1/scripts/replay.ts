/**
 * Test runner: replay logged submissions against the sandbox.
 *
 * Usage:
 *   pnpm test                        # all test cases
 *   pnpm test -- --failed            # only previously failed
 *   pnpm test -- --index 5           # specific test case
 *   pnpm test -- --prompt "Create…"  # ad-hoc prompt
 */

import { readFileSync, readdirSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local if present
const __dirnameScript = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirnameScript, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const __dirname = __dirnameScript;
const LOG_DIR = join(__dirname, "..", "logs");
const SOLVES_FILE = join(LOG_DIR, "solves.jsonl");
const REQUESTS_DIR = join(LOG_DIR, "requests");
const RESULTS_FILE = join(LOG_DIR, "test-results.jsonl");
mkdirSync(LOG_DIR, { recursive: true });

const SANDBOX_BASE_URL =
  process.env.TRIPLETEX_BASE_URL ||
  "https://kkpqfuj-amager.tripletex.dev/v2";
const SANDBOX_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN || "";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:9053";

const PASS_MAX_ERRORS = 3;
const PASS_TIMEOUT_MS = 270_000;

// ── Types ──────────────────────────────────────────────────────────────

interface SolveEntry {
  timestamp: string;
  prompt: string;
  apiErrors: number;
  apiCalls: number;
  elapsedMs: number;
  status: "completed" | "timeout" | "error";
  toolCallDetails?: Array<{
    method: string;
    path: string;
    ok: boolean;
    status?: number;
  }>;
}

interface RequestFile {
  timestamp: string;
  prompt: string;
  files: Array<{ filename: string; mime_type: string; size_bytes: number }>;
  base_url: string;
  raw_files: Array<{
    filename: string;
    mime_type: string;
    content_base64: string;
  }>;
}

interface TestResult {
  id: string;
  prompt: string;
  apiCalls: number;
  apiErrors: number;
  elapsedMs: number;
  status: "completed" | "timeout" | "error";
  pass: boolean;
  comparison: string; // "↑ (was N)" | "↓ (was N)" | "= (was N)" | "N/A"
}

// ── Helpers ────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

function loadSolves(): SolveEntry[] {
  try {
    return readFileSync(SOLVES_FILE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function loadRequests(): Map<string, RequestFile> {
  const map = new Map<string, RequestFile>();
  try {
    for (const f of readdirSync(REQUESTS_DIR).sort()) {
      const data: RequestFile = JSON.parse(
        readFileSync(join(REQUESTS_DIR, f), "utf-8")
      );
      // Use filename (timestamp) as ID
      const id = f.replace(".json", "");
      map.set(id, data);
    }
  } catch {}
  return map;
}

/** Find a baseline solve entry for a given prompt (best effort match) */
function findBaseline(
  prompt: string,
  solves: SolveEntry[]
): SolveEntry | undefined {
  return solves.find((s) => s.prompt === prompt);
}

async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function runTest(
  id: string,
  prompt: string,
  files: RequestFile["raw_files"],
  baseline: SolveEntry | undefined
): Promise<TestResult> {
  const solvesBeforeCount = loadSolves().length;

  const start = Date.now();
  let status: "completed" | "timeout" | "error" = "error";
  let apiCalls = 0;
  let apiErrors = 0;
  let elapsedMs = 0;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PASS_TIMEOUT_MS + 5000
    );

    const res = await fetch(`${SERVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        files,
        tripletex_credentials: {
          base_url: SANDBOX_BASE_URL,
          session_token: SANDBOX_TOKEN,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    elapsedMs = Date.now() - start;

    if (!res.ok) {
      status = "error";
    } else {
      // Read the new solve entry (last line of solves.jsonl)
      const solvesAfter = loadSolves();
      if (solvesAfter.length > solvesBeforeCount) {
        const newSolve = solvesAfter[solvesAfter.length - 1];
        status = newSolve.status;
        apiCalls = newSolve.apiCalls;
        apiErrors = newSolve.apiErrors;
        elapsedMs = newSolve.elapsedMs;
      } else {
        status = "completed";
      }
    }
  } catch (err: unknown) {
    elapsedMs = Date.now() - start;
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError")
    ) {
      status = "timeout";
    } else {
      status = "error";
    }
  }

  const pass =
    status === "completed" &&
    apiErrors <= PASS_MAX_ERRORS &&
    elapsedMs < PASS_TIMEOUT_MS;

  let comparison = "N/A";
  if (baseline) {
    const delta = baseline.apiErrors - apiErrors;
    if (delta > 0) comparison = `↑ (was ${baseline.apiErrors})`;
    else if (delta < 0) comparison = `↓ (was ${baseline.apiErrors})`;
    else comparison = `= (was ${baseline.apiErrors})`;
  }

  return { id, prompt, apiCalls, apiErrors, elapsedMs, status, pass, comparison };
}

function printTable(results: TestResult[]) {
  const hdr = `│ ${"#".padStart(3)} │ ${pad("Prompt", 36)} │ ${"Calls".padStart(5)} │ ${"Errors".padStart(6)} │ ${"Time".padStart(7)} │ ${"Status".padEnd(6)} │ ${"vs Orig".padEnd(12)} │`;
  const sep = `├${"─".repeat(5)}┼${"─".repeat(38)}┼${"─".repeat(7)}┼${"─".repeat(8)}┼${"─".repeat(9)}┼${"─".repeat(8)}┼${"─".repeat(14)}┤`;
  const top = `┌${"─".repeat(5)}┬${"─".repeat(38)}┬${"─".repeat(7)}┬${"─".repeat(8)}┬${"─".repeat(9)}┬${"─".repeat(8)}┬${"─".repeat(14)}┐`;
  const bot = `└${"─".repeat(5)}┴${"─".repeat(38)}┴${"─".repeat(7)}┴${"─".repeat(8)}┴${"─".repeat(9)}┴${"─".repeat(8)}┴${"─".repeat(14)}┘`;

  console.log(top);
  console.log(hdr);
  console.log(sep);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const statusStr = r.pass ? "PASS" : "FAIL";
    const timeStr = `${(r.elapsedMs / 1000).toFixed(1)}s`;
    console.log(
      `│ ${String(i + 1).padStart(3)} │ ${pad(r.prompt, 36)} │ ${String(r.apiCalls).padStart(5)} │ ${String(r.apiErrors).padStart(6)} │ ${timeStr.padStart(7)} │ ${statusStr.padEnd(6)} │ ${pad(r.comparison, 12)} │`
    );
  }

  console.log(bot);
}

function printSummary(results: TestResult[]) {
  const passed = results.filter((r) => r.pass).length;
  const improved = results.filter((r) => r.comparison.startsWith("↑")).length;
  const regressed = results.filter((r) => r.comparison.startsWith("↓")).length;
  const timeouts = results.filter((r) => r.status === "timeout").length;

  console.log(
    `\nSummary: ${passed}/${results.length} passed | ${improved} improved | ${regressed} regressed | ${timeouts} timeout`
  );
}

function saveResults(results: TestResult[]) {
  const entry = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    results,
  };
  appendFileSync(RESULTS_FILE, JSON.stringify(entry) + "\n");
}

// ── CLI ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const failedOnly = args.includes("--failed");
const indexArg = args.includes("--index")
  ? parseInt(args[args.indexOf("--index") + 1])
  : null;
const customPrompt = args.includes("--prompt")
  ? args[args.indexOf("--prompt") + 1]
  : null;

async function main() {
  if (!SANDBOX_TOKEN) {
    console.error("Set TRIPLETEX_SESSION_TOKEN in .env.local");
    process.exit(1);
  }

  // Health check
  console.log(`Checking server at ${SERVER_URL}...`);
  const healthy = await healthCheck();
  if (!healthy) {
    console.error(`\nServer is down. Start it first:\n  cd tasks/1 && pnpm dev\n`);
    process.exit(1);
  }
  console.log("Server is up.\n");

  // Ad-hoc prompt
  if (customPrompt) {
    const result = await runTest("adhoc", customPrompt, [], undefined);
    printTable([result]);
    printSummary([result]);
    saveResults([result]);
    return;
  }

  // Load data
  const requests = loadRequests();
  const solves = loadSolves();

  if (requests.size === 0) {
    console.log("No request logs found in logs/requests/");
    process.exit(0);
  }

  // Build test cases: each request file is a test case
  let testCases = Array.from(requests.entries()).map(([id, req]) => ({
    id,
    prompt: req.prompt,
    files: req.raw_files || [],
    baseline: findBaseline(req.prompt, solves),
  }));

  // Filter: --index
  if (indexArg !== null) {
    if (indexArg < 1 || indexArg > testCases.length) {
      console.error(`No test case #${indexArg}. Total: ${testCases.length}`);
      process.exit(1);
    }
    testCases = [testCases[indexArg - 1]];
  }

  // Filter: --failed (from previous test results)
  if (failedOnly) {
    try {
      const lines = readFileSync(RESULTS_FILE, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean);
      const lastRun = JSON.parse(lines[lines.length - 1]);
      const failedIds = new Set(
        lastRun.results
          .filter((r: TestResult) => !r.pass)
          .map((r: TestResult) => r.id)
      );
      testCases = testCases.filter((tc) => failedIds.has(tc.id));
      if (testCases.length === 0) {
        console.log("No previously failed tests to re-run.");
        process.exit(0);
      }
    } catch {
      console.error("No previous test results found. Run pnpm test first.");
      process.exit(1);
    }
  }

  console.log(`Running ${testCases.length} test(s) sequentially...\n`);

  const results: TestResult[] = [];
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(
      `[${i + 1}/${testCases.length}] ${tc.prompt.slice(0, 60)}...`
    );
    const result = await runTest(tc.id, tc.prompt, tc.files, tc.baseline);
    results.push(result);
    const icon = result.pass ? "✓" : "✗";
    console.log(
      `  ${icon} ${result.status} | ${result.apiCalls} calls, ${result.apiErrors} errors | ${(result.elapsedMs / 1000).toFixed(1)}s\n`
    );
  }

  printTable(results);
  printSummary(results);
  saveResults(results);
}

main();
