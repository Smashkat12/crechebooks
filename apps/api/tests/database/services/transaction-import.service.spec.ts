/**
 * TransactionImportService Integration Tests
 * TASK-TRANS-011
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests actual parsing, deduplication, and storage
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import {
  TransactionImportService,
  ImportFile,
} from '../../../src/database/services/transaction-import.service';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import { Tenant } from '@prisma/client';
import { ValidationException } from '../../../src/shared/exceptions';

/**
 * Mock CategorizationService for tests
 * This service has many dependencies (PatternLearningService, etc.)
 * For import tests, we only need the basic queueCategorization method
 */
const mockCategorizationService = {
  queueCategorization: jest.fn().mockResolvedValue(undefined),
  categorizeBatch: jest.fn().mockResolvedValue({
    total: 0,
    categorized: 0,
    skipped: 0,
    errors: [],
  }),
  categorizeSingle: jest.fn().mockResolvedValue(null),
};

describe('TransactionImportService', () => {
  let service: TransactionImportService;
  let transactionRepo: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        TransactionImportService,
        AuditLogService,
        { provide: CategorizationService, useValue: mockCategorizationService },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    service = module.get<TransactionImportService>(TransactionImportService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
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

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('importFromFile - CSV', () => {
    it('should import valid CSV file', async () => {
      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT SMITH J Jan Fees,2500.00
16/01/2024,DEBIT ORDER Insurance,-500.00
17/01/2024,POS PURCHASE WOOLWORTHS,-150.50`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      const result = await service.importFromFile(
        file,
        'FNB Cheque',
        testTenant.id,
      );

      expect(result.status).toBe('COMPLETED');
      expect(result.totalParsed).toBe(3);
      expect(result.transactionsCreated).toBe(3);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.importBatchId).toBeDefined();

      // Verify in database
      const dbResult = await transactionRepo.findByTenant(testTenant.id, {});
      expect(dbResult.total).toBe(3);
    });

    it('should detect and skip duplicates', async () => {
      // First import
      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT SMITH J,2500.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      // Second import with same transaction
      const result = await service.importFromFile(
        file,
        'FNB Cheque',
        testTenant.id,
      );

      expect(result.totalParsed).toBe(1);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.transactionsCreated).toBe(0);
    });

    it('should handle debit/credit columns', async () => {
      const csvContent = `Date,Description,Debit,Credit
15/01/2024,Parent Payment,,2500.00
16/01/2024,Electricity,1500.00,`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      const result = await service.importFromFile(
        file,
        'FNB Cheque',
        testTenant.id,
      );

      expect(result.transactionsCreated).toBe(2);

      const dbResult = await transactionRepo.findByTenant(testTenant.id, {});
      const credit = dbResult.data.find(
        (t) => t.description === 'Parent Payment',
      );
      const debit = dbResult.data.find((t) => t.description === 'Electricity');

      expect(credit?.isCredit).toBe(true);
      expect(credit?.amountCents).toBe(250000);
      expect(debit?.isCredit).toBe(false);
      expect(debit?.amountCents).toBe(150000);
    });

    it('should reject file larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const file: ImportFile = {
        buffer: largeBuffer,
        originalname: 'large.csv',
        mimetype: 'text/csv',
        size: largeBuffer.length,
      };

      await expect(
        service.importFromFile(file, 'FNB Cheque', testTenant.id),
      ).rejects.toThrow(ValidationException);
    });

    it('should reject invalid file extension', async () => {
      const file: ImportFile = {
        buffer: Buffer.from('test'),
        originalname: 'file.xlsx',
        mimetype: 'application/vnd.ms-excel',
        size: 4,
      };

      await expect(
        service.importFromFile(file, 'FNB Cheque', testTenant.id),
      ).rejects.toThrow(ValidationException);
    });

    it('should set import source as CSV_IMPORT', async () => {
      const csvContent = `Date,Description,Amount
15/01/2024,Test Payment,100.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      const dbResult = await transactionRepo.findByTenant(testTenant.id, {});
      expect(dbResult.data[0].source).toBe(ImportSource.CSV_IMPORT);
    });
  });

  describe('importFromFile - tenant isolation', () => {
    it('should not detect duplicates across tenants', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Rainbow Kids',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@rainbowkids.co.za`,
        },
      });

      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT,2500.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      // Import to tenant 1
      await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      // Same import to tenant 2 - should NOT be duplicate
      const result = await service.importFromFile(
        file,
        'FNB Cheque',
        otherTenant.id,
      );

      expect(result.transactionsCreated).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
    });
  });

  describe('createMany', () => {
    it('should bulk create transactions', async () => {
      const dtos = [
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2024-01-15'),
          description: 'Transaction 1',
          amountCents: 100000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          importBatchId: 'test-batch-001',
        },
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2024-01-16'),
          description: 'Transaction 2',
          amountCents: 200000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          importBatchId: 'test-batch-001',
        },
      ];

      const created = await transactionRepo.createMany(dtos);

      expect(created).toHaveLength(2);
      expect(created[0].description).toBe('Transaction 1');
      expect(created[1].description).toBe('Transaction 2');
    });
  });

  describe('detectDuplicates', () => {
    it('should identify intra-file duplicates', async () => {
      const csvContent = `Date,Description,Amount
15/01/2024,Same Transaction,1000.00
15/01/2024,Same Transaction,1000.00
15/01/2024,Different Transaction,2000.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      const result = await service.importFromFile(
        file,
        'FNB Cheque',
        testTenant.id,
      );

      // Should detect the second "Same Transaction" as intra-file duplicate
      expect(result.transactionsCreated).toBe(2);
      expect(result.duplicatesSkipped).toBe(1);
    });
  });
});
