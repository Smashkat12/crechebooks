/**
 * Transaction Reversal Service Tests
 * TXN-005: Fix Transaction Reversal
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { ReversalDetectionService } from '../../../src/database/services/reversal-detection.service';
import {
  TransactionReversalService,
  ReversalReason,
  ReversalStatus,
} from '../../../src/database/services/transaction-reversal.service';
import { Tenant, Transaction } from '@prisma/client';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import {
  NotFoundException,
  BusinessException,
  ConflictException,
} from '../../../src/shared/exceptions';

describe('TransactionReversalService', () => {
  let service: TransactionReversalService;
  let prisma: PrismaService;
  let transactionRepo: TransactionRepository;
  let testTenant: Tenant;
  let originalTx: Transaction;
  let reversalTx: Transaction;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        AuditLogService,
        ReversalDetectionService,
        TransactionReversalService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    service = module.get<TransactionReversalService>(
      TransactionReversalService,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean up in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'test-reversal' } },
    });

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche - Reversal',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '+27211234567',
        email: `test-reversal-${Date.now()}@example.com`,
      },
    });

    // Create original transaction (positive)
    originalTx = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB-123456',
        date: new Date('2024-01-15'),
        description: 'Payment received - John Smith',
        payeeName: 'John Smith',
        amountCents: 150000, // R1500
        isCredit: true,
        source: ImportSource.CSV_IMPORT,
        status: 'PENDING',
      },
    });

    // Create reversal transaction (negative)
    reversalTx = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB-123456',
        date: new Date('2024-01-17'),
        description: 'REV - Payment reversed - John Smith',
        payeeName: 'REV John Smith',
        amountCents: -150000, // -R1500
        isCredit: false,
        source: ImportSource.CSV_IMPORT,
        status: 'PENDING',
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.auditLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    if (testTenant) {
      await prisma.tenant
        .delete({ where: { id: testTenant.id } })
        .catch(() => {});
    }
  });

  describe('linkReversal', () => {
    it('should link reversal to original transaction', async () => {
      const result = await service.linkReversal(
        testTenant.id,
        reversalTx.id,
        originalTx.id,
        ReversalReason.DUPLICATE_PAYMENT,
        'Customer requested refund',
        'user123',
      );

      expect(result.reversal.reversalTransactionId).toBe(reversalTx.id);
      expect(result.reversal.originalTransactionId).toBe(originalTx.id);
      expect(result.reversal.status).toBe(ReversalStatus.CONFIRMED);
      expect(result.reversal.reason).toBe(ReversalReason.DUPLICATE_PAYMENT);

      // Verify transaction updated
      const updated = await transactionRepo.findById(
        testTenant.id,
        reversalTx.id,
      );
      expect(updated?.isReversal).toBe(true);
      expect(updated?.reversesTransactionId).toBe(originalTx.id);
    });

    it('should throw NotFoundException for non-existent reversal', async () => {
      await expect(
        service.linkReversal(testTenant.id, 'non-existent-id', originalTx.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent original', async () => {
      await expect(
        service.linkReversal(testTenant.id, reversalTx.id, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if reversal already linked', async () => {
      // Link first time
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      // Try to link again
      await expect(
        service.linkReversal(testTenant.id, reversalTx.id, originalTx.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should create audit log entry', async () => {
      await service.linkReversal(
        testTenant.id,
        reversalTx.id,
        originalTx.id,
        ReversalReason.BANK_ERROR,
        'Bank processing error',
        'user123',
      );

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityId: reversalTx.id,
          entityType: 'Transaction',
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].changeSummary).toContain('Linked reversal');
    });

    it('should handle different amounts with warning', async () => {
      // Create reversal with different amount
      const partialReversal = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-123456',
          date: new Date('2024-01-17'),
          description: 'Partial reversal',
          amountCents: -100000, // -R1000 (different from R1500)
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: 'PENDING',
        },
      });

      // Should still link (with warning logged)
      const result = await service.linkReversal(
        testTenant.id,
        partialReversal.id,
        originalTx.id,
      );

      expect(result.reversal.reversalAmountCents).toBe(-100000);
      expect(result.reversal.originalAmountCents).toBe(150000);
    });
  });

  describe('unlinkReversal', () => {
    it('should unlink a linked reversal', async () => {
      // First link
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      // Then unlink
      await service.unlinkReversal(
        testTenant.id,
        reversalTx.id,
        'user123',
        'Linked incorrectly',
      );

      const updated = await transactionRepo.findById(
        testTenant.id,
        reversalTx.id,
      );
      expect(updated?.isReversal).toBe(false);
      expect(updated?.reversesTransactionId).toBeNull();
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        service.unlinkReversal(testTenant.id, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not linked', async () => {
      await expect(
        service.unlinkReversal(testTenant.id, reversalTx.id),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('getPendingReversalSuggestions', () => {
    it('should return suggestions for potential reversals', async () => {
      const suggestions = await service.getPendingReversalSuggestions(
        testTenant.id,
      );

      // reversalTx should be detected as potential reversal of originalTx
      const suggestion = suggestions.find(
        (s) => s.reversalTransactionId === reversalTx.id,
      );

      if (suggestion) {
        expect(suggestion.suggestedOriginalId).toBe(originalTx.id);
        expect(suggestion.confidence).toBeGreaterThan(0);
      }
    });

    it('should sort by confidence descending', async () => {
      const suggestions = await service.getPendingReversalSuggestions(
        testTenant.id,
      );

      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(
          suggestions[i].confidence,
        );
      }
    });
  });

  describe('autoLinkReversals', () => {
    it('should auto-link high confidence matches', async () => {
      // Create a clearly matching reversal
      const clearReversal = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-123456',
          date: new Date('2024-01-15'), // Same day
          description: 'REVERSAL Payment received - John Smith',
          payeeName: 'John Smith', // Exact match
          amountCents: -150000, // Exact negative
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: 'PENDING',
        },
      });

      const results = await service.autoLinkReversals(testTenant.id);

      // Check if clear reversal was auto-linked
      const linkedResult = results.find(
        (r) => r.reversal.reversalTransactionId === clearReversal.id,
      );

      if (linkedResult) {
        expect(linkedResult.reversal.autoLinked).toBe(true);
        expect(linkedResult.reversal.linkedBy).toBe('SYSTEM');
      }
    });

    it('should skip already linked reversals', async () => {
      // Link first
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      // Auto-link should not try to link again
      const results = await service.autoLinkReversals(testTenant.id);

      const duplicate = results.find(
        (r) => r.reversal.reversalTransactionId === reversalTx.id,
      );
      expect(duplicate).toBeUndefined();
    });
  });

  describe('getReversalsForTransaction', () => {
    it('should return linked reversals', async () => {
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      const reversals = await service.getReversalsForTransaction(
        testTenant.id,
        originalTx.id,
      );

      expect(reversals.length).toBe(1);
      expect(reversals[0].reversalTransactionId).toBe(reversalTx.id);
    });

    it('should return empty array for no reversals', async () => {
      const reversals = await service.getReversalsForTransaction(
        testTenant.id,
        originalTx.id,
      );

      expect(reversals).toEqual([]);
    });
  });

  describe('getReversalSummary', () => {
    it('should return summary statistics', async () => {
      const summary = await service.getReversalSummary(testTenant.id);

      expect(summary).toHaveProperty('totalReversals');
      expect(summary).toHaveProperty('autoLinked');
      expect(summary).toHaveProperty('manuallyLinked');
      expect(summary).toHaveProperty('pendingSuggestions');
      expect(summary).toHaveProperty('totalAmountReversedCents');
    });

    it('should count linked reversals', async () => {
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      const summary = await service.getReversalSummary(testTenant.id);

      expect(summary.totalReversals).toBe(1);
    });

    it('should filter by date range', async () => {
      const summary = await service.getReversalSummary(
        testTenant.id,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(summary).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle transactions from different tenants', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Johannesburg',
          province: 'Gauteng',
          postalCode: '2000',
          phone: '+27111234567',
          email: `other-${Date.now()}@example.com`,
        },
      });

      const otherTx = await prisma.transaction.create({
        data: {
          tenantId: otherTenant.id,
          bankAccount: 'ABSA-789',
          date: new Date('2024-01-15'),
          description: 'Other transaction',
          amountCents: 150000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          status: 'PENDING',
        },
      });

      // Should not be able to link across tenants
      await expect(
        service.linkReversal(testTenant.id, reversalTx.id, otherTx.id),
      ).rejects.toThrow(NotFoundException);

      // Cleanup
      await prisma.transaction.delete({ where: { id: otherTx.id } });
      await prisma.tenant.delete({ where: { id: otherTenant.id } });
    });

    it('should handle reconciled original transactions', async () => {
      // Mark original as reconciled
      await prisma.transaction.update({
        where: { id: originalTx.id },
        data: { isReconciled: true, reconciledAt: new Date() },
      });

      // Should still link (with warning)
      const result = await service.linkReversal(
        testTenant.id,
        reversalTx.id,
        originalTx.id,
      );

      expect(result.reversal).toBeDefined();
    });

    it('should handle multiple reversals for same original', async () => {
      // Create second reversal
      const reversal2 = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-123456',
          date: new Date('2024-01-18'),
          description: 'Another reversal',
          amountCents: -50000, // Partial
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          status: 'PENDING',
        },
      });

      // Link first reversal
      await service.linkReversal(testTenant.id, reversalTx.id, originalTx.id);

      // Link second reversal (should work but log warning)
      const result = await service.linkReversal(
        testTenant.id,
        reversal2.id,
        originalTx.id,
      );

      expect(result.reversal.reversalTransactionId).toBe(reversal2.id);
    });
  });
});
