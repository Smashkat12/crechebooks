import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayeePatternRepository } from '../../../src/database/repositories/payee-pattern.repository';
import { CreatePayeePatternDto } from '../../../src/database/dto/payee-pattern.dto';
import {
  NotFoundException,
  BusinessException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('PayeePatternRepository', () => {
  let repository: PayeePatternRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let otherTenant: Tenant;

  // Real test data - South African creche payee pattern
  const testPatternData: CreatePayeePatternDto = {
    tenantId: '', // Will be set in beforeEach
    payeePattern: 'SMITH J',
    payeeAliases: ['SMITH JOHN', 'J SMITH', 'JOHN SMITH'],
    defaultAccountCode: '4100',
    defaultAccountName: 'Fee Income',
    confidenceBoost: 15.5,
    isRecurring: false,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayeePatternRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PayeePatternRepository>(PayeePatternRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
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
    testPatternData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a payee pattern with all fields', async () => {
      const pattern = await repository.create(testPatternData);

      expect(pattern.id).toBeDefined();
      expect(pattern.tenantId).toBe(testTenant.id);
      expect(pattern.payeePattern).toBe(testPatternData.payeePattern);
      expect(pattern.payeeAliases).toEqual(testPatternData.payeeAliases);
      expect(pattern.defaultAccountCode).toBe(
        testPatternData.defaultAccountCode,
      );
      expect(pattern.defaultAccountName).toBe(
        testPatternData.defaultAccountName,
      );
      expect(Number(pattern.confidenceBoost)).toBeCloseTo(15.5, 1);
      expect(pattern.matchCount).toBe(0);
      expect(pattern.isRecurring).toBe(false);
      expect(pattern.expectedAmountCents).toBeNull();
      expect(pattern.amountVariancePercent).toBeNull();
      expect(pattern.createdAt).toBeInstanceOf(Date);
      expect(pattern.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a payee pattern with minimum required fields', async () => {
      const minimalData: CreatePayeePatternDto = {
        tenantId: testTenant.id,
        payeePattern: 'JONES',
        payeeAliases: [],
        defaultAccountCode: '5000',
        defaultAccountName: 'General Expense',
        isRecurring: false,
      };

      const pattern = await repository.create(minimalData);

      expect(pattern.id).toBeDefined();
      expect(pattern.payeePattern).toBe('JONES');
      expect(pattern.payeeAliases).toEqual([]);
      expect(Number(pattern.confidenceBoost)).toBe(0); // default
      expect(pattern.matchCount).toBe(0); // default
      expect(pattern.expectedAmountCents).toBeNull();
      expect(pattern.amountVariancePercent).toBeNull();
    });

    it('should create a recurring pattern with expectedAmountCents', async () => {
      const recurringData: CreatePayeePatternDto = {
        tenantId: testTenant.id,
        payeePattern: 'VODACOM',
        payeeAliases: ['VODACOM SA', 'VODACOM CELLULAR'],
        defaultAccountCode: '5200',
        defaultAccountName: 'Telephone Expense',
        isRecurring: true,
        expectedAmountCents: 50000, // R500.00
        amountVariancePercent: 10,
      };

      const pattern = await repository.create(recurringData);

      expect(pattern.isRecurring).toBe(true);
      expect(pattern.expectedAmountCents).toBe(50000);
      expect(Number(pattern.amountVariancePercent)).toBeCloseTo(10, 0);
    });

    it('should throw BusinessException when recurring pattern missing expectedAmountCents', async () => {
      const invalidRecurring: CreatePayeePatternDto = {
        tenantId: testTenant.id,
        payeePattern: 'ESKOM',
        payeeAliases: [],
        defaultAccountCode: '5100',
        defaultAccountName: 'Electricity',
        isRecurring: true,
        // expectedAmountCents is missing!
      };

      await expect(repository.create(invalidRecurring)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw ConflictException for duplicate pattern per tenant', async () => {
      await repository.create(testPatternData);

      // Try to create duplicate
      const duplicateData = {
        ...testPatternData,
        defaultAccountCode: '5000', // Different account, same pattern
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same pattern for different tenants', async () => {
      await repository.create(testPatternData);

      // Same pattern for different tenant should work
      const otherTenantData = {
        ...testPatternData,
        tenantId: otherTenant.id,
      };

      const pattern = await repository.create(otherTenantData);
      expect(pattern.tenantId).toBe(otherTenant.id);
      expect(pattern.payeePattern).toBe(testPatternData.payeePattern);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData = {
        ...testPatternData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find pattern by id', async () => {
      const created = await repository.create(testPatternData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.payeePattern).toBe(testPatternData.payeePattern);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all patterns for tenant', async () => {
      await repository.create(testPatternData);
      await repository.create({
        ...testPatternData,
        payeePattern: 'JONES A',
        payeeAliases: ['A JONES'],
      });

      const patterns = await repository.findByTenant(testTenant.id, {});

      expect(patterns).toHaveLength(2);
    });

    it('should filter by isRecurring', async () => {
      await repository.create(testPatternData); // non-recurring
      await repository.create({
        ...testPatternData,
        payeePattern: 'VODACOM',
        isRecurring: true,
        expectedAmountCents: 50000,
      });

      const recurring = await repository.findByTenant(testTenant.id, {
        isRecurring: true,
      });

      expect(recurring).toHaveLength(1);
      expect(recurring[0].isRecurring).toBe(true);
    });

    it('should filter by accountCode', async () => {
      await repository.create(testPatternData); // 4100
      await repository.create({
        ...testPatternData,
        payeePattern: 'EXPENSE',
        defaultAccountCode: '5000',
        defaultAccountName: 'Expense',
      });

      const result = await repository.findByTenant(testTenant.id, {
        accountCode: '5000',
      });

      expect(result).toHaveLength(1);
      expect(result[0].defaultAccountCode).toBe('5000');
    });

    it('should search by payeePattern or accountName', async () => {
      await repository.create(testPatternData); // SMITH J, Fee Income
      await repository.create({
        ...testPatternData,
        payeePattern: 'JONES',
        defaultAccountName: 'Other Income',
      });

      const searchResult = await repository.findByTenant(testTenant.id, {
        search: 'smith',
      });

      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].payeePattern).toBe('SMITH J');
    });

    it('should order by matchCount descending', async () => {
      const p1 = await repository.create(testPatternData);
      const p2 = await repository.create({
        ...testPatternData,
        payeePattern: 'POPULAR',
      });

      // Increment p2's match count multiple times
      await repository.incrementMatchCount(p2.id);
      await repository.incrementMatchCount(p2.id);
      await repository.incrementMatchCount(p2.id);

      const patterns = await repository.findByTenant(testTenant.id, {});

      expect(patterns[0].id).toBe(p2.id); // Higher match count first
      expect(patterns[0].matchCount).toBe(3);
      expect(patterns[1].id).toBe(p1.id);
      expect(patterns[1].matchCount).toBe(0);
    });
  });

  describe('findByPayeeName', () => {
    it('should find pattern by exact payee name match', async () => {
      await repository.create(testPatternData);

      const found = await repository.findByPayeeName(testTenant.id, 'SMITH J');

      expect(found).not.toBeNull();
      expect(found?.payeePattern).toBe('SMITH J');
    });

    it('should find pattern by exact match (case-insensitive)', async () => {
      await repository.create(testPatternData);

      const found = await repository.findByPayeeName(testTenant.id, 'smith j');

      expect(found).not.toBeNull();
      expect(found?.payeePattern).toBe('SMITH J');
    });

    it('should find pattern by alias match', async () => {
      await repository.create(testPatternData);

      const found = await repository.findByPayeeName(
        testTenant.id,
        'JOHN SMITH',
      );

      expect(found).not.toBeNull();
      expect(found?.payeePattern).toBe('SMITH J');
    });

    it('should find pattern by alias match (case-insensitive)', async () => {
      await repository.create(testPatternData);

      const found = await repository.findByPayeeName(
        testTenant.id,
        'john smith',
      );

      expect(found).not.toBeNull();
      expect(found?.payeePattern).toBe('SMITH J');
    });

    it('should return null when no match found', async () => {
      await repository.create(testPatternData);

      const found = await repository.findByPayeeName(
        testTenant.id,
        'UNKNOWN PAYEE',
      );

      expect(found).toBeNull();
    });

    it('should respect tenant isolation', async () => {
      await repository.create(testPatternData);

      // Same payee name but different tenant
      const found = await repository.findByPayeeName(otherTenant.id, 'SMITH J');

      expect(found).toBeNull();
    });
  });

  describe('incrementMatchCount', () => {
    it('should increment match count atomically', async () => {
      const created = await repository.create(testPatternData);
      expect(created.matchCount).toBe(0);

      const incremented = await repository.incrementMatchCount(created.id);

      expect(incremented.matchCount).toBe(1);
    });

    it('should increment multiple times correctly', async () => {
      const created = await repository.create(testPatternData);

      await repository.incrementMatchCount(created.id);
      await repository.incrementMatchCount(created.id);
      const final = await repository.incrementMatchCount(created.id);

      expect(final.matchCount).toBe(3);
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      await expect(
        repository.incrementMatchCount('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update pattern fields', async () => {
      const created = await repository.create(testPatternData);

      const updated = await repository.update(created.id, {
        defaultAccountCode: '4200',
        defaultAccountName: 'Updated Income',
        confidenceBoost: 25,
      });

      expect(updated.defaultAccountCode).toBe('4200');
      expect(updated.defaultAccountName).toBe('Updated Income');
      expect(Number(updated.confidenceBoost)).toBeCloseTo(25, 0);
      expect(updated.payeePattern).toBe(testPatternData.payeePattern); // unchanged
    });

    it('should update payeeAliases', async () => {
      const created = await repository.create(testPatternData);

      const updated = await repository.update(created.id, {
        payeeAliases: ['NEW ALIAS 1', 'NEW ALIAS 2'],
      });

      expect(updated.payeeAliases).toEqual(['NEW ALIAS 1', 'NEW ALIAS 2']);
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          defaultAccountCode: '5000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when updating to isRecurring=true without expectedAmountCents', async () => {
      const created = await repository.create(testPatternData);

      await expect(
        repository.update(created.id, {
          isRecurring: true,
          // expectedAmountCents is missing!
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should allow updating to recurring with expectedAmountCents', async () => {
      const created = await repository.create(testPatternData);

      const updated = await repository.update(created.id, {
        isRecurring: true,
        expectedAmountCents: 100000,
        amountVariancePercent: 5,
      });

      expect(updated.isRecurring).toBe(true);
      expect(updated.expectedAmountCents).toBe(100000);
      expect(Number(updated.amountVariancePercent)).toBeCloseTo(5, 0);
    });
  });

  describe('delete', () => {
    it('should delete pattern', async () => {
      const created = await repository.create(testPatternData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
