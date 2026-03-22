/**
 * Deterministic supplier invoice executor.
 * Handles invoices, receipts, and voucher structure with auto-booking.
 */

import type { SupplierInvoiceData } from "../schemas/supplier-invoice.js";
import {
  OrchestratorContext,
  createSupplier,
  ensureDepartment,
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
  // Default empty dates to today
  const today = getOsloDate();
  if (!data.invoiceDate) data.invoiceDate = today;
  if (!data.dueDate) data.dueDate = today;

  // Bidirectional amount validation
  const vatRate = parseFloat(data.vatPercent) / 100;
  if (data.amountInclVat > 0 && data.amountExclVat <= 0) {
    // Have incl, calculate excl
    data.amountExclVat = Math.round(data.amountInclVat / (1 + vatRate) * 100) / 100;
  } else if (data.amountExclVat > 0 && data.amountInclVat <= 0) {
    // Have excl, calculate incl
    data.amountInclVat = Math.round(data.amountExclVat * (1 + vatRate) * 100) / 100;
  } else if (data.amountInclVat > 0 && data.amountExclVat > 0) {
    // Both present — cross-validate, trust amountInclVat
    const calculatedInclVat = Math.round(data.amountExclVat * (1 + vatRate) * 100) / 100;
    if (Math.abs(calculatedInclVat - data.amountInclVat) > 1) {
      data.amountExclVat = Math.round(data.amountInclVat / (1 + vatRate) * 100) / 100;
    }
  }

  // Fix invoiceNumber for receipts — extraction often returns the date instead of "KVITTERING"
  if (data.invoiceNumber && /^\d{2}\.\d{2}\.\d{4}$/.test(data.invoiceNumber)) {
    data.invoiceNumber = "KVITTERING";
  }

  // Fix expense account based on description keywords
  const descLower = (data.description || "").toLowerCase();
  // Meals/representation → 7350
  if (["kundemøte", "kundemote", "lunsj", "middag", "restaurant", "meeting lunch", "déjeuner", "dejeuner",
       "mittagessen", "almuerzo", "representasjon", "kaffemøte", "kaffemote", "lunch", "dinner"].some(k => descLower.includes(k))) {
    data.expenseAccount = "7350";
  }
  // Office supplies → 6540 (keyboard, mouse, monitor, desk accessories, storage box)
  else if (["tastatur", "keyboard", "teclado", "clavier", "tastiera",
            "mus", "mouse", "ratón", "souris",
            "skjerm", "monitor", "pantalla", "écran", "bildschirm",
            "skrivebordlampe", "kontorstoler", "kontorstol", "oppbevaringsboks",
            "kontorrekvisita", "office supplies", "bürobedarf", "fournitures"].some(k => descLower.includes(k))) {
    data.expenseAccount = "6540";
  }

  // 1. Create department if specified (receipts often belong to a department)
  let departmentId: number | undefined;
  if (data.departmentName) {
    departmentId = await ensureDepartment(ctx, data.departmentName);
  }

  // 2. Create supplier
  const supplierId = await createSupplier(ctx, data.supplier);

  // 3. Get ledger accounts (check VAT lock on expense account)
  let expenseAccountId = await getLedgerAccount(ctx, data.expenseAccount);
  const supplierAccountId = await getLedgerAccount(ctx, "2400"); // Leverandørgjeld

  // Check if expense account has a locked VAT type
  let vatTypeId = INPUT_VAT_MAP[data.vatPercent] ?? 1;
  const acctRes = await ctx.get(`/ledger/account/${expenseAccountId}`, {
    fields: "id,vatType,vatLocked",
  });
  if (acctRes.ok) {
    const acctVal = (acctRes.data as Record<string, unknown>)?.value as Record<string, unknown> | undefined;
    const vatLocked = acctVal?.vatLocked as boolean | undefined;
    const acctVatType = acctVal?.vatType as Record<string, unknown> | undefined;
    if (vatLocked) {
      // Account is locked — use the locked VAT type exactly as returned
      // id=0 IS valid ("Ingen avgiftsbehandling") — don't skip it!
      const lockedVatId = acctVatType?.id as number | undefined;
      vatTypeId = (lockedVatId != null) ? lockedVatId : 0;
    }
  }
  const voucherDescription = data.invoiceNumber
    ? `Faktura ${data.invoiceNumber} fra ${data.supplier.name}`
    : `${data.description} - ${data.supplier.name}`;

  const res = await ctx.post("/supplierInvoice", {
    invoiceNumber: data.invoiceNumber || undefined,
    invoiceDate: data.invoiceDate,
    invoiceDueDate: data.dueDate,
    supplier: { id: supplierId },
    voucher: {
      date: data.invoiceDate,
      description: voucherDescription,
      postings: [
        {
          row: 1,
          date: data.invoiceDate,
          description: data.description,
          account: { id: expenseAccountId },
          amountGross: data.amountInclVat,
          amountGrossCurrency: data.amountInclVat,
          vatType: { id: vatTypeId },
          ...(departmentId ? { department: { id: departmentId } } : {}),
        },
        {
          row: 2,
          date: data.invoiceDate,
          description: data.supplier.name,
          account: { id: supplierAccountId },
          supplier: { id: supplierId },
          amountGross: -data.amountInclVat,
          amountGrossCurrency: -data.amountInclVat,
        },
      ],
    },
  });
  if (!res.ok) throw new Error(`Failed to create supplier invoice: ${res.message}`);

  // Send voucher to ledger (separate call — sendToLedger param on POST doesn't work per OpenAPI)
  const val = extractValue(res);
  const voucher = val.voucher as Record<string, unknown> | undefined;
  const voucherId = voucher?.id;
  if (voucherId) {
    await ctx.put(`/ledger/voucher/${voucherId}/:sendToLedger`, {});
  }
}
