import { z } from "zod";

export const SupplierInvoiceSchema = z.object({
  supplier: z.object({
    name: z.string().describe("Supplier name exactly as in prompt"),
    organizationNumber: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
  invoiceNumber: z.string().describe("Supplier's invoice number/reference"),
  invoiceDate: z.string().describe("Invoice date YYYY-MM-DD"),
  dueDate: z.string().describe("Due date YYYY-MM-DD"),
  description: z.string().describe("Description of the goods/services"),
  amountExclVat: z.number().describe("Total amount excluding VAT"),
  amountInclVat: z.number().describe("Total amount including VAT"),
  vatPercent: z.enum(["25", "15", "12", "0"]).default("25").describe("VAT rate"),
  expenseAccount: z.string().default("7300").describe("Expense ledger account number (e.g. 7300 for office services, 6300 for insurance, 4300 for goods)"),
});

export type SupplierInvoiceData = z.infer<typeof SupplierInvoiceSchema>;
