import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  fetchParentAttachments,
  fetchParentAttachment,
  presignAttachmentUpload,
  registerParentAttachment,
  fetchParentAttachmentDownloadUrl,
  deleteParentAttachment,
  type ParentAttachment,
  type PresignRequest,
  type PresignResponse,
  type RegisterAttachmentRequest,
  type DownloadUrlResponse,
} from '@/lib/api/payment-attachments';

// ─── Query keys ───────────────────────────────────────────────────────────────

const parentAttachmentKeys = {
  all: ['parent-payment-attachments'] as const,
  lists: () => [...parentAttachmentKeys.all, 'list'] as const,
  list: (params?: { paymentId?: string }) =>
    [...parentAttachmentKeys.lists(), params] as const,
  detail: (id: string) => [...parentAttachmentKeys.all, 'detail', id] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useParentAttachments(params?: { paymentId?: string }) {
  return useQuery<ParentAttachment[], Error>({
    queryKey: parentAttachmentKeys.list(params),
    queryFn: () => fetchParentAttachments(params),
    staleTime: 30 * 1000,
  });
}

export function useParentAttachment(id: string) {
  return useQuery<ParentAttachment, Error>({
    queryKey: parentAttachmentKeys.detail(id),
    queryFn: () => fetchParentAttachment(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function usePresignAttachmentUpload() {
  return useMutation<PresignResponse, Error, PresignRequest>({
    mutationFn: presignAttachmentUpload,
  });
}

export function useRegisterAttachment() {
  const queryClient = useQueryClient();

  return useMutation<ParentAttachment, Error, RegisterAttachmentRequest>({
    mutationFn: registerParentAttachment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentAttachmentKeys.lists() });
    },
  });
}

export function useDeleteParentAttachment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteParentAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentAttachmentKeys.lists() });
    },
  });
}

// ─── Download URL (lazy — not fetched eagerly because URLs expire) ─────────────

export function useDownloadAttachmentUrl() {
  const getDownloadUrl = useCallback(
    async (id: string): Promise<DownloadUrlResponse> => {
      return fetchParentAttachmentDownloadUrl(id);
    },
    [],
  );

  return { getDownloadUrl };
}
