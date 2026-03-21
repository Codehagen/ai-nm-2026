import { z } from "zod";

export const TimesheetSchema = z.object({
  employee: z.object({
    firstName: z.string().describe("Employee first name"),
    lastName: z.string().describe("Employee last name"),
    email: z.string().optional(),
  }),
  project: z.object({
    name: z.string().describe("Project name"),
  }),
  customer: z.object({
    name: z.string().describe("Customer name"),
    organizationNumber: z.string().optional(),
    email: z.string().optional(),
  }),
  entries: z.array(z.object({
    activityName: z.string().describe("Activity name (e.g. 'Development', 'Consulting')"),
    date: z.string().describe("Date YYYY-MM-DD"),
    hours: z.number().describe("Number of hours (decimal, e.g. 7.5)"),
    comment: z.string().optional(),
  })),
  invoice: z.object({
    create: z.boolean().default(false).describe("True if prompt asks to invoice for the hours"),
    products: z.array(z.object({
      name: z.string(),
      price: z.number().describe("Hourly rate"),
      quantity: z.number().describe("Number of hours to invoice"),
      vatPercent: z.enum(["25", "15", "12", "0"]).default("25"),
    })).optional(),
    dueDate: z.string().optional(),
  }).optional(),
});

export type TimesheetData = z.infer<typeof TimesheetSchema>;
