/**
 * TASK-ACCT-UI-003: Cash Flow React Query hooks
 * Provides data fetching for cash flow statement, trends, and summary.
 */

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export interface CashFlowAdjustment {
  name: string;
  amountCents: number;
  description?: string;
}

export interface OperatingActivities {
  netIncomeCents: number;
  adjustments: {
    depreciation: number;
    receivablesChange: number;
    payablesChange: number;
    prepaidExpensesChange: number;
    accruedExpensesChange: number;
    otherAdjustments: number;
  };
  adjustmentDetails: CashFlowAdjustment[];
  totalAdjustmentsCents: number;
  netCashFromOperatingCents: number;
}

export interface InvestingActivities {
  assetPurchasesCents: number;
  assetSalesCents: number;
  equipmentPurchasesCents: number;
  investmentPurchasesCents: number;
  investmentSalesCents: number;
  netCashFromInvestingCents: number;
}

export interface FinancingActivities {
  loanProceedsCents: number;
  loanRepaymentsCents: number;
  ownerContributionsCents: number;
  ownerDrawingsCents: number;
  netCashFromFinancingCents: number;
}

export interface CashFlowSummary {
  netCashChangeCents: number;
  openingCashBalanceCents: number;
  closingCashBalanceCents: number;
  cashReconciles: boolean;
}

export interface CashFlowPeriod {
  startDate: string;
  endDate: string;
}

export interface CashFlowStatement {
  period: CashFlowPeriod;
  operatingActivities: OperatingActivities;
  investingActivities: InvestingActivities;
  financingActivities: FinancingActivities;
  summary: CashFlowSummary;
  comparative?: {
    period: CashFlowPeriod;
    operatingActivities: OperatingActivities;
    investingActivities: InvestingActivities;
    financingActivities: FinancingActivities;
    summary: CashFlowSummary;
  };
}

export interface CashFlowTrendPeriod {
  period: string;
  operatingCents: number;
  investingCents: number;
  financingCents: number;
  netChangeCents: number;
  closingBalanceCents: number;
}

export interface CashFlowTrend {
  periods: CashFlowTrendPeriod[];
}

export interface CashFlowParams extends Record<string, unknown> {
  fromDate: string;
  toDate: string;
  includeComparative?: boolean;
}

// API response wrapper types
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Get cash flow statement for a date range
 */
export function useCashFlowStatement(params: CashFlowParams) {
  return useQuery<CashFlowStatement, AxiosError>({
    queryKey: queryKeys.cashFlow.statement(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CashFlowStatement>>(
        endpoints.cashFlow.statement,
        {
          params: {
            from_date: params.fromDate,
            to_date: params.toDate,
            include_comparative: params.includeComparative,
          },
        }
      );
      return data.data;
    },
    enabled: !!params.fromDate && !!params.toDate,
  });
}

/**
 * Get cash flow trend data for charts
 */
export function useCashFlowTrend(fromDate: string, toDate: string) {
  return useQuery<CashFlowTrend, AxiosError>({
    queryKey: queryKeys.cashFlow.trend({ fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CashFlowTrend>>(
        endpoints.cashFlow.trend,
        {
          params: { from_date: fromDate, to_date: toDate },
        }
      );
      return data.data;
    },
    enabled: !!fromDate && !!toDate,
  });
}

/**
 * Get cash flow summary
 */
export function useCashFlowSummary(fromDate: string, toDate: string) {
  return useQuery<CashFlowSummary, AxiosError>({
    queryKey: queryKeys.cashFlow.summary({ fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CashFlowSummary>>(
        endpoints.cashFlow.summary,
        {
          params: { from_date: fromDate, to_date: toDate },
        }
      );
      return data.data;
    },
    enabled: !!fromDate && !!toDate,
  });
}
