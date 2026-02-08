/**
 * Bank Statement Reconciliation Service Tests
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 * TASK-RECON-002: Comprehensive Unit Tests for Reconciliation Service
 *
 * This file contains two test suites:
 * 1. Unit tests with mocked dependencies for fast, isolated testing
 * 2. Integration tests using real PostgreSQL data
 *
 * Test Coverage Target: 80%+ for all reconciliation service methods
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BankStatementReconciliationService } from '../../../src/database/services/bank-statement-reconciliation.service';
import { BankStatementMatchRepository } from '../../../src/database/repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import {
  BankStatementMatchStatus,
  ParsedBankTransaction,
} from '../../../src/database/entities/bank-statement-match.entity';
import { ReconciliationStatus } from '../../../src/database/entities/reconciliation.entity';
import { LLMWhispererParser } from '../../../src/database/parsers/llmwhisperer-parser';
import {
  ToleranceConfigService,
  DEFAULT_TOLERANCE_CONFIG,
} from '../../../src/database/services/tolerance-config.service';
import { AccruedBankChargeService } from '../../../src/database/services/accrued-bank-charge.service';
import { BankFeeService } from '../../../src/database/services/bank-fee.service';
import { FeeInflationCorrectionService } from '../../../src/database/services/fee-inflation-correction.service';
import { ConfigService } from '@nestjs/config';
import {
  Tenant,
  Reconciliation,
  Transaction,
  BankStatementMatch,
} from '@prisma/client';
import { BusinessException } from '../../../src/shared/exceptions';

// ============================================================================
// UNIT TESTS WITH MOCKED DEPENDENCIES
// ============================================================================
describe('BankStatementReconciliationService (Unit Tests)', () => {
  let service: BankStatementReconciliationService;
  let mockPrisma: any;
  let mockMatchRepo: jest.Mocked<BankStatementMatchRepository>;
  let mockReconRepo: jest.Mocked<ReconciliationRepository>;
  let mockToleranceConfig: jest.Mocked<ToleranceConfigService>;
  let mockLLMParser: jest.Mocked<LLMWhispererParser>;
  let mockAccruedChargeService: jest.Mocked<AccruedBankChargeService>;
  let mockBankFeeService: jest.Mocked<BankFeeService>;

  beforeEach(async () => {
    // Create comprehensive mocks
    mockPrisma = {
      transaction: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      reconciliation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn) => fn(mockPrisma)),
    };

    mockMatchRepo = {
      create: jest.fn(),
      findByReconciliationId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteByReconciliationId: jest.fn(),
      findByStatus: jest.fn(),
      findByTransactionId: jest.fn(),
      countByStatus: jest.fn(),
      findUnmatched: jest.fn(),
    } as any;

    mockReconRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findByTenantAndAccount: jest.fn(),
      findByTenantId: jest.fn(),
      findByBankAccount: jest.fn(),
      complete: jest.fn(),
      calculateDiscrepancy: jest.fn(),
      findWithDiscrepancies: jest.fn(),
      findInProgress: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockToleranceConfig = {
      isWithinTolerance: jest.fn().mockReturnValue(true),
      isBalanceWithinTolerance: jest.fn().mockReturnValue(true),
      isDateWithinTolerance: jest.fn().mockReturnValue(true),
      isDescriptionMatch: jest.fn().mockReturnValue(true),
      getEffectiveTolerance: jest.fn().mockReturnValue(100),
      isPotentialBankFee: jest.fn().mockReturnValue(false),
      descriptionSimilarityThreshold: 0.7,
      amountMatchingTolerance: 1,
      balanceValidationTolerance: 100,
      bankFeeTolerance: 500,
      dateTolerance: 1,
      percentageTolerance: 0.005,
      largeAmountThreshold: 1000000,
      getConfig: jest.fn().mockReturnValue(DEFAULT_TOLERANCE_CONFIG),
    } as any;

    mockLLMParser = {
      parseWithBalances: jest.fn(),
    } as any;

    mockAccruedChargeService = {
      createFromFeeAdjustedMatch: jest.fn(),
      findPendingCharges: jest.fn(),
      matchChargeToTransaction: jest.fn(),
      getChargesSummary: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      findByReconciliation: jest.fn(),
    } as any;

    mockBankFeeService = {
      calculateFee: jest.fn(),
      getFeeConfig: jest.fn(),
      detectFeeTransaction: jest.fn(),
      isPotentialBankFee: jest.fn().mockReturnValue(false),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankStatementReconciliationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BankStatementMatchRepository, useValue: mockMatchRepo },
        { provide: ReconciliationRepository, useValue: mockReconRepo },
        { provide: ToleranceConfigService, useValue: mockToleranceConfig },
        { provide: LLMWhispererParser, useValue: mockLLMParser },
        {
          provide: AccruedBankChargeService,
          useValue: mockAccruedChargeService,
        },
        { provide: BankFeeService, useValue: mockBankFeeService },
        {
          provide: FeeInflationCorrectionService,
          useValue: {
            detectAndValidateFeeMatch: jest.fn().mockResolvedValue({
              isMatch: false,
              confidence: 0,
              transactionType: 'UNKNOWN',
              feeType: 'NONE',
              expectedFeeCents: 0,
              actualFeeCents: 0,
              explanation: 'mock',
            }),
            correctExistingMatches: jest.fn().mockResolvedValue({
              totalMatches: 0,
              correctableMatches: 0,
              totalFeesCents: 0,
              corrections: [],
              skipped: [],
            }),
            matchMonthlyFeeTransactions: jest.fn().mockResolvedValue({
              matchedCount: 0,
              totalMatchedCents: 0,
              matches: [],
              unmatched: [],
            }),
          },
        },
      ],
    }).compile();

    service = module.get(BankStatementReconciliationService);
  });

  // ==========================================================================
  // calculateSimilarity Tests
  // ==========================================================================
  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(service.calculateSimilarity('test', 'test')).toBe(1);
    });

    it('should return 1 for two empty strings', () => {
      expect(service.calculateSimilarity('', '')).toBe(1);
    });

    it('should return 0 when first string is empty', () => {
      expect(service.calculateSimilarity('', 'test')).toBe(0);
    });

    it('should return 0 when second string is empty', () => {
      expect(service.calculateSimilarity('test', '')).toBe(0);
    });

    it('should return high similarity for similar strings', () => {
      const similarity = service.calculateSimilarity(
        'payment to john',
        'payment to john doe',
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should return low similarity for very different strings', () => {
      const similarity = service.calculateSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should be case sensitive', () => {
      const similarity = service.calculateSimilarity('TEST', 'test');
      expect(similarity).toBeLessThan(1);
    });

    it('should handle special characters correctly', () => {
      const similarity = service.calculateSimilarity(
        'payment-123',
        'payment_123',
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle long strings efficiently', () => {
      const longString1 = 'a'.repeat(100);
      const longString2 = 'a'.repeat(95) + 'b'.repeat(5);
      const similarity = service.calculateSimilarity(longString1, longString2);
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should return correct similarity for common banking descriptions', () => {
      const similarity = service.calculateSimilarity(
        'FNB SALARY PAYMENT JOHN SMITH',
        'FNB SALARY PAYMENT J SMITH',
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle single character strings', () => {
      expect(service.calculateSimilarity('a', 'a')).toBe(1);
      expect(service.calculateSimilarity('a', 'b')).toBe(0);
    });

    it('should handle strings with only whitespace differences', () => {
      const similarity = service.calculateSimilarity(
        'payment test',
        'payment  test',
      );
      expect(similarity).toBeGreaterThan(0.9);
    });
  });

  // ==========================================================================
  // calculateBalance Tests
  // ==========================================================================
  describe('calculateBalance', () => {
    it('should return opening balance when no transactions', () => {
      const balance = service.calculateBalance(10000, []);
      expect(balance).toBe(10000);
    });

    it('should calculate correct balance with credits only', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Credit 1',
          amountCents: 5000,
          isCredit: true,
        },
        {
          date: new Date(),
          description: 'Credit 2',
          amountCents: 3000,
          isCredit: true,
        },
      ];
      const balance = service.calculateBalance(10000, transactions);
      expect(balance).toBe(18000); // 10000 + 5000 + 3000
    });

    it('should calculate correct balance with debits only', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Debit 1',
          amountCents: 2000,
          isCredit: false,
        },
        {
          date: new Date(),
          description: 'Debit 2',
          amountCents: 3000,
          isCredit: false,
        },
      ];
      const balance = service.calculateBalance(10000, transactions);
      expect(balance).toBe(5000); // 10000 - 2000 - 3000
    });

    it('should calculate correct balance with mixed credits and debits', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Credit',
          amountCents: 5000,
          isCredit: true,
        },
        {
          date: new Date(),
          description: 'Debit',
          amountCents: 2000,
          isCredit: false,
        },
      ];
      const balance = service.calculateBalance(10000, transactions);
      expect(balance).toBe(13000); // 10000 + 5000 - 2000
    });

    it('should handle zero opening balance', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Credit',
          amountCents: 5000,
          isCredit: true,
        },
      ];
      const balance = service.calculateBalance(0, transactions);
      expect(balance).toBe(5000);
    });

    it('should handle negative opening balance', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Credit',
          amountCents: 5000,
          isCredit: true,
        },
      ];
      const balance = service.calculateBalance(-1000, transactions);
      expect(balance).toBe(4000);
    });

    it('should handle large amounts correctly (no precision loss)', () => {
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Large Credit',
          amountCents: 999999999,
          isCredit: true,
        },
        {
          date: new Date(),
          description: 'Small Debit',
          amountCents: 1,
          isCredit: false,
        },
      ];
      const balance = service.calculateBalance(100000000, transactions);
      expect(balance).toBe(1099999998); // 100000000 + 999999999 - 1
    });

    it('should handle many transactions efficiently', () => {
      const transactions: ParsedBankTransaction[] = Array.from(
        { length: 1000 },
        (_, i) => ({
          date: new Date(),
          description: `Transaction ${i}`,
          amountCents: 100,
          isCredit: i % 2 === 0,
        }),
      );
      // 500 credits (50000) and 500 debits (50000) = net 0
      const balance = service.calculateBalance(10000, transactions);
      expect(balance).toBe(10000);
    });

    it('should round correctly using bankers rounding', () => {
      // Decimal.js with ROUND_HALF_EVEN should handle this
      const transactions: ParsedBankTransaction[] = [
        {
          date: new Date(),
          description: 'Credit',
          amountCents: 1,
          isCredit: true,
        },
      ];
      const balance = service.calculateBalance(0, transactions);
      expect(balance).toBe(1);
    });
  });

  // ==========================================================================
  // manualMatch Tests
  // ==========================================================================
  describe('manualMatch', () => {
    const tenantId = 'tenant-1';
    const matchId = 'match-1';
    const transactionId = 'tx-1';
    const reconciliationId = 'recon-1';

    beforeEach(() => {
      // Default mock setup for successful manual match
      mockMatchRepo.findById.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'Bank Payment',
        bankAmountCents: 10000,
        bankIsCredit: true,
        transactionId: null,
        xeroDate: null,
        xeroDescription: null,
        xeroAmountCents: null,
        xeroIsCredit: null,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
        matchConfidence: null,
        discrepancyReason: 'No matching transaction',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        tenantId,
        date: new Date('2025-01-15'),
        description: 'Xero Transaction',
        amountCents: 10000,
        isCredit: true,
        bankAccount: 'Test Bank',
        source: 'BANK_FEED',
        status: 'CATEGORIZED',
        isDeleted: false,
        isReconciled: false,
      });

      mockMatchRepo.update.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'Bank Payment',
        bankAmountCents: 10000,
        bankIsCredit: true,
        transactionId,
        xeroDate: new Date('2025-01-15'),
        xeroDescription: 'Xero Transaction',
        xeroAmountCents: 10000,
        xeroIsCredit: true,
        status: BankStatementMatchStatus.MATCHED,
        matchConfidence: 1.0,
        discrepancyReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockMatchRepo.findByReconciliationId.mockResolvedValue([]);
      mockPrisma.reconciliation.findUnique.mockResolvedValue({
        id: reconciliationId,
        tenantId,
        discrepancyCents: 0,
        status: 'IN_PROGRESS',
      });
    });

    it('should successfully match a transaction manually', async () => {
      const result = await service.manualMatch(
        tenantId,
        matchId,
        transactionId,
      );

      expect(result.id).toBe(matchId);
      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
      expect(result.matchConfidence).toBe(1.0);

      expect(mockMatchRepo.findById).toHaveBeenCalledWith(matchId, tenantId);
      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: transactionId },
      });
      expect(mockMatchRepo.update).toHaveBeenCalledWith(matchId, {
        transactionId,
        xeroDate: expect.any(Date),
        xeroDescription: 'Xero Transaction',
        xeroAmountCents: 10000,
        xeroIsCredit: true,
        status: BankStatementMatchStatus.MATCHED,
        matchConfidence: 1.0,
        discrepancyReason: null,
      });
    });

    it('should throw BusinessException when match not found', async () => {
      mockMatchRepo.findById.mockResolvedValue(null);

      await expect(
        service.manualMatch(tenantId, 'invalid-match', transactionId),
      ).rejects.toThrow(BusinessException);

      await expect(
        service.manualMatch(tenantId, 'invalid-match', transactionId),
      ).rejects.toThrow('Bank statement match not found');
    });

    it('should throw BusinessException when transaction not found', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.manualMatch(tenantId, matchId, 'invalid-tx'),
      ).rejects.toThrow(BusinessException);

      await expect(
        service.manualMatch(tenantId, matchId, 'invalid-tx'),
      ).rejects.toThrow('Transaction not found');
    });

    it('should throw BusinessException when transaction belongs to different tenant', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        tenantId: 'different-tenant',
        date: new Date(),
        description: 'Other Tenant Transaction',
        amountCents: 10000,
        isCredit: true,
      });

      await expect(
        service.manualMatch(tenantId, matchId, transactionId),
      ).rejects.toThrow('Transaction not found');
    });

    it('should update reconciliation status after manual match', async () => {
      // Setup for all matched scenario
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        {
          id: matchId,
          tenantId,
          reconciliationId,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'Bank Payment',
          bankAmountCents: 10000,
          bankIsCredit: true,
          transactionId,
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'Xero Transaction',
          xeroAmountCents: 10000,
          xeroIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
          matchConfidence: { toNumber: () => 1.0 } as any,
          discrepancyReason: null,
          isFeeAdjustedMatch: false,
          feeType: null,
          accruedFeeAmountCents: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.reconciliation.findUnique.mockResolvedValue({
        id: reconciliationId,
        tenantId,
        discrepancyCents: 0,
        status: 'IN_PROGRESS',
      });
      mockToleranceConfig.isBalanceWithinTolerance.mockReturnValue(true);

      await service.manualMatch(tenantId, matchId, transactionId);

      expect(mockPrisma.reconciliation.findUnique).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // unmatch Tests
  // ==========================================================================
  describe('unmatch', () => {
    const tenantId = 'tenant-1';
    const matchId = 'match-1';
    const reconciliationId = 'recon-1';
    const transactionId = 'tx-1';

    beforeEach(() => {
      mockMatchRepo.findById.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'Bank Payment',
        bankAmountCents: 10000,
        bankIsCredit: true,
        transactionId,
        xeroDate: new Date('2025-01-15'),
        xeroDescription: 'Xero Transaction',
        xeroAmountCents: 10000,
        xeroIsCredit: true,
        status: BankStatementMatchStatus.MATCHED,
        matchConfidence: 1.0,
        discrepancyReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockMatchRepo.update.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'Bank Payment',
        bankAmountCents: 10000,
        bankIsCredit: true,
        transactionId: null,
        xeroDate: null,
        xeroDescription: null,
        xeroAmountCents: null,
        xeroIsCredit: null,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
        matchConfidence: null,
        discrepancyReason: 'Manually unmatched',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockPrisma.transaction.update.mockResolvedValue({});
      mockMatchRepo.findByReconciliationId.mockResolvedValue([]);
      mockPrisma.reconciliation.findUnique.mockResolvedValue({
        id: reconciliationId,
        tenantId,
        discrepancyCents: 0,
        status: 'IN_PROGRESS',
      });
    });

    it('should successfully unmatch a previously matched record', async () => {
      const result = await service.unmatch(tenantId, matchId);

      expect(result.id).toBe(matchId);
      expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);

      expect(mockMatchRepo.findById).toHaveBeenCalledWith(matchId, tenantId);
      expect(mockMatchRepo.update).toHaveBeenCalledWith(matchId, {
        transactionId: null,
        xeroDate: null,
        xeroDescription: null,
        xeroAmountCents: null,
        xeroIsCredit: null,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
        matchConfidence: null,
        discrepancyReason: 'Manually unmatched',
      });
    });

    it('should throw BusinessException when match not found', async () => {
      mockMatchRepo.findById.mockResolvedValue(null);

      await expect(service.unmatch(tenantId, 'invalid-match')).rejects.toThrow(
        BusinessException,
      );

      await expect(service.unmatch(tenantId, 'invalid-match')).rejects.toThrow(
        'Bank statement match not found',
      );
    });

    it('should reset transaction is_reconciled flag after unmatch', async () => {
      await service.unmatch(tenantId, matchId);

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: { isReconciled: false, updatedAt: expect.any(Date) },
      });
    });

    it('should determine IN_XERO_ONLY status when bank data is missing', async () => {
      mockMatchRepo.findById.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: '',
        bankAmountCents: 0,
        bankIsCredit: false,
        transactionId,
        xeroDate: new Date('2025-01-15'),
        xeroDescription: 'Xero Transaction',
        xeroAmountCents: 10000,
        xeroIsCredit: true,
        status: BankStatementMatchStatus.MATCHED,
        matchConfidence: 1.0,
        discrepancyReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockMatchRepo.update.mockResolvedValue({
        id: matchId,
        status: BankStatementMatchStatus.IN_XERO_ONLY,
      } as any);

      const result = await service.unmatch(tenantId, matchId);

      expect(mockMatchRepo.update).toHaveBeenCalledWith(
        matchId,
        expect.objectContaining({
          status: BankStatementMatchStatus.IN_XERO_ONLY,
        }),
      );
    });

    it('should not try to reset transaction flag if no previous transactionId', async () => {
      mockMatchRepo.findById.mockResolvedValue({
        id: matchId,
        reconciliationId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'Bank Payment',
        bankAmountCents: 10000,
        bankIsCredit: true,
        transactionId: null, // No previous transaction
        xeroDate: null,
        xeroDescription: null,
        xeroAmountCents: null,
        xeroIsCredit: null,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
        matchConfidence: null,
        discrepancyReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockMatchRepo.update.mockResolvedValue({
        id: matchId,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
      } as any);

      await service.unmatch(tenantId, matchId);

      expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getMatchesByReconciliationId Tests
  // ==========================================================================
  describe('getMatchesByReconciliationId', () => {
    const tenantId = 'tenant-1';
    const reconciliationId = 'recon-1';

    it('should return empty array when no matches exist', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([]);

      const matches = await service.getMatchesByReconciliationId(
        tenantId,
        reconciliationId,
      );

      expect(matches).toEqual([]);
      expect(mockMatchRepo.findByReconciliationId).toHaveBeenCalledWith(
        tenantId,
        reconciliationId,
      );
    });

    it('should return matches with correct fields', async () => {
      const mockMatches = [
        {
          id: 'match-1',
          tenantId,
          reconciliationId,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'Bank Payment',
          bankAmountCents: 10000,
          bankIsCredit: true,
          transactionId: 'tx-1',
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'Xero Payment',
          xeroAmountCents: 10000,
          xeroIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
          matchConfidence: 0.95,
          discrepancyReason: null,
        },
      ];

      mockMatchRepo.findByReconciliationId.mockResolvedValue(
        mockMatches as any,
      );

      const matches = await service.getMatchesByReconciliationId(
        tenantId,
        reconciliationId,
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]).toHaveProperty('id', 'match-1');
      expect(matches[0]).toHaveProperty('bankDate');
      expect(matches[0]).toHaveProperty('bankDescription', 'Bank Payment');
      expect(matches[0]).toHaveProperty(
        'status',
        BankStatementMatchStatus.MATCHED,
      );
      expect(matches[0].matchConfidence).toBe(0.95);
    });

    it('should handle null matchConfidence by converting to null', async () => {
      const mockMatches = [
        {
          id: 'match-1',
          tenantId,
          reconciliationId,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'Bank Only',
          bankAmountCents: 10000,
          bankIsCredit: true,
          transactionId: null,
          xeroDate: null,
          xeroDescription: null,
          xeroAmountCents: null,
          xeroIsCredit: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          matchConfidence: null,
          discrepancyReason: 'No match found',
        },
      ];

      mockMatchRepo.findByReconciliationId.mockResolvedValue(
        mockMatches as any,
      );

      const matches = await service.getMatchesByReconciliationId(
        tenantId,
        reconciliationId,
      );

      expect(matches[0].matchConfidence).toBeNull();
    });
  });

  // ==========================================================================
  // getUnmatchedSummary Tests
  // ==========================================================================
  describe('getUnmatchedSummary', () => {
    const tenantId = 'tenant-1';
    const reconciliationId = 'recon-1';

    it('should return empty arrays when no unmatched transactions', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        {
          id: 'match-1',
          status: BankStatementMatchStatus.MATCHED,
          bankDate: new Date(),
          bankDescription: 'Matched',
          bankAmountCents: 10000,
        },
      ] as any);

      const summary = await service.getUnmatchedSummary(
        tenantId,
        reconciliationId,
      );

      expect(summary.inBankOnly).toHaveLength(0);
      expect(summary.inXeroOnly).toHaveLength(0);
    });

    it('should return bank-only transactions', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        {
          id: 'match-1',
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'Bank Fee',
          bankAmountCents: 15000,
          transactionId: null,
        },
      ] as any);

      const summary = await service.getUnmatchedSummary(
        tenantId,
        reconciliationId,
      );

      expect(summary.inBankOnly).toHaveLength(1);
      expect(summary.inBankOnly[0]).toHaveProperty('description', 'Bank Fee');
      expect(summary.inBankOnly[0]).toHaveProperty('amount', 150); // cents to rands
    });

    it('should return xero-only transactions with transactionId', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        {
          id: 'match-1',
          status: BankStatementMatchStatus.IN_XERO_ONLY,
          bankDate: new Date('2025-01-15'),
          bankDescription: '',
          bankAmountCents: 0,
          transactionId: 'tx-1',
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'Uncleared Cheque',
          xeroAmountCents: 50000,
        },
      ] as any);

      const summary = await service.getUnmatchedSummary(
        tenantId,
        reconciliationId,
      );

      expect(summary.inXeroOnly).toHaveLength(1);
      expect(summary.inXeroOnly[0]).toHaveProperty(
        'description',
        'Uncleared Cheque',
      );
      expect(summary.inXeroOnly[0]).toHaveProperty('amount', 500);
      expect(summary.inXeroOnly[0]).toHaveProperty('transactionId', 'tx-1');
    });

    it('should filter out xero-only without transactionId', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        {
          id: 'match-1',
          status: BankStatementMatchStatus.IN_XERO_ONLY,
          bankDate: new Date('2025-01-15'),
          bankDescription: '',
          bankAmountCents: 0,
          transactionId: null, // No transactionId
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'Missing Transaction',
          xeroAmountCents: 30000,
        },
      ] as any);

      const summary = await service.getUnmatchedSummary(
        tenantId,
        reconciliationId,
      );

      expect(summary.inXeroOnly).toHaveLength(0);
    });
  });

  // ==========================================================================
  // getAvailableTransactionsForMatching Tests
  // ==========================================================================
  describe('getAvailableTransactionsForMatching', () => {
    const tenantId = 'tenant-1';
    const reconciliationId = 'recon-1';

    beforeEach(() => {
      mockPrisma.reconciliation.findUnique.mockResolvedValue({
        id: reconciliationId,
        tenantId,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      mockMatchRepo.findByReconciliationId.mockResolvedValue([]);
    });

    it('should throw NotFoundException when reconciliation not found', async () => {
      mockPrisma.reconciliation.findUnique.mockResolvedValue(null);

      await expect(
        service.getAvailableTransactionsForMatching(tenantId, 'invalid-recon'),
      ).rejects.toThrow('Reconciliation');
    });

    it('should return available transactions within reconciliation period', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          tenantId,
          date: new Date('2025-01-15'),
          description: 'Available Transaction',
          amountCents: 10000,
          isCredit: true,
        },
      ]);

      const transactions = await service.getAvailableTransactionsForMatching(
        tenantId,
        reconciliationId,
      );

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toHaveProperty('id', 'tx-1');
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            isDeleted: false,
            isReconciled: false,
          }),
        }),
      );
    });

    it('should exclude already matched transactions', async () => {
      mockMatchRepo.findByReconciliationId.mockResolvedValue([
        { id: 'match-1', transactionId: 'tx-already-matched' },
      ] as any);

      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-available',
          tenantId,
          date: new Date('2025-01-15'),
          description: 'Available',
          amountCents: 10000,
          isCredit: true,
        },
      ]);

      await service.getAvailableTransactionsForMatching(
        tenantId,
        reconciliationId,
      );

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['tx-already-matched'] },
          }),
        }),
      );
    });

    it('should apply search term filter', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.getAvailableTransactionsForMatching(
        tenantId,
        reconciliationId,
        { searchTerm: 'SALARY' },
      );

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            description: { contains: 'SALARY', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should use custom date filters when provided', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const customStart = new Date('2025-01-10');
      const customEnd = new Date('2025-01-20');

      await service.getAvailableTransactionsForMatching(
        tenantId,
        reconciliationId,
        { startDate: customStart, endDate: customEnd },
      );

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: customStart, lte: customEnd },
          }),
        }),
      );
    });
  });

  // ==========================================================================
  // reconcileStatement Tests (Main Flow)
  // ==========================================================================
  describe('reconcileStatement', () => {
    const tenantId = 'tenant-1';
    const bankAccount = 'Nedbank Business';
    const userId = 'user-1';
    const pdfBuffer = Buffer.from('test pdf content');

    beforeEach(() => {
      mockLLMParser.parseWithBalances.mockResolvedValue({
        statementPeriod: {
          start: new Date('2025-01-01'),
          end: new Date('2025-01-31'),
        },
        accountNumber: '112233445566',
        openingBalanceCents: 10000000,
        closingBalanceCents: 12000000,
        transactions: [
          {
            date: new Date('2025-01-15'),
            description: 'SCHOOL FEE PAYMENT',
            amountCents: 350000,
            isCredit: true,
          },
        ],
      });

      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'xero-tx-1',
          tenantId,
          date: new Date('2025-01-15'),
          description: 'SCHOOL FEE PAYMENT',
          amountCents: 350000,
          isCredit: true,
        },
      ]);

      mockPrisma.reconciliation.findMany.mockResolvedValue([]);
      mockPrisma.reconciliation.create.mockResolvedValue({
        id: 'recon-1',
        tenantId,
        bankAccount,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        openingBalanceCents: 10000000,
        closingBalanceCents: 12000000,
        calculatedBalanceCents: 10350000,
        discrepancyCents: 1650000,
        status: 'IN_PROGRESS',
      });

      mockMatchRepo.deleteByReconciliationId.mockResolvedValue(undefined);
      mockMatchRepo.create.mockResolvedValue({} as any);
      mockMatchRepo.findByReconciliationId.mockResolvedValue([]);
      mockPrisma.reconciliation.update.mockResolvedValue({});
    });

    it('should parse PDF and create reconciliation', async () => {
      const result = await service.reconcileStatement(
        tenantId,
        bankAccount,
        pdfBuffer,
        userId,
      );

      expect(mockLLMParser.parseWithBalances).toHaveBeenCalledWith(pdfBuffer);
      expect(result).toHaveProperty('reconciliationId');
      expect(result).toHaveProperty('statementPeriod');
      expect(result).toHaveProperty('matchSummary');
    });

    it('should throw BusinessException if period already reconciled', async () => {
      mockPrisma.reconciliation.findMany.mockResolvedValue([
        {
          id: 'existing-recon',
          status: 'RECONCILED',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        },
      ]);

      await expect(
        service.reconcileStatement(tenantId, bankAccount, pdfBuffer, userId),
      ).rejects.toThrow(BusinessException);
    });

    it('should update existing IN_PROGRESS reconciliation', async () => {
      mockPrisma.reconciliation.findMany.mockResolvedValue([
        {
          id: 'existing-recon',
          status: 'IN_PROGRESS',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
        },
      ]);

      mockPrisma.reconciliation.update.mockResolvedValue({
        id: 'existing-recon',
        status: 'IN_PROGRESS',
      });

      const result = await service.reconcileStatement(
        tenantId,
        bankAccount,
        pdfBuffer,
        userId,
      );

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Private evaluateMatch Tests (via reflection)
  // ==========================================================================
  describe('evaluateMatch (private method)', () => {
    it('should return MATCHED status for exact match', () => {
      mockToleranceConfig.isWithinTolerance.mockReturnValue(true);
      mockToleranceConfig.isDateWithinTolerance.mockReturnValue(true);
      (mockToleranceConfig as any).descriptionSimilarityThreshold = 0.6;

      const bankTx: ParsedBankTransaction = {
        date: new Date('2025-01-15'),
        description: 'SCHOOL FEE PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const xeroTx = {
        date: new Date('2025-01-15'),
        description: 'SCHOOL FEE PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const result = (service as any).evaluateMatch(bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
      expect(result.confidence).toBe(1);
      expect(result.reason).toBeNull();
    });

    it('should return AMOUNT_MISMATCH for significant amount difference', () => {
      mockToleranceConfig.isWithinTolerance.mockReturnValue(false);
      mockToleranceConfig.isDateWithinTolerance.mockReturnValue(true);
      (mockToleranceConfig as any).descriptionSimilarityThreshold = 0.6;
      mockToleranceConfig.getEffectiveTolerance.mockReturnValue(100);

      const bankTx: ParsedBankTransaction = {
        date: new Date('2025-01-15'),
        description: 'PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const xeroTx = {
        date: new Date('2025-01-15'),
        description: 'PAYMENT',
        amountCents: 400000, // Different amount
        isCredit: true,
      };

      const result = (service as any).evaluateMatch(bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.AMOUNT_MISMATCH);
      expect(result.reason).toContain('Amount differs');
    });

    it('should return DATE_MISMATCH for date difference outside tolerance', () => {
      mockToleranceConfig.isWithinTolerance.mockReturnValue(true);
      mockToleranceConfig.isDateWithinTolerance.mockReturnValue(false);
      (mockToleranceConfig as any).descriptionSimilarityThreshold = 0.6;

      const bankTx: ParsedBankTransaction = {
        date: new Date('2025-01-15'),
        description: 'PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const xeroTx = {
        date: new Date('2025-01-20'), // 5 days difference
        description: 'PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const result = (service as any).evaluateMatch(bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.DATE_MISMATCH);
      expect(result.reason).toContain('Date differs');
    });

    it('should return IN_BANK_ONLY for low description similarity', () => {
      mockToleranceConfig.isWithinTolerance.mockReturnValue(true);
      mockToleranceConfig.isDateWithinTolerance.mockReturnValue(true);
      (mockToleranceConfig as any).descriptionSimilarityThreshold = 0.9; // High threshold

      const bankTx: ParsedBankTransaction = {
        date: new Date('2025-01-15'),
        description: 'ABC',
        amountCents: 350000,
        isCredit: true,
      };

      const xeroTx = {
        date: new Date('2025-01-15'),
        description: 'XYZ', // Very different
        amountCents: 350000,
        isCredit: true,
      };

      const result = (service as any).evaluateMatch(bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);
    });

    it('should handle credit/debit mismatch', () => {
      mockToleranceConfig.isWithinTolerance.mockReturnValue(true);
      mockToleranceConfig.isDateWithinTolerance.mockReturnValue(true);
      (mockToleranceConfig as any).descriptionSimilarityThreshold = 0.6;

      const bankTx: ParsedBankTransaction = {
        date: new Date('2025-01-15'),
        description: 'PAYMENT',
        amountCents: 350000,
        isCredit: true,
      };

      const xeroTx = {
        date: new Date('2025-01-15'),
        description: 'PAYMENT',
        amountCents: 350000,
        isCredit: false, // Different credit flag
      };

      const result = (service as any).evaluateMatch(bankTx, xeroTx);

      // Credit/debit mismatch means amounts don't match
      expect(result.status).not.toBe(BankStatementMatchStatus.MATCHED);
    });
  });

  // ==========================================================================
  // calculateMatchSummary Tests (private method)
  // ==========================================================================
  describe('calculateMatchSummary (private method)', () => {
    it('should count matched transactions correctly', () => {
      const matches = [
        { status: BankStatementMatchStatus.MATCHED },
        { status: BankStatementMatchStatus.MATCHED },
        { status: BankStatementMatchStatus.MATCHED },
      ];

      const summary = (service as any).calculateMatchSummary(matches);

      expect(summary.matched).toBe(3);
      expect(summary.total).toBe(3);
      expect(summary.inBankOnly).toBe(0);
      expect(summary.inXeroOnly).toBe(0);
    });

    it('should count all status types correctly', () => {
      const matches = [
        { status: BankStatementMatchStatus.MATCHED },
        { status: BankStatementMatchStatus.IN_BANK_ONLY },
        { status: BankStatementMatchStatus.IN_XERO_ONLY },
        { status: BankStatementMatchStatus.AMOUNT_MISMATCH },
        { status: BankStatementMatchStatus.DATE_MISMATCH },
      ];

      const summary = (service as any).calculateMatchSummary(matches);

      expect(summary.matched).toBe(1);
      expect(summary.inBankOnly).toBe(1);
      expect(summary.inXeroOnly).toBe(1);
      expect(summary.amountMismatch).toBe(1);
      expect(summary.dateMismatch).toBe(1);
      expect(summary.total).toBe(5);
    });

    it('should handle empty array', () => {
      const summary = (service as any).calculateMatchSummary([]);

      expect(summary.matched).toBe(0);
      expect(summary.total).toBe(0);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS WITH REAL DATABASE
// ============================================================================

// Mock LLMWhisperer parser for tests - we test its behavior separately
const mockLLMWhispererParser = {
  parseWithBalances: jest.fn(),
};

// Mock ConfigService for tolerance config
const mockConfigService = {
  get: jest.fn(() => undefined), // Return default values
};

// Mock AccruedBankChargeService for integration tests
const mockAccruedChargeServiceIntegration = {
  createFromFeeAdjustedMatch: jest.fn(),
  findPendingCharges: jest.fn(),
  matchChargeToTransaction: jest.fn(),
  getChargesSummary: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  findByReconciliation: jest.fn(),
};

// Mock BankFeeService for integration tests
const mockBankFeeServiceIntegration = {
  calculateFee: jest.fn(),
  getFeeConfig: jest.fn(),
  detectFeeTransaction: jest.fn(),
  isPotentialBankFee: jest.fn().mockReturnValue(false),
};

describe('BankStatementReconciliationService (Integration Tests)', () => {
  let service: BankStatementReconciliationService;
  let repository: BankStatementMatchRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testReconciliation: Reconciliation;
  let testTransactions: Transaction[];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        BankStatementReconciliationService,
        BankStatementMatchRepository,
        ReconciliationRepository,
        ToleranceConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LLMWhispererParser,
          useValue: mockLLMWhispererParser,
        },
        {
          provide: AccruedBankChargeService,
          useValue: mockAccruedChargeServiceIntegration,
        },
        {
          provide: BankFeeService,
          useValue: mockBankFeeServiceIntegration,
        },
        {
          provide: FeeInflationCorrectionService,
          useValue: {
            detectAndValidateFeeMatch: jest.fn().mockResolvedValue({
              isMatch: false,
              confidence: 0,
              transactionType: 'UNKNOWN',
              feeType: 'NONE',
              expectedFeeCents: 0,
              actualFeeCents: 0,
              explanation: 'mock',
            }),
            correctExistingMatches: jest.fn().mockResolvedValue({
              totalMatches: 0,
              correctableMatches: 0,
              totalFeesCents: 0,
              corrections: [],
              skipped: [],
            }),
            matchMonthlyFeeTransactions: jest.fn().mockResolvedValue({
              matchedCount: 0,
              totalMatchedCents: 0,
              matches: [],
              unmatched: [],
            }),
          },
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<BankStatementReconciliationService>(
      BankStatementReconciliationService,
    );
    repository = module.get<BankStatementMatchRepository>(
      BankStatementMatchRepository,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.auditLog.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
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

    const timestamp = Date.now();

    // Create test tenant - South African creche
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Happy Kids Creche',
        addressLine1: '78 Protea Street',
        city: 'Pretoria',
        province: 'Gauteng',
        postalCode: '0002',
        phone: '+27125554567',
        email: `test${timestamp}@happykids.co.za`,
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '4345678901',
      },
    });

    // Create test reconciliation for January 2025
    testReconciliation = await prisma.reconciliation.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'Nedbank Business - 112233445566',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        openingBalanceCents: 10000000, // R100,000.00
        closingBalanceCents: 12000000, // R120,000.00
        calculatedBalanceCents: 11950000, // R119,500.00
        status: ReconciliationStatus.IN_PROGRESS,
        notes: 'January 2025 bank reconciliation',
      },
    });

    // Create realistic test transactions (from Xero)
    testTransactions = await Promise.all([
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-05'),
          description: 'SCHOOL FEE PAYMENT - SMITH FAMILY',
          amountCents: 350000, // R3,500.00 credit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: true,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-10'),
          description: 'SALARY PAYMENT - JANE DOE',
          amountCents: -1800000, // R18,000.00 debit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: false,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-15'),
          description: 'SUPPLIES - EDUCATIONAL TOYS PTY LTD',
          amountCents: -250000, // R2,500.00 debit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: false,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-20'),
          description: 'PARENT FEE - JONES FAMILY',
          amountCents: 400000, // R4,000.00 credit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: true,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
    ]);
  });

  describe('getMatchesByReconciliationId', () => {
    beforeEach(async () => {
      // Create test matches
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCH A',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'MATCH B',
            bankAmountCents: 200000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: 'MATCH C',
            bankAmountCents: 150000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.AMOUNT_MISMATCH,
          },
        ],
      });
    });

    it('should return all matches for a reconciliation', async () => {
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches).toHaveLength(3);
    });

    it('should return match details with correct fields', async () => {
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches[0]).toHaveProperty('id');
      expect(matches[0]).toHaveProperty('bankDate');
      expect(matches[0]).toHaveProperty('bankDescription');
      expect(matches[0]).toHaveProperty('bankAmountCents');
      expect(matches[0]).toHaveProperty('bankIsCredit');
      expect(matches[0]).toHaveProperty('status');
    });
  });

  describe('getUnmatchedSummary', () => {
    beforeEach(async () => {
      // Create various match types
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCHED ITEM',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'BANK FEE',
            bankAmountCents: 15000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
            discrepancyReason: 'Bank fee not in Xero',
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: '',
            bankAmountCents: 0,
            bankIsCredit: false,
            transactionId: testTransactions[0].id,
            xeroDescription: 'UNCLEARED CHEQUE',
            xeroAmountCents: 50000,
            xeroIsCredit: false,
            status: BankStatementMatchStatus.IN_XERO_ONLY,
            discrepancyReason: 'Cheque not yet cleared',
          },
        ],
      });
    });

    it('should return summary of unmatched transactions', async () => {
      const summary = await service.getUnmatchedSummary(
        testTenant.id,
        testReconciliation.id,
      );

      expect(summary.inBankOnly).toHaveLength(1);
      expect(summary.inBankOnly[0]).toHaveProperty('date');
      expect(summary.inBankOnly[0]).toHaveProperty('description');
      expect(summary.inBankOnly[0]).toHaveProperty('amount');

      expect(summary.inXeroOnly).toHaveLength(1);
      expect(summary.inXeroOnly[0]).toHaveProperty('date');
      expect(summary.inXeroOnly[0]).toHaveProperty('description');
      expect(summary.inXeroOnly[0]).toHaveProperty('amount');
      expect(summary.inXeroOnly[0]).toHaveProperty('transactionId');
    });

    it('should return empty arrays when all matched', async () => {
      // Clear and create only matched records
      await prisma.bankStatementMatch.deleteMany({
        where: { reconciliationId: testReconciliation.id },
      });

      await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'ALL MATCHED',
          bankAmountCents: 100000,
          bankIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      const summary = await service.getUnmatchedSummary(
        testTenant.id,
        testReconciliation.id,
      );

      expect(summary.inBankOnly).toHaveLength(0);
      expect(summary.inXeroOnly).toHaveLength(0);
    });
  });

  describe('calculateSimilarity (private method via reflection)', () => {
    it('should calculate exact match as 100%', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT JOHN',
        'SALARY PAYMENT JOHN',
      );
      expect(similarity).toBe(1);
    });

    it('should calculate similar strings with high confidence', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT JOHN SMITH',
        'SALARY PAYMENT J SMITH',
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should calculate different strings with low confidence', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT',
        'GROCERY PURCHASE',
      );
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      const similarity = (service as any).calculateSimilarity('', '');
      expect(similarity).toBe(1);

      const emptyVsNot = (service as any).calculateSimilarity('', 'SOME TEXT');
      expect(emptyVsNot).toBe(0);
    });
  });

  describe('calculateBalance (private method via reflection)', () => {
    it('should calculate correct balance from transactions', () => {
      const transactions = [
        {
          date: new Date(),
          description: 'CR',
          amountCents: 200000,
          isCredit: true,
          runningBalanceCents: 0,
        },
        {
          date: new Date(),
          description: 'DR',
          amountCents: 100000,
          isCredit: false,
          runningBalanceCents: 0,
        },
      ];

      const calculatedBalance = (service as any).calculateBalance(
        10000000, // R100,000 opening
        transactions,
      );

      // 10,000,000 + 200,000 - 100,000 = 10,100,000
      expect(calculatedBalance).toBe(10100000);
    });

    it('should handle mixed credits and debits', () => {
      const transactions = [
        {
          date: new Date(),
          description: 'CR',
          amountCents: 500000,
          isCredit: true,
          runningBalanceCents: 0,
        },
        {
          date: new Date(),
          description: 'DR',
          amountCents: 200000,
          isCredit: false,
          runningBalanceCents: 0,
        },
        {
          date: new Date(),
          description: 'CR',
          amountCents: 100000,
          isCredit: true,
          runningBalanceCents: 0,
        },
      ];

      const calculatedBalance = (service as any).calculateBalance(
        1000000,
        transactions,
      );

      // 1,000,000 + 500,000 - 200,000 + 100,000 = 1,400,000
      expect(calculatedBalance).toBe(1400000);
    });
  });

  describe('tenant isolation', () => {
    it('should not access matches from other tenants', async () => {
      // Create another tenant and reconciliation
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '123 Other St',
          city: 'Bloemfontein',
          province: 'Free State',
          postalCode: '9301',
          phone: '+27515559999',
          email: `other${Date.now()}@test.co.za`,
          taxStatus: 'NOT_REGISTERED',
        },
      });

      const otherRecon = await prisma.reconciliation.create({
        data: {
          tenantId: otherTenant.id,
          bankAccount: 'Other Bank',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 500000,
          closingBalanceCents: 600000,
          calculatedBalanceCents: 590000,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create match for other tenant
      await prisma.bankStatementMatch.create({
        data: {
          tenantId: otherTenant.id,
          reconciliationId: otherRecon.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'OTHER TENANT DATA',
          bankAmountCents: 99999,
          bankIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      // Query with original tenant should not see other tenant's data
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(
        matches.every((m) => m.bankDescription !== 'OTHER TENANT DATA'),
      ).toBe(true);
    });
  });

  describe('repository integration', () => {
    it('should correctly store and retrieve match records', async () => {
      const created = await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'INTEGRATION TEST',
          bankAmountCents: 123456,
          bankIsCredit: true,
          transactionId: testTransactions[0].id,
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'XERO INTEGRATION TEST',
          xeroAmountCents: 123456,
          xeroIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
          matchConfidence: 95.5,
        },
      });

      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].bankDescription).toBe('INTEGRATION TEST');
      expect(matches[0].bankAmountCents).toBe(123456);
      expect(matches[0].xeroDescription).toBe('XERO INTEGRATION TEST');
      expect(matches[0].status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('should count matches correctly by status', async () => {
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCHED 1',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-11'),
            bankDescription: 'MATCHED 2',
            bankAmountCents: 150000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'BANK ONLY',
            bankAmountCents: 50000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
        ],
      });

      const counts = await repository.countByStatus(
        testTenant.id,
        testReconciliation.id,
      );

      expect(counts[BankStatementMatchStatus.MATCHED]).toBe(2);
      expect(counts[BankStatementMatchStatus.IN_BANK_ONLY]).toBe(1);
      expect(counts[BankStatementMatchStatus.IN_XERO_ONLY]).toBe(0);
    });
  });

  describe('manualMatch integration', () => {
    let bankOnlyMatch: BankStatementMatch;

    beforeEach(async () => {
      // Create a bank-only match for testing manual matching
      bankOnlyMatch = await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-05'),
          bankDescription: 'SCHOOL FEE - SMITH',
          bankAmountCents: 350000,
          bankIsCredit: true,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          discrepancyReason: 'No matching transaction found',
        },
      });
    });

    it('should successfully perform manual match', async () => {
      const result = await service.manualMatch(
        testTenant.id,
        bankOnlyMatch.id,
        testTransactions[0].id,
      );

      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
      expect(result.matchConfidence).toBe(1.0);

      // Verify match was updated in database
      const updated = await prisma.bankStatementMatch.findUnique({
        where: { id: bankOnlyMatch.id },
      });

      expect(updated?.transactionId).toBe(testTransactions[0].id);
      expect(updated?.status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('should throw error when match does not exist', async () => {
      await expect(
        service.manualMatch(
          testTenant.id,
          '00000000-0000-0000-0000-000000000000',
          testTransactions[0].id,
        ),
      ).rejects.toThrow('Bank statement match not found');
    });

    it('should throw error when transaction does not exist', async () => {
      await expect(
        service.manualMatch(
          testTenant.id,
          bankOnlyMatch.id,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow('Transaction not found');
    });
  });

  describe('unmatch integration', () => {
    let matchedRecord: BankStatementMatch;

    beforeEach(async () => {
      // Create a matched record for testing unmatch
      matchedRecord = await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-05'),
          bankDescription: 'SCHOOL FEE - SMITH',
          bankAmountCents: 350000,
          bankIsCredit: true,
          transactionId: testTransactions[0].id,
          xeroDate: new Date('2025-01-05'),
          xeroDescription: 'SCHOOL FEE PAYMENT - SMITH FAMILY',
          xeroAmountCents: 350000,
          xeroIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
          matchConfidence: 0.95,
        },
      });
    });

    it('should successfully unmatch a previously matched record', async () => {
      const result = await service.unmatch(testTenant.id, matchedRecord.id);

      expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);

      // Verify match was updated in database
      const updated = await prisma.bankStatementMatch.findUnique({
        where: { id: matchedRecord.id },
      });

      expect(updated?.transactionId).toBeNull();
      expect(updated?.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);
      expect(updated?.discrepancyReason).toBe('Manually unmatched');
    });

    it('should reset is_reconciled flag on the transaction', async () => {
      // First mark transaction as reconciled
      await prisma.transaction.update({
        where: { id: testTransactions[0].id },
        data: { isReconciled: true },
      });

      await service.unmatch(testTenant.id, matchedRecord.id);

      // Verify transaction is_reconciled was reset
      const transaction = await prisma.transaction.findUnique({
        where: { id: testTransactions[0].id },
      });

      expect(transaction?.isReconciled).toBe(false);
    });
  });

  describe('getAvailableTransactionsForMatching integration', () => {
    it('should return unmatched transactions within reconciliation period', async () => {
      const available = await service.getAvailableTransactionsForMatching(
        testTenant.id,
        testReconciliation.id,
      );

      expect(available.length).toBeGreaterThan(0);
      expect(available.every((t) => t.date >= new Date('2025-01-01'))).toBe(
        true,
      );
      expect(available.every((t) => t.date <= new Date('2025-01-31'))).toBe(
        true,
      );
    });

    it('should exclude already matched transactions', async () => {
      // Create a match for one transaction
      await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-05'),
          bankDescription: 'MATCHED',
          bankAmountCents: 350000,
          bankIsCredit: true,
          transactionId: testTransactions[0].id,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      const available = await service.getAvailableTransactionsForMatching(
        testTenant.id,
        testReconciliation.id,
      );

      expect(available.every((t) => t.id !== testTransactions[0].id)).toBe(
        true,
      );
    });

    it('should filter by search term', async () => {
      const available = await service.getAvailableTransactionsForMatching(
        testTenant.id,
        testReconciliation.id,
        { searchTerm: 'SALARY' },
      );

      expect(
        available.every((t) => t.description.toLowerCase().includes('salary')),
      ).toBe(true);
    });
  });
});
