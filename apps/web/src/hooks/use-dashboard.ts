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
export function useDashboardMetrics(period?: string) {
  return useQuery<DashboardMetrics, AxiosError>({
    queryKey: queryKeys.dashboard.metrics(period),
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardMetrics>(endpoints.dashboard.metrics, {
        params: { period },
      });
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds - dashboard data changes frequently
    refetchInterval: 60 * 1000, // Refetch every minute when on dashboard
  });
}

// Get dashboard trends
export function useDashboardTrends(period?: string) {
  return useQuery<DashboardTrends, AxiosError>({
    queryKey: queryKeys.dashboard.trends(period),
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardTrends>(endpoints.dashboard.trends, {
        params: { period },
      });
      return data;
    },
    staleTime: 60 * 1000, // 1 minute - trends don't change as frequently
  });
}
