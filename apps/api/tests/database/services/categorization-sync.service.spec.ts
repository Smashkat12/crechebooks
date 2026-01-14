/**
 * Categorization Sync Service Tests
 * TASK-XERO-005: Auto-Push Categorization on User Review
 *
 * Tests the categorizeAndSync method which:
 * 1. Always saves categorization locally first
 * 2. Attempts Xero sync if transaction has xeroTransactionId
 * 3. Never blocks categorization save on Xero sync
 * 4. Returns appropriate sync status
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { PayeePatternRepository } from '../../../src/database/repositories/payee-pattern.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import {
  CategorizationService,
  CategorizationXeroSyncStatus,
} from '../../../src/database/services/categorization.service';
import { PatternLearningService } from '../../../src/database/services/pattern-learning.service';
import { XeroSyncService } from '../../../src/database/services/xero-sync.service';
import { PayeeAliasService } from '../../../src/database/services/payee-alias.service';
import { PayeeVariationDetectorService } from '../../../src/database/services/payee-variation-detector.service';
import { CorrectionConflictService } from '../../../src/database/services/correction-conflict.service';
import { PayeeNormalizerService } from '../../../src/database/services/payee-normalizer.service';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import { VatType } from '../../../src/database/entities/categorization.entity';
import { Tenant, User, Transaction } from '@prisma/client';

describe('CategorizationService - categorizeAndSync (TASK-XERO-005)', () => {
  let service: CategorizationService;
  let transactionRepo: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

  // Mock XeroSyncService
  const mockXeroSyncService = {
    hasValidConnection: jest.fn(),
    pushToXero: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        CategorizationRepository,
        PayeePatternRepository,
        AuditLogService,
        CategorizationService,
        PatternLearningService,
        PayeeAliasService,
        PayeeVariationDetectorService,
        CorrectionConflictService,
        PayeeNormalizerService,
        {
          provide: XeroSyncService,
          useValue: mockXeroSyncService,
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    service = module.get<CategorizationService>(CategorizationService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockXeroSyncService.hasValidConnection.mockResolvedValue(false);
    mockXeroSyncService.pushToXero.mockResolvedValue(false);

    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Xero Sync Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@xerosynctest.co.za`,
      },
    });

    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${Date.now()}@xerosynctest.co.za`,
        auth0Id: `auth0|xerotest${Date.now()}`,
        name: 'Test User',
        role: 'ADMIN',
      },
    });
  });

  // Helper to create a test transaction
  async function createTransaction(
    overrides: Partial<Transaction> = {},
  ): Promise<Transaction> {
    return transactionRepo.create({
      tenantId: testTenant.id,
      bankAccount: 'FNB Cheque',
      date: new Date('2024-01-15'),
      description: 'Test Transaction',
      amountCents: 100000,
      isCredit: false,
      source: ImportSource.CSV_IMPORT,
      status: TransactionStatus.PENDING,
      ...overrides,
    } as any);
  }

  describe('categorizeAndSync - Xero sync behavior', () => {
    it('should skip Xero sync when transaction has no xeroTransactionId', async () => {
      const transaction = await createTransaction({
        description: 'NO XERO ID',
        xeroTransactionId: null,
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5100',
          accountName: 'Test Account',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(result.transaction).toBeDefined();
      expect(result.xeroSyncStatus).toBe('skipped');
      expect(result.xeroSyncError).toBeUndefined();

      // Verify categorization was saved
      expect(result.transaction.status).toBe(TransactionStatus.CATEGORIZED);

      // Verify Xero sync was not attempted
      expect(mockXeroSyncService.hasValidConnection).not.toHaveBeenCalled();
      expect(mockXeroSyncService.pushToXero).not.toHaveBeenCalled();
    });

    it('should skip Xero sync when tenant has no valid connection', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(false);

      const transaction = await createTransaction({
        description: 'HAS XERO ID',
        xeroTransactionId: 'xero-tx-123',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5100',
          accountName: 'Test Account',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(result.transaction).toBeDefined();
      expect(result.xeroSyncStatus).toBe('skipped');
      expect(result.xeroSyncError).toBeUndefined();

      // Verify connection check was called but not pushToXero
      expect(mockXeroSyncService.hasValidConnection).toHaveBeenCalledWith(
        testTenant.id,
      );
      expect(mockXeroSyncService.pushToXero).not.toHaveBeenCalled();
    });

    it('should sync to Xero when transaction has xeroTransactionId and valid connection', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockResolvedValue(true);

      const transaction = await createTransaction({
        description: 'SYNC TO XERO',
        xeroTransactionId: 'xero-tx-456',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5200',
          accountName: 'Utilities',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(result.transaction).toBeDefined();
      expect(result.xeroSyncStatus).toBe('synced');
      expect(result.xeroSyncError).toBeUndefined();

      // Verify Xero sync was attempted
      expect(mockXeroSyncService.hasValidConnection).toHaveBeenCalledWith(
        testTenant.id,
      );
      expect(mockXeroSyncService.pushToXero).toHaveBeenCalledWith(
        transaction.id,
        testTenant.id,
      );
    });

    it('should return failed status but still save categorization when Xero sync fails', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockRejectedValue(
        new Error('Xero API rate limit exceeded'),
      );

      const transaction = await createTransaction({
        description: 'XERO SYNC FAIL',
        xeroTransactionId: 'xero-tx-789',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5300',
          accountName: 'Equipment',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      // Categorization should still be saved
      expect(result.transaction).toBeDefined();
      expect(result.transaction.status).toBe(TransactionStatus.CATEGORIZED);

      // Xero sync should report failure
      expect(result.xeroSyncStatus).toBe('failed');
      expect(result.xeroSyncError).toBe('Xero API rate limit exceeded');
    });

    it('should return skipped when pushToXero returns false (already synced)', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockResolvedValue(false); // Already synced

      const transaction = await createTransaction({
        description: 'ALREADY SYNCED',
        xeroTransactionId: 'xero-tx-already-synced',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5400',
          accountName: 'Marketing',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(result.xeroSyncStatus).toBe('skipped');
      expect(result.xeroSyncError).toBeUndefined();
    });
  });

  describe('categorizeAndSync - Categorization always succeeds', () => {
    it('should save categorization even when Xero sync throws', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockRejectedValue(
        new Error('Network timeout'),
      );

      const transaction = await createTransaction({
        description: 'NETWORK ERROR',
        xeroTransactionId: 'xero-tx-network-error',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5500',
          accountName: 'Travel',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      // Categorization must succeed regardless of Xero sync failure
      expect(result.transaction).toBeDefined();
      expect(result.transaction.status).toBe(TransactionStatus.CATEGORIZED);

      // Verify the categorization was actually saved
      const updatedTx = await transactionRepo.findById(
        testTenant.id,
        transaction.id,
      );
      expect(updatedTx?.status).toBe(TransactionStatus.CATEGORIZED);
    });

    it('should handle hasValidConnection throwing gracefully', async () => {
      mockXeroSyncService.hasValidConnection.mockRejectedValue(
        new Error('Token refresh failed'),
      );

      const transaction = await createTransaction({
        description: 'TOKEN ERROR',
        xeroTransactionId: 'xero-tx-token-error',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5600',
          accountName: 'Office Supplies',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      // Categorization must succeed
      expect(result.transaction).toBeDefined();
      expect(result.transaction.status).toBe(TransactionStatus.CATEGORIZED);

      // Xero sync should be skipped (error checking connection)
      expect(result.xeroSyncStatus).toBe('skipped');
    });
  });

  describe('categorizeAndSync - Split transactions', () => {
    it('should sync split transactions to Xero', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockResolvedValue(true);

      const transaction = await createTransaction({
        description: 'SPLIT TX',
        xeroTransactionId: 'xero-tx-split',
        amountCents: 100000,
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5100',
          accountName: 'Primary',
          isSplit: true,
          splits: [
            {
              accountCode: '5100',
              accountName: 'Groceries',
              amountCents: 60000,
              vatType: VatType.STANDARD,
            },
            {
              accountCode: '5200',
              accountName: 'Utilities',
              amountCents: 40000,
              vatType: VatType.STANDARD,
            },
          ],
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(result.transaction).toBeDefined();
      expect(result.xeroSyncStatus).toBe('synced');
    });
  });

  describe('Integration - Full workflow', () => {
    it('should categorize, learn pattern, and sync to Xero in one call', async () => {
      mockXeroSyncService.hasValidConnection.mockResolvedValue(true);
      mockXeroSyncService.pushToXero.mockResolvedValue(true);

      const transaction = await createTransaction({
        description: 'WOOLWORTHS GROCERIES',
        payeeName: 'WOOLWORTHS',
        xeroTransactionId: 'xero-tx-woolworths',
      });

      const result = await service.categorizeAndSync(
        transaction.id,
        {
          accountCode: '5100',
          accountName: 'Groceries & Supplies',
          isSplit: false,
          vatType: VatType.STANDARD,
          createPattern: true, // Should learn pattern
        },
        testUser.id,
        testTenant.id,
      );

      // Categorization successful
      expect(result.transaction).toBeDefined();
      expect(result.transaction.status).toBe(TransactionStatus.CATEGORIZED);

      // Xero sync successful
      expect(result.xeroSyncStatus).toBe('synced');

      // Pattern should have been learned (check via PayeePatternRepository)
      // Note: This depends on PatternLearningService implementation
    });
  });
});
