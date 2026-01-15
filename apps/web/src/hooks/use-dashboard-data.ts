import { useQuery, useQueries, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

export interface DashboardSummary {
  totalChildren: number;
  activeEnrollments: number;
  pendingInvoices: number;
  outstandingAmount: number;
}

export interface Payment {
  id: string;
  parentId: string;
  parentName: string;
  amount: number;
  date: string;
  status: 'matched' | 'unmatched' | 'pending';
  invoiceRef?: string;
}

export interface Invoice {
  id: string;
  parentId: string;
  parentName: string;
  amount: number;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
}

export interface ArrearsAlert {
  id: string;
  parentId: string;
  parentName: string;
  amount: number;
  daysOverdue: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface DashboardMetrics {
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

export interface TrendData {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
  arrears: number;
}

export interface DashboardTrends {
  period: string;
  interval: 'daily' | 'weekly' | 'monthly';
  data: TrendData[];
}

export interface XeroStatus {
  connected: boolean;
  lastSyncAt?: string;
  syncStatus?: 'idle' | 'syncing' | 'error';
  organizationName?: string;
}

export interface DashboardDataResult {
  // Query results
  metrics: UseQueryResult<DashboardMetrics, AxiosError>;
  trends: UseQueryResult<DashboardTrends, AxiosError>;
  xeroStatus: UseQueryResult<XeroStatus, AxiosError>;

  // Aggregated states
  isLoading: boolean;
  isInitialLoading: boolean;
  hasError: boolean;
  errors: (Error | null)[];

  // Partial loading info
  partialDataLoaded: number;
  totalQueries: number;

  // Helper methods
  refetchAll: () => void;
  refetchFailed: () => void;
}

// ============================================================================
// Configuration
// ============================================================================

/** Query configuration with stale-while-revalidate strategy */
const QUERY_CONFIG = {
  metrics: {
    staleTime: 30_000,           // 30 seconds - metrics can change frequently
    gcTime: 5 * 60 * 1000,       // 5 minutes cache
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,     // Auto-refresh every minute
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  },
  trends: {
    staleTime: 60_000,           // 1 minute - trends don't change as frequently
    gcTime: 10 * 60 * 1000,      // 10 minutes cache
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
  },
  xeroStatus: {
    staleTime: 30_000,           // 30 seconds
    gcTime: 5 * 60 * 1000,       // 5 minutes cache
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 5000),
  },
} as const;

// ============================================================================
// API Functions
// ============================================================================

async function fetchDashboardMetrics(period?: string, year?: number): Promise<DashboardMetrics> {
  const { data } = await apiClient.get<DashboardMetrics>(endpoints.dashboard.metrics, {
    params: { period, year },
  });
  return data;
}

async function fetchDashboardTrends(period?: string, year?: number): Promise<DashboardTrends> {
  const { data } = await apiClient.get<DashboardTrends>(endpoints.dashboard.trends, {
    params: { period, year },
  });
  return data;
}

async function fetchXeroStatus(): Promise<XeroStatus> {
  const { data } = await apiClient.get<XeroStatus>(endpoints.xero.status);
  return data;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Comprehensive dashboard data hook with parallel queries and SWR caching strategy.
 *
 * Features:
 * - Parallel data fetching for independent queries
 * - Stale-while-revalidate caching strategy
 * - Partial data loading support (some widgets load while others fail)
 * - Automatic retry with exponential backoff
 * - Route-based prefetching
 * - Window focus revalidation
 *
 * @param tenantId - Optional tenant ID (uses current session if not provided)
 * @param year - Optional year filter for metrics
 * @param period - Optional period filter for metrics
 */
export function useDashboardData(
  tenantId?: string,
  year?: number,
  period?: string
): DashboardDataResult {
  const queryClient = useQueryClient();

  // Use parallel queries for independent data sources
  const queries = useQueries({
    queries: [
      {
        queryKey: queryKeys.dashboard.metrics(period, year),
        queryFn: () => fetchDashboardMetrics(period, year),
        ...QUERY_CONFIG.metrics,
      },
      {
        queryKey: queryKeys.dashboard.trends(period, year),
        queryFn: () => fetchDashboardTrends(period, year),
        ...QUERY_CONFIG.trends,
      },
      {
        queryKey: queryKeys.xero.status(),
        queryFn: fetchXeroStatus,
        ...QUERY_CONFIG.xeroStatus,
      },
    ],
  });

  // Destructure for easier access
  const [metricsQuery, trendsQuery, xeroStatusQuery] = queries;

  // Calculate aggregated states
  const isLoading = queries.some(q => q.isLoading);
  const isInitialLoading = queries.every(q => q.isLoading && !q.data);
  const hasError = queries.some(q => q.isError);
  const errors = queries.map(q => q.error);
  const partialDataLoaded = queries.filter(q => q.isSuccess || q.data).length;
  const totalQueries = queries.length;

  // Refetch all queries
  const refetchAll = useCallback(() => {
    queries.forEach(q => q.refetch());
  }, [queries]);

  // Refetch only failed queries
  const refetchFailed = useCallback(() => {
    queries.forEach(q => {
      if (q.isError) {
        q.refetch();
      }
    });
  }, [queries]);

  return {
    metrics: metricsQuery as UseQueryResult<DashboardMetrics, AxiosError>,
    trends: trendsQuery as UseQueryResult<DashboardTrends, AxiosError>,
    xeroStatus: xeroStatusQuery as UseQueryResult<XeroStatus, AxiosError>,
    isLoading,
    isInitialLoading,
    hasError,
    errors,
    partialDataLoaded,
    totalQueries,
    refetchAll,
    refetchFailed,
  };
}

// ============================================================================
// Prefetching Hook
// ============================================================================

/**
 * Hook to prefetch dashboard data on route change.
 * Call this in parent layouts or navigation components.
 */
export function usePrefetchDashboardData(year?: number, period?: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const prefetchDashboard = useCallback(async () => {
    // Prefetch all dashboard queries in parallel
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.metrics(period, year),
        queryFn: () => fetchDashboardMetrics(period, year),
        staleTime: QUERY_CONFIG.metrics.staleTime,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.trends(period, year),
        queryFn: () => fetchDashboardTrends(period, year),
        staleTime: QUERY_CONFIG.trends.staleTime,
      }),
      queryClient.prefetchQuery({
        queryKey: queryKeys.xero.status(),
        queryFn: fetchXeroStatus,
        staleTime: QUERY_CONFIG.xeroStatus.staleTime,
      }),
    ]);
  }, [queryClient, year, period]);

  return { prefetchDashboard };
}

