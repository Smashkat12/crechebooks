/**
 * ParentPortalChildService — unit tests
 *
 * Coverage:
 *  1. Happy path: parent owns child → fields update + audit log row created
 *  2. Ownership deny: childId belongs to a different parent → ForbiddenException, no write
 *  3. Tenant mismatch: childId in a different tenant → ForbiddenException, no write
 *  4. Identity change: firstName update writes non-redacted before/after in audit log
 *  5. Identity change: admin in-app notification dispatched when name changes
 *  6. DOB guard: dateOfBirth is not accepted by the DTO (TypeScript shape prevents it)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { InAppNotificationService } from '../../../notifications/in-app-notification.service';
import { UpdateParentChildDto } from '../dto/update-parent-child.dto';

const TENANT_ID = 'tenant-aaa';
const OTHER_TENANT_ID = 'tenant-bbb';
const PARENT_ID = 'parent-111';
const OTHER_PARENT_ID = 'parent-222';
const CHILD_ID = 'child-abc';
const ACTOR_ID = 'session-xyz';
const ADMIN_USER_ID = 'user-admin-001';

const CHILD_ROW = {
  id: CHILD_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  gender: null,
  medicalNotes: null,
  emergencyContact: null,
  emergencyPhone: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const UPDATED_ROW = {
  ...CHILD_ROW,
  medicalNotes: 'Allergic to peanuts',
  emergencyContact: 'Grandmother Mary',
  emergencyPhone: '+27821234567',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const UPDATED_ROW_WITH_NAME = {
  ...CHILD_ROW,
  firstName: 'Amelia',
  lastName: 'Smith',
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('ParentPortalChildService', () => {
  let service: ParentPortalChildService;
  let mockPrisma: {
    child: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let mockInAppNotifications: {
    create: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      child: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: ADMIN_USER_ID }]),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockInAppNotifications = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentPortalChildService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InAppNotificationService, useValue: mockInAppNotifications },
      ],
    }).compile();

    service = module.get<ParentPortalChildService>(ParentPortalChildService);
  });

  describe('updateChildForParent', () => {
    it('happy path: parent owns child — updates fields and writes audit log', async () => {
      mockPrisma.child.findFirst.mockResolvedValue(CHILD_ROW);

      // Simulate $transaction executing the callback with a tx client
      mockPrisma.$transaction.mockImplementation(
        async (
          callback: (tx: {
            child: { update: jest.Mock };
            auditLog: { create: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const txClient = {
            child: { update: jest.fn().mockResolvedValue(UPDATED_ROW) },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          const result = await callback(txClient);
          // Expose spies for assertions
          (mockPrisma as unknown as { _txChild: jest.Mock })._txChild =
            txClient.child.update;
          (mockPrisma as unknown as { _txAudit: jest.Mock })._txAudit =
            txClient.auditLog.create;
          return result;
        },
      );

      const dto = {
        medicalNotes: 'Allergic to peanuts',
        emergencyContact: 'Grandmother Mary',
        emergencyPhone: '+27821234567',
      };

      const result = await service.updateChildForParent(
        PARENT_ID,
        CHILD_ID,
        dto,
        TENANT_ID,
        ACTOR_ID,
      );

      // Ownership query must be tenant-scoped and parent-scoped
      expect(mockPrisma.child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: CHILD_ID,
            tenantId: TENANT_ID,
            parentId: PARENT_ID,
            deletedAt: null,
          }),
        }),
      );

      // Transaction was invoked
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Inside transaction: child.update called with correct data
      const txChildUpdate = (mockPrisma as unknown as { _txChild: jest.Mock })
        ._txChild;
      expect(txChildUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CHILD_ID },
          data: expect.objectContaining({
            medicalNotes: 'Allergic to peanuts',
            emergencyContact: 'Grandmother Mary',
            emergencyPhone: '+27821234567',
          }),
        }),
      );

      // Audit log was created with redacted content and via marker
      const txAuditCreate = (mockPrisma as unknown as { _txAudit: jest.Mock })
        ._txAudit;
      expect(txAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            userId: ACTOR_ID,
            entityType: 'Child',
            entityId: CHILD_ID,
            action: 'UPDATE',
            afterValue: expect.objectContaining({ via: 'parent-portal' }),
          }),
        }),
      );

      // No identity fields changed → no admin notification
      expect(mockInAppNotifications.create).not.toHaveBeenCalled();

      // Response shape includes identity fields
      expect(result).toMatchObject({
        id: CHILD_ID,
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('ownership deny: childId belongs to a different parent → ForbiddenException, no write', async () => {
      // findFirst returns null because parentId filter excludes the row
      mockPrisma.child.findFirst.mockResolvedValue(null);

      const dto = { medicalNotes: 'Some notes' };

      await expect(
        service.updateChildForParent(
          OTHER_PARENT_ID,
          CHILD_ID,
          dto,
          TENANT_ID,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);

      // The query must have used the requesting parent's ID
      expect(mockPrisma.child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentId: OTHER_PARENT_ID,
          }),
        }),
      );

      // No write
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('tenant mismatch: childId in a different tenant → ForbiddenException, no write', async () => {
      // findFirst returns null because tenantId filter excludes the row
      mockPrisma.child.findFirst.mockResolvedValue(null);

      const dto = { emergencyPhone: '+27821234567' };

      await expect(
        service.updateChildForParent(
          PARENT_ID,
          CHILD_ID,
          dto,
          OTHER_TENANT_ID,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: OTHER_TENANT_ID,
          }),
        }),
      );

      // No write
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('identity change: firstName/lastName update writes FULL (non-redacted) before/after in audit log', async () => {
      mockPrisma.child.findFirst.mockResolvedValue(CHILD_ROW);

      let capturedAuditData: unknown;
      mockPrisma.$transaction.mockImplementation(
        async (
          callback: (tx: {
            child: { update: jest.Mock };
            auditLog: { create: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const txClient = {
            child: {
              update: jest.fn().mockResolvedValue(UPDATED_ROW_WITH_NAME),
            },
            auditLog: {
              create: jest.fn().mockImplementation((args: unknown) => {
                capturedAuditData = args;
                return Promise.resolve({});
              }),
            },
          };
          return callback(txClient);
        },
      );

      const dto: UpdateParentChildDto = {
        firstName: 'Amelia',
        lastName: 'Smith',
      };

      await service.updateChildForParent(
        PARENT_ID,
        CHILD_ID,
        dto,
        TENANT_ID,
        ACTOR_ID,
      );

      // Audit log must contain the ACTUAL before/after values (not '[redacted]')
      expect(capturedAuditData).toMatchObject({
        data: expect.objectContaining({
          beforeValue: expect.objectContaining({
            firstName: 'Jane', // actual old value from CHILD_ROW
            lastName: 'Doe',
          }),
          afterValue: expect.objectContaining({
            firstName: 'Amelia', // actual new value
            lastName: 'Smith',
            via: 'parent-portal',
          }),
        }),
      });

      // Must NOT have redacted the identity fields
      const auditPayload = capturedAuditData as {
        data: { beforeValue: Record<string, unknown> };
      };
      expect(auditPayload.data.beforeValue.firstName).not.toBe('[redacted]');
    });

    it('identity change: admin in-app SYSTEM_ALERT dispatched when name changes', async () => {
      mockPrisma.child.findFirst.mockResolvedValue(CHILD_ROW);
      mockPrisma.user.findMany.mockResolvedValue([{ id: ADMIN_USER_ID }]);

      mockPrisma.$transaction.mockImplementation(
        async (
          callback: (tx: {
            child: { update: jest.Mock };
            auditLog: { create: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const txClient = {
            child: {
              update: jest.fn().mockResolvedValue(UPDATED_ROW_WITH_NAME),
            },
            auditLog: { create: jest.fn().mockResolvedValue({}) },
          };
          return callback(txClient);
        },
      );

      const dto: UpdateParentChildDto = { firstName: 'Amelia' };

      await service.updateChildForParent(
        PARENT_ID,
        CHILD_ID,
        dto,
        TENANT_ID,
        ACTOR_ID,
      );

      // Admin user query must be tenant-scoped and role-filtered
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            role: { in: ['OWNER', 'ADMIN'] },
            isActive: true,
          }),
        }),
      );

      // In-app notification must have been created for the admin user
      expect(mockInAppNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          recipientType: 'USER',
          recipientId: ADMIN_USER_ID,
          type: 'SYSTEM_ALERT',
          priority: 'HIGH',
          metadata: expect.objectContaining({
            childId: CHILD_ID,
            changedFields: expect.arrayContaining(['firstName']),
            source: 'parent-portal',
          }),
        }),
      );
    });

    it('DOB guard: dateOfBirth is not a property of UpdateParentChildDto', () => {
      // This is a TypeScript compile-time enforcement check.
      // If dateOfBirth were added to the DTO, this test would fail to compile.
      // We confirm the DTO type does NOT include dateOfBirth.
      type DtoKeys = keyof UpdateParentChildDto;
      // @ts-expect-error — dateOfBirth must not exist on the DTO; this line must NOT compile cleanly
      const _dob: DtoKeys = 'dateOfBirth';
      // The ts-expect-error above proves the type guard is effective at compile time.
      // At runtime, the DTO simply won't expose the field.
      expect(true).toBe(true);
    });
  });
});
