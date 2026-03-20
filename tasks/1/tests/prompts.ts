/**
 * Benchmark prompts for all known Tripletex task categories.
 * Each prompt defines: the task, optimal API call count, and verification checks.
 *
 * Optimal call counts are the minimum needed with zero errors.
 * The agent's score depends on being close to these numbers.
 */

export interface VerifyCheck {
  /** Entity type to check in the mock store */
  entity: string;
  /** How to find it */
  find: { field: string; value: string | number | boolean } | "any" | "count";
  /** Expected count (for "count" find) */
  expectedCount?: number;
  /** Fields to verify on the found entity */
  expectFields?: Record<string, unknown>;
}

export interface BenchmarkPrompt {
  /** Short identifier */
  id: string;
  /** Task category */
  category: string;
  /** Tier (1, 2, or 3) */
  tier: 1 | 2 | 3;
  /** Language code */
  lang: "nb" | "en" | "es" | "pt" | "nn" | "de" | "fr";
  /** The prompt text */
  prompt: string;
  /** Minimum API calls needed (optimal) */
  optimalCalls: number;
  /** Verification checks against mock state after solve */
  verify: VerifyCheck[];
}

export const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  // ─── Tier 1: Single entity creation ──────────────────────────────

  {
    id: "t1-customer-nb",
    category: "create-customer",
    tier: 1,
    lang: "nb",
    prompt: "Opprett en kunde med navn Fjordlys AS, e-post post@fjordlys.no og organisasjonsnummer 876543210.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Fjordlys AS" },
        expectFields: { email: "post@fjordlys.no", organizationNumber: "876543210", isCustomer: true },
      },
    ],
  },
  {
    id: "t1-customer-en",
    category: "create-customer",
    tier: 1,
    lang: "en",
    prompt: "Create a customer named Alpine Solutions Ltd with email info@alpine.co.uk and organization number 998877665.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Alpine Solutions Ltd" },
        expectFields: { email: "info@alpine.co.uk", organizationNumber: "998877665" },
      },
    ],
  },
  {
    id: "t1-customer-de",
    category: "create-customer",
    tier: 1,
    lang: "de",
    prompt: "Erstellen Sie einen Kunden mit dem Namen Windkraft GmbH, E-Mail info@windkraft.de und Organisationsnummer 918267581.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Windkraft GmbH" },
        expectFields: { email: "info@windkraft.de", organizationNumber: "918267581" },
      },
    ],
  },
  {
    id: "t1-customer-es",
    category: "create-customer",
    tier: 1,
    lang: "es",
    prompt: "Cree un cliente con el nombre Sol del Mar S.L., correo electrónico contacto@soldelmar.es y número de organización 556677889.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Sol del Mar S.L." },
        expectFields: { email: "contacto@soldelmar.es", organizationNumber: "556677889" },
      },
    ],
  },
  {
    id: "t1-product-nb",
    category: "create-product",
    tier: 1,
    lang: "nb",
    prompt: "Opprett et produkt med navn Konsulenttjenester til 1500 kr eks. mva med 25% MVA.",
    optimalCalls: 1,
    verify: [
      {
        entity: "product",
        find: { field: "name", value: "Konsulenttjenester" },
        expectFields: { priceExcludingVatCurrency: 1500 },
      },
    ],
  },
  {
    id: "t1-department-nb",
    category: "create-department",
    tier: 1,
    lang: "nb",
    prompt: "Opprett en avdeling med navn Salg og avdelingsnummer 200.",
    optimalCalls: 1,
    verify: [
      {
        entity: "department",
        find: { field: "name", value: "Salg" },
        expectFields: { departmentNumber: "200" },
      },
    ],
  },

  // ─── Tier 1: Employee (requires department) ──────────────────────

  {
    id: "t1-employee-nb",
    category: "create-employee",
    tier: 1,
    lang: "nb",
    prompt: "Opprett en ansatt med navn Kari Olsen og e-post kari@olsen.no.",
    optimalCalls: 2, // POST /department + POST /employee
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "Kari" },
        expectFields: { lastName: "Olsen", email: "kari@olsen.no" },
      },
    ],
  },
  {
    id: "t1-employee-en",
    category: "create-employee",
    tier: 1,
    lang: "en",
    prompt: "Create an employee named John Smith with email john.smith@company.com.",
    optimalCalls: 2,
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "John" },
        expectFields: { lastName: "Smith", email: "john.smith@company.com" },
      },
    ],
  },
  {
    id: "t1-employee-admin-nb",
    category: "create-employee-admin",
    tier: 1,
    lang: "nb",
    prompt: "Opprett en ansatt med navn Lars Berg, e-post lars@berg.no. Han skal være kontoadministrator.",
    optimalCalls: 3, // POST /department + POST /employee + PUT entitlement
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "Lars" },
        expectFields: { lastName: "Berg", email: "lars@berg.no" },
      },
    ],
  },
  {
    id: "t1-employee-fr",
    category: "create-employee",
    tier: 1,
    lang: "fr",
    prompt: "Créez un employé nommé Nathan Moreau avec l'adresse e-mail nathan.moreau@example.com.",
    optimalCalls: 2,
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "Nathan" },
        expectFields: { lastName: "Moreau", email: "nathan.moreau@example.com" },
      },
    ],
  },

  // ─── Tier 1: Travel Expense ──────────────────────────────────────

  {
    id: "t1-travel-nb",
    category: "create-travel-expense",
    tier: 1,
    lang: "nb",
    prompt: "Opprett en reiseregning med tittel Kundebesøk Oslo for den første ansatte i kontoen. Avreisedato 2026-03-19, returdato 2026-03-20.",
    optimalCalls: 2, // GET /employee + POST /travelExpense
    verify: [
      {
        entity: "travelExpense",
        find: { field: "title", value: "Kundebesøk Oslo" },
      },
    ],
  },

  // ─── Tier 2: Project (requires admin + customer) ─────────────────

  {
    id: "t2-project-nb",
    category: "create-project",
    tier: 2,
    lang: "nb",
    prompt: "Opprett et prosjekt kalt Nettside Redesign for kunde Nordfjord AS (org.nr 912345678). Prosjektleder: Erik Hansen, erik@hansen.no.",
    optimalCalls: 5, // GET employee + POST department + POST employee + POST customer + POST project
    verify: [
      {
        entity: "project",
        find: { field: "name", value: "Nettside Redesign" },
      },
      {
        entity: "customer",
        find: { field: "name", value: "Nordfjord AS" },
        expectFields: { organizationNumber: "912345678" },
      },
      {
        entity: "employee",
        find: { field: "firstName", value: "Erik" },
        expectFields: { lastName: "Hansen" },
      },
    ],
  },
  {
    id: "t2-project-en",
    category: "create-project",
    tier: 2,
    lang: "en",
    prompt: "Create a project named Cloud Migration for customer TechVentures Inc (org nr 112233445). The project manager should be Anna Lee, anna@techventures.com.",
    optimalCalls: 5,
    verify: [
      {
        entity: "project",
        find: { field: "name", value: "Cloud Migration" },
      },
      {
        entity: "customer",
        find: { field: "name", value: "TechVentures Inc" },
      },
    ],
  },

  // ─── Tier 2: Invoice (full chain) ────────────────────────────────

  {
    id: "t2-invoice-nb",
    category: "create-invoice",
    tier: 2,
    lang: "nb",
    prompt: "Opprett en faktura for kunde Havblikk AS (org.nr 998877123) med produkt Designtjenester til 5000 kr eks. mva (25% mva). Fakturaen skal dateres 2026-03-20 med forfall 2026-04-20.",
    optimalCalls: 6, // POST customer + POST product + POST order + GET ledger/account + PUT ledger/account + POST invoice
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Havblikk AS" },
      },
      {
        entity: "product",
        find: { field: "name", value: "Designtjenester" },
        expectFields: { priceExcludingVatCurrency: 5000 },
      },
      {
        entity: "invoice",
        find: "count",
        expectedCount: 1,
      },
    ],
  },

  // ─── Tier 2: Invoice + Payment ───────────────────────────────────

  {
    id: "t2-invoice-payment-nb",
    category: "invoice-payment",
    tier: 2,
    lang: "nb",
    prompt: "Opprett en faktura for kunde Solvik AS (org.nr 887766554) med produkt Webutvikling til 1200 kr eks. mva (25% mva). Fakturaen skal dateres i dag med forfall om 30 dager. Registrer betaling av fakturaen i dag.",
    optimalCalls: 8, // chain(6) + GET paymentType + PUT /:payment
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Solvik AS" },
      },
      {
        entity: "invoice",
        find: "any",
        expectFields: { isPaid: true },
      },
    ],
  },

  // ─── Tier 2: Invoice + Send ──────────────────────────────────────

  {
    id: "t2-invoice-send-nb",
    category: "invoice-send",
    tier: 2,
    lang: "nb",
    prompt: "Opprett en faktura for kunde Greenfield Corp (org.nr 334455667) med produkt Skylagring til 2500 kr eks. mva (25% mva). Fakturaen dateres 2026-03-20 med forfall 2026-04-20. Send fakturaen på e-post.",
    optimalCalls: 7, // chain(6) + PUT /:send
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Greenfield Corp" },
      },
      {
        entity: "invoice",
        find: "any",
        expectFields: { isSent: true },
      },
    ],
  },

  // ─── Tier 2: Delete Travel Expense ───────────────────────────────

  {
    id: "t2-delete-travel-nb",
    category: "delete-travel-expense",
    tier: 2,
    lang: "nb",
    prompt: "Slett reiseregningen med tittel Kundebesøk Oslo.",
    optimalCalls: 2, // GET /travelExpense + DELETE /travelExpense/:id
    verify: [
      {
        entity: "travelExpense",
        find: "count",
        expectedCount: 0,
      },
    ],
  },

  // ─── Tier 2: Credit Note ─────────────────────────────────────────

  {
    id: "t2-credit-note-nb",
    category: "create-credit-note",
    tier: 2,
    lang: "nb",
    prompt: "Opprett en kreditnota for den siste fakturaen.",
    optimalCalls: 2, // GET /invoice + POST /invoice/:id/:createCreditNote
    verify: [
      {
        entity: "invoice",
        find: { field: "isCreditNote", value: true },
      },
    ],
  },

  // ─── Tier 2: Invoice (English) ───────────────────────────────────

  {
    id: "t2-invoice-en",
    category: "create-invoice",
    tier: 2,
    lang: "en",
    prompt: "Create an invoice for customer Ridgepoint Ltd (org nr 987409339) with product Software License at 8000 NOK excl. VAT (25% VAT). Invoice date 2026-03-20, due date 2026-04-20.",
    optimalCalls: 6,
    verify: [
      { entity: "customer", find: { field: "name", value: "Ridgepoint Ltd" } },
      { entity: "product", find: { field: "name", value: "Software License" } },
      { entity: "invoice", find: "any" },
    ],
  },

  // ─── Tier 2: Invoice + Payment (English) ─────────────────────────

  {
    id: "t2-invoice-payment-en",
    category: "invoice-payment",
    tier: 2,
    lang: "en",
    prompt: "Create an invoice for customer Oakwood Corp (org nr 445566778) with product Data Analysis at 3200 NOK excl. VAT (25% VAT). Invoice date today, due in 14 days. Register payment of the invoice today.",
    optimalCalls: 8,
    verify: [
      { entity: "customer", find: { field: "name", value: "Oakwood Corp" } },
      { entity: "invoice", find: "any", expectFields: { isPaid: true } },
    ],
  },

  // ─── Tier 2: Delete Travel Expense (English) ────────────────────

  {
    id: "t2-delete-travel-en",
    category: "delete-travel-expense",
    tier: 2,
    lang: "en",
    prompt: "Delete the travel expense report titled Client Visit Bergen.",
    optimalCalls: 2,
    verify: [
      { entity: "travelExpense", find: "count", expectedCount: 0 },
    ],
  },

  // ─── Tier 2: Credit Note (English) ──────────────────────────────

  {
    id: "t2-credit-note-en",
    category: "create-credit-note",
    tier: 2,
    lang: "en",
    prompt: "Create a credit note for the most recent invoice.",
    optimalCalls: 2,
    verify: [
      { entity: "invoice", find: { field: "isCreditNote", value: true } },
    ],
  },

  // ─── Tier 2: Invoice + Payment (German) ─────────────────────────

  {
    id: "t2-invoice-payment-de",
    category: "invoice-payment",
    tier: 2,
    lang: "de",
    prompt: "Erstellen Sie eine Rechnung für den Kunden Bergwerk AG (Org.-Nr. 667788990) mit dem Produkt IT-Beratung zu 4500 NOK exkl. MwSt. (25% MwSt.). Rechnungsdatum heute, Fälligkeit in 30 Tagen. Registrieren Sie die Zahlung der Rechnung heute.",
    optimalCalls: 8,
    verify: [
      { entity: "customer", find: { field: "name", value: "Bergwerk AG" } },
      { entity: "invoice", find: "any", expectFields: { isPaid: true } },
    ],
  },

  // ─── Tier 2: Project (Spanish) ──────────────────────────────────

  {
    id: "t2-project-es",
    category: "create-project",
    tier: 2,
    lang: "es",
    prompt: "Cree un proyecto llamado Migración Cloud para el cliente Sol Digital S.L. (org. nr 223344556). El gerente del proyecto debe ser María López, maria@soldigital.es.",
    optimalCalls: 5,
    verify: [
      { entity: "project", find: { field: "name", value: "Migración Cloud" } },
      { entity: "customer", find: { field: "name", value: "Sol Digital S.L." } },
    ],
  },

  // ─── Tier 2: Delete Travel Expense (Portuguese) ─────────────────

  {
    id: "t2-delete-travel-pt",
    category: "delete-travel-expense",
    tier: 2,
    lang: "pt",
    prompt: "Exclua o relatório de despesas de viagem com o título Visita ao Cliente Lisboa.",
    optimalCalls: 2,
    verify: [
      { entity: "travelExpense", find: "count", expectedCount: 0 },
    ],
  },

  // ─── Tier 1: Employee (Portuguese) ──────────────────────────────

  {
    id: "t1-employee-pt",
    category: "create-employee",
    tier: 1,
    lang: "pt",
    prompt: "Crie um funcionário com o nome Rita Almeida e e-mail rita.almeida@example.org.",
    optimalCalls: 2,
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "Rita" },
        expectFields: { lastName: "Almeida", email: "rita.almeida@example.org" },
      },
    ],
  },

  // ─── Tier 1: Employee (German) ──────────────────────────────────

  {
    id: "t1-employee-de",
    category: "create-employee",
    tier: 1,
    lang: "de",
    prompt: "Erstellen Sie einen Mitarbeiter mit dem Namen Elias Meyer und der E-Mail-Adresse elias.meyer@example.org.",
    optimalCalls: 2,
    verify: [
      {
        entity: "employee",
        find: { field: "firstName", value: "Elias" },
        expectFields: { lastName: "Meyer", email: "elias.meyer@example.org" },
      },
    ],
  },

  // ─── Tier 1: Customer (French) ──────────────────────────────────

  {
    id: "t1-customer-fr",
    category: "create-customer",
    tier: 1,
    lang: "fr",
    prompt: "Créez un client nommé Lumière SARL avec l'adresse e-mail contact@lumiere.fr et le numéro d'organisation 556677889.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Lumière SARL" },
        expectFields: { email: "contact@lumiere.fr", organizationNumber: "556677889" },
      },
    ],
  },

  // ─── Tier 2: Multi-line invoice with different VAT rates ─────────

  {
    id: "t2-invoice-multiline-es",
    category: "invoice-multiline",
    tier: 2,
    lang: "es",
    prompt: 'Crea una factura para el cliente Río Verde SL (org. nº 863477905) con tres líneas de producto: Desarrollo de sistemas (2376) a 12000 NOK con 25 % IVA, Asesoría de datos (1496) a 13450 NOK con 15 % IVA (alimentos), y Mantenimiento (4543) a 12050 NOK con 0 % IVA (exento).',
    optimalCalls: 8, // GET ledger + PUT ledger + POST customer + POST product x3 + POST order + POST invoice
    verify: [
      { entity: "customer", find: { field: "name", value: "Río Verde SL" } },
      { entity: "product", find: { field: "name", value: "Desarrollo de sistemas" } },
      { entity: "product", find: { field: "name", value: "Asesoría de datos" } },
      { entity: "product", find: { field: "name", value: "Mantenimiento" } },
      { entity: "invoice", find: "any" },
    ],
  },

  {
    id: "t2-invoice-multiline-nb",
    category: "invoice-multiline",
    tier: 2,
    lang: "nb",
    prompt: 'Opprett en faktura for kunde Fjelltopp AS (org.nr 776655443) med tre produktlinjer: Konsulenttjenester til 8000 NOK eks. mva (25% mva), Catering til 5000 NOK eks. mva (15% mva næringsmiddel), og Frakt til 2000 NOK eks. mva (0% mva avgiftsfri).',
    optimalCalls: 8,
    verify: [
      { entity: "customer", find: { field: "name", value: "Fjelltopp AS" } },
      { entity: "product", find: { field: "name", value: "Konsulenttjenester" } },
      { entity: "product", find: { field: "name", value: "Catering" } },
      { entity: "product", find: { field: "name", value: "Frakt" } },
      { entity: "invoice", find: "any" },
    ],
  },

  // ─── Tier 2: Order → Invoice → Payment (German, product numbers) ─

  {
    id: "t2-order-invoice-payment-de",
    category: "order-invoice-payment",
    tier: 2,
    lang: "de",
    prompt: 'Erstellen Sie einen Auftrag für den Kunden Sonnental GmbH (Org.-Nr. 904562262) mit den Produkten Netzwerkdienst (5874) zu 9150 NOK und Wartung (8734) zu 22150 NOK. Wandeln Sie den Auftrag in eine Rechnung um und registrieren Sie die vollständige Zahlung.',
    optimalCalls: 8, // POST customer + POST product x2 + POST order + GET ledger + PUT ledger + POST invoice + GET paymentType + PUT /:payment = but ledger might be set = 8
    verify: [
      { entity: "customer", find: { field: "name", value: "Sonnental GmbH" }, expectFields: { organizationNumber: "904562262" } },
      { entity: "product", find: { field: "name", value: "Netzwerkdienst" } },
      { entity: "product", find: { field: "name", value: "Wartung" } },
      { entity: "invoice", find: "any", expectFields: { isPaid: true } },
    ],
  },

  // ─── Tier 2/3: Project with fixed price + milestone invoice ──────

  {
    id: "t2-project-fixedprice-en",
    category: "project-fixed-price-invoice",
    tier: 2,
    lang: "en",
    prompt: 'Set a fixed price of 135300 NOK on the project "CRM Integration" for Greenfield Ltd (org no. 989358626). The project manager is Daniel Johnson (daniel.johnson@example.org). Invoice the customer for 33% of the fixed price as a milestone payment.',
    optimalCalls: 9, // POST dept + POST employee + GET employee(admin) + POST customer + POST project + POST product + GET ledger + PUT ledger + POST order + POST invoice = 10, but can skip ledger if already set
    verify: [
      { entity: "project", find: { field: "name", value: "CRM Integration" } },
      { entity: "customer", find: { field: "name", value: "Greenfield Ltd" }, expectFields: { organizationNumber: "989358626" } },
      { entity: "employee", find: { field: "firstName", value: "Daniel" }, expectFields: { lastName: "Johnson" } },
      { entity: "invoice", find: "any" },
    ],
  },

  // ─── Multi-language: same task, different languages ──────────────

  {
    id: "t1-customer-pt",
    category: "create-customer",
    tier: 1,
    lang: "pt",
    prompt: "Crie um cliente com o nome Floresta Lda, e-mail post@floresta.no e número de organização 893475656.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Floresta Lda" },
        expectFields: { email: "post@floresta.no", organizationNumber: "893475656" },
      },
    ],
  },
  {
    id: "t1-customer-nn",
    category: "create-customer",
    tier: 1,
    lang: "nn",
    prompt: "Opprett ein kunde med namn Bølgekraft AS, e-post post@blgekraft.no og organisasjonsnummer 812297848.",
    optimalCalls: 1,
    verify: [
      {
        entity: "customer",
        find: { field: "name", value: "Bølgekraft AS" },
        expectFields: { email: "post@blgekraft.no", organizationNumber: "812297848" },
      },
    ],
  },
];

