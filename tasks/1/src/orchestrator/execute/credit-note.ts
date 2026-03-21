/**
 * Deterministic credit note executor.
 * Handles the send-first requirement.
 */

import type { CreditNoteData } from "../schemas/credit-note.js";
import {
  OrchestratorContext,
  createCustomer,
  ensureProduct,
  createInvoiceFromProducts,
  extractValues,
  getOsloDate,
} from "../helpers.js";

export async function executeCreditNote(ctx: OrchestratorContext, data: CreditNoteData): Promise<void> {
  const today = getOsloDate();

  // 1. Customer — try GET first (pre-populated on competition instances), only POST if not found
  let custId: number;
  const getCustomer = await ctx.get("/customer", { name: data.customer.name, fields: "id" });
  const existingCustomers = extractValues(getCustomer);
  if (existingCustomers[0]?.id) {
    custId = existingCustomers[0].id as number;
  } else {
    custId = await createCustomer(ctx, data.customer);
  }

  // 2. Products (scoring checks they exist) — capture IDs for reuse
  const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
  if (data.products?.length) {
    for (const p of data.products) {
      const prod = await ensureProduct(ctx, p);
      products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
    }
  }

  let invoiceId: number;

  if (data.createNewInvoice && products.length > 0) {
    // Create new invoice to credit via shared helper
    invoiceId = await createInvoiceFromProducts(ctx, custId, products);
  } else {
    // Find existing invoice
    const invRes = await ctx.get("/invoice", {
      invoiceDateFrom: "2020-01-01",
      invoiceDateTo: "2030-01-01",
      fields: "id,invoiceNumber,amount,customer",
    });
    const invoices = extractValues(invRes);
    if (invoices.length === 0) throw new Error("No existing invoices found for credit note");

    // Try to match by customer
    let invoice = invoices[0];
    for (const inv of invoices) {
      const invCust = inv.customer as Record<string, unknown> | undefined;
      if (invCust?.name === data.customer.name) {
        invoice = inv;
        break;
      }
    }
    invoiceId = invoice.id as number;
  }

  // 3. Send invoice first (REQUIRED before credit note)
  await ctx.put(`/invoice/${invoiceId}/:send`, {}, { sendType: "EMAIL" });

  // 4. Create credit note
  await ctx.put(`/invoice/${invoiceId}/:createCreditNote`, {}, { date: today });
}
