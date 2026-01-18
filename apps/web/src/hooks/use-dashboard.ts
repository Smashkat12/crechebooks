import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types for API responses
interface DashboardMetrics {
  period: string;
  revenue: {
    total: number;
    invoiced: number;
    collected: number;
    outstanding: number;
  };
  expenses: {
    total: number;
    categorized: number;
    uncategorized: number;
  };
  arrears: {
    total: number;
    count: number;
    overdueBy30: number;
    overdueBy60: number;
    overdueBy90: number;
  };
  enrollment: {
    total: number;
    active: number;
    inactive: number;
  };
  payments: {
    matched: number;
    unmatched: number;
    pending: number;
  };
}

interface TrendData {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
  arrears: number;
}

interface DashboardTrends {
  period: string;
  interval: 'daily' | 'weekly' | 'monthly';
  data: TrendData[];
}

// Get dashboard metrics
export function useDashboardMetrics(period?: string, year?: number) {
  return useQuery<DashboardMetrics, AxiosError>({
    queryKey: queryKeys.dashboard.metrics(period, year),
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardMetrics>(endpoints.dashboard.metrics, {
        params: { period, year },
      });
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds - dashboard data changes frequently
    refetchInterval: 60 * 1000, // Refetch every minute when on dashboard
  });
}

// Get dashboard trends
export function useDashboardTrends(period?: string, year?: number) {
  return useQuery<DashboardTrends, AxiosError>({
    queryKey: queryKeys.dashboard.trends(period, year),
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardTrends>(endpoints.dashboard.trends, {
        params: { period, year },
      });
      return data;
    },
    staleTime: 60 * 1000, // 1 minute - trends don't change as frequently
  });
}

// Types for available periods
interface FinancialYear {
  year: number;
  label: string;
  startDate: string;
  endDate: string;
}

interface AvailablePeriods {
  hasData: boolean;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
  availableFinancialYears: FinancialYear[];
}

// Get available periods for the tenant
export function useAvailablePeriods() {
  return useQuery<AvailablePeriods, AxiosError>({
    queryKey: queryKeys.dashboard.availablePeriods(),
    queryFn: async () => {
      const { data } = await apiClient.get<AvailablePeriods>(endpoints.dashboard.availablePeriods);
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - periods don't change frequently
  });
}
