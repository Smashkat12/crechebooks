/**
 * Calculation Entity Types
 * TASK-SPAY-003: SimplePay Calculation Items Retrieval with Caching
 *
 * Provides types for SimplePay calculation items used in South African payroll processing.
 * Includes PAYE, UIF, SDL contributions and various earning/deduction types.
 */

import type {
  CalculationItemCache,
  PayrollAdjustment,
  CalculationType,
} from '@prisma/client';

// Re-export Prisma types
export type { CalculationType };
export { CalculationType as CalculationTypeEnum } from '@prisma/client';

// Interface aliases for the Prisma models
export type ICalculationItemCache = CalculationItemCache;
export type IPayrollAdjustment = PayrollAdjustment;

/**
 * South African Payroll Calculation Code Constants
 * These codes are used by SimplePay for standard payroll items.
 */
export const SA_PAYROLL_CODES = {
  // === Statutory Deductions ===
  PAYE: '4101', // Pay As You Earn tax
  UIF_EMPLOYEE: '4102', // UIF employee contribution
  UIF_EMPLOYER: '4103', // UIF employer contribution
  SDL: '4104', // Skills Development Levy
  ETI: '4105', // Employment Tax Incentive (credit)

  // === Earnings ===
  BASIC_SALARY: '3601', // Basic salary
  HOURLY_RATE: '3602', // Hourly rate pay
  OVERTIME: '3603', // Overtime earnings
  BONUS: '3604', // Bonus payment
  COMMISSION: '3605', // Commission payment
  ALLOWANCE: '3606', // General allowance
  TRAVEL_ALLOWANCE: '3701', // Travel/Motor vehicle allowance
  SUBSISTENCE_ALLOWANCE: '3702', // Subsistence allowance
  REIMBURSIVE_TRAVEL: '3703', // Reimbursive travel allowance
  ANNUAL_BONUS: '3608', // 13th cheque / annual bonus
  LEAVE_PAYOUT: '3609', // Leave payout on termination

  // === Deductions ===
  PENSION_FUND: '4001', // Pension fund contribution
  PROVIDENT_FUND: '4002', // Provident fund contribution
  RETIREMENT_ANNUITY: '4003', // Retirement annuity
  MEDICAL_AID: '4011', // Medical aid contribution
  MEDICAL_AID_EMPLOYER: '4012', // Medical aid employer contribution
  GARNISHEE: '4021', // Garnishee order
  MAINTENANCE: '4022', // Maintenance order
  LOAN: '4023', // Staff loan deduction
  ADVANCE: '4024', // Salary advance deduction
  UNION_FEES: '4025', // Union membership fees
  OTHER_DEDUCTION: '4099', // Other deduction

  // === Employer Contributions (not on payslip) ===
  PENSION_EMPLOYER: '4501', // Employer pension contribution
  PROVIDENT_EMPLOYER: '4502', // Employer provident contribution
  MEDICAL_EMPLOYER: '4512', // Employer medical aid contribution
} as const;

/**
 * Calculation type categories for grouping
 */
export const CALCULATION_TYPE_CATEGORIES = {
  STATUTORY: ['PAYE', 'UIF_EMPLOYEE', 'UIF_EMPLOYER', 'SDL', 'ETI'] as const,
  EARNINGS: [
    'BASIC_SALARY',
    'HOURLY_RATE',
    'OVERTIME',
    'BONUS',
    'COMMISSION',
    'ALLOWANCE',
    'TRAVEL_ALLOWANCE',
    'SUBSISTENCE_ALLOWANCE',
    'REIMBURSIVE_TRAVEL',
    'ANNUAL_BONUS',
    'LEAVE_PAYOUT',
  ] as const,
  DEDUCTIONS: [
    'PENSION_FUND',
    'PROVIDENT_FUND',
    'RETIREMENT_ANNUITY',
    'MEDICAL_AID',
    'GARNISHEE',
    'MAINTENANCE',
    'LOAN',
    'ADVANCE',
    'UNION_FEES',
    'OTHER_DEDUCTION',
  ] as const,
  EMPLOYER_CONTRIBUTIONS: [
    'PENSION_EMPLOYER',
    'PROVIDENT_EMPLOYER',
    'MEDICAL_EMPLOYER',
    'MEDICAL_AID_EMPLOYER',
  ] as const,
};

/**
 * SimplePay API calculation item response
 */
