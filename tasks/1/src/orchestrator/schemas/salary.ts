import { z } from "zod";

export const SalarySchema = z.object({
  employee: z.object({
    firstName: z.string().describe("Employee first name EXACTLY as in prompt/document. Look for 'Arbeidstaker', 'Nom', 'Name', 'Nombre'."),
    lastName: z.string().describe("Employee last name EXACTLY as in prompt/document."),
    email: z.string().optional().describe("Employee email. Look for 'E-post', 'Email', 'Correo'."),
    dateOfBirth: z.string().optional().describe("Date of birth YYYY-MM-DD. Look for 'Fødselsdato', 'Date de naissance', 'Geburtsdatum', 'Fecha de nacimiento'. Convert DD.MM.YYYY → YYYY-MM-DD."),
    nationalIdentityNumber: z.string().optional().describe("Norwegian personnummer (11 digits). Look for 'Personnummer', 'Fødselsnummer', 'Numéro d'identité'. Format: DDMMYYXXXXX."),
    bankAccountNumber: z.string().optional().describe("Bank account number. Look for 'Bankkonto', 'Compte bancaire', 'Bankverbindung'."),
  }),
  components: z.array(z.object({
    type: z.enum(["fastlonn", "bonus", "timelonn", "faste_tillegg", "overtid", "other"])
      .describe("Map: Fastlønn/Fastlonn/base salary/salaire de base → fastlonn, Bonus/Prime → bonus, Timelønn/hourly → timelonn, Faste tillegg/supplement → faste_tillegg, Overtid/overtime → overtid"),
    amount: z.number().describe("Amount in NOK. For årslønn (annual salary), use the FULL annual amount and set isAnnual=true."),
    isAnnual: z.boolean().default(false).describe("TRUE if the amount is annual (årslønn/salaire annuel/Jahresgehalt). The system divides by 12 automatically."),
    count: z.number().default(1).describe("1 for monthly salary, number of hours for hourly pay (timelønn)"),
    description: z.string().optional().describe("Description for 'other' type"),
  })),
  year: z.number().optional().describe("Salary year (defaults to current year)"),
  month: z.number().optional().describe("Salary month (defaults to current month)"),
  departmentName: z.string().optional().describe("Department name EXACTLY from document. Look for 'Avdeling', 'Département', 'Abteilung'. Use the specific name (e.g. 'Lager', 'IT', 'Kvalitetskontroll'), NOT a generic name."),
  occupationCode: z.string().optional().describe("STYRK occupation code (4 digits). Look for 'Stillingskode (STYRK)', 'Code profession'."),
  percentageOfFullTimeEquivalent: z.number().optional().describe("Employment percentage. Look for 'Stillingsprosent', 'Pourcentage', 'Beschäftigungsgrad'. E.g. 80.0 for 80%."),
  startDate: z.string().optional().describe("Start date YYYY-MM-DD. Look for 'Tiltredelse', 'Date d'entrée', 'Eintrittsdatum'. Convert DD.MM.YYYY → YYYY-MM-DD."),
});

export type SalaryData = z.infer<typeof SalarySchema>;
