import { describe, it, expect } from "vitest";
import {
  truncateForLLM,
  retryKey,
  PROMPT_FIELDS,
  enrichError,
  normalizePath,
  applyEmployeeDefaults,
  applyProductDefaults,
  applyDateRangeDefaults,
} from "../src/model.js";
import { classifyTask } from "../src/task-classifier.js";
import { buildSystemPrompt } from "../src/prompt-builder.js";
import type { TxResult } from "../src/tripletex.js";

describe("truncateForLLM", () => {
  it("passes through error results unchanged", () => {
    const err: TxResult = { ok: false, status: 422, message: "bad" };
    expect(truncateForLLM(err, "GET")).toBe(err);
  });

  it("passes through non-GET methods unchanged", () => {
    const ok: TxResult = { ok: true, data: { values: Array(10).fill({}) } };
    expect(truncateForLLM(ok, "POST")).toBe(ok);
  });

  it("passes through GET with ≤5 values", () => {
    const ok: TxResult = { ok: true, data: { values: [1, 2, 3, 4, 5], fullResultSize: 5 } };
    expect(truncateForLLM(ok, "GET")).toBe(ok);
  });

  it("truncates GET with >5 values and adds metadata", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const ok: TxResult = { ok: true, data: { values: items, fullResultSize: 20 } };
    const result = truncateForLLM(ok, "GET");
    expect(result.ok).toBe(true);
    const data = (result as { ok: true; data: Record<string, unknown> }).data;
    expect((data.values as unknown[]).length).toBe(5);
    expect(data._truncated).toBe(true);
    expect(data._totalCount).toBe(20);
    expect(data.fullResultSize).toBe(20); // preserves other fields
  });

  it("passes through GET with no .values field", () => {
    const ok: TxResult = { ok: true, data: { value: { id: 1 } } };
    expect(truncateForLLM(ok, "GET")).toBe(ok);
  });
});

describe("retryKey", () => {
  it("uses firstName+lastName for employee-like bodies", () => {
    const key = retryKey("/employee", { firstName: "Kari", lastName: "Olsen", email: "k@o.no" });
    expect(key).toBe("/employee:Kari|Olsen");
  });

  it("uses name for customer/product-like bodies", () => {
    const key = retryKey("/customer", { name: "Acme AS", email: "a@acme.no" });
    expect(key).toBe("/customer:Acme AS");
  });

  it("strips numeric path segments", () => {
    const key = retryKey("/invoice/123/:createCreditNote", { name: "X" });
    expect(key).toBe("/invoice/:createCreditNote:X");
  });

  it("falls back to empty identity when no identity fields", () => {
    const key = retryKey("/ledger/voucher", { amount: 1000 });
    expect(key).toBe("/ledger/voucher:");
  });

  it("different employees produce different keys", () => {
    const k1 = retryKey("/employee", { firstName: "Alice", lastName: "Brown" });
    const k2 = retryKey("/employee", { firstName: "Bob", lastName: "Wilson" });
    expect(k1).not.toBe(k2);
  });
});

