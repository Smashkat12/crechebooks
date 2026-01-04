/**
 * Recurring Detection Service Tests
 * TASK-TRANS-019: Recurring Transaction Detection Integration
 *
 * @module database/services/__tests__/recurring-detection
 * @description Tests for recurring transaction detection and pattern matching.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RecurringDetectionService } from '../recurring-detection.service';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { PayeePatternRepository } from '../../repositories/payee-pattern.repository';
import { Transaction, PayeePattern } from '@prisma/client';
import {
  ImportSource,
  TransactionStatus,
} from '../../entities/transaction.entity';
import { NotFoundException } from '../../../shared/exceptions';
import { VatType } from '../../entities/categorization.entity';

describe('RecurringDetectionService', () => {
  let service: RecurringDetectionService;
  let transactionRepo: jest.Mocked<TransactionRepository>;
  let payeePatternRepo: jest.Mocked<PayeePatternRepository>;

  const TENANT_ID = 'tenant-123';
  const PATTERN_ID = 'pattern-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringDetectionService,
        {
          provide: TransactionRepository,
          useValue: {
            findByTenant: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: PayeePatternRepository,
          useValue: {
            findByPayeeName: jest.fn(),
            findByTenant: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            incrementMatchCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RecurringDetectionService>(RecurringDetectionService);
    transactionRepo = module.get(TransactionRepository);
    payeePatternRepo = module.get(PayeePatternRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectRecurring', () => {
    it('should detect monthly recurring pattern with 3+ occurrences', async () => {
      // Arrange: Create 3 monthly transactions (30 days apart)
      const baseDate = new Date('2024-01-15');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'NETFLIX', 9900),
        createTransaction('tx-2', addDays(baseDate, 30), 'NETFLIX', 9900),
        createTransaction('tx-3', addDays(baseDate, 60), 'NETFLIX', 9900),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 3,
        page: 0,
        pageSize: 100,
      });

      const existingPattern: Partial<PayeePattern> = {
        id: PATTERN_ID,
        tenantId: TENANT_ID,
        payeePattern: 'NETFLIX',
        defaultAccountCode: '5400',
        defaultAccountName: 'Subscriptions',
        confidenceBoost: 10,
        isRecurring: true,
        matchCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      const testTransaction = transactions[2] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.frequency).toBe('MONTHLY');
      expect(result?.confidence).toBeGreaterThanOrEqual(80);
      expect(result?.suggestedAccountCode).toBe('5400');
      expect(result?.suggestedAccountName).toBe('Subscriptions');
      expect(result?.intervalDays).toBe(30);
    });

    it('should detect weekly recurring pattern', async () => {
      // Arrange: Create 4 weekly transactions (7 days apart)
      const baseDate = new Date('2024-01-01');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'GYM MEMBERSHIP', 5000),
        createTransaction('tx-2', addDays(baseDate, 7), 'GYM MEMBERSHIP', 5000),
        createTransaction(
          'tx-3',
          addDays(baseDate, 14),
          'GYM MEMBERSHIP',
          5000,
        ),
        createTransaction(
          'tx-4',
          addDays(baseDate, 21),
          'GYM MEMBERSHIP',
          5000,
        ),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 4,
        page: 0,
        pageSize: 100,
      });

      const existingPattern: Partial<PayeePattern> = {
        id: PATTERN_ID,
        tenantId: TENANT_ID,
        payeePattern: 'GYM MEMBERSHIP',
        defaultAccountCode: '5500',
        defaultAccountName: 'Fitness',
        confidenceBoost: 10,
        isRecurring: true,
        matchCount: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      const testTransaction = transactions[3] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.frequency).toBe('WEEKLY');
      expect(result?.confidence).toBeGreaterThanOrEqual(80);
      expect(result?.intervalDays).toBe(7);
    });

    it('should detect bi-weekly recurring pattern', async () => {
      // Arrange: Create 3 bi-weekly transactions (14 days apart)
      const baseDate = new Date('2024-01-01');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'INSURANCE', 25000),
        createTransaction('tx-2', addDays(baseDate, 14), 'INSURANCE', 25000),
        createTransaction('tx-3', addDays(baseDate, 28), 'INSURANCE', 25000),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 3,
        page: 0,
        pageSize: 100,
      });

      const existingPattern: Partial<PayeePattern> = {
        id: PATTERN_ID,
        tenantId: TENANT_ID,
        payeePattern: 'INSURANCE',
        defaultAccountCode: '5600',
        defaultAccountName: 'Insurance',
        confidenceBoost: 10,
        isRecurring: true,
        matchCount: 6,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      const testTransaction = transactions[2] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.frequency).toBe('BI_WEEKLY');
      expect(result?.confidence).toBeGreaterThanOrEqual(80);
      expect(result?.intervalDays).toBe(14);
    });

    it('should return null for non-recurring transactions', async () => {
      // Arrange: Only 2 transactions (below minimum)
      const baseDate = new Date('2024-01-15');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'RANDOM STORE', 5000),
        createTransaction('tx-2', addDays(baseDate, 45), 'RANDOM STORE', 7500),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 2,
        page: 0,
        pageSize: 100,
      });

      const testTransaction = transactions[1] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if no payee name', async () => {
      // Arrange
      const transaction: Partial<Transaction> = {
        id: 'tx-1',
        tenantId: TENANT_ID,
        payeeName: null,
        description: 'NO PAYEE',
        amountCents: 10000,
        date: new Date(),
        isCredit: false,
        bankAccount: 'ACC-001',
        source: ImportSource.CSV_IMPORT,
        status: TransactionStatus.PENDING,
        isReconciled: false,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Act
      const result = await service.detectRecurring(
        TENANT_ID,
        transaction as Transaction,
      );

      // Assert
      expect(result).toBeNull();
      expect(transactionRepo.findByTenant).not.toHaveBeenCalled();
    });

    it('should respect interval variance tolerances', async () => {
      // Arrange: Monthly transactions with variance outside tolerance
      const baseDate = new Date('2024-01-15');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'INCONSISTENT', 10000),
        createTransaction('tx-2', addDays(baseDate, 25), 'INCONSISTENT', 10000), // 25 days (outside ±3 tolerance)
        createTransaction('tx-3', addDays(baseDate, 55), 'INCONSISTENT', 10000), // 30 days
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 3,
        page: 0,
        pageSize: 100,
      });

      const testTransaction = transactions[2] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).toBeNull(); // Should not detect due to inconsistent intervals
    });

    it('should return null if no existing pattern with account code', async () => {
      // Arrange
      const baseDate = new Date('2024-01-15');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'NEW PAYEE', 10000),
        createTransaction('tx-2', addDays(baseDate, 30), 'NEW PAYEE', 10000),
        createTransaction('tx-3', addDays(baseDate, 60), 'NEW PAYEE', 10000),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 3,
        page: 0,
        pageSize: 100,
      });

      payeePatternRepo.findByPayeeName.mockResolvedValue(null);

      const testTransaction = transactions[2] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getRecurringPatterns', () => {
    it('should return all recurring patterns for tenant', async () => {
      // Arrange
      const patterns: Partial<PayeePattern>[] = [
        {
          id: 'pattern-1',
          tenantId: TENANT_ID,
          payeePattern: 'NETFLIX',
          defaultAccountCode: '5400',
          defaultAccountName: 'Subscriptions',
          isRecurring: true,
          expectedAmountCents: 9900,
          amountVariancePercent: 5,
          confidenceBoost: 10,
          matchCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'pattern-2',
          tenantId: TENANT_ID,
          payeePattern: 'GYM',
          defaultAccountCode: '5500',
          defaultAccountName: 'Fitness',
          isRecurring: true,
          expectedAmountCents: 50000,
          amountVariancePercent: 10,
          confidenceBoost: 12,
          matchCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      payeePatternRepo.findByTenant.mockResolvedValue(
        patterns as PayeePattern[],
      );

      // Act
      const result = await service.getRecurringPatterns(TENANT_ID);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].payeePattern).toBe('NETFLIX');
      expect(result[1].payeePattern).toBe('GYM');
      expect(payeePatternRepo.findByTenant).toHaveBeenCalledWith(TENANT_ID, {
        isRecurring: true,
      });
    });
  });

  describe('createPattern', () => {
    it('should create manual recurring pattern', async () => {
      // Arrange
      const dto = {
        payeeName: 'NEW SUBSCRIPTION',
        frequency: 'MONTHLY' as const,
        expectedAmountCents: 15000,
        amountVariancePercent: 10,
        accountCode: '5400',
        accountName: 'Subscriptions',
      };

      payeePatternRepo.findByPayeeName.mockResolvedValue(null);

      const createdPattern: Partial<PayeePattern> = {
        id: 'new-pattern-id',
        tenantId: TENANT_ID,
        payeePattern: 'NEW SUBSCRIPTION',
        defaultAccountCode: '5400',
        defaultAccountName: 'Subscriptions',
        isRecurring: true,
        expectedAmountCents: 15000,
        amountVariancePercent: 10,
        confidenceBoost: 10,
        matchCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.create.mockResolvedValue(createdPattern as PayeePattern);

      // Act
      const result = await service.createPattern(TENANT_ID, dto);

      // Assert
      expect(result.payeePattern).toBe('NEW SUBSCRIPTION');
      expect(result.frequency).toBe('MONTHLY');
      expect(result.expectedAmountCents).toBe(15000);
      expect(payeePatternRepo.create).toHaveBeenCalled();
    });

    it('should update existing pattern', async () => {
      // Arrange
      const dto = {
        payeeName: 'EXISTING PAYEE',
        frequency: 'WEEKLY' as const,
        expectedAmountCents: 5000,
        amountVariancePercent: 5,
        accountCode: '5500',
        accountName: 'Updated Account',
      };

      const existingPattern: Partial<PayeePattern> = {
        id: 'existing-id',
        tenantId: TENANT_ID,
        payeePattern: 'EXISTING PAYEE',
        defaultAccountCode: '5400',
        defaultAccountName: 'Old Account',
        isRecurring: false,
        matchCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      const updatedPattern: Partial<PayeePattern> = {
        ...existingPattern,
        isRecurring: true,
        expectedAmountCents: 5000,
        amountVariancePercent: 5,
        defaultAccountCode: '5500',
        defaultAccountName: 'Updated Account',
      };
      payeePatternRepo.update.mockResolvedValue(updatedPattern as PayeePattern);

      // Act
      const result = await service.createPattern(TENANT_ID, dto);

      // Assert
      expect(result.payeePattern).toBe('EXISTING PAYEE');
      expect(result.isActive).toBe(true);
      expect(payeePatternRepo.update).toHaveBeenCalledWith('existing-id', {
        isRecurring: true,
        expectedAmountCents: 5000,
        amountVariancePercent: 5,
        defaultAccountCode: '5500',
        defaultAccountName: 'Updated Account',
      });
    });
  });

  describe('applyRecurringCategory', () => {
    it('should apply category to transaction', async () => {
      // Arrange
      const transactionId = 'tx-apply';
      const transaction = createTransaction(
        transactionId,
        new Date(),
        'NETFLIX',
        9900,
      );

      transactionRepo.findById.mockResolvedValue(transaction as Transaction);

      const baseDate = new Date('2024-01-15');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'NETFLIX', 9900),
        createTransaction('tx-2', addDays(baseDate, 30), 'NETFLIX', 9900),
        createTransaction('tx-3', addDays(baseDate, 60), 'NETFLIX', 9900),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 3,
        page: 0,
        pageSize: 100,
      });

      const existingPattern: Partial<PayeePattern> = {
        id: PATTERN_ID,
        tenantId: TENANT_ID,
        payeePattern: 'NETFLIX',
        defaultAccountCode: '5400',
        defaultAccountName: 'Subscriptions',
        confidenceBoost: 10,
        isRecurring: true,
        matchCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      // Act
      await service.applyRecurringCategory(TENANT_ID, transactionId);

      // Assert
      expect(payeePatternRepo.incrementMatchCount).toHaveBeenCalledWith(
        PATTERN_ID,
      );
    });

    it('should throw NotFoundException if transaction not found', async () => {
      // Arrange
      transactionRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.applyRecurringCategory(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confidence thresholds', () => {
    it('should calculate confidence >= 80% for auto-apply', async () => {
      // Arrange: Perfect recurring pattern (4 occurrences, exact intervals)
      const baseDate = new Date('2024-01-01');
      const transactions: Partial<Transaction>[] = [
        createTransaction('tx-1', baseDate, 'PERFECT', 10000),
        createTransaction('tx-2', addDays(baseDate, 30), 'PERFECT', 10000),
        createTransaction('tx-3', addDays(baseDate, 60), 'PERFECT', 10000),
        createTransaction('tx-4', addDays(baseDate, 90), 'PERFECT', 10000),
      ];

      transactionRepo.findByTenant.mockResolvedValue({
        data: transactions as Transaction[],
        total: 4,
        page: 0,
        pageSize: 100,
      });

      const existingPattern: Partial<PayeePattern> = {
        id: PATTERN_ID,
        tenantId: TENANT_ID,
        payeePattern: 'PERFECT',
        defaultAccountCode: '5400',
        defaultAccountName: 'Test',
        confidenceBoost: 10,
        isRecurring: true,
        matchCount: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      payeePatternRepo.findByPayeeName.mockResolvedValue(
        existingPattern as PayeePattern,
      );

      const testTransaction = transactions[3] as Transaction;

      // Act
      const result = await service.detectRecurring(TENANT_ID, testTransaction);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeGreaterThanOrEqual(80);
    });
  });

  describe('tenant isolation', () => {
    it('should enforce tenant isolation', async () => {
      // Arrange
      const transaction = createTransaction(
        'tx-1',
        new Date(),
        'NETFLIX',
        9900,
      );

      transactionRepo.findByTenant.mockResolvedValue({
        data: [],
        total: 0,
        page: 0,
        pageSize: 100,
      });

      // Act
      await service.detectRecurring(TENANT_ID, transaction as Transaction);

      // Assert
      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(Object),
      );
      expect(payeePatternRepo.findByPayeeName).not.toHaveBeenCalled();
    });
  });

  // Helper functions
  function createTransaction(
    id: string,
    date: Date,
    payeeName: string,
    amountCents: number,
  ): Partial<Transaction> {
    return {
      id,
      tenantId: TENANT_ID,
      payeeName,
      description: `Payment to ${payeeName}`,
      amountCents,
      date,
      isCredit: false,
      bankAccount: 'ACC-001',
      source: ImportSource.CSV_IMPORT,
      status: TransactionStatus.PENDING,
      isReconciled: false,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
});
