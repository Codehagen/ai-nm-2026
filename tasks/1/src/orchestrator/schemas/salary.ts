import { z } from "zod";

export const SalarySchema = z.object({
  employee: z.object({
    firstName: z.string().describe("Employee first name exactly as in prompt"),
    lastName: z.string().describe("Employee last name exactly as in prompt"),
    email: z.string().optional().describe("Employee email if mentioned"),
  }),
  components: z.array(z.object({
    type: z.enum(["fastlonn", "bonus", "timelonn", "faste_tillegg", "overtid", "other"])
      .describe("Salary type: fastlonn=base salary, bonus=bonus, timelonn=hourly, faste_tillegg=fixed supplement, overtid=overtime"),
    amount: z.number().describe("Amount in NOK"),
    count: z.number().default(1).describe("Count: 1 for monthly salary, number of hours for hourly pay"),
    description: z.string().optional().describe("Description if the type is 'other'"),
  })),
  year: z.number().optional().describe("Salary year if specified (defaults to current year)"),
  month: z.number().optional().describe("Salary month if specified (defaults to current month)"),
  departmentName: z.string().optional().describe("Department name if specified"),
});

export type SalaryData = z.infer<typeof SalarySchema>;