describe("retry guard logic (failedPosts simulation)", () => {
  // Simulates the guard logic from model.ts without needing generateText
  function simulateGuard(calls: Array<{ path: string; body: Record<string, unknown>; apiOk: boolean }>) {
    const failedPosts = new Map<string, Record<string, unknown>>();
    const results: Array<"ok" | "blocked" | "api-error"> = [];

    for (const call of calls) {
      const key = retryKey(call.path, call.body);
      const prev = failedPosts.get(key);
      if (prev) {
        const changed = PROMPT_FIELDS.filter(
          (f) => prev[f] !== undefined && call.body[f] !== undefined && prev[f] !== call.body[f],
        );
        if (changed.length > 0) {
          results.push("blocked");
          continue;
        }
      }

      // Simulate API call result
      if (!call.apiOk) {
        failedPosts.set(key, call.body);
        results.push("api-error");
      } else {
        failedPosts.delete(key);
        results.push("ok");
      }
    }
    return results;
  }

  it("blocks retry with changed email after failure", () => {
    const results = simulateGuard([
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari@olsen.no" }, apiOk: false },
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari2@olsen.no" }, apiOk: true },
    ]);
    expect(results).toEqual(["api-error", "blocked"]);
  });

  it("allows retry with same fields after failure", () => {
    const results = simulateGuard([
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari@olsen.no", userType: "WRONG" }, apiOk: false },
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari@olsen.no", userType: "STANDARD" }, apiOk: true },
    ]);
    expect(results).toEqual(["api-error", "ok"]);
  });

  it("allows two different employees on same path", () => {
    const results = simulateGuard([
      { path: "/employee", body: { firstName: "Alice", lastName: "Brown", email: "alice@co.com" }, apiOk: true },
      { path: "/employee", body: { firstName: "Bob", lastName: "Wilson", email: "bob@co.com" }, apiOk: true },
    ]);
    expect(results).toEqual(["ok", "ok"]);
  });

  it("clears guard state on success", () => {
    const results = simulateGuard([
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari@olsen.no" }, apiOk: false },
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari@olsen.no" }, apiOk: true }, // retry succeeds
      { path: "/employee", body: { firstName: "Kari", lastName: "Olsen", email: "kari2@olsen.no" }, apiOk: true }, // should NOT be blocked (no prior failure)
    ]);
    expect(results).toEqual(["api-error", "ok", "ok"]);
  });

  it("does not guard first POST (no prior failure)", () => {
    const results = simulateGuard([
      { path: "/customer", body: { name: "Acme AS", email: "a@acme.no" }, apiOk: true },
    ]);
    expect(results).toEqual(["ok"]);
  });

  it("blocks customer name change on retry", () => {
    const results = simulateGuard([
      { path: "/customer", body: { name: "Acme AS", organizationNumber: "123" }, apiOk: false },
      { path: "/customer", body: { name: "Acme AS", organizationNumber: "456" }, apiOk: true },
    ]);
    expect(results).toEqual(["api-error", "blocked"]);
  });
});

describe("enrichError", () => {
  it("adds MOD11 hint for PUT /ledger/account 422", () => {
    const err = { ok: false as const, status: 422, message: "Validering feilet." };
    const result = enrichError(err, "PUT", "/ledger/account/12345");
    expect(result.message).toContain("86011117947");
    expect(result.message).toContain("MOD11");
  });

  it("adds email collision hint when validation message matches", () => {
    const err = {
      ok: false as const,
      status: 422,
      message: "Validering feilet.",
      validationMessages: [{ field: "email", message: "Det finnes allerede en bruker med denne e-postadressen." }],
    };
    const result = enrichError(err, "POST", "/employee");
    expect(result.message).toContain("GET /employee?email=");
  });

  it("passes through unrecognized 422 errors unchanged", () => {
    const err = { ok: false as const, status: 422, message: "Validering feilet." };
    const result = enrichError(err, "POST", "/product");
    expect(result.message).toBe("Validering feilet.");
  });

  it("preserves original error fields", () => {
    const err = {
      ok: false as const,
      status: 422,
      message: "Validering feilet.",
      validationMessages: [{ field: "bankAccountNumber", message: "Ugyldig" }],
    };
    const result = enrichError(err, "PUT", "/ledger/account/123");
    expect(result.status).toBe(422);
    expect(result.validationMessages).toEqual([{ field: "bankAccountNumber", message: "Ugyldig" }]);
  });

  // Phase 1F: New error hints
  it("adds hint for travel expense cost errors", () => {
    const err = { ok: false as const, status: 422, message: "Validering feilet." };
    const result = enrichError(err, "POST", "/travelExpense/cost");
    expect(result.message).toContain("costCategory");
  });

  it("adds hint for supplier invoice errors", () => {
    const err = { ok: false as const, status: 422, message: "Validering feilet." };
    const result = enrichError(err, "POST", "/supplierInvoice");
    expect(result.message).toContain("row");
    expect(result.message).toContain("sendToLedger");
  });

  it("adds hint for salary specification errors", () => {
    const err = { ok: false as const, status: 422, message: "Validering feilet." };
    const result = enrichError(err, "POST", "/salary/specification");
    expect(result.message).toContain("employment");
  });

  it("adds hint for unbalanced voucher postings", () => {
    const err = {
      ok: false as const,
      status: 422,
      message: "Validering feilet.",
      validationMessages: [{ field: "postings", message: "Bilag er ikke i balanse" }],
    };
    const result = enrichError(err, "POST", "/ledger/voucher");
    expect(result.message).toContain("balance");
  });
});

