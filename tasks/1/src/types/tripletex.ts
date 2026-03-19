/**
 * Auto-generated TypeScript types from Tripletex OpenAPI spec v2.75.00
 * Generated on: 2026-03-19
 * Source: openapi.json
 *
 * DO NOT EDIT MANUALLY - regenerate from the OpenAPI spec instead.
 */

/** Link to individual accommodation allowances. */
export interface AccommodationAllowance {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  travelExpense?: TravelExpense;
  rateType?: TravelExpenseRate;
  rateCategory?: TravelExpenseRateCategory;
  zone?: string;
  location?: string;
  address?: string;
  count?: number;
  rate?: number;
  amount?: number;
}

export interface Account {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  number?: number;
  /** number pretty */
  readonly numberPretty?: string;
  name?: string;
  description?: string;
  readonly type?: 'ASSETS' | 'EQUITY' | 'LIABILITIES' | 'OPERATING_REVENUES' | 'OPERATING_EXPENSES' | 'INVESTMENT_INCOME' | 'COST_OF_CAPITAL' | 'TAX_ON_ORDINARY_ACTIVITIES' | 'EXTRAORDINARY_INCOME' | 'EXTRAORDINARY_COST' | 'TAX_ON_EXTRAORDINARY_ACTIVITIES' | 'ANNUAL_RESULT' | 'TRANSFERS_AND_ALLOCATIONS';
  /** List of legal vat types for this account. */
  readonly legalVatTypes?: VatType[];
  /** Supported ledger types, default is GENERAL. Only available for customers with the module multiple ledgers. */
  ledgerType?: 'GENERAL' | 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE' | 'ASSET';
  /** The balance group for this account. */
  readonly balanceGroup?: string;
  vatType?: VatType;
  /** True if all entries on this account must have the vat type given by vatType. */
  vatLocked?: boolean;
  currency?: Currency;
  /** True if it should be possible to close entries on this account and it is possible to filter on open entries. */
  isCloseable?: boolean;
  /** True if this account is applicable for supplier invoice registration. */
  isApplicableForSupplierInvoice?: boolean;
  /** True if this account must be reconciled before the accounting period closure. */
  requireReconciliation?: boolean;
  /** Inactive accounts will not show up in UI lists. */
  isInactive?: boolean;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
  bankAccountCountry?: Country;
  bankName?: string;
  bankAccountIBAN?: string;
  bankAccountSWIFT?: string;
  /** SAF-T 1.0 standard account ID for account. It will be given a default value based on account number if empty. */
  saftCode?: string;
  /** SAF-T 1.3 groupingCode for the account. It will be given a default value based on account number if empty. */
  groupingCode?: string;
  displayName?: string;
  /** Posting against this account requires department. */
  requiresDepartment?: boolean;
  /** Posting against this account requires project. */
  requiresProject?: boolean;
  invoicingDepartment?: Department;
  isPostingsExist?: boolean;
  quantityType1?: ProductUnit;
  quantityType2?: ProductUnit;
  department?: Department;
}

/** Free dimensions for the project connected to the order. */
export interface AccountingDimensionValue {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  /** The name of the value. */
  displayName?: string;
  /** The name and number of the value. */
  readonly nameAndNumber?: string;
  /** The index of the dimension this value belongs to. */
  dimensionIndex?: number;
  /** Indicates if the value is active. */
  active?: boolean;
  /** The number of the value, which can consist of letters and numbers. */
  number?: string;
  /** Indicates if the value should be shown in voucher registration. */
  showInVoucherRegistration?: boolean;
  /** The position of the value in the list of values for the dimension. */
  position?: number;
}

/** Add existing project activity or create new project specific activity */
export interface Activity {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  description?: string;
  /** PROJECT_SPECIFIC_ACTIVITY are made via project/projectActivity, as they must be part of a project. */
  activityType?: 'GENERAL_ACTIVITY' | 'PROJECT_GENERAL_ACTIVITY' | 'PROJECT_SPECIFIC_ACTIVITY' | 'TASK';
  /** Manipulate these with ActivityType */
  readonly isProjectActivity?: boolean;
  /** Manipulate these with ActivityType */
  readonly isGeneral?: boolean;
  /** Manipulate these with ActivityType */
  readonly isTask?: boolean;
  readonly isDisabled?: boolean;
  isChargeable?: boolean;
  rate?: number;
  costPercentage?: number;
  displayName?: string;
  readonly deletable?: boolean;
}

/** Address tied to the employee */
export interface Address {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: Country;
  readonly displayName?: string;
  readonly addressAsString?: string;
  readonly displayNameInklMatrikkel?: string;
  knr?: number;
  gnr?: number;
  bnr?: number;
  fnr?: number;
  snr?: number;
  unitNumber?: string;
}

/** The asset ('anleggsmiddel' / 'eiendel') connected to this posting */
export interface Asset {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  displayName?: string;
  description?: string;
  dateOfAcquisition?: string;
  /** Acquisition cost. */
  acquisitionCost?: number;
  account?: Account;
  /** Incoming balance for the asset. */
  incomingBalance?: number;
  /** Lifetime in months for the asset. */
  lifetime?: number;
  /** Status */
  readonly status?: 'UNKNOWN' | 'MANUAL' | 'NO_DEPRECIATION' | 'INVALID_DATE' | 'MISSING_TRANS_TYPE' | 'MISSING_INFO' | 'READY_TO_DEPRECIATE' | 'CORRECTION_NEEDED' | 'COMPLETED' | 'REST_VALUE' | 'NOTHING_TO_DEPRECIATE';
  depreciationRemainingValue?: number;
  depreciationAccount?: Account;
  hasHistoryFromExternalSystem?: boolean;
  externalLastDepreciation?: string;
  externalLastAccountedValue?: number;
  externalAccumulatedDepreciation?: number;
  /** Depreciation method */
  depreciationMethod?: 'MANUAL' | 'TAX_RELATED' | 'STRAIGHT_LINE' | 'CUSTOMIZED_AMOUNT' | 'NO_DEPRECIATION';
  depreciationFrom?: string;
  accumulatedDepreciation?: number;
  depreciationRate?: number;
  department?: Department;
  project?: Project;
  readonly startingBalance?: number;
  readonly balanceIn?: number;
  readonly balanceOut?: number;
  readonly balanceChange?: number;
  readonly depreciationBasis?: number;
  readonly numberOfMonths?: number;
  readonly annualDepreciation?: number;
  readonly depreciationDiscrepancy?: number;
  readonly depreciationAmount?: number;
  readonly totalDepreciationAmount?: number;
  /** Improvements */
  readonly improvements?: number;
  /** New hires */
  readonly newHires?: number;
  /** Sales and other realizations */
  readonly salesAndOtherRealizations?: number;
  saleDate?: string;
  /** Accounting related profit or loss */
  readonly accountingRelatedProfitOrLoss?: number;
}

/** [PILOT] Attestation associated with the attestation object */
export interface Attestation {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  type?: 'SUPPLIER_INVOICE' | 'TRAVELS_AND_EXPENSES';
  /** Levels tied to this Attestation. */
  levels?: AttestationLevel[];
}

/** Approvers tied to this Attestation Level. */
export interface AttestationApprover {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  attestationLevel?: AttestationLevel;
  enumRole?: 'NO_ROLE' | 'PROJECT_MANAGER' | 'DEPARTMENT_MANAGER' | 'EMPLOYEE_APPROVER' | 'PROJECT_APPROVER';
  employee?: Employee;
}

/** Levels tied to this Attestation. */
export interface AttestationLevel {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  attestation?: Attestation;
  sequence?: number;
  requiredApproverCount?: number;
  minAmount?: number;
  /** Approvers tied to this Attestation Level. */
  attestationApprovers?: AttestationApprover[];
}

/** [PILOT] List of attestation steps associated with the attestation object */
export interface AttestationStep {
  readonly title?: string;
  readonly sequence?: number;
  readonly requiredApproverCount?: number;
  readonly status?: 'SKIPPED' | 'REJECTED' | 'NEITHER' | 'APPROVED' | 'CURRENT';
  attestationStepApprovers?: AttestationStepApprover[];
  /** When the next automatic notification will be sent for this step */
  notificationDate?: string;
}

/** DTO for Attestation Step Approver */
export interface AttestationStepApprover {
  employee?: Employee;
  readonly attestationApproverActionType?: 'REJECTION' | 'NEITHER' | 'APPROVAL' | 'OVERRIDE_APPROVAL';
  readonly comment?: string;
  timeStamp?: string;
  strikethrough?: boolean;
}

export interface Change {
  readonly employeeId?: number;
  readonly timestamp?: string;
  readonly changeType?: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOCKED' | 'REOPENED' | 'DO_NOT_SHOW';
}

export interface CloseGroup {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  date?: string;
  readonly postings?: Posting[];
}

/** Vendor of the product */
export interface Company {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  readonly displayName?: string;
  startDate?: string;
  endDate?: string;
  organizationNumber?: string;
  email?: string;
  phoneNumber?: string;
  phoneNumberMobile?: string;
  faxNumber?: string;
  address?: Address;
  type?: 'NONE' | 'ENK' | 'AS' | 'NUF' | 'ANS' | 'DA' | 'PRE' | 'KS' | 'ASA' | 'BBL' | 'BRL' | 'GFS' | 'SPA' | 'SF' | 'IKS' | 'KF_FKF' | 'FCD' | 'EOFG' | 'BA' | 'STI' | 'ORG' | 'ESEK' | 'SA' | 'SAM' | 'BO' | 'VPFO' | 'OS' | 'FLI' | 'Other';
  currency?: Currency;
  readonly accountantOrSimilar?: boolean;
  /** If the company was migrated from another system, this field will contain the name of the system it was migrated from. */
  readonly companyMigration?: 'NONE' | 'AGRO';
  readonly invoiceShowDeliveryDate?: boolean;
}

/** List of bankAccount for this supplier */
export interface CompanyBankAccountPresentation {
  /** Iban-number */
  iban?: string;
  /** Bban-number */
  bban?: string;
  /** BIC/SWIFT for this bankaccount */
  bic?: string;
  country?: Country;
  readonly provider?: 'NETS' | 'AUTOPAY';
}

/** If the contact is not an employee */
export interface Contact {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  phoneNumberMobileCountry?: Country;
  phoneNumberMobile?: string;
  phoneNumberWork?: string;
  customer?: Customer;
  department?: Department;
  isInactive?: boolean;
}

/** Link to individual costs. */
export interface Cost {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  travelExpense?: TravelExpense;
  vatType?: VatType;
  currency?: Currency;
  costCategory?: TravelCostCategory;
  paymentType?: TravelPaymentType;
  category?: string;
  comments?: string;
  rate?: number;
  amountCurrencyIncVat?: number;
  amountNOKInclVAT?: number;
  readonly amountNOKInclVATLow?: number;
  readonly amountNOKInclVATMedium?: number;
  readonly amountNOKInclVATHigh?: number;
  readonly isPaidByEmployee?: boolean;
  isChargeable?: boolean;
  date?: string;
  /** Link to individual expense participant. */
  participants?: CostParticipant[];
  predictions?: Record<string, Prediction>;
}

