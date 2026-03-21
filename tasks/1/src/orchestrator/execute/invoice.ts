/**
 * Deterministic invoice executor.
 * Handles: invoice, invoice-send, invoice-payment
 */

import type { InvoiceData } from "../schemas/invoice.js";
import {
  OrchestratorContext,
  createCustomer,
  ensureProduct,
  createInvoiceFromProducts,
  getPaymentType,
  extractValues,
  getOsloDate,
} from "../helpers.js";

export async function executeInvoice(ctx: OrchestratorContext, data: InvoiceData): Promise<void> {
  const today = getOsloDate();

  // 1. Customer
  const custId = await createCustomer(ctx, data.customer);

  // 2. Products
  const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
  for (const p of data.products) {
    const prod = await ensureProduct(ctx, p);
    products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
  }

  if (data.isExistingInvoice) {
    // Payment on existing invoice — find it
    const invRes = await ctx.get("/invoice", {
      invoiceDateFrom: "2020-01-01",
      invoiceDateTo: "2030-01-01",
      fields: "id,amount,customer,invoiceNumber",
    });
    const invoices = extractValues(invRes);
    if (invoices.length === 0) throw new Error("No existing invoices found");

    // Find matching invoice (by customer if possible)
    let invoice = invoices[0];
    for (const inv of invoices) {
      const invCust = inv.customer as Record<string, unknown> | undefined;
      if (invCust?.name === data.customer.name) {
        invoice = inv;
        break;
      }
    }
    const invoiceId = invoice.id as number;

    if (data.registerPayment) {
      const payType = await getPaymentType(ctx);
      const amount = data.paymentAmount ?? (invoice.amount as number);
      await ctx.put(`/invoice/${invoiceId}/:payment`, {}, {
        paymentDate: today,
        paymentTypeId: String(payType),
        paidAmount: String(amount),
      });
    }
    return;
  }

  // 3. Create invoice via shared helper
  const invoiceId = await createInvoiceFromProducts(ctx, custId, products, data.dueDate);

  // 4. Optional: send
  if (data.sendInvoice) {
    await ctx.put(`/invoice/${invoiceId}/:send`, {}, { sendType: "EMAIL" });
  }

  // 5. Optional: payment
  if (data.registerPayment) {
    const payType = await getPaymentType(ctx);
    let amount = data.paymentAmount;
    if (!amount) {
      amount = products.reduce((sum, p) => {
        const vatRate = parseInt(p.vatPercent) / 100;
        return sum + p.price * p.quantity * (1 + vatRate);
      }, 0);
    }
    await ctx.put(`/invoice/${invoiceId}/:payment`, {}, {
      paymentDate: today,
      paymentTypeId: String(payType),
      paidAmount: String(amount),
    });
  }
}
