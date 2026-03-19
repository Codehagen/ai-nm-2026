import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, "..", "logs");
mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = join(LOG_DIR, "solves.jsonl");
const DETAIL_DIR = join(LOG_DIR, "details");
const REQUESTS_DIR = join(LOG_DIR, "requests");
mkdirSync(DETAIL_DIR, { recursive: true });
mkdirSync(REQUESTS_DIR, { recursive: true });

export interface SolveLog {
  timestamp: string;
  model?: string;
  prompt: string;
  filesCount: number;
  steps: number;
  toolCalls: number;
  apiCalls: number;
  apiErrors: number;
  elapsedMs: number;
  status: "completed" | "timeout" | "error";
  error?: string;
  toolCallDetails?: Array<{
    method: string;
    path: string;
    ok: boolean;
    status?: number;
    requestBody?: unknown;
    requestParams?: Record<string, string>;
    responseData?: unknown;
  }>;
}

/** Log the raw incoming request (prompt, files metadata, credentials redacted) */
export function logRequest(raw: {
  prompt: string;
  files: Array<{ filename: string; mime_type: string; content_base64: string }>;
  tripletex_credentials: { base_url: string; session_token: string };
}) {
  const slug = new Date().toISOString().replace(/[:.]/g, "-");
  const entry = {
    timestamp: new Date().toISOString(),
    prompt: raw.prompt,
    files: raw.files.map((f) => ({
      filename: f.filename,
      mime_type: f.mime_type,
      size_bytes: Math.round((f.content_base64.length * 3) / 4),
    })),
    base_url: raw.tripletex_credentials.base_url,
    // Store full files separately so we can replay later
    raw_files: raw.files.map((f) => ({
      filename: f.filename,
      mime_type: f.mime_type,
      content_base64: f.content_base64,
    })),
  };
  const path = join(REQUESTS_DIR, `${slug}.json`);
  appendFileSync(path, JSON.stringify(entry, null, 2));
}

/** Append a one-line JSON summary to solves.jsonl */
export function logSolve(entry: SolveLog) {
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(LOG_FILE, line);

  // Also write detailed log for this solve
  const slug = entry.timestamp.replace(/[:.]/g, "-");
  const detailPath = join(DETAIL_DIR, `${slug}.json`);
  appendFileSync(detailPath, JSON.stringify(entry, null, 2));

  // Console summary
  const icon = entry.status === "completed" ? "✓" : entry.status === "timeout" ? "⏱" : "✗";
  console.log(
    `[${icon}] ${entry.status} in ${(entry.elapsedMs / 1000).toFixed(1)}s | ` +
      `Steps: ${entry.steps}, API: ${entry.apiCalls} calls, ${entry.apiErrors} errors | ` +
      `Prompt: ${entry.prompt.slice(0, 80)}...`
  );
}
