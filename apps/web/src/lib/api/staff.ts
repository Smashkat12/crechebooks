/**
 * Staff Invite API Client
 * Endpoints for admin-facing staff portal invitation management.
 *
 * Contract (verified from apps/api/src/api/staff/staff-invitation.controller.ts):
 *   POST /staff/:staffId/invite           — send / resend invite (returns { success, inviteSentAt, expiresAt })
 *   POST /staff/:invitationId/revoke-invite — revoke by invitationId IN THE PATH (not staff UUID)
 *   GET  /staff/:staffId/invite-status    — returns { status, invitationId, expiresAt, acceptedAt, revokedAt, createdAt }
 *
 * Public accept endpoint:
 *   POST /auth/staff-invite/accept        — body { token: string } → { success: true, message: string }
 */

import { apiClient } from './client';

export type StaffInviteStatus =
  | 'NOT_INVITED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'EXPIRED'
  | 'REVOKED';

export interface StaffInviteStatusResponse {
  status: StaffInviteStatus;
  /** Invitation UUID — needed to call revoke-invite */
  invitationId: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

export interface SendStaffInviteResponse {
  success: boolean;
  inviteSentAt: string;
  expiresAt: string;
}

export interface AcceptStaffInviteResponse {
  success: boolean;
  message: string;
}

export async function getStaffInviteStatus(
  staffId: string,
): Promise<StaffInviteStatusResponse> {
  const { data } = await apiClient.get<StaffInviteStatusResponse>(
    `/staff/${staffId}/invite-status`,
  );
  return data;
}

export async function sendStaffInvite(
  staffId: string,
): Promise<SendStaffInviteResponse> {
  const { data } = await apiClient.post<SendStaffInviteResponse>(
    `/staff/${staffId}/invite`,
  );
  return data;
}

/**
 * Revoke a pending invitation.
 * IMPORTANT: the path param is the invitationId, NOT the staff UUID.
 * Caller must obtain invitationId from getStaffInviteStatus() first.
 */
export async function revokeStaffInvite(
  invitationId: string,
): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>(
    `/staff/${invitationId}/revoke-invite`,
  );
  return data;
}

/**
 * Public endpoint — no auth header required.
 * Uses native fetch (no apiClient) because the apiClient adds auth headers.
 */
export async function acceptStaffInvite(
  token: string,
): Promise<AcceptStaffInviteResponse> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const response = await fetch(
    `${apiUrl}/api/v1/auth/staff-invite/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
  );

  const body: unknown = await response.json();

  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof (body as Record<string, unknown>).message === 'string'
        ? (body as { message: string }).message
        : 'Failed to accept invitation';
    throw new Error(message);
  }

  return body as AcceptStaffInviteResponse;
}
