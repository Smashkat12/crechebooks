/**
 * ReconciliationService Integration Tests
 * TASK-RECON-011: Bank Reconciliation Service
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests reconciliation, balance calculation, discrepancy detection, and transaction matching
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ReconciliationService } from '../../../src/database/services/reconciliation.service';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { ReconciliationStatus, Tenant, User } from '@prisma/client';
import {
  ConflictException,
  BusinessException,
} from '../../../src/shared/exceptions';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        ReconciliationService,
        ReconciliationRepository,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<ReconciliationService>(ReconciliationService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Recon Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: `recon${Date.now()}@test.co.za`,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|${Date.now()}`,
        email: `accountant${Date.now()}@test.co.za`,
        name: 'Test Accountant',
        role: 'ACCOUNTANT',
      },
    });
  });

  afterEach(async () => {
    // Cleanup test data in FK order - CRITICAL
    if (testTenant?.id) {
      await prisma.bankStatementMatch.deleteMany({});
      await prisma.reconciliation.deleteMany({
        where: { tenantId: testTenant.id },
      });
      await prisma.transaction.deleteMany({
        where: { tenantId: testTenant.id },
      });
      await prisma.user.deleteMany({ where: { tenantId: testTenant.id } });
      await prisma.tenant.delete({ where: { id: testTenant.id } });
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('reconcile()', () => {
    it('should reconcile when calculated = closing balance', async () => {
      // Create transactions: +10000c, -3000c (net +7000c)
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            date: new Date('2025-01-15'),
            description: 'Deposit',
            amountCents: 10000,
            isCredit: true,
            source: 'MANUAL',
            status: 'PENDING',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            date: new Date('2025-01-20'),
            description: 'Withdrawal',
            amountCents: 3000,
            isCredit: false,
            source: 'MANUAL',
            status: 'PENDING',
          },
        ],
      });

      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000, // R500
          closingBalanceCents: 57000, // R570 = 500 + 100 - 30
        },
        testUser.id,
      );

      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.discrepancyCents).toBe(0);
      expect(result.matchedCount).toBe(2);
      expect(result.calculatedBalanceCents).toBe(57000);

      // Verify transactions are marked as reconciled
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
        },
      });
      expect(transactions.every((t) => t.isReconciled)).toBe(true);
      expect(transactions.every((t) => t.reconciledAt !== null)).toBe(true);
    });

    it('should detect discrepancy when balances differ', async () => {
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Deposit',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000,
          closingBalanceCents: 65000, // Wrong - should be 60000
        },
        testUser.id,
      );

      expect(result.status).toBe(ReconciliationStatus.DISCREPANCY);
      expect(result.discrepancyCents).toBe(5000);
      expect(result.matchedCount).toBe(0); // Not reconciled

      // Verify transactions are NOT marked as reconciled
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
        },
      });
      expect(transactions.every((t) => !t.isReconciled)).toBe(true);
    });

    it('should throw on already reconciled period', async () => {
      // Create reconciled period
      await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 60000,
          calculatedBalanceCents: 60000,
          discrepancyCents: 0,
          status: ReconciliationStatus.RECONCILED,
          reconciledBy: testUser.id,
          reconciledAt: new Date(),
        },
      });

      await expect(
        service.reconcile(
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            periodStart: '2025-01-01',
            periodEnd: '2025-01-31',
            openingBalanceCents: 50000,
            closingBalanceCents: 60000,
          },
          testUser.id,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle period with no transactions', async () => {
      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000,
          closingBalanceCents: 50000, // No change
        },
        testUser.id,
      );

      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.calculatedBalanceCents).toBe(50000);
      expect(result.matchedCount).toBe(0);
      expect(result.unmatchedCount).toBe(0);
    });

    it('should throw on invalid period dates', async () => {
      await expect(
        service.reconcile(
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            periodStart: '2025-01-31',
            periodEnd: '2025-01-01', // End before start
            openingBalanceCents: 50000,
            closingBalanceCents: 50000,
          },
          testUser.id,
        ),
      ).rejects.toThrow(BusinessException);
    });

    it('should accept discrepancy within 1 cent tolerance', async () => {
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Deposit',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      // 1 cent discrepancy should still be RECONCILED
      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000,
          closingBalanceCents: 60001, // 1 cent over
        },
        testUser.id,
      );

      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.discrepancyCents).toBe(1);
      expect(result.matchedCount).toBe(1);
    });

    it('should reject discrepancy over 1 cent', async () => {
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Deposit',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      // 2 cents discrepancy should be DISCREPANCY
      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000,
          closingBalanceCents: 60002, // 2 cents over
        },
        testUser.id,
      );

      expect(result.status).toBe(ReconciliationStatus.DISCREPANCY);
      expect(result.discrepancyCents).toBe(2);
      expect(result.matchedCount).toBe(0);
    });

    it('should update existing IN_PROGRESS reconciliation', async () => {
      // Create IN_PROGRESS reconciliation
      const existing = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 60000,
          calculatedBalanceCents: 55000,
          discrepancyCents: 5000,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Add transaction to match
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Deposit',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await service.reconcile(
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-31',
          openingBalanceCents: 50000,
          closingBalanceCents: 60000,
        },
        testUser.id,
      );

      expect(result.id).toBe(existing.id); // Same reconciliation updated
      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.discrepancyCents).toBe(0);
    });
  });

  describe('calculateBalance()', () => {
    it('should correctly calculate opening + credits - debits', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-06-15'),
            amountCents: 10000,
            isCredit: true,
            description: 'Income',
            source: 'MANUAL',
            status: 'PENDING',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-06-20'),
            amountCents: 5000,
            isCredit: true,
            description: 'Income',
            source: 'MANUAL',
            status: 'PENDING',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-06-25'),
            amountCents: 3000,
            isCredit: false,
            description: 'Expense',
            source: 'MANUAL',
            status: 'PENDING',
          },
        ],
      });

      const result = await service.calculateBalance(
        testTenant.id,
        'FNB',
        new Date('2025-01-01'),
        new Date('2025-12-31'),
        100000, // R1000 opening
      );

      // 100000 + 15000 - 3000 = 112000
      expect(result.calculatedBalanceCents).toBe(112000);
      expect(result.totalCreditsCents).toBe(15000);
      expect(result.totalDebitsCents).toBe(3000);
      expect(result.transactionCount).toBe(3);
      expect(result.openingBalanceCents).toBe(100000);
    });

    it('should only include transactions within period', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2024-12-31'), // Before period
            amountCents: 1000,
            isCredit: true,
            description: 'Before',
            source: 'MANUAL',
            status: 'PENDING',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-15'), // Within period
            amountCents: 2000,
            isCredit: true,
            description: 'Within',
            source: 'MANUAL',
            status: 'PENDING',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-02-01'), // After period
            amountCents: 3000,
            isCredit: true,
            description: 'After',
            source: 'MANUAL',
            status: 'PENDING',
          },
        ],
      });

      const result = await service.calculateBalance(
        testTenant.id,
        'FNB',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        0,
      );

      expect(result.transactionCount).toBe(1);
      expect(result.totalCreditsCents).toBe(2000);
      expect(result.calculatedBalanceCents).toBe(2000);
    });

    it('should exclude deleted transactions', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-15'),
            amountCents: 5000,
            isCredit: true,
            description: 'Active',
            source: 'MANUAL',
            status: 'PENDING',
            isDeleted: false,
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-20'),
            amountCents: 3000,
            isCredit: true,
            description: 'Deleted',
            source: 'MANUAL',
            status: 'PENDING',
            isDeleted: true,
            deletedAt: new Date(),
          },
        ],
      });

      const result = await service.calculateBalance(
        testTenant.id,
        'FNB',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        0,
      );

      expect(result.transactionCount).toBe(1);
      expect(result.totalCreditsCents).toBe(5000);
    });
  });

  describe('getUnmatched()', () => {
    it('should return only unreconciled transactions', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-15'),
            amountCents: 1000,
            isCredit: true,
            description: 'Unreconciled 1',
            source: 'MANUAL',
            status: 'PENDING',
            isReconciled: false,
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-20'),
            amountCents: 2000,
            isCredit: true,
            description: 'Reconciled',
            source: 'MANUAL',
            status: 'PENDING',
            isReconciled: true,
            reconciledAt: new Date(),
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB',
            date: new Date('2025-01-25'),
            amountCents: 3000,
            isCredit: true,
            description: 'Unreconciled 2',
            source: 'MANUAL',
            status: 'PENDING',
            isReconciled: false,
          },
        ],
      });

      const result = await service.getUnmatched(
        testTenant.id,
        'FNB',
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(result).toHaveLength(2);
      expect(result.every((t) => !t.isReconciled)).toBe(true);
      expect(result[0].description).toBe('Unreconciled 1');
      expect(result[1].description).toBe('Unreconciled 2');
    });
  });

  describe('matchTransactions()', () => {
    it('should not allow matching on reconciled period', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 0,
          calculatedBalanceCents: 0,
          discrepancyCents: 0,
          status: ReconciliationStatus.RECONCILED,
          reconciledBy: testUser.id,
          reconciledAt: new Date(),
        },
      });

      await expect(
        service.matchTransactions(testTenant.id, recon.id, ['some-tx-id']),
      ).rejects.toThrow(ConflictException);
    });

    it('should match valid transactions in IN_PROGRESS reconciliation', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 0,
          calculatedBalanceCents: 0,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      const tx1 = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          amountCents: 1000,
          isCredit: true,
          description: 'Transaction 1',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const tx2 = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-20'),
          amountCents: 2000,
          isCredit: true,
          description: 'Transaction 2',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await service.matchTransactions(testTenant.id, recon.id, [
        tx1.id,
        tx2.id,
      ]);

      expect(result.matchedCount).toBe(2);
      expect(result.unmatchedCount).toBe(0);
      expect(result.matchedTransactionIds).toEqual([tx1.id, tx2.id]);

      // Verify transactions are marked as reconciled
      const updatedTx1 = await prisma.transaction.findUnique({
        where: { id: tx1.id },
      });
      const updatedTx2 = await prisma.transaction.findUnique({
        where: { id: tx2.id },
      });

      expect(updatedTx1?.isReconciled).toBe(true);
      expect(updatedTx1?.reconciledAt).not.toBeNull();
      expect(updatedTx2?.isReconciled).toBe(true);
      expect(updatedTx2?.reconciledAt).not.toBeNull();
    });

    it('should return zero counts for empty transaction list', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 0,
          calculatedBalanceCents: 0,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      const result = await service.matchTransactions(
        testTenant.id,
        recon.id,
        [],
      );

      expect(result.matchedCount).toBe(0);
      expect(result.unmatchedCount).toBe(0);
      expect(result.matchedTransactionIds).toEqual([]);
    });

    it('should only match transactions in the reconciliation period', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 0,
          calculatedBalanceCents: 0,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      const txInside = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          amountCents: 1000,
          isCredit: true,
          description: 'Inside period',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const txOutside = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-02-15'), // Outside period
          amountCents: 2000,
          isCredit: true,
          description: 'Outside period',
          source: 'MANUAL',
          status: 'PENDING',
        },
      });

      const result = await service.matchTransactions(testTenant.id, recon.id, [
        txInside.id,
        txOutside.id,
      ]);

      expect(result.matchedCount).toBe(1); // Only txInside
      expect(result.unmatchedCount).toBe(1); // txOutside rejected
      expect(result.matchedTransactionIds).toEqual([txInside.id]);
    });
  });
});
