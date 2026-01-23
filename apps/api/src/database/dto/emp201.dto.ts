/**
 * EMP201 Generation DTOs and Interfaces
 * TASK-SARS-015
 *
 * South African EMP201 employer monthly reconciliation document structure.
 * All monetary values in CENTS (integers)
 */

/**
 * EMP201 employee record
 * Individual employee's payroll summary for the period
 */
export interface Emp201EmployeeRecord {
  /** Staff ID */
  staffId: string;

  /** Employee number (optional) */
  employeeNumber: string | null;

  /** Full name */
  fullName: string;

  /** SA ID number (13 digits) */
  idNumber: string;

  /** SARS tax number (optional) */
  taxNumber: string | null;

  /** Gross remuneration in cents */
  grossRemunerationCents: number;

  /** PAYE deducted in cents */
  payeCents: number;

  /** UIF employee contribution in cents */
  uifEmployeeCents: number;

  /** UIF employer contribution in cents */
  uifEmployerCents: number;
}

/**
 * EMP201 summary totals
 * Aggregated totals for the submission period
 */
export interface Emp201Summary {
  /** Number of employees */
  employeeCount: number;

  /** Total gross remuneration in cents */
  totalGrossRemunerationCents: number;

  /** Total PAYE deducted in cents */
  totalPayeCents: number;

  /** Total UIF employee contributions in cents */
  totalUifEmployeeCents: number;

  /** Total UIF employer contributions in cents */
  totalUifEmployerCents: number;

  /** Total UIF (employee + employer) in cents */
  totalUifCents: number;

  /** Total SDL (1% of gross) in cents */
  totalSdlCents: number;

  /** Total amount due to SARS in cents (PAYE + UIF + SDL) */
  totalDueCents: number;
}

/**
 * Complete EMP201 document
 * Structure matching SARS EMP201 format
 */
export interface Emp201Document {
  /** Unique submission ID */
  submissionId: string;

  /** Tenant ID */
  tenantId?: string;

  /** Employer PAYE reference number */
  payeReference: string | null;

  /** Trading name */
  tradingName: string;

  /** Period in YYYY-MM format */
  periodMonth: string;

  /** Period start date */
  periodStart: Date;

  /** Period end date */
  periodEnd: Date;

  /** Summary totals */
  summary: Emp201Summary;

  /** Employee records */
  employees: Emp201EmployeeRecord[];

  /** Validation issues found */
  validationIssues: string[];

  /** Whether SDL is applicable (payroll > R500k threshold) */
  sdlApplicable: boolean;

  /** Generation timestamp */
  generatedAt: Date;
}

/**
 * DTO for EMP201 generation request
 */
export interface GenerateEmp201Dto {
  /** Tenant ID */
  tenantId?: string;

  /** Period in YYYY-MM format */
  periodMonth: string;
}

/**
 * Validation result for EMP201
 */
export interface Emp201ValidationResult {
  /** Whether the document is valid for submission */
  isValid: boolean;

  /** Blocking errors */
  errors: string[];

  /** Non-blocking warnings */
  warnings: string[];
}
