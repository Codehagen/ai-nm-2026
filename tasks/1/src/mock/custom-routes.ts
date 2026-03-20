/**
 * Non-CRUD custom endpoints that override or extend the generic factory.
 * These handle Tripletex action endpoints (: prefix) and static lookups.
 */

import type { Hono } from "hono";
import type { EntityStore } from "./store.js";
import { wrapValue, wrapList, errorResponse } from "./helpers.js";

export function registerCustomRoutes(app: Hono, store: EntityStore): void {
  // ─── Invoice Actions ───────────────────────────────────────────────
  // Tripletex uses colon-prefixed action paths: /invoice/{id}/:payment, /:send, etc.
  // We use a single route with an "action" param to dispatch.

  app.put("/invoice/:invoiceId/:action", (c) => {
    const invoiceId = parseInt(c.req.param("invoiceId"));
    const action = c.req.param("action");
    const invoice = store.getById("invoice", invoiceId);
    if (!invoice) {
      return c.json(errorResponse(404, `Invoice with id ${invoiceId} not found`), 404);
    }

    switch (action) {
      case ":payment": {
        const paymentDate = c.req.query("paymentDate");
        const paymentTypeId = c.req.query("paymentTypeId");
        const paidAmount = c.req.query("paidAmount");

        const missing: Array<{ field: string; message: string }> = [];
        if (!paymentDate) missing.push({ field: "paymentDate", message: "is required" });
        if (!paymentTypeId) missing.push({ field: "paymentTypeId", message: "is required" });
        if (!paidAmount) missing.push({ field: "paidAmount", message: "is required" });

        if (missing.length > 0) {
          return c.json(errorResponse(422, "Value Validation Exception", missing), 422);
        }

        if (!store.has("paymentType", parseInt(paymentTypeId!))) {
          return c.json(
            errorResponse(422, "Value Validation Exception", [
              { field: "paymentTypeId", message: `paymentType with id ${paymentTypeId} not found` },
            ]),
            422
          );
        }

        store.update("invoice", invoiceId, {
          isPaid: true,
          paymentDate,
          paidAmount: parseFloat(paidAmount!),
          paymentTypeId: parseInt(paymentTypeId!),
        });

        return c.body(null, 204);
      }

      case ":send": {
        const sendType = c.req.query("sendType");
        if (!sendType) {
          return c.json(
            errorResponse(422, "Value Validation Exception", [
              { field: "sendType", message: "is required" },
            ]),
            422
          );
        }

        store.update("invoice", invoiceId, { isSent: true, sendType });
        return c.body(null, 204);
      }

      default:
        return c.json(errorResponse(404, `Unknown invoice action: ${action}`), 404);
    }
  });

  /** POST /invoice/:invoiceId/:createCreditNote */
  app.post("/invoice/:invoiceId/:action", (c) => {
    const invoiceId = parseInt(c.req.param("invoiceId"));
    const action = c.req.param("action");

    if (action !== ":createCreditNote") {
      return c.json(errorResponse(404, `Unknown invoice action: ${action}`), 404);
    }

    const invoice = store.getById("invoice", invoiceId);
    if (!invoice) {
      return c.json(errorResponse(404, `Invoice with id ${invoiceId} not found`), 404);
    }

    const creditNote = store.create("invoice", {
      ...invoice,
      isCreditNote: true,
      creditedInvoice: invoiceId,
      invoiceNumber: -(invoice.invoiceNumber as number || 0),
    });

    return c.json(wrapValue(creditNote), 201);
  });

  // ─── Static Lookups ────────────────────────────────────────────────

  /** GET /invoice/paymentType — list payment types */
  app.get("/invoice/paymentType", (c) => {
    const paymentTypes = store.list("paymentType");
    return c.json(wrapList(paymentTypes));
  });

  /** GET /ledger/vatType — list VAT types */
  app.get("/ledger/vatType", (c) => {
    const vatTypes = store.list("vatType");
    return c.json(wrapList(vatTypes));
  });

  // ─── Employee Employment ────────────────────────────────────────────

  /** GET /employee/employment — list employments */
  app.get("/employee/employment", (c) => {
    const employments = store.list("employment");
    return c.json(wrapList(employments));
  });

  /** POST /employee/employment — create employment */
  app.post("/employee/employment", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse(400, "Invalid JSON body"), 400);
    }
    const emp = body.employee as { id?: number } | undefined;
    if (!emp?.id || !store.has("employee", emp.id)) {
      return c.json(errorResponse(422, "Validering feilet.", [{ field: "employee", message: "Kan ikke være null." }]), 422);
    }
    if (!body.startDate) {
      return c.json(errorResponse(422, "Validering feilet.", [{ field: "startDate", message: "Kan ikke være null." }]), 422);
    }
    const entity = store.create("employment", body);
    return c.json(wrapValue(entity), 201);
  });

  // ─── Salary Types ───────────────────────────────────────────────────

  /** GET /salary/type — list salary types */
  app.get("/salary/type", (c) => {
    const salaryTypes = store.list("salaryType");
    return c.json(wrapList(salaryTypes));
  });

  /** GET /salary/settings — salary settings */
  app.get("/salary/settings", (c) => {
    return c.json(wrapValue({ municipality: { id: 262 }, payrollTaxCalcMethod: "AA" }));
  });

  // ─── Employee Entitlements ─────────────────────────────────────────

  /** PUT /employee/entitlement/:grantEntitlementsByTemplate */
  app.put("/employee/entitlement/:action", async (c) => {
    return c.body(null, 204);
  });

  /** POST /employee/entitlement */
  app.post("/employee/entitlement", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json(errorResponse(400, "Invalid JSON body"), 400);
    }
    const entity = store.create("entitlement", body);
    return c.json(wrapValue(entity), 201);
  });

  /** GET /employee/entitlement — list entitlements */
  app.get("/employee/entitlement", (c) => {
    const entitlements = store.list("entitlement");
    return c.json(wrapList(entitlements));
  });

  // ─── Store Reset (for testing) ────────────────────────────────────

  /** POST /_reset — reset store to seed state (test-only endpoint) */
  app.post("/_reset", (c) => {
    store.reset();
    return c.json({ ok: true });
  });
}
