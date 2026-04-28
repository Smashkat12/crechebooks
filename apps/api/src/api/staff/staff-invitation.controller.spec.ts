/**
 * StaffInvitationController + StaffInviteAcceptController — route smoke tests
 * TASK-STAFF-INVITE-001
 *
 * Verifies: route handlers call the service correctly with auth guards mocked.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StaffInvitationController } from './staff-invitation.controller';
import { StaffInviteAcceptController } from './staff-invite-accept.controller';
import { StaffInvitationService } from './staff-invitation.service';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { IUser } from '../../database/entities/user.entity';
import { StaffInvitationStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const STAFF_ID = 'ssss0000-0000-0000-0000-000000000001';
const ADMIN_USER_ID = 'uuuu0000-0000-0000-0000-000000000001';
const INVITE_ID = 'iiii0000-0000-0000-0000-000000000001';

const mockUser: IUser = {
  id: ADMIN_USER_ID,
  tenantId: TENANT_ID,
  email: 'admin@creche.co.za',
  role: 'ADMIN',
} as IUser;

// ---------------------------------------------------------------------------
// Service mock
// ---------------------------------------------------------------------------

const mockInvitationService = {
  inviteStaff: jest.fn(),
  revokeInvite: jest.fn(),
  getInviteStatus: jest.fn(),
  acceptInvite: jest.fn(),
};

// Guards that bypass auth in unit tests
const mockJwtGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRolesGuard = { canActivate: jest.fn().mockReturnValue(true) };
const mockRateLimitGuard = { canActivate: jest.fn().mockReturnValue(true) };

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('StaffInvitationController', () => {
  let controller: StaffInvitationController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffInvitationController],
      providers: [
        { provide: StaffInvitationService, useValue: mockInvitationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<StaffInvitationController>(
      StaffInvitationController,
    );
  });

  describe('sendInvite', () => {
    it('should call inviteStaff and return success payload', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      mockInvitationService.inviteStaff.mockResolvedValue({
        inviteSentAt: now,
        expiresAt,
      });

      const result = await controller.sendInvite(mockUser, STAFF_ID);

      expect(mockInvitationService.inviteStaff).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        ADMIN_USER_ID,
      );
      expect(result.success).toBe(true);
      expect(result.inviteSentAt).toBe(now);
      expect(result.expiresAt).toBe(expiresAt);
    });
  });

  describe('revokeInvite', () => {
    it('should call revokeInvite with invitationId', async () => {
      mockInvitationService.revokeInvite.mockResolvedValue({ success: true });

      const result = await controller.revokeInvite(mockUser, INVITE_ID);

      expect(mockInvitationService.revokeInvite).toHaveBeenCalledWith(
        TENANT_ID,
        INVITE_ID,
        ADMIN_USER_ID,
      );
      expect(result.success).toBe(true);
    });
  });

  describe('getInviteStatus', () => {
    it('should return derived status from service', async () => {
      const statusPayload = {
        status: 'PENDING' as const,
        invitationId: INVITE_ID,
        expiresAt: new Date(),
        createdAt: new Date(),
      };
      mockInvitationService.getInviteStatus.mockResolvedValue(statusPayload);

      const result = await controller.getInviteStatus(mockUser, STAFF_ID);

      expect(mockInvitationService.getInviteStatus).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
      );
      expect(result.status).toBe('PENDING');
    });
  });
});

// ---------------------------------------------------------------------------
// StaffInviteAcceptController smoke tests
// ---------------------------------------------------------------------------

describe('StaffInviteAcceptController', () => {
  let controller: StaffInviteAcceptController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffInviteAcceptController],
      providers: [
        { provide: StaffInvitationService, useValue: mockInvitationService },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue(mockRateLimitGuard)
      .compile();

    controller = module.get<StaffInviteAcceptController>(
      StaffInviteAcceptController,
    );
  });

  describe('acceptInvite', () => {
    it('should accept valid token and return magic-link message', async () => {
      mockInvitationService.acceptInvite.mockResolvedValue({
        staffId: STAFF_ID,
        magicLinkSent: true,
      });

      const result = await controller.acceptInvite({
        token: 'a'.repeat(43),
      });

      expect(mockInvitationService.acceptInvite).toHaveBeenCalledWith(
        'a'.repeat(43),
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('Magic link');
    });
  });
});
