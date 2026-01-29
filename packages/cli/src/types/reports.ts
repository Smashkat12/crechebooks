/**
 * Reports Type Definitions
 */

// ============================================
// Arrears Report Types
// ============================================

export interface AgingBuckets {
  /** Current (0-30 days) */
  current_cents: number;
  /** 31-60 days overdue */
  days_30_cents: number;
  /** 61-90 days overdue */
  days_60_cents: number;
  /** 90+ days overdue */
  days_90_cents: number;
}

export interface DebtorInfo {
  /** Parent ID */
  parent_id: string;
  /** Parent name */
  name: string;
  /** Parent email */
  email: string;
  /** Parent phone */
  phone?: string;
  /** Total outstanding in cents */
  outstanding_cents: number;
  /** Oldest unpaid invoice date */
  oldest_invoice_date?: string;
  /** Maximum days overdue */
  max_days_overdue: number;
}

export interface ArrearsReport {
  /** Total outstanding arrears in cents */
  total_outstanding_cents: number;
  /** Breakdown by aging bucket */
  aging_buckets: AgingBuckets;
  /** List of top debtors sorted by amount */
  top_debtors: DebtorInfo[];
  /** Report generation timestamp */
  generated_at: string;
}

// ============================================
// Financial Report Types
// ============================================

export type FinancialReportType = 'income' | 'expense' | 'pnl';

export interface CategoryAmount {
  /** Category name */
  category: string;
  /** Amount in cents */
  amount_cents: number;
  /** Percentage of total */
  percentage: number;
}

export interface FinancialReport {
  /** Report type */
  type: FinancialReportType;
  /** Period start date */
  period_from: string;
  /** Period end date */
  period_to: string;
  /** Income categories (for income and pnl reports) */
  income_categories: CategoryAmount[];
  /** Expense categories (for expense and pnl reports) */
  expense_categories: CategoryAmount[];
  /** Total income in cents */
  total_income_cents: number;
  /** Total expenses in cents */
  total_expenses_cents: number;
  /** Report generation timestamp */
  generated_at: string;
}

export interface GetFinancialReportOptions {
  type: FinancialReportType;
  from?: string;
  to?: string;
}

// ============================================
// Audit Log Types
// ============================================

export interface AuditLogEntry {
  /** Entry ID */
  id: string;
  /** Timestamp */
  timestamp: string;
  /** User ID who performed the action */
  user_id: string;
  /** User email (if available) */
  user_email?: string;
  /** Action type */
  action: 'create' | 'update' | 'delete';
  /** Entity type */
  entity_type: string;
  /** Entity ID */
  entity_id: string;
  /** Changes made (before/after for updates) */
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
}

export interface GetAuditLogOptions {
  from?: string;
  to?: string;
  entityType?: string;
  action?: string;
  limit?: number;
}

// ============================================
// Aging Report Types
// ============================================

export interface AgingBucket {
  /** Amount in cents */
  amount_cents: number;
  /** Number of accounts in this bucket */
  count: number;
}

export interface AgingBuckets2 {
  /** Current (not yet due) */
  current: AgingBucket;
  /** 1-30 days overdue */
  days_1_30: AgingBucket;
  /** 31-60 days overdue */
  days_31_60: AgingBucket;
  /** 61-90 days overdue */
  days_61_90: AgingBucket;
  /** 90+ days overdue */
  days_over_90: AgingBucket;
}

export interface AgingAccountDetail {
  /** Parent ID */
  parent_id: string;
  /** Parent name */
  parent_name: string;
  /** Parent email */
  parent_email: string;
  /** Current (not yet due) */
  current_cents: number;
  /** 1-30 days overdue */
  days_1_30_cents: number;
  /** 31-60 days overdue */
  days_31_60_cents: number;
  /** 61-90 days overdue */
  days_61_90_cents: number;
  /** 90+ days overdue */
  days_over_90_cents: number;
  /** Total outstanding */
  total_cents: number;
}

export interface AgingReport {
  /** Total outstanding in cents */
  total_outstanding_cents: number;
  /** Aging buckets summary */
  buckets: AgingBuckets2;
  /** Average days outstanding */
  average_days_outstanding: number;
  /** Detailed account breakdown */
  accounts: AgingAccountDetail[];
  /** Report generation timestamp */
  generated_at: string;
}
