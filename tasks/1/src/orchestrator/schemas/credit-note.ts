import { z } from "zod";

export const CreditNoteSchema = z.object({
  customer: z.object({
    name: z.string().describe("Customer name exactly as in prompt"),
    organizationNumber: z.string().optional(),
    email: z.string().optional(),
  }),
  products: z.array(z.object({
    name: z.string().describe("Product name"),
    number: z.number().optional(),
    price: z.number().describe("Price excluding VAT"),
    vatPercent: z.enum(["25", "15", "12", "0"]).default("25"),
    quantity: z.number().default(1),
  })).optional().describe("Products if we need to create a new invoice to credit"),
  isExistingInvoice: z.boolean().default(true).describe("True if crediting an existing invoice"),
  createNewInvoice: z.boolean().default(false).describe("True if we need to create a new invoice first, then credit it"),
});

export type CreditNoteData = z.infer<typeof CreditNoteSchema>;
