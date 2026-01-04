/**
 * UserTenant Service Tests
 * TASK-USER-001: Multi-Tenant User Role Assignment
 *
 * @module database/services/__tests__/user-tenant
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserTenantService } from '../user-tenant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log.service';
import { UserRole, InvitationStatus as PrismaInvitationStatus } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
  ForbiddenException,
} from '../../../shared/exceptions';

describe('UserTenantService', () => {
  let service: UserTenantService;
  let prismaService: PrismaService;
  let auditLogService: AuditLogService;

  const mockPrismaService = {
    userTenantRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    invitation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(mockPrismaService)),
  };

  const mockAuditLogService = {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTenantService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<UserTenantService>(UserTenantService);
    prismaService = module.get<PrismaService>(PrismaService);
    auditLogService = module.get<AuditLogService>(AuditLogService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserTenants', () => {
    it('should return all active tenants for a user', async () => {
      const userId = 'user-123';
      const mockUserTenantRoles = [
        {
          id: 'utr-1',
          userId,
          tenantId: 'tenant-1',
          role: UserRole.OWNER,
          isActive: true,
          joinedAt: new Date('2024-01-01'),
          tenant: { id: 'tenant-1', name: 'Tenant One' },
        },
        {
          id: 'utr-2',
          userId,
          tenantId: 'tenant-2',
          role: UserRole.ADMIN,
          isActive: true,
          joinedAt: new Date('2024-02-01'),
          tenant: { id: 'tenant-2', name: 'Tenant Two' },
        },
      ];

      mockPrismaService.userTenantRole.findMany.mockResolvedValue(mockUserTenantRoles);

      const result = await service.getUserTenants(userId);

      expect(result).toHaveLength(2);
      // Results are ordered by joinedAt desc, so tenant-2 (2024-02-01) comes first
      expect(result[0]).toEqual({
        id: 'tenant-1',
        name: 'Tenant One',
        role: UserRole.OWNER,
        isActive: true,
        joinedAt: new Date('2024-01-01'),
      });
      expect(result[1]).toEqual({
        id: 'tenant-2',
        name: 'Tenant Two',
        role: UserRole.ADMIN,
        isActive: true,
        joinedAt: new Date('2024-02-01'),
      });
      expect(mockPrismaService.userTenantRole.findMany).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { joinedAt: 'desc' },
      });
    });

    it('should return empty array if user has no tenants', async () => {
      mockPrismaService.userTenantRole.findMany.mockResolvedValue([]);

      const result = await service.getUserTenants('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('getTenantRole', () => {
    it('should return user role in tenant', async () => {
      const mockUserTenantRole = {
        role: UserRole.ADMIN,
      };

      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(mockUserTenantRole);

      const result = await service.getTenantRole('user-123', 'tenant-123');

      expect(result).toBe(UserRole.ADMIN);
    });

    it('should return null if user not in tenant', async () => {
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(null);

      const result = await service.getTenantRole('user-123', 'tenant-123');

      expect(result).toBeNull();
    });
  });

  describe('addUserToTenant', () => {
    it('should add user to tenant successfully', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const role = UserRole.VIEWER;

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId });
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: tenantId });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(null);
      mockPrismaService.userTenantRole.create.mockResolvedValue({
        id: 'utr-123',
        userId,
        tenantId,
        role,
        isActive: true,
      });

      const result = await service.addUserToTenant(userId, tenantId, role, 'inviter-123');

      expect(result.userId).toBe(userId);
      expect(result.tenantId).toBe(tenantId);
      expect(result.role).toBe(role);
      expect(mockAuditLogService.logCreate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.addUserToTenant('user-123', 'tenant-123', UserRole.VIEWER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.addUserToTenant('user-123', 'tenant-123', UserRole.VIEWER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already belongs to tenant', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue({
        id: 'utr-123',
        isActive: true,
      });

      await expect(
        service.addUserToTenant('user-123', 'tenant-123', UserRole.VIEWER),
      ).rejects.toThrow(ConflictException);
    });

    it('should reactivate inactive membership', async () => {
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const newRole = UserRole.ADMIN;

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId });
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: tenantId });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue({
        id: 'utr-123',
        isActive: false,
      });
      mockPrismaService.userTenantRole.update.mockResolvedValue({
        id: 'utr-123',
        userId,
        tenantId,
        role: newRole,
        isActive: true,
      });

      const result = await service.addUserToTenant(userId, tenantId, newRole);

      expect(result.isActive).toBe(true);
      expect(mockPrismaService.userTenantRole.update).toHaveBeenCalled();
    });
  });

  describe('removeUserFromTenant', () => {
    it('should remove user from tenant', async () => {
      const mockUserTenantRole = {
        id: 'utr-123',
        role: UserRole.VIEWER,
      };

      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(mockUserTenantRole);
      mockPrismaService.userTenantRole.update.mockResolvedValue({
        ...mockUserTenantRole,
        isActive: false,
      });

      await service.removeUserFromTenant('user-123', 'tenant-123', 'remover-123');

      expect(mockPrismaService.userTenantRole.update).toHaveBeenCalledWith({
        where: { id: 'utr-123' },
        data: { isActive: false },
      });
      expect(mockAuditLogService.logUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if membership does not exist', async () => {
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(null);

      await expect(
        service.removeUserFromTenant('user-123', 'tenant-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      const mockUserTenantRole = {
        id: 'utr-123',
        role: UserRole.VIEWER,
      };

      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(mockUserTenantRole);
      mockPrismaService.userTenantRole.update.mockResolvedValue({
        ...mockUserTenantRole,
        role: UserRole.ADMIN,
      });

      const result = await service.updateUserRole(
        'user-123',
        'tenant-123',
        UserRole.ADMIN,
        'changer-123',
      );

      expect(result.role).toBe(UserRole.ADMIN);
      expect(mockAuditLogService.logUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if membership does not exist', async () => {
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole('user-123', 'tenant-123', UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('inviteUserToTenant', () => {
    it('should create invitation successfully', async () => {
      const email = 'test@example.com';
      const tenantId = 'tenant-123';
      const role = UserRole.VIEWER;

      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: tenantId });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue({
        role: UserRole.OWNER,
      });
      mockPrismaService.invitation.findFirst.mockResolvedValue(null);
      mockPrismaService.invitation.create.mockResolvedValue({
        id: 'inv-123',
        email,
        tenantId,
        role,
        status: 'PENDING' as PrismaInvitationStatus,
        expiresAt: new Date(),
      });

      const result = await service.inviteUserToTenant(
        email,
        tenantId,
        role,
        'inviter-123',
      );

      expect(result.email).toBe(email);
      expect(result.role).toBe(role);
      expect(mockAuditLogService.logCreate).toHaveBeenCalled();
    });

    it('should throw ValidationException for invalid email', async () => {
      await expect(
        service.inviteUserToTenant('invalid-email', 'tenant-123', UserRole.VIEWER),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ForbiddenException if inviter is not OWNER or ADMIN', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue({
        role: UserRole.VIEWER,
      });

      await expect(
        service.inviteUserToTenant(
          'test@example.com',
          'tenant-123',
          UserRole.VIEWER,
          'inviter-123',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if active invitation exists', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'tenant-123' });
      mockPrismaService.userTenantRole.findUnique.mockResolvedValue({
        role: UserRole.OWNER,
      });
      mockPrismaService.invitation.findFirst.mockResolvedValue({
        id: 'inv-123',
        status: 'PENDING' as PrismaInvitationStatus,
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
      });

      await expect(
        service.inviteUserToTenant(
          'test@example.com',
          'tenant-123',
          UserRole.VIEWER,
          'inviter-123',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation and add user to tenant', async () => {
      const invitationId = 'inv-123';
      const userId = 'user-123';
      const email = 'test@example.com';

      const mockInvitation = {
        id: invitationId,
        email,
        tenantId: 'tenant-123',
        role: UserRole.VIEWER,
        status: 'PENDING' as PrismaInvitationStatus,
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
      };

      mockPrismaService.invitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email,
      });

      await service.acceptInvitation(invitationId, userId);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockAuditLogService.logUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if invitation does not exist', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptInvitation('inv-123', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ValidationException if email does not match', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue({
        email: 'test@example.com',
        status: 'PENDING' as PrismaInvitationStatus,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'different@example.com',
      });

      await expect(
        service.acceptInvitation('inv-123', 'user-123'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException if invitation is expired', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue({
        email: 'test@example.com',
        status: 'PENDING' as PrismaInvitationStatus,
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });
      mockPrismaService.invitation.update.mockResolvedValue({});

      await expect(
        service.acceptInvitation('inv-123', 'user-123'),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw ValidationException if invitation is not pending', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue({
        email: 'test@example.com',
        status: 'ACCEPTED' as PrismaInvitationStatus,
        expiresAt: new Date(Date.now() + 86400000),
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      await expect(
        service.acceptInvitation('inv-123', 'user-123'),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke invitation successfully', async () => {
      const invitationId = 'inv-123';

      mockPrismaService.invitation.findUnique.mockResolvedValue({
        id: invitationId,
        tenantId: 'tenant-123',
        status: 'PENDING' as PrismaInvitationStatus,
      });
      mockPrismaService.invitation.update.mockResolvedValue({});

      await service.revokeInvitation(invitationId, 'revoker-123');

      expect(mockPrismaService.invitation.update).toHaveBeenCalledWith({
        where: { id: invitationId },
        data: {
          status: 'REVOKED' as PrismaInvitationStatus,
          revokedAt: expect.any(Date),
        },
      });
      expect(mockAuditLogService.logUpdate).toHaveBeenCalled();
    });

    it('should throw NotFoundException if invitation does not exist', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revokeInvitation('inv-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ValidationException if invitation is not pending', async () => {
      mockPrismaService.invitation.findUnique.mockResolvedValue({
        status: 'ACCEPTED' as PrismaInvitationStatus,
      });

      await expect(service.revokeInvitation('inv-123')).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('getTenantInvitations', () => {
    it('should return all invitations for a tenant', async () => {
      const tenantId = 'tenant-123';
      const mockInvitations = [
        {
          id: 'inv-1',
          email: 'user1@example.com',
          tenantId,
          role: UserRole.VIEWER,
          status: 'PENDING' as PrismaInvitationStatus,
        },
        {
          id: 'inv-2',
          email: 'user2@example.com',
          tenantId,
          role: UserRole.ADMIN,
          status: 'ACCEPTED' as PrismaInvitationStatus,
        },
      ];

      mockPrismaService.invitation.findMany.mockResolvedValue(mockInvitations);

      const result = await service.getTenantInvitations(tenantId);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.invitation.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by status if provided', async () => {
      const tenantId = 'tenant-123';

      mockPrismaService.invitation.findMany.mockResolvedValue([]);

      await service.getTenantInvitations(tenantId, 'PENDING' as any);

      expect(mockPrismaService.invitation.findMany).toHaveBeenCalledWith({
        where: { tenantId, status: 'PENDING' as PrismaInvitationStatus },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
