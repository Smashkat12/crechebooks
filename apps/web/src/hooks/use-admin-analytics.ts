import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

type AnalyticsEndpoint = 'metrics' | 'tenant-growth' | 'user-growth' | 'subscriptions' | 'top-tenants' | 'activity';

export function useAdminAnalytics(endpoint: AnalyticsEndpoint, params?: Record<string, string>) {
  return useQuery({
    queryKey: ['admin', 'analytics', endpoint, params],
    queryFn: async () => {
      const searchParams = params ? new URLSearchParams(params).toString() : '';
      const url = `/admin/analytics/${endpoint}${searchParams ? `?${searchParams}` : ''}`;
      const { data } = await apiClient.get(url);
      return data;
    },
  });
}
