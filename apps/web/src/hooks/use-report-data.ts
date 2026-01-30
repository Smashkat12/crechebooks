/**
 * Report Data Fetching Hook
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module hooks/use-report-data
 * @description Hook for fetching report data with caching and error handling.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS - errors must propagate
 * - Proper caching with staleTime
 * - All amounts in cents from API
 */

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient } from '@/lib/api/client';
import { ReportType } from '@crechebooks/types';
import type { DateRange } from '@/components/reports/date-range-picker';

/**
 * Monthly trend data point for charts.
 */
export interface MonthlyTrendPoint {
  month: string;
  income: number;
  expenses: number;
}

/**
 * Category breakdown for pie charts.
 */
export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

/**
 * Monthly comparison data point.
 */
export interface ComparisonPoint {
  month: string;
  current: number;
  previous: number;
  percentageChange: number;
}

/**
 * Profit margin data point.
 */
export interface ProfitMarginPoint {
  month: string;
  netProfit: number;
  marginPercent: number;
}

/**
 * Chart data ready for frontend visualization.
 */
export interface ChartData {
  monthlyTrend: MonthlyTrendPoint[];
  expenseBreakdown: CategoryBreakdown[];
  monthlyComparison: ComparisonPoint[];
  profitMargin: ProfitMarginPoint[];
}

/**
 * Historical data point for trend analysis.
 */
export interface HistoricalDataPoint {
  period: string;
  totalIncomeCents: number;
  totalExpensesCents: number;
  netProfitCents: number;
}

/**
 * Account breakdown for report sections.
 */
export interface AccountBreakdown {
  accountCode: string;
  accountName: string;
  amountCents: number;
  amountRands: number;
}

/**
 * Report section with breakdown.
 */
export interface ReportSection {
  title: string;
  totalCents: number;
  totalRands: number;
  breakdown: AccountBreakdown[];
}

/**
 * Report summary section.
 */
export interface ReportSummary {
  totalIncomeCents: number;
  totalIncomeRands: number;
  totalExpensesCents: number;
  totalExpensesRands: number;
  netProfitCents: number;
  netProfitRands: number;
  profitMarginPercent: number;
}

/**
 * Period information.
 */
export interface Period {
  start: string;
  end: string;
}

/**
 * Full report data response from API.
 */
export interface ReportDataResponse {
  type: ReportType;
  tenantId: string;
  period: Period;
  generatedAt: string;
  summary: ReportSummary;
  sections: ReportSection[];
  chartData: ChartData;
  historical: HistoricalDataPoint[];
}

/**
 * Query key factory for report data.
 */
export const reportDataQueryKeys = {
  all: ['report-data'] as const,
  data: (type: ReportType | undefined, from: string | undefined, to: string | undefined) =>
    [...reportDataQueryKeys.all, type, from, to] as const,
};

/**
 * Hook for fetching report data.
 *
 * @param type - Report type (INCOME_STATEMENT, BALANCE_SHEET, etc.)
 * @param dateRange - Date range with from and to dates
 * @returns TanStack Query result with report data
 *
 * @example
 * const { data, isLoading, error, refetch } = useReportData(
 *   ReportType.INCOME_STATEMENT,
 *   { from: new Date('2025-01-01'), to: new Date('2025-01-31') }
 * );
 */
export function useReportData(type: ReportType | undefined, dateRange: DateRange | undefined) {
  const fromDate = dateRange?.from?.toISOString().split('T')[0];
  const toDate = dateRange?.to?.toISOString().split('T')[0];

  return useQuery<ReportDataResponse | null, AxiosError>({
    queryKey: reportDataQueryKeys.data(type, fromDate, toDate),
    queryFn: async () => {
      // Return null if required params are missing - this is expected, not an error
      if (!type || !dateRange?.from || !dateRange?.to) {
        return null;
      }

      const { data } = await apiClient.get<ReportDataResponse>(`/reports/${type}/data`, {
        params: {
          start: dateRange.from.toISOString(),
          end: dateRange.to.toISOString(),
          includeHistorical: true,
        },
      });

      return data;
    },
    enabled: !!type && !!dateRange?.from && !!dateRange?.to,
    staleTime: 5 * 60 * 1000, // 5 minutes - report data doesn't change frequently
    retry: 2, // Retry twice on failure
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });
}
