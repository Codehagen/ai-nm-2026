import { describe, it, expect, beforeEach } from "vitest";
import { createMockApp } from "../src/mock/server.js";
import type { Hono } from "hono";
import type { EntityStore } from "../src/mock/store.js";

// Helper: make requests against the Hono app directly (no network)
function makeClient(app: Hono) {
  const authHeader = "Basic " + Buffer.from("0:test-token").toString("base64");

  return {
    async get(path: string, opts?: { noAuth?: boolean }) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!opts?.noAuth) headers.Authorization = authHeader;
      const res = await app.request(path, { method: "GET", headers });
      return { status: res.status, body: await res.json() };
    },
    async post(path: string, body?: unknown, opts?: { noAuth?: boolean }) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!opts?.noAuth) headers.Authorization = authHeader;
      const res = await app.request(path, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) return { status: 204, body: null };
      return { status: res.status, body: await res.json() };
    },
    async put(path: string, body?: unknown, opts?: { noAuth?: boolean; params?: Record<string, string> }) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!opts?.noAuth) headers.Authorization = authHeader;
      let url = path;
      if (opts?.params) {
        const sp = new URLSearchParams(opts.params);
        url += "?" + sp.toString();
      }
      const res = await app.request(url, {
        method: "PUT",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) return { status: 204, body: null };
      return { status: res.status, body: await res.json() };
    },
    async del(path: string) {
      const res = await app.request(path, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (res.status === 204) return { status: 204, body: null };
      return { status: res.status, body: await res.json() };
    },
  };
}

