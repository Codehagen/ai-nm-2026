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
