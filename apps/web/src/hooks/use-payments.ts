import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IPayment } from '@crechebooks/types';

// Types for API responses
interface PaymentsListResponse {
  payments: IPayment[];
  total: number;
  page: number;
  limit: number;
}

interface PaymentListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: 'matched' | 'unmatched' | 'partially_matched';
  parentId?: string;
  startDate?: string;
  endDate?: string;
}

interface PaymentSuggestion {
  invoiceId: string;
  parentName: string;
  childName: string;
  amount: number;
  confidence: number;
  reason: string;
}

interface MatchPaymentsParams {
  paymentIds: string[];
}

interface AllocatePaymentParams {
  paymentId: string;
  allocations: {
    invoiceId: string;
    amount: number;
  }[];
}

// List payments with pagination and filters
export function usePaymentsList(params?: PaymentListParams) {
  return useQuery<PaymentsListResponse, AxiosError>({
    queryKey: queryKeys.payments.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<PaymentsListResponse>(endpoints.payments.list, {
        params,
      });
      return data;
    },
  });
}

// Get unmatched payments
export function useUnmatchedPayments() {
  return useQuery<IPayment[], AxiosError>({
    queryKey: queryKeys.payments.unmatched(),
    queryFn: async () => {
      const { data } = await apiClient.get<PaymentsListResponse>(endpoints.payments.list, {
        params: { status: 'unmatched', limit: 100 },
      });
      return data.payments;
    },
  });
}

// Get single payment detail
export function usePayment(id: string, enabled = true) {
  return useQuery<IPayment, AxiosError>({
    queryKey: queryKeys.payments.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<IPayment>(endpoints.payments.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Get matching suggestions for a payment
export function usePaymentSuggestions(id: string, enabled = true) {
  return useQuery<PaymentSuggestion[], AxiosError>({
    queryKey: queryKeys.payments.suggestions(id),
    queryFn: async () => {
      const { data } = await apiClient.get<PaymentSuggestion[]>(
        endpoints.payments.suggestions(id)
      );
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Match payments automatically
export function useMatchPayments() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; matched: number; unmatched: number },
    AxiosError,
    MatchPaymentsParams
  >({
    mutationFn: async ({ paymentIds }) => {
      const { data } = await apiClient.post<{
        success: boolean;
        matched: number;
        unmatched: number;
      }>(endpoints.payments.match, {
        paymentIds,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.arrears.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

// Manually allocate payment to invoices
export function useAllocatePayment() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, AxiosError, AllocatePaymentParams>({
    mutationFn: async ({ paymentId, allocations }) => {
      const { data } = await apiClient.post<{ success: boolean }>(
        endpoints.payments.allocate(paymentId),
        {
          allocations,
        }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.detail(variables.paymentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.arrears.all });
    },
  });
}
