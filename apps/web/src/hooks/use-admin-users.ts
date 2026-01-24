import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface ListUsersParams {
  search?: string;
  tenantId?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export function useAdminUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.set(key, String(value));
        }
      });
      const { data } = await apiClient.get(`/admin/users?${searchParams}`);
      return data;
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/users/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useAdminUserStats() {
  return useQuery({
    queryKey: ['admin', 'users', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/users/stats');
      return data;
    },
  });
}

export function useUserActivity(id: string) {
  return useQuery({
    queryKey: ['admin', 'users', id, 'activity'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/admin/users/${id}/activity`);
      return data;
    },
    enabled: !!id,
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/admin/users/${id}/deactivate`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useActivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/admin/users/${id}/activate`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useImpersonateUser() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/admin/users/${id}/impersonate`);
      return data;
    },
  });
}
