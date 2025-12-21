/**
 * IRP5 Generation DTOs and Interfaces
 * TASK-SARS-016
 *
 * South African employee tax certificate document structure.
 * All monetary values in CENTS (integers)
 */

/**
 * IRP5 Income and Deduction Fields
 * Based on SARS IRP5 code specifications
 */
export interface Irp5Fields {
  /** Code 3601: Basic salary */
  code3601Cents: number;

  /** Code 3602: Overtime payments */
  code3602Cents: number;

  /** Code 3605: Taxable allowances */
  code3605Cents: number;

  /** Code 3606: Bonus / 13th cheque */
  code3606Cents: number;

  /** Code 3615: Total income (remuneration) */
  code3615Cents: number;

  /** Code 3696: PAYE deducted */
  code3696Cents: number;

  /** Code 3701: Pension fund contributions */
  code3701Cents: number;

  /** Code 3702: Retirement annuity contributions */
  code3702Cents: number;

  /** Code 3713: Medical aid contributions (employee) */
  code3713Cents: number;

  /** Code 3714: Medical aid tax credits */
  code3714Cents: number;

  /** Code 3810: UIF contributions (employee) */
  code3810Cents: number;
}

/**
 * Employee details for IRP5
 */
export interface Irp5EmployeeDetails {
  /** Employee number */
  employeeNumber: string | null;

  /** First name */
  firstName: string;

  /** Last name */
  lastName: string;

  /** SA ID number (13 digits) */
  idNumber: string;

  /** SARS tax number */
  taxNumber: string | null;

  /** Date of birth */
  dateOfBirth: Date;
}

/**
 * Employer details for IRP5
 */
export interface Irp5EmployerDetails {
  /** Employer/trading name */
  name: string;

  /** PAYE reference number */
  payeReference: string | null;

  /** Company registration number */
  registrationNumber: string | null;
}

/**
 * Tax period for IRP5
 */
export interface Irp5TaxPeriod {
  /** Start date of tax year */
  startDate: Date;

  /** End date of tax year */
  endDate: Date;

  /** Number of periods worked (months) */
  periodsWorked: number;
}

/**
 * Complete IRP5 Certificate
 */
export interface Irp5Certificate {
  /** Unique certificate ID */
  certificateId: string;

  /** Tenant ID */
  tenantId: string;

  /** Staff ID */
  staffId: string;

  /** Tax year (e.g., "2025" for March 2024 - Feb 2025) */
  taxYear: string;

  /** Employee details */
  employeeDetails: Irp5EmployeeDetails;

  /** Employer details */
  employerDetails: Irp5EmployerDetails;

  /** Tax period dates */
  taxPeriod: Irp5TaxPeriod;

  /** IRP5 code fields */
  fields: Irp5Fields;

  /** Total remuneration in cents */
  totalRemunerationCents: number;

  /** Total PAYE deducted in cents */
  totalPayeCents: number;

  /** Total UIF contributions in cents */
  totalUifCents: number;

  /** Generation timestamp */
  generatedAt: Date;
}

/**
 * Year-to-date totals
 */
export interface Irp5YtdTotals {
  /** Total basic salary */
  totalBasicCents: number;

  /** Total overtime */
  totalOvertimeCents: number;

  /** Total bonus */
  totalBonusCents: number;

  /** Total other earnings */
  totalOtherEarningsCents: number;

  /** Total gross */
  totalGrossCents: number;

  /** Total PAYE */
  totalPayeCents: number;

  /** Total UIF (employee portion) */
  totalUifCents: number;

  /** Total medical aid credits */
  totalMedicalCreditsCents: number;

  /** Number of pay periods */
  periodCount: number;
}

/**
 * DTO for IRP5 generation request
 */
export interface GenerateIrp5Dto {
  /** Staff ID */
  staffId: string;

  /** Tax year (e.g., "2025") */
  taxYear: string;
}

/**
 * Validation result for IRP5
 */
export interface Irp5ValidationResult {
  /** Whether the certificate is valid */
  isValid: boolean;

  /** Blocking errors */
  errors: string[];

  /** Non-blocking warnings */
  warnings: string[];
}
