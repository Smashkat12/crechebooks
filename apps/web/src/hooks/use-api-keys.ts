import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

// Scope definitions matching backend ApiKeyScope enum
export const API_KEY_SCOPES = {
  // Read scopes
  READ_TENANTS: 'READ_TENANTS',
  READ_PARENTS: 'READ_PARENTS',
  READ_CHILDREN: 'READ_CHILDREN',
  READ_STAFF: 'READ_STAFF',
  READ_INVOICES: 'READ_INVOICES',
  READ_PAYMENTS: 'READ_PAYMENTS',
  READ_TRANSACTIONS: 'READ_TRANSACTIONS',
  READ_REPORTS: 'READ_REPORTS',
  // Write scopes
  WRITE_PARENTS: 'WRITE_PARENTS',
  WRITE_CHILDREN: 'WRITE_CHILDREN',
  WRITE_STAFF: 'WRITE_STAFF',
  WRITE_INVOICES: 'WRITE_INVOICES',
  WRITE_PAYMENTS: 'WRITE_PAYMENTS',
  WRITE_TRANSACTIONS: 'WRITE_TRANSACTIONS',
  // Admin scopes
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_API_KEYS: 'MANAGE_API_KEYS',
  MANAGE_INTEGRATIONS: 'MANAGE_INTEGRATIONS',
  // Full access
  FULL_ACCESS: 'FULL_ACCESS',
} as const;

export type ApiKeyScope = keyof typeof API_KEY_SCOPES;

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  description: string | null;
  environment: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  secretKey: string;
}

export interface CreateApiKeyDto {
  name: string;
  scopes: ApiKeyScope[];
  description?: string;
  environment?: 'local' | 'staging' | 'production';
  expiresInDays?: number;
}

interface ListApiKeysParams {
  includeRevoked?: boolean;
}

export function useApiKeys(params: ListApiKeysParams = {}) {
  return useQuery({
    queryKey: ['api-keys', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.includeRevoked) {
        searchParams.set('includeRevoked', 'true');
      }
      const url = `${endpoints.apiKeys.list}${searchParams.toString() ? `?${searchParams}` : ''}`;
      const { data } = await apiClient.get<ApiKey[]>(url);
      return data;
    },
  });
}

export function useApiKey(id: string) {
  return useQuery({
    queryKey: ['api-keys', id],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiKey>(endpoints.apiKeys.detail(id));
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateApiKeyDto) => {
      const { data } = await apiClient.post<ApiKeyWithSecret>(endpoints.apiKeys.create, dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.delete<{ success: boolean; message: string }>(
        endpoints.apiKeys.revoke(id)
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRotateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiKeyWithSecret>(endpoints.apiKeys.rotate(id));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

// Scope groupings for UI display
export const SCOPE_GROUPS = {
  read: {
    label: 'Read Access',
    description: 'View data without making changes',
    scopes: [
      { value: 'READ_TENANTS', label: 'Tenants', description: 'View organization details' },
      { value: 'READ_PARENTS', label: 'Parents', description: 'View parent/guardian records' },
      { value: 'READ_CHILDREN', label: 'Children', description: 'View child records' },
      { value: 'READ_STAFF', label: 'Staff', description: 'View staff members' },
      { value: 'READ_INVOICES', label: 'Invoices', description: 'View invoices' },
      { value: 'READ_PAYMENTS', label: 'Payments', description: 'View payment records' },
      { value: 'READ_TRANSACTIONS', label: 'Transactions', description: 'View bank transactions' },
      { value: 'READ_REPORTS', label: 'Reports', description: 'View financial reports' },
    ],
  },
  write: {
    label: 'Write Access',
    description: 'Create and modify data',
    scopes: [
      { value: 'WRITE_PARENTS', label: 'Parents', description: 'Create/update parents' },
      { value: 'WRITE_CHILDREN', label: 'Children', description: 'Create/update children' },
      { value: 'WRITE_STAFF', label: 'Staff', description: 'Create/update staff' },
      { value: 'WRITE_INVOICES', label: 'Invoices', description: 'Create/update invoices' },
      { value: 'WRITE_PAYMENTS', label: 'Payments', description: 'Record/allocate payments' },
      { value: 'WRITE_TRANSACTIONS', label: 'Transactions', description: 'Categorize transactions' },
    ],
  },
  admin: {
    label: 'Admin Access',
    description: 'Manage system settings',
    scopes: [
      { value: 'MANAGE_USERS', label: 'Users', description: 'Manage user accounts' },
      { value: 'MANAGE_API_KEYS', label: 'API Keys', description: 'Create/revoke API keys' },
      { value: 'MANAGE_INTEGRATIONS', label: 'Integrations', description: 'Configure integrations' },
    ],
  },
} as const;
