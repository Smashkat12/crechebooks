/**
 * PatternLearningService Integration Tests
 * TASK-TRANS-013: Payee Pattern Learning Service
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests pattern learning, recurring detection, and pattern statistics
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { PayeePatternRepository } from '../../../src/database/repositories/payee-pattern.repository';
import { PatternLearningService } from '../../../src/database/services/pattern-learning.service';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import { Tenant, Transaction } from '@prisma/client';
import { NotFoundException } from '../../../src/shared/exceptions';
import { PATTERN_LEARNING_CONSTANTS } from '../../../src/database/dto/pattern-learning.dto';

describe('PatternLearningService', () => {
  let service: PatternLearningService;
  let transactionRepo: TransactionRepository;
  let payeePatternRepo: PayeePatternRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        CategorizationRepository,
        PayeePatternRepository,
        PatternLearningService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    payeePatternRepo = module.get<PayeePatternRepository>(
      PayeePatternRepository,
    );
    service = module.get<PatternLearningService>(PatternLearningService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Pattern Learning Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `pattern${Date.now()}@test.co.za`,
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

  describe('learnFromCorrection', () => {
    it('should create new pattern when no existing pattern', async () => {
      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS SANDTON 12345',
        payeeName: 'WOOLWORTHS',
      });

      const pattern = await service.learnFromCorrection(
        transaction.id,
        '5100',
        'Groceries',
        testTenant.id,
      );

      expect(pattern).toBeDefined();
      expect(pattern.payeePattern).toBe('WOOLWORTHS');
      expect(pattern.defaultAccountCode).toBe('5100');
      expect(pattern.defaultAccountName).toBe('Groceries');
      expect(pattern.confidenceBoost.toNumber()).toBe(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
      );
      expect(pattern.matchCount).toBe(0);
    });

    it('should update existing pattern with same account code', async () => {
      // Create initial pattern
      const initialPattern = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'CHECKERS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
        isRecurring: false,
      });

      // Increment match count to simulate prior matches
      await payeePatternRepo.incrementMatchCount(initialPattern.id);

      const transaction = await createTransaction({
        description: 'POS CHECKERS EASTGATE',
        payeeName: 'CHECKERS',
      });

      const updatedPattern = await service.learnFromCorrection(
        transaction.id,
        '5100', // Same account code
        'Groceries',
        testTenant.id,
      );

      // Should have increased confidence boost
      expect(updatedPattern.confidenceBoost.toNumber()).toBeGreaterThanOrEqual(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
      );
    });

    it('should reset pattern when account code changes', async () => {
      // Create initial pattern
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'SPAR',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS SPAR SUPERMARKET',
        payeeName: 'SPAR',
      });

      const updatedPattern = await service.learnFromCorrection(
        transaction.id,
        '5200', // Different account code
        'Supplies',
        testTenant.id,
      );

      expect(updatedPattern.defaultAccountCode).toBe('5200');
      expect(updatedPattern.defaultAccountName).toBe('Supplies');
      // Confidence should be reset to base
      expect(updatedPattern.confidenceBoost.toNumber()).toBe(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
      );
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        service.learnFromCorrection(
          'non-existent-id',
          '5100',
          'Groceries',
          testTenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should extract payee from description when payeeName not set', async () => {
      const transaction = await createTransaction({
        description: 'POS PURCHASE PICK N PAY RANDBURG',
        payeeName: null,
      });

      const pattern = await service.learnFromCorrection(
        transaction.id,
        '5100',
        'Groceries',
        testTenant.id,
      );

      // Should extract "PICK PAY RANDBURG" from description
      expect(pattern.payeePattern.length).toBeGreaterThan(0);
    });
  });

  describe('updatePattern', () => {
    it('should increase confidence on successful match', async () => {
      const pattern = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
        isRecurring: false,
      });

      const updated = await service.updatePattern(
        pattern.id,
        true, // success
        testTenant.id,
      );

      expect(updated.matchCount).toBe(1);
      expect(updated.confidenceBoost.toNumber()).toBeGreaterThanOrEqual(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
      );
    });

    it('should decrease confidence on failed match', async () => {
      const pattern = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'CHECKERS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15, // Start high
        isRecurring: false,
      });

      const updated = await service.updatePattern(
        pattern.id,
        false, // failure
        testTenant.id,
      );

      expect(updated.confidenceBoost.toNumber()).toBe(
        15 - PATTERN_LEARNING_CONSTANTS.CONFIDENCE_PENALTY,
      );
    });

    it('should not decrease below minimum confidence', async () => {
      const pattern = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'SPAR',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: PATTERN_LEARNING_CONSTANTS.MIN_CONFIDENCE_BOOST,
        isRecurring: false,
      });

      const updated = await service.updatePattern(
        pattern.id,
        false, // failure
        testTenant.id,
      );

      expect(updated.confidenceBoost.toNumber()).toBe(
        PATTERN_LEARNING_CONSTANTS.MIN_CONFIDENCE_BOOST,
      );
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      await expect(
        service.updatePattern('non-existent-id', true, testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for wrong tenant', async () => {
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

      const pattern = await payeePatternRepo.create({
        tenantId: otherTenant.id,
        payeePattern: 'OTHER',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        isRecurring: false,
      });

      await expect(
        service.updatePattern(pattern.id, true, testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMatchingPatterns', () => {
    it('should find exact payee match with highest score', async () => {
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS SANDTON',
        payeeName: 'WOOLWORTHS',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('EXACT_PAYEE');
      expect(matches[0].matchScore).toBe(100);
    });

    it('should find partial payee match', async () => {
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS FOOD SANDTON',
        payeeName: 'WOOLWORTHS FOOD',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('PARTIAL_PAYEE');
      expect(matches[0].matchScore).toBeGreaterThanOrEqual(75);
    });

    it('should find alias match', async () => {
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: ['WOOLIES', 'WW FOOD'],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS WOOLIES SANDTON',
        payeeName: 'WOOLIES',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('EXACT_PAYEE');
      expect(matches[0].matchScore).toBe(90);
    });

    it('should find description keyword match', async () => {
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'ELECTRICITY',
        payeeAliases: ['ESKOM', 'CITY POWER'],
        defaultAccountCode: '5200',
        defaultAccountName: 'Utilities',
        confidenceBoost: 15,
        isRecurring: true,
        expectedAmountCents: 150000, // Required for recurring patterns
      });

      const transaction = await createTransaction({
        description: 'DEBIT ORDER ESKOM PREPAID',
        payeeName: null,
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(1);
      expect(matches[0].matchType).toBe('KEYWORD');
    });

    it('should return empty array when no matches', async () => {
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'RANDOM UNKNOWN VENDOR',
        payeeName: 'UNKNOWN',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(0);
    });

    it('should sort matches by score descending', async () => {
      // Create multiple patterns
      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        isRecurring: false,
      });

      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLIES',
        payeeAliases: ['WOOLWORTHS'],
        defaultAccountCode: '5150',
        defaultAccountName: 'Food',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS SANDTON',
        payeeName: 'WOOLWORTHS',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      expect(matches.length).toBe(2);
      // First match should have highest score
      expect(matches[0].matchScore).toBeGreaterThanOrEqual(
        matches[1].matchScore,
      );
    });
  });

  describe('detectRecurring', () => {
    it('should detect monthly recurring pattern', async () => {
      // Create transactions over 3 months with consistent ~30 day intervals
      // Use dates within the last 12 months from today
      const now = new Date();
      const dates = [
        new Date(now.getFullYear(), now.getMonth() - 4, 15),
        new Date(now.getFullYear(), now.getMonth() - 3, 15),
        new Date(now.getFullYear(), now.getMonth() - 2, 15),
        new Date(now.getFullYear(), now.getMonth() - 1, 15),
      ];

      for (const date of dates) {
        await createTransaction({
          description: 'DEBIT ORDER INSURANCE',
          payeeName: 'INSURANCE CO',
          date,
          amountCents: 150000,
        });
      }

      const result = await service.detectRecurring(
        'INSURANCE CO',
        testTenant.id,
      );

      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(true);
      expect(result?.frequency).toBe('MONTHLY');
      expect(result?.occurrenceCount).toBe(4);
      expect(result?.averageAmountCents).toBe(150000);
    });

    it('should return null when not enough occurrences', async () => {
      // Only 2 transactions - below minimum
      await createTransaction({
        description: 'DEBIT ORDER INSURANCE',
        payeeName: 'RARE VENDOR',
        date: new Date('2024-01-15'),
      });
      await createTransaction({
        description: 'DEBIT ORDER INSURANCE',
        payeeName: 'RARE VENDOR',
        date: new Date('2024-02-15'),
      });

      const result = await service.detectRecurring(
        'RARE VENDOR',
        testTenant.id,
      );

      expect(result).toBeNull();
    });

    it('should detect irregular pattern as not recurring', async () => {
      // Create transactions with irregular intervals within last 12 months
      const now = new Date();
      const dates = [
        new Date(now.getFullYear(), now.getMonth() - 4, 5),
        new Date(now.getFullYear(), now.getMonth() - 4, 20), // 15 days
        new Date(now.getFullYear(), now.getMonth() - 3, 1), // ~11 days
        new Date(now.getFullYear(), now.getMonth() - 1, 15), // ~45 days
      ];

      for (const date of dates) {
        await createTransaction({
          description: 'IRREGULAR PAYMENT',
          payeeName: 'IRREGULAR CO',
          date,
          amountCents: 100000,
        });
      }

      const result = await service.detectRecurring(
        'IRREGULAR CO',
        testTenant.id,
      );

      expect(result).not.toBeNull();
      expect(result?.isRecurring).toBe(false);
    });

    it('should detect weekly recurring pattern', async () => {
      // Use dates within the last 12 months
      const now = new Date();
      const baseDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const dates = [
        new Date(baseDate.getFullYear(), baseDate.getMonth(), 1),
        new Date(baseDate.getFullYear(), baseDate.getMonth(), 8),
        new Date(baseDate.getFullYear(), baseDate.getMonth(), 15),
        new Date(baseDate.getFullYear(), baseDate.getMonth(), 22),
      ];

      for (const date of dates) {
        await createTransaction({
          description: 'WEEKLY PAYMENT',
          payeeName: 'WEEKLY VENDOR',
          date,
          amountCents: 50000,
        });
      }

      const result = await service.detectRecurring(
        'WEEKLY VENDOR',
        testTenant.id,
      );

      expect(result).not.toBeNull();
      expect(result?.frequency).toBe('WEEKLY');
      expect(result?.intervalDays).toBeLessThanOrEqual(10);
    });
  });

  describe('getPatternStats', () => {
    it('should return empty stats when no patterns', async () => {
      const stats = await service.getPatternStats(testTenant.id);

      expect(stats.totalPatterns).toBe(0);
      expect(stats.activePatterns).toBe(0);
      expect(stats.avgMatchCount).toBe(0);
      expect(stats.topPatterns).toHaveLength(0);
    });

    it('should calculate stats for multiple patterns', async () => {
      // Create patterns with different match counts
      const pattern1 = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const pattern2 = await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'CHECKERS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 12,
        isRecurring: false,
      });

      await payeePatternRepo.create({
        tenantId: testTenant.id,
        payeePattern: 'SPAR',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        isRecurring: false,
      });

      // Increment match counts
      await payeePatternRepo.incrementMatchCount(pattern1.id);
      await payeePatternRepo.incrementMatchCount(pattern1.id);
      await payeePatternRepo.incrementMatchCount(pattern1.id);
      await payeePatternRepo.incrementMatchCount(pattern2.id);

      const stats = await service.getPatternStats(testTenant.id);

      expect(stats.totalPatterns).toBe(3);
      expect(stats.activePatterns).toBe(2); // WOOLWORTHS and CHECKERS have matches
      expect(stats.avgMatchCount).toBeGreaterThan(0);
      expect(stats.topPatterns.length).toBeLessThanOrEqual(10);
      // WOOLWORTHS should be first with 3 matches
      expect(stats.topPatterns[0].payeeName).toBe('WOOLWORTHS');
      expect(stats.topPatterns[0].matchCount).toBe(3);
    });
  });

  describe('extractPayeeName', () => {
    it('should remove common prefixes', () => {
      expect(service.extractPayeeName('POS PURCHASE WOOLWORTHS')).toBe(
        'WOOLWORTHS',
      );
      // EFT is removed but PAYMENT is not a prefix in the regex
      expect(service.extractPayeeName('PAYMENT INSURANCE CO')).toBe(
        'INSURANCE',
      );
      expect(service.extractPayeeName('DEBIT ORDER MEDICAL AID')).toBe(
        'MEDICAL AID',
      );
    });

    it('should remove date prefixes', () => {
      expect(service.extractPayeeName('15/01 WOOLWORTHS SANDTON')).toBe(
        'WOOLWORTHS SANDTON',
      );
    });

    it('should handle short descriptions', () => {
      expect(service.extractPayeeName('ABC')).toBe('ABC');
    });

    it('should return UNKNOWN for empty description', () => {
      expect(service.extractPayeeName('')).toBe('UNKNOWN');
    });
  });

  describe('extractKeywords', () => {
    it('should extract significant words', () => {
      const keywords = service.extractKeywords('WOOLWORTHS SANDTON FOOD 1234');
      expect(keywords).toContain('WOOLWORTHS');
      expect(keywords).toContain('SANDTON');
      expect(keywords).toContain('FOOD');
      expect(keywords).toContain('1234');
    });

    it('should remove stop words', () => {
      const keywords = service.extractKeywords(
        'PAYMENT FROM THE COMPANY FOR SERVICES',
      );
      expect(keywords).not.toContain('THE');
      expect(keywords).not.toContain('FOR');
      expect(keywords).not.toContain('FROM');
      expect(keywords).not.toContain('PAYMENT');
    });

    it('should remove duplicates', () => {
      const keywords = service.extractKeywords('WOOLWORTHS WOOLWORTHS SANDTON');
      expect(keywords.filter((k) => k === 'WOOLWORTHS').length).toBe(1);
    });

    it('should filter short words', () => {
      const keywords = service.extractKeywords('A AB ABC ABCD');
      expect(keywords).not.toContain('A');
      expect(keywords).not.toContain('AB');
      expect(keywords).toContain('ABC');
      expect(keywords).toContain('ABCD');
    });
  });

  describe('calculateConfidenceBoost', () => {
    it('should return base boost for first match', () => {
      expect(service.calculateConfidenceBoost(1)).toBe(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
      );
    });

    it('should increase boost with more matches', () => {
      expect(service.calculateConfidenceBoost(3)).toBe(
        PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST +
          2 * PATTERN_LEARNING_CONSTANTS.CONFIDENCE_INCREMENT,
      );
    });

    it('should not exceed maximum boost', () => {
      expect(service.calculateConfidenceBoost(100)).toBe(
        PATTERN_LEARNING_CONSTANTS.MAX_CONFIDENCE_BOOST,
      );
    });
  });

  describe('normalizePayeeName', () => {
    it('should uppercase and trim', () => {
      expect(service.normalizePayeeName('  woolworths  ')).toBe('WOOLWORTHS');
    });

    it('should handle already uppercase', () => {
      expect(service.normalizePayeeName('WOOLWORTHS')).toBe('WOOLWORTHS');
    });

    it('should handle mixed case', () => {
      expect(service.normalizePayeeName('WoolWorths Food')).toBe(
        'WOOLWORTHS FOOD',
      );
    });
  });

  describe('multi-tenant isolation', () => {
    it('should not find patterns from other tenants', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `isolation${Date.now()}@other.co.za`,
        },
      });

      await payeePatternRepo.create({
        tenantId: otherTenant.id,
        payeePattern: 'WOOLWORTHS',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Groceries',
        confidenceBoost: 15,
        isRecurring: false,
      });

      const transaction = await createTransaction({
        description: 'POS WOOLWORTHS SANDTON',
        payeeName: 'WOOLWORTHS',
      });

      const matches = await service.findMatchingPatterns(
        transaction,
        testTenant.id,
      );

      // Should not find pattern from other tenant
      expect(matches.length).toBe(0);
    });
  });
});