/** Link to individual expense participant. */
export interface CostParticipant {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  displayName?: string;
  /** Optional employee id in case the participant is an employee */
  employeeId?: number;
  cost?: Cost;
}

export interface Country {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  readonly name?: string;
  readonly displayName?: string;
  /** The ISO 3166-1 Alpha2 code of the country (2 letters). https://en.wikipedia.org/wiki/ISO_3166-1 */
  readonly isoAlpha2Code?: string;
  /** The ISO 3166-1 Alpha3 code of the country (3 letters). https://en.wikipedia.org/wiki/ISO_3166-1 */
  readonly isoAlpha3Code?: string;
  /** The ISO 3166-1 numeric code of the country (3 digits). https://en.wikipedia.org/wiki/ISO_3166-1 */
  readonly isoNumericCode?: string;
}

export interface Currency {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  code?: string;
  description?: string;
  factor?: number;
  displayName?: string;
  isDisabled?: boolean;
}

export interface Customer {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  organizationNumber?: string;
  globalLocationNumber?: number;
  supplierNumber?: number;
  customerNumber?: number;
  /** Defines if the customer is also a supplier. */
  isSupplier?: boolean;
  readonly isCustomer?: boolean;
  isInactive?: boolean;
  accountManager?: Employee;
  department?: Department;
  email?: string;
  invoiceEmail?: string;
  /** The email address of the customer where the noticing emails are sent in case of an overdue */
  overdueNoticeEmail?: string;
  bankAccounts?: string[];
  phoneNumber?: string;
  phoneNumberMobile?: string;
  description?: string;
  language?: 'NO' | 'EN';
  displayName?: string;
  isPrivateIndividual?: boolean;
  /** Enables various orders on one customer invoice. */
  singleCustomerInvoice?: boolean;
  /** Define the invoicing method for the customer.<br>EMAIL: Send invoices as email.<br>EHF: Send invoices as EHF.<br>EFAKTURA: Send invoices as EFAKTURA.<br>AVTALEGIRO: Send invoices as AVTALEGIRO.<br>VIPPS: Send invoices through VIPPS.<br>PAPER: Send invoices as paper invoice.<br>MANUAL: User will have to send invocie manually.<br> */
  invoiceSendMethod?: 'EMAIL' | 'EHF' | 'EFAKTURA' | 'AVTALEGIRO' | 'VIPPS' | 'PAPER' | 'MANUAL';
  /** Define the invoice attachment type for emailing to the customer.<br>LINK: Send invoice as link in email.<br>ATTACHMENT: Send invoice as attachment in email.<br> */
  emailAttachmentType?: 'LINK' | 'ATTACHMENT';
  postalAddress?: Address;
  physicalAddress?: Address;
  deliveryAddress?: DeliveryAddress;
  category1?: CustomerCategory;
  category2?: CustomerCategory;
  category3?: CustomerCategory;
  /** Number of days/months in which invoices created from this customer is due */
  invoicesDueIn?: number;
  /** Set the time unit of invoicesDueIn. The special case RECURRING_DAY_OF_MONTH enables the due date to be fixed to a specific day of the month, in this case the fixed due date will automatically be set as standard on all invoices created from this customer. Note that when RECURRING_DAY_OF_MONTH is set, the due date will be set to the last day of month if "31" is set in invoicesDueIn. */
  invoicesDueInType?: 'DAYS' | 'MONTHS' | 'RECURRING_DAY_OF_MONTH';
  currency?: Currency;
  bankAccountPresentation?: CompanyBankAccountPresentation[];
  ledgerAccount?: Account;
  /** If true; send this customers invoices to factoring (if factoring is turned on in account). */
  isFactoring?: boolean;
  /** Is sms-notification on/off */
  invoiceSendSMSNotification?: boolean;
  /** Send SMS-notification to this number. Must be a norwegian phone number */
  invoiceSMSNotificationNumber?: string;
  /** Has automatic soft reminders enabled for this customer. */
  isAutomaticSoftReminderEnabled?: boolean;
  /** Has automatic reminders enabled for this customer. */
  isAutomaticReminderEnabled?: boolean;
  /** Has automatic notice of debt collection enabled for this customer. */
  isAutomaticNoticeOfDebtCollectionEnabled?: boolean;
  /** Default discount percentage for this customer. */
  discountPercentage?: number;
  website?: string;
}

/** Category 3 of this supplier */
export interface CustomerCategory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  description?: string;
  type?: number;
  displayName?: string;
}

/** Delivery address of this order. This can be a new or existing address
(useful to know, especially if the delivery is to a private person: if 'deliveryAddress.name' is set, we ignore the state of 'customer.id') */
export interface DeliveryAddress {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  addressLine1?: string;
  addressLine2?: string;
  postalCode?: string;
  city?: string;
  country?: Country;
  readonly displayName?: string;
  readonly addressAsString?: string;
  readonly displayNameInklMatrikkel?: string;
  knr?: number;
  gnr?: number;
  bnr?: number;
  fnr?: number;
  snr?: number;
  unitNumber?: string;
  name?: string;
  customerVendor?: Company;
}

/** The department for this account. If multiple industries are activated, all postings on this account will be towards this department. If multiple industries are not activated, it is ignored. */
export interface Department {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  departmentNumber?: string;
  departmentManager?: Employee;
  readonly displayName?: string;
  isInactive?: boolean;
  /** The business activity type for this department. Business activity types can be used to separate between different tax categories, and between general and primary VAT reports.  A posting done with a given departmentId, will belong to the business activity type defined on the department. */
  readonly businessActivityTypeId?: number;
}

export interface DiscountGroup {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  readonly number?: string;
  readonly nameAndNumber?: string;
}

export interface Division {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  displayName?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  organizationNumber?: string;
  municipalityDate?: string;
  municipality?: Municipality;
}

/** [BETA] Attachments belonging to this order */
export interface Document {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  /** The name of the document. */
  fileName?: string;
  /** The size of the document in bytes. */
  readonly size?: number;
  /** Type of the document */
  readonly mimeType?: string;
}

/** Link to individual mileage stops. */
export interface DrivingStop {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  sortIndex?: number;
  type?: number;
  mileageAllowance?: MileageAllowance;
}

export interface Employee {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  firstName?: string;
  lastName?: string;
  readonly displayName?: string;
  employeeNumber?: string;
  dateOfBirth?: string;
  email?: string;
  phoneNumberMobileCountry?: Country;
  phoneNumberMobile?: string;
  phoneNumberHome?: string;
  phoneNumberWork?: string;
  nationalIdentityNumber?: string;
  dnumber?: string;
  internationalId?: InternationalId;
  bankAccountNumber?: string;
  /** IBAN field */
  iban?: string;
  /** Bic (swift) field */
  bic?: string;
  /** Country of creditor bank field */
  creditorBankCountryId?: number;
  /** UsesAbroadPayment field. Determines if we should use domestic or abroad remittance. To be able to use abroad remittance, one has to: 1: have Autopay 2: have valid combination of the fields Iban, Bic (swift) and Country of creditor bank.  */
  usesAbroadPayment?: boolean;
  /** Define the employee's user type.<br>STANDARD: Reduced access. Users with limited system entitlements.<br>EXTENDED: Users can be given all system entitlements.<br>NO_ACCESS: User with no log on access.<br>Users with access to Tripletex must confirm the email address. */
  userType?: 'STANDARD' | 'EXTENDED' | 'NO_ACCESS';
  /** Determines if salary information can be registered on the user including hours, travel expenses and employee expenses. The user may also be selected as a project member on projects. */
  readonly allowInformationRegistration?: boolean;
  /** Determines if the employee is a contact (external) in the company. */
  isContact?: boolean;
  /** True if this Employee object represents an accounting or auditor office */
  readonly isProxy?: boolean;
  comments?: string;
  address?: Address;
  department?: Department;
  employments?: Employment[];
  holidayAllowanceEarned?: HolidayAllowanceEarned;
  employeeCategory?: EmployeeCategory;
  readonly isAuthProjectOverviewURL?: boolean;
  readonly pictureId?: number;
  readonly companyId?: number;
  readonly vismaConnect2FAactive?: boolean;
}

export interface EmployeeCategory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  displayName?: string;
  name?: string;
  number?: string;
  description?: string;
}

/** Employments tied to the employee */
export interface Employment {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  employee?: Employee;
  /** Existing employment ID used by the current accounting system */
  employmentId?: string;
  startDate?: string;
  endDate?: string;
  /** Define the employment end reason. */
  employmentEndReason?: 'EMPLOYMENT_END_EXPIRED' | 'EMPLOYMENT_END_EMPLOYEE' | 'EMPLOYMENT_END_EMPLOYER' | 'EMPLOYMENT_END_WRONGLY_REPORTED' | 'EMPLOYMENT_END_SYSTEM_OR_ACCOUNTANT_CHANGE' | 'EMPLOYMENT_END_INTERNAL_CHANGE';
  division?: Division;
  lastSalaryChangeDate?: string;
  /** Activate pensions and other benefits with no employment relationship. */
  noEmploymentRelationship?: boolean;
  /** Determines if company is main employer for the employee. Default value is true.<br />Some values will be default set if not sent upon creation of employment: <br/> If isMainEmployer is NOT sent and tax deduction code loennFraHovedarbeidsgiver is sent, isMainEmployer will be set to true. <br /> If isMainEmployer is NOT sent and tax deduction code loennFraBiarbeidsgiver is sent, isMainEmployer will be set to false. <br /> If true and deduction code is NOT sent, value of tax deduction code will be set to loennFraHovedarbeidsgiver. <br /> If false and deduction code is NOT sent, value of tax deduction code will be set to loennFraBiarbeidsgiver. <br /> For other types of Tax Deduction Codes, isMainEmployer does not influence anything. */
  isMainEmployer?: boolean;
  /** EMPTY - represents that a tax deduction code is not set on the employment. It is illegal to set the field to this value.  <br /> Default value of this field is loennFraHovedarbeidsgiver or loennFraBiarbeidsgiver depending on boolean isMainEmployer */
  taxDeductionCode?: 'loennFraHovedarbeidsgiver' | 'loennFraBiarbeidsgiver' | 'pensjon' | 'loennTilUtenrikstjenestemann' | 'loennKunTrygdeavgiftTilUtenlandskBorger' | 'loennKunTrygdeavgiftTilUtenlandskBorgerSomGrensegjenger' | 'introduksjonsstoenad' | 'ufoereytelserFraAndre' | '';
  employmentDetails?: EmploymentDetails[];
  /** If true, access to the employee will be removed when the employment ends. <br />This field is part of the Employee object, therefore changing it for one Employment affects all Employments. */
  isRemoveAccessAtEmploymentEnded?: boolean;
  latestSalary?: EmploymentDetails;
}

