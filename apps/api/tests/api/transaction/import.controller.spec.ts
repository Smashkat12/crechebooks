import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { TransactionImportService } from '../../../src/database/services/transaction-import.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import { ImportResult } from '../../../src/database/dto/import.dto';
import type { IUser } from '../../../src/database/entities/user.entity';

describe('TransactionController.importTransactions', () => {
  let controller: TransactionController;
  let importService: jest.Mocked<TransactionImportService>;

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

  const mockImportResult: ImportResult = {
    importBatchId: 'batch-001',
    status: 'COMPLETED',
    fileName: 'test.csv',
    totalParsed: 10,
    duplicatesSkipped: 2,
    transactionsCreated: 8,
    errors: [],
  };

  beforeEach(async () => {
    const mockImportService = {
      importFromFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionRepository, useValue: {} },
        { provide: CategorizationRepository, useValue: {} },
        { provide: TransactionImportService, useValue: mockImportService },
        { provide: CategorizationService, useValue: {} },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    importService = module.get(TransactionImportService);
  });

  describe('successful imports', () => {
    it('should import CSV file and return import statistics', async () => {
      importService.importFromFile.mockResolvedValue(mockImportResult);

      const file = {
        buffer: Buffer.from('date,description,amount\n2025-01-01,Test,100'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 1024,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.import_batch_id).toBe('batch-001');
      expect(result.data.status).toBe('COMPLETED');
      expect(result.data.total_parsed).toBe(10);
      expect(result.data.duplicates_skipped).toBe(2);
      expect(result.data.transactions_created).toBe(8);
      expect(importService.importFromFile).toHaveBeenCalledWith(
        expect.objectContaining({
          buffer: file.buffer,
          originalname: 'test.csv',
        }),
        'fnb-001',
        'tenant-001',
      );
    });

    it('should import PDF file successfully', async () => {
      const pdfResult: ImportResult = {
        ...mockImportResult,
        fileName: 'statement.pdf',
      };
      importService.importFromFile.mockResolvedValue(pdfResult);

      const file = {
        buffer: Buffer.from('PDF content'),
        originalname: 'statement.pdf',
        mimetype: 'application/pdf',
        size: 5000,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.file_name).toBe('statement.pdf');
    });

    it('should return errors from import service', async () => {
      const resultWithErrors: ImportResult = {
        ...mockImportResult,
        status: 'COMPLETED',
        errors: [
          { row: 5, message: 'Invalid date', code: 'INVALID_DATE' },
          {
            field: 'amount',
            message: 'Negative value',
            code: 'INVALID_AMOUNT',
          },
        ],
      };
      importService.importFromFile.mockResolvedValue(resultWithErrors);

      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.data.errors).toHaveLength(2);
      expect(result.data.errors[0].row).toBe(5);
      expect(result.data.errors[1].field).toBe('amount');
    });

    it('should handle FAILED status from service', async () => {
      const failedResult: ImportResult = {
        ...mockImportResult,
        status: 'FAILED',
        transactionsCreated: 0,
        errors: [{ message: 'Parse failed', code: 'PARSE_ERROR' }],
      };
      importService.importFromFile.mockResolvedValue(failedResult);

      const file = {
        buffer: Buffer.from('bad data'),
        originalname: 'bad.csv',
        mimetype: 'text/csv',
        size: 50,
      } as Express.Multer.File;

      const result = await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        mockUser,
      );

      expect(result.success).toBe(false);
      expect(result.data.status).toBe('FAILED');
    });
  });

  describe('validation errors', () => {
    it('should throw BadRequestException when file is missing', async () => {
      await expect(
        controller.importTransactions(
          undefined as unknown as Express.Multer.File,
          { bank_account: 'fnb-001' },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when bank_account is missing', async () => {
      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      await expect(
        controller.importTransactions(file, { bank_account: '' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('tenant isolation', () => {
    it('should pass user tenantId to import service', async () => {
      importService.importFromFile.mockResolvedValue(mockImportResult);

      const file = {
        buffer: Buffer.from('data'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 100,
      } as Express.Multer.File;

      await controller.importTransactions(
        file,
        { bank_account: 'fnb-001' },
        { ...mockUser, tenantId: 'different-tenant' },
      );

      expect(importService.importFromFile).toHaveBeenCalledWith(
        expect.anything(),
        'fnb-001',
        'different-tenant',
      );
    });
  });
});
