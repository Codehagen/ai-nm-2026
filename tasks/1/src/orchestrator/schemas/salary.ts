import { z } from "zod";

export const SalarySchema = z.object({
  employee: z.object({
    firstName: z.string().describe("Employee first name exactly as in prompt/document"),
    lastName: z.string().describe("Employee last name exactly as in prompt/document"),
    email: z.string().optional().describe("Employee email if mentioned"),
    dateOfBirth: z.string().optional().describe("Date of birth in YYYY-MM-DD format. Convert from DD.MM.YYYY if needed. Extract from PDF if present."),
    nationalIdentityNumber: z.string().optional().describe("Norwegian national identity number (personnummer, 11 digits). Extract from PDF if present."),
    bankAccountNumber: z.string().optional().describe("Employee bank account number. Extract from PDF if present."),
  }),
  components: z.array(z.object({
    type: z.enum(["fastlonn", "bonus", "timelonn", "faste_tillegg", "overtid", "other"])
      .describe("Salary type: fastlonn=base salary, bonus=bonus, timelonn=hourly, faste_tillegg=fixed supplement, overtid=overtime"),
    amount: z.number().describe("Amount in NOK. If annual salary (årslønn), divide by 12 to get monthly amount."),
    isAnnual: z.boolean().default(false).describe("Set to true if the amount is annual (årslønn). The executor will divide by 12."),
    count: z.number().default(1).describe("Count: 1 for monthly salary, number of hours for hourly pay"),
    description: z.string().optional().describe("Description if the type is 'other'"),
  })),
  year: z.number().optional().describe("Salary year if specified (defaults to current year)"),
  month: z.number().optional().describe("Salary month if specified (defaults to current month)"),
  departmentName: z.string().optional().describe("Department name from prompt or PDF (e.g. 'Lager', 'IT'). Use exact name from document."),
  occupationCode: z.string().optional().describe("STYRK occupation code (4 digits) if mentioned in PDF/prompt"),
  percentageOfFullTimeEquivalent: z.number().optional().describe("Employment percentage (e.g. 80.0 for 80%). Extract from PDF if present (stillingsprosent)."),
  startDate: z.string().optional().describe("Employment start date in YYYY-MM-DD. Convert from DD.MM.YYYY if needed (tiltredelse)."),
});

export type SalaryData = z.infer<typeof SalarySchema>;
