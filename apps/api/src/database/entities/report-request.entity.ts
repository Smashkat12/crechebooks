/**
 * Report Request Entity
 * TASK-SPAY-005: SimplePay Reports Management
 *
 * Provides reporting integration for:
 * - ETI (Employment Tax Incentive) reports
 * - Transaction history reports
 * - Variance reports
 * - Leave liability reports
 * - Leave comparison reports
 * - Tracked balances reports
 */

import type { ReportRequest, Prisma } from '@prisma/client';

// Re-export the enum from the entity (not from @prisma/client directly)
// This follows the codebase pattern of exporting enums from entity files
export const ReportStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ReportType = {
  ETI: 'ETI',
  TRANSACTION_HISTORY: 'TRANSACTION_HISTORY',
  VARIANCE: 'VARIANCE',
  LEAVE_COMPARISON: 'LEAVE_COMPARISON',
  LEAVE_LIABILITY: 'LEAVE_LIABILITY',
  TRACKED_BALANCES: 'TRACKED_BALANCES',
} as const;

export type ReportType = (typeof ReportType)[keyof typeof ReportType];

// Interface alias for the Prisma model
export type IReportRequest = ReportRequest;

// Type for params input
export type ReportParamsInput = Prisma.InputJsonValue;

// Type for result data input
export type ReportResultInput = Prisma.InputJsonValue;

// ============================================
// Report Parameter Types
// ============================================

// Base report params shared by all reports
export interface BaseReportParams {
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD
}

// ETI Report params
export interface EtiReportParams extends BaseReportParams {
  waveId?: number;
  payRunId?: string;
}

// Transaction History params
export interface TransactionHistoryParams extends BaseReportParams {
  employeeId?: string;
  transactionType?: 'earning' | 'deduction' | 'company_contribution' | 'all';
}

// Variance Report params
export interface VarianceReportParams {
  periodStart1: string;
  periodEnd1: string;
  periodStart2: string;
  periodEnd2: string;
  includeEmployeeDetails?: boolean;
}

// Leave Liability params
export interface LeaveLiabilityParams extends BaseReportParams {
  leaveTypeId?: number;
  includeProjectedAccrual?: boolean;
}

// Leave Comparison params
export interface LeaveComparisonParams {
  year1: number;
  year2: number;
  leaveTypeId?: number;
}

// Tracked Balances params
export interface TrackedBalancesParams extends BaseReportParams {
  balanceTypes?: string[];
  employeeId?: string;
}

// Union type for all report params
export type ReportParams =
  | EtiReportParams
  | TransactionHistoryParams
  | VarianceReportParams
  | LeaveLiabilityParams
  | LeaveComparisonParams
  | TrackedBalancesParams;

// ============================================
// SimplePay API Response Types
// ============================================

// ETI Report (Employment Tax Incentive) - South African specific
export interface SimplePayEtiEntry {
  employee_id: number;
  employee_name: string;
  id_number: string;
  gross_remuneration: number;
  eti_eligible: boolean;
  eti_amount: number;
  eti_month: number;
  employment_start_date: string;
  age_at_month_end: number;
}

export interface SimplePayEtiReport {
  period_start: string;
  period_end: string;
  total_eti: number;
  eligible_employees: number;
  entries: SimplePayEtiEntry[];
}

// Transformed ETI Report for internal use
export interface EtiReport {
  periodStart: Date;
  periodEnd: Date;
  totalEtiCents: number;
  eligibleEmployees: number;
  entries: {
    employeeId: number;
    employeeName: string;
    idNumber: string;
    grossRemunerationCents: number;
    etiEligible: boolean;
    etiAmountCents: number;
    etiMonth: number;
    employmentStartDate: Date;
    ageAtMonthEnd: number;
  }[];
}

// Transaction History
export interface SimplePayTransactionEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  code: string;
  description: string;
  type: 'earning' | 'deduction' | 'company_contribution';
  amount: number;
  pay_run_id: string | number;
}

export interface SimplePayTransactionHistoryReport {
  period_start: string;
  period_end: string;
  total_entries: number;
  total_amount: number;
  entries: SimplePayTransactionEntry[];
}

// Transformed Transaction History
export interface TransactionHistoryReport {
  periodStart: Date;
  periodEnd: Date;
  totalEntries: number;
  totalAmountCents: number;
  entries: {
    id: number;
    employeeId: number;
    employeeName: string;
    date: Date;
    code: string;
    description: string;
    type: 'earning' | 'deduction' | 'company_contribution';
    amountCents: number;
    payRunId: string;
  }[];
}