describe("Mock Tripletex API", () => {
  let app: Hono;
  let store: EntityStore;
  let client: ReturnType<typeof makeClient>;

  beforeEach(() => {
    const mock = createMockApp();
    app = mock.app;
    store = mock.store;
    client = makeClient(app);
  });

  // ─── Auth ──────────────────────────────────────────────────────────

  describe("Authentication", () => {
    it("accepts valid Basic Auth", async () => {
      const res = await client.get("/employee");
      expect(res.status).toBe(200);
    });

    it("rejects missing auth header", async () => {
      const res = await client.get("/employee", { noAuth: true });
      expect(res.status).toBe(401);
    });

    it("rejects invalid auth format", async () => {
      const headers = { Authorization: "Bearer xyz", "Content-Type": "application/json" };
      const res = await app.request("/employee", { method: "GET", headers });
      expect(res.status).toBe(401);
    });

    it("allows unauthenticated health check", async () => {
      const res = await client.get("/", { noAuth: true });
      expect(res.status).toBe(200);
      expect(res.body.service).toBe("mock-tripletex");
    });
  });

  // ─── GET List ──────────────────────────────────────────────────────

  describe("GET list", () => {
    it("returns all entities with envelope", async () => {
      const res = await client.get("/employee");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("fullResultSize");
      expect(res.body).toHaveProperty("from", 0);
      expect(res.body).toHaveProperty("count");
      expect(res.body).toHaveProperty("versionDigest");
      expect(res.body).toHaveProperty("values");
      expect(res.body.values.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by fields param — returns only requested keys", async () => {
      const res = await client.get("/employee?fields=id,firstName");
      expect(res.status).toBe(200);
      const emp = res.body.values[0];
      expect(emp).toHaveProperty("id");
      expect(emp).toHaveProperty("firstName");
      // Real Tripletex only returns requested fields, not version
      expect(Object.keys(emp).sort()).toEqual(["firstName", "id"]);
    });

    it("paginates with from and count", async () => {
      await client.post("/department", { name: "Test", departmentNumber: "1" });
      const deptRes = await client.get("/department?name=Test");
      const deptId = deptRes.body.values[0].id;
      await client.post("/employee", { firstName: "A", lastName: "B", userType: "STANDARD", department: { id: deptId } });

      const res = await client.get("/employee?from=0&count=1");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.fullResultSize).toBeGreaterThanOrEqual(2);
    });

    it("searches by name", async () => {
      await client.post("/customer", { name: "Acme Corp", isCustomer: true });
      const res = await client.get("/customer?name=Acme");
      expect(res.status).toBe(200);
      expect(res.body.values.length).toBe(1);
      expect(res.body.values[0].name).toBe("Acme Corp");
    });

    it("returns empty values array when no match", async () => {
      const res = await client.get("/customer?name=NonExistent");
      expect(res.status).toBe(200);
      expect(res.body.values).toEqual([]);
      expect(res.body.fullResultSize).toBe(0);
    });

    it("requires date range for invoice GET", async () => {
      const res = await client.get("/invoice");
      expect(res.status).toBe(422);
      expect(res.body.validationMessages).toContainEqual(
        expect.objectContaining({ field: "invoiceDateFrom" })
      );
    });

    it("requires date range for order GET", async () => {
      const res = await client.get("/order");
      expect(res.status).toBe(422);
      expect(res.body.validationMessages).toContainEqual(
        expect.objectContaining({ field: "orderDateFrom" })
      );
    });

    it("allows invoice GET with date range", async () => {
      const res = await client.get("/invoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2026-12-31");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("values");
    });
  });

  // ─── GET by ID ──────────────────────────────────────────────────────

  describe("GET by ID", () => {
    it("returns entity by ID", async () => {
      const res = await client.get("/employee/30000001");
      expect(res.status).toBe(200);
      expect(res.body.value).toHaveProperty("id", 30000001);
      expect(res.body.value).toHaveProperty("firstName", "Admin");
    });

    it("returns 404 for non-existent ID", async () => {
      const res = await client.get("/employee/99999999");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("status", 404);
      // Matches real API error shape
      expect(res.body).toHaveProperty("code");
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("link");
      expect(res.body).toHaveProperty("developerMessage");
      expect(res.body).toHaveProperty("requestId");
    });
  });

  // ─── POST (Create) ─────────────────────────────────────────────────

  describe("POST (create)", () => {
    it("creates entity with auto-increment ID", async () => {
      const res = await client.post("/customer", { name: "Test AS", isCustomer: true });
      expect(res.status).toBe(201);
      expect(res.body.value).toHaveProperty("id");
      expect(res.body.value).toHaveProperty("version", 0);
      expect(res.body.value.name).toBe("Test AS");
    });

    it("rejects missing required fields with 422 and real error shape", async () => {
      const res = await client.post("/customer", {});
      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty("code", 18000);
      expect(res.body).toHaveProperty("link", "https://tripletex.no/v2-docs/");
      expect(res.body).toHaveProperty("developerMessage");
      expect(res.body).toHaveProperty("requestId");
      const vm = res.body.validationMessages[0];
      expect(vm).toHaveProperty("field", "name");
      expect(vm).toHaveProperty("path");
      expect(vm).toHaveProperty("rootId");
    });

    it("rejects invalid reference with 422", async () => {
      const res = await client.post("/employee", {
        firstName: "Test",
        lastName: "User",
        userType: "STANDARD",
        department: { id: 99999 },
      });
      expect(res.status).toBe(422);
      expect(res.body.validationMessages[0].field).toBe("department.id");
    });

    it("runs custom validation", async () => {
      await client.post("/department", { name: "Dept", departmentNumber: "1" });
      const deptRes = await client.get("/department?name=Dept");
      const deptId = deptRes.body.values[0].id;

      const res = await client.post("/employee", {
        firstName: "Test",
        lastName: "User",
        userType: "INVALID_TYPE",
        department: { id: deptId },
      });
      expect(res.status).toBe(422);
      expect(res.body.validationMessages[0].field).toBe("userType");
    });
  });

  // ─── PUT (Update) ──────────────────────────────────────────────────

  describe("PUT (update)", () => {
    it("updates entity with correct version", async () => {
      const createRes = await client.post("/customer", { name: "Old Name", isCustomer: true });
      const id = createRes.body.value.id;
      const version = createRes.body.value.version;

      const res = await client.put(`/customer/${id}`, { id, version, name: "New Name" });
      expect(res.status).toBe(200);
      expect(res.body.value.name).toBe("New Name");
      expect(res.body.value.version).toBe(version + 1);
    });

    it("rejects version conflict with 409 and correct code", async () => {
      const createRes = await client.post("/customer", { name: "Test", isCustomer: true });
      const id = createRes.body.value.id;

      const res = await client.put(`/customer/${id}`, { id, version: 999, name: "New" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe(8000); // Real API uses code 8000 for RevisionException
    });

    it("returns 404 for non-existent entity", async () => {
      const res = await client.put("/customer/99999999", { id: 99999999, version: 0, name: "X" });
      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE ─────────────────────────────────────────────────────────

  describe("DELETE", () => {
    it("deletes existing customer with 204", async () => {
      const createRes = await client.post("/customer", { name: "ToDelete", isCustomer: true });
      const id = createRes.body.value.id;

      const res = await client.del(`/customer/${id}`);
      expect(res.status).toBe(204);

      const getRes = await client.get(`/customer/${id}`);
      expect(getRes.status).toBe(404);
    });

    it("returns 404 for non-existent entity", async () => {
      const res = await client.del("/customer/99999999");
      expect(res.status).toBe(404);
    });

    it("deletes travel expense with 204", async () => {
      const teRes = await client.post("/travelExpense", {
        employee: { id: 30000001 },
        title: "Kundebesøk",
      });
      const id = teRes.body.value.id;

      const res = await client.del(`/travelExpense/${id}`);
      expect(res.status).toBe(204);
    });
  });

  // ─── Invoice Actions ───────────────────────────────────────────────

  describe("Invoice actions", () => {
    let invoiceId: number;

    beforeEach(async () => {
      const custRes = await client.post("/customer", { name: "InvCust", isCustomer: true });
      const custId = custRes.body.value.id;

      const prodRes = await client.post("/product", {
        name: "Widget",
        priceExcludingVatCurrency: 1000,
        vatType: { id: 3 },
      });
      const prodId = prodRes.body.value.id;

      const orderRes = await client.post("/order", {
        customer: { id: custId },
        deliveryDate: "2026-03-20",
        orderDate: "2026-03-20",
        orderLines: [{ product: { id: prodId }, count: 1, unitPriceExcludingVatCurrency: 1000, vatType: { id: 3 } }],
      });
      const orderId = orderRes.body.value.id;

      await client.put("/ledger/account/30000001", {
        id: 30000001,
        version: 0,
        bankAccountNumber: "12345678901",
      });

      const invRes = await client.post("/invoice", {
        invoiceDate: "2026-03-20",
        invoiceDueDate: "2026-04-20",
        orders: [{ id: orderId }],
      });
      invoiceId = invRes.body.value.id;
    });

    it("registers payment with query params", async () => {
      const res = await client.put(`/invoice/${invoiceId}/:payment`, undefined, {
        params: {
          paymentDate: "2026-03-20",
          paymentTypeId: "30000001",
          paidAmount: "1250",
        },
      });
      expect(res.status).toBe(204);
    });

    it("rejects payment with missing params", async () => {
      const res = await client.put(`/invoice/${invoiceId}/:payment`, undefined, {
        params: { paymentDate: "2026-03-20" },
      });
      expect(res.status).toBe(422);
      expect(res.body.validationMessages.length).toBeGreaterThanOrEqual(1);
    });

    it("sends invoice with sendType", async () => {
      const res = await client.put(`/invoice/${invoiceId}/:send`, undefined, {
        params: { sendType: "EMAIL" },
      });
      expect(res.status).toBe(204);
    });

    it("rejects send without sendType", async () => {
      const res = await client.put(`/invoice/${invoiceId}/:send`, undefined, {});
      expect(res.status).toBe(422);
    });

    it("creates credit note", async () => {
      const res = await client.post(`/invoice/${invoiceId}/:createCreditNote`);
      expect(res.status).toBe(201);
      expect(res.body.value).toHaveProperty("isCreditNote", true);
      expect(res.body.value).toHaveProperty("creditedInvoice", invoiceId);
    });

    it("returns 404 for payment on non-existent invoice", async () => {
      const res = await client.put("/invoice/99999/:payment", undefined, {
        params: { paymentDate: "2026-03-20", paymentTypeId: "30000001", paidAmount: "100" },
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Static Lookups ────────────────────────────────────────────────

  describe("Static lookups", () => {
    it("lists payment types matching real sandbox", async () => {
      const res = await client.get("/invoice/paymentType");
      expect(res.status).toBe(200);
      expect(res.body.values.length).toBe(2);
      const descriptions = res.body.values.map((v: any) => v.description);
      expect(descriptions).toContain("Kontant");
      expect(descriptions).toContain("Betalt til bank");
    });

    it("lists VAT types with correct shape", async () => {
      const res = await client.get("/ledger/vatType");
      expect(res.status).toBe(200);
      expect(res.body.values.length).toBeGreaterThanOrEqual(2);
      const vat25 = res.body.values.find((v: any) => v.id === 3);
      expect(vat25).toHaveProperty("percentage", 25.0);
      expect(vat25).toHaveProperty("displayName");
    });
  });

  // ─── Store Reset ───────────────────────────────────────────────────

  describe("Store reset", () => {
    it("resets to seed state", async () => {
      await client.post("/customer", { name: "Extra", isCustomer: true });
      let custRes = await client.get("/customer");
      expect(custRes.body.values.length).toBe(1);

      await client.post("/_reset");

      custRes = await client.get("/customer");
      expect(custRes.body.values.length).toBe(0);

      const empRes = await client.get("/employee");
      expect(empRes.body.values.length).toBe(1);
      expect(empRes.body.values[0].firstName).toBe("Admin");
    });
  });

  // ─── Response Envelope Shape (matches real API) ─────────────────────

  describe("Response envelope shape", () => {
    it("wrapValue has value key", async () => {
      const res = await client.get("/employee/30000001");
      expect(res.body).toHaveProperty("value");
      expect(res.body.value).toHaveProperty("id");
      expect(res.body.value).toHaveProperty("version");
    });

    it("wrapList has fullResultSize, from, count, versionDigest, values", async () => {
      const res = await client.get("/employee");
      expect(res.body).toHaveProperty("fullResultSize");
      expect(res.body).toHaveProperty("from");
      expect(res.body).toHaveProperty("count");
      expect(res.body).toHaveProperty("versionDigest");
      expect(res.body).toHaveProperty("values");
      expect(Array.isArray(res.body.values)).toBe(true);
    });

    it("error response matches real Tripletex shape", async () => {
      const res = await client.get("/employee/99999999");
      expect(res.body).toHaveProperty("status", 404);
      expect(res.body).toHaveProperty("code", 12000);
      expect(res.body).toHaveProperty("message");
      expect(res.body).toHaveProperty("link", "https://tripletex.no/v2-docs/");
      expect(res.body).toHaveProperty("developerMessage");
      expect(res.body).toHaveProperty("requestId");
    });
  });

  // ─── Ledger Account ─────────────────────────────────────────────────

  describe("Ledger account", () => {
    it("finds account 1920 by number", async () => {
      const res = await client.get("/ledger/account?number=1920");
      expect(res.status).toBe(200);
      expect(res.body.values.length).toBe(1);
      expect(res.body.values[0].number).toBe(1920);
      expect(res.body.values[0].name).toBe("Bankinnskudd");
    });

    it("updates bank account number", async () => {
      const listRes = await client.get("/ledger/account?number=1920");
      const acct = listRes.body.values[0];

      const res = await client.put(`/ledger/account/${acct.id}`, {
        id: acct.id,
        version: acct.version,
        bankAccountNumber: "12345678901",
      });
      expect(res.status).toBe(200);
      expect(res.body.value.bankAccountNumber).toBe("12345678901");
    });
  });

  // ─── Employee Entitlements ──────────────────────────────────────────

  describe("Employee entitlements", () => {
    it("grants entitlements by template", async () => {
      const res = await client.put("/employee/entitlement/:grantEntitlementsByTemplate", {});
      expect(res.status).toBe(204);
    });

    it("creates an entitlement", async () => {
      const res = await client.post("/employee/entitlement", {
        employee: { id: 30000001 },
        entitlementId: 1,
      });
      expect(res.status).toBe(201);
    });
  });

  // ─── Full Workflow: Create Employee ─────────────────────────────────

  describe("Full workflow: create employee", () => {
    it("follows the mandatory recipe", async () => {
      const deptRes = await client.post("/department", { name: "Avdeling", departmentNumber: "1" });
      expect(deptRes.status).toBe(201);
      const deptId = deptRes.body.value.id;

      const empRes = await client.post("/employee", {
        firstName: "Ola",
        lastName: "Nordmann",
        email: "ola@example.com",
        dateOfBirth: "1990-01-15",
        userType: "STANDARD",
        department: { id: deptId },
      });
      expect(empRes.status).toBe(201);
      expect(empRes.body.value.firstName).toBe("Ola");
      expect(empRes.body.value.department.id).toBe(deptId);
    });
  });

  // ─── Full Workflow: Invoice Chain ──────────────────────────────────

  describe("Full workflow: invoice chain", () => {
    it("creates customer → product → order → invoice → payment", async () => {
      const custRes = await client.post("/customer", {
        name: "Acme AS",
        isCustomer: true,
        organizationNumber: "987654321",
      });
      expect(custRes.status).toBe(201);
      const custId = custRes.body.value.id;

      const prodRes = await client.post("/product", {
        name: "Consulting",
        priceExcludingVatCurrency: 1000,
        priceIncludingVatCurrency: 1250,
        vatType: { id: 3 },
      });
      expect(prodRes.status).toBe(201);
      const prodId = prodRes.body.value.id;

      const orderRes = await client.post("/order", {
        customer: { id: custId },
        deliveryDate: "2026-03-20",
        orderDate: "2026-03-20",
        orderLines: [{
          product: { id: prodId },
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
          vatType: { id: 3 },
        }],
      });
      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.value.id;

      const acctRes = await client.get("/ledger/account?number=1920");
      const acct = acctRes.body.values[0];
      await client.put(`/ledger/account/${acct.id}`, {
        id: acct.id,
        version: acct.version,
        bankAccountNumber: "12345678901",
      });

      const invRes = await client.post("/invoice", {
        invoiceDate: "2026-03-20",
        invoiceDueDate: "2026-04-20",
        orders: [{ id: orderId }],
      });
      expect(invRes.status).toBe(201);
      const invId = invRes.body.value.id;

      const ptRes = await client.get("/invoice/paymentType");
      const ptId = ptRes.body.values[0].id;

      const payRes = await client.put(`/invoice/${invId}/:payment`, undefined, {
        params: {
          paymentDate: "2026-03-20",
          paymentTypeId: String(ptId),
          paidAmount: "1250",
        },
      });
      expect(payRes.status).toBe(204);
    });
  });

  // ─── Full Workflow: Project ─────────────────────────────────────────

  describe("Full workflow: project", () => {
    it("creates project with admin as manager", async () => {
      const empRes = await client.get("/employee?fields=id&count=1");
      const adminId = empRes.body.values[0].id;

      const custRes = await client.post("/customer", { name: "Project Client", isCustomer: true });
      const custId = custRes.body.value.id;

      const projRes = await client.post("/project", {
        name: "Website Redesign",
        projectManager: { id: adminId },
        customer: { id: custId },
        isInternal: false,
        startDate: "2026-03-20",
      });
      expect(projRes.status).toBe(201);
      expect(projRes.body.value.name).toBe("Website Redesign");
      expect(projRes.body.value.projectManager.id).toBe(adminId);
    });
  });

  // ─── Full Workflow: Travel Expense with Costs & Per Diem ────────────

  describe("Full workflow: travel expense with costs and per diem", () => {
    it("creates travel expense, adds costs and per diem", async () => {
      // Create employee
      const deptRes = await client.post("/department", { name: "Reise", departmentNumber: "99" });
      expect(deptRes.status).toBe(201);
      const deptId = deptRes.body.value.id;

      const empRes = await client.post("/employee", {
        firstName: "Lucy",
        lastName: "Walker",
        email: "lucy@example.org",
        dateOfBirth: "1990-01-15",
        userType: "STANDARD",
        department: { id: deptId },
      });
      expect(empRes.status).toBe(201);
      const empId = empRes.body.value.id;

      // Create travel expense
      const teRes = await client.post("/travelExpense", {
        employee: { id: empId },
        title: "Client visit Trondheim",
        travelDetails: {
          departureDate: "2026-03-19",
          returnDate: "2026-03-22",
          departureFrom: "Oslo",
          destination: "Trondheim",
          purpose: "Client visit",
        },
      });
      expect(teRes.status).toBe(201);
      const teId = teRes.body.value.id;

      // Get cost categories
      const catRes = await client.get("/travelExpense/costCategory");
      expect(catRes.status).toBe(200);
      expect(catRes.body.values.length).toBeGreaterThan(0);
      const flyCat = catRes.body.values.find((c: Record<string, unknown>) => c.description === "Fly");
      expect(flyCat).toBeDefined();
      const taxiCat = catRes.body.values.find((c: Record<string, unknown>) => c.description === "Taxi");
      expect(taxiCat).toBeDefined();

      // Get travel payment types
      const ptRes = await client.get("/travelExpense/paymentType");
      expect(ptRes.status).toBe(200);
      expect(ptRes.body.values.length).toBeGreaterThan(0);
      const paymentTypeId = ptRes.body.values[0].id;

      // Add flight cost
      const flightRes = await client.post("/travelExpense/cost", {
        travelExpense: { id: teId },
        costCategory: { id: flyCat.id },
        paymentType: { id: paymentTypeId },
        date: "2026-03-19",
        amountCurrencyIncVat: 7200,
        comments: "Flight ticket",
      });
      expect(flightRes.status).toBe(201);

      // Add taxi cost
      const taxiRes = await client.post("/travelExpense/cost", {
        travelExpense: { id: teId },
        costCategory: { id: taxiCat.id },
        paymentType: { id: paymentTypeId },
        date: "2026-03-19",
        amountCurrencyIncVat: 650,
        comments: "Taxi",
      });
      expect(taxiRes.status).toBe(201);

      // Get rate categories for per diem
      const rcRes = await client.get("/travelExpense/rateCategory?type=PER_DIEM&isValidDomestic=true&isValidAccommodation=true");
      expect(rcRes.status).toBe(200);
      expect(rcRes.body.values.length).toBeGreaterThan(0);
      const overnightCat = rcRes.body.values[0];

      // Get rate for the category
      const rateRes = await client.get(`/travelExpense/rate?rateCategoryId=${overnightCat.id}`);
      expect(rateRes.status).toBe(200);
      expect(rateRes.body.values.length).toBeGreaterThan(0);
      const rateType = rateRes.body.values[0];

      // Add per diem compensation
      const perDiemRes = await client.post("/travelExpense/perDiemCompensation", {
        travelExpense: { id: teId },
        rateType: { id: rateType.id },
        rateCategory: { id: overnightCat.id },
        overnightAccommodation: "HOTEL",
        location: "Trondheim",
        count: 4,
        rate: 800,
        isDeductionForBreakfast: false,
        isDeductionForLunch: false,
        isDeductionForDinner: false,
      });
      expect(perDiemRes.status).toBe(201);

      // Verify costs exist
      const costsRes = await client.get(`/travelExpense/cost?travelExpenseId=${teId}`);
      expect(costsRes.status).toBe(200);
      expect(costsRes.body.values.length).toBe(2);

      // Verify per diem exists
      const pdRes = await client.get(`/travelExpense/perDiemCompensation?travelExpenseId=${teId}`);
      expect(pdRes.status).toBe(200);
      expect(pdRes.body.values.length).toBe(1);
    });

    it("rejects cost with invalid travel expense ref", async () => {
      const res = await client.post("/travelExpense/cost", {
        travelExpense: { id: 99999 },
        costCategory: { id: 30000001 },
        date: "2026-03-19",
        amountCurrencyIncVat: 100,
      });
      expect(res.status).toBe(422);
    });

    it("rejects cost with invalid cost category ref", async () => {
      // First create a valid travel expense
      const teRes = await client.post("/travelExpense", {
        employee: { id: 30000001 },
        title: "Test",
        travelDetails: { departureDate: "2026-03-19", returnDate: "2026-03-20" },
      });
      const teId = teRes.body.value.id;

      const res = await client.post("/travelExpense/cost", {
        travelExpense: { id: teId },
        costCategory: { id: 99999 },
        date: "2026-03-19",
        amountCurrencyIncVat: 100,
      });
      expect(res.status).toBe(422);
    });

    it("rejects per diem with invalid rate category ref", async () => {
      const teRes = await client.post("/travelExpense", {
        employee: { id: 30000001 },
        title: "Test2",
        travelDetails: { departureDate: "2026-03-19", returnDate: "2026-03-20" },
      });
      const teId = teRes.body.value.id;

      const res = await client.post("/travelExpense/perDiemCompensation", {
        travelExpense: { id: teId },
        rateType: { id: 30000001 },
        rateCategory: { id: 99999 },
        count: 1,
        rate: 800,
      });
      expect(res.status).toBe(422);
    });
  });

  // ─── Full Workflow: Delete Travel Expense ───────────────────────────

  describe("Full workflow: delete travel expense", () => {
    it("creates and deletes travel expense", async () => {
      const teRes = await client.post("/travelExpense", {
        employee: { id: 30000001 },
        title: "Kundebesøk Oslo",
        departureDate: "2026-03-19",
        returnDate: "2026-03-20",
      });
      expect(teRes.status).toBe(201);
      const teId = teRes.body.value.id;

      // Search by title
      const searchRes = await client.get("/travelExpense?title=Kundebesøk");
      expect(searchRes.body.values.length).toBe(1);

      // Delete
      const delRes = await client.del(`/travelExpense/${teId}`);
      expect(delRes.status).toBe(204);

      // Confirm gone
      const getRes = await client.get(`/travelExpense/${teId}`);
      expect(getRes.status).toBe(404);
    });
  });
});