/** Employment types tied to the employment */
export interface EmploymentDetails {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  employment?: Employment;
  date?: string;
  /** Define the employment type. */
  employmentType?: 'ORDINARY' | 'MARITIME' | 'FREELANCE' | 'NOT_CHOSEN';
  /** Define the employment form. */
  employmentForm?: 'PERMANENT' | 'TEMPORARY' | 'PERMANENT_AND_HIRED_OUT' | 'TEMPORARY_AND_HIRED_OUT' | 'TEMPORARY_ON_CALL' | 'NOT_CHOSEN';
  maritimeEmployment?: MaritimeEmployment;
  /** Define the remuneration type. */
  remunerationType?: 'MONTHLY_WAGE' | 'HOURLY_WAGE' | 'COMMISION_PERCENTAGE' | 'FEE' | 'NOT_CHOSEN' | 'PIECEWORK_WAGE';
  /** Define the working hours scheme type. If you enter a value for SHIFT WORK, you must also enter value for shiftDurationHours */
  workingHoursScheme?: 'NOT_SHIFT' | 'ROUND_THE_CLOCK' | 'SHIFT_365' | 'OFFSHORE_336' | 'CONTINUOUS' | 'OTHER_SHIFT' | 'NOT_CHOSEN';
  shiftDurationHours?: number;
  occupationCode?: OccupationCode;
  percentageOfFullTimeEquivalent?: number;
  annualSalary?: number;
  hourlyWage?: number;
  payrollTaxMunicipalityId?: Municipality;
  readonly monthlySalary?: number;
}

export interface Entitlement {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  employee?: Employee;
  /** Descriptive name for the privilege. Might change between releases. */
  readonly name?: string;
  /** Unique id for the type of privilege. */
  entitlementId?: number;
  customer?: Company;
}

export interface HolidayAllowanceEarned {
  year?: number;
  amount?: number;
  basis?: number;
  amountExtraHolidayWeek?: number;
}

export interface InternationalId {
  /** Define the employee's International Identificator.<br>PASSPORT_NO<br>NATIONAL_INSURANCE_NO<br>TAX_IDENTIFICATION_NO<br>VALUE_ADDED_TAX_IDENTIFICATION_NO */
  intAmeldingType?: 'PASSPORT_NO' | 'NATIONAL_INSURANCE_NO' | 'TAX_IDENTIFICATION_NO' | 'VALUE_ADDED_TAX_IDENTIFICATION_NO';
  country?: Country;
  number?: string;
}

export interface Inventory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  readonly displayName?: string;
  isMainInventory?: boolean;
  isInactive?: boolean;
  description?: string;
  email?: string;
  phone?: string;
  deletable?: boolean;
  address?: Address;
  lastStocking?: string;
  status?: string;
  hasLocations?: boolean;
}

/** Inventory location field -- beta program */
export interface InventoryLocation {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  inventory?: Inventory;
  readonly number?: number;
  name?: string;
  readonly displayName?: string;
  isInactive?: boolean;
  readonly isDeletable?: boolean;
  /** Indicates whether the location can be deactivated based on current stock and usage. */
  readonly canDeactivate?: boolean;
}

/** Invoicing plans tied to the project */
export interface Invoice {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  /** If value is set to 0, the invoice number will be generated. */
  invoiceNumber?: number;
  invoiceDate?: string;
  customer?: Customer;
  /** The id of the original invoice if this is a credit note. */
  readonly creditedInvoice?: number;
  readonly isCredited?: boolean;
  invoiceDueDate?: string;
  /** KID - Kundeidentifikasjonsnummer. */
  kid?: string;
  /** Comment text for the invoice. This was specified on the order as invoiceComment. */
  readonly invoiceComment?: string;
  /** Comment text for the specific invoice. */
  comment?: string;
  /** Related orders. Only one order per invoice is supported at the moment. */
  orders?: Order[];
  /** Orderlines connected to the invoice. */
  readonly orderLines?: OrderLine[];
  /** Travel reports connected to the invoice. */
  readonly travelReports?: TravelExpense[];
  /** ProjectInvoiceDetails contains additional information about the invoice, in particular invoices for projects. It contains information about the charged project, the fee amount, extra percent and amount, extra costs, travel expenses, invoice and project comments, akonto amount and values determining if extra costs, akonto and hours should be included. ProjectInvoiceDetails is an object which represents the relation between an invoice and a Project, Orderline and OrderOut object. */
  readonly projectInvoiceDetails?: ProjectInvoiceDetails[];
  voucher?: Voucher;
  /** The delivery date. */
  readonly deliveryDate?: string;
  /** In the company’s currency, typically NOK. */
  readonly amount?: number;
  /** In the specified currency. */
  readonly amountCurrency?: number;
  /** Amount excluding VAT (NOK). */
  readonly amountExcludingVat?: number;
  /** Amount excluding VAT in the specified currency. */
  readonly amountExcludingVatCurrency?: number;
  /** Amount of round off to nearest integer. */
  readonly amountRoundoff?: number;
  /** Amount of round off to nearest integer in the specified currency. */
  readonly amountRoundoffCurrency?: number;
  /** The amount outstanding based on the history collection, excluding reminders and any existing remits, in the invoice currency. */
  readonly amountOutstanding?: number;
  /** The amountCurrency outstanding based on the history collection, excluding reminders and any existing remits, in the invoice currency. */
  readonly amountCurrencyOutstanding?: number;
  /** The amount outstanding based on the history collection and including the last reminder and any existing remits. This is the total invoice balance including reminders and remittances, in the invoice currency. */
  readonly amountOutstandingTotal?: number;
  /** The amountCurrency outstanding based on the history collection and including the last reminder and any existing remits. This is the total invoice balance including reminders and remittances, in the invoice currency. */
  readonly amountCurrencyOutstandingTotal?: number;
  /** The sum of all open remittances of the invoice. Remittances are reimbursement payments back to the customer and are therefore relevant to the bookkeeping of the invoice in the accounts. */
  readonly sumRemits?: number;
  currency?: Currency;
  readonly isCreditNote?: boolean;
  readonly isCharged?: boolean;
  readonly isApproved?: boolean;
  /** The invoice postings, which includes a posting for the invoice with a positive amount, and one or more posting for the payments with negative amounts. */
  readonly postings?: Posting[];
  /** Invoice debt collection and reminders. */
  readonly reminders?: Reminder[];
  /** Deprecated Invoice remarks - please use the 'invoiceRemark' instead. */
  invoiceRemarks?: string;
  invoiceRemark?: InvoiceRemark;
  /** [BETA] Optional. Used to specify payment type for prepaid invoices. Payment type can be specified here, or as a parameter to the /invoice API endpoint. */
  paymentTypeId?: number;
  /** [BETA] Optional. Used to specify the prepaid amount of the invoice. The paid amount can be specified here, or as a parameter to the /invoice API endpoint. */
  paidAmount?: number;
  readonly isPeriodizationPossible?: boolean;
  readonly documentId?: number;
  /** [Deprecated] EHF (Peppol) send status. This only shows status for historic EHFs. */
  ehfSendStatus?: 'DO_NOT_SEND' | 'SEND' | 'SENT' | 'SEND_FAILURE_RECIPIENT_NOT_FOUND';
}

/** Invoice remark - automatically stops reminder/notice of debt collection until specified date. */
export interface InvoiceRemark {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  description?: string;
  postponeRemindersTo?: string;
}

export interface Link {
  rel?: 'DELIVER' | 'APPROVE' | 'CREATE_VOUCHER' | 'SEE_ATTESTATION_FLOW' | 'UNDELIVER' | 'UNAPPROVE' | 'OVERRIDE_APPROVE' | 'REJECT' | 'GO_TO_INVOICE' | 'GO_TO_VOUCHER' | 'GO_TO_PAYSLIP' | 'COPY' | 'DELETE';
  type?: 'POST' | 'PUT' | 'GET' | 'DELETE';
  href?: string;
  id?: number;
}

export interface ListResponseAccount {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Account[];
}

export interface ListResponseCustomer {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Customer[];
}

export interface ListResponseDepartment {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Department[];
}

export interface ListResponseEmployee {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Employee[];
}

export interface ListResponseEntitlement {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Entitlement[];
}

export interface ListResponseInvoice {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Invoice[];
}

export interface ListResponseOrder {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Order[];
}

export interface ListResponseOrderLine {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: OrderLine[];
}

export interface ListResponsePosting {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Posting[];
}

export interface ListResponseProduct {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Product[];
}

export interface ListResponseProject {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Project[];
}

export interface ListResponseTravelExpense {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: TravelExpense[];
}

export interface ListResponseVoucher {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Voucher[];
}

export interface MaritimeEmployment {
  /** Define the vessel ID */
  fartoeyId?: string;
  /** Define the date for boarding the vessel */
  paamoenstringsdato?: string;
  /** Define the date for disemarking the vessel */
  avmoenstringsdato?: string;
  /** Number of hours per profession code per boarding */
  antallTimerPerYrkeskodePerMoenstring?: number;
  /** Define the ship register. NIS: Norwegian International Ship Register, NOR: Norwegian Ordinary Ship Register, FOREIGN: Foreign Ship Register.  */
  shipRegister?: 'NIS' | 'NOR' | 'FOREIGN';
  /** Define the ship type. */
  shipType?: 'OTHER' | 'DRILLING_PLATFORM' | 'TOURIST';
  /** Define the trade area. */
  tradeArea?: 'DOMESTIC' | 'FOREIGN';
}

/** Link to individual mileage allowances. */
export interface MileageAllowance {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  travelExpense?: TravelExpense;
  rateType?: TravelExpenseRate;
  rateCategory?: TravelExpenseRateCategory;
  date?: string;
  departureLocation?: string;
  destination?: string;
  km?: number;
  rate?: number;
  amount?: number;
  isCompanyCar?: boolean;
  /** The corresponded number for the vehicleType. Default value = 0. */
  vehicleType?: number;
  /** Link to individual passengers. */
  readonly passengers?: Passenger[];
  passengerSupplement?: MileageAllowance;
  trailerSupplement?: MileageAllowance;
  tollCost?: Cost;
  /** Link to individual mileage stops. */
  readonly drivingStops?: DrivingStop[];
}

export interface Municipality {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  readonly number?: string;
  readonly name?: string;
  readonly county?: string;
  readonly payrollTaxZone?: string;
  readonly displayName?: string;
}

/** To find the right value to enter in this field, you could go to GET /employee/employment/occupationCode to get a list of valid ID's. */
export interface OccupationCode {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  nameNO?: string;
  code?: string;
}

