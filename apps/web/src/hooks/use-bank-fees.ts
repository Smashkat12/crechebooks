/**
 * TASK-FIX-005: Bank Fee Configuration Hooks
 * React Query hooks for managing bank fee settings
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

/**
 * Supported South African bank
 */
export interface Bank {
  code: string;
  name: string;
}

/**
 * Fee rule configuration
 */
export interface FeeRule {
  id?: string;
  feeType: string;
  transactionTypes: string[];
  fixedAmountCents: number;
  percentageRate?: number;
  minimumAmountCents?: number;
  maximumAmountCents?: number;
  isActive: boolean;
  description?: string;
}

/**
 * Bank fee configuration for a tenant
 */
export interface BankFeeConfiguration {
  tenantId: string;
  bankName?: string;
  accountNumber?: string;
  feeRules: FeeRule[];
  defaultTransactionFeeCents: number;
  isEnabled: boolean;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * Hook to get current bank fee configuration
 */
export function useBankFeeConfig() {
  return useQuery<BankFeeConfiguration, AxiosError>({
    queryKey: queryKeys.bankFees.config(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<BankFeeConfiguration>>(
        endpoints.bankFees.config
      );
      return data.data;
    },
  });
}

/**
 * Hook to get list of supported banks
 */
export function useSupportedBanks() {
  return useQuery<Bank[], AxiosError>({
    queryKey: queryKeys.bankFees.banks(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Bank[]>>(
        endpoints.bankFees.banks
      );
      return data.data;
    },
  });
}

/**
 * Hook to get default fee rules for a specific bank
 */
export function useBankDefaults(bankCode: string | null) {
  return useQuery<FeeRule[], AxiosError>({
    queryKey: queryKeys.bankFees.bankDefaults(bankCode || ''),
    queryFn: async () => {
      if (!bankCode) return [];
      const { data } = await apiClient.get<ApiResponse<FeeRule[]>>(
        endpoints.bankFees.bankDefaults(bankCode)
      );
      return data.data;
    },
    enabled: !!bankCode,
  });
}

/**
 * Hook to update bank fee configuration
 */
export function useUpdateBankFeeConfig() {
  const queryClient = useQueryClient();

  return useMutation<BankFeeConfiguration, AxiosError, Partial<BankFeeConfiguration>>({
    mutationFn: async (config) => {
      const { data } = await apiClient.put<ApiResponse<BankFeeConfiguration>>(
        endpoints.bankFees.config,
        config
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bankFees.all });
    },
  });
}

/**
 * Hook to apply a bank preset
 */
export function useApplyBankPreset() {
  const queryClient = useQueryClient();

  return useMutation<BankFeeConfiguration, AxiosError, string>({
    mutationFn: async (bankCode) => {
      const { data } = await apiClient.post<ApiResponse<BankFeeConfiguration>>(
        endpoints.bankFees.applyPreset,
        { bankCode }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bankFees.all });
    },
  });
}

/**
 * Format fee amount from cents to ZAR
 */
export function formatFeeAmount(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

/**
 * Parse ZAR amount to cents
 */
export function parseFeeToCents(amount: string | number): number {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.round(numAmount * 100);
}
