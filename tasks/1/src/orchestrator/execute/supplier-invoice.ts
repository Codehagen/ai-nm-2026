/**
 * Deterministic supplier invoice executor.
 * Handles voucher structure and auto-books to ledger.
 */

import type { SupplierInvoiceData } from "../schemas/supplier-invoice.js";
import {
  OrchestratorContext,
  createSupplier,
  getLedgerAccount,
  extractId,
  extractValue,
  getOsloDate,
} from "../helpers.js";

/** Map VAT percent to input VAT type IDs */
const INPUT_VAT_MAP: Record<string, number> = {
  "25": 1,  // 25% input VAT
  "15": 11, // 15% input VAT
  "12": 12, // 12% input VAT
  "0": 6,   // 0% exempt
};

export async function executeSupplierInvoice(ctx: OrchestratorContext, data: SupplierInvoiceData): Promise<void> {
  // Default empty dates to today (LLM may return "" when prompt doesn't specify dates)
  const today = getOsloDate();
  if (!data.invoiceDate) data.invoiceDate = today;
  if (!data.dueDate) data.dueDate = today;

  // Cross-validate amounts: if amountExclVat * (1 + vatPercent/100) ≈ amountInclVat, trust amountInclVat
  const vatRate = parseFloat(data.vatPercent) / 100;
  const calculatedInclVat = Math.round(data.amountExclVat * (1 + vatRate) * 100) / 100;
  if (Math.abs(calculatedInclVat - data.amountInclVat) > 1 && data.amountInclVat > 0) {
    // Trust amountInclVat and recalculate amountExclVat
    data.amountExclVat = Math.round(data.amountInclVat / (1 + vatRate) * 100) / 100;
  }

  // 1. Create supplier
  const supplierId = await createSupplier(ctx, data.supplier);

  // 2. Get ledger accounts
  const expenseAccountId = await getLedgerAccount(ctx, data.expenseAccount);
  const supplierAccountId = await getLedgerAccount(ctx, "2400"); // Leverandørgjeld

  // 3. Create supplier invoice with voucher
  const vatTypeId = INPUT_VAT_MAP[data.vatPercent] ?? 1;

  const res = await ctx.post("/supplierInvoice", {
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    invoiceDueDate: data.dueDate,
    supplier: { id: supplierId },
    voucher: {
      date: data.invoiceDate,
      description: `Faktura ${data.invoiceNumber} fra ${data.supplier.name}`,
      postings: [
        {
          row: 1,
          date: data.invoiceDate,
          description: data.description,
          account: { id: expenseAccountId },
          amountGross: data.amountInclVat,
          amountGrossCurrency: data.amountInclVat,
          vatType: { id: vatTypeId },
        },
        {
          row: 2,
          date: data.invoiceDate,
          description: `${data.supplier.name}`,
          account: { id: supplierAccountId },
          supplier: { id: supplierId },
          amountGross: -data.amountInclVat,
          amountGrossCurrency: -data.amountInclVat,
        },
      ],
    },
  });
  if (!res.ok) throw new Error(`Failed to create supplier invoice: ${res.message}`);

  // 4. Book the voucher to the ledger (auto-book in model.ts pattern)
  const val = extractValue(res);
  const voucher = val.voucher as Record<string, unknown> | undefined;
  const voucherId = voucher?.id;
  if (voucherId) {
    await ctx.put(`/ledger/voucher/${voucherId}/:sendToLedger`, {});
  }
}
