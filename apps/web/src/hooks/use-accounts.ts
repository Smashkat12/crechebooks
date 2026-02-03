/**
 * TASK-ACCT-UI-001: Chart of Accounts React Query hooks
 * Provides data fetching and mutations for account management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountSubType =
  | 'BANK'
  | 'CURRENT_ASSET'
  | 'FIXED_ASSET'
  | 'CURRENT_LIABILITY'
  | 'LONG_TERM_LIABILITY'
  | 'EQUITY'
  | 'OPERATING_REVENUE'
  | 'OTHER_REVENUE'
  | 'COST_OF_SALES'
  | 'OPERATING_EXPENSE'
  | 'OTHER_EXPENSE';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: AccountSubType | null;
  description: string | null;
  parentId: string | null;
  isEducationExempt: boolean;
  isSystem: boolean;
  isActive: boolean;
  xeroAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountListParams extends Record<string, unknown> {
  type?: AccountType;
  isActive?: boolean;
  search?: string;
}

export interface CreateAccountDto {
  code: string;
  name: string;
  type: AccountType;
  subType?: AccountSubType;
  description?: string;
  parentId?: string;
  isEducationExempt?: boolean;
  xeroAccountId?: string;
}

export interface UpdateAccountDto {
  name?: string;
  description?: string;
  subType?: AccountSubType;
  parentId?: string | null;
  isEducationExempt?: boolean;
  isActive?: boolean;
  xeroAccountId?: string;
}

export interface AccountSummary {
  type: AccountType;
  count: number;
  activeCount: number;
}

export interface TrialBalanceEntry {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: number;
  creditBalance: number;
}

export interface TrialBalanceResponse {
  asOfDate: string;
  entries: TrialBalanceEntry[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

// API response wrapper types
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
}

// List accounts with filters
export function useAccountsList(params?: AccountListParams) {
  return useQuery<Account[], AxiosError>({
    queryKey: queryKeys.accounts.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiListResponse<Account>>(endpoints.accounts.list, {
        params: {
          type: params?.type,
          is_active: params?.isActive,
          search: params?.search,
        },
      });
      return data.data;
    },
  });
}

// Get single account
export function useAccount(id: string, enabled = true) {
  return useQuery<Account, AxiosError>({
    queryKey: queryKeys.accounts.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Account>>(endpoints.accounts.detail(id));
      return data.data;
    },
    enabled: enabled && !!id,
  });
}

// Get account by code
export function useAccountByCode(code: string, enabled = true) {
  return useQuery<Account, AxiosError>({
    queryKey: queryKeys.accounts.byCode(code),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Account>>(endpoints.accounts.byCode(code));
      return data.data;
    },
    enabled: enabled && !!code,
  });
}

// Get account summary
export function useAccountSummary() {
  return useQuery<AccountSummary[], AxiosError>({
    queryKey: queryKeys.accounts.summary(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<AccountSummary[]>>(endpoints.accounts.summary);
      return data.data;
    },
  });
}

// Get education exempt accounts
export function useEducationExemptAccounts() {
  return useQuery<Account[], AxiosError>({
    queryKey: queryKeys.accounts.educationExempt(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiListResponse<Account>>(endpoints.accounts.educationExempt);
      return data.data;
    },
  });
}

// Get trial balance
export function useTrialBalance(asOfDate: string, enabled = true) {
  return useQuery<TrialBalanceResponse, AxiosError>({
    queryKey: queryKeys.accounts.trialBalance(asOfDate),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<TrialBalanceResponse>>(endpoints.accounts.trialBalance, {
        params: { as_of_date: asOfDate },
      });
      return data.data;
    },
    enabled: enabled && !!asOfDate,
  });
}

// Create account
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation<Account, AxiosError, CreateAccountDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto = {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        sub_type: dto.subType,
        description: dto.description,
        parent_id: dto.parentId,
        is_education_exempt: dto.isEducationExempt,
        xero_account_id: dto.xeroAccountId,
      };
      const { data } = await apiClient.post<ApiResponse<Account>>(endpoints.accounts.list, apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}

// Update account
export function useUpdateAccount(id: string) {
  const queryClient = useQueryClient();

  return useMutation<Account, AxiosError, UpdateAccountDto>({
    mutationFn: async (dto) => {
      // Transform to snake_case for API
      const apiDto: Record<string, unknown> = {};
      if (dto.name !== undefined) apiDto.name = dto.name;
      if (dto.description !== undefined) apiDto.description = dto.description;
      if (dto.subType !== undefined) apiDto.sub_type = dto.subType;
      if (dto.parentId !== undefined) apiDto.parent_id = dto.parentId;
      if (dto.isEducationExempt !== undefined) apiDto.is_education_exempt = dto.isEducationExempt;
      if (dto.isActive !== undefined) apiDto.is_active = dto.isActive;
      if (dto.xeroAccountId !== undefined) apiDto.xero_account_id = dto.xeroAccountId;

      const { data } = await apiClient.patch<ApiResponse<Account>>(endpoints.accounts.detail(id), apiDto);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(id) });
    },
  });
}

// Deactivate account
export function useDeactivateAccount() {
  const queryClient = useQueryClient();

  return useMutation<Account, AxiosError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post<ApiResponse<Account>>(endpoints.accounts.deactivate(id));
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}

// Reactivate account
export function useReactivateAccount() {
  const queryClient = useQueryClient();

  return useMutation<Account, AxiosError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.post<ApiResponse<Account>>(endpoints.accounts.reactivate(id));
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}

// Seed default accounts
export function useSeedDefaultAccounts() {
  const queryClient = useQueryClient();

  return useMutation<{ count: number }, AxiosError>({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<{ count: number }>>(endpoints.accounts.seedDefaults);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}
