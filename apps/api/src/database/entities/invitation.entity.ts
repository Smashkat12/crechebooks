/**
 * Invitation Entity Types
 * TASK-USER-001: Multi-Tenant User Role Assignment
 *
 * @module database/entities/invitation
 * @description Invitation entity for inviting users to join tenants
 */

import { UserRole } from '@prisma/client';
export { UserRole };

/**
 * Invitation status enum
 */
export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

/**
 * Invitation entity interface
 * Represents an invitation for a user to join a tenant with a specific role
 *
 * @interface IInvitation
 * @property {string} id - Unique identifier (UUID)
 * @property {string} email - Email address of invited user
 * @property {string} tenantId - Tenant ID extending the invitation
 * @property {UserRole} role - Role to be assigned upon acceptance
 * @property {InvitationStatus} status - Current status of invitation
 * @property {string | null} invitedBy - User ID who sent the invitation
 * @property {string | null} acceptedBy - User ID who accepted the invitation
 * @property {Date} expiresAt - When invitation expires
 * @property {Date | null} acceptedAt - When invitation was accepted
 * @property {Date | null} revokedAt - When invitation was revoked
 * @property {Date} createdAt - Record creation timestamp
 * @property {Date} updatedAt - Record last update timestamp
 */
export interface IInvitation {
  id: string;
  email: string;
  tenantId: string;
  role: UserRole;
  status: InvitationStatus;
  invitedBy: string | null;
  acceptedBy: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create invitation DTO
 */
export interface CreateInvitationDto {
  email: string;
  tenantId: string;
  role: UserRole;
  invitedBy?: string;
}
