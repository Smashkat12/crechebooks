/**
 * UserTenant Service
 * TASK-USER-001: Multi-Tenant User Role Assignment
 *
 * @module database/services/user-tenant
 * @description Service for managing user-tenant relationships and invitations
 */

import { Injectable, Logger } from '@nestjs/common';
import { UserTenantRole, Invitation, UserRole, InvitationStatus as PrismaInvitationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { TenantWithRole } from '../entities/user-tenant-role.entity';
import { InvitationStatus } from '../entities/invitation.entity';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
  DatabaseException,
  ForbiddenException,
} from '../../shared/exceptions';

@Injectable()
export class UserTenantService {
  private readonly logger = new Logger(UserTenantService.name);
  private readonly INVITATION_EXPIRY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Get all tenants a user belongs to with their roles
   * @param userId - User ID
   * @returns Array of tenants with role information
   * @throws DatabaseException on database errors
   */
  async getUserTenants(userId: string): Promise<TenantWithRole[]> {
    try {
      const userTenantRoles = await this.prisma.userTenantRole.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          joinedAt: 'desc',
        },
      });

      return userTenantRoles.map((utr) => ({
        id: utr.tenant.id,
        name: utr.tenant.name,
        role: utr.role,
        isActive: utr.isActive,
        joinedAt: utr.joinedAt,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get user tenants for userId: ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getUserTenants',
        'Failed to get user tenants',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get user's role in a specific tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns User role or null if not a member
   * @throws DatabaseException on database errors
   */
  async getTenantRole(userId: string, tenantId: string): Promise<UserRole | null> {
    try {
      const userTenantRole = await this.prisma.userTenantRole.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
          isActive: true,
        },
      });

      return userTenantRole?.role ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to get tenant role for userId: ${userId}, tenantId: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getTenantRole',
        'Failed to get tenant role',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Add a user to a tenant with a specific role
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param role - Role to assign
   * @param invitedBy - User ID who is adding this user (for audit)
   * @throws NotFoundException if user or tenant doesn't exist
   * @throws ConflictException if user already belongs to tenant
   * @throws DatabaseException on database errors
   */
  async addUserToTenant(
    userId: string,
    tenantId: string,
    role: UserRole,
    invitedBy?: string,
  ): Promise<UserTenantRole> {
    try {
      // Verify user exists
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User', userId);
      }

      // Verify tenant exists
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant', tenantId);
      }

      // Check if already exists
      const existing = await this.prisma.userTenantRole.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
        },
      });

      if (existing && existing.isActive) {
        throw new ConflictException(
          'UserTenantRole',
          { userId, tenantId },
        );
      }

      // Create or reactivate membership
      const userTenantRole = existing
        ? await this.prisma.userTenantRole.update({
            where: { id: existing.id },
            data: {
              role,
              isActive: true,
              joinedAt: new Date(),
            },
          })
        : await this.prisma.userTenantRole.create({
            data: {
              userId,
              tenantId,
              role,
              isActive: true,
            },
          });

      // Create audit log
      await this.auditLogService.logCreate({
        tenantId,
        userId: invitedBy,
        entityType: 'UserTenantRole',
        entityId: userTenantRole.id,
        afterValue: {
          userId,
          tenantId,
          role,
          action: existing ? 'reactivated' : 'created',
        },
      });

      this.logger.log(
        `User ${userId} added to tenant ${tenantId} with role ${role}`,
      );

      return userTenantRole;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to add user to tenant: ${userId} -> ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'addUserToTenant',
        'Failed to add user to tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a user from a tenant (soft delete)
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param removedBy - User ID performing the removal
   * @throws NotFoundException if membership doesn't exist
   * @throws DatabaseException on database errors
   */
  async removeUserFromTenant(
    userId: string,
    tenantId: string,
    removedBy?: string,
  ): Promise<void> {
    try {
      const userTenantRole = await this.prisma.userTenantRole.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
        },
      });

      if (!userTenantRole) {
        throw new NotFoundException('UserTenantRole', userId);
      }

      // Soft delete by setting isActive to false
      await this.prisma.userTenantRole.update({
        where: { id: userTenantRole.id },
        data: { isActive: false },
      });

      // Create audit log
      await this.auditLogService.logUpdate({
        tenantId,
        userId: removedBy,
        entityType: 'UserTenantRole',
        entityId: userTenantRole.id,
        beforeValue: { isActive: true, role: userTenantRole.role },
        afterValue: { isActive: false, role: userTenantRole.role },
        changeSummary: `User ${userId} removed from tenant ${tenantId}`,
      });

      this.logger.log(
        `User ${userId} removed from tenant ${tenantId}`,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to remove user from tenant: ${userId} -> ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'removeUserFromTenant',
        'Failed to remove user from tenant',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update a user's role in a tenant
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @param newRole - New role to assign
   * @param changedBy - User ID performing the change
   * @throws NotFoundException if membership doesn't exist
   * @throws DatabaseException on database errors
   */
  async updateUserRole(
    userId: string,
    tenantId: string,
    newRole: UserRole,
    changedBy?: string,
  ): Promise<UserTenantRole> {
    try {
      const userTenantRole = await this.prisma.userTenantRole.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId,
          },
        },
      });

      if (!userTenantRole) {
        throw new NotFoundException('UserTenantRole', userId);
      }

      const oldRole = userTenantRole.role;

      // Update role
      const updated = await this.prisma.userTenantRole.update({
        where: { id: userTenantRole.id },
        data: { role: newRole },
      });

      // Create audit log
      await this.auditLogService.logUpdate({
        tenantId,
        userId: changedBy,
        entityType: 'UserTenantRole',
        entityId: userTenantRole.id,
        beforeValue: { role: oldRole },
        afterValue: { role: newRole },
        changeSummary: `User ${userId} role changed from ${oldRole} to ${newRole} in tenant ${tenantId}`,
      });

      this.logger.log(
        `User ${userId} role updated in tenant ${tenantId}: ${oldRole} -> ${newRole}`,
      );

      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to update user role: ${userId} -> ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'updateUserRole',
        'Failed to update user role',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Invite a user to join a tenant
   * @param email - Email address to invite
   * @param tenantId - Tenant ID
   * @param role - Role to assign upon acceptance
   * @param invitedBy - User ID sending the invitation
   * @returns Created invitation
   * @throws ValidationException if email is invalid or role is not allowed
   * @throws ForbiddenException if inviter doesn't have permission
   * @throws ConflictException if active invitation already exists
   * @throws DatabaseException on database errors
   */
  async inviteUserToTenant(
    email: string,
    tenantId: string,
    role: UserRole,
    invitedBy?: string,
  ): Promise<Invitation> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationException('Invalid email format', [
          { field: 'email', message: 'Email format is invalid', value: email },
        ]);
      }

      // Verify tenant exists
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant', tenantId);
      }

      // If invitedBy is provided, verify they have permission (OWNER or ADMIN)
      if (invitedBy) {
        const inviterRole = await this.getTenantRole(invitedBy, tenantId);
        if (
          !inviterRole ||
          (inviterRole !== UserRole.OWNER && inviterRole !== UserRole.ADMIN)
        ) {
          throw new ForbiddenException(
            'Only OWNER or ADMIN can invite users to a tenant',
          );
        }
      }

      // Check for existing active invitation
      const existingInvitation = await this.prisma.invitation.findFirst({
        where: {
          email,
          tenantId,
          status: 'PENDING' as PrismaInvitationStatus,
          expiresAt: {
            gt: new Date(),
          },
        },
      });

      if (existingInvitation) {
        throw new ConflictException('Invitation', { email, tenantId });
      }

      // Create invitation with 7-day expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.INVITATION_EXPIRY_DAYS);

      const invitation = await this.prisma.invitation.create({
        data: {
          email,
          tenantId,
          role,
          invitedBy,
          expiresAt,
          status: 'PENDING' as PrismaInvitationStatus,
        },
      });

      // Create audit log
      await this.auditLogService.logCreate({
        tenantId,
        userId: invitedBy,
        entityType: 'Invitation',
        entityId: invitation.id,
        afterValue: {
          email,
          tenantId,
          role,
          expiresAt,
        },
      });

      this.logger.log(
        `Invitation sent to ${email} for tenant ${tenantId} with role ${role}`,
      );

      return invitation;
    } catch (error) {
      if (
        error instanceof ValidationException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to invite user: ${email} -> ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'inviteUserToTenant',
        'Failed to invite user',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Accept an invitation and add user to tenant
   * @param invitationId - Invitation ID
   * @param userId - User ID accepting the invitation
   * @throws NotFoundException if invitation doesn't exist
   * @throws ValidationException if invitation expired or already accepted
   * @throws DatabaseException on database errors
   */
  async acceptInvitation(invitationId: string, userId: string): Promise<void> {
    try {
      const invitation = await this.prisma.invitation.findUnique({
        where: { id: invitationId },
      });

      if (!invitation) {
        throw new NotFoundException('Invitation', invitationId);
      }

      // Verify user email matches invitation
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User', userId);
      }

      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new ValidationException('User email does not match invitation email', [
          { field: 'email', message: 'Email mismatch', value: user.email },
        ]);
      }

      // Check invitation status
      if (invitation.status !== 'PENDING') {
        throw new ValidationException(
          `Invitation is ${invitation.status.toLowerCase()}, cannot accept`,
          [{ field: 'status', message: 'Invitation not pending', value: invitation.status }],
        );
      }

      // Check expiry
      if (invitation.expiresAt < new Date()) {
        // Mark as expired
        await this.prisma.invitation.update({
          where: { id: invitationId },
          data: { status: 'EXPIRED' as PrismaInvitationStatus },
        });

        throw new ValidationException('Invitation has expired', [
          { field: 'expiresAt', message: 'Invitation expired', value: invitation.expiresAt },
        ]);
      }

      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // Add user to tenant
        await tx.userTenantRole.upsert({
          where: {
            userId_tenantId: {
              userId,
              tenantId: invitation.tenantId,
            },
          },
          create: {
            userId,
            tenantId: invitation.tenantId,
            role: invitation.role,
            isActive: true,
          },
          update: {
            role: invitation.role,
            isActive: true,
            joinedAt: new Date(),
          },
        });

        // Mark invitation as accepted
        await tx.invitation.update({
          where: { id: invitationId },
          data: {
            status: 'ACCEPTED' as PrismaInvitationStatus,
            acceptedBy: userId,
            acceptedAt: new Date(),
          },
        });
      });

      // Create audit log
      await this.auditLogService.logUpdate({
        tenantId: invitation.tenantId,
        userId,
        entityType: 'Invitation',
        entityId: invitationId,
        beforeValue: { status: 'PENDING' },
        afterValue: { status: 'ACCEPTED', acceptedBy: userId },
        changeSummary: `User ${userId} accepted invitation to tenant ${invitation.tenantId}`,
      });

      this.logger.log(
        `User ${userId} accepted invitation ${invitationId} for tenant ${invitation.tenantId}`,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ValidationException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to accept invitation: ${invitationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'acceptInvitation',
        'Failed to accept invitation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Revoke an invitation
   * @param invitationId - Invitation ID
   * @param revokedBy - User ID revoking the invitation
   * @throws NotFoundException if invitation doesn't exist
   * @throws ValidationException if invitation already accepted or revoked
   * @throws DatabaseException on database errors
   */
  async revokeInvitation(invitationId: string, revokedBy?: string): Promise<void> {
    try {
      const invitation = await this.prisma.invitation.findUnique({
        where: { id: invitationId },
      });

      if (!invitation) {
        throw new NotFoundException('Invitation', invitationId);
      }

      if (invitation.status !== 'PENDING') {
        throw new ValidationException(`Cannot revoke invitation with status: ${invitation.status}`, [
          { field: 'status', message: 'Cannot revoke non-pending invitation', value: invitation.status },
        ]);
      }

      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: {
          status: 'REVOKED' as PrismaInvitationStatus,
          revokedAt: new Date(),
        },
      });

      // Create audit log
      await this.auditLogService.logUpdate({
        tenantId: invitation.tenantId,
        userId: revokedBy,
        entityType: 'Invitation',
        entityId: invitationId,
        beforeValue: { status: 'PENDING' },
        afterValue: { status: 'REVOKED' },
        changeSummary: `Invitation ${invitationId} revoked`,
      });

      this.logger.log(`Invitation ${invitationId} revoked`);
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ValidationException
      ) {
        throw error;
      }

      this.logger.error(
        `Failed to revoke invitation: ${invitationId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'revokeInvitation',
        'Failed to revoke invitation',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get all invitations for a tenant
   * @param tenantId - Tenant ID
   * @param status - Optional status filter
   * @returns Array of invitations
   */
  async getTenantInvitations(
    tenantId: string,
    status?: InvitationStatus,
  ): Promise<Invitation[]> {
    try {
      return await this.prisma.invitation.findMany({
        where: {
          tenantId,
          ...(status && { status: status as PrismaInvitationStatus }),
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get tenant invitations: ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getTenantInvitations',
        'Failed to get tenant invitations',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
