/**
 * Fast subset of benchmark prompts — one per task category.
 * Used by autoresearch to get a quick val_metric (~5 min per cycle).
 */
export const FAST_SUBSET_IDS = [
  "t1-customer-nb",
  "t1-employee-nb",
  "t1-employee-admin-nb",
  "t1-travel-nb",
  "t1-product-nb",
  "t1-department-nb",
  "t2-project-nb",
  "t2-invoice-nb",
  "t2-invoice-payment-nb",
  "t2-invoice-multiline-nb",
  "t2-credit-note-nb",
  "t2-salary-nb",
  "t2-supplier-invoice-nb",
  "t2-travel-expense-full-en",
  "t2-delete-travel-nb",
];