/** Related orders. Only one order per invoice is supported at the moment. */
export interface Order {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  customer?: Customer;
  contact?: Contact;
  attn?: Contact;
  readonly displayName?: string;
  receiverEmail?: string;
  overdueNoticeEmail?: string;
  number?: string;
  reference?: string;
  ourContact?: Contact;
  ourContactEmployee?: Employee;
  department?: Department;
  orderDate?: string;
  project?: Project;
  /** Comment to be displayed in the invoice based on this order. Can be also found in Invoice.invoiceComment on Invoice objects. */
  invoiceComment?: string;
  /** Internal comment to be displayed in order. */
  internalComment?: string;
  currency?: Currency;
  /** Number of days/months in which invoices created from this order is due */
  invoicesDueIn?: number;
  /** Logistics only */
  status?: 'NOT_CHOSEN' | 'NEW' | 'CONFIRMATION_SENT' | 'READY_FOR_PICKING' | 'PICKED' | 'PACKED' | 'READY_FOR_SHIPPING' | 'READY_FOR_INVOICING' | 'INVOICED' | 'CANCELLED';
  /** Set the time unit of invoicesDueIn. The special case RECURRING_DAY_OF_MONTH enables the due date to be fixed to a specific day of the month, in this case the fixed due date will automatically be set as standard on all invoices created from this order. Note that when RECURRING_DAY_OF_MONTH is set, the due date will be set to the last day of month if "31" is set in invoicesDueIn. */
  invoicesDueInType?: 'DAYS' | 'MONTHS' | 'RECURRING_DAY_OF_MONTH';
  /** Show account statement - open posts on invoices created from this order */
  isShowOpenPostsOnInvoices?: boolean;
  /** Denotes if this order is closed. A closed order can no longer be invoiced unless it is opened again. */
  isClosed?: boolean;
  deliveryDate?: string;
  deliveryAddress?: DeliveryAddress;
  deliveryComment?: string;
  isPrioritizeAmountsIncludingVat?: boolean;
  orderLineSorting?: 'ID' | 'PRODUCT' | 'PRODUCT_DESCENDING' | 'CUSTOM';
  /** Order line groups */
  orderGroups?: OrderGroup[];
  /** Order lines tied to the order. New OrderLines may be embedded here, in some endpoints. */
  orderLines?: OrderLine[];
  /** If true, the order is a subscription, which enables periodical invoicing of order lines. First, create an order with isSubscription=true, then approve it for subscription invoicing with the :approveSubscriptionInvoice method. */
  isSubscription?: boolean;
  /** Number of months/years the subscription shall run */
  subscriptionDuration?: number;
  /** The time unit of subscriptionDuration */
  subscriptionDurationType?: 'MONTHS' | 'YEAR';
  /** Number of periods on each invoice */
  subscriptionPeriodsOnInvoice?: number;
  /** The time unit of subscriptionPeriodsOnInvoice */
  readonly subscriptionPeriodsOnInvoiceType?: 'MONTHS';
  /** Invoicing in advance/in arrears */
  subscriptionInvoicingTimeInAdvanceOrArrears?: 'ADVANCE' | 'ARREARS';
  /** Number of days/months invoicing in advance/in arrears */
  subscriptionInvoicingTime?: number;
  /** The time unit of subscriptionInvoicingTime */
  subscriptionInvoicingTimeType?: 'DAYS' | 'MONTHS';
  /** Automatic invoicing. Starts when the subscription is approved */
  isSubscriptionAutoInvoicing?: boolean;
  preliminaryInvoice?: Invoice;
  /** [BETA] Attachments belonging to this order */
  readonly attachment?: Document[];
  /** Description of how this invoice will be sent */
  sendMethodDescription?: string;
  readonly canCreateBackorder?: boolean;
  /** Is the on account(a konto) amounts including vat  */
  invoiceOnAccountVatHigh?: boolean;
  /** Amount paid on account(a konto) */
  readonly totalInvoicedOnAccountAmountAbsoluteCurrency?: number;
  /** Is sms-notification on/off */
  readonly invoiceSendSMSNotification?: boolean;
  /** The phone number of the receiver of sms notifications. Must be a norwegian phone number */
  invoiceSMSNotificationNumber?: string;
  /** Set mark-up (%) for order lines. */
  markUpOrderLines?: number;
  /** Default discount percentage for order lines. */
  discountPercentage?: number;
  readonly customerName?: string;
  readonly projectManagerNameAndNumber?: string;
  /** Travel reports connected to the order. */
  readonly travelReports?: TravelExpense[];
  /** Free dimensions for the project connected to the order. */
  readonly accountingDimensionValues?: AccountingDimensionValue[];
}

/** Order line groups */
export interface OrderGroup {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  order?: Order;
  title?: string;
  comment?: string;
  /** Defines the presentation order of the orderGroups. Does not need to be, and is often not continuous. Only applicable if parent order has orderLineSorting as CUSTOM. */
  sortIndex?: number;
  /** Order lines belonging to the OrderGroup. Order lines that does not belong to a group, can be posted on the orderLines field on the order. */
  orderLines?: OrderLine[];
}

/** Order lines tied to the order. New OrderLines may be embedded here, in some endpoints. */
export interface OrderLine {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  product?: Product;
  inventory?: Inventory;
  inventoryLocation?: InventoryLocation;
  description?: string;
  /** Display name of order line */
  readonly displayName?: string;
  count?: number;
  /** Unit price purchase (cost) excluding VAT in the order's currency */
  unitCostCurrency?: number;
  /** Unit price of purchase excluding VAT in the order's currency. If only unit price Excl. VAT or unit price Inc. VAT is supplied, we will calculate and update the missing field. */
  unitPriceExcludingVatCurrency?: number;
  currency?: Currency;
  /** Markup given as a percentage (%) */
  markup?: number;
  /** Discount given as a percentage (%) */
  discount?: number;
  vatType?: VatType;
  /** Total amount on order line excluding VAT in the order's currency */
  readonly amountExcludingVatCurrency?: number;
  /** Total amount on order line including VAT in the order's currency */
  readonly amountIncludingVatCurrency?: number;
  vendor?: Company;
  order?: Order;
  /** Unit price of purchase including VAT in the order's currency. If only unit price Excl. VAT or unit price Inc. VAT is supplied, we will calculate and update the missing field. */
  unitPriceIncludingVatCurrency?: number;
  isSubscription?: boolean;
  subscriptionPeriodStart?: string;
  subscriptionPeriodEnd?: string;
  orderGroup?: OrderGroup;
  /** Defines the presentation order of the lines. Does not need to be, and is often not continuous. Only applicable if parent order has orderLineSorting as CUSTOM. */
  sortIndex?: number;
  /** Only used for Logistics customers who activated the available inventory functionality. Represents whether the line has been picked up or not. */
  isPicked?: boolean;
  /** Only used for Logistics customers who activated the available inventory functionality. Represents the pick date for an order line or null if the line was not picked. */
  pickedDate?: string;
  /** Only used for Logistics customers who activated the Backorder functionality. Represents the quantity that was ordered. If nothing is specified, the ordered quantity will be the same as the delivered quantity. */
  orderedQuantity?: number;
  /** Flag indicating whether the order line is charged or not. */
  isCharged?: boolean;
}

/** Link to individual passengers. */
export interface Passenger {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  mileageAllowance?: MileageAllowance;
}

export interface Payslip {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  transaction?: SalaryTransaction;
  employee?: Employee;
  /** Voucher date. */
  date?: string;
  year?: number;
  month?: number;
  /** Link to salary specifications. */
  specifications?: SalarySpecification[];
  readonly vacationAllowanceAmount?: number;
  readonly grossAmount?: number;
  readonly amount?: number;
  readonly number?: number;
  department?: Department;
}

/** Link to individual per diem compensations. */
export interface PerDiemCompensation {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  travelExpense?: TravelExpense;
  rateType?: TravelExpenseRate;
  rateCategory?: TravelExpenseRateCategory;
  countryCode?: string;
  /** Optional travel expense zone id. If not specified, the value from field zone will be used. */
  travelExpenseZoneId?: number;
  /** Set what sort of accommodation was had overnight. */
  overnightAccommodation?: 'NONE' | 'HOTEL' | 'BOARDING_HOUSE_WITHOUT_COOKING' | 'BOARDING_HOUSE_WITH_COOKING';
  location?: string;
  address?: string;
  count?: number;
  rate?: number;
  amount?: number;
  isDeductionForBreakfast?: boolean;
  isDeductionForLunch?: boolean;
  isDeductionForDinner?: boolean;
}

export interface Posting {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  voucher?: Voucher;
  date?: string;
  description?: string;
  account?: Account;
  amortizationAccount?: Account;
  /** Amortization start date. AmortizationAccountId, amortizationStartDate and amortizationEndDate should be provided. */
  amortizationStartDate?: string;
  amortizationEndDate?: string;
  customer?: Customer;
  supplier?: Supplier;
  employee?: Employee;
  project?: Project;
  product?: Product;
  department?: Department;
  vatType?: VatType;
  amount?: number;
  amountCurrency?: number;
  amountGross?: number;
  amountGrossCurrency?: number;
  currency?: Currency;
  closeGroup?: CloseGroup;
  invoiceNumber?: string;
  termOfPayment?: string;
  row?: number;
  readonly type?: 'INCOMING_PAYMENT' | 'INCOMING_PAYMENT_OPPOSITE' | 'INCOMING_INVOICE_CUSTOMER_POSTING' | 'INVOICE_EXPENSE' | 'OUTGOING_INVOICE_CUSTOMER_POSTING' | 'WAGE';
  /** External reference for identifying payment basis of the posting, e.g., KID, customer identification or credit note number. */
  readonly externalRef?: string;
  readonly systemGenerated?: boolean;
  readonly taxTransactionType?: string;
  readonly taxTransactionTypeId?: number;
  readonly matched?: boolean;
  /** The quantity amount associated with the posting */
  quantityAmount1?: number;
  quantityType1?: ProductUnit;
  /** The quantity amount associated with the posting */
  quantityAmount2?: number;
  quantityType2?: ProductUnit;
  /** Is vat code readonly? */
  readonly isVatReadonly?: boolean;
  /** Is amount of this posting (for VAT purposes) changeable */
  readonly isAmountVatClosed?: boolean;
  /** The payment type id associated with the posting. This ID will only be set if the payment types used is an internal payment type like 'Nettbank' - it is not set if the payment is a bank payment like AutoPay or ZTL. */
  postingRuleId?: number;
  freeAccountingDimension1?: AccountingDimensionValue;
  freeAccountingDimension2?: AccountingDimensionValue;
  freeAccountingDimension3?: AccountingDimensionValue;
  asset?: Asset;
}

export interface Prediction {
  predictedValue?: string;
  confidence?: string;
}

