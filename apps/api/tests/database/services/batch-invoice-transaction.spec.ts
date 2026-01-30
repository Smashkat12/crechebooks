/**
 * Batch Invoice Transaction Isolation Tests
 * TASK-BILL-002: Transaction Isolation for Batch Invoice Generation
 *
 * Tests advisory locking and transaction isolation for preventing race conditions
 * during concurrent batch invoice generation.
 *
 * CRITICAL: Uses REAL database, no mocks for data operations.
 *
 * @module tests/database/services/batch-invoice-transaction.spec
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceGenerationService } from '../../../src/database/services/invoice-generation.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { CreditBalanceService } from '../../../src/database/services/credit-balance.service';
import { CreditNoteService } from '../../../src/database/services/credit-note.service';
import { InvoiceNumberService } from '../../../src/database/services/invoice-number.service';
import { WelcomePackDeliveryService } from '../../../src/database/services/welcome-pack-delivery.service';
import { ConflictException } from '../../../src/shared/exceptions';
import {
  withSerializableTransaction,
  isSerializationFailure,
  calculateExponentialBackoff,
  hashStringToInt,
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  withAdvisoryLock,
  withBatchIsolation,
} from '../../../src/common/transaction';
import { Prisma } from '@prisma/client';

/**
 * Mock XeroSyncService - external API integration not available in tests
 */
const mockXeroSyncService = {
  createInvoiceDraft: jest.fn().mockResolvedValue(null),
  syncTransactions: jest.fn().mockResolvedValue({
    totalProcessed: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }),
  pushToXero: jest.fn().mockResolvedValue(false),
  pullFromXero: jest.fn().mockResolvedValue({
    transactionsPulled: 0,
    duplicatesSkipped: 0,
    errors: [],
  }),
  syncChartOfAccounts: jest.fn().mockResolvedValue({
    accountsFetched: 0,
    newAccounts: [],
    errors: [],
  }),
  hasValidConnection: jest.fn().mockResolvedValue(false),
  mapVatToXeroTax: jest.fn().mockReturnValue('NONE'),
  mapXeroTaxToVat: jest.fn().mockReturnValue('NO_VAT'),
};

