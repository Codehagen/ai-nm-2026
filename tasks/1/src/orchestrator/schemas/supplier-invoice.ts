import { z } from "zod";

export const SupplierInvoiceSchema = z.object({
  supplier: z.object({
    name: z.string().describe("Supplier/vendor/store name exactly as in prompt or document"),
    organizationNumber: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
  invoiceNumber: z.string().describe("Supplier's invoice number/reference. For receipts, use receipt number if visible."),
  invoiceDate: z.string().describe("Invoice or receipt date YYYY-MM-DD"),
  dueDate: z.string().describe("Due date YYYY-MM-DD. For receipts, same as invoiceDate."),
  description: z.string().describe("Description of the goods/services purchased"),
  amountExclVat: z.number().describe("Total amount excluding VAT. For receipts: total / (1 + vatRate)"),
  amountInclVat: z.number().describe("Total amount including VAT. For receipts: the total shown on receipt"),
  vatPercent: z.enum(["25", "15", "12", "0"]).default("25").describe("VAT rate"),
  expenseAccount: z.string().default("7300").describe("Expense ledger account number (6300=rent/insurance, 6540=office supplies, 6800=IT/software, 7100=travel/bilgodtgjørelse, 7300=office services, 4300=goods for resale)"),
  departmentName: z.string().optional().describe("Department name if the expense should be linked to a specific department (e.g. 'HR', 'Markedsføring')"),
});

export type SupplierInvoiceData = z.infer<typeof SupplierInvoiceSchema>;
