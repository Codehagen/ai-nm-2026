/**
 * Replay competition prompts against sandbox or local server.
 *
 * Usage:
 *   pnpm replay                    # replay latest failed prompt
 *   pnpm replay --all-failed       # replay all prompts that had errors
 *   pnpm replay --prompt "text"    # replay a custom prompt
 *   pnpm replay --index 5          # replay prompt #5 from logs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "..", "logs");
const SOLVES_FILE = join(LOG_DIR, "solves.jsonl");
const REQUESTS_DIR = join(LOG_DIR, "requests");

const SANDBOX_BASE_URL = process.env.TRIPLETEX_BASE_URL || "https://kkpqfuj-amager.tripletex.dev/v2";
const SANDBOX_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN || "";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:9053";

interface SolveEntry {
  timestamp: string;
  prompt: string;
  apiErrors: number;
  apiCalls: number;
  elapsedMs: number;
  toolCallDetails?: Array<{ method: string; path: string; ok: boolean; status?: number }>;
}

// Parse args
const args = process.argv.slice(2);
const allFailed = args.includes("--all-failed");
const customPrompt = args.includes("--prompt") ? args[args.indexOf("--prompt") + 1] : null;
const indexArg = args.includes("--index") ? parseInt(args[args.indexOf("--index") + 1]) : null;

async function replay(prompt: string, files: Array<{ filename: string; content_base64: string; mime_type: string }> = []) {
  console.log(`\n${"─".repeat(80)}`);
  console.log(`Prompt: ${prompt.slice(0, 100)}...`);
  console.log(`Sending to ${SERVER_URL}/solve with sandbox credentials...`);

  const start = Date.now();
  try {
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
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const body = await res.json();
    console.log(`Response: ${res.status} ${JSON.stringify(body)} in ${elapsed}s`);
  } catch (err: unknown) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Error after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  if (!SANDBOX_TOKEN) {
    console.error("Set TRIPLETEX_SESSION_TOKEN in .env.local");
    process.exit(1);
  }

  // Custom prompt
  if (customPrompt) {
    await replay(customPrompt);
    return;
  }

  // Load solves
  let solves: SolveEntry[] = [];
  try {
    solves = readFileSync(SOLVES_FILE, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    console.log("No solve logs found.");
    process.exit(0);
  }

  // Load request files for file attachments
  const requestFiles = new Map<string, any>();
  try {
    for (const f of readdirSync(REQUESTS_DIR)) {
      const data = JSON.parse(readFileSync(join(REQUESTS_DIR, f), "utf-8"));
      requestFiles.set(data.prompt, data);
    }
  } catch {}

  // Filter
  const comp = solves.filter((s) => !s.prompt.startsWith("Opprett en kunde med navn Test"));

  if (indexArg !== null) {
    const s = comp[indexArg - 1];
    if (!s) {
      console.log(`No submission #${indexArg}. Total: ${comp.length}`);
      process.exit(1);
    }
    const req = requestFiles.get(s.prompt);
    await replay(s.prompt, req?.raw_files || []);
    return;
  }

  if (allFailed) {
    const failed = comp.filter((s) => s.apiErrors > 0);
    // Deduplicate by prompt prefix (same task type)
    const seen = new Set<string>();
    const unique: SolveEntry[] = [];
    for (const s of failed) {
      const key = s.prompt.slice(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    console.log(`Replaying ${unique.length} unique failed prompts...\n`);
    for (const s of unique) {
      const req = requestFiles.get(s.prompt);
      console.log(`Original: ${s.apiCalls} calls, ${s.apiErrors} errors`);
      await replay(s.prompt, req?.raw_files || []);
    }
    return;
  }

  // Default: replay latest failed
  const lastFailed = [...comp].reverse().find((s) => s.apiErrors > 0);
  if (!lastFailed) {
    console.log("No failed submissions to replay!");
    process.exit(0);
  }
  const req = requestFiles.get(lastFailed.prompt);
  console.log(`Original: ${lastFailed.apiCalls} calls, ${lastFailed.apiErrors} errors`);
  await replay(lastFailed.prompt, req?.raw_files || []);
}

main();
