/**
 * Correction Conflict Service Tests
 * TASK-EC-002: Conflicting Correction Resolution
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  CorrectionConflictService,
  CorrectionConflict,
} from '../correction-conflict.service';
import { TransactionRepository } from '../../repositories/transaction.repository';
import { PayeePatternRepository } from '../../repositories/payee-pattern.repository';
import { CategorizationRepository } from '../../repositories/categorization.repository';
import { Transaction, PayeePattern, Categorization } from '@prisma/client';

describe('CorrectionConflictService', () => {
  let service: CorrectionConflictService;
  let transactionRepo: jest.Mocked<TransactionRepository>;
  let patternRepo: jest.Mocked<PayeePatternRepository>;
  let categorizationRepo: jest.Mocked<CategorizationRepository>;

  const mockTenantId = 'tenant-123';
  const mockPayee = 'WOOLWORTHS';
  const mockTransactionId = 'tx-001';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorrectionConflictService,
        {
          provide: TransactionRepository,
          useValue: {
            findByIds: jest.fn(),
          },
        },
        {
          provide: PayeePatternRepository,
          useValue: {
            findByPayeeName: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: CategorizationRepository,
          useValue: {
            findByTenant: jest.fn(),
            findByTransaction: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CorrectionConflictService>(CorrectionConflictService);
    transactionRepo = module.get(TransactionRepository);
    patternRepo = module.get(PayeePatternRepository);
    categorizationRepo = module.get(CategorizationRepository);
  });

  describe('detectConflict', () => {
    it('should return null when no existing pattern exists', async () => {
      patternRepo.findByPayeeName.mockResolvedValue(null);

      const result = await service.detectConflict(
        mockTenantId,
        mockPayee,
        '500',
        'Groceries',
      );

      expect(result).toBeNull();
      expect(patternRepo.findByPayeeName).toHaveBeenCalledWith(
        mockTenantId,
        mockPayee,
      );
    });

    it('should return null when new category matches existing pattern', async () => {
      const mockPattern: PayeePattern = {
        id: 'pattern-1',
        tenantId: mockTenantId,
        payeePattern: mockPayee,
        payeeAliases: [],
        defaultAccountCode: '500',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        matchCount: 5,
        isRecurring: false,
        expectedAmountCents: null,
        amountVariancePercent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      patternRepo.findByPayeeName.mockResolvedValue(mockPattern);

      const result = await service.detectConflict(
        mockTenantId,
        mockPayee,
        '500',
        'Groceries',
      );

      expect(result).toBeNull();
    });

    it('should detect conflict when category differs from existing pattern', async () => {
      const mockPattern: PayeePattern = {
        id: 'pattern-1',
        tenantId: mockTenantId,
        payeePattern: mockPayee,
        payeeAliases: [],
        defaultAccountCode: '500',
        defaultAccountName: 'Groceries',
        confidenceBoost: 10,
        matchCount: 5,
        isRecurring: false,
        expectedAmountCents: null,
        amountVariancePercent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockCategorizations: Categorization[] = [
        {
          id: 'cat-1',
          tenantId: mockTenantId,
          transactionId: 'tx-1',
          accountCode: '500',
          accountName: 'Groceries',
          isConfirmed: false,
          confidence: 0.85,
          reasoning: null,
          alternatives: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'cat-2',
          tenantId: mockTenantId,
          transactionId: 'tx-2',
          accountCode: '500',
          accountName: 'Groceries',
          isConfirmed: false,
          confidence: 0.9,
          reasoning: null,
          alternatives: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockTransactions: Transaction[] = [
        {
          id: 'tx-1',
          tenantId: mockTenantId,
          xeroTransactionId: null,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-15'),
          description: 'WOOLWORTHS CAPE TOWN',
          payeeName: 'WOOLWORTHS',
          reference: null,
          amountCents: 15000,
          isCredit: false,
          source: 'CSV_IMPORT',
          importBatchId: 'batch-1',
          status: 'CATEGORIZED',
          isReconciled: false,
          reconciledAt: null,
          isDeleted: false,
          deletedAt: null,
          reversesTransactionId: null,
          isReversal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tx-2',
          tenantId: mockTenantId,
          xeroTransactionId: null,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-20'),
          description: 'WOOLWORTHS SANDTON',
          payeeName: 'WOOLWORTHS',
          reference: null,
          amountCents: 22000,
          isCredit: false,
          source: 'CSV_IMPORT',
          importBatchId: 'batch-1',
          status: 'CATEGORIZED',
          isReconciled: false,
          reconciledAt: null,
          isDeleted: false,
          deletedAt: null,
          reversesTransactionId: null,
          isReversal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      patternRepo.findByPayeeName.mockResolvedValue(mockPattern);
      categorizationRepo.findByTenant.mockResolvedValue(mockCategorizations);
      transactionRepo.findByIds.mockResolvedValue(mockTransactions);

      const result = await service.detectConflict(
        mockTenantId,
        mockPayee,
        '400',
        'Clothing',
      );

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        payee: mockPayee,
        existingCategory: 'Groceries',
        existingCategoryCode: '500',
        newCategory: 'Clothing',
        newCategoryCode: '400',
        existingTransactionCount: 2,
        patternId: 'pattern-1',
      });
      expect(result!.affectedTransactionIds).toHaveLength(2);
    });
  });

  describe('resolveConflict - update_all', () => {
    it('should update pattern and all affected transactions', async () => {
      const conflict: CorrectionConflict = {
        payee: mockPayee,
        existingCategory: 'Groceries',
        existingCategoryCode: '500',
        newCategory: 'Clothing',
        newCategoryCode: '400',
        existingTransactionCount: 2,
        affectedTransactionIds: ['tx-1', 'tx-2'],
        patternId: 'pattern-1',
      };

      const mockCategorization: Categorization = {
        id: 'cat-1',
        tenantId: mockTenantId,
        transactionId: 'tx-1',
        accountCode: '500',
        accountName: 'Groceries',
        isConfirmed: false,
        confidence: 0.85,
        reasoning: null,
        alternatives: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      categorizationRepo.findByTransaction.mockResolvedValue(
        mockCategorization,
      );
      categorizationRepo.update.mockResolvedValue({
        ...mockCategorization,
        accountCode: '400',
        accountName: 'Clothing',
      });

      await service.resolveConflict(
        mockTenantId,
        'tx-1',
        { type: 'update_all' },
        conflict,
      );

      // Verify pattern was updated
      expect(patternRepo.update).toHaveBeenCalledWith('pattern-1', {
        defaultAccountCode: '400',
        defaultAccountName: 'Clothing',
      });

      // Verify all transactions were updated
      expect(categorizationRepo.findByTransaction).toHaveBeenCalledTimes(2);
      expect(categorizationRepo.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveConflict - just_this_one', () => {
    it('should update only the triggering transaction, leaving pattern unchanged', async () => {
      const conflict: CorrectionConflict = {
        payee: mockPayee,
        existingCategory: 'Groceries',
        existingCategoryCode: '500',
        newCategory: 'Clothing',
        newCategoryCode: '400',
        existingTransactionCount: 2,
        affectedTransactionIds: ['tx-1', 'tx-2'],
        patternId: 'pattern-1',
      };

      const mockCategorization: Categorization = {
        id: 'cat-1',
        tenantId: mockTenantId,
        transactionId: mockTransactionId,
        accountCode: '500',
        accountName: 'Groceries',
        isConfirmed: false,
        confidence: 0.85,
        reasoning: null,
        alternatives: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      categorizationRepo.findByTransaction.mockResolvedValue(
        mockCategorization,
      );
      categorizationRepo.update.mockResolvedValue({
        ...mockCategorization,
        accountCode: '400',
        accountName: 'Clothing',
        isConfirmed: true,
      });

      await service.resolveConflict(
        mockTenantId,
        mockTransactionId,
        { type: 'just_this_one' },
        conflict,
      );

      // Verify pattern was NOT updated
      expect(patternRepo.update).not.toHaveBeenCalled();

      // Verify only the single transaction was updated
      expect(categorizationRepo.findByTransaction).toHaveBeenCalledTimes(1);
      expect(categorizationRepo.findByTransaction).toHaveBeenCalledWith(
        mockTenantId,
        mockTransactionId,
      );
      expect(categorizationRepo.update).toHaveBeenCalledWith('cat-1', {
        accountCode: '400',
        accountName: 'Clothing',
        isConfirmed: true,
      });
    });
  });

  describe('getAffectedTransactions', () => {
    it('should return transactions matching payee and category', async () => {
      const mockCategorizations: Categorization[] = [
        {
          id: 'cat-1',
          tenantId: mockTenantId,
          transactionId: 'tx-1',
          accountCode: '500',
          accountName: 'Groceries',
          isConfirmed: false,
          confidence: 0.85,
          reasoning: null,
          alternatives: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'cat-2',
          tenantId: mockTenantId,
          transactionId: 'tx-2',
          accountCode: '500',
          accountName: 'Groceries',
          isConfirmed: false,
          confidence: 0.9,
          reasoning: null,
          alternatives: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'cat-3',
          tenantId: mockTenantId,
          transactionId: 'tx-3',
          accountCode: '500',
          accountName: 'Groceries',
          isConfirmed: false,
          confidence: 0.8,
          reasoning: null,
          alternatives: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockTransactions: Transaction[] = [
        {
          id: 'tx-1',
          tenantId: mockTenantId,
          xeroTransactionId: null,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-15'),
          description: 'WOOLWORTHS CAPE TOWN',
          payeeName: 'WOOLWORTHS',
          reference: null,
          amountCents: 15000,
          isCredit: false,
          source: 'CSV_IMPORT',
          importBatchId: 'batch-1',
          status: 'CATEGORIZED',
          isReconciled: false,
          reconciledAt: null,
          isDeleted: false,
          deletedAt: null,
          reversesTransactionId: null,
          isReversal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tx-2',
          tenantId: mockTenantId,
          xeroTransactionId: null,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-20'),
          description: 'WOOLWORTHS SANDTON',
          payeeName: 'WOOLWORTHS',
          reference: null,
          amountCents: 22000,
          isCredit: false,
          source: 'CSV_IMPORT',
          importBatchId: 'batch-1',
          status: 'CATEGORIZED',
          isReconciled: false,
          reconciledAt: null,
          isDeleted: false,
          deletedAt: null,
          reversesTransactionId: null,
          isReversal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'tx-3',
          tenantId: mockTenantId,
          xeroTransactionId: null,
          bankAccount: 'ACC-001',
          date: new Date('2024-01-25'),
          description: 'CHECKERS CENTURION',
          payeeName: 'CHECKERS',
          reference: null,
          amountCents: 18000,
          isCredit: false,
          source: 'CSV_IMPORT',
          importBatchId: 'batch-1',
          status: 'CATEGORIZED',
          isReconciled: false,
          reconciledAt: null,
          isDeleted: false,
          deletedAt: null,
          reversesTransactionId: null,
          isReversal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      categorizationRepo.findByTenant.mockResolvedValue(mockCategorizations);
      transactionRepo.findByIds.mockResolvedValue(mockTransactions);

      const result = await service.getAffectedTransactions(
        mockTenantId,
        'WOOLWORTHS',
        '500',
      );

      expect(result).toHaveLength(2); // Only tx-1 and tx-2 (WOOLWORTHS)
      expect(result.map((t) => t.id)).toEqual(['tx-1', 'tx-2']);
    });

    it('should return empty array when no categorizations found', async () => {
      categorizationRepo.findByTenant.mockResolvedValue([]);

      const result = await service.getAffectedTransactions(
        mockTenantId,
        'UNKNOWN_PAYEE',
        '500',
      );

      expect(result).toEqual([]);
    });
  });
});
