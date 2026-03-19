import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "..", "logs");
const SOLVES_FILE = join(LOG_DIR, "solves.jsonl");
const REQUESTS_DIR = join(LOG_DIR, "requests");

interface SolveEntry {
  timestamp: string;
  prompt: string;
  filesCount: number;
  steps: number;
  toolCalls: number;
  apiCalls: number;
  apiErrors: number;
  elapsedMs: number;
  status: string;
  error?: string;
  toolCallDetails?: Array<{
    method: string;
    path: string;
    ok: boolean;
    status?: number;
  }>;
}

// Parse args
const limit = parseInt(process.argv[2] || "20");

// Read solves
let solves: SolveEntry[] = [];
try {
  const lines = readFileSync(SOLVES_FILE, "utf-8").trim().split("\n");
  solves = lines.filter(Boolean).map((l) => JSON.parse(l));
} catch {
  console.log("No solve logs found. Submit some tasks first!");
  process.exit(0);
}

// Filter to competition solves only (exclude test calls to example.com)
const competitionSolves = solves.filter(
  (s) => !s.prompt.startsWith("Opprett en kunde med navn Test")
);

const shown = competitionSolves.slice(-limit);

// Header
console.log(
  "\n" +
    "═".repeat(100) +
    "\n" +
    `  SOLVE LOG — ${competitionSolves.length} competition submissions (showing last ${shown.length})` +
    "\n" +
    "═".repeat(100)
);

// Table
console.log(
  "\n #  Status      Time    Steps  API  Err  Prompt"
);
console.log(" " + "─".repeat(95));

shown.forEach((s, i) => {
  const num = (competitionSolves.length - shown.length + i + 1)
    .toString()
    .padStart(2);
  const status = s.status.padEnd(9);
  const time = (s.elapsedMs / 1000).toFixed(1).padStart(6) + "s";
  const steps = s.steps.toString().padStart(5);
  const api = s.apiCalls.toString().padStart(4);
  const err = s.apiErrors.toString().padStart(4);
  const prompt = s.prompt.slice(0, 55) + (s.prompt.length > 55 ? "..." : "");
  const icon =
    s.status === "completed" && s.apiErrors === 0
      ? "✓"
      : s.status === "completed"
        ? "~"
        : s.status === "timeout"
          ? "⏱"
          : "✗";
  console.log(` ${icon} ${num}  ${status} ${time}  ${steps}  ${api}  ${err}  ${prompt}`);
});

// Error patterns
const errorMap = new Map<string, number>();
for (const s of competitionSolves) {
  for (const tc of s.toolCallDetails || []) {
    if (!tc.ok) {
      const key = `${tc.method} ${tc.path} → ${tc.status}`;
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
  }
}

if (errorMap.size > 0) {
  console.log("\n Error Patterns:");
  console.log(" " + "─".repeat(60));
  [...errorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([key, count]) => {
      console.log(`   ${count}x  ${key}`);
    });
}

// Stats
const totalCalls = competitionSolves.reduce((n, s) => n + s.apiCalls, 0);
const totalErrors = competitionSolves.reduce((n, s) => n + s.apiErrors, 0);
const avgTime =
  competitionSolves.reduce((n, s) => n + s.elapsedMs, 0) /
  (competitionSolves.length || 1);
const perfect = competitionSolves.filter((s) => s.apiErrors === 0).length;

console.log("\n Summary:");
console.log(" " + "─".repeat(60));
console.log(`   Submissions: ${competitionSolves.length}`);
console.log(`   Perfect (0 errors): ${perfect}/${competitionSolves.length}`);
console.log(`   Total API calls: ${totalCalls} (${totalErrors} errors, ${((totalErrors / (totalCalls || 1)) * 100).toFixed(0)}% error rate)`);
console.log(`   Avg time: ${(avgTime / 1000).toFixed(1)}s`);

// Request log count
try {
  const requestFiles = readdirSync(REQUESTS_DIR);
  console.log(`   Requests logged: ${requestFiles.length}`);
} catch {}

console.log("\n" + "═".repeat(100) + "\n");