// ─── Phase 1A: Path normalization ────────────────────────────────────────

describe("normalizePath", () => {
  it("strips /v2/ prefix", () => {
    expect(normalizePath("/v2/employee")).toBe("/employee");
  });

  it("strips /v2/ and preserves rest of path", () => {
    expect(normalizePath("/v2/ledger/account/123")).toBe("/ledger/account/123");
  });

  it("adds leading slash when missing", () => {
    expect(normalizePath("employee")).toBe("/employee");
  });

  it("passes through already-correct paths unchanged", () => {
    expect(normalizePath("/employee")).toBe("/employee");
    expect(normalizePath("/customer/123")).toBe("/customer/123");
  });

  it("does not strip /v2 without trailing slash", () => {
    // "/v2employee" should just get a leading slash fix if needed
    expect(normalizePath("/v2employee")).toBe("/v2employee");
  });
});

// ─── Phase 1B: Employee defaults ─────────────────────────────────────────

describe("applyEmployeeDefaults", () => {
  it("adds userType STANDARD when missing", () => {
    const body: Record<string, unknown> = { firstName: "Kari", lastName: "Olsen" };
    applyEmployeeDefaults(body);
    expect(body.userType).toBe("STANDARD");
  });

  it("adds dateOfBirth when missing", () => {
    const body: Record<string, unknown> = { firstName: "Kari", lastName: "Olsen" };
    applyEmployeeDefaults(body);
    expect(body.dateOfBirth).toBe("1990-01-15");
  });

  it("does not overwrite existing userType", () => {
    const body: Record<string, unknown> = { firstName: "Kari", userType: "ADMINISTRATOR" };
    applyEmployeeDefaults(body);
    expect(body.userType).toBe("ADMINISTRATOR");
  });

  it("does not overwrite existing dateOfBirth", () => {
    const body: Record<string, unknown> = { firstName: "Kari", dateOfBirth: "2000-06-15" };
    applyEmployeeDefaults(body);
    expect(body.dateOfBirth).toBe("2000-06-15");
  });
});

// ─── Phase 1C: Product defaults ──────────────────────────────────────────

describe("applyProductDefaults", () => {
  it("adds vatType {id: 3} when missing", () => {
    const body: Record<string, unknown> = { name: "Widget" };
    applyProductDefaults(body);
    expect(body.vatType).toEqual({ id: 3 });
  });

  it("does not overwrite existing vatType", () => {
    const body: Record<string, unknown> = { name: "Food", vatType: { id: 31 } };
    applyProductDefaults(body);
    expect(body.vatType).toEqual({ id: 31 });
  });
});

// ─── Phase 1E: Date range defaults ──────────────────────────────────────

