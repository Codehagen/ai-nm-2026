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
  getLedgerAccount,
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
      let amount = data.paymentAmount ?? (invoice.amount as number);
      // Reversal: use negative amount to reverse payment
      if (data.isPaymentReversal) {
        amount = -Math.abs(amount);
      }
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

  // 3. Create order (with currency if forex)
  await ensureBankAccount(ctx);

  // Resolve currency ID if foreign currency specified
  let currencyId: number | undefined;
  if (data.currencyCode) {
    const curRes = await ctx.get("/currency", { code: data.currencyCode, fields: "id" });
    const curValues = extractValues(curRes);
    if (curValues[0]?.id) currencyId = curValues[0].id as number;
  }

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
  if (currencyId) orderBody.currency = { id: currencyId };

  const orderRes = await ctx.post("/order", orderBody);
  if (!orderRes.ok) throw new Error(`Failed to create order: ${orderRes.message}`);

  // 4. Create invoice — combine send + payment into params to save writes
  const invoiceParams: Record<string, string> = {};

  // Get payment type BEFORE invoice creation (need it for params)
  let payType: number | undefined;
  if (data.registerPayment) {
    payType = await getPaymentType(ctx);

    if (data.currencyCode && data.exchangeRate) {
      // Forex: calculate NOK amount from currency amount × payment exchange rate
      const currencyAmount = data.products.reduce((sum, p) => {
        const vatRate = parseInt(p.vatPercent) / 100;
        return sum + p.price * p.quantity * (1 + vatRate);
      }, 0);
      const payRate = data.paymentExchangeRate || data.exchangeRate;
      const nokAmount = Math.round(currencyAmount * payRate * 100) / 100;

      invoiceParams.paidAmount = String(nokAmount);
      invoiceParams.paidAmountCurrency = String(currencyAmount);
    } else {
      // Standard NOK payment
      let amount = data.paymentAmount;
      if (!amount) {
        amount = data.products.reduce((sum, p) => {
          const vatRate = parseInt(p.vatPercent) / 100;
          return sum + p.price * p.quantity * (1 + vatRate);
        }, 0);
      }
      invoiceParams.paidAmount = String(amount);
    }
    invoiceParams.paymentTypeId = String(payType);
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

  // 5. Forex: post agio/disagio voucher for exchange rate difference
  if (data.currencyCode && data.exchangeRate && data.paymentExchangeRate && data.paymentExchangeRate !== data.exchangeRate) {
    const currencyAmount = data.products.reduce((sum, p) => {
      const vatRate = parseInt(p.vatPercent) / 100;
      return sum + p.price * p.quantity * (1 + vatRate);
    }, 0);
    const diff = Math.round(currencyAmount * (data.paymentExchangeRate - data.exchangeRate) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      // Get accounts: 1500 (kundefordringer) and 8060 (agio) or 8160 (disagio)
      const acct1500 = await getLedgerAccount(ctx, "1500");
      const agioAcct = diff > 0
        ? await getLedgerAccount(ctx, "8060") // agio (gain)
        : await getLedgerAccount(ctx, "8160"); // disagio (loss)

      const desc = diff > 0 ? "Agio / Valutagevinst" : "Disagio / Valutatap";
      await ctx.post("/ledger/voucher", {
        date: today,
        description: `${desc} - ${data.customer.name}`,
        postings: [
          { row: 1, date: today, account: { id: acct1500 }, customer: { id: custId }, amountGross: diff, amountGrossCurrency: diff },
          { row: 2, date: today, account: { id: agioAcct }, amountGross: -diff, amountGrossCurrency: -diff },
        ],
      }, { sendToLedger: "true" });
    }
  }
}
