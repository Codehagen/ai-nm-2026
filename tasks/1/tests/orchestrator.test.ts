/**
 * Full test suite for the deterministic orchestrator.
 * Tests executor functions directly against the mock Tripletex server.
 * Bypasses LLM extraction — feeds pre-built data objects.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import { createMockApp } from "../src/mock/server.js";
import { TripletexClient } from "../src/tripletex.js";
import { OrchestratorContext, extractValues, extractId, extractValue } from "../src/orchestrator/helpers.js";
import { executeInvoice } from "../src/orchestrator/execute/invoice.js";
import { executeSalary } from "../src/orchestrator/execute/salary.js";
import { executeProject } from "../src/orchestrator/execute/project.js";
import { executeSupplierInvoice } from "../src/orchestrator/execute/supplier-invoice.js";
import { executeTimesheet } from "../src/orchestrator/execute/timesheet.js";
import { executeCreditNote } from "../src/orchestrator/execute/credit-note.js";
import type { InvoiceData } from "../src/orchestrator/schemas/invoice.js";
import type { SalaryData } from "../src/orchestrator/schemas/salary.js";
import type { ProjectData } from "../src/orchestrator/schemas/project.js";
import type { SupplierInvoiceData } from "../src/orchestrator/schemas/supplier-invoice.js";
import type { TimesheetData } from "../src/orchestrator/schemas/timesheet.js";
import type { CreditNoteData } from "../src/orchestrator/schemas/credit-note.js";

const TEST_PORT = 19099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let mockServer: ReturnType<typeof serve>;
let mockStore: ReturnType<typeof createMockApp>["store"];
let mockApp: ReturnType<typeof createMockApp>["app"];

function makeCtx(): OrchestratorContext {
  const client = new TripletexClient({ base_url: BASE_URL, session_token: "test-token" });
  return new OrchestratorContext(client);
}

// Start mock server once for all tests
const mock = createMockApp();
mockApp = mock.app;
mockStore = mock.store;
mockServer = serve({ fetch: mockApp.fetch, port: TEST_PORT });

afterAll(() => {
  mockServer.close();
});

describe("Orchestrator Executors", () => {
  beforeEach(async () => {
    // Reset mock store to seed state before each test
    await fetch(`${BASE_URL}/_reset`, { method: "POST" });
  });

  // ─── Invoice ──────────────────────────────────────────────────────

  describe("executeInvoice", () => {
    it("creates a new invoice with customer and products", async () => {
      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Test Kunde AS" },
        products: [{ name: "Konsulenttime", price: 1200, vatPercent: "25", quantity: 10 }],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      };

      await executeInvoice(ctx, data);

      // Verify: customer created
      const custRes = await ctx.get("/customer", { fields: "id,name" });
      const customers = extractValues(custRes);
      expect(customers.some((c) => c.name === "Test Kunde AS")).toBe(true);

      // Verify: product created (scoring checks products exist)
      const prodRes = await ctx.get("/product", { fields: "id,name" });
      const prods = extractValues(prodRes);
      expect(prods.some((p) => p.name === "Konsulenttime")).toBe(true);

      // Verify: invoice exists
      const invRes = await ctx.get("/invoice", { invoiceDateFrom: "2020-01-01", invoiceDateTo: "2030-01-01", fields: "id" });
      expect(extractValues(invRes).length).toBeGreaterThanOrEqual(1);

      // Verify: no API errors
      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);
    });

    it("creates invoice with send+payment via params (combined call)", async () => {
      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Combined Kunde" },
        products: [{ name: "Produkt A", price: 500, vatPercent: "25", quantity: 1 }],
        sendInvoice: true,
        registerPayment: true,
        isExistingInvoice: false,
      };

      await executeInvoice(ctx, data);

      // Verify: invoice POST includes payment params (combined, no separate PUT)
      const invPost = ctx.apiCalls.filter((c) => c.method === "POST" && c.path === "/invoice");
      expect(invPost.length).toBe(1);

      // Verify: NO separate PUT /:send or PUT /:payment (combined into POST params)
      const separateSend = ctx.apiCalls.filter((c) => c.method === "PUT" && c.path.includes("/:send"));
      const separatePayment = ctx.apiCalls.filter((c) => c.method === "PUT" && c.path.includes("/:payment"));
      expect(separateSend.length).toBe(0);
      expect(separatePayment.length).toBe(0);

      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);
    });

    it("skips customer+product for existing invoice payment", async () => {
      // First create an invoice so we have one to find
      const setupCtx = makeCtx();
      await executeInvoice(setupCtx, {
        customer: { name: "Existing Kunde" },
        products: [{ name: "Setup", price: 100, vatPercent: "25", quantity: 1 }],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      });

      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Existing Kunde" },
        products: [{ name: "Ignored", price: 100, vatPercent: "25", quantity: 1 }],
        sendInvoice: false,
        registerPayment: true,
        isExistingInvoice: true,
      };

      await executeInvoice(ctx, data);

      // Verify: NO customer POST (skipped for existing invoices)
      const custPosts = ctx.apiCalls.filter((c) => c.method === "POST" && c.path === "/customer");
      expect(custPosts.length).toBe(0);

      // Verify: NO product POST
      const prodPosts = ctx.apiCalls.filter((c) => c.method === "POST" && c.path === "/product");
      expect(prodPosts.length).toBe(0);
    });

    it("handles multi-product invoice with inline descriptions", async () => {
      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Multi AS" },
        products: [
          { name: "Produkt 1", price: 100, vatPercent: "25", quantity: 1 },
          { name: "Produkt 2", price: 200, vatPercent: "15", quantity: 3 },
          { name: "Produkt 3", price: 50, vatPercent: "0", quantity: 5 },
        ],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      };

      await executeInvoice(ctx, data);

      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);

      // Verify: products created
      const prodRes = await ctx.get("/product", { fields: "id,name" });
      const prods = extractValues(prodRes);
      expect(prods.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Salary ───────────────────────────────────────────────────────

  describe("executeSalary", () => {
    it("creates salary specification for employee with fastlonn", async () => {
      const ctx = makeCtx();
      const data: SalaryData = {
        employee: { firstName: "Ola", lastName: "Nordmann" },
        components: [{ type: "fastlonn", amount: 45000, count: 1 }],
      };

      await executeSalary(ctx, data);

      // Verify: employee created
      const empRes = await ctx.get("/employee", { fields: "id,firstName,lastName" });
      const employees = extractValues(empRes);
      expect(employees.some((e) => e.firstName === "Ola" && e.lastName === "Nordmann")).toBe(true);

      // Verify: salary/transaction POST was made (contains payslip with specifications)
      const txCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/salary/transaction"));
      expect(txCalls.length).toBeGreaterThanOrEqual(1);

      // Verify no unhandled errors (allow 422 handled retries, 404 for mock endpoints)
      const unhandledErrors = ctx.apiCalls.filter((c) => !c.ok && c.status !== 422 && c.status !== 404);
      expect(unhandledErrors.length).toBe(0);
    });

    it("handles multiple salary components via salary/transaction", async () => {
      const ctx = makeCtx();
      const data: SalaryData = {
        employee: { firstName: "Kari", lastName: "Hansen" },
        components: [
          { type: "fastlonn", amount: 40000, count: 1 },
          { type: "bonus", amount: 10000, count: 1 },
        ],
      };

      await executeSalary(ctx, data);

      // Verify: salary/transaction POST was made
      const txCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/salary/transaction"));
      expect(txCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("completes within 15 seconds", async () => {
      const ctx = makeCtx();
      const data: SalaryData = {
        employee: { firstName: "Speed", lastName: "Test" },
        components: [{ type: "fastlonn", amount: 30000, count: 1 }],
      };

      const start = Date.now();
      await executeSalary(ctx, data);
      const elapsed = Date.now() - start;

      // Must complete fast (without LLM, should be <2s against mock)
      expect(elapsed).toBeLessThan(15000);
    });
  });

  // ─── Project ──────────────────────────────────────────────────────

  describe("executeProject", () => {
    it("creates project with PM dance", async () => {
      const ctx = makeCtx();
      const data: ProjectData = {
        project: { name: "Testprosjekt Alpha", isFixedPrice: false },
        projectManager: { firstName: "Per", lastName: "Olsen" },
        customer: { name: "Kunde AS" },
      };

      await executeProject(ctx, data);

      // Verify: project created
      const projRes = await ctx.get("/project", { fields: "id,name,projectManager" });
      const projects = extractValues(projRes);
      const proj = projects.find((p) => p.name === "Testprosjekt Alpha");
      expect(proj).toBeDefined();

      // Verify: PM entitlements were granted (always, no condition)
      const entitleCalls = ctx.apiCalls.filter((c) => c.method === "PUT" && c.path.includes("entitlement"));
      expect(entitleCalls.length).toBeGreaterThanOrEqual(1);

      // Verify: PM was updated (PUT call exists)
      const putCalls = ctx.apiCalls.filter((c) => c.method === "PUT" && c.path.includes("/project/"));
      expect(putCalls.length).toBeGreaterThanOrEqual(1);

      const errors = ctx.apiCalls.filter((c) => !c.ok && c.status !== 422 && c.status !== 404);
      expect(errors.length).toBe(0);
    });

    it("handles fixed price project", async () => {
      const ctx = makeCtx();
      const data: ProjectData = {
        project: { name: "Fastpris Prosjekt", isFixedPrice: true, fixedPrice: 250000 },
        projectManager: { firstName: "Lisa", lastName: "Berg" },
        customer: { name: "Fastpris Kunde" },
      };

      await executeProject(ctx, data);

      // Verify: project created with PUT for fixedprice
      const putCalls = ctx.apiCalls.filter((c) => c.method === "PUT" && c.path.includes("/project/"));
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      // Check that fixedprice (lowercase) was in the body
      const putBody = putCalls[0].body as Record<string, unknown>;
      expect(putBody.isFixedPrice).toBe(true);
      expect(putBody.fixedprice).toBe(250000);
    });

    it("creates project with invoice", async () => {
      const ctx = makeCtx();
      const data: ProjectData = {
        project: { name: "Fakturert Prosjekt", isFixedPrice: false },
        projectManager: { firstName: "Erik", lastName: "Sunde" },
        customer: { name: "Faktura Kunde" },
        invoice: {
          create: true,
          products: [{ name: "Rådgivning", price: 1500, quantity: 40, vatPercent: "25" }],
        },
      };

      await executeProject(ctx, data);

      // Verify: invoice created
      const invRes = await ctx.get("/invoice", { invoiceDateFrom: "2020-01-01", invoiceDateTo: "2030-01-01", fields: "id" });
      expect(extractValues(invRes).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Supplier Invoice ─────────────────────────────────────────────

  describe("executeSupplierInvoice", () => {
    it("creates supplier invoice with voucher booking", async () => {
      const ctx = makeCtx();
      const data: SupplierInvoiceData = {
        supplier: { name: "Kontor AS", organizationNumber: "987654321" },
        invoiceNumber: "INV-2026-001",
        invoiceDate: "2026-03-20",
        dueDate: "2026-04-20",
        description: "Kontorrekvisita",
        amountExclVat: 8000,
        amountInclVat: 10000,
        vatPercent: "25",
        expenseAccount: "7300",
      };

      await executeSupplierInvoice(ctx, data);

      // Verify: supplier created
      const supRes = await ctx.get("/supplier", { fields: "id,name" });
      const suppliers = extractValues(supRes);
      expect(suppliers.some((s) => s.name === "Kontor AS")).toBe(true);

      // Verify: supplier invoice created (POST call)
      const postCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/supplierInvoice"));
      expect(postCalls.length).toBe(1);
      expect(postCalls[0].ok).toBe(true);

      // Verify: voucher was booked (sendToLedger PUT)
      const bookCalls = ctx.apiCalls.filter((c) => c.path.includes("/:sendToLedger"));
      expect(bookCalls.length).toBe(1);

      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);
    });

    it("includes department on voucher posting when departmentName is set", async () => {
      const ctx = makeCtx();
      const data: SupplierInvoiceData = {
        supplier: { name: "Elkjøp" },
        invoiceNumber: "KVT-001",
        invoiceDate: "2026-01-07",
        dueDate: "2026-01-07",
        description: "Tastatur",
        amountExclVat: 4360,
        amountInclVat: 5450,
        vatPercent: "25",
        expenseAccount: "7300",
        departmentName: "Kundeservice",
      };

      await executeSupplierInvoice(ctx, data);

      // Verify: department was created
      const deptCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path === "/department");
      expect(deptCalls.length).toBeGreaterThanOrEqual(1);

      // Verify: supplier invoice posting includes department
      const siCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/supplierInvoice"));
      expect(siCalls.length).toBe(1);
      const body = siCalls[0].body as Record<string, unknown>;
      const voucher = body?.voucher as Record<string, unknown>;
      const postings = voucher?.postings as Array<Record<string, unknown>>;
      const expensePosting = postings?.[0];
      expect(expensePosting?.department).toBeDefined();
      expect((expensePosting?.department as Record<string, unknown>)?.id).toBeTruthy();
    });

    it("corrects date-format invoiceNumber to KVITTERING", async () => {
      const ctx = makeCtx();
      const data: SupplierInvoiceData = {
        supplier: { name: "Receipt Store" },
        invoiceNumber: "22.02.2026", // Date format — should be corrected
        invoiceDate: "2026-02-22",
        dueDate: "2026-02-22",
        description: "Kontorstoler",
        amountExclVat: 4000,
        amountInclVat: 5000,
        vatPercent: "25",
        expenseAccount: "7300", // Use account that exists in mock
      };

      await executeSupplierInvoice(ctx, data);

      const siCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/supplierInvoice"));
      const body = siCalls[0].body as Record<string, unknown>;
      expect(body.invoiceNumber).toBe("KVITTERING");
    });

    it("forces account 7350 for meal descriptions (keyword correction)", async () => {
      const ctx = makeCtx();
      // Test that the keyword correction triggers — we verify the data mutation
      // rather than the API call, since 7350 might not exist in mock
      const data: SupplierInvoiceData = {
        supplier: { name: "Restaurant" },
        invoiceNumber: "KVITTERING",
        invoiceDate: "2026-03-20",
        dueDate: "2026-03-20",
        description: "Kundemøte lunsj",
        amountExclVat: 800,
        amountInclVat: 1000,
        vatPercent: "25",
        expenseAccount: "7100", // Wrong — should be corrected to 7350
      };

      // The executor mutates data.expenseAccount before API calls
      // We can't easily test the mutation without the account existing,
      // so verify the correction happens by checking the GET call targets 7350
      try {
        await executeSupplierInvoice(ctx, data);
      } catch {
        // May fail because 7350 doesn't exist in mock — that's fine
      }

      // Verify: the account lookup attempted 7350 (not 7100)
      const acctGets = ctx.apiCalls.filter((c) => c.method === "GET" && c.path === "/ledger/account");
      const acctNumbers = acctGets.map((c) => (c as { params?: Record<string, string> }).params?.number).filter(Boolean);
      expect(acctNumbers).toContain("7350");
      expect(acctNumbers).not.toContain("7100");
    });

    it("sends voucher to ledger via separate PUT (not param)", async () => {
      const ctx = makeCtx();
      const data: SupplierInvoiceData = {
        supplier: { name: "Ledger Test AS" },
        invoiceNumber: "INV-001",
        invoiceDate: "2026-03-20",
        dueDate: "2026-04-20",
        description: "Services",
        amountExclVat: 8000,
        amountInclVat: 10000,
        vatPercent: "25",
        expenseAccount: "7300",
      };

      await executeSupplierInvoice(ctx, data);

      // Verify: separate PUT /:sendToLedger (NOT as param on POST)
      const sendCalls = ctx.apiCalls.filter((c) => c.path.includes("/:sendToLedger"));
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0].method).toBe("PUT");
    });

    it("omits department from posting when departmentName is not set", async () => {
      const ctx = makeCtx();
      const data: SupplierInvoiceData = {
        supplier: { name: "Office AS" },
        invoiceNumber: "INV-100",
        invoiceDate: "2026-03-15",
        dueDate: "2026-04-15",
        description: "Kontorutstyr",
        amountExclVat: 2000,
        amountInclVat: 2500,
        vatPercent: "25",
        expenseAccount: "7300",
      };

      await executeSupplierInvoice(ctx, data);

      const siCalls = ctx.apiCalls.filter((c) => c.method === "POST" && c.path.includes("/supplierInvoice"));
      const body = siCalls[0].body as Record<string, unknown>;
      const voucher = body?.voucher as Record<string, unknown>;
      const postings = voucher?.postings as Array<Record<string, unknown>>;
      const expensePosting = postings?.[0];
      expect(expensePosting?.department).toBeUndefined();
    });
  });

  // ─── Timesheet ────────────────────────────────────────────────────

  describe("executeTimesheet", () => {
    it("creates timesheet entries with project", async () => {
      const ctx = makeCtx();
      const data: TimesheetData = {
        employee: { firstName: "Marte", lastName: "Strand" },
        project: { name: "Utviklingsprosjekt" },
        customer: { name: "Dev Kunde AS" },
        entries: [
          { activityName: "Utvikling", date: "2026-03-20", hours: 7.5, comment: "Frontend" },
          { activityName: "Utvikling", date: "2026-03-21", hours: 8, comment: "Backend" },
        ],
      };

      await executeTimesheet(ctx, data);

      // Verify: timesheet entries created
      const tsRes = await ctx.get("/timesheet/entry", { fields: "id,hours" });
      const entries = extractValues(tsRes);
      expect(entries.length).toBeGreaterThanOrEqual(2);

      // Verify: project created with PM dance
      const projRes = await ctx.get("/project", { fields: "id,name" });
      const projects = extractValues(projRes);
      expect(projects.some((p) => p.name === "Utviklingsprosjekt")).toBe(true);

      // Verify: activity created
      const actRes = await ctx.get("/activity", { fields: "id,name" });
      const activities = extractValues(actRes);
      expect(activities.some((a) => a.name === "Utvikling")).toBe(true);

      const errors = ctx.apiCalls.filter((c) => !c.ok && c.status !== 422);
      expect(errors.length).toBe(0);
    });

    it("creates timesheet with invoice", async () => {
      const ctx = makeCtx();
      const data: TimesheetData = {
        employee: { firstName: "Jonas", lastName: "Lie" },
        project: { name: "Konsulentprosjekt" },
        customer: { name: "Konsulent Kunde" },
        entries: [
          { activityName: "Konsultering", date: "2026-03-20", hours: 8 },
        ],
        invoice: {
          create: true,
          products: [{ name: "Konsulenttime", price: 1500, quantity: 8, vatPercent: "25" }],
        },
      };

      await executeTimesheet(ctx, data);

      // Verify: invoice created
      const invRes = await ctx.get("/invoice", { invoiceDateFrom: "2020-01-01", invoiceDateTo: "2030-01-01", fields: "id" });
      expect(extractValues(invRes).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Credit Note ──────────────────────────────────────────────────

  describe("executeCreditNote", () => {
    it("creates new invoice and credits it", async () => {
      const ctx = makeCtx();
      const data: CreditNoteData = {
        customer: { name: "Kredit Kunde" },
        products: [{ name: "Feilkjøp", price: 500, vatPercent: "25", quantity: 1 }],
        isExistingInvoice: false,
        createNewInvoice: true,
      };

      await executeCreditNote(ctx, data);

      // Verify: send was called before credit note
      const sendCalls = ctx.apiCalls.filter((c) => c.path.includes("/:send"));
      expect(sendCalls.length).toBe(1);
      expect(sendCalls[0].ok).toBe(true);

      // Verify: credit note was created
      const creditCalls = ctx.apiCalls.filter((c) => c.path.includes("/:createCreditNote"));
      expect(creditCalls.length).toBe(1);
      expect(creditCalls[0].ok).toBe(true);

      // Verify: send happened BEFORE credit note (order matters)
      const sendIdx = ctx.apiCalls.findIndex((c) => c.path.includes("/:send"));
      const creditIdx = ctx.apiCalls.findIndex((c) => c.path.includes("/:createCreditNote"));
      expect(sendIdx).toBeLessThan(creditIdx);

      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);
    });
  });

  // ─── API call logging ─────────────────────────────────────────────

  describe("OrchestratorContext logging", () => {
    it("tracks all API calls with correct structure", async () => {
      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Log Test" },
        products: [{ name: "Log Produkt", price: 100, vatPercent: "25", quantity: 1 }],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      };

      await executeInvoice(ctx, data);

      // Every API call should be logged
      expect(ctx.apiCalls.length).toBeGreaterThan(0);

      // Each entry should have the required fields
      for (const call of ctx.apiCalls) {
        expect(call).toHaveProperty("method");
        expect(call).toHaveProperty("path");
        expect(call).toHaveProperty("ok");
        expect(["GET", "POST", "PUT", "DELETE"]).toContain(call.method);
        expect(call.path.startsWith("/")).toBe(true);
      }
    });

    it("reports zero errors on happy path", async () => {
      const ctx = makeCtx();
      const data: InvoiceData = {
        customer: { name: "Zero Error" },
        products: [{ name: "Clean", price: 100, vatPercent: "25", quantity: 1 }],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      };

      await executeInvoice(ctx, data);

      const errors = ctx.apiCalls.filter((c) => !c.ok);
      expect(errors.length).toBe(0);
    });
  });

  // ─── Efficiency ───────────────────────────────────────────────────

  describe("Efficiency (API call counts)", () => {
    it("invoice uses ≤8 API calls", async () => {
      const ctx = makeCtx();
      await executeInvoice(ctx, {
        customer: { name: "Eff Kunde" },
        products: [{ name: "Eff Prod", price: 100, vatPercent: "25", quantity: 1 }],
        sendInvoice: false,
        registerPayment: false,
        isExistingInvoice: false,
      });
      // customer GET + POST + product GET/POST + bank GET + PUT + order POST + invoice POST
      expect(ctx.apiCalls.length).toBeLessThanOrEqual(8);
      // Verify: zero write errors
      const writeErrors = ctx.apiCalls.filter((c) => !c.ok && ["POST","PUT","DELETE","PATCH"].includes(c.method));
      expect(writeErrors.length).toBe(0);
    });

    it("supplier-invoice uses ≤9 API calls", async () => {
      const ctx = makeCtx();
      await executeSupplierInvoice(ctx, {
        supplier: { name: "Eff Supplier" },
        invoiceNumber: "INV-EFF",
        invoiceDate: "2026-03-20",
        dueDate: "2026-04-20",
        description: "Efficiency test",
        amountExclVat: 1000,
        amountInclVat: 1250,
        vatPercent: "25",
        expenseAccount: "7300",
      });
      // supplier GET + supplier POST + acct GET x2 + vatLock GET + supplierInvoice POST + sendToLedger PUT
      expect(ctx.apiCalls.length).toBeLessThanOrEqual(9);
      const writeErrors = ctx.apiCalls.filter((c) => !c.ok && ["POST","PUT","DELETE","PATCH"].includes(c.method));
      expect(writeErrors.length).toBe(0);
    });

    it("salary uses ≤15 API calls", async () => {
      const ctx = makeCtx();
      await executeSalary(ctx, {
        employee: { firstName: "Eff", lastName: "Sal" },
        components: [{ type: "fastlonn", amount: 30000, count: 1 }],
      });
      // dept GET + dept POST + emp GET + emp POST + div GET + [mun GET + div POST] + employment POST + salary types GET + transaction POST
      expect(ctx.apiCalls.length).toBeLessThanOrEqual(15);
    });
  });
});
