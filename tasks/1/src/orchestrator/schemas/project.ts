import { z } from "zod";

export const ProjectSchema = z.object({
  project: z.object({
    name: z.string().describe("Project name exactly as in prompt"),
    isFixedPrice: z.boolean().default(false).describe("True if the project has a fixed price"),
    fixedPrice: z.number().optional().describe("Fixed price amount if applicable"),
    startDate: z.string().optional().describe("Project start date YYYY-MM-DD if specified"),
  }),
  projectManager: z.object({
    firstName: z.string().describe("Project manager first name"),
    lastName: z.string().describe("Project manager last name"),
    email: z.string().optional().describe("Project manager email if mentioned"),
  }),
  customer: z.object({
    name: z.string().describe("Customer name exactly as in prompt"),
    organizationNumber: z.string().optional(),
    email: z.string().optional(),
  }),
  invoice: z.object({
    create: z.boolean().default(false).describe("True if prompt asks to create an invoice for the project"),
    products: z.array(z.object({
      name: z.string(),
      price: z.number(),
      quantity: z.number().default(1),
      vatPercent: z.enum(["25", "15", "12", "0"]).default("25"),
    })).optional(),
  }).optional(),
});

export type ProjectData = z.infer<typeof ProjectSchema>;
