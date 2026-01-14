/**
 * CategorizationService Integration Tests
 * TASK-TRANS-012
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests pattern matching, AI categorization, splits, and audit trails
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { PayeePatternRepository } from '../../../src/database/repositories/payee-pattern.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import { PatternLearningService } from '../../../src/database/services/pattern-learning.service';
import { PayeeAliasService } from '../../../src/database/services/payee-alias.service';
import { PayeeVariationDetectorService } from '../../../src/database/services/payee-variation-detector.service';
import { CorrectionConflictService } from '../../../src/database/services/correction-conflict.service';
import { PayeeNormalizerService } from '../../../src/database/services/payee-normalizer.service';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import {
  VatType,
  CategorizationSource,
} from '../../../src/database/entities/categorization.entity';
import { Tenant, User, Transaction } from '@prisma/client';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';

describe('CategorizationService', () => {
  let service: CategorizationService;
  let transactionRepo: TransactionRepository;
  let categorizationRepo: CategorizationRepository;
  let payeePatternRepo: PayeePatternRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

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
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    categorizationRepo = module.get<CategorizationRepository>(
      CategorizationRepository,
    );
    payeePatternRepo = module.get<PayeePatternRepository>(
      PayeePatternRepository,
    );
    service = module.get<CategorizationService>(CategorizationService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
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
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${Date.now()}@littlestars.co.za`,
        auth0Id: `auth0|test${Date.now()}`,
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

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('categorizeTransaction - pattern matching', () => {
    it('should auto-categorize when pattern matches with high confidence', async () => {
      // Create a pattern
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 20,
        isRecurring: false,
      });

      // Create transaction matching pattern
      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS SANDTON',
        payeeName: 'WOOLWORTHS',
        amountCents: 50000,
      });

      const result = await service.categorizeTransaction(
        transaction.id,
        testTenant.id,
      );

      expect(result.status).toBe('AUTO_APPLIED');
      expect(result.source).toBe(CategorizationSource.RULE_BASED);
      expect(result.confidenceScore).toBeGreaterThanOrEqual(80);

      // Verify transaction status updated
      const updated = await transactionRepo.findById(
        testTenant.id,
        transaction.id,
      );
      expect(updated?.status).toBe(TransactionStatus.CATEGORIZED);
    });

    it('should increment pattern match count', async () => {
      const pattern = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'CHECKERS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS CHECKERS EASTGATE',
        payeeName: 'CHECKERS',
      });

      await service.categorizeTransaction(transaction.id, testTenant.id);

      const updatedPattern = await payeePatternRepo.findById(pattern.id);
      expect(updatedPattern?.matchCount).toBe(1);
    });
  });

  describe('categorizeTransaction - AI fallback', () => {
    it('should use AI with high confidence for recognized keywords', async () => {
      const transaction = await createTransaction({
        description: 'ESKOM ELECTRICITY PAYMENT',
        amountCents: 150000,
      });

      const result = await service.categorizeTransaction(
        transaction.id,
        testTenant.id,
      );

      expect(result.status).toBe('AUTO_APPLIED');
      expect(result.accountCode).toBe('5200');
      expect(result.accountName).toBe('Utilities');
      expect(result.confidenceScore).toBe(90);
    });

    it('should require review for low confidence categorization', async () => {
      const transaction = await createTransaction({
        description: 'UNKNOWN VENDOR RANDOM',
        amountCents: 25000,
      });

      const result = await service.categorizeTransaction(
        transaction.id,
        testTenant.id,
      );

      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.accountCode).toBe('5900');
      expect(result.confidenceScore).toBeLessThan(80);

      // Verify transaction status
      const updated = await transactionRepo.findById(
        testTenant.id,
        transaction.id,
      );
      expect(updated?.status).toBe(TransactionStatus.REVIEW_REQUIRED);
    });

    it('should categorize credit transactions as income', async () => {
      const transaction = await createTransaction({
        description: 'EFT SCHOOL FEE PAYMENT',
        amountCents: 250000,
        isCredit: true,
      });

      const result = await service.categorizeTransaction(
        transaction.id,
        testTenant.id,
      );

      expect(result.accountCode).toBe('4100');
      expect(result.accountName).toBe('Fee Income');
    });
  });

  describe('categorizeTransactions - batch', () => {
    it('should process batch of transactions with mixed results', async () => {
      // Create multiple transactions
      const tx1 = await createTransaction({
        description: 'WOOLWORTHS FOOD',
        payeeName: 'WOOLWORTHS',
      });
      const tx2 = await createTransaction({
        description: 'ESKOM ELECTRICITY',
      });
      const tx3 = await createTransaction({
        description: 'RANDOM UNKNOWN',
      });
      const tx4 = await createTransaction({
        description: 'SALARY PAYMENT',
      });

      // Create pattern for first one
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 20,
        isRecurring: false,
      });

      const result = await service.categorizeTransactions(
        [tx1.id, tx2.id, tx3.id, tx4.id],
        testTenant.id,
      );

      expect(result.totalProcessed).toBe(4);
      expect(result.autoCategorized).toBeGreaterThanOrEqual(3);
      expect(result.reviewRequired).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBe(0);
      expect(result.statistics.avgConfidence).toBeGreaterThan(0);
    });

    it('should handle missing transactions gracefully', async () => {
      const tx = await createTransaction({ description: 'VALID TX' });

      const result = await service.categorizeTransactions(
        [tx.id, 'non-existent-id'],
        testTenant.id,
      );

      expect(result.totalProcessed).toBe(2);
      expect(result.failed).toBe(1);
      expect(
        result.results.find((r) => r.transactionId === 'non-existent-id')
          ?.error,
      ).toBe('Transaction not found');
    });
  });

  describe('updateCategorization', () => {
    it('should allow user override with valid data', async () => {
      const transaction = await createTransaction({
        description: 'TEST TRANSACTION',
        amountCents: 100000,
      });

      // First categorize
      await service.categorizeTransaction(transaction.id, testTenant.id);

      // User override
      const updated = await service.updateCategorization(
        transaction.id,
        {
          accountCode: '5500',
          accountName: 'Custom Account',
          isSplit: false,
          vatType: VatType.STANDARD,
        },
        testUser.id,
        testTenant.id,
      );

      expect(updated).toBeDefined();

      // Verify categorization updated
      const cats = await categorizationRepo.findByTransaction(transaction.id);
      expect(cats[0].accountCode).toBe('5500');
      expect(cats[0].source).toBe(CategorizationSource.USER_OVERRIDE);
    });

    it('should handle valid split transaction', async () => {
      const transaction = await createTransaction({
        description: 'SPLIT TEST',
        amountCents: 100000,
      });

      await service.updateCategorization(
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

      // Verify splits created
      const cats = await categorizationRepo.findByTransaction(transaction.id);
      expect(cats).toHaveLength(2);
      expect(cats.every((c) => c.isSplit)).toBe(true);
    });

    it('should reject split when amounts do not match total', async () => {
      const transaction = await createTransaction({
        description: 'INVALID SPLIT',
        amountCents: 100000,
      });

      await expect(
        service.updateCategorization(
          transaction.id,
          {
            accountCode: '5100',
            accountName: 'Primary',
            isSplit: true,
            splits: [
              {
                accountCode: '5100',
                accountName: 'Groceries',
                amountCents: 50000,
                vatType: VatType.STANDARD,
              },
              {
                accountCode: '5200',
                accountName: 'Utilities',
                amountCents: 40000, // Only 90000 total, should be 100000
                vatType: VatType.STANDARD,
              },
            ],
            vatType: VatType.STANDARD,
          },
          testUser.id,
          testTenant.id,
        ),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        service.updateCategorization(
          'non-existent-id',
          {
            accountCode: '5100',
            accountName: 'Test',
            isSplit: false,
            vatType: VatType.STANDARD,
          },
          testUser.id,
          testTenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSuggestions', () => {
    it('should return suggestions from multiple sources', async () => {
      // Create pattern
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'SPAR',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        isRecurring: false,
      });

      // Create transaction with similar previous categorization
      const prevTx = await createTransaction({
        description: 'SPAR SUPERMARKET PREVIOUS',
        payeeName: 'SPAR',
      });
      await categorizationRepo.create({
        transactionId: prevTx.id,
        accountCode: '5150',
        accountName: 'Food Supplies',
        confidenceScore: 90,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.STANDARD,
        vatAmountCents: 15000, // 15% of 100000 cents
      });

      const transaction = await createTransaction({
        description: 'SPAR SUPERMARKET NEW',
        payeeName: 'SPAR',
      });

      const suggestions = await service.getSuggestions(
        transaction.id,
        testTenant.id,
      );

      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      expect(suggestions.some((s) => s.source === 'PATTERN')).toBe(true);
      expect(suggestions.some((s) => s.source === 'AI')).toBe(true);
      // Sorted by confidence
      expect(suggestions[0].confidenceScore).toBeGreaterThanOrEqual(
        suggestions[suggestions.length - 1].confidenceScore,
      );
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        service.getSuggestions('non-existent-id', testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('multi-tenant isolation', () => {
    it('should not see transactions from other tenants', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@other.co.za`,
        },
      });

      // Create transaction in other tenant
      const otherTx = await transactionRepo.create({
        tenantId: otherTenant.id,
        bankAccount: 'FNB Cheque',
        date: new Date('2024-01-15'),
        description: 'Other Tenant TX',
        amountCents: 100000,
        isCredit: false,
        source: ImportSource.CSV_IMPORT,
        status: TransactionStatus.PENDING,
      } as any);

      // Try to categorize from wrong tenant
      await expect(
        service.categorizeTransaction(otherTx.id, testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('audit trail', () => {
    it('should create audit log for categorization', async () => {
      const transaction = await createTransaction({
        description: 'AUDIT TEST TX',
      });

      await service.categorizeTransaction(transaction.id, testTenant.id);

      // Check audit log exists
      const cats = await categorizationRepo.findByTransaction(transaction.id);
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Categorization',
          entityId: cats[0].id,
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs[0].action).toBe('CREATE');
    });

    it('should create audit log for user override', async () => {
      const transaction = await createTransaction({
        description: 'OVERRIDE AUDIT TEST',
      });

      await service.categorizeTransaction(transaction.id, testTenant.id);
      await service.updateCategorization(
        transaction.id,
        {
          accountCode: '5999',
          accountName: 'Override Test',
          isSplit: false,
          vatType: VatType.EXEMPT,
        },
        testUser.id,
        testTenant.id,
      );

      // Check audit log for update
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Categorization',
          entityId: transaction.id,
          action: 'UPDATE',
        },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs[0].userId).toBe(testUser.id);
    });
  });

  describe('VAT calculation', () => {
    it('should calculate VAT for STANDARD type', async () => {
      const transaction = await createTransaction({
        description: 'WOOLWORTHS FOOD',
        amountCents: 115000, // R1150 including VAT
      });

      await service.categorizeTransaction(transaction.id, testTenant.id);

      const cats = await categorizationRepo.findByTransaction(transaction.id);
      // VAT = 115000 * 15 / 115 = 15000
      expect(cats[0].vatAmountCents).toBe(15000);
    });

    it('should not calculate VAT for EXEMPT type', async () => {
      const transaction = await createTransaction({
        description: 'SCHOOL FEE PAYMENT',
        amountCents: 250000,
        isCredit: true,
      });

      await service.categorizeTransaction(transaction.id, testTenant.id);

      const cats = await categorizationRepo.findByTransaction(transaction.id);
      expect(cats[0].vatAmountCents).toBeNull();
    });
  });
});
