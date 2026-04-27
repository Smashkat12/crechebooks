/**
 * TanStack Query hooks for admin staff invite controls.
 *
 * useStaffInviteStatus(staffId)  — GET /staff/:id/invite-status
 * useSendStaffInvite()           — POST /staff/:id/invite
 * useRevokeStaffInvite()         — POST /staff/:invitationId/revoke-invite
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useToast } from '@/hooks/use-toast';
import {
  getStaffInviteStatus,
  sendStaffInvite,
  revokeStaffInvite,
  type StaffInviteStatusResponse,
  type SendStaffInviteResponse,
} from '@/lib/api/staff';

// ---------------------------------------------------------------------------
// Query keys — local to this feature (not added to the global query-keys.ts
// because this is a self-contained domain slice).
// ---------------------------------------------------------------------------
export const staffInviteKeys = {
  all: ['staff-invite'] as const,
  status: (staffId: string) =>
    [...staffInviteKeys.all, 'status', staffId] as const,
};

// ---------------------------------------------------------------------------
// useStaffInviteStatus
// ---------------------------------------------------------------------------
export function useStaffInviteStatus(staffId: string) {
  return useQuery<StaffInviteStatusResponse, AxiosError>({
    queryKey: staffInviteKeys.status(staffId),
    queryFn: () => getStaffInviteStatus(staffId),
    enabled: !!staffId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useSendStaffInvite
// ---------------------------------------------------------------------------
export function useSendStaffInvite(staffId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<SendStaffInviteResponse, AxiosError, void>({
    mutationFn: () => sendStaffInvite(staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: staffInviteKeys.status(staffId),
      });
      toast({
        title: 'Invitation sent',
        description: 'The staff member will receive an invite email shortly.',
      });
    },
    onError: (err) => {
      const message =
        (err.response?.data as { message?: string } | undefined)?.message ??
        err.message ??
        'Failed to send invitation';
      toast({
        title: 'Could not send invitation',
        description: message,
        variant: 'destructive',
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useRevokeStaffInvite
// Caller must pass the invitationId (not staff UUID) obtained from the status
// query before calling this mutation.
// ---------------------------------------------------------------------------
export function useRevokeStaffInvite(staffId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<{ success: boolean }, AxiosError, string>({
    /** mutationFn receives the invitationId */
    mutationFn: (invitationId: string) => revokeStaffInvite(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: staffInviteKeys.status(staffId),
      });
      toast({
        title: 'Invitation revoked',
        description: 'The pending invitation has been revoked.',
      });
    },
    onError: (err) => {
      const message =
        (err.response?.data as { message?: string } | undefined)?.message ??
        err.message ??
        'Failed to revoke invitation';
      toast({
        title: 'Could not revoke invitation',
        description: message,
        variant: 'destructive',
      });
    },
  });
}
