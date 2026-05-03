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

interface AllocatePaymentParams {
  paymentId: string;
  /**
   * Bank transaction UUID linked to this payment.
   * Required by POST /payments (transaction_id field).
   * Undefined for manually-posted payments with no bank transaction —
   * the mutation will reject early with a descriptive error.
   */
  transactionId?: string;
  allocations: {
    /** invoice_id matches the backend snake_case field */
    invoice_id: string;
    /** ZAR decimal amount (e.g. 3450.00 for R3 450). Backend converts to cents. */
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

// Manually allocate payment to invoices
//
// Calls POST /payments (not /payments/:id/allocate — that sub-route does not exist).
// Body shape matches ApiAllocatePaymentDto:
//   { transaction_id: string, allocations: [{ invoice_id, amount }] }
// where amount is ZAR decimal (the controller rounds to cents server-side).
//
// Payments without a linked bank transaction (transactionId undefined) cannot be
// allocated via this path. The mutationFn rejects immediately with a descriptive
// error so the dialog can surface it without a network round-trip.
export function useAllocatePayment() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, AxiosError, AllocatePaymentParams>({
    mutationFn: async ({ transactionId, allocations }) => {
      if (!transactionId) {
        throw new Error(
          'This payment has no linked bank transaction and cannot be allocated through this dialog.'
        );
      }
      const { data } = await apiClient.post<{ success: boolean }>(
        endpoints.payments.list,
        {
          transaction_id: transactionId,
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
