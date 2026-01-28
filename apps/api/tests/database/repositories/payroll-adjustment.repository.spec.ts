import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayrollAdjustmentRepository } from '../../../src/database/repositories/payroll-adjustment.repository';
import { CreatePayrollAdjustmentDto } from '../../../src/database/dto/calculations.dto';
import { Tenant, Staff, CalculationType } from '@prisma/client';
import { NotFoundException } from '../../../src/shared/exceptions';
import { cleanDatabase } from '../../helpers/clean-database';

describe('PayrollAdjustmentRepository', () => {
  let repository: PayrollAdjustmentRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayrollAdjustmentRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PayrollAdjustmentRepository>(
      PayrollAdjustmentRepository,
    );

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
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

    // Create test staff
    staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: 'EMP-001',
        firstName: 'Test',
        lastName: 'Employee',
        idNumber: '8501015800084',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2024-01-01'),
        employmentType: 'PERMANENT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 1500000,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const createTestAdjustmentDto = (
    overrides?: Partial<CreatePayrollAdjustmentDto>,
  ): CreatePayrollAdjustmentDto => ({
    tenantId: tenant.id,
    staffId: staff.id,
    itemCode: '3601',
    itemName: 'Basic Salary',
    type: 'EARNING' as CalculationType,
    amountCents: 100000,
    percentage: undefined,
    isRecurring: true,
    effectiveDate: new Date('2024-01-01'),
    endDate: undefined,
    ...overrides,
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a payroll adjustment', async () => {
      const dto = createTestAdjustmentDto();
      const result = await repository.create(dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.staffId).toBe(staff.id);
      expect(result.itemCode).toBe('3601');
      expect(result.itemName).toBe('Basic Salary');
      expect(result.amountCents).toBe(100000);
      expect(result.isRecurring).toBe(true);
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      const dto = createTestAdjustmentDto({
        staffId: '00000000-0000-0000-0000-000000000000',
      });

      await expect(repository.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find adjustment by id', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      const found = await repository.findById(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        tenant.id,
      );
      expect(found).toBeNull();
    });
  });

  describe('findByStaffId', () => {
    beforeEach(async () => {
      // Create multiple adjustments
      await repository.create(
        createTestAdjustmentDto({
          amountCents: 100000,
          isRecurring: true,
        }),
      );
      await repository.create(
        createTestAdjustmentDto({
          itemCode: '4001',
          itemName: 'Pension Fund',
          type: 'DEDUCTION',
          amountCents: 50000,
          isRecurring: false,
        }),
      );
    });

    it('should return all adjustments for staff', async () => {
      const results = await repository.findByStaffId(staff.id);
      expect(results).toHaveLength(2);
    });

    it('should filter by isRecurring', async () => {
      const recurring = await repository.findByStaffId(staff.id, {
        isRecurring: true,
      });
      expect(recurring).toHaveLength(1);
      expect(recurring[0].amountCents).toBe(100000);

      const oneTime = await repository.findByStaffId(staff.id, {
        isRecurring: false,
      });
      expect(oneTime).toHaveLength(1);
      expect(oneTime[0].amountCents).toBe(50000);
    });

    it('should filter by itemCode', async () => {
      const results = await repository.findByStaffId(staff.id, {
        itemCode: '3601',
      });
      expect(results).toHaveLength(1);
      expect(results[0].itemCode).toBe('3601');
    });

    it('should filter by type', async () => {
      const earnings = await repository.findByStaffId(staff.id, {
        type: 'EARNING',
      });
      expect(earnings).toHaveLength(1);

      const deductions = await repository.findByStaffId(staff.id, {
        type: 'DEDUCTION',
      });
      expect(deductions).toHaveLength(1);
    });
  });

  describe('findActiveForDate', () => {
    it('should find adjustments active on a specific date', async () => {
      await repository.create(
        createTestAdjustmentDto({
          effectiveDate: new Date('2024-01-01'),
          endDate: new Date('2024-06-30'),
        }),
      );

      const active = await repository.findActiveForDate(
        staff.id,
        new Date('2024-03-15'),
      );
      expect(active).toHaveLength(1);

      const afterEnd = await repository.findActiveForDate(
        staff.id,
        new Date('2024-07-15'),
      );
      expect(afterEnd).toHaveLength(0);
    });

    it('should include adjustments with no end date', async () => {
      await repository.create(
        createTestAdjustmentDto({
          effectiveDate: new Date('2024-01-01'),
          endDate: undefined,
        }),
      );

      const active = await repository.findActiveForDate(
        staff.id,
        new Date('2025-01-01'),
      );
      expect(active).toHaveLength(1);
    });
  });

  describe('findRecurringByStaffId', () => {
    it('should find recurring adjustments', async () => {
      await repository.create(
        createTestAdjustmentDto({
          isRecurring: true,
        }),
      );
      await repository.create(
        createTestAdjustmentDto({
          itemCode: '4001',
          itemName: 'One-time bonus',
          isRecurring: false,
        }),
      );

      const recurring = await repository.findRecurringByStaffId(staff.id);
      expect(recurring).toHaveLength(1);
      expect(recurring[0].isRecurring).toBe(true);
    });
  });

  describe('findUnsyncedByTenantId', () => {
    it('should find unsynced adjustments', async () => {
      await repository.create(createTestAdjustmentDto());

      const unsynced = await repository.findUnsyncedByTenantId(tenant.id);
      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].syncedToSimplePay).toBe(false);
    });
  });

  describe('update', () => {
    it('should update adjustment fields', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      const updated = await repository.update(created.id, tenant.id, {
        amountCents: 150000,
        itemName: 'Updated Name',
      });

      expect(updated.amountCents).toBe(150000);
      expect(updated.itemName).toBe('Updated Name');
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', tenant.id, {
          amountCents: 150000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markSynced', () => {
    it('should mark adjustment as synced', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      const synced = await repository.markSynced(created.id, 'sp-calc-123');

      expect(synced.syncedToSimplePay).toBe(true);
      expect(synced.simplePayCalcId).toBe('sp-calc-123');
    });
  });

  describe('end', () => {
    it('should set endDate', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      const endDate = new Date('2024-12-31');
      const ended = await repository.end(created.id, tenant.id, endDate);

      expect(ended.endDate).toEqual(endDate);
    });

    it('should use current date if not provided', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      const ended = await repository.end(created.id, tenant.id);

      expect(ended.endDate).toBeDefined();
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.end('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete adjustment', async () => {
      const created = await repository.create(createTestAdjustmentDto());
      await repository.delete(created.id, tenant.id);

      const found = await repository.findById(created.id, tenant.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteByStaffId', () => {
    it('should delete all adjustments for a staff member', async () => {
      await repository.create(createTestAdjustmentDto());
      await repository.create(createTestAdjustmentDto({ amountCents: 50000 }));

      const count = await repository.deleteByStaffId(staff.id);
      expect(count).toBe(2);

      const remaining = await repository.findByStaffId(staff.id);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('countActiveByStaffId', () => {
    it('should count only active adjustments', async () => {
      const adj1 = await repository.create(createTestAdjustmentDto());
      await repository.create(createTestAdjustmentDto({ amountCents: 50000 }));
      // End adj1 with a past date so it is clearly expired
      // (endDate must be < now for the adjustment to be excluded by the
      // countActiveByStaffId query which checks endDate: { gte: now })
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await repository.end(adj1.id, tenant.id, yesterday);

      const count = await repository.countActiveByStaffId(staff.id);
      expect(count).toBe(1);
    });
  });

  describe('sumByType', () => {
    beforeEach(async () => {
      // Create adjustments
      await repository.create(
        createTestAdjustmentDto({
          itemCode: '3601',
          type: 'EARNING',
          amountCents: 100000, // R1000
        }),
      );
      await repository.create(
        createTestAdjustmentDto({
          itemCode: '3602',
          itemName: 'Overtime',
          type: 'EARNING',
          amountCents: 50000, // R500
        }),
      );
      await repository.create(
        createTestAdjustmentDto({
          itemCode: '4001',
          itemName: 'Pension',
          type: 'DEDUCTION',
          amountCents: 25000, // R250
        }),
      );
    });

    it('should sum adjustments by type', async () => {
      const earningsSum = await repository.sumByType(
        staff.id,
        'EARNING',
        new Date(),
      );
      expect(earningsSum).toBe(150000); // R1500

      const deductionsSum = await repository.sumByType(
        staff.id,
        'DEDUCTION',
        new Date(),
      );
      expect(deductionsSum).toBe(25000); // R250
    });
  });

  describe('findByTenantId', () => {
    beforeEach(async () => {
      // Create another staff member
      const staff2 = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          employeeNumber: 'EMP-002',
          firstName: 'Another',
          lastName: 'Employee',
          idNumber: '9001015800084',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 1000000,
        },
      });

      await repository.create(createTestAdjustmentDto());
      await repository.create(
        createTestAdjustmentDto({
          staffId: staff2.id,
          amountCents: 75000,
        }),
      );
    });

    it('should return all adjustments for tenant', async () => {
      const results = await repository.findByTenantId(tenant.id);
      expect(results).toHaveLength(2);
    });

    it('should filter by staffId', async () => {
      const results = await repository.findByTenantId(tenant.id, {
        staffId: staff.id,
      });
      expect(results).toHaveLength(1);
      expect(results[0].staffId).toBe(staff.id);
    });
  });
});
