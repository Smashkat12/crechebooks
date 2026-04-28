/**
 * StaffInvitationService spec
 * TASK-STAFF-INVITE-001
 *
 * Tests:
 * 1. inviteStaff happy path
 * 2. re-invite revokes prior PENDING invite, creates new one
 * 3. acceptInvite happy path
 * 4. expired token rejection
 * 5. already-accepted rejection
 * 6. revoked token rejection
 * 7. tenant isolation — staff from different tenant → 404
 * 8. revokeInvite happy path
 * 9. getInviteStatus — NOT_INVITED, PENDING, ACCEPTED, EXPIRED, REVOKED
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffInvitationStatus } from '@prisma/client';
import { StaffInvitationService } from './staff-invitation.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MailgunService } from '../../integrations/mailgun/mailgun.service';
import { StaffMagicLinkService } from '../auth/services/staff-magic-link.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaa0000-0000-0000-0000-000000000001';
const TENANT_ID_B = 'bbbb0000-0000-0000-0000-000000000002';
const STAFF_ID = 'ssss0000-0000-0000-0000-000000000001';
const ADMIN_ID = 'uuuu0000-0000-0000-0000-000000000001';
const INVITE_ID = 'iiii0000-0000-0000-0000-000000000001';

const MOCK_STAFF = {
  id: STAFF_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@creche.co.za',
  isActive: true,
  deletedAt: null,
};

const MOCK_TENANT = {
  id: TENANT_ID,
  tradingName: 'Sunshine Creche',
  name: 'Sunshine ECD (Pty) Ltd',
};

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 1000);

function mockInvitation(
  overrides: Partial<{
    id: string;
    tenantId: string;
    staffId: string;
    email: string;
    tokenHash: string;
    status: StaffInvitationStatus;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    invitedById: string;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: INVITE_ID,
    tenantId: TENANT_ID,
    staffId: STAFF_ID,
    email: MOCK_STAFF.email,
    tokenHash: 'fake-hash-placeholder',
    status: StaffInvitationStatus.PENDING,
    expiresAt: futureDate,
    acceptedAt: null,
    revokedAt: null,
    invitedById: ADMIN_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  staff: {
    findUnique: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  staffInvitation: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockMailgun = {
  sendEmail: jest.fn(),
};

const mockStaffMagicLink = {
  generateMagicLink: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue(undefined),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('StaffInvitationService', () => {
  let service: StaffInvitationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: config returns undefined → falls back to localhost
    mockConfig.get.mockReturnValue(undefined);
    // Default: email succeeds
    mockMailgun.sendEmail.mockResolvedValue({
      id: 'mg-id',
      status: 'queued',
      message: 'ok',
    });
    // Default: magic link succeeds
    mockStaffMagicLink.generateMagicLink.mockResolvedValue(true);
    // Default: audit log succeeds
    mockPrisma.auditLog.create.mockResolvedValue({});
    // Default: tenant found
    mockPrisma.tenant.findUnique.mockResolvedValue(MOCK_TENANT);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffInvitationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailgunService, useValue: mockMailgun },
        { provide: StaffMagicLinkService, useValue: mockStaffMagicLink },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<StaffInvitationService>(StaffInvitationService);
  });

  // =========================================================================
  // inviteStaff — happy path
  // =========================================================================

  describe('inviteStaff', () => {
    it('should create invitation and send email (happy path)', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue(MOCK_STAFF);
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(null); // no prior invite
      mockPrisma.staffInvitation.create.mockResolvedValue(
        mockInvitation({ expiresAt: futureDate }),
      );

      const result = await service.inviteStaff(TENANT_ID, STAFF_ID, ADMIN_ID);

      expect(result.inviteSentAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockPrisma.staffInvitation.create).toHaveBeenCalledTimes(1);
      expect(mockMailgun.sendEmail).toHaveBeenCalledTimes(1);
      const emailCall = mockMailgun.sendEmail.mock.calls[0][0] as {
        to: string;
        subject: string;
        tags: string[];
      };
      expect(emailCall.to).toBe(MOCK_STAFF.email);
      expect(emailCall.subject).toContain('Sunshine Creche');
      expect(emailCall.tags).toContain('staff-invite');
    });

    it('should throw NotFoundException for unknown staff', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteStaff(TENANT_ID, STAFF_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if staff has no email', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        ...MOCK_STAFF,
        email: null,
      });

      await expect(
        service.inviteStaff(TENANT_ID, STAFF_ID, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should revoke prior PENDING invite before creating a new one (re-invite)', async () => {
      const priorInvite = mockInvitation({ id: 'prior-invite-id' });
      mockPrisma.staff.findUnique.mockResolvedValue(MOCK_STAFF);
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(priorInvite);
      mockPrisma.staffInvitation.update.mockResolvedValue({
        ...priorInvite,
        status: StaffInvitationStatus.REVOKED,
      });
      mockPrisma.staffInvitation.create.mockResolvedValue(
        mockInvitation({ id: 'new-invite-id' }),
      );

      const result = await service.inviteStaff(TENANT_ID, STAFF_ID, ADMIN_ID);

      // Prior invite was revoked
      expect(mockPrisma.staffInvitation.update).toHaveBeenCalledWith({
        where: { id: 'prior-invite-id' },
        data: {
          status: StaffInvitationStatus.REVOKED,
          revokedAt: expect.any(Date) as Date,
        },
      });
      // New invite was created
      expect(mockPrisma.staffInvitation.create).toHaveBeenCalledTimes(1);
      expect(result.inviteSentAt).toBeInstanceOf(Date);
      // Email was sent once (for the new invite)
      expect(mockMailgun.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should enforce tenant isolation — wrong tenantId → NotFoundException', async () => {
      // Staff exists but belongs to a different tenant
      mockPrisma.staff.findUnique.mockResolvedValue({
        ...MOCK_STAFF,
        tenantId: TENANT_ID_B,
      });

      await expect(
        service.inviteStaff(TENANT_ID, STAFF_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // acceptInvite — happy path
  // =========================================================================

  describe('acceptInvite', () => {
    // We need a real-looking token that SHA-256 produces a known hash for.
    // Since we're mocking findUnique by tokenHash we just check the flow.

    it('should accept valid invite and send magic link (happy path)', async () => {
      const inv = mockInvitation();
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(inv);
      mockPrisma.staff.findUnique.mockResolvedValue(MOCK_STAFF);
      mockPrisma.staffInvitation.update.mockResolvedValue({
        ...inv,
        status: StaffInvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
      });

      const result = await service.acceptInvite('a'.repeat(43)); // fake raw token ≥20 chars

      expect(result.staffId).toBe(STAFF_ID);
      expect(result.magicLinkSent).toBe(true);
      expect(mockStaffMagicLink.generateMagicLink).toHaveBeenCalledWith(
        MOCK_STAFF.email,
      );
      expect(mockPrisma.staffInvitation.update).toHaveBeenCalledWith({
        where: { id: INVITE_ID },
        data: {
          status: StaffInvitationStatus.ACCEPTED,
          acceptedAt: expect.any(Date) as Date,
        },
      });
    });

    it('should throw BadRequestException for unknown token', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvite('unknown-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired invite (status=EXPIRED)', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.EXPIRED,
          expiresAt: pastDate,
        }),
      );

      await expect(service.acceptInvite('any-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for PENDING invite past expiry', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.PENDING,
          expiresAt: pastDate,
        }),
      );
      mockPrisma.staffInvitation.update.mockResolvedValue({});

      await expect(service.acceptInvite('any-token')).rejects.toThrow(
        BadRequestException,
      );
      // Should have flipped status to EXPIRED
      expect(mockPrisma.staffInvitation.update).toHaveBeenCalledWith({
        where: { id: INVITE_ID },
        data: { status: StaffInvitationStatus.EXPIRED },
      });
    });

    it('should throw ConflictException for already-accepted invite', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        }),
      );

      await expect(service.acceptInvite('any-token')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for revoked invite', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.REVOKED,
          revokedAt: new Date(),
        }),
      );

      await expect(service.acceptInvite('any-token')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // revokeInvite
  // =========================================================================

  describe('revokeInvite', () => {
    it('should revoke a PENDING invite', async () => {
      const inv = mockInvitation();
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(inv);
      mockPrisma.staffInvitation.update.mockResolvedValue({
        ...inv,
        status: StaffInvitationStatus.REVOKED,
        revokedAt: new Date(),
      });

      const result = await service.revokeInvite(TENANT_ID, INVITE_ID, ADMIN_ID);

      expect(result.success).toBe(true);
      expect(mockPrisma.staffInvitation.update).toHaveBeenCalledWith({
        where: { id: INVITE_ID },
        data: {
          status: StaffInvitationStatus.REVOKED,
          revokedAt: expect.any(Date) as Date,
        },
      });
    });

    it('should throw NotFoundException for invite in wrong tenant', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({ tenantId: TENANT_ID_B }),
      );

      await expect(
        service.revokeInvite(TENANT_ID, INVITE_ID, ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invite is not PENDING', async () => {
      mockPrisma.staffInvitation.findUnique.mockResolvedValue(
        mockInvitation({ status: StaffInvitationStatus.ACCEPTED }),
      );

      await expect(
        service.revokeInvite(TENANT_ID, INVITE_ID, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // getInviteStatus
  // =========================================================================

  describe('getInviteStatus', () => {
    beforeEach(() => {
      mockPrisma.staff.findUnique.mockResolvedValue(MOCK_STAFF);
    });

    it('should return NOT_INVITED when no record exists', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(null);

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('NOT_INVITED');
    });

    it('should return PENDING for a valid pending invite', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.PENDING,
          expiresAt: futureDate,
        }),
      );

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('PENDING');
    });

    it('should return ACCEPTED for an accepted invite', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        }),
      );

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('ACCEPTED');
    });

    it('should return EXPIRED when status=EXPIRED', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.EXPIRED,
          expiresAt: pastDate,
        }),
      );

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('EXPIRED');
    });

    it('should return EXPIRED when status=PENDING but expiresAt is in the past', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.PENDING,
          expiresAt: pastDate,
        }),
      );

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('EXPIRED');
    });

    it('should return REVOKED for a revoked invite', async () => {
      mockPrisma.staffInvitation.findFirst.mockResolvedValue(
        mockInvitation({
          status: StaffInvitationStatus.REVOKED,
          revokedAt: new Date(),
        }),
      );

      const result = await service.getInviteStatus(TENANT_ID, STAFF_ID);
      expect(result.status).toBe('REVOKED');
    });

    it('should throw NotFoundException for staff in wrong tenant', async () => {
      mockPrisma.staff.findUnique.mockResolvedValue({
        ...MOCK_STAFF,
        tenantId: TENANT_ID_B,
      });

      await expect(
        service.getInviteStatus(TENANT_ID, STAFF_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // expireOldInvites
  // =========================================================================

  describe('expireOldInvites', () => {
    it('should return affected row count', async () => {
      mockPrisma.staffInvitation.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.expireOldInvites();
      expect(count).toBe(3);
      expect(mockPrisma.staffInvitation.updateMany).toHaveBeenCalledWith({
        where: {
          status: StaffInvitationStatus.PENDING,
          expiresAt: { lt: expect.any(Date) as Date },
        },
        data: { status: StaffInvitationStatus.EXPIRED },
      });
    });

    it('should return 0 when no rows are expired', async () => {
      mockPrisma.staffInvitation.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.expireOldInvites();
      expect(count).toBe(0);
    });
  });
});
