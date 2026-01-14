import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { CalculationCacheRepository } from '../../../src/database/repositories/calculation-cache.repository';
import { CreateCalculationItemCacheDto } from '../../../src/database/dto/calculations.dto';
import { CalculationType, Tenant } from '@prisma/client';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';

describe('CalculationCacheRepository', () => {
  let repository: CalculationCacheRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let otherTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, CalculationCacheRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<CalculationCacheRepository>(
      CalculationCacheRepository,
    );

    await prisma.onModuleInit();
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

    // Create test tenants
    tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@creche.co.za`,
      },
    });

    otherTenant = await prisma.tenant.create({
      data: {
        name: 'Other Creche',
        addressLine1: '456 Other Road',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27217654321',
        email: `other${Date.now()}@creche.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const createTestCacheDto = (
    overrides?: Partial<CreateCalculationItemCacheDto>,
  ): CreateCalculationItemCacheDto => ({
    tenantId: tenant.id,
    code: '3601',
    name: 'Basic Salary',
    type: 'EARNING' as CalculationType,
    taxable: true,
    affectsUif: true,
    category: 'earnings',
    ...overrides,
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a calculation item cache entry', async () => {
      const dto = createTestCacheDto();
      const result = await repository.create(dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.code).toBe('3601');
      expect(result.name).toBe('Basic Salary');
      expect(result.type).toBe('EARNING');
      expect(result.taxable).toBe(true);
      expect(result.affectsUif).toBe(true);
    });

    it('should throw ConflictException for duplicate code per tenant', async () => {
      const dto = createTestCacheDto();
      await repository.create(dto);

      await expect(repository.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const dto = createTestCacheDto({
        tenantId: '00000000-0000-0000-0000-000000000000',
      });

      await expect(repository.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should allow same code for different tenants', async () => {
      const dto1 = createTestCacheDto();
      const dto2 = createTestCacheDto({ tenantId: otherTenant.id });

      const result1 = await repository.create(dto1);
      const result2 = await repository.create(dto2);

      expect(result1.tenantId).toBe(tenant.id);
      expect(result2.tenantId).toBe(otherTenant.id);
      expect(result1.code).toBe(result2.code);
    });
  });

  describe('findById', () => {
    it('should find cache entry by id', async () => {
      const created = await repository.create(createTestCacheDto());
      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.code).toBe('3601');
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByCode', () => {
    it('should find cache entry by tenant and code', async () => {
      await repository.create(createTestCacheDto());
      const found = await repository.findByCode(tenant.id, '3601');

      expect(found).toBeDefined();
      expect(found?.code).toBe('3601');
      expect(found?.tenantId).toBe(tenant.id);
    });

    it('should return null for non-existent code', async () => {
      const found = await repository.findByCode(tenant.id, 'NONEXISTENT');
      expect(found).toBeNull();
    });
  });

  describe('findByTenantId', () => {
    beforeEach(async () => {
      // Create multiple cache entries
      await repository.create(
        createTestCacheDto({
          code: '3601',
          name: 'Basic Salary',
          type: 'EARNING',
          taxable: true,
        }),
      );
      await repository.create(
        createTestCacheDto({
          code: '4101',
          name: 'PAYE',
          type: 'DEDUCTION',
          taxable: false,
        }),
      );
      await repository.create(
        createTestCacheDto({
          code: '4001',
          name: 'Pension Fund',
          type: 'DEDUCTION',
          taxable: false,
          affectsUif: false,
        }),
      );
    });

    it('should return all cache entries for tenant', async () => {
      const results = await repository.findByTenantId(tenant.id);
      expect(results).toHaveLength(3);
    });

    it('should filter by type', async () => {
      const earnings = await repository.findByTenantId(tenant.id, {
        type: 'EARNING',
      });
      expect(earnings).toHaveLength(1);
      expect(earnings[0].code).toBe('3601');
    });

    it('should filter by taxable', async () => {
      const taxable = await repository.findByTenantId(tenant.id, {
        taxable: true,
      });
      expect(taxable).toHaveLength(1);
      expect(taxable[0].name).toBe('Basic Salary');
    });

    it('should filter by affectsUif', async () => {
      const uifAffected = await repository.findByTenantId(tenant.id, {
        affectsUif: true,
      });
      expect(uifAffected).toHaveLength(2);
    });

    it('should filter by search term', async () => {
      const results = await repository.findByTenantId(tenant.id, {
        search: 'Salary',
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Basic Salary');

      const codeSearch = await repository.findByTenantId(tenant.id, {
        search: '4101',
      });
      expect(codeSearch).toHaveLength(1);
      expect(codeSearch[0].code).toBe('4101');
    });

    it('should order by code', async () => {
      const results = await repository.findByTenantId(tenant.id);
      expect(results[0].code).toBe('3601');
      expect(results[1].code).toBe('4001');
      expect(results[2].code).toBe('4101');
    });
  });

  describe('findByType', () => {
    beforeEach(async () => {
      await repository.create(
        createTestCacheDto({
          code: '3601',
          type: 'EARNING',
        }),
      );
      await repository.create(
        createTestCacheDto({
          code: '3602',
          type: 'EARNING',
        }),
      );
      await repository.create(
        createTestCacheDto({
          code: '4101',
          type: 'DEDUCTION',
        }),
      );
    });

    it('should find all items of a specific type', async () => {
      const earnings = await repository.findByType(tenant.id, 'EARNING');
      expect(earnings).toHaveLength(2);
      expect(earnings.every((e) => e.type === 'EARNING')).toBe(true);
    });
  });

  describe('update', () => {
    it('should update cache entry fields', async () => {
      const created = await repository.create(createTestCacheDto());
      const updated = await repository.update(created.id, {
        name: 'Updated Name',
        taxable: false,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.taxable).toBe(false);
      expect(updated.code).toBe('3601'); // Unchanged
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsert', () => {
    it('should create new entry if not exists', async () => {
      const result = await repository.upsert(tenant.id, 'NEW-CODE', {
        name: 'New Item',
        type: 'EARNING',
        taxable: true,
        affectsUif: true,
      });

      expect(result.code).toBe('NEW-CODE');
      expect(result.name).toBe('New Item');
    });

    it('should update existing entry', async () => {
      await repository.create(createTestCacheDto());

      const result = await repository.upsert(tenant.id, '3601', {
        name: 'Updated Name',
        type: 'EARNING',
        taxable: false,
        affectsUif: true,
      });

      expect(result.code).toBe('3601');
      expect(result.name).toBe('Updated Name');
      expect(result.taxable).toBe(false);
    });
  });

  describe('bulkUpsert', () => {
    it('should upsert multiple items', async () => {
      const items = [
        {
          code: '3601',
          name: 'Basic Salary',
          type: 'EARNING' as CalculationType,
          taxable: true,
          affectsUif: true,
        },
        {
          code: '3602',
          name: 'Overtime',
          type: 'EARNING' as CalculationType,
          taxable: true,
          affectsUif: true,
        },
        {
          code: '4101',
          name: 'PAYE',
          type: 'DEDUCTION' as CalculationType,
          taxable: false,
          affectsUif: false,
        },
      ];

      const result = await repository.bulkUpsert(tenant.id, items);

      expect(result.upserted).toBe(3);
      expect(result.failed).toBe(0);

      const all = await repository.findByTenantId(tenant.id);
      expect(all).toHaveLength(3);
    });
  });

  describe('delete', () => {
    it('should delete cache entry', async () => {
      const created = await repository.create(createTestCacheDto());
      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteByTenantId', () => {
    it('should delete all entries for a tenant', async () => {
      await repository.create(createTestCacheDto({ code: '3601' }));
      await repository.create(createTestCacheDto({ code: '3602' }));

      const count = await repository.deleteByTenantId(tenant.id);
      expect(count).toBe(2);

      const remaining = await repository.findByTenantId(tenant.id);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('getCacheStatus', () => {
    it('should return valid status for cached items', async () => {
      await repository.create(createTestCacheDto());

      const status = await repository.getCacheStatus(tenant.id);

      expect(status.isValid).toBe(true);
      expect(status.itemCount).toBe(1);
      expect(status.cachedAt).toBeDefined();
      expect(status.needsRefresh).toBe(false);
    });

    it('should return invalid status for no items', async () => {
      const status = await repository.getCacheStatus(tenant.id);

      expect(status.isValid).toBe(false);
      expect(status.itemCount).toBe(0);
      expect(status.cachedAt).toBeNull();
      expect(status.needsRefresh).toBe(true);
    });
  });

  describe('count', () => {
    it('should count items for a tenant', async () => {
      await repository.create(createTestCacheDto({ code: '3601' }));
      await repository.create(createTestCacheDto({ code: '3602' }));
      await repository.create(createTestCacheDto({ code: '3603' }));

      const count = await repository.count(tenant.id);
      expect(count).toBe(3);
    });
  });

  describe('tenant isolation', () => {
    it('should not return items from other tenants', async () => {
      await repository.create(createTestCacheDto({ code: '3601' }));
      await repository.create(
        createTestCacheDto({
          tenantId: otherTenant.id,
          code: '3602',
        }),
      );

      const tenant1Items = await repository.findByTenantId(tenant.id);
      const tenant2Items = await repository.findByTenantId(otherTenant.id);

      expect(tenant1Items).toHaveLength(1);
      expect(tenant2Items).toHaveLength(1);
      expect(tenant1Items[0].code).toBe('3601');
      expect(tenant2Items[0].code).toBe('3602');
    });
  });
});
