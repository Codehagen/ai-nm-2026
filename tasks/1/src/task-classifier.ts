/**
 * Keyword-based task classifier for Tripletex prompts.
 * Supports all 7 competition languages: nb, nn, en, es, pt, de, fr.
 * Falls back to "unknown" which loads the full monolith prompt.
 */

export type TaskType =
  | "customer"
  | "employee"
  | "employee-admin"
  | "invoice"
  | "invoice-payment"
  | "invoice-send"
  | "credit-note"
  | "project"
  | "travel-expense"
  | "travel-expense-full"
  | "salary"
  | "supplier-invoice"
  | "contact"
  | "delete-travel"
  | "delete-voucher"
  | "update-employee"
  | "update-customer"
  | "department"
  | "product"
  | "voucher"
  | "timesheet"
  | "unknown";

/** Check if lowercased text contains any of the given substrings */
const has = (text: string, ...patterns: string[]) =>
  patterns.some((p) => text.includes(p));

/**
 * Classify a Tripletex task prompt into one of ~20 task types.
 * Order matters: more specific patterns are checked first.
 */
export function classifyTask(prompt: string): TaskType {
  const t = prompt.toLowerCase();

  // --- Salary / Payroll (check early — mentions "employee" but is salary task)
  if (
    has(
      t,
      "lønnskjøring",
      "lønn",
      "fastlønn",
      "salary",
      "payroll",
      "gehaltsabrechnung",
      "gehalt",
      "salaire",
      "salario",
      "salário",
      "nómina",
      "folha de pagamento",
    )
  ) {
    return "salary";
  }

  // --- Supplier invoice (before generic invoice)
  if (
    has(
      t,
      "leverandørfaktura",
      "supplier invoice",
      "factura del proveedor",
      "fatura do fornecedor",
      "lieferantenrechnung",
      "facture du fournisseur",
    ) ||
    (has(t, "leverandør", "supplier", "proveedor", "fornecedor", "fournisseur", "lieferant") &&
      has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture"))
  ) {
    return "supplier-invoice";
  }

  // --- Credit note
  if (
    has(
      t,
      "kreditnota",
      "kreditere",
      "credit note",
      "credit memo",
      "nota de crédito",
      "nota de credito",
      "avoir",
      "gutschrift",
      "createcreditnote",
    ) ||
    (has(t, "reklamasjon", "complaint", "réclamé", "reklamert", "annule") &&
      has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture"))
  ) {
    return "credit-note";
  }

  // --- Delete travel expense
  if (
    has(t, "slett", "delete", "elimina", "exclua", "löschen", "supprimez", "fjern") &&
    has(
      t,
      "reise",
      "travel",
      "viaje",
      "viagem",
      "voyage",
      "frais de voyage",
      "despesas de viagem",
      "note de frais",
    )
  ) {
    return "delete-travel";
  }

  // --- Delete voucher
  if (
    has(t, "slett", "delete", "elimina", "exclua", "löschen", "supprimez", "fjern") &&
    has(t, "bilag", "voucher", "comprobante", "comprovante", "beleg")
  ) {
    return "delete-voucher";
  }

  // --- Travel expense full (with costs/per diem)
  if (
    has(t, "reise", "travel", "viaje", "viagem", "voyage", "frais de voyage") &&
    has(
      t,
      "utgift",
      "cost",
      "diett",
      "per diem",
      "flybillett",
      "flight",
      "taxi",
      "tog",
      "train",
      "hotell",
      "hotel",
      "mat",
      "dagsats",
      "daily rate",
      "gasto",
      "despesa",
      "ausgabe",
      "dépense",
      "taux journalier",
    )
  ) {
    return "travel-expense-full";
  }

  // --- Travel expense simple
  if (
    has(
      t,
      "reiseregning",
      "travel expense",
      "travel report",
      "nota de viaje",
      "relatório de viagem",
      "reisekostenabrechnung",
      "note de frais de voyage",
    ) ||
    (has(t, "reise", "travel") && has(t, "opprett", "create", "registrer", "register"))
  ) {
    return "travel-expense";
  }

  // --- Invoice + payment
  if (
    has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture") &&
    has(
      t,
      "betaling",
      "payment",
      "pago",
      "pagamento",
      "zahlung",
      "paiement",
      "betal",
      "registrer betaling",
      "register payment",
      "registre el pago",
      "registre o pagamento",
      "registrieren sie die zahlung",
    )
  ) {
    return "invoice-payment";
  }

  // --- Invoice + send
  if (
    has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture") &&
    has(
      t,
      "send faktura",
      "send invoice",
      "send på e-post",
      "på e-post",
      "enviar factura",
      "enviar fatura",
      "envoyer la facture",
      "rechnung senden",
    )
  ) {
    return "invoice-send";
  }

  // --- Timesheet / hours
  if (
    has(
      t,
      "timeregistrering",
      "registrer timer",
      "timesheet",
      "register hours",
      "registrar horas",
      "registrar horas",
      "stunden registrieren",
      "enregistrer les heures",
      "tidregistrering",
    )
  ) {
    return "timesheet";
  }

  // --- Project
  if (has(t, "prosjekt", "project", "proyecto", "projeto", "projekt", "projet")) {
    return "project";
  }

  // --- Employee admin
  if (
    has(t, "ansatt", "tilsett", "employee", "empleado", "funcionário", "mitarbeiter", "employé") &&
    has(
      t,
      "administrator",
      "admin",
      "kontoadministrator",
      "administrateur",
      "administrador",
    )
  ) {
    return "employee-admin";
  }

  // --- Update employee
  if (
    has(t, "oppdater", "update", "actualizar", "atualizar", "aktualisieren", "mettre à jour", "endre") &&
    has(t, "ansatt", "tilsett", "employee", "empleado", "funcionário", "mitarbeiter", "employé")
  ) {
    return "update-employee";
  }

  // --- Update customer
  if (
    has(t, "oppdater", "update", "actualizar", "atualizar", "aktualisieren", "mettre à jour", "endre") &&
    has(t, "kunde", "customer", "cliente", "client")
  ) {
    return "update-customer";
  }

  // --- Contact
  if (has(t, "kontaktperson", "contact person", "persona de contacto", "pessoa de contato")) {
    return "contact";
  }

  // --- Invoice (generic — after payment/send variants)
  if (has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture")) {
    return "invoice";
  }

  // --- Employee (after admin variant)
  if (has(t, "ansatt", "tilsett", "employee", "empleado", "funcionário", "mitarbeiter", "employé")) {
    return "employee";
  }

  // --- Customer
  if (has(t, "kunde", "customer", "cliente", "client", "klient")) {
    return "customer";
  }

  // --- Product
  if (has(t, "produkt", "product", "producto", "produto", "produit")) {
    return "product";
  }

  // --- Department
  if (has(t, "avdeling", "department", "departamento", "abteilung", "département")) {
    return "department";
  }

  // --- Voucher
  if (has(t, "bilag", "voucher", "comprobante", "comprovante", "beleg")) {
    return "voucher";
  }

  return "unknown";
}
