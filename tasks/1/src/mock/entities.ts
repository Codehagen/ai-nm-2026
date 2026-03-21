/**
 * Per-entity configurations for the CRUD factory.
 * Defines required fields, search fields, and reference validation.
 */

export interface EntityConfig {
  /** Internal store type name */
  type: string;
  /** URL base path (e.g., "/employee") */
  basePath: string;
  /** Fields required on POST */
  requiredFields: string[];
  /** Fields searchable via query params */
  searchFields: string[];
  /** Reference fields that must point to existing entities: { "department.id": "department" } */
  refValidation?: Record<string, string>;
  /** Custom validation function */
  customValidation?: (body: Record<string, unknown>) => Array<{ field: string; message: string }> | null;
  /** Whether DELETE is supported */
  deletable?: boolean;
  /** Query params required for GET list (e.g., date range filters) */
  requiredListParams?: string[];
}

export const ENTITY_CONFIGS: EntityConfig[] = [
  {
    type: "employee",
    basePath: "/employee",
    requiredFields: ["firstName", "lastName"],
    searchFields: ["firstName", "lastName", "email", "employeeNumber"],
    refValidation: { "department.id": "department" },
    customValidation: (body) => {
      const errors: Array<{ field: string; message: string }> = [];
      if (body.userType && body.userType !== "STANDARD" && body.userType !== "ADMINISTRATOR") {
        errors.push({ field: "userType", message: "must be STANDARD or ADMINISTRATOR" });
      }
      return errors.length > 0 ? errors : null;
    },
    deletable: false, // Real Tripletex returns 403 on DELETE /employee
  },
  {
    type: "customer",
    basePath: "/customer",
    requiredFields: ["name"],
    searchFields: ["name", "email", "organizationNumber", "phoneNumber"],
    deletable: true,
  },
  {
    type: "department",
    basePath: "/department",
    requiredFields: ["name", "departmentNumber"],
    searchFields: ["name", "departmentNumber"],
    deletable: true,
  },
  {
    type: "product",
    basePath: "/product",
    requiredFields: ["name"],
    searchFields: ["name", "number"],
    deletable: true,
  },
  {
    type: "order",
    basePath: "/order",
    requiredFields: ["customer", "deliveryDate", "orderDate"],
    searchFields: ["id"],
    refValidation: { "customer.id": "customer" },
    requiredListParams: ["orderDateFrom", "orderDateTo"],
    deletable: true,
  },
  {
    type: "invoice",
    basePath: "/invoice",
    requiredFields: ["invoiceDate", "invoiceDueDate", "orders"],
    searchFields: ["invoiceNumber", "customerId"],
    requiredListParams: ["invoiceDateFrom", "invoiceDateTo"],
    deletable: false,
  },
  {
    type: "project",
    basePath: "/project",
    requiredFields: ["name", "projectManager"],
    searchFields: ["name", "number", "description"],
    refValidation: {
      "projectManager.id": "employee",
      "customer.id": "customer",
    },
    deletable: true,
  },
  {
    type: "travelExpense",
    basePath: "/travelExpense",
    requiredFields: ["employee", "title"],
    searchFields: ["title"],
    refValidation: { "employee.id": "employee" },
    deletable: true,
  },
  {
    type: "account",
    basePath: "/ledger/account",
    requiredFields: [],
    searchFields: ["number", "name"],
    deletable: false,
  },
  {
    type: "voucher",
    basePath: "/ledger/voucher",
    requiredFields: [],
    searchFields: ["number", "description"],
    deletable: true,
  },
  {
    type: "supplier",
    basePath: "/supplier",
    requiredFields: ["name"],
    searchFields: ["name", "organizationNumber", "supplierNumber"],
    deletable: true,
  },
  {
    type: "contact",
    basePath: "/contact",
    requiredFields: ["firstName", "lastName"],
    searchFields: ["firstName", "lastName", "email"],
    deletable: true,
  },
  {
    type: "activity",
    basePath: "/activity",
    requiredFields: ["name"],
    searchFields: ["name", "number"],
    deletable: true,
  },
  {
    type: "salarySpecification",
    basePath: "/salary/specification",
    requiredFields: ["employee", "salaryType", "count", "rate"],
    searchFields: [],
    refValidation: { "employee.id": "employee" },
    deletable: true,
  },
  {
    type: "municipality",
    basePath: "/municipality",
    requiredFields: [],
    searchFields: ["name", "number"],
    deletable: false,
  },
  {
    type: "division",
    basePath: "/division",
    requiredFields: ["name"],
    searchFields: ["name"],
    deletable: false,
  },
  {
    type: "timesheetEntry",
    basePath: "/timesheet/entry",
    requiredFields: ["employee", "project", "activity", "date", "hours"],
    searchFields: [],
    refValidation: { "employee.id": "employee", "project.id": "project" },
    deletable: true,
  },
  {
    type: "supplierInvoice",
    basePath: "/supplierInvoice",
    requiredFields: ["supplier", "invoiceDate"],
    searchFields: ["invoiceNumber"],
    refValidation: { "supplier.id": "supplier" },
    deletable: false,
  },
];

/** Lookup entity config by basePath */
export function findConfigByPath(path: string): EntityConfig | undefined {
  return ENTITY_CONFIGS.find((c) => path === c.basePath || path.startsWith(c.basePath + "/"));
}

/** Lookup entity config by type */
export function findConfigByType(type: string): EntityConfig | undefined {
  return ENTITY_CONFIGS.find((c) => c.type === type);
}