export interface SimplePayCalculationItem {
  id: number | string;
  code: string;
  name: string;
  description?: string;
  type: 'earning' | 'deduction' | 'employer_contribution' | 'tax';
  is_taxable?: boolean;
  is_uif_applicable?: boolean;
  category?: string;
  default_amount?: number;
  calculation_type?: string;
}

/**
 * Cached calculation item with metadata
 */
export interface CachedCalculationItem {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: CalculationType;
  taxable: boolean;
  affectsUif: boolean;
  category: string | null;
  cachedAt: Date;
  updatedAt: Date;
}

/**
 * Payroll adjustment for employee
 */
export interface EmployeePayrollAdjustment {
  id: string;
  tenantId: string;
  staffId: string;
  itemCode: string;
  itemName: string;
  type: CalculationType;
  amountCents: number | null;
  percentage: number | null;
  isRecurring: boolean;
  effectiveDate: Date;
  endDate: Date | null;
  simplePayCalcId: string | null;
  syncedToSimplePay: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cache status result
 */
export interface CacheStatus {
  isValid: boolean;
  itemCount: number;
  cachedAt: Date | null;
  needsRefresh: boolean;
}

/**
 * Sync result for calculation items
 */
export interface CalculationSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ code: string; error: string }>;
}

/**
 * Calculation item filter options
 */
export interface CalculationItemFilter {
  type?: CalculationType;
  taxable?: boolean;
  affectsUif?: boolean;
  search?: string;
}

/**
 * Employee payslip calculation summary
 */
export interface PayslipCalculationSummary {
  staffId: string;
  period: string;
  earnings: Array<{
    code: string;
    name: string;
    amountCents: number;
  }>;
  deductions: Array<{
    code: string;
    name: string;
    amountCents: number;
  }>;
  employerContributions: Array<{
    code: string;
    name: string;
    amountCents: number;
  }>;
  statutoryDeductions: {
    payeCents: number;
    uifEmployeeCents: number;
    uifEmployerCents: number;
    sdlCents: number;
    etiCents: number;
  };
  grossEarningsCents: number;
  totalDeductionsCents: number;
  netPayCents: number;
  costToCompanyCents: number;
}

/**
 * Map SimplePay calculation type to our enum
 */
export function mapSimplePayTypeToCalculationType(
  type: string,
): CalculationType {
  switch (type.toLowerCase()) {
    case 'earning':
      return 'EARNING';
    case 'deduction':
      return 'DEDUCTION';
    case 'employer_contribution':
    case 'company_contribution':
      return 'COMPANY_CONTRIBUTION';
    default:
      return 'DEDUCTION'; // Default to deduction for unknown types
  }
}

/**
 * Determine if a calculation code is for statutory deductions
 */
export function isStatutoryCode(code: string): boolean {
  const statutoryCodes: string[] = [
    SA_PAYROLL_CODES.PAYE,
    SA_PAYROLL_CODES.UIF_EMPLOYEE,
    SA_PAYROLL_CODES.UIF_EMPLOYER,
    SA_PAYROLL_CODES.SDL,
    SA_PAYROLL_CODES.ETI,
  ];
  return statutoryCodes.includes(code);
}

/**
 * Check if code affects UIF calculation
 */
export function affectsUifCalculation(code: string): boolean {
  // Most earnings affect UIF except certain allowances
  const nonUifCodes: string[] = [
    SA_PAYROLL_CODES.TRAVEL_ALLOWANCE,
    SA_PAYROLL_CODES.SUBSISTENCE_ALLOWANCE,
    SA_PAYROLL_CODES.REIMBURSIVE_TRAVEL,
    SA_PAYROLL_CODES.PENSION_FUND,
    SA_PAYROLL_CODES.PROVIDENT_FUND,
    SA_PAYROLL_CODES.RETIREMENT_ANNUITY,
    SA_PAYROLL_CODES.MEDICAL_AID,
  ];
  return !nonUifCodes.includes(code);
}

/**
 * Check if code is taxable
 */
export function isTaxableCode(code: string): boolean {
  // Most earnings are taxable except reimbursive amounts
  const nonTaxableCodes: string[] = [
    SA_PAYROLL_CODES.REIMBURSIVE_TRAVEL,
    SA_PAYROLL_CODES.PENSION_FUND,
    SA_PAYROLL_CODES.PROVIDENT_FUND,
    SA_PAYROLL_CODES.RETIREMENT_ANNUITY,
  ];
  return !nonTaxableCodes.includes(code);
}
