import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface ListTenantsParams {
  search?: string;
  subscriptionStatus?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

interface CreateTenantDto {
  name: string;
  email: string;
  ownerName: string;
  ownerEmail: string;
  phone?: string;
  subscriptionPlan?: string;
}

interface UpdateTenantDto {
  name?: string;
  email?: string;
  phone?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

export function useAdminTenants(params: ListTenantsParams = {}) {
  return useQuery({
    queryKey: ['admin', 'tenants', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const { data } = await apiClient.get(`/admin/tenants?${searchParams}`);
      return data;
    },
  });
}

export function useAdminTenant(id: string) {
  return useQuery({
    queryKey: ['admin', 'tenants', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/tenants/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useAdminTenantStats() {
  return useQuery({
    queryKey: ['admin', 'tenants', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/tenants/stats');
      return data;
    },
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTenantDto) => {
      const { data } = await apiClient.post('/admin/tenants', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateTenantDto }) => {
      const { data } = await apiClient.patch(`/admin/tenants/${id}`, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await apiClient.post(`/admin/tenants/${id}/suspend`, { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });
}

export function useActivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/admin/tenants/${id}/activate`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] });
    },
  });
}
