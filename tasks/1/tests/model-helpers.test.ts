import { describe, it, expect } from "vitest";
import { truncateForLLM, retryKey, PROMPT_FIELDS, enrichError } from "../src/model.js";
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
});