// ============================================================================
// Individual Widget Hooks
// ============================================================================

/**
 * Hook for just the metrics summary widget.
 * Useful for partial loading scenarios.
 */
export function useDashboardMetricsOnly(period?: string, year?: number) {
  return useQuery<DashboardMetrics, AxiosError>({
    queryKey: queryKeys.dashboard.metrics(period, year),
    queryFn: () => fetchDashboardMetrics(period, year),
    ...QUERY_CONFIG.metrics,
  });
}

/**
 * Hook for just the trends chart widget.
 * Useful for partial loading scenarios.
 */
export function useDashboardTrendsOnly(period?: string, year?: number) {
  return useQuery<DashboardTrends, AxiosError>({
    queryKey: queryKeys.dashboard.trends(period, year),
    queryFn: () => fetchDashboardTrends(period, year),
    ...QUERY_CONFIG.trends,
  });
}

/**
 * Hook for just the Xero status widget.
 * Useful for partial loading scenarios.
 */
export function useXeroStatusOnly() {
  return useQuery<XeroStatus, AxiosError>({
    queryKey: queryKeys.xero.status(),
    queryFn: fetchXeroStatus,
    ...QUERY_CONFIG.xeroStatus,
  });
}

// ============================================================================
// Route Prefetch Effect
// ============================================================================

/**
 * Effect hook to automatically prefetch dashboard data when hovering over dashboard link.
 * Use this in navigation components.
 */
export function useDashboardPrefetchOnHover() {
  const { prefetchDashboard } = usePrefetchDashboardData();

  const handleMouseEnter = useCallback(() => {
    prefetchDashboard();
  }, [prefetchDashboard]);

  return { onMouseEnter: handleMouseEnter };
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Hook to invalidate dashboard cache.
 * Call this after mutations that affect dashboard data.
 */
export function useInvalidateDashboardCache() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.xero.status() });
  }, [queryClient]);

  const invalidateMetrics = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.all,
      predicate: (query) => query.queryKey.includes('metrics'),
    });
  }, [queryClient]);

  const invalidateTrends = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.all,
      predicate: (query) => query.queryKey.includes('trends'),
    });
  }, [queryClient]);

  return { invalidateAll, invalidateMetrics, invalidateTrends };
}
