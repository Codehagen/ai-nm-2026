/**
 * Deterministic invoice executor.
 * Handles: invoice, invoice-send, invoice-payment
 * OPTIMIZED: combines send+payment into POST /invoice params to minimize writes.
 */

import type { InvoiceData } from "../schemas/invoice.js";
import {
  OrchestratorContext,
  createCustomer,
  ensureProduct,
  getPaymentType,
  extractValues,
  extractId,
  getOsloDate,
  addDays,
  ensureBankAccount,
  vatPercentToId,
} from "../helpers.js";

export async function executeInvoice(ctx: OrchestratorContext, data: InvoiceData): Promise<void> {
  const today = getOsloDate();

  if (data.isExistingInvoice) {
    // Payment on existing invoice — skip customer+product creation entirely.
    // Just find the invoice and register payment. Saves 2+ writes.
    const invRes = await ctx.get("/invoice", {
      invoiceDateFrom: "2020-01-01",
      invoiceDateTo: "2030-01-01",
      fields: "id,amount,customer,invoiceNumber",
    });
    const invoices = extractValues(invRes);
    if (invoices.length === 0) throw new Error("No existing invoices found");

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

  // 1. Customer (only needed for new invoices)
  const custId = await createCustomer(ctx, data.customer);

  // 2. Products — scoring checks these exist, so we MUST create them
  const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
  for (const p of data.products) {
    const prod = await ensureProduct(ctx, p);
    products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
  }

  // 3. Create order
  await ensureBankAccount(ctx);

  const orderLines = products.map((p) => ({
    product: { id: p.id },
    count: p.quantity,
    unitPriceExcludingVatCurrency: p.price,
    vatType: { id: vatPercentToId(p.vatPercent) },
  }));

  const orderRes = await ctx.post("/order", {
    customer: { id: custId },
    orderDate: today,
    deliveryDate: today,
    orderLines,
  });
  if (!orderRes.ok) throw new Error(`Failed to create order: ${orderRes.message}`);

  // 3. Create invoice — combine send + payment into params to save writes
  const invoiceParams: Record<string, string> = {};

  // Get payment type BEFORE invoice creation (need it for params)
  let payType: number | undefined;
  if (data.registerPayment) {
    payType = await getPaymentType(ctx);
    let amount = data.paymentAmount;
    if (!amount) {
      amount = data.products.reduce((sum, p) => {
        const vatRate = parseInt(p.vatPercent) / 100;
        return sum + p.price * p.quantity * (1 + vatRate);
      }, 0);
    }
    invoiceParams.paymentTypeId = String(payType);
    invoiceParams.paidAmount = String(amount);
  }

  if (data.sendInvoice) {
    invoiceParams.sendToCustomer = "true";
  }

  const orderId = extractId(orderRes);

  const invoiceRes = await ctx.post("/invoice", {
    invoiceDate: today,
    invoiceDueDate: data.dueDate || addDays(today, 14),
    orders: [{ id: orderId }],
  }, Object.keys(invoiceParams).length > 0 ? invoiceParams : undefined);

  if (!invoiceRes.ok) throw new Error(`Failed to create invoice: ${invoiceRes.message}`);
}
