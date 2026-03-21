/**
 * Deterministic salary executor.
 * Handles both simple payroll prompts and PDF employment contracts.
 */

import type { SalaryData } from "../schemas/salary.js";
import {
  OrchestratorContext,
  ensureDepartment,
  ensureEmployee,
  ensureDivision,
  extractId,
  extractValues,
  getOsloDate,
} from "../helpers.js";

/** Map salary type names to Tripletex salary type numbers */
const SALARY_TYPE_NUMBERS: Record<string, number> = {
  fastlonn: 2000,
  bonus: 2002,
  timelonn: 2001,
  faste_tillegg: 2003,
  overtid: 2005,
};

export async function executeSalary(ctx: OrchestratorContext, data: SalaryData): Promise<void> {
  const today = getOsloDate();
  const [yearStr, monthStr] = today.split("-");
  const year = data.year ?? parseInt(yearStr);
  const month = data.month ?? parseInt(monthStr);

  // 1. Department (use name from PDF/prompt if available)
  const deptId = await ensureDepartment(ctx, data.departmentName ?? "Avdeling", "1");

  // 2. Employee (create with basic fields first)
  const empId = await ensureEmployee(ctx, {
    firstName: data.employee.firstName,
    lastName: data.employee.lastName,
    email: data.employee.email,
    departmentId: deptId,
  });

  // 3. Update employee with PDF-specific fields (dateOfBirth, nationalIdentityNumber, bankAccountNumber)
  const needsUpdate =
    data.employee.dateOfBirth ||
    data.employee.nationalIdentityNumber ||
    data.employee.bankAccountNumber;

  if (needsUpdate) {
    // GET current employee to get version
    const email = data.employee.email || `${data.employee.firstName.toLowerCase()}.${data.employee.lastName.toLowerCase()}@example.org`;
    const getRes = await ctx.get("/employee", {
      email,
      fields: "id,version,dateOfBirth,nationalIdentityNumber,bankAccountNumber,firstName,lastName",
    });
    const values = extractValues(getRes);
    const existing = values[0];
    if (existing) {
      const putBody: Record<string, unknown> = {
        id: existing.id,
        version: existing.version,
        firstName: data.employee.firstName || existing.firstName,
        lastName: data.employee.lastName || existing.lastName,
        dateOfBirth: data.employee.dateOfBirth || existing.dateOfBirth || "1990-01-15",
      };
      if (data.employee.nationalIdentityNumber) {
        putBody.nationalIdentityNumber = data.employee.nationalIdentityNumber;
      }
      if (data.employee.bankAccountNumber) {
        putBody.bankAccountNumber = data.employee.bankAccountNumber;
      }
      await ctx.put(`/employee/${existing.id}`, putBody);
    }
  }

  // 4. Division (required for employment)
  const divId = await ensureDivision(ctx);

  // 5. Employment (with startDate and percentage from PDF if available)
  const startDate = data.startDate || `${year}-${String(month).padStart(2, "0")}-01`;
  const employmentBody: Record<string, unknown> = {
    employee: { id: empId },
    startDate,
    division: { id: divId },
  };
  if (data.occupationCode) {
    employmentBody.occupationCode = data.occupationCode;
  }
  if (data.percentageOfFullTimeEquivalent != null) {
    employmentBody.percentageOfFullTimeEquivalent = data.percentageOfFullTimeEquivalent;
  }

  let empRes = await ctx.post("/employee/employment", employmentBody);
  if (!empRes.ok && empRes.status === 422) {
    // Check if it's a dateOfBirth error — fix employee and retry
    const isDobError = empRes.validationMessages?.some(
      (v) => v.field?.includes("dateOfBirth")
    );
    if (isDobError) {
      const email = data.employee.email || `${data.employee.firstName.toLowerCase()}.${data.employee.lastName.toLowerCase()}@example.org`;
      const getEmp = await ctx.get("/employee", {
        email,
        fields: "id,version,dateOfBirth,firstName,lastName",
      });
      const empValues = extractValues(getEmp);
      if (empValues[0]) {
        await ctx.put(`/employee/${empValues[0].id}`, {
          id: empValues[0].id,
          version: empValues[0].version,
          firstName: empValues[0].firstName,
          lastName: empValues[0].lastName,
          dateOfBirth: data.employee.dateOfBirth || empValues[0].dateOfBirth || "1990-01-15",
        });
      }
      empRes = await ctx.post("/employee/employment", employmentBody);
    }
    // If still 422, check if employment already exists
    if (!empRes.ok && empRes.status === 422) {
      const getRes = await ctx.get("/employee/employment", {
        employeeId: String(empId),
        fields: "id,division",
      });
      const values = extractValues(getRes);
      if (values.length === 0) throw new Error(`Failed to create employment: ${empRes.message}`);
    }
  } else if (!empRes.ok) {
    throw new Error(`Failed to create employment: ${empRes.message}`);
  }

  // 6. Get salary types
  const typeRes = await ctx.get("/salary/type", { fields: "id,number,name" });
  const salaryTypes = extractValues(typeRes);
  if (salaryTypes.length === 0) throw new Error("No salary types found");

  const typeByNumber = new Map<number, number>();
  for (const st of salaryTypes) {
    typeByNumber.set(st.number as number, st.id as number);
  }

  // 7. Create salary specifications
  for (const comp of data.components) {
    let typeId: number | undefined;

    if (comp.type === "other") {
      const matchType = salaryTypes.find(
        (st) => (st.name as string)?.toLowerCase().includes(comp.description?.toLowerCase() ?? "")
      );
      typeId = matchType?.id as number | undefined;
      if (!typeId) typeId = typeByNumber.get(2000);
    } else {
      const num = SALARY_TYPE_NUMBERS[comp.type];
      typeId = typeByNumber.get(num);
    }

    // Fallback: search by name if number lookup fails
    if (!typeId) {
      const namePatterns: Record<string, string[]> = {
        fastlonn: ["fastlønn", "fast lønn", "månedslønn", "base salary", "grunnlønn"],
        bonus: ["bonus", "tillegg", "gratiale"],
        timelonn: ["timelønn", "hourly", "timesats"],
        faste_tillegg: ["faste tillegg", "fast tillegg", "supplement"],
        overtid: ["overtid", "overtime"],
      };
      const patterns = namePatterns[comp.type] ?? [comp.type, comp.description ?? ""];
      const match = salaryTypes.find((st) =>
        patterns.some((p) => (st.name as string)?.toLowerCase().includes(p))
      );
      typeId = match?.id as number | undefined;
    }
    if (!typeId) typeId = salaryTypes[0]?.id as number | undefined;
    if (!typeId) throw new Error(`Salary type not found for ${comp.type}`);

    // Convert annual salary to monthly
    const rate = comp.isAnnual ? Math.round(comp.amount / 12) : comp.amount;

    await ctx.post("/salary/specification", {
      employee: { id: empId },
      salaryType: { id: typeId },
      year,
      month,
      count: comp.count,
      rate,
    });
  }
}
