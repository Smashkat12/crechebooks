/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * React Query hooks for impersonation functionality
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiClient, setAuthToken } from '@/lib/api/client';

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
  /** Impersonation JWT — use as Bearer token so tenant endpoints get the impersonation context */
  accessToken?: string;
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
  /** Restored admin JWT — update in-memory bearer token so subsequent requests use admin context */
  accessToken?: string;
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
  const router = useRouter();

  return useMutation({
    mutationFn: async (request: StartImpersonationRequest): Promise<ImpersonationResponse> => {
      const { data } = await apiClient.post('/admin/impersonate/start', request);
      return data;
    },
    onSuccess: (data) => {
      // TASK-ADMIN-001: Update in-memory bearer token with impersonation JWT.
      // apiClient uses Authorization: Bearer <token> (not the HttpOnly cookie), so
      // without this every tenant-scoped request sends the original admin JWT which
      // has no impersonation claim, causing TenantGuard to return 403 on all
      // tenant endpoints and the dashboard to hang.
      if (data.accessToken) {
        setAuthToken(data.accessToken);
      }

      // Clear all cached queries to avoid using stale data with old context
      queryClient.clear();

      // Soft-navigate so the in-memory bearer token survives. Earlier this used
      // window.location.href, which forced a full reload that wiped the module-
      // level authToken set above; the page would then fall back to the original
      // super-admin JWT from the NextAuth session, every tenant endpoint would
      // 403, and the impersonated dashboard hung in skeleton state.
      router.push('/dashboard');
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
    onSuccess: (data) => {
      // TASK-ADMIN-001: Restore the original admin JWT in-memory so subsequent
      // Bearer-authenticated requests stop using the impersonation token.
      // Without this the next API calls from the admin portal would still send
      // the old impersonation bearer and get 403s on admin-only endpoints.
      if (data.accessToken) {
        setAuthToken(data.accessToken);
      } else {
        // No restored token available (edge case) — clear the stale impersonation
        // token so the request interceptor falls back to the NextAuth session JWT.
        setAuthToken(null);
      }

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
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  return useQuery({
    queryKey: ['admin', 'impersonate', 'current'],
    queryFn: async (): Promise<CurrentImpersonationResponse> => {
      const { data } = await apiClient.get('/admin/impersonate/current');
      return data;
    },
    // Only fire for SUPER_ADMIN — all other roles get 403 from this endpoint
    enabled: role === 'SUPER_ADMIN',
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
