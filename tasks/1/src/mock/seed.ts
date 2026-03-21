/**
 * Seed data for fresh Tripletex accounts.
 * Verified against real Tripletex sandbox (2026-03-20).
 */

import type { EntityStore } from "./store.js";

export function seedStore(store: EntityStore): void {
  // Admin employee (every account has one)
  store.seed("employee", 30000001, {
    firstName: "Admin",
    lastName: "Bruker",
    displayName: "Admin Bruker",
    email: "admin@tripletex.no",
    userType: null, // Real API returns null for userType
    dateOfBirth: null,
    employeeNumber: "",
    department: null,
    phoneNumberMobile: "",
    phoneNumberHome: "",
    phoneNumberWork: "",
    nationalIdentityNumber: "",
    bankAccountNumber: "",
    allowInformationRegistration: true,
    isContact: false,
    comments: "",
    address: null,
  });

  // Ledger account 1920 (bank account, starts with empty bankAccountNumber)
  store.seed("account", 30000001, {
    number: 1920,
    name: "Bankinnskudd",
    bankAccountNumber: "",
    vatType: null,
    description: "",
  });

  // Common ledger accounts
  store.seed("account", 30000002, {
    number: 3000,
    name: "Salgsinntekt, avgiftspliktig",
    bankAccountNumber: "",
    vatType: { id: 3 },
    description: "",
  });

  store.seed("account", 30000003, {
    number: 1500,
    name: "Kundefordringer",
    bankAccountNumber: "",
    vatType: null,
    description: "",
  });

  // VAT types (keys match real API: id, version, number, name, percentage, displayName, deductionPercentage, parentType)
  store.seed("vatType", 3, {
    number: 3,
    name: "25 % inngående mva. (høy sats)",
    displayName: "25 % inngående mva. (høy sats)",
    percentage: 25.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  store.seed("vatType", 6, {
    number: 6,
    name: "0 % avgiftsfritt",
    displayName: "0 % avgiftsfritt",
    percentage: 0.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  store.seed("vatType", 1, {
    number: 1,
    name: "Ingen mva-behandling (innkjøp)",
    displayName: "Ingen mva-behandling (innkjøp)",
    percentage: 0.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  store.seed("vatType", 5, {
    number: 5,
    name: "Ingen utgående avgift (innenfor mva-loven)",
    displayName: "Ingen utgående avgift (innenfor mva-loven)",
    percentage: 0.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  store.seed("vatType", 31, {
    number: 31,
    name: "Utgående avgift, middels sats",
    displayName: "Utgående avgift, middels sats",
    percentage: 15.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  store.seed("vatType", 32, {
    number: 32,
    name: "Utgående avgift, lav sats",
    displayName: "Utgående avgift, lav sats",
    percentage: 12.0,
    deductionPercentage: 100.0,
    parentType: null,
  });

  // Salary types
  store.seed("salaryType", 30000001, { number: 2000, name: "Fastlønn", description: "" });
  store.seed("salaryType", 30000002, { number: 2001, name: "Timelønn", description: "" });
  store.seed("salaryType", 30000003, { number: 2002, name: "Bonus", description: "" });
  store.seed("salaryType", 30000004, { number: 2003, name: "Faste tillegg", description: "" });
  store.seed("salaryType", 30000005, { number: 2005, name: "Overtidsgodtgjørelse", description: "" });

  // Travel expense cost categories (verified against sandbox 2026-03-20)
  store.seed("travelExpenseCostCategory", 30000001, { description: "Fly", displayName: "Fly" });
  store.seed("travelExpenseCostCategory", 30000002, { description: "Taxi", displayName: "Taxi" });
  store.seed("travelExpenseCostCategory", 30000003, { description: "Tog", displayName: "Tog" });
  store.seed("travelExpenseCostCategory", 30000004, { description: "Hotell", displayName: "Hotell" });
  store.seed("travelExpenseCostCategory", 30000005, { description: "Mat", displayName: "Mat" });
  store.seed("travelExpenseCostCategory", 30000006, { description: "Parkering", displayName: "Parkering" });
  store.seed("travelExpenseCostCategory", 30000007, { description: "Buss", displayName: "Buss" });
  store.seed("travelExpenseCostCategory", 30000008, { description: "Bomavgift", displayName: "Bomavgift" });
  store.seed("travelExpenseCostCategory", 30000009, { description: "Drivstoff", displayName: "Drivstoff" });
  store.seed("travelExpenseCostCategory", 30000010, { description: "Annen kontorkostnad", displayName: "Annen kontorkostnad" });

  // Travel expense payment types (verified against sandbox 2026-03-20)
  store.seed("travelExpensePaymentType", 30000001, { description: "Privat utlegg", displayName: "Privat utlegg" });

  // Travel expense rate categories for per diem (domestic, 2026)
  store.seed("travelExpenseRateCategory", 30000001, {
    name: "Overnatting over 12 timer - innland",
    type: "PER_DIEM",
    isValidDayTrip: false,
    isValidAccommodation: true,
    isValidDomestic: true,
    isValidForeignTravel: false,
    isRequiresOvernightAccommodation: true,
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
  });
  store.seed("travelExpenseRateCategory", 30000002, {
    name: "Dagsreise 6-12 timer - innland",
    type: "PER_DIEM",
    isValidDayTrip: true,
    isValidAccommodation: false,
    isValidDomestic: true,
    isValidForeignTravel: false,
    isRequiresOvernightAccommodation: false,
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
  });
  store.seed("travelExpenseRateCategory", 30000003, {
    name: "Dagsreise over 12 timer - innland",
    type: "PER_DIEM",
    isValidDayTrip: true,
    isValidAccommodation: false,
    isValidDomestic: true,
    isValidForeignTravel: false,
    isRequiresOvernightAccommodation: false,
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
  });

  // Travel expense rates (per diem rates for 2026)
  store.seed("travelExpenseRate", 30000001, {
    rateCategory: { id: 30000001 },
    zone: null,
    rate: 1012.0,
  });
  store.seed("travelExpenseRate", 30000002, {
    rateCategory: { id: 30000002 },
    zone: null,
    rate: 200.0,
  });
  store.seed("travelExpenseRate", 30000003, {
    rateCategory: { id: 30000003 },
    zone: null,
    rate: 400.0,
  });

  // Additional ledger accounts for supplier invoices
  store.seed("account", 30000004, {
    number: 7300,
    name: "Kontorkostnader",
    bankAccountNumber: "",
    vatType: null,
    description: "",
  });

  store.seed("account", 30000005, {
    number: 2400,
    name: "Leverandørgjeld",
    bankAccountNumber: "",
    vatType: null,
    description: "",
  });

  // Municipality (required for division creation)
  store.seed("municipality", 30000001, {
    name: "Oslo",
    number: "0301",
  });

  // Payment types (matches real sandbox: "Kontant" and "Betalt til bank")
  store.seed("paymentType", 30000001, {
    description: "Kontant",
    displayName: "Kontant",
    debitAccount: { id: 30000001 },
    creditAccount: null,
    vatType: null,
    customer: null,
    supplier: null,
    currencyCode: null,
    currencyId: 0,
    sequence: 0,
  });

  store.seed("paymentType", 30000002, {
    description: "Betalt til bank",
    displayName: "Betalt til bank",
    debitAccount: { id: 30000001 },
    creditAccount: null,
    vatType: null,
    customer: null,
    supplier: null,
    currencyCode: null,
    currencyId: 0,
    sequence: 1,
  });
}