export interface Product {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  readonly displayNumber?: string;
  description?: string;
  orderLineDescription?: string;
  ean?: string;
  readonly elNumber?: string;
  readonly nrfNumber?: string;
  /** Price purchase (cost) excluding VAT in the product's currency */
  costExcludingVatCurrency?: number;
  expenses?: number;
  readonly expensesInPercent?: number;
  /** Cost price of purchase */
  readonly costPrice?: number;
  readonly profit?: number;
  readonly profitInPercent?: number;
  /** Price of purchase excluding VAT in the product's currency */
  priceExcludingVatCurrency?: number;
  /** Price of purchase including VAT in the product's currency */
  priceIncludingVatCurrency?: number;
  isInactive?: boolean;
  discountGroup?: DiscountGroup;
  productUnit?: ProductUnit;
  isStockItem?: boolean;
  /** Available only on demand */
  readonly stockOfGoods?: number;
  /** Available only on demand */
  readonly availableStock?: number;
  /** Available only on demand */
  readonly incomingStock?: number;
  /** Available only on demand */
  readonly outgoingStock?: number;
  vatType?: VatType;
  currency?: Currency;
  department?: Department;
  account?: Account;
  readonly discountPrice?: number;
  supplier?: Supplier;
  resaleProduct?: Product;
  /** For performance reasons, field is deprecated and it will always return false. */
  isDeletable?: boolean;
  hasSupplierProductConnected?: boolean;
  weight?: number;
  weightUnit?: 'kg' | 'g' | 'hg';
  volume?: number;
  volumeUnit?: 'cm3' | 'dm3' | 'm3';
  hsnCode?: string;
  image?: Document;
  readonly markupListPercentage?: number;
  readonly markupNetPercentage?: number;
  readonly displayName?: string;
  mainSupplierProduct?: SupplierProduct;
  /** [BETA] Indicates whether the price incl. VAT is rounded off or not */
  readonly isRoundPriceIncVat?: boolean;
  /** Purchase Price converted in specific currency. */
  readonly priceInTargetCurrency?: number;
  /** Purchase Price in product currency. This affects only Supplier Products. */
  readonly purchasePriceCurrency?: number;
  /** Minimum available stock level for the product. Applicable only to stock items in the Logistics Basics module. */
  minStockLevel?: number;
}

/** The quantity type 2 that has been associated to this account */
export interface ProductUnit {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  readonly displayName?: string;
  readonly displayNameShort?: string;
  name?: string;
  nameEN?: string;
  nameShort?: string;
  nameShortEN?: string;
  commonCode?: string;
  isDeletable?: boolean;
}

export interface Project {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  /** If NULL, a number is generated automatically. */
  number?: string;
  readonly displayName?: string;
  description?: string;
  projectManager?: Employee;
  department?: Department;
  mainProject?: Project;
  startDate?: string;
  endDate?: string;
  customer?: Customer;
  isClosed?: boolean;
  isReadyForInvoicing?: boolean;
  isInternal?: boolean;
  /** If is Project Offer set to true, if is Project set to false. The default value is false. */
  isOffer?: boolean;
  /** Project is fixed price if set to true, hourly rate if set to false. */
  isFixedPrice?: boolean;
  projectCategory?: ProjectCategory;
  deliveryAddress?: Address;
  boligmappaAddress?: Address;
  /** Defines project name presentation in overviews. */
  displayNameFormat?: 'NAME_STANDARD' | 'NAME_INCL_CUSTOMER_NAME' | 'NAME_INCL_PARENT_NAME' | 'NAME_INCL_PARENT_NUMBER' | 'NAME_INCL_PARENT_NAME_AND_NUMBER';
  reference?: string;
  externalAccountsNumber?: string;
  /** Project discount percentage. */
  readonly discountPercentage?: number;
  vatType?: VatType;
  /** Fixed price amount, in the project's currency. */
  fixedprice?: number;
  readonly contributionMarginPercent?: number;
  readonly numberOfSubProjects?: number;
  readonly numberOfProjectParticipants?: number;
  /** Order lines tied to the order */
  readonly orderLines?: ProjectOrderLine[];
  currency?: Currency;
  /** Set mark-up (%) for order lines. */
  markUpOrderLines?: number;
  /** Set mark-up (%) for fees earned. */
  markUpFeesEarned?: number;
  /** Set to true if an hourly rate project has a price ceiling. */
  isPriceCeiling?: boolean;
  /** Price ceiling amount, in the project's currency. */
  priceCeilingAmount?: number;
  /** Project Rate Types tied to the project. */
  projectHourlyRates?: ProjectHourlyRate[];
  /** Set to true if only project participants can register information on the project */
  forParticipantsOnly?: boolean;
  /** Link to individual project participants. */
  participants?: ProjectParticipant[];
  contact?: Contact;
  attention?: Contact;
  /** Comment for project invoices */
  invoiceComment?: string;
  /** Invoicing plans tied to the project */
  readonly invoicingPlan?: Invoice[];
  preliminaryInvoice?: Invoice;
  /** Set to true if a general project activity must be linked to project to allow time tracking. */
  generalProjectActivitiesPerProjectOnly?: boolean;
  /** Project Activities */
  projectActivities?: ProjectActivity[];
  readonly hierarchyNameAndNumber?: string;
  /** invoice due date */
  invoiceDueDate?: number;
  /** Set the time unit of invoiceDueDate. The special case RECURRING_DAY_OF_MONTH enables the due date to be fixed to a specific day of the month, in this case the fixed due date will automatically be set as standard on all invoices created from this project. Note that when RECURRING_DAY_OF_MONTH is set, the due date will be set to the last day of month if "31" is set in invoicesDueIn. */
  invoiceDueDateType?: 'DAYS' | 'MONTHS' | 'RECURRING_DAY_OF_MONTH';
  /** Set the project's invoice receiver email. Will override the default invoice receiver email of any customer that may also be set in the request body. */
  invoiceReceiverEmail?: string;
  /** Set the project's overdue notice email. Will override the default overdue notice email of any customer that may also be set in the request body. */
  overdueNoticeEmail?: string;
  /** READ/WRITE access on project */
  accessType?: 'NONE' | 'READ' | 'WRITE';
  useProductNetPrice?: boolean;
  ignoreCompanyProductDiscountAgreement?: boolean;
  readonly customerName?: string;
  readonly hierarchyLevel?: number;
  readonly projectManagerNameAndNumber?: string;
  /** Amount paid on account(a konto) */
  readonly totalInvoicedOnAccountAmountAbsoluteCurrency?: number;
  /** The on account(a konto) amounts including VAT */
  invoiceOnAccountVatHigh?: boolean;
  /** Total invoice reserve */
  readonly invoiceReserveTotalAmountCurrency?: number;
  /** [BETA - Requires pilot feature] Free dimensions for the project. */
  accountingDimensionValues?: AccountingDimensionValue[];
}

/** Project Activities */
export interface ProjectActivity {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  activity?: Activity;
  project?: Project;
  startDate?: string;
  endDate?: string;
  isClosed?: boolean;
  /** Set budget hours */
  budgetHours?: number;
  /** Set budget hourly rate */
  budgetHourlyRateCurrency?: number;
  /** Set budget fee */
  budgetFeeCurrency?: number;
}

export interface ProjectCategory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  description?: string;
  displayName?: string;
}

/** Project Rate Types tied to the project. */
export interface ProjectHourlyRate {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  project?: Project;
  startDate?: string;
  /** Show on contract confirmation/offers */
  showInProjectOrder?: boolean;
  /** Defines the model used for the hourly rate. */
  hourlyRateModel?: 'TYPE_PREDEFINED_HOURLY_RATES' | 'TYPE_PROJECT_SPECIFIC_HOURLY_RATES' | 'TYPE_FIXED_HOURLY_RATE';
  /** Project specific rates if hourlyRateModel is TYPE_PROJECT_SPECIFIC_HOURLY_RATES.  */
  projectSpecificRates?: ProjectSpecificRate[];
  /** Fixed Hourly rates if hourlyRateModel is TYPE_FIXED_HOURLY_RATE. */
  fixedRate?: number;
}

/** ProjectInvoiceDetails contains additional information about the invoice, in particular invoices for projects. It contains information about the charged project, the fee amount, extra percent and amount, extra costs, travel expenses, invoice and project comments, akonto amount and values determining if extra costs, akonto and hours should be included. ProjectInvoiceDetails is an object which represents the relation between an invoice and a Project, Orderline and OrderOut object. */
export interface ProjectInvoiceDetails {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  project?: Project;
  /** Fee amount of the project. For example: 100 NOK. */
  readonly feeAmount?: number;
  /** Fee amount of the project in the invoice currency. */
  readonly feeAmountCurrency?: number;
  /** The percentage value of mark-up of amountFee. For example: 10%. */
  readonly markupPercent?: number;
  /** The amount value of mark-up of amountFee on the project invoice. For example: 10 NOK. */
  readonly markupAmount?: number;
  /** The amount value of mark-up of amountFee on the project invoice, in the invoice currency. */
  readonly markupAmountCurrency?: number;
  /** The amount of chargeable manual order lines and vendor invoices on the project invoice. */
  readonly amountOrderLinesAndReinvoicing?: number;
  /** The amount of chargeable manual order lines and vendor invoices on the project invoice, in the invoice currency. */
  readonly amountOrderLinesAndReinvoicingCurrency?: number;
  /** The amount of travel costs and expenses on the project invoice. */
  readonly amountTravelReportsAndExpenses?: number;
  /** The amount of travel costs and expenses on the project invoice, in the invoice currency. */
  readonly amountTravelReportsAndExpensesCurrency?: number;
  /** The fee comment on the project invoice. */
  readonly feeInvoiceText?: string;
  /** The comment on the project invoice. */
  readonly invoiceText?: string;
  /** Determines if extra costs should be included on the project invoice. */
  readonly includeOrderLinesAndReinvoicing?: boolean;
  /** Determines if hours should be included on the project invoice. */
  readonly includeHours?: boolean;
  /** Determines if akonto should be included on the project invoice. */
  readonly includeOnAccountBalance?: boolean;
  /** The akonto amount on the project invoice. */
  readonly onAccountBalanceAmount?: number;
  /** The akonto amount on the project invoice in the invoice currency. */
  readonly onAccountBalanceAmountCurrency?: number;
  vatType?: VatType;
  invoice?: Invoice;
}

/** Order lines tied to the order */
export interface ProjectOrderLine {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  product?: Product;
  inventory?: Inventory;
  inventoryLocation?: InventoryLocation;
  description?: string;
  /** Display name of order line */
  readonly displayName?: string;
  count?: number;
  /** Unit price purchase (cost) excluding VAT in the order's currency */
  unitCostCurrency?: number;
  /** Unit price of purchase excluding VAT in the order's currency. If only unit price Excl. VAT or unit price Inc. VAT is supplied, we will calculate and update the missing field. */
  unitPriceExcludingVatCurrency?: number;
  currency?: Currency;
  /** Markup given as a percentage (%) */
  markup?: number;
  /** Discount given as a percentage (%) */
  discount?: number;
  vatType?: VatType;
  /** Total amount on order line excluding VAT in the order's currency */
  readonly amountExcludingVatCurrency?: number;
  /** Total amount on order line including VAT in the order's currency */
  readonly amountIncludingVatCurrency?: number;
  vendor?: Company;
  project?: Project;
  date?: string;
  isChargeable?: boolean;
  readonly isBudget?: boolean;
  invoice?: Invoice;
  customSortIndex?: number;
  voucher?: Voucher;
}

/** Link to individual project participants. */
export interface ProjectParticipant {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  project?: Project;
  employee?: Employee;
  adminAccess?: boolean;
}

