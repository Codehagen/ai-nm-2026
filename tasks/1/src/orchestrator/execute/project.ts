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

  // 1. Get admin employee (needed as initial PM)
  const adminId = await getAdminEmployee(ctx);

  // 2. Department + named employee (PM)
  const deptId = await ensureDepartment(ctx);
  const pmId = await ensureEmployee(ctx, {
    firstName: data.projectManager.firstName,
    lastName: data.projectManager.lastName,
    email: data.projectManager.email,
    departmentId: deptId,
  });

  // 3. Customer
  const custId = await createCustomer(ctx, data.customer);

  // 4. Create project with admin as initial PM
  const projRes = await ctx.post("/project", {
    name: data.project.name,
    projectManager: { id: adminId },
    customer: { id: custId },
    isInternal: false,
    startDate: data.project.startDate || today,
  });
  if (!projRes.ok) throw new Error(`Failed to create project: ${projRes.message}`);
  const projVal = extractValue(projRes);
  const projId = projVal.id as number;
  const projVersion = projVal.version as number;

  // 5. Update PM to the named employee
  const updateBody: Record<string, unknown> = {
    id: projId,
    version: projVersion,
    projectManager: { id: pmId },
  };

  // Also set fixed price if applicable (CRITICAL: lowercase 'fixedprice')
  if (data.project.isFixedPrice && data.project.fixedPrice != null) {
    updateBody.isFixedPrice = true;
    updateBody.fixedprice = data.project.fixedPrice;
  }

  await ctx.put(`/project/${projId}`, updateBody);

  // 6. Optional: create invoice for the project
  if (data.invoice?.create && data.invoice.products?.length) {
    const products: Array<{ id: number; price: number; quantity: number; vatPercent: string }> = [];
    for (const p of data.invoice.products) {
      const prod = await ensureProduct(ctx, p);
      products.push({ id: prod.id, price: p.price, quantity: p.quantity, vatPercent: p.vatPercent });
    }
    await createInvoiceFromProducts(ctx, custId, products);
  }
}
