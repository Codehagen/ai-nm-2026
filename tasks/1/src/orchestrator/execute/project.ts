/**
 * Deterministic project executor.
 * Handles the PM-update dance and fixed price pitfalls.
 */

import type { ProjectData } from "../schemas/project.js";
import {
  OrchestratorContext,
  ensureDepartment,
  ensureEmployee,
  createCustomer,
  ensureProduct,
  createInvoiceFromProducts,
  getAdminEmployee,
  extractValue,
  getOsloDate,
} from "../helpers.js";

export async function executeProject(ctx: OrchestratorContext, data: ProjectData): Promise<void> {
  const today = getOsloDate();

  // 1. Department + named employee (PM)
  const deptId = await ensureDepartment(ctx);
  const pmId = await ensureEmployee(ctx, {
    firstName: data.projectManager.firstName,
    lastName: data.projectManager.lastName,
    email: data.projectManager.email,
    departmentId: deptId,
  });

  // 2. Grant PM entitlements
  await ctx.put("/employee/entitlement/:grantEntitlementsByTemplate", {}, {
    employeeId: String(pmId),
    template: "ALL_PRIVILEGES",
  });

  // 3. Customer
  const custId = await createCustomer(ctx, data.customer);

  // 4. Create project DIRECTLY with named PM (saves 1 GET + 1 PUT vs admin dance)
  const projBody: Record<string, unknown> = {
    name: data.project.name,
    projectManager: { id: pmId },
    customer: { id: custId },
    isInternal: false,
    startDate: data.project.startDate || today,
  };
  // Set fixed price directly on POST (saves 1 PUT)
  if (data.project.isFixedPrice && data.project.fixedPrice != null) {
    projBody.isFixedPrice = true;
    projBody.fixedprice = data.project.fixedPrice;
  }

  const projRes = await ctx.post("/project", projBody);
  if (!projRes.ok) throw new Error(`Failed to create project: ${projRes.message}`);
  const projVal = extractValue(projRes);
  const projId = projVal.id as number;

  // 6. Optional: create invoice for the project
  if (data.invoice?.create && data.invoice.products?.length) {
    const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
    for (const p of data.invoice.products) {
      const prod = await ensureProduct(ctx, p);
      products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
    }
    await createInvoiceFromProducts(ctx, custId, products, undefined, projId);
  }
}