/** Project specific rates if hourlyRateModel is TYPE_PROJECT_SPECIFIC_HOURLY_RATES.  */
export interface ProjectSpecificRate {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  hourlyRate?: number;
  hourlyCostPercentage?: number;
  projectHourlyRate?: ProjectHourlyRate;
  employee?: Employee;
  activity?: Activity;
}

/** Invoice debt collection and reminders. */
export interface Reminder {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  /** Creation date of the invoice reminder. */
  readonly reminderDate?: string;
  /** The fee part of the reminder, in the company's currency. */
  readonly charge?: number;
  /** The fee part of the reminder, in the invoice currency. */
  readonly chargeCurrency?: number;
  /** The total fee part of all reminders, in the company's currency. */
  readonly totalCharge?: number;
  /** The total fee part of all reminders, in the invoice currency. */
  readonly totalChargeCurrency?: number;
  /** The total amount to pay in reminder's currency. */
  readonly totalAmountCurrency?: number;
  /** The interests part of the reminder. */
  readonly interests?: number;
  /** The reminder interest rate. */
  readonly interestRate?: number;
  /** The reminder term of payment date. */
  termOfPayment?: string;
  currency?: Currency;
  type?: 'SOFT_REMINDER' | 'REMINDER' | 'NOTICE_OF_DEBT_COLLECTION' | 'DEBT_COLLECTION';
  comment?: string;
  /** KID - Kundeidentifikasjonsnummer. */
  kid?: string;
  bankAccountNumber?: string;
  bankAccountIBAN?: string;
  bankAccountSWIFT?: string;
  bank?: string;
}

export interface ResponseWrapperAccount {
  value?: Account;
}

export interface ResponseWrapperCustomer {
  value?: Customer;
}

export interface ResponseWrapperDepartment {
  value?: Department;
}

export interface ResponseWrapperEmployee {
  value?: Employee;
}

export interface ResponseWrapperEntitlement {
  value?: Entitlement;
}

export interface ResponseWrapperInvoice {
  value?: Invoice;
}

export interface ResponseWrapperOrder {
  value?: Order;
}

export interface ResponseWrapperOrderLine {
  value?: OrderLine;
}

export interface ResponseWrapperPosting {
  value?: Posting;
}

export interface ResponseWrapperProduct {
  value?: Product;
}

export interface ResponseWrapperProject {
  value?: Project;
}

export interface ResponseWrapperTravelExpense {
  value?: TravelExpense;
}

export interface ResponseWrapperVoucher {
  value?: Voucher;
}

/** Link to salary specifications. */
export interface SalarySpecification {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  rate?: number;
  count?: number;
  project?: Project;
  department?: Department;
  salaryType?: SalaryType;
  payslip?: Payslip;
  employee?: Employee;
  description?: string;
  year?: number;
  month?: number;
  amount?: number;
  specificationSupplement?: SalarySpecificationSupplement;
}

/** Link to salary specification supplement info. */
export interface SalarySpecificationSupplement {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  carRegNumber?: string;
  carListPrice?: number;
}

export interface SalaryTransaction {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  /** Voucher date. */
  date?: string;
  year?: number;
  month?: number;
  /** With historical wage vouchers you can update the wage system with information dated before the opening balance. */
  isHistorical?: boolean;
  /** The date payslips are made available to the employee. Defaults to voucherDate. */
  paySlipsAvailableDate?: string;
  /** Link to individual payslip objects. */
  payslips?: Payslip[];
}

export interface SalaryType {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  number?: string;
  name?: string;
  description?: string;
  readonly showInTimesheet?: boolean;
  readonly isSickPayable?: boolean;
  readonly isVacationPayable?: boolean;
  readonly isTaxable?: boolean;
  readonly payStatementCodeCode?: string;
  readonly ameldingWageCode?: string;
  accountNumberDebit?: Account;
  accountNumberCredit?: Account;
  readonly isPayrollTaxable?: boolean;
}

export interface Supplier {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  organizationNumber?: string;
  supplierNumber?: number;
  customerNumber?: number;
  readonly isSupplier?: boolean;
  /** Determine if the supplier is also a customer */
  isCustomer?: boolean;
  isInactive?: boolean;
  email?: string;
  /** [DEPRECATED] List of the bank account numbers for this supplier. Norwegian bank account numbers only. */
  bankAccounts?: string[];
  invoiceEmail?: string;
  /** The email address of the customer where the noticing emails are sent in case of an overdue */
  overdueNoticeEmail?: string;
  phoneNumber?: string;
  phoneNumberMobile?: string;
  description?: string;
  isPrivateIndividual?: boolean;
  showProducts?: boolean;
  accountManager?: Employee;
  postalAddress?: Address;
  physicalAddress?: Address;
  deliveryAddress?: DeliveryAddress;
  category1?: CustomerCategory;
  category2?: CustomerCategory;
  category3?: CustomerCategory;
  /** List of bankAccount for this supplier */
  bankAccountPresentation?: CompanyBankAccountPresentation[];
  currency?: Currency;
  ledgerAccount?: Account;
  language?: 'NO' | 'EN';
  readonly isWholesaler?: boolean;
  readonly displayName?: string;
  readonly locale?: string;
  website?: string;
}

/** This feature is available only in pilot */
export interface SupplierProduct {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  readonly displayName?: string;
  number?: string;
  description?: string;
  ean?: string;
  /** Price purchase (cost) excluding VAT in the product's currency */
  costExcludingVatCurrency?: number;
  /** Price purchase (cost) in the company's currency */
  cost?: number;
  /** Price of purchase excluding VAT in the product's currency */
  priceExcludingVatCurrency?: number;
  /** Price of purchase including VAT in the product's currency */
  priceIncludingVatCurrency?: number;
  isInactive?: boolean;
  productUnit?: ProductUnit;
  isStockItem?: boolean;
  readonly stockOfGoods?: number;
  vatType?: VatType;
  currency?: Currency;
  readonly discountPrice?: number;
  supplier?: Supplier;
  resaleProduct?: Product;
  readonly isDeletable?: boolean;
  readonly vendorName?: string;
  readonly isEfoNelfoProduct?: boolean;
  readonly wholesalerId?: number;
  /** This feature is available only in pilot */
  isMainSupplierProduct?: boolean;
  readonly priceInTargetCurrency?: number;
}

export interface TravelCostCategory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  description?: string;
  account?: Account;
  vatType?: VatType;
  readonly isVatLocked?: boolean;
  readonly showOnTravelExpenses?: boolean;
  readonly showOnEmployeeExpenses?: boolean;
  readonly isInactive?: boolean;
  readonly sequence?: number;
  displayName?: string;
}

export interface TravelDetails {
  isForeignTravel?: boolean;
  isDayTrip?: boolean;
  isCompensationFromRates?: boolean;
  departureDate?: string;
  returnDate?: string;
  detailedJourneyDescription?: string;
  departureFrom?: string;
  destination?: string;
  departureTime?: string;
  returnTime?: string;
  purpose?: string;
}

/** Travel reports connected to the order. */
export interface TravelExpense {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  attestationSteps?: AttestationStep[];
  attestation?: Attestation;
  project?: Project;
  employee?: Employee;
  approvedBy?: Employee;
  completedBy?: Employee;
  rejectedBy?: Employee;
  department?: Department;
  freeDimension1?: AccountingDimensionValue;
  freeDimension2?: AccountingDimensionValue;
  freeDimension3?: AccountingDimensionValue;
  payslip?: Payslip;
  vatType?: VatType;
  paymentCurrency?: Currency;
  travelDetails?: TravelDetails;
  voucher?: Voucher;
  attachment?: Document;
  readonly isCompleted?: boolean;
  readonly isApproved?: boolean;
  readonly rejectedComment?: string;
  isChargeable?: boolean;
  isFixedInvoicedAmount?: boolean;
  isMarkupInvoicedPercent?: boolean;
  isIncludeAttachedReceiptsWhenReinvoicing?: boolean;
  readonly completedDate?: string;
  readonly approvedDate?: string;
  readonly date?: string;
  travelAdvance?: number;
  fixedInvoicedAmount?: number;
  markupInvoicedPercent?: number;
  readonly amount?: number;
  readonly chargeableAmountCurrency?: number;
  readonly paymentAmount?: number;
  readonly chargeableAmount?: number;
  readonly lowRateVAT?: number;
  readonly mediumRateVAT?: number;
  readonly highRateVAT?: number;
  readonly paymentAmountCurrency?: number;
  readonly number?: number;
  readonly numberAsString?: string;
  invoice?: Invoice;
  title?: string;
  readonly displayName?: string;
  readonly displayNameWithoutNumber?: string;
  /** Link to individual per diem compensations. */
  perDiemCompensations?: PerDiemCompensation[];
  /** Link to individual mileage allowances. */
  readonly mileageAllowances?: MileageAllowance[];
  /** Link to individual accommodation allowances. */
  readonly accommodationAllowances?: AccommodationAllowance[];
  /** Link to individual costs. */
  costs?: Cost[];
  readonly attachmentCount?: number;
  readonly state?: 'ALL' | 'REJECTED' | 'OPEN' | 'APPROVED' | 'SALARY_PAID' | 'DELIVERED';
  readonly stateName?: string;
  readonly actions?: Link[];
  readonly isSalaryAdmin?: boolean;
  readonly showPayslip?: boolean;
  readonly accountingPeriodClosed?: boolean;
  readonly accountingPeriodVATClosed?: boolean;
  readonly type?: number;
}

export interface TravelExpenseRate {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  rateCategory?: TravelExpenseRateCategory;
  zone?: string;
  rate?: number;
  breakfastDeductionRate?: number;
  lunchDeductionRate?: number;
  dinnerDeductionRate?: number;
}

export interface TravelExpenseRateCategory {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  readonly name?: string;
  ameldingWageCode?: number;
  wageCodeNumber?: string;
  isValidDayTrip?: boolean;
  isValidAccommodation?: boolean;
  isValidDomestic?: boolean;
  isValidForeignTravel?: boolean;
  isRequiresZone?: boolean;
  isRequiresOvernightAccommodation?: boolean;
  fromDate?: string;
  toDate?: string;
  type?: 'PER_DIEM' | 'ACCOMMODATION_ALLOWANCE' | 'MILEAGE_ALLOWANCE';
}

export interface TravelPaymentType {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  description?: string;
  account?: Account;
  readonly showOnTravelExpenses?: boolean;
  readonly showOnEmployeeExpenses?: boolean;
  readonly isInactive?: boolean;
  displayName?: string;
}

/** The default vat type for this account. */
export interface VatType {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  number?: string;
  displayName?: string;
  percentage?: number;
  /** Percentage of the VAT amount that is deducted. Always 100% for all predefined VAT types, but can be lower for custom types for relative VAT. */
  deductionPercentage?: number;
  parentType?: VatType;
}

