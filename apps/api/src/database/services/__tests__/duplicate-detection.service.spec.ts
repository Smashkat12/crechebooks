/**
 * Duplicate Detection Service Tests
 * TASK-RECON-015: Reconciliation Duplicate Detection Service
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DuplicateDetectionService } from '../duplicate-detection.service';
import { AuditLogService } from '../audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TransactionInput,
  DuplicateResolution,
  DuplicateStatus,
} from '../../types/duplicate.types';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let auditLogService: AuditLogService;
  let prisma: PrismaService;
  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectionService,
        PrismaService,
        {
          provide: AuditLogService,
          useValue: {
            logAction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DuplicateDetectionService>(DuplicateDetectionService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
    prisma = module.get<PrismaService>(PrismaService);

    // Initialize Prisma connection
    await prisma.onModuleInit();

    // Create a test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant for Duplicates',
        email: `duplicate-test-${Date.now()}@test.com`,
        addressLine1: '123 Test St',
        city: 'Test City',
        province: 'Test Province',
        postalCode: '12345',
        phone: '1234567890',
      },
    });
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.transaction.deleteMany({
      where: { tenantId: testTenantId },
    });
    await prisma.tenant.delete({
      where: { id: testTenantId },
    });
    await prisma.onModuleDestroy();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateHash', () => {
    it('should generate consistent SHA256 hash for same transaction', () => {
      const transaction: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-001',
        date: new Date('2024-01-15'),
        description: 'Test payment',
        reference: 'REF-001',
        amountCents: 10000,
        isCredit: true,
        source: 'CSV_IMPORT',
      };

      const hash1 = service.generateHash(transaction);
      const hash2 = service.generateHash(transaction);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    it('should generate different hashes for different transactions', () => {
      const transaction1: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-001',
        date: new Date('2024-01-15'),
        description: 'Test payment',
        reference: 'REF-001',
        amountCents: 10000,
        isCredit: true,
        source: 'CSV_IMPORT',
      };

      const transaction2: TransactionInput = {
        ...transaction1,
        amountCents: 20000,
      };

      const hash1 = service.generateHash(transaction1);
      const hash2 = service.generateHash(transaction2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle transactions without reference', () => {
      const transaction: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-001',
        date: new Date('2024-01-15'),
        description: 'Test payment',
        reference: null,
        amountCents: 10000,
        isCredit: true,
        source: 'CSV_IMPORT',
      };

      const hash = service.generateHash(transaction);
      expect(hash).toHaveLength(64);
    });
  });

  describe('checkForDuplicates', () => {
    it('should detect exact hash match with 100% confidence', async () => {
      // Create an existing transaction
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-15'),
          description: 'Existing payment',
          reference: 'REF-001',
          amountCents: 10000,
          isCredit: true,
          source: 'CSV_IMPORT',
          transactionHash: service.generateHash({
            tenantId: testTenantId,
            bankAccount: 'ACC-001',
            date: new Date('2024-01-15'),
            reference: 'REF-001',
            amountCents: 10000,
            isCredit: true,
            source: 'CSV_IMPORT',
            description: 'Existing payment',
          }),
        },
      });

      const newTransaction: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-001',
        date: new Date('2024-01-15'),
        description: 'Duplicate payment',
        reference: 'REF-001',
        amountCents: 10000,
        isCredit: true,
        source: 'CSV_IMPORT',
      };

      const result = await service.checkForDuplicates(testTenantId, [
        newTransaction,
      ]);

      expect(result.clean).toHaveLength(0);
      expect(result.potentialDuplicates).toHaveLength(1);
      expect(result.potentialDuplicates[0].confidence).toBe(100);
      expect(result.potentialDuplicates[0].existingMatch.id).toBe(
        existingTx.id,
      );

      // Clean up
      await prisma.transaction.delete({ where: { id: existingTx.id } });
    });

    it('should detect similar transactions with lower confidence', async () => {
      // Create an existing transaction
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-002',
          date: new Date('2024-01-20'),
          description: 'Payment for services',
          reference: 'REF-002',
          payeeName: 'Vendor A',
          amountCents: 15000,
          isCredit: false,
          source: 'MANUAL',
        },
      });

      const newTransaction: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-002',
        date: new Date('2024-01-20'),
        description: 'Payment for services', // Same description
        reference: 'REF-003', // Different reference - prevents exact hash match
        payeeName: 'Vendor A', // Same payee
        amountCents: 15000,
        isCredit: false,
        source: 'CSV_IMPORT',
      };

      const result = await service.checkForDuplicates(testTenantId, [
        newTransaction,
      ]);

      expect(result.clean).toHaveLength(0);
      expect(result.potentialDuplicates).toHaveLength(1);
      expect(result.potentialDuplicates[0].confidence).toBeGreaterThan(60);
      expect(result.potentialDuplicates[0].confidence).toBeLessThan(100);

      // Clean up
      await prisma.transaction.delete({ where: { id: existingTx.id } });
    });

    it('should pass clean transactions without duplicates', async () => {
      const newTransaction: TransactionInput = {
        tenantId: testTenantId,
        bankAccount: 'ACC-003',
        date: new Date('2024-02-01'),
        description: 'Unique payment',
        reference: 'UNIQUE-001',
        amountCents: 25000,
        isCredit: true,
        source: 'BANK_FEED',
      };

      const result = await service.checkForDuplicates(testTenantId, [
        newTransaction,
      ]);

      expect(result.clean).toHaveLength(1);
      expect(result.potentialDuplicates).toHaveLength(0);
      expect(result.clean[0]).toEqual(newTransaction);
    });

    it('should handle batch of mixed transactions', async () => {
      // Create existing transaction
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-004',
          date: new Date('2024-03-01'),
          description: 'Batch test',
          reference: 'BATCH-001',
          amountCents: 5000,
          isCredit: true,
          source: 'MANUAL',
          transactionHash: service.generateHash({
            tenantId: testTenantId,
            bankAccount: 'ACC-004',
            date: new Date('2024-03-01'),
            reference: 'BATCH-001',
            amountCents: 5000,
            isCredit: true,
            source: 'MANUAL',
            description: 'Batch test',
          }),
        },
      });

      const transactions: TransactionInput[] = [
        {
          tenantId: testTenantId,
          bankAccount: 'ACC-004',
          date: new Date('2024-03-01'),
          description: 'Batch test',
          reference: 'BATCH-001',
          amountCents: 5000,
          isCredit: true,
          source: 'CSV_IMPORT',
        },
        {
          tenantId: testTenantId,
          bankAccount: 'ACC-005',
          date: new Date('2024-03-02'),
          description: 'Clean transaction',
          reference: 'CLEAN-001',
          amountCents: 7500,
          isCredit: false,
          source: 'BANK_FEED',
        },
      ];

      const result = await service.checkForDuplicates(
        testTenantId,
        transactions,
      );

      expect(result.clean).toHaveLength(1);
      expect(result.potentialDuplicates).toHaveLength(1);
      expect(result.clean[0].reference).toBe('CLEAN-001');
      expect(result.potentialDuplicates[0].transaction.reference).toBe(
        'BATCH-001',
      );

      // Clean up
      await prisma.transaction.delete({ where: { id: existingTx.id } });
    });
  });

  describe('flagAsPotentialDuplicate', () => {
    it('should flag transaction as duplicate', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-006',
          date: new Date('2024-04-01'),
          description: 'Existing',
          amountCents: 3000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-006',
          date: new Date('2024-04-01'),
          description: 'Potential duplicate',
          amountCents: 3000,
          isCredit: true,
          source: 'CSV_IMPORT',
        },
      });

      await service.flagAsPotentialDuplicate(newTx.id, existingTx.id);

      const flagged = await prisma.transaction.findUnique({
        where: { id: newTx.id },
      });

      expect(flagged?.duplicateOfId).toBe(existingTx.id);
      expect(flagged?.duplicateStatus).toBe('FLAGGED');
      expect(auditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: testTenantId,
          entityType: 'Transaction',
          entityId: newTx.id,
          action: 'UPDATE',
        }),
      );

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, newTx.id] } },
      });
    });

    it('should throw error if transaction not found', async () => {
      await expect(
        service.flagAsPotentialDuplicate('non-existent-id', 'another-id'),
      ).rejects.toThrow('Transaction non-existent-id not found');
    });

    it('should throw error if existing transaction not found', async () => {
      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-007',
          date: new Date('2024-05-01'),
          description: 'Test',
          amountCents: 1000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      await expect(
        service.flagAsPotentialDuplicate(newTx.id, 'non-existent-id'),
      ).rejects.toThrow('Existing transaction non-existent-id not found');

      // Clean up
      await prisma.transaction.delete({ where: { id: newTx.id } });
    });
  });

  describe('resolveDuplicate', () => {
    it('should resolve with KEEP_BOTH', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-008',
          date: new Date('2024-06-01'),
          description: 'Existing',
          amountCents: 2000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-008',
          date: new Date('2024-06-01'),
          description: 'New',
          amountCents: 2000,
          isCredit: true,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      await service.resolveDuplicate(newTx.id, DuplicateResolution.KEEP_BOTH);

      const resolved = await prisma.transaction.findUnique({
        where: { id: newTx.id },
      });

      expect(resolved?.duplicateStatus).toBe('RESOLVED');
      expect(resolved?.duplicateOfId).toBeNull();
      expect(resolved?.isDeleted).toBe(false);

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, newTx.id] } },
      });
    });

    it('should resolve with REJECT_NEW', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-009',
          date: new Date('2024-07-01'),
          description: 'Existing',
          amountCents: 4000,
          isCredit: false,
          source: 'MANUAL',
        },
      });

      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-009',
          date: new Date('2024-07-01'),
          description: 'New',
          amountCents: 4000,
          isCredit: false,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      await service.resolveDuplicate(newTx.id, DuplicateResolution.REJECT_NEW);

      const resolved = await prisma.transaction.findUnique({
        where: { id: newTx.id },
      });

      expect(resolved?.duplicateStatus).toBe('RESOLVED');
      expect(resolved?.isDeleted).toBe(true);
      expect(resolved?.deletedAt).not.toBeNull();

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, newTx.id] } },
      });
    });

    it('should resolve with REJECT_EXISTING', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-010',
          date: new Date('2024-08-01'),
          description: 'Existing',
          amountCents: 6000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-010',
          date: new Date('2024-08-01'),
          description: 'New',
          amountCents: 6000,
          isCredit: true,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      await service.resolveDuplicate(
        newTx.id,
        DuplicateResolution.REJECT_EXISTING,
      );

      const resolved = await prisma.transaction.findUnique({
        where: { id: newTx.id },
      });
      const existing = await prisma.transaction.findUnique({
        where: { id: existingTx.id },
      });

      expect(resolved?.duplicateStatus).toBe('RESOLVED');
      expect(resolved?.duplicateOfId).toBeNull();
      expect(existing?.isDeleted).toBe(true);

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, newTx.id] } },
      });
    });

    it('should resolve with MERGE', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-011',
          date: new Date('2024-09-01'),
          description: 'Existing',
          amountCents: 8000,
          isCredit: false,
          source: 'MANUAL',
        },
      });

      const newTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-011',
          date: new Date('2024-09-01'),
          description: 'New',
          amountCents: 8000,
          isCredit: false,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      await service.resolveDuplicate(newTx.id, DuplicateResolution.MERGE);

      const resolved = await prisma.transaction.findUnique({
        where: { id: newTx.id },
      });

      expect(resolved?.duplicateStatus).toBe('RESOLVED');
      expect(resolved?.isDeleted).toBe(true);

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, newTx.id] } },
      });
    });

    it('should throw error if transaction not flagged', async () => {
      const tx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-012',
          date: new Date('2024-10-01'),
          description: 'Not flagged',
          amountCents: 1000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      await expect(
        service.resolveDuplicate(tx.id, DuplicateResolution.KEEP_BOTH),
      ).rejects.toThrow('is not flagged as a duplicate');

      // Clean up
      await prisma.transaction.delete({ where: { id: tx.id } });
    });
  });

  describe('getPendingDuplicates', () => {
    it('should return all pending duplicates for tenant', async () => {
      const existingTx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-013',
          date: new Date('2024-11-01'),
          description: 'Existing',
          amountCents: 5000,
          isCredit: true,
          source: 'MANUAL',
        },
      });

      const flaggedTx1 = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-013',
          date: new Date('2024-11-01'),
          description: 'Flagged 1',
          amountCents: 5000,
          isCredit: true,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      const flaggedTx2 = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'ACC-013',
          date: new Date('2024-11-02'),
          description: 'Flagged 2',
          amountCents: 5000,
          isCredit: true,
          source: 'CSV_IMPORT',
          duplicateOfId: existingTx.id,
          duplicateStatus: 'FLAGGED' as DuplicateStatus,
        },
      });

      const pending = await service.getPendingDuplicates(testTenantId);

      expect(pending.length).toBeGreaterThanOrEqual(2);
      const pendingIds = pending.map((p) => p.id);
      expect(pendingIds).toContain(flaggedTx1.id);
      expect(pendingIds).toContain(flaggedTx2.id);

      // Clean up
      await prisma.transaction.deleteMany({
        where: { id: { in: [existingTx.id, flaggedTx1.id, flaggedTx2.id] } },
      });
    });

    it('should return empty array if no pending duplicates', async () => {
      // Create a new tenant with no duplicates
      const cleanTenant = await prisma.tenant.create({
        data: {
          name: 'Clean Tenant',
          email: `clean-${Date.now()}@test.com`,
          addressLine1: '123 Clean St',
          city: 'Clean City',
          province: 'Clean Province',
          postalCode: '54321',
          phone: '9876543210',
        },
      });

      const pending = await service.getPendingDuplicates(cleanTenant.id);

      expect(pending).toHaveLength(0);

      // Clean up
      await prisma.tenant.delete({ where: { id: cleanTenant.id } });
    });
  });
});
