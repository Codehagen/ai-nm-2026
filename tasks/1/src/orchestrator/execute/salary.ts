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
  const empRes = await ctx.post("/employee/employment", {
    employee: { id: empId },
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    division: { id: divId },
  });
  if (!empRes.ok) {
    if (empRes.status === 422) {
      // Already exists — that's fine, verify
      const getRes = await ctx.get("/employee/employment", {
        employeeId: String(empId),
        fields: "id,division",
      });
      const values = extractValues(getRes);
      if (values.length === 0) throw new Error(`Failed to create employment: ${empRes.message}`);
    } else {
      throw new Error(`Failed to create employment: ${empRes.message}`);
    }
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
