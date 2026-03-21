/**
 * Replay a prompt against the local agent, then verify what was created in the sandbox.
 *
 * Usage:
 *   pnpm verify --request logs/task-map/task-22-request.json    # replay from request file
 *   pnpm verify --prompt "Create a customer..." --type customer  # custom prompt + entity type
 *   pnpm verify --check-only                                     # skip replay, just check sandbox
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const SANDBOX_BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const SANDBOX_TOKEN = process.env.TRIPLETEX_SESSION_TOKEN ||
  "eyJ0b2tlbklkIjoyMTQ3NjI5MTUwLCJ0b2tlbiI6ImZmNzEwMmYwLTU2NzItNGVlMi04OTM1LTg4OGI0OWZkZTI4NSJ9";
const SERVER_URL = process.env.SERVER_URL || "http://localhost:9053";
const AUTH = "Basic " + Buffer.from("0:" + SANDBOX_TOKEN).toString("base64");

const requestFile = args.includes("--request") ? args[args.indexOf("--request") + 1] : null;
const customPrompt = args.includes("--prompt") ? args[args.indexOf("--prompt") + 1] : null;
const checkOnly = args.includes("--check-only");

// ─── Sandbox API helpers ─────────────────────────────────────────────────

async function sandboxGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(SANDBOX_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Authorization: AUTH } });
  return res.json();
}

function values(data: unknown): Array<Record<string, unknown>> {
  return (data as Record<string, unknown>)?.values as Array<Record<string, unknown>> ?? [];
}

// ─── Check all entity types ──────────────────────────────────────────────

async function checkSandbox() {
  console.log("\n═══ SANDBOX STATE (latest entities) ═══\n");

  // Suppliers
  const suppliers = values(await sandboxGet("/supplier", {
    fields: "id,name,organizationNumber,email", count: "3", sorting: "-id"
  }));
  console.log("─── Suppliers (latest 3) ───");
  for (const s of suppliers) console.log(`  #${s.id}: ${s.name} (org: ${s.organizationNumber})`);

  // Supplier Invoices
  const sis = values(await sandboxGet("/supplierInvoice", {
    invoiceDateFrom: "2020-01-01", invoiceDateTo: "2030-01-01",
    fields: "id,invoiceNumber,invoiceDate,supplier(name),amount,amountCurrency,voucher(postings(row,account(number,name),department(name),vatType(name,percentage),amountGross))",
    count: "3", sorting: "-id"
  }));
  console.log("\n─── Supplier Invoices (latest 3) ───");
  for (const si of sis) {
    console.log(`  #${si.id}: inv=${si.invoiceNumber} date=${si.invoiceDate} supplier=${(si.supplier as Record<string, unknown>)?.name} amt=${si.amount}`);
    const voucher = si.voucher as Record<string, unknown>;
    const postings = voucher?.postings as Array<Record<string, unknown>> ?? [];
    for (const p of postings) {
      const acct = p.account as Record<string, unknown>;
      const dept = p.department as Record<string, unknown>;
      const vat = p.vatType as Record<string, unknown>;
      console.log(`    row ${p.row}: acct=${acct?.number}(${acct?.name}) dept=${dept?.name ?? "NONE"} vat=${vat?.name}(${vat?.percentage}%) gross=${p.amountGross}`);
    }
  }

  // Customers
  const customers = values(await sandboxGet("/customer", {
    fields: "id,name,organizationNumber,email", count: "3", sorting: "-id"
  }));
  console.log("\n─── Customers (latest 3) ───");
  for (const c of customers) console.log(`  #${c.id}: ${c.name} (org: ${c.organizationNumber})`);

  // Invoices
  const invoices = values(await sandboxGet("/invoice", {
    invoiceDateFrom: "2020-01-01", invoiceDateTo: "2030-01-01",
    fields: "id,invoiceNumber,invoiceDate,customer(name),amount,amountCurrency",
    count: "3", sorting: "-id"
  }));
  console.log("\n─── Invoices (latest 3) ───");
  for (const inv of invoices) {
    console.log(`  #${inv.id}: inv#=${inv.invoiceNumber} date=${inv.invoiceDate} customer=${(inv.customer as Record<string, unknown>)?.name} amt=${inv.amount} amtCurrency=${inv.amountCurrency}`);
  }

  // Projects
  const projects = values(await sandboxGet("/project", {
    fields: "id,name,projectManager(displayName),customer(name),isInternal,isFixedPrice,fixedprice",
    count: "3", sorting: "-id"
  }));
  console.log("\n─── Projects (latest 3) ───");
  for (const p of projects) {
    console.log(`  #${p.id}: ${p.name} PM=${(p.projectManager as Record<string, unknown>)?.displayName} customer=${(p.customer as Record<string, unknown>)?.name} internal=${p.isInternal} fixed=${p.isFixedPrice} price=${p.fixedprice}`);
  }

  // Employees
  const employees = values(await sandboxGet("/employee", {
    fields: "id,firstName,lastName,email,dateOfBirth,department(name)", count: "3", sorting: "-id"
  }));
  console.log("\n─── Employees (latest 3) ───");
  for (const e of employees) {
    console.log(`  #${e.id}: ${e.firstName} ${e.lastName} (${e.email}) dob=${e.dateOfBirth} dept=${(e.department as Record<string, unknown>)?.name}`);
  }

  // Departments
  const depts = values(await sandboxGet("/department", {
    fields: "id,name,departmentNumber", count: "5"
  }));
  console.log("\n─── Departments ───");
  for (const d of depts) console.log(`  #${d.id}: ${d.name} (num: ${d.departmentNumber})`);

  // Salary specs
  const specs = values(await sandboxGet("/salary/specification", {
    fields: "id,employee(firstName,lastName),salaryType(name,number),rate,count,year,month", count: "5", sorting: "-id"
  }));
  console.log("\n─── Salary Specifications (latest 5) ───");
  for (const s of specs) {
    const emp = s.employee as Record<string, unknown>;
    const st = s.salaryType as Record<string, unknown>;
    console.log(`  #${s.id}: ${emp?.firstName} ${emp?.lastName} type=${st?.name}(${st?.number}) rate=${s.rate} count=${s.count} ${s.year}/${s.month}`);
  }
}

// ─── Replay a prompt ─────────────────────────────────────────────────────

async function replay(prompt: string, files: Array<{ filename: string; content_base64: string; mime_type: string }> = []) {
  console.log(`\n═══ REPLAYING PROMPT ═══`);
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Sandbox: ${SANDBOX_BASE}`);
  console.log(`Prompt: ${prompt.slice(0, 150)}...`);
  console.log(`Files: ${files.length}`);

  const startMs = Date.now();
  const res = await fetch(`${SERVER_URL}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      files,
      tripletex_credentials: {
        base_url: SANDBOX_BASE,
        session_token: SANDBOX_TOKEN,
      },
    }),
  });

  const elapsed = Date.now() - startMs;
  const body = await res.json();
  console.log(`\nResult: ${JSON.stringify(body)} (${elapsed}ms)`);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (!checkOnly) {
    if (requestFile) {
      const reqPath = requestFile.startsWith("/") ? requestFile : join(__dirname, "..", requestFile);
      const req = JSON.parse(readFileSync(reqPath, "utf-8"));
      const files = (req.raw_files ?? req.files ?? []).map((f: Record<string, string>) => ({
        filename: f.filename,
        content_base64: f.content_base64 || "",
        mime_type: f.mime_type,
      }));
      await replay(req.prompt, files);
    } else if (customPrompt) {
      await replay(customPrompt);
    } else {
      console.log("Usage: pnpm verify --request <file> | --prompt <text> | --check-only");
      process.exit(1);
    }
  }

  // Always check sandbox state after replay
  await checkSandbox();
}

main().catch(console.error);
