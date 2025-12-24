/**
 * Transaction Repository - Reconciled Delete Protection Tests
 * TASK-RECON-014: CRIT-001 fix verification
 *
 * Tests that reconciled transactions cannot be deleted, which is a
 * compliance requirement per REQ-RECON-010.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionRepository } from '../transaction.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../services/audit-log.service';
import { ForbiddenException } from '../../../shared/exceptions';

describe('TransactionRepository - Reconciled Delete Protection', () => {
  let repository: TransactionRepository;
  let mockPrisma: any;
  let mockAuditLogService: any;

  beforeEach(async () => {
    mockPrisma = {
      transaction: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    repository = module.get<TransactionRepository>(TransactionRepository);
  });

  describe('softDelete - reconciled protection (CRIT-001)', () => {
    const tenantId = 'tenant-123';
    const transactionId = 'tx-456';
    const userId = 'user-789';

    it('should throw ForbiddenException when deleting reconciled transaction', async () => {
      // Arrange: Create a reconciled transaction
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt: new Date('2024-01-15'),
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act & Assert
      await expect(
        repository.softDelete(tenantId, transactionId, userId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw with correct error code RECONCILED_TRANSACTION_UNDELETABLE', async () => {
      // Arrange
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt: new Date('2024-01-15'),
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act & Assert
      try {
        await repository.softDelete(tenantId, transactionId, userId);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).code).toBe(
          'RECONCILED_TRANSACTION_UNDELETABLE',
        );
      }
    });

    it('should include transaction details in error response', async () => {
      // Arrange
      const reconciledAt = new Date('2024-01-15');
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt,
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act & Assert
      try {
        await repository.softDelete(tenantId, transactionId, userId);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).details).toEqual({
          transactionId,
          reconciledAt,
        });
      }
    });

    it('should log blocked deletion to audit trail', async () => {
      // Arrange
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt: new Date('2024-01-15'),
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act
      try {
        await repository.softDelete(tenantId, transactionId, userId);
      } catch {
        // Expected to throw
      }

      // Assert: Audit log was called
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'Transaction',
          entityId: transactionId,
          action: 'DELETE_BLOCKED',
          userId,
        }),
      );
    });

    it('should NOT delete the transaction when reconciled', async () => {
      // Arrange
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt: new Date('2024-01-15'),
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act
      try {
        await repository.softDelete(tenantId, transactionId, userId);
      } catch {
        // Expected to throw
      }

      // Assert: update was NOT called
      expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    });

    it('should allow deletion of non-reconciled transaction', async () => {
      // Arrange: Non-reconciled transaction
      const nonReconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: false,
        reconciledAt: null,
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(
        nonReconciledTransaction,
      );
      mockPrisma.transaction.update.mockResolvedValue({
        ...nonReconciledTransaction,
        isDeleted: true,
        deletedAt: new Date(),
      });

      // Act & Assert: Should NOT throw
      await expect(
        repository.softDelete(tenantId, transactionId, userId),
      ).resolves.not.toThrow();
    });

    it('should set isDeleted and deletedAt for non-reconciled transactions', async () => {
      // Arrange
      const nonReconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: false,
        reconciledAt: null,
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(
        nonReconciledTransaction,
      );
      mockPrisma.transaction.update.mockResolvedValue({});

      // Act
      await repository.softDelete(tenantId, transactionId, userId);

      // Assert: update was called with correct data
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
    });

    it('should handle system operations without userId', async () => {
      // Arrange
      const reconciledTransaction = {
        id: transactionId,
        tenantId,
        isReconciled: true,
        reconciledAt: new Date('2024-01-15'),
        isDeleted: false,
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(reconciledTransaction);

      // Act: Call without userId
      try {
        await repository.softDelete(tenantId, transactionId);
      } catch {
        // Expected to throw
      }

      // Assert: Audit log was called with undefined userId
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
        }),
      );
    });
  });
});
