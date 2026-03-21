/**
 * Deterministic salary executor.
 * 7-step rigid sequence that the LLM always times out on.
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

  // 1. Department
  const deptId = await ensureDepartment(ctx, data.departmentName ?? "Avdeling", "1");

  // 2. Employee
  const empId = await ensureEmployee(ctx, {
    firstName: data.employee.firstName,
    lastName: data.employee.lastName,
    email: data.employee.email,
    departmentId: deptId,
  });

  // 3. Division (required for employment)
  const divId = await ensureDivision(ctx);

  // 4. Employment (required for salary specs)
  let empRes = await ctx.post("/employee/employment", {
    employee: { id: empId },
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    division: { id: divId },
  });
  if (!empRes.ok && empRes.status === 422) {
    // Check if it's a dateOfBirth error — fix employee and retry
    const isDobError = empRes.validationMessages?.some(
      (v) => v.field?.includes("dateOfBirth")
    );
    if (isDobError) {
      // GET employee to get version, then PUT dateOfBirth
      const getEmp = await ctx.get("/employee", {
        email: data.employee.email || `${data.employee.firstName.toLowerCase()}.${data.employee.lastName.toLowerCase()}@example.org`,
        fields: "id,version,dateOfBirth,firstName,lastName",
      });
      const empValues = extractValues(getEmp);
      if (empValues[0]) {
        await ctx.put(`/employee/${empValues[0].id}`, {
          id: empValues[0].id,
          version: empValues[0].version,
          firstName: empValues[0].firstName,
          lastName: empValues[0].lastName,
          dateOfBirth: empValues[0].dateOfBirth || "1990-01-15",
        });
      }
      // Retry employment creation
      empRes = await ctx.post("/employee/employment", {
        employee: { id: empId },
        startDate: `${year}-${String(month).padStart(2, "0")}-01`,
        division: { id: divId },
      });
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

  // 5. Get salary types
  const typeRes = await ctx.get("/salary/type", { fields: "id,number,name" });
  const salaryTypes = extractValues(typeRes);
  if (salaryTypes.length === 0) throw new Error("No salary types found");

  // Build lookup by number
  const typeByNumber = new Map<number, number>();
  for (const st of salaryTypes) {
    typeByNumber.set(st.number as number, st.id as number);
  }

  // 6. Create salary specifications
  for (const comp of data.components) {
    let typeId: number | undefined;

    if (comp.type === "other") {
      // Try to find by description match
      const matchType = salaryTypes.find(
        (st) => (st.name as string)?.toLowerCase().includes(comp.description?.toLowerCase() ?? "")
      );
      typeId = matchType?.id as number | undefined;
      if (!typeId) {
        // Default to fastlonn
        typeId = typeByNumber.get(2000);
      }
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
    // Final fallback: use first salary type (usually fastlønn)
    if (!typeId) {
      typeId = salaryTypes[0]?.id as number | undefined;
    }
    if (!typeId) throw new Error(`Salary type not found for ${comp.type}`);

    await ctx.post("/salary/specification", {
      employee: { id: empId },
      salaryType: { id: typeId },
      year,
      month,
      count: comp.count,
      rate: comp.amount,
    });
  }
}