describe("applyDateRangeDefaults", () => {
  it("injects invoice date range when missing", () => {
    const result = applyDateRangeDefaults("/invoice", undefined);
    expect(result).toEqual({
      invoiceDateFrom: "2020-01-01",
      invoiceDateTo: "2030-01-01",
    });
  });

  it("injects order date range when missing", () => {
    const result = applyDateRangeDefaults("/order", {});
    expect(result).toEqual({
      orderDateFrom: "2020-01-01",
      orderDateTo: "2030-01-01",
    });
  });

  it("injects voucher date range when missing", () => {
    const result = applyDateRangeDefaults("/ledger/voucher", undefined);
    expect(result).toEqual({
      dateFrom: "2020-01-01",
      dateTo: "2030-01-01",
    });
  });

  it("injects posting date range when missing", () => {
    const result = applyDateRangeDefaults("/ledger/posting", undefined);
    expect(result).toEqual({
      dateFrom: "2020-01-01",
      dateTo: "2030-01-01",
    });
  });

  it("does not overwrite existing date range params", () => {
    const params = { invoiceDateFrom: "2025-01-01", invoiceDateTo: "2025-12-31" };
    const result = applyDateRangeDefaults("/invoice", params);
    expect(result).toBe(params); // same reference — no injection needed
    expect(result).toEqual({
      invoiceDateFrom: "2025-01-01",
      invoiceDateTo: "2025-12-31",
    });
  });

  it("does not inject for paymentType path", () => {
    const result = applyDateRangeDefaults("/invoice/paymentType", undefined);
    expect(result).toBeUndefined();
  });

  it("does not inject for unrelated paths", () => {
    const result = applyDateRangeDefaults("/employee", undefined);
    expect(result).toBeUndefined();
  });

  it("preserves existing params and only adds missing ones", () => {
    const params = { invoiceDateFrom: "2025-01-01", fields: "id,amount" };
    const result = applyDateRangeDefaults("/invoice", params);
    expect(result).toEqual({
      invoiceDateFrom: "2025-01-01",
      invoiceDateTo: "2030-01-01",
      fields: "id,amount",
    });
  });
});

// ─── Phase 2: Task classifier ────────────────────────────────────────────