export interface Voucher {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  date?: string;
  /** System generated number that cannot be changed. */
  readonly number?: number;
  /** Temporary voucher number. */
  readonly tempNumber?: number;
  /** System generated number that cannot be changed. */
  readonly year?: number;
  description?: string;
  voucherType?: VoucherType;
  reverseVoucher?: Voucher;
  postings?: Posting[];
  document?: Document;
  attachment?: Document;
  /** External voucher number. Maximum 70 characters. */
  externalVoucherNumber?: string;
  ediDocument?: Document;
  /** Supplier voucher type - simple and detailed. */
  readonly supplierVoucherType?: 'TYPE_SUPPLIER_INVOICE_SIMPLE' | 'TYPE_SUPPLIER_INVOICE_DETAILED';
  /** Voucher was auto matched */
  readonly wasAutoMatched?: boolean;
  /** Vendor invoice number. */
  vendorInvoiceNumber?: string;
  readonly displayName?: string;
  readonly numberAsString?: string;
}

export interface VoucherSearchResponse {
  /** Indicates whether there are more values available. Note: The value is not exact */
  readonly fullResultSize?: number;
  readonly from?: number;
  readonly count?: number;
  /** Used to know if the paginated list has changed. */
  readonly versionDigest?: string;
  readonly values?: Voucher[];
  /** [DEPRECATED] Number of postings returned (if postings are returned) */
  readonly totalNumberOfPostings?: number;
}

/** Voucher type. Must not be of type 'Utgående faktura' ('Outgoing Invoice') on new vouchers, instead use voucherType=null or use the Invoice endpoint. */
export interface VoucherType {
  id?: number;
  version?: number;
  readonly changes?: Change[];
  readonly url?: string;
  name?: string;
  displayName?: string;
}

// ============================================================
// Endpoint Request & Response Types
// ============================================================

