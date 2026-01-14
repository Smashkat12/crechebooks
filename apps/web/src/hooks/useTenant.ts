import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

export interface ClosureDate {
  date: string;
  description: string;
}

export interface Tenant {
  id: string;
  name: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  taxStatus: 'VAT_REGISTERED' | 'NOT_REGISTERED';
  vatRegistrationDate?: string;
  cumulativeTurnoverCents: number;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  xeroTenantId?: string;
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  invoiceDayOfMonth: number;
  invoiceDueDays: number;
  closureDates: ClosureDate[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTenantDto {
  name?: string;
  tradingName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  taxStatus?: 'VAT_REGISTERED' | 'NOT_REGISTERED';
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  invoiceDayOfMonth?: number;
  invoiceDueDays?: number;
  closureDates?: ClosureDate[];
}

/**
 * Fetch the current tenant (organization) for the authenticated user
 */
export function useTenant() {
  return useQuery<Tenant, AxiosError>({
    queryKey: queryKeys.tenant.me(),
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant>(endpoints.tenants.me);
      return data;
    },
  });
}

/**
 * Fetch a specific tenant by ID
 */
export function useTenantById(tenantId: string, enabled = true) {
  return useQuery<Tenant, AxiosError>({
    queryKey: queryKeys.tenant.detail(tenantId),
    queryFn: async () => {
      const { data } = await apiClient.get<Tenant>(
        endpoints.tenants.detail(tenantId)
      );
      return data;
    },
    enabled: enabled && !!tenantId,
  });
}

interface UpdateTenantParams {
  tenantId: string;
  data: UpdateTenantDto;
}

/**
 * Update a tenant's information
 */
export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation<Tenant, AxiosError, UpdateTenantParams>({
    mutationFn: async ({ tenantId, data }) => {
      const { data: response } = await apiClient.put<Tenant>(
        endpoints.tenants.update(tenantId),
        data
      );
      return response;
    },
    onSuccess: (data, variables) => {
      // Invalidate both the 'me' and specific tenant queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.tenant.me(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.tenant.detail(variables.tenantId),
      });
    },
  });
}
