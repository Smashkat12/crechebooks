/**
 * ParentPortalChildService — unit tests
 *
 * Coverage:
 *  1. Happy path: parent owns child → fields update + audit log row created
 *  2. Ownership deny: childId belongs to a different parent → ForbiddenException, no write
 *  3. Tenant mismatch: childId in a different tenant → ForbiddenException, no write
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

const TENANT_ID = 'tenant-aaa';
const OTHER_TENANT_ID = 'tenant-bbb';
const PARENT_ID = 'parent-111';
const OTHER_PARENT_ID = 'parent-222';
const CHILD_ID = 'child-abc';
const ACTOR_ID = 'session-xyz';

const CHILD_ROW = {
  id: CHILD_ID,
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

describe('ParentPortalChildService', () => {
  let service: ParentPortalChildService;
  let mockPrisma: {
    child: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      child: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentPortalChildService,
        { provide: PrismaService, useValue: mockPrisma },
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
      const txChildUpdate = (
        mockPrisma as unknown as { _txChild: jest.Mock }
      )._txChild;
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
      const txAuditCreate = (
        mockPrisma as unknown as { _txAudit: jest.Mock }
      )._txAudit;
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

      // Response shape is correct
      expect(result).toEqual({
        id: CHILD_ID,
        medicalNotes: 'Allergic to peanuts',
        emergencyContact: 'Grandmother Mary',
        emergencyPhone: '+27821234567',
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
  });
});
