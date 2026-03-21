/**
 * Shared helper functions for deterministic orchestrator.
 * Battle-tested patterns extracted from model.ts recipes.
 */

import { TripletexClient, type TxResult } from "../tripletex.js";

// ─── Date helpers ─────────────────────────────────────────────────────────

/** Oslo timezone date (avoids UTC midnight drift) */
export function getOsloDate(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

/** Strip diacritics for safe email generation (e.g. Gonçalo → Goncalo) */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Add days to a YYYY-MM-DD date string */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid DST issues
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── ID extraction ────────────────────────────────────────────────────────

/** Safely extract .value.id from a TxResult */
export function extractId(result: TxResult): number {
  if (!result.ok) throw new Error(`Cannot extract ID from failed result: ${result.message}`);
  const val = (result.data as Record<string, unknown>)?.value as Record<string, unknown> | undefined;
  if (!val?.id) throw new Error("No .value.id in response");
  return val.id as number;
}

/** Safely extract .value from a TxResult */
export function extractValue(result: TxResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`Cannot extract value from failed result: ${result.message}`);
  const val = (result.data as Record<string, unknown>)?.value as Record<string, unknown> | undefined;
  if (!val) throw new Error("No .value in response");
  return val;
}

/** Extract .values array from a list GET result */
export function extractValues(result: TxResult): Array<Record<string, unknown>> {
  if (!result.ok) return [];
  const data = result.data as Record<string, unknown>;
  return (data?.values as Array<Record<string, unknown>>) ?? [];
}

// ─── VAT mapping ──────────────────────────────────────────────────────────

const VAT_MAP: Record<string, number> = {
  "25": 3,
  "15": 31,
  "12": 32,
  "0": 5,
};

/** Map VAT percent string to Tripletex vatType ID */
export function vatPercentToId(percent: string): number {
  return VAT_MAP[percent] ?? 3; // default 25%
}

// ─── Shared entity helpers ────────────────────────────────────────────────

/** Track all API calls for logging */
export interface ApiCall {
  method: string;
  path: string;
  ok: boolean;
  status?: number;
  params?: Record<string, string>;
  body?: unknown;
  errorMessage?: string;
  validationMessages?: Array<{ field: string; message: string }>;
}

export class OrchestratorContext {
  public apiCalls: ApiCall[] = [];

  constructor(public client: TripletexClient) {}

  /** Wrap client calls with logging */
  async get(path: string, params?: Record<string, string>): Promise<TxResult> {
    const result = await this.client.get(path, params);
    this.logCall("GET", path, result, params);
    return result;
  }

  async post(path: string, body: unknown, params?: Record<string, string>): Promise<TxResult> {
    const result = await this.client.post(path, body, params);
    this.logCall("POST", path, result, params, body);
    // Auto-retry transient 409/500
    if (!result.ok && (result.status === 409 || result.status === 500)) {
      await sleep(800);
      const retry = await this.client.post(path, body, params);
      this.logCall("POST", path, retry, params, body);
      if (!retry.ok && (retry.status === 409 || retry.status === 500)) {
        await sleep(1200);
        const retry2 = await this.client.post(path, body, params);
        this.logCall("POST", path, retry2, params, body);
        return retry2;
      }
      return retry;
    }
    return result;
  }

  async put(path: string, body: unknown, params?: Record<string, string>): Promise<TxResult> {
    const result = await this.client.put(path, body, params);
    this.logCall("PUT", path, result, params, body);
    // Auto-retry transient 409/500
    if (!result.ok && (result.status === 409 || result.status === 500)) {
      await sleep(800);
      const retry = await this.client.put(path, body, params);
      this.logCall("PUT", path, retry, params, body);
      if (!retry.ok && (retry.status === 409 || retry.status === 500)) {
        await sleep(1200);
        const retry2 = await this.client.put(path, body, params);
        this.logCall("PUT", path, retry2, params, body);
        return retry2;
      }
      return retry;
    }
    return result;
  }

  async delete(path: string): Promise<TxResult> {
    const result = await this.client.delete(path);
    this.logCall("DELETE", path, result);
    return result;
  }

