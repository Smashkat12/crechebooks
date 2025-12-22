import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CreateTransactionDto } from '../../../src/database/dto/transaction.dto';
import {
  ImportSource,
  TransactionStatus,
} from '../../../src/database/entities/transaction.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('TransactionRepository', () => {
  let repository: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let otherTenant: Tenant;

  // Real test data - South African creche transaction
  const testTransactionData: CreateTransactionDto = {
    tenantId: '', // Will be set in beforeEach
    bankAccount: 'FNB Cheque',
    date: new Date('2024-01-15'),
    description: 'EFT PAYMENT: SMITH J - Monthly Fees',
    payeeName: 'SMITH J',
    reference: 'Jan2024',
    amountCents: 250000, // R2,500.00
    isCredit: true,
    source: ImportSource.BANK_FEED,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TransactionRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<TransactionRepository>(TransactionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
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

    // Create another tenant for isolation tests
    otherTenant = await prisma.tenant.create({
      data: {
        name: 'Rainbow Kids',
        addressLine1: '456 Other Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: `test${Date.now()}@rainbowkids.co.za`,
      },
    });

    // Update test data with the created tenant ID
    testTransactionData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a transaction with all fields', async () => {
      const transaction = await repository.create(testTransactionData);

      expect(transaction.id).toBeDefined();
      expect(transaction.tenantId).toBe(testTenant.id);
      expect(transaction.bankAccount).toBe(testTransactionData.bankAccount);
      expect(transaction.description).toBe(testTransactionData.description);
      expect(transaction.payeeName).toBe(testTransactionData.payeeName);
      expect(transaction.reference).toBe(testTransactionData.reference);
      expect(transaction.amountCents).toBe(250000);
      expect(transaction.isCredit).toBe(true);
      expect(transaction.source).toBe(ImportSource.BANK_FEED);
      expect(transaction.status).toBe(TransactionStatus.PENDING); // default
      expect(transaction.isReconciled).toBe(false); // default
      expect(transaction.isDeleted).toBe(false); // default
      expect(transaction.createdAt).toBeInstanceOf(Date);
      expect(transaction.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a transaction with minimum required fields', async () => {
      const minimalData: CreateTransactionDto = {
        tenantId: testTenant.id,
        bankAccount: 'Standard Bank',
        date: new Date('2024-02-01'),
        description: 'DEBIT ORDER: Insurance',
        amountCents: 50000, // R500.00
        isCredit: false,
        source: ImportSource.CSV_IMPORT,
      };

      const transaction = await repository.create(minimalData);

      expect(transaction.id).toBeDefined();
      expect(transaction.payeeName).toBeNull();
      expect(transaction.reference).toBeNull();
      expect(transaction.xeroTransactionId).toBeNull();
      expect(transaction.importBatchId).toBeNull();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData = {
        ...testTransactionData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException for duplicate xeroTransactionId', async () => {
      const dataWithXero = {
        ...testTransactionData,
        xeroTransactionId: 'xero-123456',
      };

      await repository.create(dataWithXero);

      // Try to create another with same xeroTransactionId
      const duplicateData = {
        ...testTransactionData,
        xeroTransactionId: 'xero-123456',
        description: 'Different transaction',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findById', () => {
    it('should find transaction by id', async () => {
      const created = await repository.create(testTransactionData);
      const found = await repository.findById(testTenant.id, created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.description).toBe(testTransactionData.description);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        testTenant.id,
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });

    it('should return null for transaction in different tenant (isolation)', async () => {
      const created = await repository.create(testTransactionData);

      // Try to find with different tenant
      const found = await repository.findById(otherTenant.id, created.id);
      expect(found).toBeNull();
    });

    it('should return null for soft-deleted transaction', async () => {
      const created = await repository.create(testTransactionData);
      await repository.softDelete(testTenant.id, created.id);

      const found = await repository.findById(testTenant.id, created.id);
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return paginated results', async () => {
      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await repository.create({
          ...testTransactionData,
          description: `Transaction ${i}`,
          date: new Date(`2024-01-${10 + i}`),
        });
      }

      const result = await repository.findByTenant(testTenant.id, {
        page: 1,
        limit: 3,
      });

      expect(result.data).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(3);
      expect(result.totalPages).toBe(2);
    });

    it('should filter by status', async () => {
      await repository.create(testTransactionData);

      const created = await repository.create({
        ...testTransactionData,
        description: 'Categorized transaction',
      });
      await repository.update(testTenant.id, created.id, {
        status: TransactionStatus.CATEGORIZED,
      });

      const result = await repository.findByTenant(testTenant.id, {
        status: TransactionStatus.CATEGORIZED,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(TransactionStatus.CATEGORIZED);
    });

    it('should filter by date range', async () => {
      await repository.create({
        ...testTransactionData,
        date: new Date('2024-01-10'),
      });
      await repository.create({
        ...testTransactionData,
        date: new Date('2024-01-20'),
        description: 'Later transaction',
      });

      const result = await repository.findByTenant(testTenant.id, {
        dateFrom: new Date('2024-01-15'),
        dateTo: new Date('2024-01-25'),
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].description).toBe('Later transaction');
    });

    it('should filter by isReconciled', async () => {
      const t1 = await repository.create(testTransactionData);
      await repository.create({
        ...testTransactionData,
        description: 'Unreconciled transaction',
      });
      await repository.markReconciled(testTenant.id, t1.id);

      const result = await repository.findByTenant(testTenant.id, {
        isReconciled: true,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isReconciled).toBe(true);
    });

    it('should exclude soft-deleted transactions', async () => {
      const t1 = await repository.create(testTransactionData);
      await repository.create({
        ...testTransactionData,
        description: 'Active transaction',
      });
      await repository.softDelete(testTenant.id, t1.id);

      const result = await repository.findByTenant(testTenant.id, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].description).toBe('Active transaction');
    });

    it('should search by description, payeeName, or reference', async () => {
      await repository.create({
        ...testTransactionData,
        description: 'SMITH payment',
      });
      await repository.create({
        ...testTransactionData,
        description: 'JONES payment',
        payeeName: 'JONES A',
      });

      const result = await repository.findByTenant(testTenant.id, {
        search: 'smith',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].description).toContain('SMITH');
    });
  });

  describe('findPending', () => {
    it('should return only PENDING transactions', async () => {
      await repository.create(testTransactionData);
      const t2 = await repository.create({
        ...testTransactionData,
        description: 'Categorized',
      });
      await repository.update(testTenant.id, t2.id, {
        status: TransactionStatus.CATEGORIZED,
      });

      const pending = await repository.findPending(testTenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe(TransactionStatus.PENDING);
    });

    it('should exclude soft-deleted transactions', async () => {
      const t1 = await repository.create(testTransactionData);
      await repository.create({
        ...testTransactionData,
        description: 'Active pending',
      });
      await repository.softDelete(testTenant.id, t1.id);

      const pending = await repository.findPending(testTenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].description).toBe('Active pending');
    });
  });

  describe('update', () => {
    it('should update transaction fields', async () => {
      const created = await repository.create(testTransactionData);

      const updated = await repository.update(testTenant.id, created.id, {
        status: TransactionStatus.CATEGORIZED,
        payeeName: 'UPDATED PAYEE',
      });

      expect(updated.status).toBe(TransactionStatus.CATEGORIZED);
      expect(updated.payeeName).toBe('UPDATED PAYEE');
      expect(updated.description).toBe(testTransactionData.description); // unchanged
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        repository.update(
          testTenant.id,
          '00000000-0000-0000-0000-000000000000',
          {
            status: TransactionStatus.CATEGORIZED,
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for transaction in different tenant (isolation)', async () => {
      const created = await repository.create(testTransactionData);

      await expect(
        repository.update(otherTenant.id, created.id, {
          status: TransactionStatus.CATEGORIZED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('should set isDeleted and deletedAt', async () => {
      const created = await repository.create(testTransactionData);

      await repository.softDelete(testTenant.id, created.id);

      // Directly query to verify (bypassing isDeleted filter)
      const deleted = await prisma.transaction.findUnique({
        where: { id: created.id },
      });

      expect(deleted?.isDeleted).toBe(true);
      expect(deleted?.deletedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        repository.softDelete(
          testTenant.id,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for transaction in different tenant (isolation)', async () => {
      const created = await repository.create(testTransactionData);

      await expect(
        repository.softDelete(otherTenant.id, created.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markReconciled', () => {
    it('should set isReconciled and reconciledAt', async () => {
      const created = await repository.create(testTransactionData);
      expect(created.isReconciled).toBe(false);
      expect(created.reconciledAt).toBeNull();

      const beforeMark = new Date();
      const updated = await repository.markReconciled(
        testTenant.id,
        created.id,
      );

      expect(updated.isReconciled).toBe(true);
      expect(updated.reconciledAt).toBeInstanceOf(Date);
      expect(updated.reconciledAt!.getTime()).toBeGreaterThanOrEqual(
        beforeMark.getTime(),
      );
    });

    it('should throw NotFoundException for non-existent transaction', async () => {
      await expect(
        repository.markReconciled(
          testTenant.id,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for transaction in different tenant (isolation)', async () => {
      const created = await repository.create(testTransactionData);

      await expect(
        repository.markReconciled(otherTenant.id, created.id),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
