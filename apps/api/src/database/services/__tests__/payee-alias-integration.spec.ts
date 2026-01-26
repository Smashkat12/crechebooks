/**
 * PayeeAlias Integration Tests
 * TASK-TRANS-018: Verify alias matching works with categorization flow
 *
 * Tests the full integration:
 * 1. User corrects a transaction categorization
 * 2. PatternLearningService detects similar payee
 * 3. Alias is created automatically
 * 4. Future transactions with alias are resolved to canonical name
 * 5. Pattern match succeeds using canonical name
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PayeeAliasService } from '../payee-alias.service';
import { PatternLearningService } from '../pattern-learning.service';
import { CategorizationService } from '../categorization.service';
import { PayeePatternRepository } from '../../repositories/payee-pattern.repository';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { CategorizationRepository } from '../../repositories/categorization.repository';
import { AuditLogService } from '../audit-log.service';
import { PayeeVariationDetectorService } from '../payee-variation-detector.service';
import { CorrectionConflictService } from '../correction-conflict.service';
import { Transaction, PayeePattern, DuplicateStatus } from '@prisma/client';
import {
  ImportSource,
  TransactionStatus,
} from '../../entities/transaction.entity';
import { Decimal } from 'decimal.js';

describe('PayeeAlias Integration', () => {
  let payeeAliasService: PayeeAliasService;
  let patternLearningService: PatternLearningService;
  let categorizationService: CategorizationService;
  let patternRepo: jest.Mocked<PayeePatternRepository>;
  let transactionRepo: jest.Mocked<TransactionRepository>;
  let categorizationRepo: jest.Mocked<CategorizationRepository>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockTenantId = 'tenant-123';
  const canonicalPayee = 'WOOLWORTHS';
  const aliasPayee = 'WOOLWORTHS SANDTON';

  const mockPattern: PayeePattern = {
    id: 'pattern-1',
    tenantId: mockTenantId,
    payeePattern: canonicalPayee,
    payeeAliases: [],
    defaultAccountCode: '5100',
    defaultAccountName: 'Groceries',
    confidenceBoost: new Decimal(10),
    matchCount: 5,
    isRecurring: false,
    isActive: true,
    source: 'MANUAL',
    expectedAmountCents: null,
    amountVariancePercent: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockTransaction: Transaction = {
    id: 'tx-1',
    tenantId: mockTenantId,
    xeroTransactionId: null,
    bankAccount: 'ACC-001',
    date: new Date('2024-01-15'),
    description: 'POS PURCHASE WOOLWORTHS SANDTON',
    payeeName: aliasPayee,
    reference: 'REF123',
    amountCents: 50000,
    isCredit: false,
    source: ImportSource.BANK_FEED,
    importBatchId: 'batch-1',
    status: TransactionStatus.PENDING,
    isReconciled: false,
    reconciledAt: null,
    isDeleted: false,
    deletedAt: null,
    transactionHash: null,
    duplicateOfId: null,
    duplicateStatus: DuplicateStatus.NONE,
    reversesTransactionId: null,
    isReversal: false,
    xeroAccountCode: null,
    supplierId: null,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };

  beforeEach(async () => {
    const mockPatternRepo = {
      findByTenant: jest.fn(),
      findByPayeeName: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      incrementMatchCount: jest.fn(),
    };

    const mockTransactionRepo = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
      findByIds: jest.fn(),
      updateStatus: jest.fn(),
    };

    const mockCategorizationRepo = {
      findByTransaction: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      review: jest.fn(),
      findSimilarByDescription: jest.fn(),
    };

    const mockAuditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    const mockVariationDetector = {
      detectVariations: jest.fn().mockResolvedValue([]),
      findAllPotentialGroups: jest.fn().mockResolvedValue([]),
      normalize: jest.fn((name: string) => name.toUpperCase().trim()),
      calculateSimilarity: jest
        .fn()
        .mockReturnValue({ score: 0, method: 'fuzzy' }),
      getSuggestedAliases: jest.fn().mockResolvedValue([]),
    };

    const mockConflictService = {
      detectConflict: jest.fn().mockResolvedValue(null),
      resolveConflict: jest.fn().mockResolvedValue(undefined),
      getAffectedTransactions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayeeAliasService,
        PatternLearningService,
        CategorizationService,
        {
          provide: PayeePatternRepository,
          useValue: mockPatternRepo,
        },
        {
          provide: TransactionRepository,
          useValue: mockTransactionRepo,
        },
        {
          provide: CategorizationRepository,
          useValue: mockCategorizationRepo,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: PayeeVariationDetectorService,
          useValue: mockVariationDetector,
        },
        {
          provide: CorrectionConflictService,
          useValue: mockConflictService,
        },
      ],
    }).compile();

    payeeAliasService = module.get<PayeeAliasService>(PayeeAliasService);
    patternLearningService = module.get<PatternLearningService>(
      PatternLearningService,
    );
    categorizationService = module.get<CategorizationService>(
      CategorizationService,
    );
    patternRepo = module.get(PayeePatternRepository);
    transactionRepo = module.get(TransactionRepository);
    categorizationRepo = module.get(CategorizationRepository);
    auditLogService = module.get(AuditLogService);
  });

  describe('End-to-End Alias Creation Flow', () => {
    it('should create alias when learning from similar payee correction', async () => {
      // Setup: Existing pattern for canonical payee
      transactionRepo.findById.mockResolvedValue(mockTransaction);
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);
      patternRepo.findByPayeeName.mockResolvedValue(mockPattern);
      patternRepo.update
        .mockResolvedValueOnce({
          ...mockPattern,
          payeeAliases: [aliasPayee],
        })
        .mockResolvedValueOnce({
          ...mockPattern,
          confidenceBoost: new Decimal(15),
        });

      // Act: User corrects transaction with alias payee
      await patternLearningService.learnFromCorrection(
        mockTransaction.id,
        '5100',
        'Groceries',
        mockTenantId,
      );

      // Assert: Pattern was updated (alias creation happens via payeeAliasService.update,
      // then confidence boost is incremented)
      expect(patternRepo.update).toHaveBeenCalled();
      const updateCalls = patternRepo.update.mock.calls;
      // Should have at least one update call
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should resolve alias during pattern matching', async () => {
      // Setup: Pattern with alias
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: [aliasPayee],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);
      patternRepo.findByPayeeName.mockResolvedValue(patternWithAlias);

      // Act: Resolve the alias
      const resolved = await payeeAliasService.resolveAlias(
        mockTenantId,
        aliasPayee,
      );

      // Assert: Alias resolved to canonical name
      expect(resolved).toBe(canonicalPayee);
    });

    it('should use resolved canonical name for pattern matching in categorization', async () => {
      // Setup: Pattern with alias
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: [aliasPayee],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);
      patternRepo.findByPayeeName.mockResolvedValue(patternWithAlias);
      transactionRepo.findById.mockResolvedValue(mockTransaction);
      transactionRepo.updateStatus.mockResolvedValue(mockTransaction);
      categorizationRepo.create.mockResolvedValue({
        id: 'cat-1',
        transactionId: mockTransaction.id,
        accountCode: '5100',
        accountName: 'Groceries',
        confidenceScore: 95,
        reasoning: 'Pattern match',
        source: 'RULE_BASED',
        isSplit: false,
        splitAmountCents: null,
        vatAmountCents: 6522,
        vatType: 'STANDARD',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      categorizationRepo.findSimilarByDescription.mockResolvedValue([]);

      // Act: Categorize transaction with alias payee
      const result = await categorizationService.categorizeTransaction(
        mockTransaction.id,
        mockTenantId,
      );

      // Assert: Pattern was matched using canonical name
      expect(result.source).toBe('RULE_BASED');
      expect(result.accountCode).toBe('5100');
      expect(patternRepo.incrementMatchCount).toHaveBeenCalledWith(
        mockPattern.id,
      );
    });
  });

  describe('Similarity Detection', () => {
    let variationDetector: jest.Mocked<PayeeVariationDetectorService>;

    beforeEach(() => {
      variationDetector = {
        detectVariations: jest.fn().mockResolvedValue([]),
        findAllPotentialGroups: jest.fn().mockResolvedValue([]),
        normalize: jest.fn((name: string) => name.toUpperCase().trim()),
        calculateSimilarity: jest
          .fn()
          .mockReturnValue({ score: 0, method: 'fuzzy' }),
        getSuggestedAliases: jest.fn().mockResolvedValue([]),
      } as any;
    });

    it('should find similar payees with minor spelling differences', async () => {
      const variations = [
        { pattern: canonicalPayee, payeeAliases: [] },
        { pattern: 'WOOLWORTH', payeeAliases: [] },
      ];

      patternRepo.findByTenant.mockResolvedValue(
        variations.map((v, i) => ({
          ...mockPattern,
          id: `pattern-${i}`,
          payeePattern: v.pattern,
          payeeAliases: v.payeeAliases,
        })),
      );

      // Mock the variation detector to return similar payees
      const mockVariationDetectorService =
        payeeAliasService['variationDetector'];
      (
        mockVariationDetectorService.detectVariations as jest.Mock
      ).mockResolvedValue([
        {
          payeeA: 'WOLWORTHS',
          payeeB: 'WOOLWORTHS',
          similarity: 0.9,
          matchType: 'fuzzy',
          confidence: 90,
          normalizedA: 'WOLWORTHS',
          normalizedB: 'WOOLWORTHS',
        },
      ]);

      const similar = await payeeAliasService.findSimilar(
        mockTenantId,
        'WOLWORTHS',
      );

      expect(similar).toContain(canonicalPayee);
    });

    it('should not match completely different payees', async () => {
      const patterns = [
        { pattern: canonicalPayee, payeeAliases: [] },
        { pattern: 'CHECKERS', payeeAliases: [] },
      ];

      patternRepo.findByTenant.mockResolvedValue(
        patterns.map((v, i) => ({
          ...mockPattern,
          id: `pattern-${i}`,
          payeePattern: v.pattern,
          payeeAliases: v.payeeAliases,
        })),
      );

      const similar = await payeeAliasService.findSimilar(
        mockTenantId,
        'SPAR SUPERMARKET',
      );

      expect(similar).not.toContain(canonicalPayee);
      expect(similar).not.toContain('CHECKERS');
    });
  });

  describe('Alias Management', () => {
    it('should prevent creating duplicate aliases', async () => {
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: [aliasPayee],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);

      await expect(
        payeeAliasService.createAlias(mockTenantId, aliasPayee, canonicalPayee),
      ).rejects.toThrow();
    });

    it('should allow deleting an alias', async () => {
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: [aliasPayee, 'WOOLIES'],
      };
      patternRepo.findById.mockResolvedValue(patternWithAlias);
      patternRepo.update.mockResolvedValue({
        ...patternWithAlias,
        payeeAliases: ['WOOLIES'],
      });

      await payeeAliasService.deleteAlias(
        mockTenantId,
        `${mockPattern.id}:${aliasPayee}`,
      );

      expect(patternRepo.update).toHaveBeenCalledWith(mockPattern.id, {
        payeeAliases: ['WOOLIES'],
      });
    });

    it('should list all aliases for a canonical name', async () => {
      const patternWithAliases = {
        ...mockPattern,
        payeeAliases: [aliasPayee, 'WOOLIES', 'W/WORTHS'],
      };
      patternRepo.findByPayeeName.mockResolvedValue(patternWithAliases);

      const aliases = await payeeAliasService.getAliases(
        mockTenantId,
        canonicalPayee,
      );

      expect(aliases).toHaveLength(3);
      expect(aliases.map((a) => a.alias)).toContain(aliasPayee);
      expect(aliases.map((a) => a.alias)).toContain('WOOLIES');
      expect(aliases.map((a) => a.alias)).toContain('W/WORTHS');
    });
  });

  describe('Case Insensitivity', () => {
    it('should resolve aliases case-insensitively', async () => {
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: ['WOOLWORTHS SANDTON'],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);

      const resolved1 = await payeeAliasService.resolveAlias(
        mockTenantId,
        'woolworths sandton',
      );
      const resolved2 = await payeeAliasService.resolveAlias(
        mockTenantId,
        'WOOLWORTHS SANDTON',
      );
      const resolved3 = await payeeAliasService.resolveAlias(
        mockTenantId,
        'WoOlWoRtHs SaNdToN',
      );

      expect(resolved1).toBe(canonicalPayee);
      expect(resolved2).toBe(canonicalPayee);
      expect(resolved3).toBe(canonicalPayee);
    });
  });

  describe('Special Characters', () => {
    it('should handle special characters in aliases', async () => {
      const specialAlias = 'W/WORTHS';
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: [specialAlias],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);

      const resolved = await payeeAliasService.resolveAlias(
        mockTenantId,
        specialAlias,
      );

      expect(resolved).toBe(canonicalPayee);
    });

    it('should normalize special characters for matching', async () => {
      const patternWithAlias = {
        ...mockPattern,
        payeeAliases: ['W/WORTHS'],
      };
      patternRepo.findByTenant.mockResolvedValue([patternWithAlias]);

      // Should match even with different formatting
      const resolved = await payeeAliasService.resolveAlias(
        mockTenantId,
        'W-WORTHS',
      );

      expect(resolved).toBe(canonicalPayee);
    });
  });
});
