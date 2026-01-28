import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import {
  Transaction,
  Categorization,
  DuplicateStatus,
  VatType,
  ImportSource,
  TransactionStatus as PrismaTransactionStatus,
  CategorizationSource as PrismaCategorizationSource,
} from '@prisma/client';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { TransactionImportService } from '../../../src/database/services/transaction-import.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { IUser, UserRole } from '../../../src/database/entities/user.entity';
import { TransactionStatus } from '../../../src/database/entities/transaction.entity';

describe('TransactionController', () => {
  let controller: TransactionController;
  let transactionRepo: TransactionRepository;
  let categorizationRepo: CategorizationRepository;

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    auth0Id: 'auth0|123',
    email: 'test@creche.co.za',
    name: 'Test User',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: null,
    currentTenantId: 'tenant-456',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction: Transaction = {
    id: 'tx-001',
    tenantId: 'tenant-456',
    xeroTransactionId: null,
    bankAccount: 'CHEQUE',
    date: new Date('2025-01-15'),
    description: 'WOOLWORTHS FOOD',
    payeeName: 'WOOLWORTHS',
    reference: 'REF123',
    amountCents: -15000,
    isCredit: false,
    source: ImportSource.CSV_IMPORT,
    importBatchId: 'batch-001',
    status: PrismaTransactionStatus.CATEGORIZED,
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
  };

  const mockCategorization: Categorization = {
    id: 'cat-001',
    transactionId: 'tx-001',
    accountCode: '5100',
    accountName: 'Groceries',
    confidenceScore: new Decimal(92),
    reasoning: 'Matched grocery store',
    source: PrismaCategorizationSource.AI_AUTO,
    isSplit: false,
    splitAmountCents: null,
    vatAmountCents: 1957,
    vatType: VatType.STANDARD,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        {
          provide: TransactionRepository,
          useValue: {
            findByTenant: jest.fn(),
          },
        },
        {
          provide: CategorizationRepository,
          useValue: {
            findByTransaction: jest.fn(),
          },
        },
        {
          provide: InvoiceRepository,
          useValue: {},
        },
        {
          provide: TransactionImportService,
          useValue: {},
        },
        {
          provide: CategorizationService,
          useValue: {},
        },
        {
          provide: PaymentAllocationService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {
            transaction: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    categorizationRepo = module.get<CategorizationRepository>(
      CategorizationRepository,
    );
  });

  describe('listTransactions', () => {
    it('should return paginated transactions with default params', async () => {
      const paginatedResult = {
        data: [mockTransaction],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);
      jest
        .spyOn(categorizationRepo, 'findByTransaction')
        .mockResolvedValue([mockCategorization]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('tx-001');
      expect(result.data[0].categorization?.account_code).toBe('5100');
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.any(Object),
      );
    });

    it('should apply status filter', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      await controller.listTransactions(
        { status: TransactionStatus.PENDING },
        mockUser,
      );

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          status: TransactionStatus.PENDING,
        }),
      );
    });

    it('should apply date range filters', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      await controller.listTransactions(
        {
          date_from: '2025-01-01',
          date_to: '2025-01-31',
        },
        mockUser,
      );

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          dateFrom: new Date('2025-01-01'),
          dateTo: new Date('2025-01-31'),
        }),
      );
    });

    it('should apply search filter', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      await controller.listTransactions({ search: 'woolworths' }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          search: 'woolworths',
        }),
      );
    });

    it('should apply is_reconciled filter', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      await controller.listTransactions({ is_reconciled: true }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          isReconciled: true,
        }),
      );
    });

    it('should apply pagination params', async () => {
      const paginatedResult = {
        data: [],
        total: 100,
        page: 3,
        limit: 10,
        totalPages: 10,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      const result = await controller.listTransactions(
        { page: 3, limit: 10 },
        mockUser,
      );

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-456',
        expect.objectContaining({
          page: 3,
          limit: 10,
        }),
      );
      expect(result.meta.page).toBe(3);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(10);
    });

    it('should handle transaction without categorization', async () => {
      const uncategorizedTx = {
        ...mockTransaction,
        status: PrismaTransactionStatus.PENDING,
      };
      const paginatedResult = {
        data: [uncategorizedTx],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);
      jest.spyOn(categorizationRepo, 'findByTransaction').mockResolvedValue([]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.data[0].categorization).toBeUndefined();
    });

    it('should format date as YYYY-MM-DD string', async () => {
      const paginatedResult = {
        data: [mockTransaction],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);
      jest.spyOn(categorizationRepo, 'findByTransaction').mockResolvedValue([]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.data[0].date).toBe('2025-01-15');
    });

    it('should enforce tenant isolation', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      jest
        .spyOn(transactionRepo, 'findByTenant')
        .mockResolvedValue(paginatedResult);

      const differentUser = { ...mockUser, tenantId: 'other-tenant' };
      await controller.listTransactions({}, differentUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'other-tenant',
        expect.any(Object),
      );
    });
  });
});
