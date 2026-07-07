/**
 * Amount Variation Service Tests
 * TASK-EC-003: Recurring Amount Variation Threshold Configuration
 *
 * @module database/services/__tests__/amount-variation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { AmountVariationService } from '../amount-variation.service';
import { TransactionRepository } from '../../repositories/transaction.repository';
import {
  Transaction,
  ImportSource,
  TransactionStatus,
  DuplicateStatus,
} from '@prisma/client';

describe('AmountVariationService', () => {
  let service: AmountVariationService;
  let transactionRepo: jest.Mocked<TransactionRepository>;

  const TENANT_ID = 'test-tenant-123';
  const PAYEE_NAME = 'ESKOM';

  beforeEach(async () => {
    const mockTransactionRepo = {
      findByTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmountVariationService,
        {
          provide: TransactionRepository,
          useValue: mockTransactionRepo,
        },
      ],
    }).compile();

    service = module.get<AmountVariationService>(AmountVariationService);
    transactionRepo = module.get(TransactionRepository);
  });

  describe('analyzeVariation', () => {
    it('should return null when insufficient historical data', async () => {
      // Only 2 transactions (need 3 minimum)
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions([500000, 520000])),
      );

      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(510000),
      );

      expect(result).toBeNull();
    });

    it('should calculate correct statistics for consistent amounts', async () => {
      // 5 transactions with very similar amounts (R500 +/- R10)
      const amounts = [500000, 495000, 505000, 498000, 502000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(500000),
      );

      expect(result).not.toBeNull();
      expect(result!.historicalMean.toNumber()).toBeCloseTo(500000, -2);
      expect(result!.percentageVariation).toBeLessThan(1);
      expect(result!.exceedsThreshold).toBe(false);
      expect(result!.recommendedAction).toBe('auto_categorize');
    });

    it('should detect 50% variance and recommend flag_review', async () => {
      // Historical: R500 average with wide spread (stdDev ~71k)
      // Mean = 500k, StdDev = 70711
      const amounts = [500000, 400000, 600000, 450000, 550000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      // Current: R660 (32% increase)
      // z-score = (660k - 500k) / 70711 = 2.26 (< 3)
      // percentage = 32% (> 30% threshold)
      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(660000),
      );

      expect(result).not.toBeNull();
      expect(result!.percentageVariation).toBeGreaterThan(30);
      expect(result!.percentageVariation).toBeLessThan(100);
      expect(result!.exceedsThreshold).toBe(true);
      expect(Math.abs(result!.zScore)).toBeLessThan(3); // Ensure z-score < 3
      // Should be flag_review because variance > 30% but < 100% AND z-score < 3
      expect(result!.recommendedAction).toBe('flag_review');
    });

    it('should detect 100%+ variance and recommend block', async () => {
      // Historical: R500 average
      const amounts = [500000, 490000, 510000, 495000, 505000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      // Current: R1200 (>100% increase)
      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(1200000),
      );

      expect(result).not.toBeNull();
      expect(result!.percentageVariation).toBeGreaterThan(100);
      expect(result!.exceedsThreshold).toBe(true);
      expect(result!.recommendedAction).toBe('block');
    });

    it('should calculate correct z-score for anomaly detection', async () => {
      // Mean: 500000, StdDev: ~10000
      const amounts = [500000, 490000, 510000, 495000, 505000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      // Current: 530000 (3 standard deviations away)
      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(530000),
      );

      expect(result).not.toBeNull();
      expect(Math.abs(result!.zScore)).toBeGreaterThan(2);
      expect(result!.thresholdType).toBe('percentage');
      expect(result!.thresholdValue).toBe(30);
    });

    it('should handle negative amounts correctly', async () => {
      // Credits (negative amounts)
      const amounts = [-500000, -490000, -510000, -495000, -505000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      const result = await service.analyzeVariation(
        TENANT_ID,
        PAYEE_NAME,
        new Decimal(-520000),
      );

      expect(result).not.toBeNull();
      expect(result!.percentageVariation).toBeLessThan(10);
      expect(result!.recommendedAction).toBe('auto_categorize');
    });

    it('should filter to exact payee matches (case-insensitive)', async () => {
      const allTransactions = [
        ...createTransactions([500000], 'ESKOM'),
        ...createTransactions([600000], 'Eskom Power'), // Different payee
        ...createTransactions([510000, 505000], 'eskom'), // Same payee, different case
      ];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(allTransactions),
      );

      const result = await service.analyzeVariation(
        TENANT_ID,
        'Eskom', // Mixed case
        new Decimal(500000),
      );

      expect(result).not.toBeNull();
      // Should only use 3 "ESKOM" transactions (500k, 510k, 505k)
      expect(result!.historicalMean.toNumber()).toBeCloseTo(505000, -2);
    });
  });

  describe('getPayeeStatistics', () => {
    it('should return null when insufficient data', async () => {
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions([500000, 510000])), // Only 2
      );

      const stats = await service.getPayeeStatistics(TENANT_ID, PAYEE_NAME);

      expect(stats).toBeNull();
    });

    it('should calculate correct statistics', async () => {
      const amounts = [500000, 490000, 510000, 495000, 505000];
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      const stats = await service.getPayeeStatistics(TENANT_ID, PAYEE_NAME);

      expect(stats).not.toBeNull();
      expect(stats!.transactionCount).toBe(5);
      expect(stats!.meanAmountCents).toBeCloseTo(500000, -2);
      expect(stats!.stdDevAmountCents).toBeGreaterThan(0);
      expect(stats!.minAmountCents).toBe(490000);
      expect(stats!.maxAmountCents).toBe(510000);
    });

    it('should handle single large outlier', async () => {
      const amounts = [500000, 495000, 505000, 1000000]; // One outlier
      transactionRepo.findByTenant.mockResolvedValue(
        createPaginatedResult(createTransactions(amounts)),
      );

      const stats = await service.getPayeeStatistics(TENANT_ID, PAYEE_NAME);

      expect(stats).not.toBeNull();
      expect(stats!.stdDevAmountCents).toBeGreaterThan(200000);
      expect(stats!.maxAmountCents).toBe(1000000);
    });
  });

  /**
   * Helper: Create mock transactions with given amounts
   */
  function createTransactions(
    amounts: number[],
    payeeName = PAYEE_NAME,
  ): Transaction[] {
    return amounts.map((amountCents, idx) => ({
      id: `txn-${idx}`,
      tenantId: TENANT_ID,
      xeroTransactionId: null,
      bankAccount: 'ACC-001',
      date: new Date(2024, 0, idx + 1),
      description: 'Test transaction',
      payeeName,
      reference: null,
      amountCents,
      isCredit: amountCents < 0,
      source: ImportSource.CSV_IMPORT,
      importBatchId: null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * Helper: Create paginated result with all required fields
   */
  function createPaginatedResult(transactions: Transaction[]) {
    return {
      data: transactions,
      total: transactions.length,
      page: 1,
      limit: 100,
      totalPages: 1,
    };
  }
});
