import { z } from "zod";

export const InvoiceSchema = z.object({
  customer: z.object({
    name: z.string().describe("Customer/company name exactly as in prompt"),
    organizationNumber: z.string().optional().describe("Organization number if mentioned"),
    email: z.string().optional().describe("Customer email if mentioned"),
  }),
  products: z.array(z.object({
    name: z.string().describe("Product name exactly as in prompt"),
    number: z.number().optional().describe("Product number if mentioned (e.g. '5947')"),
    price: z.number().describe("Price per unit excluding VAT"),
    vatPercent: z.enum(["25", "15", "12", "0"]).default("25").describe("VAT rate: 25% standard, 15% food, 12% transport, 0% exempt"),
    quantity: z.number().default(1).describe("Quantity/count"),
  })),
  sendInvoice: z.boolean().default(false).describe("True if prompt says to send the invoice / send to customer / send on email"),
  registerPayment: z.boolean().default(false).describe("True if prompt says to register payment / mark as paid"),
  paymentAmount: z.number().optional().describe("Payment amount INCLUDING VAT if specified. If not specified, full invoice amount will be used."),
  dueDate: z.string().optional().describe("Invoice due date in YYYY-MM-DD format if specified"),
  isExistingInvoice: z.boolean().default(false).describe("True if the task is about an EXISTING invoice (e.g. 'register payment on invoice X') rather than creating a new one"),
  isPaymentReversal: z.boolean().default(false).describe("True if payment was RETURNED by bank and needs to be REVERSED. Look for 'returnert av banken', 'devolvido pelo banco', 'devuelto por el banco', 'retournée par la banque', 'von der Bank zurückgegeben'."),
  currencyCode: z.string().optional().describe("Currency code if invoice is in foreign currency (e.g. 'EUR', 'USD', 'GBP'). Only set if explicitly mentioned."),
  exchangeRate: z.number().optional().describe("Exchange rate at invoice time (e.g. 11.54 NOK/EUR). Look for 'kurs', 'exchange rate', 'taux de change', 'Wechselkurs', 'tipo de cambio', 'taxa de câmbio'."),
  paymentExchangeRate: z.number().optional().describe("Exchange rate at payment time if different from invoice rate. Look for 'ny kurs', 'new rate', 'kursen har endret seg til', 'taux actuel'."),
});

export type InvoiceData = z.infer<typeof InvoiceSchema>;