/** Pre-seed data needed for delete/credit-note tasks (applied before the prompt is sent) */
export interface PreSeed {
  entity: string;
  data: Record<string, unknown>;
}

export const PRESEED: Record<string, PreSeed[]> = {
  "t2-delete-travel-nb": [
    {
      entity: "travelExpense",
      data: { employee: { id: 30000001 }, title: "Kundebesøk Oslo", departureDate: "2026-03-19", returnDate: "2026-03-20" },
    },
  ],
  "t2-delete-travel-en": [
    {
      entity: "travelExpense",
      data: { employee: { id: 30000001 }, title: "Client Visit Bergen", departureDate: "2026-03-18", returnDate: "2026-03-19" },
    },
  ],
  "t2-delete-travel-pt": [
    {
      entity: "travelExpense",
      data: { employee: { id: 30000001 }, title: "Visita ao Cliente Lisboa", departureDate: "2026-03-17", returnDate: "2026-03-18" },
    },
  ],
  "t2-credit-note-nb": [
    { entity: "customer", data: { name: "CreditTest AS", isCustomer: true } },
    { entity: "product", data: { name: "TestProd", priceExcludingVatCurrency: 1000, vatType: { id: 3 } } },
    // Order and invoice will reference IDs from the above — handled in benchmark runner
  ],
  "t2-credit-note-en": [
    { entity: "customer", data: { name: "CreditTest EN Ltd", isCustomer: true } },
    { entity: "product", data: { name: "TestProdEN", priceExcludingVatCurrency: 2000, vatType: { id: 3 } } },
  ],
};