  private logCall(method: string, path: string, result: TxResult, params?: Record<string, string>, body?: unknown) {
    const entry: ApiCall = { method, path, ok: result.ok };
    if (params) entry.params = params;
    if (body) entry.body = body;
    if (!result.ok) {
      entry.status = result.status;
      entry.errorMessage = result.message;
      entry.validationMessages = result.validationMessages;
    }
    this.apiCalls.push(entry);
    // Console logging
    const icon = result.ok ? "\u2713" : "\u2717";
    const status = result.ok ? "" : ` (${result.status})`;
    console.log(`  [${icon}] ${method} ${path}${status}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Entity helpers (deterministic, no LLM) ──────────────────────────────

/** Ensure bank account 1920 has a valid bank account number */
export async function ensureBankAccount(ctx: OrchestratorContext): Promise<void> {
  const res = await ctx.get("/ledger/account", {
    number: "1920",
    fields: "id,version,bankAccountNumber,name",
  });
  if (!res.ok) return;
  const values = extractValues(res);
  const acct = values[0];
  if (!acct) return;
  if (!acct.bankAccountNumber) {
    const putRes = await ctx.put(`/ledger/account/${acct.id}`, {
      id: acct.id,
      version: acct.version,
      name: acct.name,
      bankAccountNumber: "86011117947",
    });
    if (!putRes.ok) throw new Error(`Failed to set bank account number: ${putRes.message}`);
  }
}

/** Create or get a department. Returns department ID. */
export async function ensureDepartment(
  ctx: OrchestratorContext,
  name = "Avdeling",
  number = "1",
): Promise<number> {
  const res = await ctx.post("/department", {
    name,
    departmentNumber: number,
  });
  if (res.ok) return extractId(res);
  // 422 = already exists, GET it
  const getRes = await ctx.get("/department", {
    departmentNumber: number,
    fields: "id,name",
  });
  const values = extractValues(getRes);
  if (values[0]?.id) return values[0].id as number;
  throw new Error("Failed to create or find department");
}

/** Create an employee. Handles 422 email collision with auto-fix. Returns employee ID. */
export async function ensureEmployee(
  ctx: OrchestratorContext,
  data: {
    firstName: string;
    lastName: string;
    email?: string;
    departmentId: number;
  },
): Promise<number> {
  const email = data.email || `${stripDiacritics(data.firstName).toLowerCase()}.${stripDiacritics(data.lastName).toLowerCase()}@example.org`;
  const res = await ctx.post("/employee", {
    firstName: data.firstName,
    lastName: data.lastName,
    email,
    dateOfBirth: "1990-01-15",
    userType: "STANDARD",
    department: { id: data.departmentId },
  });
  if (res.ok) return extractId(res);

  // 422 email collision — get existing, update name if needed
  if (res.status === 422) {
    const getRes = await ctx.get("/employee", {
      email,
      fields: "id,firstName,lastName,version,dateOfBirth",
    });
    const values = extractValues(getRes);
    const existing = values[0];
    if (existing) {
      const needsNameUpdate =
        (data.firstName && existing.firstName !== data.firstName) ||
        (data.lastName && existing.lastName !== data.lastName);
      const needsDobUpdate = !existing.dateOfBirth;
      if (needsNameUpdate || needsDobUpdate) {
        await ctx.put(`/employee/${existing.id}`, {
          id: existing.id,
          version: existing.version,
          firstName: data.firstName || existing.firstName,
          lastName: data.lastName || existing.lastName,
          dateOfBirth: existing.dateOfBirth || "1990-01-15",
        });
      }
      return existing.id as number;
    }
  }
  throw new Error(`Failed to create employee ${data.firstName} ${data.lastName}: ${res.message}`);
}

/** Get the first (admin) employee ID */
export async function getAdminEmployee(ctx: OrchestratorContext): Promise<number> {
  const res = await ctx.get("/employee", { fields: "id", count: "1" });
  const values = extractValues(res);
  if (values[0]?.id) return values[0].id as number;
  throw new Error("No admin employee found");
}

/** Create a customer. Returns customer ID. */
export async function createCustomer(
  ctx: OrchestratorContext,
  data: { name: string; organizationNumber?: string; email?: string },
): Promise<number> {
  const body: Record<string, unknown> = {
    name: data.name,
    isCustomer: true,
  };
  if (data.organizationNumber) body.organizationNumber = data.organizationNumber;
  if (data.email) body.email = data.email;
  const res = await ctx.post("/customer", body);
  if (res.ok) return extractId(res);
  // If 422, customer already exists — that's fine for scoring
  if (res.status === 422) {
    // Try to find by name
    const getRes = await ctx.get("/customer", { name: data.name, fields: "id" });
    const values = extractValues(getRes);
    if (values[0]?.id) return values[0].id as number;
  }
  throw new Error(`Failed to create customer ${data.name}: ${res.message}`);
}

/** Ensure a product exists. Handles pre-seeded products (GET-first if number given). Returns { id, price }. */
export async function ensureProduct(
  ctx: OrchestratorContext,
  data: {
    name: string;
    number?: number;
    price: number;
    vatPercent?: string;
  },
): Promise<{ id: number; price: number }> {
  const vatTypeId = vatPercentToId(data.vatPercent ?? "25");

  // If product number given, GET first to check pre-seeded
  if (data.number) {
    const getRes = await ctx.get("/product", {
      number: String(data.number),
      fields: "id,name,priceExcludingVatCurrency,vatType,version",
    });
    const values = extractValues(getRes);
    if (values[0]?.id) {
      const existing = values[0];
      // Check if name or price differs — if so, update
      if (existing.name !== data.name || existing.priceExcludingVatCurrency !== data.price) {
        await ctx.put(`/product/${existing.id}`, {
          id: existing.id,
          version: existing.version,
          name: data.name,
          priceExcludingVatCurrency: data.price,
          vatType: { id: vatTypeId },
        });
      }
      return { id: existing.id as number, price: data.price };
    }
  }

  // POST new product
  const body: Record<string, unknown> = {
    name: data.name,
    priceExcludingVatCurrency: data.price,
    vatType: { id: vatTypeId },
  };
  if (data.number) body.number = data.number;
  const res = await ctx.post("/product", body);
  if (res.ok) return { id: extractId(res), price: data.price };

  // 422 product number already in use
  if (res.status === 422 && data.number) {
    const getRes = await ctx.get("/product", {
      number: String(data.number),
      fields: "id,name,priceExcludingVatCurrency,version",
    });
    const values = extractValues(getRes);
    if (values[0]?.id) {
      const existing = values[0];
      if (existing.name !== data.name || existing.priceExcludingVatCurrency !== data.price) {
        await ctx.put(`/product/${existing.id}`, {
          id: existing.id,
          version: existing.version,
          name: data.name,
          priceExcludingVatCurrency: data.price,
          vatType: { id: vatTypeId },
        });
      }
      return { id: existing.id as number, price: data.price };
    }
  }

  throw new Error(`Failed to create product ${data.name}: ${res.message}`);
}

/** Ensure division exists. Returns division ID. */
export async function ensureDivision(ctx: OrchestratorContext): Promise<number> {
  const res = await ctx.get("/division", { fields: "id,name", count: "1" });
  const values = extractValues(res);
  if (values[0]?.id) return values[0].id as number;

  // Need to create — get municipality first
  const munRes = await ctx.get("/municipality", { count: "1", fields: "id" });
  const munValues = extractValues(munRes);
  const munId = munValues[0]?.id;
  if (!munId) throw new Error("No municipality found");

  const today = getOsloDate();
  const divRes = await ctx.post("/division", {
    name: "Hovedenhet",
    startDate: today,
    municipalityDate: today,
    organizationNumber: "000000000",
    municipality: { id: munId },
  });
  if (divRes.ok) return extractId(divRes);
  throw new Error(`Failed to create division: ${divRes.ok ? "" : divRes.message}`);
}

/** Get payment type for invoice payment. Returns payment type ID. */
export async function getPaymentType(ctx: OrchestratorContext): Promise<number> {
  const res = await ctx.get("/invoice/paymentType", { fields: "id,description" });
  const values = extractValues(res);
  if (values[0]?.id) return values[0].id as number;
  throw new Error("No payment types found");
}

/** Create a supplier. Returns supplier ID. */
export async function createSupplier(
  ctx: OrchestratorContext,
  data: { name: string; organizationNumber?: string; email?: string; phoneNumber?: string },
): Promise<number> {
  const body: Record<string, unknown> = {
    name: data.name,
    isSupplier: true,
  };
  if (data.organizationNumber) body.organizationNumber = data.organizationNumber;
  if (data.email) body.email = data.email;
  if (data.phoneNumber) body.phoneNumber = data.phoneNumber;
  const res = await ctx.post("/supplier", body);
  if (res.ok) return extractId(res);
  if (res.status === 422) {
    // Try to find existing
    if (data.organizationNumber) {
      const getRes = await ctx.get("/supplier", { organizationNumber: data.organizationNumber, fields: "id" });
      const values = extractValues(getRes);
      if (values[0]?.id) return values[0].id as number;
    }
    if (data.email) {
      const getRes = await ctx.get("/supplier", { email: data.email, fields: "id" });
      const values = extractValues(getRes);
      if (values[0]?.id) return values[0].id as number;
    }
  }
  throw new Error(`Failed to create supplier ${data.name}: ${res.message}`);
}

/** Create an invoice from a list of resolved products. Handles bank account, order, and invoice creation. Returns invoice ID. */
export async function createInvoiceFromProducts(
  ctx: OrchestratorContext,
  custId: number,
  products: Array<{ id: number; price: number; quantity: number; vatPercent: string }>,
  dueDate?: string,
  projectId?: number,
): Promise<number> {
  const today = getOsloDate();
  await ensureBankAccount(ctx);

  const orderLines = products.map((p) => ({
    product: { id: p.id },
    count: p.quantity,
    unitPriceExcludingVatCurrency: p.price,
    vatType: { id: vatPercentToId(p.vatPercent) },
  }));

  const orderBody: Record<string, unknown> = {
    customer: { id: custId },
    orderDate: today,
    deliveryDate: today,
    orderLines,
  };
  if (projectId) orderBody.project = { id: projectId };

  const orderRes = await ctx.post("/order", orderBody);
  if (!orderRes.ok) throw new Error(`Failed to create order: ${orderRes.message}`);

  const invoiceRes = await ctx.post("/invoice", {
    invoiceDate: today,
    invoiceDueDate: dueDate || addDays(today, 14),
    orders: [{ id: extractId(orderRes) }],
  });
  if (!invoiceRes.ok) throw new Error(`Failed to create invoice: ${invoiceRes.message}`);
  return extractId(invoiceRes);
}

/** Get a ledger account by number. Returns account ID. */
export async function getLedgerAccount(ctx: OrchestratorContext, accountNumber: string): Promise<number> {
  const res = await ctx.get("/ledger/account", { number: accountNumber, fields: "id" });
  const values = extractValues(res);
  if (values[0]?.id) return values[0].id as number;
  throw new Error(`Ledger account ${accountNumber} not found`);
}
