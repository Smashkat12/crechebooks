/**
 * Dashboard Type Definitions
 */

// ============================================
// Dashboard Metrics Types
// ============================================

export type MetricsPeriod = 'current_month' | 'last_quarter' | 'ytd';

export interface DashboardMetrics {
  /** Total invoiced amount in cents */
  total_revenue_cents: number;
  /** Total collected (payments received) in cents */
  total_collected_cents: number;
  /** Outstanding arrears in cents */
  outstanding_arrears_cents: number;
  /** Number of active enrollments */
  active_enrollments: number;
  /** Number of parent accounts */
  parent_count: number;
  /** Number of staff members */
  staff_count: number;
  /** AI categorization accuracy (0-1) */
  categorization_accuracy?: number;
  /** Period for these metrics */
  period: MetricsPeriod;
  /** Period start date */
  period_from: string;
  /** Period end date */
  period_to: string;
}

// ============================================
// Dashboard Trends Types
// ============================================

export interface MonthlyTrendData {
  /** Month in YYYY-MM format */
  month: string;
  /** Revenue in cents */
  revenue_cents: number;
  /** Expenses in cents */
  expenses_cents: number;
  /** Number of new enrollments */
  new_enrollments: number;
  /** Number of ended enrollments */
  ended_enrollments: number;
}

export interface DashboardTrends {
  /** Year for the trends */
  year: number;
  /** Monthly data points */
  monthly_data: MonthlyTrendData[];
}

// ============================================
// API Request Types
// ============================================

export interface GetDashboardMetricsOptions {
  period?: MetricsPeriod;
}

export interface GetDashboardTrendsOptions {
  year?: number;
}
