import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { AxiosError } from 'axios';
import {
  fetchAdminAttachments,
  fetchPendingAttachments,
  fetchAdminAttachment,
  fetchAdminAttachmentDownloadUrl,
  reviewAttachment,
  linkAttachmentPayment,
  unlinkAttachmentPayment,
  deleteAdminAttachment,
  type AdminAttachment,
  type AdminAttachmentFilters,
  type ReviewAttachmentRequest,
  type LinkPaymentRequest,
  type DownloadUrlResponse,
} from '@/lib/api/payment-attachments';

// ─── Query keys ───────────────────────────────────────────────────────────────

const adminAttachmentKeys = {
  all: ['admin-payment-attachments'] as const,
  lists: () => [...adminAttachmentKeys.all, 'list'] as const,
  list: (filters?: AdminAttachmentFilters) =>
    [...adminAttachmentKeys.lists(), filters] as const,
  pending: () => [...adminAttachmentKeys.all, 'pending'] as const,
  detail: (id: string) => [...adminAttachmentKeys.all, 'detail', id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAdminAttachments(filters?: AdminAttachmentFilters) {
  return useQuery<AdminAttachment[], AxiosError>({
    queryKey: adminAttachmentKeys.list(filters),
    queryFn: () => fetchAdminAttachments(filters),
    staleTime: 30 * 1000,
  });
}

export function usePendingAttachments() {
  return useQuery<AdminAttachment[], AxiosError>({
    queryKey: adminAttachmentKeys.pending(),
    queryFn: fetchPendingAttachments,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useAdminAttachment(id: string) {
  return useQuery<AdminAttachment, AxiosError>({
    queryKey: adminAttachmentKeys.detail(id),
    queryFn: () => fetchAdminAttachment(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useReviewAttachment() {
  const queryClient = useQueryClient();

  return useMutation<
    AdminAttachment,
    AxiosError,
    { id: string } & ReviewAttachmentRequest
  >({
    mutationFn: ({ id, ...req }) => reviewAttachment(id, req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.pending() });
      queryClient.invalidateQueries({
        queryKey: adminAttachmentKeys.detail(data.id),
      });
    },
  });
}

export function useLinkAttachmentPayment() {
  const queryClient = useQueryClient();

  return useMutation<
    AdminAttachment,
    AxiosError,
    { id: string } & LinkPaymentRequest
  >({
    mutationFn: ({ id, ...req }) => linkAttachmentPayment(id, req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.pending() });
      queryClient.invalidateQueries({
        queryKey: adminAttachmentKeys.detail(data.id),
      });
    },
  });
}

export function useUnlinkAttachmentPayment() {
  const queryClient = useQueryClient();

  return useMutation<AdminAttachment, AxiosError, string>({
    mutationFn: (id) => unlinkAttachmentPayment(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.pending() });
      queryClient.invalidateQueries({
        queryKey: adminAttachmentKeys.detail(data.id),
      });
    },
  });
}

export function useDeleteAdminAttachment() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: (id) => deleteAdminAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminAttachmentKeys.pending() });
    },
  });
}

// ─── Download URL (lazy) ──────────────────────────────────────────────────────

export function useAdminAttachmentDownloadUrl() {
  const getDownloadUrl = useCallback(
    async (id: string): Promise<DownloadUrlResponse> => {
      return fetchAdminAttachmentDownloadUrl(id);
    },
    [],
  );

  return { getDownloadUrl };
}
