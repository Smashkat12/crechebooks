import { IsUUID, IsOptional, IsDate, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Filters for querying arrears data
 */
export class ArrearsFiltersDto {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateFrom?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateTo?: Date;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minAmountCents?: number;
}

/**
 * Aging bucket type for categorizing overdue invoices
 *
 * STANDARDIZED aging categories (TASK-BILL-006):
 * - current: 1-30 days overdue (due but within grace period)
 * - 30: 31-60 days overdue
 * - 60: 61-90 days overdue
 * - 90+: >90 days overdue
 */
export type AgingBucketType = 'current' | '30' | '60' | '90+';

/**
 * Aging buckets for arrears report (all amounts in cents)
 *
 * STANDARDIZED aging buckets (TASK-BILL-006):
 * - current: 1-30 days overdue (due but within grace period)
 * - days30: 31-60 days overdue
 * - days60: 61-90 days overdue
 * - days90Plus: >90 days overdue
 *
 * NOTE: Invoices not yet due (daysOverdue <= 0) are NOT included in arrears.
 */
export interface AgingBuckets {
  /** Amount overdue 1-30 days (cents) */
  currentCents: number;

  /** Amount overdue 31-60 days (cents) */
  days30Cents: number;

  /** Amount overdue 61-90 days (cents) */
  days60Cents: number;

  /** Amount overdue >90 days (cents) */
  days90PlusCents: number;
}

/**
 * Summary statistics for arrears report (all amounts in cents)
 */
export interface ArrearsReportSummary {
  /** Total outstanding amount across all invoices (cents) */
  totalOutstandingCents: number;

  /** Total number of overdue invoices */
  totalInvoices: number;

  /** Breakdown by aging buckets */
  aging: AgingBuckets;
}

/**
 * Summary of arrears for a single debtor/parent (all amounts in cents)
 */
export interface DebtorSummary {
  /** Parent UUID */
  parentId: string;

  /** Parent full name */
  parentName: string;

  /** Parent email address */
  parentEmail: string | null;

  /** Parent phone number */
  parentPhone: string | null;

  /** Total outstanding amount for this parent (cents) */
  totalOutstandingCents: number;

  /** Date of the oldest overdue invoice */
  oldestInvoiceDate: Date;

  /** Number of overdue invoices */
  invoiceCount: number;

  /** Maximum days overdue across all invoices */
  maxDaysOverdue: number;
}

/**
 * Individual invoice in arrears (all amounts in cents)
 */
export interface ArrearsInvoice {
  /** Invoice UUID */
  invoiceId: string;

  /** Human-readable invoice number */
  invoiceNumber: string;

  /** Parent UUID */
  parentId: string;

  /** Parent full name */
  parentName: string;

  /** Child UUID */
  childId: string;

  /** Child full name */
  childName: string;

  /** Invoice issue date */
  issueDate: Date;

  /** Invoice due date */
  dueDate: Date;

  /** Total invoice amount (cents) */
  totalCents: number;

  /** Amount already paid (cents) */
  amountPaidCents: number;

  /** Outstanding amount (cents) */
  outstandingCents: number;

  /** Number of days overdue */
  daysOverdue: number;

  /** Aging bucket classification */
  agingBucket: AgingBucketType;
}

/**
 * Complete arrears report (all amounts in cents)
 */
export interface ArrearsReport {
  /** Summary statistics */
  summary: ArrearsReportSummary;

  /** Top debtors by outstanding amount */
  topDebtors: DebtorSummary[];

  /** All overdue invoices */
  invoices: ArrearsInvoice[];

  /** Report generation timestamp */
  generatedAt: Date;
}

/**
 * Single payment history entry for a parent (all amounts in cents)
 */
export interface PaymentHistoryEntry {
  /** Invoice UUID */
  invoiceId: string;

  /** Human-readable invoice number */
  invoiceNumber: string;

  /** Invoice issue date */
  invoiceDate: Date;

  /** Invoice due date */
  dueDate: Date;

  /** Date payment was made (null if unpaid) */
  paidDate: Date | null;

  /** Total invoice amount (cents) */
  totalCents: number;

  /** Amount paid (cents) */
  paidCents: number;

  /** Days from due date to payment (negative = early, null = unpaid) */
  daysToPayment: number | null;

  /** Payment status */
  status: 'paid' | 'partial' | 'overdue';
}

/**
 * Complete payment history for a parent (all amounts in cents)
 */
export interface ParentPaymentHistory {
  /** Parent UUID */
  parentId: string;

  /** Parent full name */
  parentName: string;

  /** Total amount invoiced (cents) */
  totalInvoicedCents: number;

  /** Total amount paid (cents) */
  totalPaidCents: number;

  /** Total amount still outstanding (cents) */
  totalOutstandingCents: number;

  /** Number of payments made on time */
  onTimePaymentCount: number;

  /** Number of late payments */
  latePaymentCount: number;

  /** Average days from due date to payment */
  averageDaysToPayment: number;

  /** Detailed payment history entries */
  paymentHistory: PaymentHistoryEntry[];
}
