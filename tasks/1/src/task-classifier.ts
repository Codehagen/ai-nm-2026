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
  | "supplier"
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

/** Word-boundary match for short tokens that collide as substrings (e.g. "mat" in "format") */
const hasWord = (text: string, ...patterns: string[]) =>
  patterns.some((p) => new RegExp(`(?:^|[\\s,;.!?()"/])${p}(?:$|[\\s,;.!?()"/])`, "i").test(text));

/**
 * Classify a Tripletex task prompt into one of ~20 task types.
 * Order matters: more specific patterns are checked first.
 */
export function classifyTask(prompt: string): TaskType {
  // Strip email addresses to prevent tokens like "faktura@" from triggering rules
  const stripped = prompt.replace(/\S+@\S+\.\S+/g, "<EMAIL>");
  const t = stripped.toLowerCase();

  // --- Salary / Payroll (check early — mentions "employee" but is salary task)
  if (
    has(
      t,
      "lønnskjøring",
      "lønn",
      "lonn",
      "fastlønn",
      "fastlonn",
      "arslonn",
      "årslønn",
      "salary",
      "payroll",
      "gehaltsabrechnung",
      "gehalt",
      "salaire",
      "salario",
      "salário",
      "nómina",
      "folha de pagamento",
      "onboarding",
      "arbeidskontrakt",
      "employment contract",
      "contrato de trabalho",
      "contrat de travail",
      "arbeitsvertrag",
      "contrato de trabajo",
      "tilbud om stilling",
      "tilbudsbrev",
    )
  ) {
    return "salary";
  }

  // --- Analytical/ledger tasks + bank reconciliation (BEFORE supplier-invoice and invoice-payment)
  // These are T3 tasks that need the LLM agent, not the orchestrator.
  if (
    has(
      t,
      // Bank reconciliation
      "bankavstemming", "kontoutskrift", "kontoauszug",
      "bank reconciliation", "bank statement",
      "conciliación bancaria", "extracto bancario",
      "reconciliação bancária", "extrato bancário",
      "rapprochement bancaire", "rapprochez", "relevé bancaire", "releve bancaire",
      // Ledger analysis / cost analysis
      "analice el libro mayor", "analyze the ledger", "analyser hovedboken",
      "analysieren sie das hauptbuch", "analysez le grand livre",
      "costos totales", "total costs increased",
      "kostnadene økte", "kosten gestiegen",
      // Reminder fees / late fees (voucher, not payment)
      "frais de rappel", "purrerente", "reminder fee", "late fee",
      "mahngebühr", "cargo por demora", "taxa de mora",
      // Year-end closing / depreciation
      "clôture annuelle", "year-end closing", "årsavslutning", "årsoppgjør",
      "amortissement", "depreciation", "avskrivning", "abschreibung",
      "monatsabschluss", "monthly closing", "månedsavslutning",
      "rechnungsabgrenzung", "prepaid expense", "periodisering",
      // Error correction
      "fehler im hauptbuch", "errores en el libro", "erros no livro",
      "feil i hovedbok", "erreurs dans le grand livre",
      "korrigere", "correct errors", "corrigir",
    ) ||
    (has(t, "kontoauszug", "kontoutskrift", "bank statement", "relevé") &&
      has(t, "abgleich", "abstimm", "reconcil", "avstemm"))
  ) {
    return "voucher";
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

  // --- Supplier registration (no invoice)
  if (
    has(t, "leverandør", "supplier", "proveedor", "fornecedor", "fournisseur", "lieferant") &&
    !has(t, "faktura", "invoice", "factura", "fatura", "rechnung", "facture")
  ) {
    return "supplier";
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
    (has(
      t,
      "utgift",
      "per diem",
      "flybillett",
      "flight",
      "hotell",
      "hotel",
      "dagsats",
      "daily rate",
      "gasto",
      "despesa",
      "ausgabe",
      "dépense",
      "taux journalier",
      "diett",
    ) ||
    hasWord(t, "cost", "taxi", "tog", "train", "mat"))
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

  // --- Invoice + payment (but not when project is the primary entity)
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
    ) &&
    !has(t, "prosjekt", "project", "proyecto", "projeto", "projekt", "projet")
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
      "stunden registrieren",
      "enregistrer les heures",
      "tidregistrering",
    ) ||
    (has(t, "horas", "timer", "hours", "stunden", "heures") &&
      has(t, "actividad", "activity", "aktivitet", "aktivität", "activité", "prosjekt", "project", "proyecto", "projeto", "projekt", "projet"))
  ) {
    return "timesheet";
  }

  // --- Voucher / accounting dimensions / ledger corrections (BEFORE project)
  if (
    has(t, "dimension", "dimensión", "kostsenter", "kostnadsbærer", "pièce comptable",
      "bilag", "voucher", "comprobante", "comprovante", "beleg",
      "comptabilisez", "buchungsbeleg",
      "hauptbuch", "ledger error", "fehler im hauptbuch",
      "feil i hovedbok", "korrigere bilag", "correct voucher",
      "clôture annuelle", "year-end closing", "årsavslutning", "årsoppgjør",
      "amortissement", "depreciation", "avskrivning")
  ) {
    return "voucher";
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
    (hasWord(t, "kunde") || has(t, "kunden", "kunder", "customer", "cliente", "client"))
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

  // --- Department (before customer — dept names like "Kundeservice" contain "kunde")
  if (has(t, "avdeling", "department", "departamento", "abteilung", "département")) {
    return "department";
  }

  // --- Customer (hasWord for "kunde" to avoid compound words like "Kundeservice";
  //     "kunden"/"kunder" are safe as substring — they're inflected forms, not compound prefixes)
  if (hasWord(t, "kunde") || has(t, "kunden", "kunder", "customer", "cliente", "client", "klient")) {
    return "customer";
  }

  // --- Product
  if (has(t, "produkt", "product", "producto", "produto", "produit")) {
    return "product";
  }

  return "unknown";
}
