import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface ListAuditLogsParams {
  search?: string;
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export function useAdminAuditLogs(params: ListAuditLogsParams = {}) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const { data } = await apiClient.get(`/admin/audit-logs?${searchParams}`);
      return data;
    },
  });
}

export function useAuditLogStats() {
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/audit-logs/stats');
      return data;
    },
  });
}

export function useAuditLogFilters() {
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'filters'],
    queryFn: async () => {
      const [actionsRes, resourceTypesRes] = await Promise.all([
        apiClient.get('/admin/audit-logs/actions'),
        apiClient.get('/admin/audit-logs/resource-types'),
      ]);
      return { actions: actionsRes.data, resourceTypes: resourceTypesRes.data };
    },
  });
}
