/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * React Query hooks for impersonation functionality
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// Types matching backend DTOs
export type ImpersonationRole = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';

export interface TenantForImpersonation {
  id: string;
  name: string;
  tradingName?: string;
  email: string;
  subscriptionStatus: string;
  availableRoles: ImpersonationRole[];
  userCount: number;
  childCount: number;
}

export interface TenantsForImpersonationResponse {
  tenants: TenantForImpersonation[];
  total: number;
}

export interface StartImpersonationRequest {
  tenantId: string;
  role: ImpersonationRole;
  reason?: string;
}

export interface ImpersonationSession {
  id: string;
  superAdminId: string;
  targetTenantId: string;
  tenantName: string;
  assumedRole: ImpersonationRole;
  startedAt: string;
  endedAt?: string;
  expiresAt: string;
  isActive: boolean;
  reason?: string;
}

export interface ImpersonationResponse {
  success: boolean;
  message: string;
  session: ImpersonationSession;
  expiresIn: number;
}

export interface CurrentImpersonationResponse {
  isImpersonating: boolean;
  session?: ImpersonationSession;
  timeRemaining?: number;
}

export interface EndImpersonationResponse {
  success: boolean;
  message: string;
  session?: ImpersonationSession;
}

export interface ImpersonationSessionHistory {
  sessions: ImpersonationSession[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Hook to fetch tenants available for impersonation
 */
export function useTenantsForImpersonation(search?: string) {
  return useQuery({
    queryKey: ['admin', 'impersonate', 'tenants', search],
    queryFn: async (): Promise<TenantsForImpersonationResponse> => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const { data } = await apiClient.get(`/admin/impersonate/tenants${params}`);
      return data;
    },
  });
}

/**
 * Hook to start impersonation session
 */
export function useStartImpersonation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: StartImpersonationRequest): Promise<ImpersonationResponse> => {
      const { data } = await apiClient.post('/admin/impersonate/start', request);
      return data;
    },
    onSuccess: () => {
      // Clear all cached queries to avoid using stale data with old context
      // Don't refetch immediately - let the new page load fresh
      queryClient.clear();

      // Navigate to dashboard with impersonation active
      // Use window.location to ensure a full page reload with fresh cookies
      window.location.href = '/dashboard';
    },
  });
}

/**
 * Hook to end impersonation session
 */
export function useEndImpersonation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<EndImpersonationResponse> => {
      const { data } = await apiClient.post('/admin/impersonate/end');
      return data;
    },
    onSuccess: () => {
      // Clear all cached queries to avoid using stale data with old context
      queryClient.clear();

      // Navigate back to admin portal with full page reload
      // This ensures fresh cookies are used for subsequent requests
      window.location.href = '/admin';
    },
  });
}

/**
 * Hook to get current impersonation session
 */
export function useCurrentImpersonation() {
  return useQuery({
    queryKey: ['admin', 'impersonate', 'current'],
    queryFn: async (): Promise<CurrentImpersonationResponse> => {
      const { data } = await apiClient.get('/admin/impersonate/current');
      return data;
    },
    // Refresh every minute to keep time remaining accurate
    refetchInterval: 60000,
    // Don't refetch on window focus to avoid unnecessary API calls
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get impersonation session history
 */
export function useImpersonationHistory(params?: {
  tenantId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'impersonate', 'sessions', params],
    queryFn: async (): Promise<ImpersonationSessionHistory> => {
      const searchParams = new URLSearchParams();
      if (params?.tenantId) searchParams.set('tenantId', params.tenantId);
      if (params?.isActive !== undefined) searchParams.set('isActive', String(params.isActive));
      if (params?.page) searchParams.set('page', String(params.page));
      if (params?.limit) searchParams.set('limit', String(params.limit));

      const query = searchParams.toString();
      const { data } = await apiClient.get(`/admin/impersonate/sessions${query ? `?${query}` : ''}`);
      return data;
    },
  });
}

/**
 * Utility to format time remaining for display
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}