// Variance Report
export interface SimplePayVarianceEntry {
  employee_id: number;
  employee_name: string;
  item_code: string;
  item_description: string;
  period1_amount: number;
  period2_amount: number;
  variance_amount: number;
  variance_percentage: number;
}

export interface SimplePayVarianceReport {
  period1_start: string;
  period1_end: string;
  period2_start: string;
  period2_end: string;
  total_variance: number;
  entries: SimplePayVarianceEntry[];
}

// Transformed Variance Report
export interface VarianceReport {
  period1Start: Date;
  period1End: Date;
  period2Start: Date;
  period2End: Date;
  totalVarianceCents: number;
  entries: {
    employeeId: number;
    employeeName: string;
    itemCode: string;
    itemDescription: string;
    period1AmountCents: number;
    period2AmountCents: number;
    varianceAmountCents: number;
    variancePercentage: number;
  }[];
}

// Leave Liability Report
export interface SimplePayLeaveLiabilityEntry {
  employee_id: number;
  employee_name: string;
  leave_type_id: number;
  leave_type_name: string;
  balance_days: number;
  balance_hours: number;
  daily_rate: number;
  liability_amount: number;
}

export interface SimplePayLeaveLiabilityReport {
  as_at_date: string;
  total_liability: number;
  entries: SimplePayLeaveLiabilityEntry[];
}

// Transformed Leave Liability Report
export interface LeaveLiabilityReport {
  asAtDate: Date;
  totalLiabilityCents: number;
  entries: {
    employeeId: number;
    employeeName: string;
    leaveTypeId: number;
    leaveTypeName: string;
    balanceDays: number;
    balanceHours: number;
    dailyRateCents: number;
    liabilityAmountCents: number;
  }[];
}

// Leave Comparison Report
export interface SimplePayLeaveComparisonEntry {
  employee_id: number;
  employee_name: string;
  leave_type_id: number;
  leave_type_name: string;
  year1_taken: number;
  year2_taken: number;
  difference: number;
}

export interface SimplePayLeaveComparisonReport {
  year1: number;
  year2: number;
  entries: SimplePayLeaveComparisonEntry[];
}

// Transformed Leave Comparison Report
export interface LeaveComparisonReport {
  year1: number;
  year2: number;
  entries: {
    employeeId: number;
    employeeName: string;
    leaveTypeId: number;
    leaveTypeName: string;
    year1TakenDays: number;
    year2TakenDays: number;
    differenceDays: number;
  }[];
}

// Tracked Balances Report
export interface SimplePayTrackedBalanceEntry {
  employee_id: number;
  employee_name: string;
  balance_type: string;
  balance_name: string;
  opening_balance: number;
  additions: number;
  deductions: number;
  closing_balance: number;
}

export interface SimplePayTrackedBalancesReport {
  as_at_date: string;
  entries: SimplePayTrackedBalanceEntry[];
}

// Transformed Tracked Balances Report
export interface TrackedBalancesReport {
  asAtDate: Date;
  entries: {
    employeeId: number;
    employeeName: string;
    balanceType: string;
    balanceName: string;
    openingBalanceCents: number;
    additionsCents: number;
    deductionsCents: number;
    closingBalanceCents: number;
  }[];
}

// Union type for all report results
export type ReportResult =
  | EtiReport
  | TransactionHistoryReport
  | VarianceReport
  | LeaveLiabilityReport
  | LeaveComparisonReport
  | TrackedBalancesReport;

// ============================================
// Async Report Types
// ============================================

// SimplePay async report status response
export interface SimplePayAsyncReportStatus {
  uuid: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress_percentage?: number;
  download_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// Transformed async report status
export interface AsyncReportStatus {
  uuid: string;
  status: ReportStatus;
  progressPercentage: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

// ============================================
// Report Request with Tenant
// ============================================

export interface ReportRequestWithTenant extends IReportRequest {
  tenant: {
    id: string;
    name: string;
  };
}

// ============================================
// Report Generation Result
// ============================================

export interface ReportGenerationResult {
  success: boolean;
  reportRequestId: string;
  reportType: ReportType;
  status: ReportStatus;
  data: ReportResult | null;
  errorMessage: string | null;
}

// ============================================
// Filter Options
// ============================================

export interface ReportRequestFilterOptions {
  status?: ReportStatus;
  reportType?: ReportType;
  requestedBy?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}