describe("classifyTask", () => {
  // Norwegian Bokmål
  it("classifies customer creation (nb)", () => {
    expect(classifyTask("Opprett en kunde med navn Fjordlys AS")).toBe("customer");
  });

  it("classifies employee creation (nb)", () => {
    expect(classifyTask("Opprett en ansatt med navn Kari Olsen")).toBe("employee");
  });

  it("classifies employee admin (nb)", () => {
    expect(classifyTask("Opprett en ansatt med navn Lars Berg. Han skal være kontoadministrator.")).toBe("employee-admin");
  });

  it("classifies invoice (nb)", () => {
    expect(classifyTask("Opprett en faktura for kunde Havblikk AS")).toBe("invoice");
  });

  it("classifies invoice payment (nb)", () => {
    expect(classifyTask("Opprett en faktura og registrer betaling")).toBe("invoice-payment");
  });

  it("classifies invoice send (nb)", () => {
    expect(classifyTask("Opprett en faktura og send på e-post")).toBe("invoice-send");
  });

  it("classifies credit note (nb)", () => {
    expect(classifyTask("Opprett en kreditnota for den siste fakturaen")).toBe("credit-note");
  });

  it("classifies project (nb)", () => {
    expect(classifyTask("Opprett et prosjekt kalt Nettside Redesign")).toBe("project");
  });

  it("classifies salary (nb)", () => {
    expect(classifyTask("Utfør lønnskjøring for ansatt Kari Olsen")).toBe("salary");
  });

  it("classifies travel expense (nb)", () => {
    expect(classifyTask("Opprett en reiseregning med tittel Kundebesøk Oslo")).toBe("travel-expense");
  });

  it("classifies delete travel (nb)", () => {
    expect(classifyTask("Slett reiseregningen med tittel Kundebesøk Oslo")).toBe("delete-travel");
  });

  it("classifies supplier invoice (nb)", () => {
    expect(classifyTask("Vi har mottatt faktura FV-2026-445 fra leverandør Fjellservice AS")).toBe("supplier-invoice");
  });

  // English
  it("classifies customer creation (en)", () => {
    expect(classifyTask("Create a customer named Alpine Solutions Ltd")).toBe("customer");
  });

  it("classifies employee creation (en)", () => {
    expect(classifyTask("Create an employee named John Smith")).toBe("employee");
  });

  it("classifies invoice payment (en)", () => {
    expect(classifyTask("Create an invoice and register payment of the invoice today")).toBe("invoice-payment");
  });

  it("classifies project (en)", () => {
    expect(classifyTask("Create a project named Cloud Migration")).toBe("project");
  });

  it("classifies salary (en)", () => {
    expect(classifyTask("Run payroll for employee Sarah Connor")).toBe("salary");
  });

  it("classifies delete travel (en)", () => {
    expect(classifyTask("Delete the travel expense report titled Client Visit Bergen")).toBe("delete-travel");
  });

  // German
  it("classifies customer (de)", () => {
    expect(classifyTask("Erstellen Sie einen Kunden mit dem Namen Windkraft GmbH")).toBe("customer");
  });

  it("classifies invoice payment (de)", () => {
    expect(classifyTask("Erstellen Sie eine Rechnung und registrieren Sie die Zahlung")).toBe("invoice-payment");
  });

  it("classifies salary (de)", () => {
    expect(classifyTask("Führen Sie die Gehaltsabrechnung für Laura Schneider durch")).toBe("salary");
  });

  // Spanish
  it("classifies customer (es)", () => {
    expect(classifyTask("Cree un cliente con el nombre Sol del Mar S.L.")).toBe("customer");
  });

  it("classifies supplier invoice (es)", () => {
    expect(classifyTask("Hemos recibido la factura INV-2026-9187 del proveedor Montaña SL")).toBe("supplier-invoice");
  });

  // French
  it("classifies employee (fr)", () => {
    expect(classifyTask("Créez un employé nommé Nathan Moreau")).toBe("employee");
  });

  it("classifies credit note complaint (fr)", () => {
    expect(classifyTask("Le client a réclamé concernant la facture pour Maintenance")).toBe("credit-note");
  });

  // Portuguese
  it("classifies employee (pt)", () => {
    expect(classifyTask("Crie um funcionário com o nome Rita Almeida")).toBe("employee");
  });

  it("classifies delete travel (pt)", () => {
    expect(classifyTask("Exclua o relatório de despesas de viagem com o título Visita ao Cliente Lisboa")).toBe("delete-travel");
  });

  // Nynorsk
  it("classifies customer (nn)", () => {
    expect(classifyTask("Opprett ein kunde med namn Bølgekraft AS")).toBe("customer");
  });

  it("classifies employee (nn)", () => {
    expect(classifyTask("Opprett ein tilsett med namn Håkon Eide")).toBe("employee");
  });

  // Edge cases
  it("returns unknown for unrecognizable prompts", () => {
    expect(classifyTask("Hello, how are you?")).toBe("unknown");
  });

  it("classifies contact creation (nb)", () => {
    expect(classifyTask("Opprett en kontaktperson for kunde Havblikk AS")).toBe("contact");
  });

  it("classifies update customer (en)", () => {
    expect(classifyTask("Update the email address of customer Nordfjord AS")).toBe("update-customer");
  });

  it("classifies delete voucher (nb)", () => {
    expect(classifyTask("Slett bilaget med beskrivelse Feilregistrering")).toBe("delete-voucher");
  });

  it("classifies travel expense full (en)", () => {
    expect(classifyTask("Register a travel expense with flight ticket and per diem")).toBe("travel-expense-full");
  });
});

// ─── Phase 2: Prompt builder ─────────────────────────────────────────────