export interface EmployeeGetParams {
  /** List of IDs */
  id?: string;
  /** Containing */
  firstName?: string;
  /** Containing */
  lastName?: string;
  /** Equals */
  employeeNumber?: string;
  /** Containing */
  email?: string;
  /** Equals */
  allowInformationRegistration?: boolean;
  /** Equals */
  includeContacts?: boolean;
  /** List of IDs */
  departmentId?: string;
  /** Equals */
  onlyProjectManagers?: boolean;
  /** Equals */
  onlyContacts?: boolean;
  /** Equals */
  assignableProjectManagers?: boolean;
  /** Equals */
  periodStart?: string;
  /** Equals */
  periodEnd?: string;
  /** Equals */
  hasSystemAccess?: boolean;
  /** Equals */
  onlyEmployeeTokens?: boolean;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type EmployeeGetResponse = ListResponseEmployee;

export type EmployeePostBody = Employee;

export type EmployeePostResponse = ResponseWrapperEmployee;

export interface EmployeeByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type EmployeeByIdGetResponse = ResponseWrapperEmployee;

export interface EmployeeByIdPutParams {
  /** Element ID */
  id: number;
}

export type EmployeeByIdPutBody = Employee;

export type EmployeeByIdPutResponse = ResponseWrapperEmployee;

export type EmployeeListPostBody = Employee[];

export type EmployeeListPostResponse = ListResponseEmployee;

export interface CustomerGetParams {
  /** List of IDs */
  id?: string;
  /** List of customer numbers */
  customerAccountNumber?: string;
  /** Equals */
  organizationNumber?: string;
  /** Equals */
  email?: string;
  /** Equals */
  invoiceEmail?: string;
  /** Name */
  customerName?: string;
  /** Phone number mobile */
  phoneNumberMobile?: string;
  /** Equals */
  isInactive?: boolean;
  /** List of IDs */
  accountManagerId?: string;
  /** Only return elements that have changed since this date and time */
  changedSince?: string;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type CustomerGetResponse = ListResponseCustomer;

export type CustomerPostBody = Customer;

export type CustomerPostResponse = ResponseWrapperCustomer;

export interface CustomerByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type CustomerByIdGetResponse = ResponseWrapperCustomer;

export interface CustomerByIdPutParams {
  /** Element ID */
  id: number;
}

export type CustomerByIdPutBody = Customer;

export type CustomerByIdPutResponse = ResponseWrapperCustomer;

export interface CustomerByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type CustomerListPutBody = Customer[];

export type CustomerListPutResponse = ListResponseCustomer;

export type CustomerListPostBody = Customer[];

export type CustomerListPostResponse = ListResponseCustomer;

export interface ProductGetParams {
  /** DEPRECATED. List of product numbers (Integer only) */
  number?: string;
  /** List of IDs */
  ids?: string;
  /** List of valid product numbers */
  productNumber?: string[];
  /** Containing */
  name?: string;
  /** Equals */
  ean?: string;
  /** Equals */
  isInactive?: boolean;
  /** Equals */
  isStockItem?: boolean;
  /** Equals */
  isSupplierProduct?: boolean;
  /** Equals */
  supplierId?: string;
  /** Equals */
  currencyId?: string;
  /** Equals */
  vatTypeId?: string;
  /** Equals */
  productUnitId?: string;
  /** Equals */
  departmentId?: string;
  /** Equals */
  accountId?: string;
  /** From and including */
  costExcludingVatCurrencyFrom?: number;
  /** To and excluding */
  costExcludingVatCurrencyTo?: number;
  /** From and including */
  priceExcludingVatCurrencyFrom?: number;
  /** To and excluding */
  priceExcludingVatCurrencyTo?: number;
  /** From and including */
  priceIncludingVatCurrencyFrom?: number;
  /** To and excluding */
  priceIncludingVatCurrencyTo?: number;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type ProductGetResponse = ListResponseProduct;

export type ProductPostBody = Product;

export type ProductPostResponse = ResponseWrapperProduct;

export interface ProductByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type ProductByIdGetResponse = ResponseWrapperProduct;

export interface ProductByIdPutParams {
  /** Element ID */
  id: number;
}

export type ProductByIdPutBody = Product;

export type ProductByIdPutResponse = ResponseWrapperProduct;

export interface ProductByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type ProductListPutBody = Product[];

export type ProductListPutResponse = ListResponseProduct;

export type ProductListPostBody = Product[];

export type ProductListPostResponse = ListResponseProduct;

export interface InvoiceGetParams {
  /** List of IDs */
  id?: string;
  /** From and including */
  invoiceDateFrom: string;
  /** To and excluding */
  invoiceDateTo: string;
  /** Equals */
  invoiceNumber?: string;
  /** Equals */
  kid?: string;
  /** List of IDs */
  voucherId?: string;
  /** Equals */
  customerId?: string;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type InvoiceGetResponse = ListResponseInvoice;

export interface InvoicePostParams {
  /** Equals */
  sendToCustomer?: boolean;
  /** Payment type to register prepayment of the invoice. paymentTypeId and paidAmount are optional, but both must be provided if the invoice has already been paid. */
  paymentTypeId?: number;
  /** Paid amount to register prepayment of the invoice, in invoice currency. paymentTypeId and paidAmount are optional, but both must be provided if the invoice has already been paid. */
  paidAmount?: number;
}

export type InvoicePostBody = Invoice;

export type InvoicePostResponse = ResponseWrapperInvoice;

export interface InvoiceByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type InvoiceByIdGetResponse = ResponseWrapperInvoice;

export interface InvoiceListPostParams {
  /** Equals */
  sendToCustomer?: boolean;
  /** Fields filter pattern */
  fields?: string;
}

export type InvoiceListPostBody = Invoice[];

export type InvoiceListPostResponse = ListResponseInvoice;

export interface InvoiceByIdPaymentPutParams {
  /** Invoice id */
  id: number;
  /** Payment date */
  paymentDate: string;
  /** PaymentType id */
  paymentTypeId: number;
  /** Amount paid by the customer in the currency determined by the account of the paymentType */
  paidAmount: number;
  /** Amount paid by customer in the invoice currency. Optional, but required for invoices in alternate currencies. */
  paidAmountCurrency?: number;
}

export type InvoiceByIdPaymentPutResponse = ResponseWrapperInvoice;

export interface InvoiceByIdCreateCreditNotePutParams {
  /** Invoice id */
  id: number;
  /** Credit note date */
  date: string;
  /** Comment */
  comment?: string;
  /** The credit note will not be sent if the customer send type is email and this field is empty */
  creditNoteEmail?: string;
  /** Equals */
  sendToCustomer?: boolean;
  /** Equals */
  sendType?: 'EMAIL' | 'EHF' | 'EFAKTURA' | 'AVTALEGIRO' | 'VIPPS' | 'PAPER' | 'MANUAL' | 'DIRECT' | 'AUTOINVOICE_EHF_OUTBOUND' | 'AUTOINVOICE_EHF_INCOMING' | 'PEPPOL_EHF_INCOMING';
}

export type InvoiceByIdCreateCreditNotePutResponse = ResponseWrapperInvoice;

export interface InvoiceByIdSendPutParams {
  /** Element ID */
  id: number;
  /** SendType */
  sendType: 'EMAIL' | 'EHF' | 'AVTALEGIRO' | 'EFAKTURA' | 'VIPPS' | 'PAPER' | 'MANUAL';
  /** Will override email address if sendType = EMAIL */
  overrideEmailAddress?: string;
}

export interface OrderGetParams {
  /** List of IDs */
  id?: string;
  /** Equals */
  number?: string;
  /** List of IDs */
  customerId?: string;
  /** From and including */
  orderDateFrom: string;
  /** To and excluding */
  orderDateTo: string;
  /** Containing */
  deliveryComment?: string;
  /** Equals */
  isClosed?: boolean;
  /** Equals */
  isSubscription?: boolean;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type OrderGetResponse = ListResponseOrder;

export type OrderPostBody = Order;

export type OrderPostResponse = ResponseWrapperOrder;

export interface OrderByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type OrderByIdGetResponse = ResponseWrapperOrder;

export interface OrderByIdPutParams {
  /** Element ID */
  id: number;
  /** Should order lines and order groups be saved and not included lines/groups be removed? Only applies if non null list of order lines or order groups is set. */
  updateLinesAndGroups?: boolean;
}

export type OrderByIdPutBody = Order;

export type OrderByIdPutResponse = ResponseWrapperOrder;

export interface OrderByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type OrderListPostBody = Order[];

export type OrderListPostResponse = ListResponseOrder;

export interface OrderByIdInvoicePutParams {
  /** ID of order to invoice. */
  id: number;
  /** The invoice date */
  invoiceDate: string;
  /** Send invoice to customer */
  sendToCustomer?: boolean;
  /** Send type used for sending the invoice */
  sendType?: 'EMAIL' | 'EHF' | 'AVTALEGIRO' | 'EFAKTURA' | 'VIPPS' | 'PAPER' | 'MANUAL';
  /** Payment type to register prepayment of the invoice. paymentTypeId and paidAmount are optional, but both must be provided if the invoice has already been paid. The payment type must be related to an account with the same currency as the invoice. */
  paymentTypeId?: number;
  /** Paid amount to register prepayment of the invoice, in invoice currency. paymentTypeId and paidAmount are optional, but both must be provided if the invoice has already been paid. This amount is in the invoice currency. */
  paidAmount?: number;
  /** Amount paid in payment type currency */
  paidAmountAccountCurrency?: number;
  /** Payment type of rest amount. It is possible to have two prepaid payments when invoicing. If paymentTypeIdRestAmount > 0, this second payment will be calculated as invoice amount - paidAmount */
  paymentTypeIdRestAmount?: number;
  /** Amount rest in payment type currency */
  paidAmountAccountCurrencyRest?: number;
  /** Create on account(a konto) */
  createOnAccount?: 'NONE' | 'WITH_VAT' | 'WITHOUT_VAT';
  /** Amount on account */
  amountOnAccount?: number;
  /** On account comment */
  onAccountComment?: string;
  /** Create a backorder for this order, available only for pilot users */
  createBackorder?: boolean;
  /** Id of the invoice a credit note refers to */
  invoiceIdIfIsCreditNote?: number;
  /** Will override email address if sendType = EMAIL */
  overrideEmailAddress?: string;
}

export type OrderByIdInvoicePutResponse = ResponseWrapperInvoice;

export type OrderOrderlinePostBody = OrderLine;

export type OrderOrderlinePostResponse = ResponseWrapperOrderLine;

export interface OrderOrderlineByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type OrderOrderlineByIdGetResponse = ResponseWrapperOrderLine;

export interface OrderOrderlineByIdPutParams {
  /** Element ID */
  id: number;
}

export type OrderOrderlineByIdPutBody = OrderLine;

export type OrderOrderlineByIdPutResponse = ResponseWrapperOrderLine;

export interface OrderOrderlineByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type OrderOrderlineListPostBody = OrderLine[];

export type OrderOrderlineListPostResponse = ListResponseOrderLine;

export interface TravelExpenseGetParams {
  /** Equals */
  employeeId?: string;
  /** Equals */
  departmentId?: string;
  /** Equals */
  projectId?: string;
  /** Equals */
  projectManagerId?: string;
  /** From and including */
  departureDateFrom?: string;
  /** To and excluding */
  returnDateTo?: string;
  /** category */
  state?: 'ALL' | 'REJECTED' | 'OPEN' | 'APPROVED' | 'SALARY_PAID' | 'DELIVERED';
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type TravelExpenseGetResponse = ListResponseTravelExpense;

export type TravelExpensePostBody = TravelExpense;

export type TravelExpensePostResponse = ResponseWrapperTravelExpense;

export interface TravelExpenseByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type TravelExpenseByIdGetResponse = ResponseWrapperTravelExpense;

export interface TravelExpenseByIdPutParams {
  /** Element ID */
  id: number;
}

export type TravelExpenseByIdPutBody = TravelExpense;

export type TravelExpenseByIdPutResponse = ResponseWrapperTravelExpense;

export interface TravelExpenseByIdDeleteParams {
  /** Element ID */
  id: number;
}

export interface ProjectGetParams {
  /** List of IDs */
  id?: string;
  /** Containing */
  name?: string;
  /** Equals */
  number?: string;
  /** Equals */
  isOffer?: boolean;
  /** List of IDs */
  projectManagerId?: string;
  /** List of IDs */
  customerAccountManagerId?: string;
  /** List of IDs */
  employeeInProjectId?: string;
  /** List of IDs */
  departmentId?: string;
  /** From and including */
  startDateFrom?: string;
  /** To and excluding */
  startDateTo?: string;
  /** From and including */
  endDateFrom?: string;
  /** To and excluding */
  endDateTo?: string;
  /** Equals */
  isClosed?: boolean;
  /** Equals */
  isFixedPrice?: boolean;
  /** Equals */
  customerId?: string;
  /** Containing */
  externalAccountsNumber?: string;
  /** If isClosed is false, include projects that have been closed within the last 3 months. Equals */
  includeRecentlyClosed?: boolean;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type ProjectGetResponse = ListResponseProject;

export type ProjectPostBody = Project;

export type ProjectPostResponse = ResponseWrapperProject;

export type ProjectDeleteBody = Project[];

export interface ProjectByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type ProjectByIdGetResponse = ResponseWrapperProject;

export interface ProjectByIdPutParams {
  /** Element ID */
  id: number;
}

export type ProjectByIdPutBody = Project;

export type ProjectByIdPutResponse = ResponseWrapperProject;

export interface ProjectByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type ProjectListPutBody = Project[];

export type ProjectListPutResponse = ListResponseProject;

export type ProjectListPostBody = Project[];

export type ProjectListPostResponse = ListResponseProject;

export interface ProjectListDeleteParams {
  /** ID of the elements */
  ids: string;
}

export interface DepartmentGetParams {
  /** List of IDs */
  id?: string;
  /** Containing */
  name?: string;
  /** Containing */
  departmentNumber?: string;
  /** List of IDs */
  departmentManagerId?: string;
  /** true - return only inactive departments; false - return only active departments; unspecified - return both types */
  isInactive?: boolean;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type DepartmentGetResponse = ListResponseDepartment;

export type DepartmentPostBody = Department;

export type DepartmentPostResponse = ResponseWrapperDepartment;

export interface DepartmentByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type DepartmentByIdGetResponse = ResponseWrapperDepartment;

export interface DepartmentByIdPutParams {
  /** Element ID */
  id: number;
}

export type DepartmentByIdPutBody = Department;

export type DepartmentByIdPutResponse = ResponseWrapperDepartment;

export interface DepartmentByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type DepartmentListPutBody = Department[];

export type DepartmentListPutResponse = ListResponseDepartment;

export type DepartmentListPostBody = Department[];

export type DepartmentListPostResponse = ListResponseDepartment;

export interface LedgerAccountGetParams {
  /** List of IDs */
  id?: string;
  /** List of IDs */
  number?: string;
  /** Equals */
  isBankAccount?: boolean;
  /** Equals */
  isInactive?: boolean;
  /** Equals */
  isApplicableForSupplierInvoice?: boolean;
  /** Ledger type */
  ledgerType?: 'GENERAL' | 'CUSTOMER' | 'VENDOR' | 'EMPLOYEE' | 'ASSET';
  /** Balance account */
  isBalanceAccount?: boolean;
  /** SAF-T code */
  saftCode?: string;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerAccountGetResponse = ListResponseAccount;

export type LedgerAccountPostBody = Account;

export type LedgerAccountPostResponse = ResponseWrapperAccount;

export interface LedgerAccountByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerAccountByIdGetResponse = ResponseWrapperAccount;

export interface LedgerAccountByIdPutParams {
  /** Element ID */
  id: number;
}

export type LedgerAccountByIdPutBody = Account;

export type LedgerAccountByIdPutResponse = ResponseWrapperAccount;

export interface LedgerAccountByIdDeleteParams {
  /** Element ID */
  id: number;
}

export type LedgerAccountListPutBody = Account[];

export type LedgerAccountListPutResponse = ListResponseAccount;

export type LedgerAccountListPostBody = Account[];

export type LedgerAccountListPostResponse = ListResponseAccount;

export interface LedgerAccountListDeleteParams {
  /** ID of the elements */
  ids: string;
}

export interface LedgerPostingGetParams {
  /** Format is yyyy-MM-dd (from and incl.). */
  dateFrom: string;
  /** Format is yyyy-MM-dd (to and excl.). */
  dateTo: string;
  /** Deprecated */
  openPostings?: string;
  /** Element ID for filtering */
  accountId?: number;
  /** Element ID for filtering */
  supplierId?: number;
  /** Element ID for filtering */
  customerId?: number;
  /** Element ID for filtering */
  employeeId?: number;
  /** Element ID for filtering */
  departmentId?: number;
  /** Element ID for filtering */
  projectId?: number;
  /** Element ID for filtering */
  productId?: number;
  /** Element ID for filtering */
  accountNumberFrom?: number;
  /** Element ID for filtering */
  accountNumberTo?: number;
  /** Element ID for filtering */
  type?: 'INCOMING_PAYMENT' | 'INCOMING_PAYMENT_OPPOSITE' | 'INCOMING_INVOICE_CUSTOMER_POSTING' | 'INVOICE_EXPENSE' | 'OUTGOING_INVOICE_CUSTOMER_POSTING' | 'WAGE';
  /** Id of first free accounting dimension. */
  accountingDimensionValue1Id?: number;
  /** Id of second free accounting dimension. */
  accountingDimensionValue2Id?: number;
  /** Id of third free accounting dimension. */
  accountingDimensionValue3Id?: number;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerPostingGetResponse = ListResponsePosting;

export interface LedgerPostingByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerPostingByIdGetResponse = ResponseWrapperPosting;

export interface LedgerVoucherGetParams {
  /** List of IDs */
  id?: string;
  /** List of IDs */
  number?: string;
  /** From and including */
  numberFrom?: number;
  /** To and excluding */
  numberTo?: number;
  /** List of IDs */
  typeId?: string;
  /** From and including */
  dateFrom: string;
  /** To and excluding */
  dateTo: string;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerVoucherGetResponse = VoucherSearchResponse;

export interface LedgerVoucherPostParams {
  /** Should the voucher be sent to ledger? Requires the "Advanced Voucher" permission. */
  sendToLedger?: boolean;
}

export type LedgerVoucherPostBody = Voucher;

export type LedgerVoucherPostResponse = ResponseWrapperVoucher;

export interface LedgerVoucherByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type LedgerVoucherByIdGetResponse = ResponseWrapperVoucher;

export interface LedgerVoucherByIdPutParams {
  /** Element ID */
  id: number;
  /** Should the voucher be sent to ledger? Requires the "Advanced Voucher" permission. */
  sendToLedger?: boolean;
}

export type LedgerVoucherByIdPutBody = Voucher;

export type LedgerVoucherByIdPutResponse = ResponseWrapperVoucher;

export interface LedgerVoucherByIdDeleteParams {
  /** Element ID */
  id: number;
}

export interface LedgerVoucherListPutParams {
  /** Should the voucher be sent to ledger? Requires the "Advanced Voucher" permission. */
  sendToLedger?: boolean;
}

export type LedgerVoucherListPutBody = Voucher[];

export type LedgerVoucherListPutResponse = ListResponseVoucher;

export interface LedgerVoucherByIdReversePutParams {
  /** ID of voucher that should be reversed. */
  id: number;
  /** Reverse voucher date */
  date: string;
}

export type LedgerVoucherByIdReversePutResponse = ResponseWrapperVoucher;

export interface EmployeeEntitlementGetParams {
  /** Employee ID. Defaults to ID of token owner. */
  employeeId?: number;
  /** From index */
  from?: number;
  /** Number of elements to return */
  count?: number;
  /** Sorting pattern */
  sorting?: string;
  /** Fields filter pattern */
  fields?: string;
}

export type EmployeeEntitlementGetResponse = ListResponseEntitlement;

export interface EmployeeEntitlementByIdGetParams {
  /** Element ID */
  id: number;
  /** Fields filter pattern */
  fields?: string;
}

export type EmployeeEntitlementByIdGetResponse = ResponseWrapperEntitlement;