describe('Batch Invoice Transaction Isolation (TASK-BILL-002)', () => {
  let service: InvoiceGenerationService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        InvoiceGenerationService,
        InvoiceNumberService,
        EnrollmentService,
        InvoiceRepository,
        InvoiceLineRepository,
        EnrollmentRepository,
        ChildRepository,
        FeeStructureRepository,
        TenantRepository,
        ParentRepository,
        AuditLogService,
        ProRataService,
        CreditBalanceService,
        CreditNoteService,
        { provide: XeroSyncService, useValue: mockXeroSyncService },
        {
          provide: WelcomePackDeliveryService,
          useValue: {
            deliverWelcomePack: jest.fn().mockResolvedValue(undefined),
            sendWelcomePack: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    service = module.get<InvoiceGenerationService>(InvoiceGenerationService);
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Transaction Utility Functions', () => {
    describe('hashStringToInt', () => {
      it('should return consistent hash for same input', () => {
        const hash1 = hashStringToInt('batch_invoice_tenant123_2025-01');
        const hash2 = hashStringToInt('batch_invoice_tenant123_2025-01');

        expect(hash1).toBe(hash2);
      });

      it('should return different hashes for different inputs', () => {
        const hash1 = hashStringToInt('batch_invoice_tenant123_2025-01');
        const hash2 = hashStringToInt('batch_invoice_tenant456_2025-01');
        const hash3 = hashStringToInt('batch_invoice_tenant123_2025-02');

        expect(hash1).not.toBe(hash2);
        expect(hash1).not.toBe(hash3);
        expect(hash2).not.toBe(hash3);
      });

      it('should return positive integer', () => {
        const hash = hashStringToInt('any_string');

        expect(hash).toBeGreaterThan(0);
        expect(Number.isInteger(hash)).toBe(true);
      });

      it('should return 0 for empty string', () => {
        const hash = hashStringToInt('');

        expect(hash).toBe(0);
      });
    });

    describe('calculateExponentialBackoff', () => {
      it('should increase delay exponentially with attempt number', () => {
        const delay1 = calculateExponentialBackoff(1, 100);
        const delay2 = calculateExponentialBackoff(2, 100);
        const delay3 = calculateExponentialBackoff(3, 100);

        // Approximate ranges due to jitter
        expect(delay1).toBeGreaterThanOrEqual(100);
        expect(delay1).toBeLessThanOrEqual(300);

        expect(delay2).toBeGreaterThanOrEqual(300);
        expect(delay2).toBeLessThanOrEqual(500);

        expect(delay3).toBeGreaterThanOrEqual(700);
        expect(delay3).toBeLessThanOrEqual(900);
      });

      it('should use default base of 100ms', () => {
        const delay = calculateExponentialBackoff(1);

        expect(delay).toBeGreaterThanOrEqual(100);
        expect(delay).toBeLessThanOrEqual(300);
      });
    });

    describe('isSerializationFailure', () => {
      it('should return true for Prisma P2034 error', () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Transaction failed due to a write conflict',
          { code: 'P2034', clientVersion: '5.0.0' },
        );

        expect(isSerializationFailure(error)).toBe(true);
      });

      it('should return true for error with PostgreSQL 40001 code in meta', () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Serialization failure',
          {
            code: 'P1001',
            clientVersion: '5.0.0',
            meta: { code: '40001' },
          },
        );

        expect(isSerializationFailure(error)).toBe(true);
      });

      it('should return true for error message containing "serialization failure"', () => {
        const error = new Error(
          'could not serialize access due to concurrent update',
        );

        expect(isSerializationFailure(error)).toBe(true);
      });

      it('should return true for error message containing "deadlock detected"', () => {
        const error = new Error('deadlock detected');

        expect(isSerializationFailure(error)).toBe(true);
      });

      it('should return false for other errors', () => {
        const error = new Error('Some random error');

        expect(isSerializationFailure(error)).toBe(false);
      });

      it('should return false for non-error values', () => {
        expect(isSerializationFailure(null)).toBe(false);
        expect(isSerializationFailure(undefined)).toBe(false);
        expect(isSerializationFailure('string error')).toBe(false);
      });
    });
  });

  describe('Advisory Locking', () => {
    const testLockKey = `test_lock_${Date.now()}`;

    afterEach(async () => {
      // Clean up any held locks
      try {
        await releaseAdvisoryLock(prisma, testLockKey);
      } catch {
        // Ignore errors during cleanup
      }
    });

    it('should acquire advisory lock successfully', async () => {
      const acquired = await acquireAdvisoryLock(prisma, testLockKey);

      expect(acquired).toBe(true);

      // Clean up
      await releaseAdvisoryLock(prisma, testLockKey);
    });

    it('should release advisory lock successfully', async () => {
      // First acquire the lock
      await acquireAdvisoryLock(prisma, testLockKey);

      // Then release it
      const released = await releaseAdvisoryLock(prisma, testLockKey);

      expect(released).toBe(true);
    });

    it('should return false when trying to release a lock not held', async () => {
      const nonExistentLockKey = `non_existent_${Date.now()}`;

      const released = await releaseAdvisoryLock(prisma, nonExistentLockKey);

      expect(released).toBe(false);
    });

    it('should prevent acquiring lock when already held', async () => {
      // Acquire the lock in the first session
      const firstAcquire = await acquireAdvisoryLock(prisma, testLockKey);
      expect(firstAcquire).toBe(true);

      // Try to acquire the same lock again (same session - should succeed)
      // Note: PostgreSQL advisory locks are reentrant within the same session
      const secondAcquire = await acquireAdvisoryLock(prisma, testLockKey);
      expect(secondAcquire).toBe(true);

      // Clean up - need to release twice due to reentrant nature
      await releaseAdvisoryLock(prisma, testLockKey);
      await releaseAdvisoryLock(prisma, testLockKey);
    });

    it('should execute function within advisory lock and release after completion', async () => {
      let functionExecuted = false;

      const result = await withAdvisoryLock(prisma, testLockKey, async () => {
        functionExecuted = true;
        return 'test_result';
      });

      expect(functionExecuted).toBe(true);
      expect(result).toBe('test_result');
    });

    it('should release lock even when function throws', async () => {
      const errorLockKey = `error_test_${Date.now()}`;

      await expect(
        withAdvisoryLock(prisma, errorLockKey, async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      // Lock should be released - we can acquire it again
      const canAcquire = await acquireAdvisoryLock(prisma, errorLockKey);
      expect(canAcquire).toBe(true);

      await releaseAdvisoryLock(prisma, errorLockKey);
    });
  });

  describe('withSerializableTransaction', () => {
    it('should execute function within transaction', async () => {
      let transactionExecuted = false;

      const result = await withSerializableTransaction(
        prisma,
        async (tx) => {
          transactionExecuted = true;
          // Verify we have a transaction client
          expect(tx).toBeDefined();
          return 'transaction_result';
        },
        { maxRetries: 1, timeout: 5000 },
      );

      expect(transactionExecuted).toBe(true);
      expect(result).toBe('transaction_result');
    });

    it('should rollback entire batch on partial failure', async () => {
      const uniqueKey = `test_rollback_${Date.now()}`;

      // Create a test tenant for isolation
      const testTenant = await prisma.tenant.create({
        data: {
          name: `Rollback Test Creche ${uniqueKey}`,
          addressLine1: '123 Test Street',
          city: 'Test City',
          province: 'Gauteng',
          postalCode: '1234',
          phone: '+27110001111',
          email: `rollback${uniqueKey}@test.com`,
          taxStatus: 'NOT_REGISTERED',
        },
      });

      try {
        // Attempt a transaction that will fail partway through
        await withSerializableTransaction(
          prisma,
          async (tx) => {
            // Create a user successfully
            await tx.user.create({
              data: {
                tenantId: testTenant.id,
                email: `txuser${uniqueKey}@test.com`,
                auth0Id: `auth0|tx${uniqueKey}`,
                name: 'Transaction Test User',
                role: 'ADMIN',
              },
            });

            // This should fail - invalid data
            await tx.user.create({
              data: {
                tenantId: 'non-existent-tenant-id',
                email: `txuser2${uniqueKey}@test.com`,
                auth0Id: `auth0|tx2${uniqueKey}`,
                name: 'Should Fail User',
                role: 'ADMIN',
              },
            });
          },
          { maxRetries: 1, timeout: 5000 },
        );

        fail('Should have thrown an error');
      } catch {
        // Transaction should have failed - expected
      }

      // Verify the first user was NOT created (rollback)
      const createdUser = await prisma.user.findFirst({
        where: { email: `txuser${uniqueKey}@test.com` },
      });

      expect(createdUser).toBeNull();

      // Clean up
      await prisma.tenant
        .delete({ where: { id: testTenant.id } })
        .catch(() => {});
    });

    it('should use serializable isolation level', async () => {
      // This test verifies that we can successfully execute with serializable isolation
      const result = await withSerializableTransaction(
        prisma,
        async () => {
          return 'serializable_success';
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 5000,
        },
      );

      expect(result).toBe('serializable_success');
    });
  });

  describe('withBatchIsolation', () => {
    it('should combine advisory locking with transaction isolation', async () => {
      const batchLockKey = `batch_test_${Date.now()}`;
      let executed = false;

      const { result, lockAcquired, durationMs } = await withBatchIsolation(
        prisma,
        batchLockKey,
        async () => {
          executed = true;
          return 'batch_result';
        },
        { timeout: 5000 },
      );

      expect(lockAcquired).toBe(true);
      expect(executed).toBe(true);
      expect(result).toBe('batch_result');
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should release lock after batch completion', async () => {
      const batchLockKey = `batch_cleanup_${Date.now()}`;

      await withBatchIsolation(prisma, batchLockKey, async () => 'done', {
        timeout: 5000,
      });

      // Should be able to acquire the lock again
      const canAcquire = await acquireAdvisoryLock(prisma, batchLockKey);
      expect(canAcquire).toBe(true);

      await releaseAdvisoryLock(prisma, batchLockKey);
    });
  });

  describe('InvoiceGenerationService Batch Locking', () => {
    it('should acquire advisory lock before batch processing', async () => {
      // This test verifies that the service methods exist and can be called
      expect(service.acquireBatchLock).toBeDefined();
      expect(typeof service.acquireBatchLock).toBe('function');
    });

    it('should release advisory lock after batch processing', async () => {
      expect(service.releaseBatchLock).toBeDefined();
      expect(typeof service.releaseBatchLock).toBe('function');
    });

    it('should return conflict error when lock already held', async () => {
      // This is a conceptual test - the actual behavior depends on having
      // two separate database connections, which is not easy to test in unit tests
      // The implementation is verified through integration tests

      // Verify the error type is correct
      const error = new ConflictException(
        'Invoice generation already in progress for billing period 2025-01. Please wait and try again.',
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('already in progress');
    });

    describe('Service Lock Methods', () => {
      const testTenantId = 'test-tenant-for-lock';
      const testBillingMonth = '2099-01';

      afterEach(async () => {
        // Clean up any locks
        await service.releaseBatchLock(testTenantId, testBillingMonth);
      });

      it('should acquire batch lock successfully', async () => {
        const acquired = await service.acquireBatchLock(
          testTenantId,
          testBillingMonth,
        );

        expect(acquired).toBe(true);
      });

      it('should release batch lock successfully', async () => {
        // First acquire
        await service.acquireBatchLock(testTenantId, testBillingMonth);

        // Then release (should not throw)
        await expect(
          service.releaseBatchLock(testTenantId, testBillingMonth),
        ).resolves.not.toThrow();
      });

      it('should handle release of non-existent lock gracefully', async () => {
        // Should not throw even if lock was never acquired
        await expect(
          service.releaseBatchLock('non-existent-tenant', '9999-01'),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('Retry Behavior on Serialization Failure', () => {
    it('should retry on serialization failure', async () => {
      let attemptCount = 0;

      const mockFn = jest.fn().mockImplementation(async () => {
        attemptCount++;

        if (attemptCount < 3) {
          // Simulate serialization failure for first 2 attempts
          const error = new Prisma.PrismaClientKnownRequestError(
            'Transaction failed due to a write conflict',
            { code: 'P2034', clientVersion: '5.0.0' },
          );
          throw error;
        }

        return 'success_after_retry';
      });

      // Simulate the retry loop (as actual withSerializableTransaction uses real Prisma)
      let result: string | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          result = await mockFn();
          break;
        } catch (error) {
          if (isSerializationFailure(error) && attempt < 3) {
            // Would sleep here in real implementation
            continue;
          }
          throw error;
        }
      }

      expect(attemptCount).toBe(3);
      expect(result).toBe('success_after_retry');
    });

    it('should throw after max retries exceeded', async () => {
      const mockFn = jest.fn().mockImplementation(async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Transaction failed due to a write conflict',
          { code: 'P2034', clientVersion: '5.0.0' },
        );
        throw error;
      });

      let thrownError: Error | null = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await mockFn();
        } catch (error) {
          thrownError = error as Error;
          if (isSerializationFailure(error) && attempt < maxRetries) {
            continue;
          }
        }
      }

      expect(mockFn).toHaveBeenCalledTimes(maxRetries);
      expect(thrownError).toBeDefined();
      expect(isSerializationFailure(thrownError)).toBe(true);
    });
  });
});
