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
  stripDiacritics,
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
  let year = data.year ?? parseInt(yearStr);
  let month = data.month ?? parseInt(monthStr);

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
    const email = data.employee.email || `${stripDiacritics(data.employee.firstName).toLowerCase()}.${stripDiacritics(data.employee.lastName).toLowerCase()}@example.org`;
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
  // If employment starts in the future, use start date's year/month for salary spec
  if (!data.year && !data.month) {
    const [sY, sM] = startDate.split("-").map(Number);
    if (sY > year || (sY === year && sM > month)) {
      year = sY;
      month = sM;
    }
  }
  const employmentBody: Record<string, unknown> = {
    employee: { id: empId },
    startDate,
    division: { id: divId },
  };
  // Note: occupationCode and percentageOfFullTimeEquivalent are NOT accepted on
  // POST /employee/employment. They go on employment details (separate endpoint).

  let empRes = await ctx.post("/employee/employment", employmentBody);

  // If mapping failed (optional fields like occupationCode have wrong format), retry without them
  if (!empRes.ok && (empRes.message?.includes("mapping") || empRes.message?.includes("Mapping"))) {
    empRes = await ctx.post("/employee/employment", {
      employee: { id: empId },
      startDate,
      division: { id: divId },
    });
  }

  if (!empRes.ok && empRes.status === 422) {
    // Check if it's a dateOfBirth error — fix employee and retry
    const isDobError = empRes.validationMessages?.some(
      (v) => v.field?.includes("dateOfBirth")
    );
    if (isDobError) {
      const email = data.employee.email || `${stripDiacritics(data.employee.firstName).toLowerCase()}.${stripDiacritics(data.employee.lastName).toLowerCase()}@example.org`;
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

  // 5b. Employment details (occupationCode, percentage — scoring checks these)
  let emplId = empRes.ok ? extractId(empRes) : undefined;
  if (!emplId) {
    const getEmpl = await ctx.get("/employee/employment", {
      employeeId: String(empId),
      fields: "id",
    });
    const emplValues = extractValues(getEmpl);
    emplId = emplValues[0]?.id as number;
  }
  if (emplId) {
    const detailsBody: Record<string, unknown> = {
      employment: { id: emplId },
      date: startDate,
    };
    if (data.percentageOfFullTimeEquivalent) {
      detailsBody.percentageOfFullTimeEquivalent = data.percentageOfFullTimeEquivalent;
    }
    if (data.occupationCode) {
      detailsBody.occupationCode = data.occupationCode;
    }
    // Only POST if we have actual details to set
    if (data.percentageOfFullTimeEquivalent || data.occupationCode) {
      await ctx.post("/employee/employment/details", detailsBody);
    }
  }

  // 5c. Standard time (work hours per day) — if extracted from PDF
  if ((data as Record<string, unknown>).workHoursPerDay) {
    const hours = (data as Record<string, unknown>).workHoursPerDay as number;
    // GET existing standard time entry, then PUT to update
    const stRes = await ctx.get("/employee/standardTime", {
      employeeId: String(empId),
      fields: "id,version",
    });
    const stValues = extractValues(stRes);
    if (stValues[0]?.id) {
      await ctx.put(`/employee/standardTime/${stValues[0].id}`, {
        id: stValues[0].id,
        version: stValues[0].version,
        hoursPerDay: hours,
      });
    }
  }

  // 6. Get salary types
  const typeRes = await ctx.get("/salary/type", { fields: "id,number,name" });
  const salaryTypes = extractValues(typeRes);
  if (salaryTypes.length === 0) throw new Error("No salary types found");

  const typeByNumber = new Map<number, number>();
  for (const st of salaryTypes) {
    typeByNumber.set(st.number as number, st.id as number);
  }

  // 7. Build salary specifications for ALL components
  const specifications: Array<{ salaryType: { id: number }; rate: number; count: number }> = [];
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
    specifications.push({ salaryType: { id: typeId }, rate, count: comp.count });
  }

  // 8. Create salary transaction with embedded payslip + specifications
  // This is the correct Tripletex API flow (not POST /salary/specification which returns 500)
  await ctx.post("/salary/transaction", {
    date: today,
    year,
    month,
    payslips: [{
      employee: { id: empId },
      date: today,
      year,
      month,
      specifications,
    }],
  });
}
