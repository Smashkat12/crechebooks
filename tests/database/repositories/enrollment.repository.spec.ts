import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { CreateEnrollmentDto } from '../../../src/database/dto/enrollment.dto';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import { FeeType } from '../../../src/database/entities/fee-structure.entity';
import { NotFoundException } from '../../../src/shared/exceptions';
import { Tenant, Parent, Child, FeeStructure } from '@prisma/client';

describe('EnrollmentRepository', () => {
  let repository: EnrollmentRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testFeeStructure: FeeStructure;
  let otherChild: Child;
  let otherFeeStructure: FeeStructure;

  // Real test data - South African child enrollment
  const testEnrollmentData: CreateEnrollmentDto = {
    tenantId: '', // Will be set in beforeEach
    childId: '', // Will be set in beforeEach
    feeStructureId: '', // Will be set in beforeEach
    startDate: new Date('2025-01-15'),
    status: EnrollmentStatus.ACTIVE,
    siblingDiscountApplied: false,
    notes: 'Standard enrollment for 2025 school year',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, EnrollmentRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<EnrollmentRepository>(EnrollmentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
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

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Thabo',
        lastName: 'Mbeki',
        email: 'thabo@family.co.za',
        phone: '+27821234567',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Lerato',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2021-03-15'),
      },
    });

    // Create another child for testing
    otherChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Sipho',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2022-06-20'),
      },
    });

    // Create test fee structure
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Full Day Care',
        feeType: 'FULL_DAY',
        amountCents: 450000,
        effectiveFrom: new Date('2025-01-01'),
      },
    });

    // Create another fee structure for testing
    otherFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Half Day Care',
        feeType: 'HALF_DAY',
        amountCents: 275000,
        effectiveFrom: new Date('2025-01-01'),
      },
    });

    // Update test data with created IDs
    testEnrollmentData.tenantId = testTenant.id;
    testEnrollmentData.childId = testChild.id;
    testEnrollmentData.feeStructureId = testFeeStructure.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create an enrollment with all fields', async () => {
      const enrollment = await repository.create(testEnrollmentData);

      expect(enrollment.id).toBeDefined();
      expect(enrollment.tenantId).toBe(testTenant.id);
      expect(enrollment.childId).toBe(testChild.id);
      expect(enrollment.feeStructureId).toBe(testFeeStructure.id);
      expect(enrollment.startDate).toBeInstanceOf(Date);
      expect(enrollment.endDate).toBeNull();
      expect(enrollment.status).toBe(EnrollmentStatus.ACTIVE);
      expect(enrollment.siblingDiscountApplied).toBe(false);
      expect(enrollment.customFeeOverrideCents).toBeNull();
      expect(enrollment.notes).toBe(testEnrollmentData.notes);
      expect(enrollment.createdAt).toBeInstanceOf(Date);
      expect(enrollment.updatedAt).toBeInstanceOf(Date);
    });

    it('should create an enrollment with minimum required fields', async () => {
      const minimalData: CreateEnrollmentDto = {
        tenantId: testTenant.id,
        childId: testChild.id,
        feeStructureId: testFeeStructure.id,
        startDate: new Date('2025-02-01'),
      };

      const enrollment = await repository.create(minimalData);

      expect(enrollment.id).toBeDefined();
      expect(enrollment.status).toBe('ACTIVE'); // default
      expect(enrollment.siblingDiscountApplied).toBe(false); // default
      expect(enrollment.customFeeOverrideCents).toBeNull();
      expect(enrollment.notes).toBeNull();
      expect(enrollment.endDate).toBeNull();
    });

    it('should create an enrollment with custom fee override', async () => {
      const dataWithOverride: CreateEnrollmentDto = {
        ...testEnrollmentData,
        siblingDiscountApplied: true,
        customFeeOverrideCents: 400000, // R4,000.00 (discounted from R4,500)
      };

      const enrollment = await repository.create(dataWithOverride);

      expect(enrollment.siblingDiscountApplied).toBe(true);
      expect(enrollment.customFeeOverrideCents).toBe(400000);
    });

    it('should throw NotFoundException for non-existent child', async () => {
      const invalidData: CreateEnrollmentDto = {
        ...testEnrollmentData,
        childId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent fee structure', async () => {
      const invalidData: CreateEnrollmentDto = {
        ...testEnrollmentData,
        feeStructureId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateEnrollmentDto = {
        ...testEnrollmentData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find enrollment by id', async () => {
      const created = await repository.create(testEnrollmentData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.childId).toBe(testChild.id);
      expect(found?.feeStructureId).toBe(testFeeStructure.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all enrollments for tenant', async () => {
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
      });

      const enrollments = await repository.findByTenant(testTenant.id, {});

      expect(enrollments).toHaveLength(2);
    });

    it('should filter by childId', async () => {
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
      });

      const enrollments = await repository.findByTenant(testTenant.id, {
        childId: testChild.id,
      });

      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].childId).toBe(testChild.id);
    });

    it('should filter by feeStructureId', async () => {
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
        feeStructureId: otherFeeStructure.id,
      });

      const enrollments = await repository.findByTenant(testTenant.id, {
        feeStructureId: testFeeStructure.id,
      });

      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].feeStructureId).toBe(testFeeStructure.id);
    });

    it('should filter by status', async () => {
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
        status: EnrollmentStatus.PENDING,
      });

      const activeEnrollments = await repository.findByTenant(testTenant.id, {
        status: EnrollmentStatus.ACTIVE,
      });

      expect(activeEnrollments).toHaveLength(1);
      expect(activeEnrollments[0].status).toBe(EnrollmentStatus.ACTIVE);
    });

    it('should order by startDate descending', async () => {
      await repository.create({
        ...testEnrollmentData,
        startDate: new Date('2025-01-01'),
      });
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
        startDate: new Date('2025-06-01'),
      });

      const enrollments = await repository.findByTenant(testTenant.id, {});

      expect(enrollments[0].startDate.getMonth()).toBe(5); // June (newer first)
      expect(enrollments[1].startDate.getMonth()).toBe(0); // January
    });
  });

  describe('findByChild', () => {
    it('should return all enrollments for a child', async () => {
      // Create current enrollment
      await repository.create(testEnrollmentData);

      // Create historical enrollment (different fee structure)
      await repository.create({
        ...testEnrollmentData,
        feeStructureId: otherFeeStructure.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        status: EnrollmentStatus.GRADUATED,
      });

      const enrollments = await repository.findByChild(testTenant.id, testChild.id);

      expect(enrollments).toHaveLength(2);
    });

    it('should return empty array for child with no enrollments', async () => {
      const enrollments = await repository.findByChild(testTenant.id, otherChild.id);
      expect(enrollments).toHaveLength(0);
    });
  });

  describe('findActiveByChild', () => {
    it('should return active enrollment for child', async () => {
      await repository.create(testEnrollmentData);

      const active = await repository.findActiveByChild(testTenant.id, testChild.id);

      expect(active).not.toBeNull();
      expect(active?.status).toBe(EnrollmentStatus.ACTIVE);
    });

    it('should return null for child with no active enrollment', async () => {
      // Create withdrawn enrollment
      await repository.create({
        ...testEnrollmentData,
        status: EnrollmentStatus.WITHDRAWN,
      });

      const active = await repository.findActiveByChild(testTenant.id, testChild.id);

      expect(active).toBeNull();
    });

    it('should return most recent active enrollment if multiple exist', async () => {
      // This shouldn't normally happen, but test the behavior
      await repository.create({
        ...testEnrollmentData,
        startDate: new Date('2024-06-01'),
      });
      await repository.create({
        ...testEnrollmentData,
        feeStructureId: otherFeeStructure.id,
        startDate: new Date('2025-01-15'),
      });

      const active = await repository.findActiveByChild(testTenant.id, testChild.id);

      expect(active).not.toBeNull();
      expect(active?.startDate.getMonth()).toBe(0); // January 2025 (most recent)
    });
  });

  describe('findByStatus', () => {
    it('should return enrollments with specific status', async () => {
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        childId: otherChild.id,
        status: EnrollmentStatus.PENDING,
      });

      const pendingEnrollments = await repository.findByStatus(
        testTenant.id,
        EnrollmentStatus.PENDING,
      );

      expect(pendingEnrollments).toHaveLength(1);
      expect(pendingEnrollments[0].status).toBe(EnrollmentStatus.PENDING);
    });
  });

  describe('update', () => {
    it('should update enrollment fields', async () => {
      const created = await repository.create(testEnrollmentData);

      const updated = await repository.update(created.id, {
        status: EnrollmentStatus.WITHDRAWN,
        endDate: new Date('2025-06-30'),
        notes: 'Updated notes',
      });

      expect(updated.status).toBe(EnrollmentStatus.WITHDRAWN);
      expect(updated.endDate).toBeInstanceOf(Date);
      expect(updated.notes).toBe('Updated notes');
      expect(updated.childId).toBe(testChild.id); // unchanged
    });

    it('should throw NotFoundException for non-existent enrollment', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          status: EnrollmentStatus.WITHDRAWN,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow changing fee structure', async () => {
      const created = await repository.create(testEnrollmentData);

      const updated = await repository.update(created.id, {
        feeStructureId: otherFeeStructure.id,
      });

      expect(updated.feeStructureId).toBe(otherFeeStructure.id);
    });

    it('should throw NotFoundException for non-existent new feeStructureId', async () => {
      const created = await repository.create(testEnrollmentData);

      await expect(
        repository.update(created.id, {
          feeStructureId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow adding custom fee override', async () => {
      const created = await repository.create(testEnrollmentData);

      const updated = await repository.update(created.id, {
        siblingDiscountApplied: true,
        customFeeOverrideCents: 380000,
      });

      expect(updated.siblingDiscountApplied).toBe(true);
      expect(updated.customFeeOverrideCents).toBe(380000);
    });
  });

  describe('delete', () => {
    it('should delete existing enrollment', async () => {
      const created = await repository.create(testEnrollmentData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent enrollment', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('withdraw', () => {
    it('should withdraw enrollment', async () => {
      const created = await repository.create(testEnrollmentData);

      const withdrawn = await repository.withdraw(created.id);

      expect(withdrawn.status).toBe('WITHDRAWN');
      expect(withdrawn.endDate).toBeInstanceOf(Date);
      // End date should be set to today (date-only field, no time comparison)
      const now = new Date();
      const endDate = new Date(withdrawn.endDate!);
      expect(endDate.getFullYear()).toBe(now.getFullYear());
      expect(endDate.getMonth()).toBe(now.getMonth());
      expect(endDate.getDate()).toBe(now.getDate());
    });

    it('should throw NotFoundException for non-existent enrollment', async () => {
      await expect(
        repository.withdraw('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cascade delete from child', () => {
    it('should be deleted when child is deleted', async () => {
      const enrollment = await repository.create(testEnrollmentData);

      // Verify enrollment exists
      const enrollmentBefore = await repository.findById(enrollment.id);
      expect(enrollmentBefore).not.toBeNull();

      // Delete child (parent of enrollment)
      await prisma.child.delete({
        where: { id: testChild.id },
      });

      // Verify enrollment is also deleted (cascade)
      const enrollmentAfter = await repository.findById(enrollment.id);
      expect(enrollmentAfter).toBeNull();
    });

    it('should delete multiple enrollments when child is deleted', async () => {
      // Create multiple enrollments for same child
      await repository.create(testEnrollmentData);
      await repository.create({
        ...testEnrollmentData,
        feeStructureId: otherFeeStructure.id,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        status: EnrollmentStatus.GRADUATED,
      });

      // Verify both exist
      const beforeDelete = await repository.findByChild(testTenant.id, testChild.id);
      expect(beforeDelete).toHaveLength(2);

      // Delete child
      await prisma.child.delete({
        where: { id: testChild.id },
      });

      // Both enrollments should be gone
      // We can't use findByChild anymore since child doesn't exist
      // Instead, check the enrollments table directly
      const allEnrollments = await prisma.enrollment.findMany({
        where: { tenantId: testTenant.id },
      });
      expect(allEnrollments).toHaveLength(0);
    });
  });

  describe('cascade delete from parent', () => {
    it('should be deleted when parent is deleted (through child cascade)', async () => {
      const enrollment = await repository.create(testEnrollmentData);

      // Verify enrollment exists
      const enrollmentBefore = await repository.findById(enrollment.id);
      expect(enrollmentBefore).not.toBeNull();

      // Delete parent (cascades to child, then to enrollment)
      await prisma.parent.delete({
        where: { id: testParent.id },
      });

      // Verify enrollment is also deleted (double cascade)
      const enrollmentAfter = await repository.findById(enrollment.id);
      expect(enrollmentAfter).toBeNull();
    });
  });

  describe('date handling', () => {
    it('should store dates correctly (date only, no time)', async () => {
      const startDate = new Date('2025-03-15');
      const endDate = new Date('2025-12-31');

      const created = await repository.create({
        ...testEnrollmentData,
        startDate,
        endDate,
      });

      // Dates should be stored correctly
      expect(created.startDate.getFullYear()).toBe(2025);
      expect(created.startDate.getMonth()).toBe(2); // March (0-indexed)
      expect(created.startDate.getDate()).toBe(15);

      expect(created.endDate?.getFullYear()).toBe(2025);
      expect(created.endDate?.getMonth()).toBe(11); // December
      expect(created.endDate?.getDate()).toBe(31);
    });
  });

  describe('status transitions', () => {
    it('should handle all status values', async () => {
      // Test PENDING
      const pending = await repository.create({
        ...testEnrollmentData,
        status: EnrollmentStatus.PENDING,
      });
      expect(pending.status).toBe(EnrollmentStatus.PENDING);

      // Update to ACTIVE
      const active = await repository.update(pending.id, {
        status: EnrollmentStatus.ACTIVE,
      });
      expect(active.status).toBe(EnrollmentStatus.ACTIVE);

      // Update to GRADUATED
      const graduated = await repository.update(pending.id, {
        status: EnrollmentStatus.GRADUATED,
        endDate: new Date('2025-12-15'),
      });
      expect(graduated.status).toBe(EnrollmentStatus.GRADUATED);
    });
  });
});
