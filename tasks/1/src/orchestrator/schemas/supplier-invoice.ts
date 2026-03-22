import { z } from "zod";

export const SupplierInvoiceSchema = z.object({
  supplier: z.object({
    name: z.string().describe("The company ISSUING the invoice/receipt. Look for logo, header, 'Fra:'/'From:'/'De:'/'Von:'. Include entity type (AS, GmbH, SARL, Ltd, SL). NEVER use your own company name."),
    organizationNumber: z.string().optional().describe("Supplier org number. Look for 'Org.nr', 'Org.-Nr.', 'nº org', 'CNPJ', 'CIF'."),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
  invoiceNumber: z.string().describe("Invoice number OR receipt keyword. For invoices: look for 'Faktura nr', 'Invoice #', 'Nº'. For RECEIPTS: use the receipt header keyword like 'KVITTERING', 'RECEIPT', 'QUITTUNG', 'REÇU', 'RECIBO' — do NOT use the date as invoice number."),
  invoiceDate: z.string().describe("Invoice/receipt date in YYYY-MM-DD. Look for 'Dato', 'Date', 'Fecha', 'Datum'. Convert DD.MM.YYYY → YYYY-MM-DD."),
  dueDate: z.string().describe("Due date YYYY-MM-DD. Look for 'Forfallsdato', 'Due date', 'Fecha de vencimiento', 'Data de vencimento', 'Date d'échéance', 'Fällig'. For receipts, same as invoiceDate."),
  description: z.string().describe("What was purchased. Summarize line items if multiple."),
  amountExclVat: z.number().describe("Total EXCLUDING VAT. Look for 'Netto', 'Excl. MVA', 'Hors TVA', 'Netto'. If only total shown: total / 1.25 for 25% VAT."),
  amountInclVat: z.number().describe("Total INCLUDING VAT. Look for 'Total', 'Totalt', 'Sum', 'Brutto', 'Gesamtbetrag', 'TTC'. This is the final amount."),
  vatPercent: z.enum(["25", "15", "12", "0"]).default("25").describe("VAT rate. Norway standard = 25%. Food = 15%. Transport = 12%. Look for 'MVA', 'MwSt', 'TVA', 'IVA'."),
  expenseAccount: z.string().default("7300").describe("Expense account: 4300=goods for resale, 6300=rent/insurance, 6540=office supplies, 6800=IT/software, 7100=travel/transport, 7300=office/consulting services, 7350=entertainment/meals/representation (kundemøte, lunsj, middag), 7700=other operating expense"),
  departmentName: z.string().optional().describe("Department name if expense belongs to a specific department. Extract from prompt (e.g. 'HR', 'Markedsføring', 'IT')."),
});

export type SupplierInvoiceData = z.infer<typeof SupplierInvoiceSchema>;
