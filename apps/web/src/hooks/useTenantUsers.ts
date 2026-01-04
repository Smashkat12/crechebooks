import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  VIEWER = 'VIEWER',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export interface TenantUser {
  id: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Invitation {
  id: string;
  email: string;
  tenantId: string;
  role: UserRole;
  status: InvitationStatus;
  invitedBy?: string;
  expiresAt: string;
  createdAt: string;
}

interface UpdateRoleParams {
  tenantId: string;
  userId: string;
  role: UserRole;
}

interface RemoveUserParams {
  tenantId: string;
  userId: string;
}

interface InviteUserParams {
  tenantId: string;
  email: string;
  role: UserRole;
}

interface ResendInvitationParams {
  tenantId: string;
  invitationId: string;
}

interface RevokeInvitationParams {
  tenantId: string;
  invitationId: string;
}

/**
 * Fetch all users for a tenant
 */
export function useTenantUsers(tenantId: string, enabled = true) {
  return useQuery<TenantUser[], AxiosError>({
    queryKey: queryKeys.users.tenantUsers(tenantId),
    queryFn: async () => {
      const { data } = await apiClient.get<TenantUser[]>(
        endpoints.users.tenantUsers(tenantId)
      );
      return data;
    },
    enabled: enabled && !!tenantId,
  });
}

/**
 * Fetch pending invitations for a tenant
 */
export function useTenantInvitations(tenantId: string, enabled = true) {
  return useQuery<Invitation[], AxiosError>({
    queryKey: queryKeys.users.invitations(tenantId),
    queryFn: async () => {
      const { data } = await apiClient.get<Invitation[]>(
        endpoints.users.invitations(tenantId)
      );
      return data;
    },
    enabled: enabled && !!tenantId,
  });
}

/**
 * Update a user's role in a tenant
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, UpdateRoleParams>({
    mutationFn: async ({ tenantId, userId, role }) => {
      await apiClient.patch(endpoints.users.updateRole(tenantId, userId), {
        role,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.tenantUsers(variables.tenantId),
      });
    },
  });
}

/**
 * Remove a user from a tenant
 */
export function useRemoveUser() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, RemoveUserParams>({
    mutationFn: async ({ tenantId, userId }) => {
      await apiClient.delete(endpoints.users.removeUser(tenantId, userId));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.tenantUsers(variables.tenantId),
      });
    },
  });
}

/**
 * Invite a user to a tenant
 */
export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation<Invitation, AxiosError, InviteUserParams>({
    mutationFn: async ({ tenantId, email, role }) => {
      const { data } = await apiClient.post<Invitation>(
        endpoints.users.invite(tenantId),
        { email, role }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.invitations(variables.tenantId),
      });
    },
  });
}

/**
 * Resend an invitation
 */
export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, ResendInvitationParams>({
    mutationFn: async ({ tenantId, invitationId }) => {
      await apiClient.post(
        endpoints.users.resendInvitation(tenantId, invitationId)
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.invitations(variables.tenantId),
      });
    },
  });
}

/**
 * Revoke an invitation
 */
export function useRevokeInvitation() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, RevokeInvitationParams>({
    mutationFn: async ({ tenantId, invitationId }) => {
      await apiClient.delete(
        endpoints.users.revokeInvitation(tenantId, invitationId)
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.invitations(variables.tenantId),
      });
    },
  });
}
