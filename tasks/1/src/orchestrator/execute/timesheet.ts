/**
 * Deterministic timesheet executor.
 * Handles employee, project, activity, time entries, and optional invoicing.
 */

import type { TimesheetData } from "../schemas/timesheet.js";
import {
  OrchestratorContext,
  ensureDepartment,
  ensureEmployee,
  createCustomer,
  ensureProduct,
  createInvoiceFromProducts,
  getAdminEmployee,
  extractId,
  extractValue,
  extractValues,
  getOsloDate,
} from "../helpers.js";

export async function executeTimesheet(ctx: OrchestratorContext, data: TimesheetData): Promise<void> {
  const today = getOsloDate();

  // 1. Department + Employee
  const deptId = await ensureDepartment(ctx);
  const empId = await ensureEmployee(ctx, {
    firstName: data.employee.firstName,
    lastName: data.employee.lastName,
    email: data.employee.email,
    departmentId: deptId,
  });

  // 2. Customer + Project (with PM dance)
  const adminId = await getAdminEmployee(ctx);
  const custId = await createCustomer(ctx, data.customer);

  const projRes = await ctx.post("/project", {
    name: data.project.name,
    projectManager: { id: adminId },
    customer: { id: custId },
    isInternal: false,
    startDate: today,
  });
  if (!projRes.ok) throw new Error(`Failed to create project: ${projRes.message}`);
  const projVal = extractValue(projRes);
  const projId = projVal.id as number;

  // Update PM to the named employee
  await ctx.put(`/project/${projId}`, {
    id: projId,
    version: projVal.version,
    projectManager: { id: empId },
  });

  // 3. Activities — ensure each unique activity exists
  const activityIds = new Map<string, number>();
  const uniqueActivities = [...new Set(data.entries.map((e) => e.activityName))];

  for (const actName of uniqueActivities) {
    const getRes = await ctx.get("/activity", { name: actName, fields: "id,name" });
    const values = extractValues(getRes);
    if (values[0]?.id) {
      activityIds.set(actName, values[0].id as number);
    } else {
      const postRes = await ctx.post("/activity", { name: actName });
      if (postRes.ok) {
        activityIds.set(actName, extractId(postRes));
      } else {
        throw new Error(`Failed to create activity ${actName}: ${postRes.message}`);
      }
    }
  }

  // 4. Create timesheet entries
  for (const entry of data.entries) {
    const actId = activityIds.get(entry.activityName);
    if (!actId) throw new Error(`No activity ID for ${entry.activityName}`);

    await ctx.post("/timesheet/entry", {
      employee: { id: empId },
      project: { id: projId },
      activity: { id: actId },
      date: entry.date || today,
      hours: entry.hours,
      comment: entry.comment ?? "",
    });
  }

  // 5. Optional: create invoice for the hours
  if (data.invoice?.create && data.invoice.products?.length) {
    const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
    for (const p of data.invoice.products) {
      const prod = await ensureProduct(ctx, p);
      products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
    }
    await createInvoiceFromProducts(ctx, custId, products, data.invoice.dueDate, projId);
  }
}
