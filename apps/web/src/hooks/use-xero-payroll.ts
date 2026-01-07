/**
 * Xero Payroll Integration Hook
 * TASK-STAFF-003: Xero Payroll Journal UI
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient } from '@/lib/api';

// Types
export interface AccountMapping {
  id: string;
  tenantId: string;
  accountType: string;
  xeroAccountId: string;
  xeroAccountCode: string;
  xeroAccountName: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollJournalLine {
  id: string;
  accountType: string;
  description: string;
  debitCents: number;
  creditCents: number;
  xeroAccountCode?: string;
}

export interface PayrollJournal {
  id: string;
  tenantId: string;
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
  status: 'DRAFT' | 'PENDING' | 'POSTED' | 'FAILED';
  totalDebitCents: number;
  totalCreditCents: number;
  xeroJournalId?: string;
  postedAt?: string;
  errorMessage?: string;
  lines: PayrollJournalLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountMappingParams {
  accountType: string;
  xeroAccountCode: string;
  xeroAccountName: string;
  xeroAccountId: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateAccountMappingParams {
  accountType?: string;
  xeroAccountCode?: string;
  xeroAccountName?: string;
  xeroAccountId?: string;
  description?: string;
  isActive?: boolean;
}

export interface GenerateJournalParams {
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
}

// API Endpoints
const ENDPOINTS = {
  accountMappings: '/xero/account-mappings',
  payrollJournals: '/xero/payroll-journals',
};

// Query Keys
export const xeroPayrollKeys = {
  all: ['xero-payroll'] as const,
  accountMappings: () => [...xeroPayrollKeys.all, 'account-mappings'] as const,
  payrollJournals: (params?: Record<string, unknown>) =>
    [...xeroPayrollKeys.all, 'payroll-journals', params] as const,
  payrollJournal: (id: string) =>
    [...xeroPayrollKeys.all, 'payroll-journal', id] as const,
};

// Account Mappings Hooks

/**
 * Fetch all account mappings
 */
export function useAccountMappings() {
  return useQuery<AccountMapping[], AxiosError>({
    queryKey: xeroPayrollKeys.accountMappings(),
    queryFn: async () => {
      const { data } = await apiClient.get<AccountMapping[]>(
        ENDPOINTS.accountMappings
      );
      return data;
    },
  });
}

/**
 * Create a new account mapping
 */
export function useCreateAccountMapping() {
  const queryClient = useQueryClient();

  return useMutation<AccountMapping, AxiosError, CreateAccountMappingParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<AccountMapping>(
        ENDPOINTS.accountMappings,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.accountMappings(),
      });
    },
  });
}

/**
 * Update an existing account mapping
 */
export function useUpdateAccountMapping() {
  const queryClient = useQueryClient();

  return useMutation<
    AccountMapping,
    AxiosError,
    { id: string; data: UpdateAccountMappingParams }
  >({
    mutationFn: async ({ id, data: params }) => {
      const { data } = await apiClient.patch<AccountMapping>(
        `${ENDPOINTS.accountMappings}/${id}`,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.accountMappings(),
      });
    },
  });
}

/**
 * Delete an account mapping
 */
export function useDeleteAccountMapping() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: async (id) => {
      await apiClient.delete(`${ENDPOINTS.accountMappings}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.accountMappings(),
      });
    },
  });
}

// Payroll Journals Hooks

interface PayrollJournalsParams extends Record<string, unknown> {
  status?: string;
  limit?: number;
  offset?: number;
}

interface PayrollJournalsResponse {
  data: PayrollJournal[];
  total: number;
}

/**
 * Fetch payroll journals with optional filters
 */
export function usePayrollJournals(params?: PayrollJournalsParams) {
  return useQuery<PayrollJournalsResponse, AxiosError>({
    queryKey: xeroPayrollKeys.payrollJournals(params),
    queryFn: async () => {
      const { data } = await apiClient.get<PayrollJournalsResponse>(
        ENDPOINTS.payrollJournals,
        { params }
      );
      return data;
    },
  });
}

/**
 * Fetch a single payroll journal by ID
 */
export function usePayrollJournal(journalId: string, enabled = true) {
  return useQuery<PayrollJournal, AxiosError>({
    queryKey: xeroPayrollKeys.payrollJournal(journalId),
    queryFn: async () => {
      const { data } = await apiClient.get<PayrollJournal>(
        `${ENDPOINTS.payrollJournals}/${journalId}`
      );
      return data;
    },
    enabled: enabled && !!journalId,
  });
}

/**
 * Generate a new payroll journal for a period
 */
export function useGeneratePayrollJournal() {
  const queryClient = useQueryClient();

  return useMutation<PayrollJournal, AxiosError, GenerateJournalParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<PayrollJournal>(
        `${ENDPOINTS.payrollJournals}/generate`,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournals(),
      });
    },
  });
}

/**
 * Post a journal to Xero
 */
export function usePostToXero() {
  const queryClient = useQueryClient();

  return useMutation<PayrollJournal, AxiosError, string>({
    mutationFn: async (journalId) => {
      const { data } = await apiClient.post<PayrollJournal>(
        `${ENDPOINTS.payrollJournals}/${journalId}/post`
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournals(),
      });
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournal(data.id),
      });
    },
  });
}

/**
 * Sync journal status from Xero
 */
export function useSyncJournalStatus() {
  const queryClient = useQueryClient();

  return useMutation<PayrollJournal, AxiosError, string>({
    mutationFn: async (journalId) => {
      const { data } = await apiClient.post<PayrollJournal>(
        `${ENDPOINTS.payrollJournals}/${journalId}/sync`
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournals(),
      });
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournal(data.id),
      });
    },
  });
}

/**
 * Delete a draft payroll journal
 */
export function useDeletePayrollJournal() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: async (journalId) => {
      await apiClient.delete(`${ENDPOINTS.payrollJournals}/${journalId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: xeroPayrollKeys.payrollJournals(),
      });
    },
  });
}