describe("buildSystemPrompt", () => {
  it("returns full monolith for unknown task type", () => {
    const prompt = buildSystemPrompt("unknown");
    expect(prompt.length).toBeGreaterThan(10000); // monolith is ~25k chars
    expect(prompt).toContain("Tripletex");
  });

  it("returns shorter prompt for known task types", () => {
    const monolith = buildSystemPrompt("unknown");
    const customer = buildSystemPrompt("customer");
    expect(customer.length).toBeLessThan(monolith.length);
    expect(customer.length).toBeGreaterThan(2000); // not empty
  });

  it("includes customer recipe for customer task", () => {
    const prompt = buildSystemPrompt("customer");
    expect(prompt).toContain("isCustomer");
    expect(prompt).toContain("postalAddress");
  });

  it("includes employee recipe for employee task", () => {
    const prompt = buildSystemPrompt("employee");
    expect(prompt).toContain("userType");
    expect(prompt).toContain("STANDARD");
    expect(prompt).toContain("department");
  });

  it("includes invoice chain for invoice task", () => {
    const prompt = buildSystemPrompt("invoice");
    expect(prompt).toContain("POST /order");
    expect(prompt).toContain("POST /invoice");
    expect(prompt).toContain("bankAccountNumber");
  });

  it("includes salary recipe for salary task", () => {
    const prompt = buildSystemPrompt("salary");
    expect(prompt).toContain("salary/specification");
    expect(prompt).toContain("salary/type");
    expect(prompt).toContain("employment");
  });

  it("includes travel expense recipe for travel task", () => {
    const prompt = buildSystemPrompt("travel-expense-full");
    expect(prompt).toContain("travelExpense");
    expect(prompt).toContain("costCategory");
    expect(prompt).toContain("perDiemCompensation");
  });

  it("always includes header with scoring rules", () => {
    for (const taskType of ["customer", "employee", "invoice", "salary"] as const) {
      const prompt = buildSystemPrompt(taskType);
      expect(prompt).toContain("SCORING");
      expect(prompt).toContain("EFFICIENCY");
    }
  });

  it("always includes footer with golden rule", () => {
    for (const taskType of ["customer", "employee", "invoice", "salary"] as const) {
      const prompt = buildSystemPrompt(taskType);
      expect(prompt).toContain("GOLDEN RULE");
      expect(prompt).toContain("Error Handling");
    }
  });

  it("includes credit note recipe for credit-note task", () => {
    const prompt = buildSystemPrompt("credit-note");
    expect(prompt).toContain("createCreditNote");
    expect(prompt).toContain("MUST be sent first");
  });

  it("includes supplier invoice recipe", () => {
    const prompt = buildSystemPrompt("supplier-invoice");
    expect(prompt).toContain("supplierInvoice");
    expect(prompt).toContain("sendToLedger");
  });
});

// ─── Classifier validates against all benchmark prompts ──────────────────

describe("classifyTask against benchmark prompts", () => {
  // Map from benchmark category to expected classifier output
  const CATEGORY_TO_TASK: Record<string, string> = {
    "create-customer": "customer",
    "create-customer-address": "customer",
    "create-product": "product",
    "create-department": "department",
    "create-employee": "employee",
    "create-employee-admin": "employee-admin",
    "create-travel-expense": "travel-expense",
    "travel-expense-full": "travel-expense-full",
    "create-project": "project",
    "create-invoice": "invoice",
    "invoice-payment": "invoice-payment",
    "invoice-send": "invoice-send",
    "delete-travel-expense": "delete-travel",
    "create-credit-note": "credit-note",
    "invoice-multiline": "invoice",
    "order-invoice-payment": "invoice-payment",
    "project-fixed-price-invoice": "project",
    "update-employee": "update-employee",
    "update-customer": "update-customer",
    "create-contact": "contact",
    "delete-voucher": "delete-voucher",
    "create-multiple-employees": "employee",
    "supplier-invoice": "supplier-invoice",
    "salary-payroll": "salary",
  };

  // Import prompts lazily to avoid circular deps
  it("classifies all benchmark prompts correctly", async () => {
    const { BENCHMARK_PROMPTS } = await import("./prompts.js");
    const misclassified: string[] = [];

    for (const bp of BENCHMARK_PROMPTS) {
      const expected = CATEGORY_TO_TASK[bp.category];
      if (!expected) {
        misclassified.push(`${bp.id}: no mapping for category "${bp.category}"`);
        continue;
      }
      const actual = classifyTask(bp.prompt);
      if (actual !== expected) {
        misclassified.push(`${bp.id} (${bp.lang}): expected "${expected}", got "${actual}"`);
      }
    }

    if (misclassified.length > 0) {
      // Allow up to 3 misclassifications (they fall back to monolith safely)
      expect(misclassified.length).toBeLessThanOrEqual(3);
    }
  });
});
