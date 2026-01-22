/**
 * Batch Import Validator Service Tests
 * TXN-006: Fix Batch Import Validation
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { TransactionDateService } from '../../../src/database/services/transaction-date.service';
import {
  BatchImportValidatorService,
  ValidationSeverity,
  ColumnMapping,
} from '../../../src/database/services/batch-import-validator.service';
import { Tenant, Transaction } from '@prisma/client';
import { ImportSource } from '../../../src/database/entities/transaction.entity';

describe('BatchImportValidatorService', () => {
  let service: BatchImportValidatorService;
  let prisma: PrismaService;
  let transactionRepo: TransactionRepository;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        AuditLogService,
        TransactionDateService,
        BatchImportValidatorService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    service = module.get<BatchImportValidatorService>(
      BatchImportValidatorService,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean up
    await prisma.auditLog.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({
      where: { email: { contains: 'test-batch' } },
    });

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche - Batch Import',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        phone: '+27211234567',
        email: `test-batch-${Date.now()}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.transaction.deleteMany({});
    if (testTenant) {
      await prisma.tenant
        .delete({ where: { id: testTenant.id } })
        .catch(() => {});
    }
  });

  describe('validateBatch', () => {
    it('should validate a batch of valid rows', async () => {
      const rows = [
        { date: '2024-01-15', description: 'Payment 1', amount: 1500.0 },
        { date: '2024-01-16', description: 'Payment 2', amount: 2000.0 },
        { date: '2024-01-17', description: 'Payment 3', amount: 500.0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.isValid).toBe(true);
      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);
    });

    it('should detect invalid dates', async () => {
      const rows = [
        { date: 'invalid-date', description: 'Payment 1', amount: 1500.0 },
        { date: '2024-01-15', description: 'Payment 2', amount: 2000.0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.isValid).toBe(false);
      expect(result.invalidRows).toBe(1);
      expect(result.rowResults[0].canImport).toBe(false);

      const dateError = result.errors.find(
        (e) => e.rowNumber === 1 && e.field === 'date',
      );
      expect(dateError).toBeDefined();
      expect(dateError?.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should detect missing required fields', async () => {
      const rows = [
        { date: '2024-01-15', description: '', amount: 1500.0 }, // Empty description
        { date: '2024-01-16', amount: 2000.0 }, // Missing description
        { date: '2024-01-17', description: 'Payment', amount: null }, // Null amount
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.invalidRows).toBe(3);
    });

    it('should detect in-batch duplicates', async () => {
      const rows = [
        { date: '2024-01-15', description: 'Same payment', amount: 1500.0 },
        { date: '2024-01-15', description: 'Same payment', amount: 1500.0 }, // Duplicate
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.duplicateRows).toBe(1);
      const duplicateError = result.errors.find((e) =>
        e.message.includes('Duplicate of row'),
      );
      expect(duplicateError).toBeDefined();
    });

    it('should detect existing database duplicates', async () => {
      // Create existing transaction
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-123456',
          date: new Date('2024-01-15'),
          description: 'Existing payment',
          amountCents: 150000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          status: 'PENDING',
        },
      });

      const rows = [
        { date: '2024-01-15', description: 'Existing payment', amount: 1500.0 },
        { date: '2024-01-16', description: 'New payment', amount: 2000.0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      const existingDuplicate = result.errors.find((e) =>
        e.message.includes('Potential duplicate of existing'),
      );
      expect(existingDuplicate).toBeDefined();
      expect(existingDuplicate?.severity).toBe(ValidationSeverity.WARNING);
    });

    it('should support partial import', async () => {
      const rows = [
        { date: '2024-01-15', description: 'Valid payment', amount: 1500.0 },
        { date: 'invalid', description: 'Invalid payment', amount: 2000.0 },
        { date: '2024-01-17', description: 'Another valid', amount: 500.0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.canPartialImport).toBe(true);
      expect(result.summary.estimatedImportCount).toBe(2);
    });

    it('should warn for unusual amounts', async () => {
      const rows = [
        { date: '2024-01-15', description: 'Large payment', amount: 150000000 }, // R150M
        { date: '2024-01-16', description: 'Zero payment', amount: 0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      const amountWarnings = result.errors.filter(
        (e) =>
          e.field === 'amount' && e.severity === ValidationSeverity.WARNING,
      );
      expect(amountWarnings.length).toBe(2);
    });
  });

  describe('validateRow', () => {
    it('should validate a valid row', () => {
      const row = {
        date: '2024-01-15',
        description: 'Test payment',
        amount: 1500.0,
      };

      const result = service.validateRow(row, 1);

      expect(result.isValid).toBe(true);
      expect(result.canImport).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.amountCents).toBe(150000);
    });

    it('should parse credit/debit columns separately', () => {
      const row = {
        date: '2024-01-15',
        description: 'Payment received',
        credit: 1500.0,
        debit: '',
      };

      const mapping: ColumnMapping = {
        date: 'date',
        description: 'description',
        credit: 'credit',
        debit: 'debit',
      };

      const result = service.validateRow(row, 1, mapping);

      expect(result.canImport).toBe(true);
      expect(result.data?.isCredit).toBe(true);
      expect(result.data?.amountCents).toBe(150000);
    });

    it('should parse debit amounts', () => {
      const row = {
        date: '2024-01-15',
        description: 'Payment made',
        credit: '',
        debit: 1500.0,
      };

      const mapping: ColumnMapping = {
        date: 'date',
        description: 'description',
        credit: 'credit',
        debit: 'debit',
      };

      const result = service.validateRow(row, 1, mapping);

      expect(result.data?.isCredit).toBe(false);
    });

    it('should handle negative amounts', () => {
      const row = {
        date: '2024-01-15',
        description: 'Refund',
        amount: -500.0,
      };

      const result = service.validateRow(row, 1);

      expect(result.data?.amountCents).toBe(50000);
      expect(result.data?.isCredit).toBe(false);
    });

    it('should handle accounting format (parentheses)', () => {
      const row = {
        date: '2024-01-15',
        description: 'Debit',
        amount: '(1500.00)',
      };

      const result = service.validateRow(row, 1);

      expect(result.data?.amountCents).toBe(150000);
      expect(result.data?.isCredit).toBe(false);
    });

    it('should handle currency symbols', () => {
      const row = {
        date: '2024-01-15',
        description: 'Payment',
        amount: 'R1,500.00',
      };

      const result = service.validateRow(row, 1);

      expect(result.data?.amountCents).toBe(150000);
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'A'.repeat(600);
      const row = {
        date: '2024-01-15',
        description: longDescription,
        amount: 100.0,
      };

      const result = service.validateRow(row, 1);

      expect(result.data?.description.length).toBe(500);
      expect(result.errors.some((e) => e.message.includes('truncated'))).toBe(
        true,
      );
    });

    it('should parse optional fields', () => {
      const row = {
        date: '2024-01-15',
        description: 'Payment',
        amount: 100.0,
        payeeName: 'John Smith',
        reference: 'REF123',
      };

      const mapping: ColumnMapping = {
        date: 'date',
        description: 'description',
        amount: 'amount',
        payeeName: 'payeeName',
        reference: 'reference',
      };

      const result = service.validateRow(row, 1, mapping);

      expect(result.data?.payeeName).toBe('John Smith');
      expect(result.data?.reference).toBe('REF123');
    });
  });

  describe('column detection', () => {
    it('should auto-detect common column names', async () => {
      const rows = [
        {
          'Transaction Date': '2024-01-15',
          Description: 'Payment',
          Amount: 1500.0,
        },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.rowResults[0].canImport).toBe(true);
    });

    it('should detect credit/debit columns', async () => {
      const rows = [
        {
          Date: '2024-01-15',
          Narrative: 'Payment',
          Credits: 1500.0,
          Debits: '',
        },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.rowResults[0].canImport).toBe(true);
      expect(result.rowResults[0].data?.isCredit).toBe(true);
    });
  });

  describe('summary statistics', () => {
    it('should calculate error counts by field', async () => {
      const rows = [
        { date: 'invalid', description: 'Payment 1', amount: 1500.0 },
        { date: 'invalid2', description: 'Payment 2', amount: 2000.0 },
        { date: '2024-01-15', description: '', amount: 500.0 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.summary.byField.date).toBe(2);
      expect(result.summary.byField.description).toBe(1);
    });

    it('should calculate error counts by severity', async () => {
      const rows = [
        { date: '2024-01-15', description: 'Payment', amount: 0 }, // Warning
        { date: 'invalid', description: 'Payment', amount: 100 }, // Error
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.summary.bySeverity[ValidationSeverity.ERROR]).toBe(1);
      expect(
        result.summary.bySeverity[ValidationSeverity.WARNING],
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('date validation', () => {
    it('should accept various date formats', async () => {
      const rows = [
        { date: '2024-01-15', description: 'ISO format', amount: 100 },
        { date: '15/01/2024', description: 'SA format', amount: 100 },
        { date: '15 Jan 2024', description: 'Text format', amount: 100 },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.validRows).toBe(3);
    });

    it('should warn for dates outside normal range', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const rows = [
        {
          date: futureDate.toISOString().split('T')[0],
          description: 'Future payment',
          amount: 100,
        },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      const dateWarning = result.errors.find(
        (e) => e.field === 'date' && e.severity === ValidationSeverity.WARNING,
      );
      expect(dateWarning).toBeDefined();
    });
  });

  describe('import history', () => {
    it('should save import history record', () => {
      const record = service.saveImportHistory({
        tenantId: testTenant.id,
        batchId: 'batch-123',
        fileName: 'test.csv',
        importedAt: new Date(),
        totalRows: 100,
        importedRows: 95,
        skippedRows: 5,
        errorLog: [
          {
            rowNumber: 3,
            field: 'date',
            severity: ValidationSeverity.ERROR,
            message: 'Invalid date',
          },
        ],
        status: 'PARTIAL',
      });

      expect(record.id).toBeDefined();
      expect(record.status).toBe('PARTIAL');
    });
  });

  describe('edge cases', () => {
    it('should handle empty batch', async () => {
      const result = await service.validateBatch([], testTenant.id);

      expect(result.isValid).toBe(true);
      expect(result.totalRows).toBe(0);
    });

    it('should handle numeric amounts without decimals', () => {
      const row = { date: '2024-01-15', description: 'Payment', amount: 1500 };

      const result = service.validateRow(row, 1);

      expect(result.data?.amountCents).toBe(150000);
    });

    it('should handle string amounts', () => {
      const row = {
        date: '2024-01-15',
        description: 'Payment',
        amount: '1500.50',
      };

      const result = service.validateRow(row, 1);

      expect(result.data?.amountCents).toBe(150050);
    });

    it('should handle rows with extra columns', async () => {
      const rows = [
        {
          date: '2024-01-15',
          description: 'Payment',
          amount: 100,
          extraColumn1: 'ignored',
          extraColumn2: 'also ignored',
        },
      ];

      const result = await service.validateBatch(rows, testTenant.id);

      expect(result.validRows).toBe(1);
    });
  });
});
