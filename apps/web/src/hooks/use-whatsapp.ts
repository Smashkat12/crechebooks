/**
 * WhatsApp Hooks
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * React Query hooks for WhatsApp opt-in management and message history.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types for WhatsApp API responses
export interface WhatsAppMessage {
  id: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  contextType: 'INVOICE' | 'REMINDER' | 'STATEMENT' | 'WELCOME' | 'ARREARS';
  contextId?: string;
  templateName: string;
  recipientPhone: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface WhatsAppStatus {
  optedIn: boolean;
  optedInAt?: string;
  whatsappPhone?: string;
}

interface WhatsAppHistoryResponse {
  success: boolean;
  messages: WhatsAppMessage[];
  total: number;
}

interface WhatsAppSuccessResponse {
  success: boolean;
}

// Query keys for WhatsApp
export const whatsappQueryKeys = {
  all: ['whatsapp'] as const,
  history: (parentId: string) => [...whatsappQueryKeys.all, 'history', parentId] as const,
  status: (parentId: string) => [...whatsappQueryKeys.all, 'status', parentId] as const,
};

/**
 * Hook for managing WhatsApp opt-in/opt-out
 */
export function useWhatsApp() {
  const queryClient = useQueryClient();

  const optInMutation = useMutation<WhatsAppSuccessResponse, AxiosError, string>({
    mutationFn: async (parentId: string) => {
      const { data } = await apiClient.post<WhatsAppSuccessResponse>(
        endpoints.whatsapp.optIn,
        { parentId }
      );
      return data;
    },
    onSuccess: (_, parentId) => {
      queryClient.invalidateQueries({ queryKey: whatsappQueryKeys.status(parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(parentId) });
    },
  });

  const optOutMutation = useMutation<WhatsAppSuccessResponse, AxiosError, string>({
    mutationFn: async (parentId: string) => {
      const { data } = await apiClient.post<WhatsAppSuccessResponse>(
        endpoints.whatsapp.optOut,
        { parentId }
      );
      return data;
    },
    onSuccess: (_, parentId) => {
      queryClient.invalidateQueries({ queryKey: whatsappQueryKeys.status(parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(parentId) });
    },
  });

  return {
    updateOptIn: async (parentId: string, optIn: boolean) => {
      if (optIn) {
        return optInMutation.mutateAsync(parentId);
      } else {
        return optOutMutation.mutateAsync(parentId);
      }
    },
    isLoading: optInMutation.isPending || optOutMutation.isPending,
    error: optInMutation.error || optOutMutation.error,
  };
}

/**
 * Hook for fetching WhatsApp message history for a parent
 */
export function useWhatsAppHistory(parentId: string, enabled = true) {
  const query = useQuery<WhatsAppHistoryResponse, AxiosError>({
    queryKey: whatsappQueryKeys.history(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<WhatsAppHistoryResponse>(
        endpoints.whatsapp.history(parentId)
      );
      return data;
    },
    enabled: enabled && !!parentId,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  return {
    messages: query.data?.messages ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching WhatsApp opt-in status for a parent
 */
export function useWhatsAppStatus(parentId: string, enabled = true) {
  const query = useQuery<WhatsAppStatus, AxiosError>({
    queryKey: whatsappQueryKeys.status(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<WhatsAppStatus>(
        endpoints.whatsapp.status(parentId)
      );
      return data;
    },
    enabled: enabled && !!parentId,
    staleTime: 60000, // Consider data stale after 1 minute
  });

  return {
    status: query.data,
    optedIn: query.data?.optedIn ?? false,
    optedInAt: query.data?.optedInAt,
    whatsappPhone: query.data?.whatsappPhone,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
