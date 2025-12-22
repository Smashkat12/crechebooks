import { Test, TestingModule } from '@nestjs/testing';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { TransactionImportService } from '../../../src/database/services/transaction-import.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { Transaction } from '@prisma/client';
import type {
  CategorizationBatchResult,
  CategorizationItemResult,
  CategorySuggestion,
} from '../../../src/database/dto/categorization-service.dto';
import { CategorizationSource } from '../../../src/database/entities/categorization.entity';
import { VatTypeApiEnum } from '../../../src/api/transaction/dto/update-categorization.dto';

describe('TransactionController Categorization Endpoints', () => {
  let controller: TransactionController;
  let categorizationService: jest.Mocked<CategorizationService>;
  let transactionRepo: jest.Mocked<TransactionRepository>;

  const mockUser: IUser = {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction: Transaction = {
    id: 'tx-001',
    tenantId: 'tenant-001',
    xeroTransactionId: null,
    bankAccount: 'fnb-001',
    date: new Date('2025-01-15'),
    description: 'WOOLWORTHS FOOD',
    payeeName: 'Woolworths',
    reference: 'WW123',
    amountCents: 15000,
    isCredit: false,
    source: 'CSV_IMPORT',
    importBatchId: 'batch-001',
    status: 'CATEGORIZED',
    isReconciled: false,
    reconciledAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockCategorizationService = {
      updateCategorization: jest.fn(),
      categorizeTransactions: jest.fn(),
      getSuggestions: jest.fn(),
    };

    const mockTransactionRepo = {
      findByTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionRepository, useValue: mockTransactionRepo },
        { provide: CategorizationRepository, useValue: {} },
        { provide: TransactionImportService, useValue: {} },
        { provide: CategorizationService, useValue: mockCategorizationService },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    categorizationService = module.get(CategorizationService);
    transactionRepo = module.get(TransactionRepository);
  });

  describe('PUT /:id/categorize', () => {
    it('should update categorization with manual override', async () => {
      categorizationService.updateCategorization.mockResolvedValue(
        mockTransaction,
      );

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: false,
          vat_type: VatTypeApiEnum.STANDARD,
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.account_code).toBe('5100');
      expect(result.data.source).toBe('USER_OVERRIDE');
      expect(result.data.pattern_created).toBe(true);
      expect(categorizationService.updateCategorization).toHaveBeenCalledWith(
        'tx-001',
        expect.objectContaining({
          accountCode: '5100',
          isSplit: false,
        }),
        'user-001',
        'tenant-001',
      );
    });

    it('should handle split transactions', async () => {
      categorizationService.updateCategorization.mockResolvedValue(
        mockTransaction,
      );

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Mixed',
          is_split: true,
          splits: [
            {
              account_code: '5100',
              account_name: 'Groceries',
              amount_cents: 10000,
              vat_type: VatTypeApiEnum.STANDARD,
            },
            {
              account_code: '5200',
              account_name: 'Cleaning',
              amount_cents: 5000,
              vat_type: VatTypeApiEnum.STANDARD,
            },
          ],
          vat_type: VatTypeApiEnum.STANDARD,
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.pattern_created).toBe(false);
    });

    it('should respect create_pattern flag', async () => {
      categorizationService.updateCategorization.mockResolvedValue(
        mockTransaction,
      );

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: false,
          vat_type: VatTypeApiEnum.STANDARD,
          create_pattern: false,
        },
        mockUser,
      );

      expect(result.data.pattern_created).toBe(false);
    });
  });

  describe('POST /categorize/batch', () => {
    const mockBatchResult: CategorizationBatchResult = {
      totalProcessed: 10,
      autoCategorized: 7,
      reviewRequired: 2,
      failed: 1,
      results: [
        {
          transactionId: 'tx-001',
          status: 'AUTO_APPLIED',
          accountCode: '5100',
          accountName: 'Groceries',
          confidenceScore: 92,
          source: CategorizationSource.RULE_BASED,
        },
      ],
      statistics: {
        avgConfidence: 85.5,
        patternMatchRate: 45.0,
      },
    };

    it('should batch categorize specific transactions', async () => {
      categorizationService.categorizeTransactions.mockResolvedValue(
        mockBatchResult,
      );

      const result = await controller.batchCategorize(
        { transaction_ids: ['tx-001', 'tx-002'] },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.total_processed).toBe(10);
      expect(result.data.auto_categorized).toBe(7);
      expect(result.data.statistics.avg_confidence).toBe(85.5);
    });

    it('should fetch pending transactions when no IDs provided', async () => {
      transactionRepo.findByTenant.mockResolvedValue({
        data: [mockTransaction],
        page: 1,
        limit: 1000,
        total: 1,
        totalPages: 1,
      });
      categorizationService.categorizeTransactions.mockResolvedValue(
        mockBatchResult,
      );

      const result = await controller.batchCategorize({}, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ status: 'PENDING', limit: 1000 }),
      );
      expect(result.success).toBe(true);
    });

    it('should return empty result when no transactions to process', async () => {
      transactionRepo.findByTenant.mockResolvedValue({
        data: [],
        page: 1,
        limit: 1000,
        total: 0,
        totalPages: 0,
      });

      const result = await controller.batchCategorize({}, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.total_processed).toBe(0);
      expect(
        categorizationService.categorizeTransactions,
      ).not.toHaveBeenCalled();
    });
  });

  describe('GET /:id/suggestions', () => {
    const mockSuggestions: CategorySuggestion[] = [
      {
        accountCode: '5100',
        accountName: 'Groceries',
        confidenceScore: 92,
        reason: 'Matched payee pattern: Woolworths',
        source: 'PATTERN',
      },
      {
        accountCode: '5100',
        accountName: 'Groceries',
        confidenceScore: 85,
        reason: 'Similar to 15 previous transactions',
        source: 'AI',
      },
    ];

    it('should return categorization suggestions', async () => {
      categorizationService.getSuggestions.mockResolvedValue(mockSuggestions);

      const result = await controller.getSuggestions('tx-001', mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].account_code).toBe('5100');
      expect(result.data[0].source).toBe('PATTERN');
      expect(categorizationService.getSuggestions).toHaveBeenCalledWith(
        'tx-001',
        'tenant-001',
      );
    });

    it('should handle empty suggestions', async () => {
      categorizationService.getSuggestions.mockResolvedValue([]);

      const result = await controller.getSuggestions('tx-001', mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });
});
