import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { CreateFeeStructureDto } from '../../../src/database/dto/fee-structure.dto';
import { FeeType } from '../../../src/database/entities/fee-structure.entity';
import {
  NotFoundException,
  DatabaseException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('FeeStructureRepository', () => {
  let repository: FeeStructureRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  // Real test data - South African creche fee structure
  const testFeeStructureData: CreateFeeStructureDto = {
    tenantId: '', // Will be set in beforeEach
    name: 'Full Day Care',
    description: 'Standard full day care from 7am to 5pm',
    feeType: FeeType.FULL_DAY,
    amountCents: 450000, // R4,500.00
    vatInclusive: true,
    siblingDiscountPercent: 10,
    effectiveFrom: new Date('2025-01-01'),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, FeeStructureRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<FeeStructureRepository>(FeeStructureRepository);

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

    // Update test data with the created tenant ID
    testFeeStructureData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a fee structure with all fields', async () => {
      const feeStructure = await repository.create(testFeeStructureData);

      expect(feeStructure.id).toBeDefined();
      expect(feeStructure.tenantId).toBe(testTenant.id);
      expect(feeStructure.name).toBe(testFeeStructureData.name);
      expect(feeStructure.description).toBe(testFeeStructureData.description);
      expect(feeStructure.feeType).toBe(FeeType.FULL_DAY);
      expect(feeStructure.amountCents).toBe(450000);
      expect(feeStructure.vatInclusive).toBe(true);
      expect(Number(feeStructure.siblingDiscountPercent)).toBe(10);
      expect(feeStructure.effectiveFrom).toBeInstanceOf(Date);
      expect(feeStructure.effectiveTo).toBeNull();
      expect(feeStructure.isActive).toBe(true);
      expect(feeStructure.createdAt).toBeInstanceOf(Date);
      expect(feeStructure.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a fee structure with minimum required fields', async () => {
      const minimalData: CreateFeeStructureDto = {
        tenantId: testTenant.id,
        name: 'Half Day Care',
        feeType: FeeType.HALF_DAY,
        amountCents: 275000, // R2,750.00
        effectiveFrom: new Date('2025-01-01'),
      };

      const feeStructure = await repository.create(minimalData);

      expect(feeStructure.id).toBeDefined();
      expect(feeStructure.name).toBe('Half Day Care');
      expect(feeStructure.feeType).toBe(FeeType.HALF_DAY);
      expect(feeStructure.amountCents).toBe(275000);
      expect(feeStructure.description).toBeNull();
      expect(feeStructure.vatInclusive).toBe(true); // default
      expect(feeStructure.siblingDiscountPercent).toBeNull();
      expect(feeStructure.effectiveTo).toBeNull();
      expect(feeStructure.isActive).toBe(true);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateFeeStructureDto = {
        ...testFeeStructureData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle different fee types', async () => {
      const hourlyData: CreateFeeStructureDto = {
        ...testFeeStructureData,
        name: 'Hourly Rate',
        feeType: FeeType.HOURLY,
        amountCents: 5000, // R50.00 per hour
      };

      const feeStructure = await repository.create(hourlyData);
      expect(feeStructure.feeType).toBe(FeeType.HOURLY);

      const customData: CreateFeeStructureDto = {
        ...testFeeStructureData,
        name: 'Custom Package',
        feeType: FeeType.CUSTOM,
        amountCents: 350000,
      };

      const customFeeStructure = await repository.create(customData);
      expect(customFeeStructure.feeType).toBe(FeeType.CUSTOM);
    });
  });

  describe('findById', () => {
    it('should find fee structure by id', async () => {
      const created = await repository.create(testFeeStructureData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe(testFeeStructureData.name);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all fee structures for tenant', async () => {
      await repository.create(testFeeStructureData);
      await repository.create({
        ...testFeeStructureData,
        name: 'Half Day Care',
        feeType: FeeType.HALF_DAY,
        amountCents: 275000,
      });

      const feeStructures = await repository.findByTenant(testTenant.id, {});

      expect(feeStructures).toHaveLength(2);
    });

    it('should filter by isActive', async () => {
      const fs1 = await repository.create(testFeeStructureData);
      await repository.create({
        ...testFeeStructureData,
        name: 'Half Day Care',
        feeType: FeeType.HALF_DAY,
      });

      // Deactivate one
      await prisma.feeStructure.update({
        where: { id: fs1.id },
        data: { isActive: false },
      });

      const activeFeeStructures = await repository.findByTenant(testTenant.id, {
        isActive: true,
      });

      expect(activeFeeStructures).toHaveLength(1);
      expect(activeFeeStructures[0].name).toBe('Half Day Care');
    });

    it('should filter by feeType', async () => {
      await repository.create(testFeeStructureData);
      await repository.create({
        ...testFeeStructureData,
        name: 'Half Day Care',
        feeType: FeeType.HALF_DAY,
      });

      const halfDayStructures = await repository.findByTenant(testTenant.id, {
        feeType: FeeType.HALF_DAY,
      });

      expect(halfDayStructures).toHaveLength(1);
      expect(halfDayStructures[0].feeType).toBe(FeeType.HALF_DAY);
    });

    it('should order by name ascending', async () => {
      await repository.create({
        ...testFeeStructureData,
        name: 'Zebra Package',
      });
      await repository.create({
        ...testFeeStructureData,
        name: 'Alpha Package',
        feeType: FeeType.HALF_DAY,
      });

      const feeStructures = await repository.findByTenant(testTenant.id, {});

      expect(feeStructures[0].name).toBe('Alpha Package');
      expect(feeStructures[1].name).toBe('Zebra Package');
    });
  });

  describe('findActiveByTenant', () => {
    it('should return only active fee structures', async () => {
      const fs1 = await repository.create(testFeeStructureData);
      await repository.create({
        ...testFeeStructureData,
        name: 'Half Day Care',
        feeType: FeeType.HALF_DAY,
      });

      // Deactivate one
      await prisma.feeStructure.update({
        where: { id: fs1.id },
        data: { isActive: false },
      });

      const activeFeeStructures = await repository.findActiveByTenant(
        testTenant.id,
      );

      expect(activeFeeStructures).toHaveLength(1);
      expect(activeFeeStructures[0].name).toBe('Half Day Care');
    });
  });

  describe('findEffectiveOnDate', () => {
    it('should find fee structures effective on a specific date', async () => {
      // Structure effective from Jan 1, 2025
      await repository.create({
        ...testFeeStructureData,
        name: 'Current Package',
        effectiveFrom: new Date('2025-01-01'),
      });

      // Structure effective from June 1, 2025
      await repository.create({
        ...testFeeStructureData,
        name: 'Future Package',
        feeType: FeeType.HALF_DAY,
        effectiveFrom: new Date('2025-06-01'),
      });

      // Check for Feb 1, 2025 - should only find "Current Package"
      const effectiveInFeb = await repository.findEffectiveOnDate(
        testTenant.id,
        new Date('2025-02-01'),
      );

      expect(effectiveInFeb).toHaveLength(1);
      expect(effectiveInFeb[0].name).toBe('Current Package');

      // Check for July 1, 2025 - should find both
      const effectiveInJuly = await repository.findEffectiveOnDate(
        testTenant.id,
        new Date('2025-07-01'),
      );

      expect(effectiveInJuly).toHaveLength(2);
    });

    it('should respect effectiveTo date', async () => {
      // Structure with end date
      await repository.create({
        ...testFeeStructureData,
        name: 'Limited Package',
        effectiveFrom: new Date('2025-01-01'),
        effectiveTo: new Date('2025-03-31'),
      });

      // Check before end date
      const beforeEnd = await repository.findEffectiveOnDate(
        testTenant.id,
        new Date('2025-02-15'),
      );
      expect(beforeEnd).toHaveLength(1);

      // Check after end date
      const afterEnd = await repository.findEffectiveOnDate(
        testTenant.id,
        new Date('2025-04-15'),
      );
      expect(afterEnd).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update fee structure fields', async () => {
      const created = await repository.create(testFeeStructureData);

      const updated = await repository.update(created.id, {
        name: 'Updated Package',
        amountCents: 500000,
        siblingDiscountPercent: 15,
      });

      expect(updated.name).toBe('Updated Package');
      expect(updated.amountCents).toBe(500000);
      expect(Number(updated.siblingDiscountPercent)).toBe(15);
      expect(updated.feeType).toBe(FeeType.FULL_DAY); // unchanged
    });

    it('should throw NotFoundException for non-existent fee structure', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate a fee structure', async () => {
      const created = await repository.create(testFeeStructureData);
      expect(created.isActive).toBe(true);

      const deactivated = await repository.deactivate(created.id);

      expect(deactivated.isActive).toBe(false);
    });

    it('should throw NotFoundException for non-existent fee structure', async () => {
      await expect(
        repository.deactivate('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete existing fee structure', async () => {
      const created = await repository.create(testFeeStructureData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent fee structure', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw DatabaseException when enrollments exist', async () => {
      const feeStructure = await repository.create(testFeeStructureData);

      // Create parent and child for enrollment
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Thabo',
          lastName: 'Mbeki',
          email: 'thabo@family.co.za',
        },
      });

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Lerato',
          lastName: 'Mbeki',
          dateOfBirth: new Date('2021-03-15'),
        },
      });

      // Create enrollment linking child to fee structure
      await prisma.enrollment.create({
        data: {
          tenantId: testTenant.id,
          childId: child.id,
          feeStructureId: feeStructure.id,
          startDate: new Date('2025-01-15'),
        },
      });

      // Now try to delete fee structure - should fail
      await expect(repository.delete(feeStructure.id)).rejects.toThrow(
        DatabaseException,
      );
    });
  });

  describe('decimal precision', () => {
    it('should handle siblingDiscountPercent decimal correctly', async () => {
      const data: CreateFeeStructureDto = {
        ...testFeeStructureData,
        siblingDiscountPercent: 12.5, // 12.5%
      };

      const created = await repository.create(data);

      // Prisma returns Decimal type, convert to number for comparison
      expect(Number(created.siblingDiscountPercent)).toBeCloseTo(12.5, 2);
    });
  });

  describe('date handling', () => {
    it('should store dates correctly (date only, no time)', async () => {
      const effectiveFrom = new Date('2025-03-15');
      const effectiveTo = new Date('2025-12-31');

      const created = await repository.create({
        ...testFeeStructureData,
        effectiveFrom,
        effectiveTo,
      });

      // Dates should be stored correctly
      expect(created.effectiveFrom.getFullYear()).toBe(2025);
      expect(created.effectiveFrom.getMonth()).toBe(2); // March (0-indexed)
      expect(created.effectiveFrom.getDate()).toBe(15);

      expect(created.effectiveTo?.getFullYear()).toBe(2025);
      expect(created.effectiveTo?.getMonth()).toBe(11); // December
      expect(created.effectiveTo?.getDate()).toBe(31);
    });
  });
});
