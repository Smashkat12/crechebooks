import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { CreateChildDto } from '../../../src/database/dto/child.dto';
import { Gender } from '../../../src/database/entities/child.entity';
import { NotFoundException } from '../../../src/shared/exceptions';
import { Tenant, Parent } from '@prisma/client';

describe('ChildRepository', () => {
  let repository: ChildRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let otherParent: Parent;

  // Real test data - South African child
  const testChildData: CreateChildDto = {
    tenantId: '', // Will be set in beforeEach
    parentId: '', // Will be set in beforeEach
    firstName: 'Lerato',
    lastName: 'Mbeki',
    dateOfBirth: new Date('2021-03-15'),
    gender: Gender.FEMALE,
    medicalNotes: 'Allergic to peanuts',
    emergencyContact: 'Grandmother - Nomvula Mbeki',
    emergencyPhone: '+27829876543',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ChildRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<ChildRepository>(ChildRepository);

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

    // Create another parent for testing
    otherParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
        phone: '+27829876543',
      },
    });

    // Update test data with created IDs
    testChildData.tenantId = testTenant.id;
    testChildData.parentId = testParent.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a child with all fields', async () => {
      const child = await repository.create(testChildData);

      expect(child.id).toBeDefined();
      expect(child.tenantId).toBe(testTenant.id);
      expect(child.parentId).toBe(testParent.id);
      expect(child.firstName).toBe(testChildData.firstName);
      expect(child.lastName).toBe(testChildData.lastName);
      expect(child.dateOfBirth).toBeInstanceOf(Date);
      expect(child.gender).toBe(Gender.FEMALE);
      expect(child.medicalNotes).toBe(testChildData.medicalNotes);
      expect(child.emergencyContact).toBe(testChildData.emergencyContact);
      expect(child.emergencyPhone).toBe(testChildData.emergencyPhone);
      expect(child.isActive).toBe(true);
      expect(child.createdAt).toBeInstanceOf(Date);
      expect(child.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a child with minimum required fields', async () => {
      const minimalData: CreateChildDto = {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Sipho',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2022-06-20'),
      };

      const child = await repository.create(minimalData);

      expect(child.id).toBeDefined();
      expect(child.firstName).toBe('Sipho');
      expect(child.lastName).toBe('Mbeki');
      expect(child.gender).toBeNull();
      expect(child.medicalNotes).toBeNull();
      expect(child.emergencyContact).toBeNull();
      expect(child.emergencyPhone).toBeNull();
      expect(child.isActive).toBe(true);
    });

    it('should throw NotFoundException for non-existent parent', async () => {
      const invalidData: CreateChildDto = {
        ...testChildData,
        parentId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateChildDto = {
        ...testChildData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find child by id', async () => {
      const created = await repository.create(testChildData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.firstName).toBe(testChildData.firstName);
      expect(found?.lastName).toBe(testChildData.lastName);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByParent', () => {
    it('should return all children for parent', async () => {
      await repository.create(testChildData);
      await repository.create({
        ...testChildData,
        firstName: 'Sipho',
        gender: Gender.MALE,
      });

      const children = await repository.findByParent(testTenant.id, testParent.id);

      expect(children).toHaveLength(2);
    });

    it('should return empty array for parent with no children', async () => {
      const children = await repository.findByParent(testTenant.id, otherParent.id);
      expect(children).toHaveLength(0);
    });

    it('should order by lastName, firstName ascending', async () => {
      await repository.create({
        ...testChildData,
        firstName: 'Zanele',
        lastName: 'Zulu',
      });
      await repository.create(testChildData); // Lerato Mbeki

      const children = await repository.findByParent(testTenant.id, testParent.id);

      expect(children[0].lastName).toBe('Mbeki');
      expect(children[1].lastName).toBe('Zulu');
    });
  });

  describe('findByTenant', () => {
    it('should return all children for tenant', async () => {
      await repository.create(testChildData);
      await repository.create({
        ...testChildData,
        parentId: otherParent.id,
        firstName: 'Thandi',
        lastName: 'Dlamini',
      });

      const children = await repository.findByTenant(testTenant.id, {});

      expect(children).toHaveLength(2);
    });

    it('should filter by parentId', async () => {
      await repository.create(testChildData);
      await repository.create({
        ...testChildData,
        parentId: otherParent.id,
        firstName: 'Thandi',
        lastName: 'Dlamini',
      });

      const children = await repository.findByTenant(testTenant.id, {
        parentId: testParent.id,
      });

      expect(children).toHaveLength(1);
      expect(children[0].parentId).toBe(testParent.id);
    });

    it('should filter by isActive', async () => {
      const c1 = await repository.create(testChildData);
      await repository.create({
        ...testChildData,
        firstName: 'Active',
        lastName: 'Child',
      });

      // Deactivate one child
      await prisma.child.update({
        where: { id: c1.id },
        data: { isActive: false },
      });

      const activeChildren = await repository.findByTenant(testTenant.id, { isActive: true });

      expect(activeChildren).toHaveLength(1);
      expect(activeChildren[0].firstName).toBe('Active');
    });

    it('should search by firstName or lastName', async () => {
      await repository.create(testChildData);
      await repository.create({
        ...testChildData,
        firstName: 'Thandi',
        lastName: 'Dlamini',
      });

      const searchResult = await repository.findByTenant(testTenant.id, { search: 'lerato' });

      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].firstName).toBe('Lerato');
    });
  });

  describe('update', () => {
    it('should update child fields', async () => {
      const created = await repository.create(testChildData);

      const updated = await repository.update(created.id, {
        firstName: 'Updated',
        medicalNotes: 'Updated medical notes',
        gender: Gender.OTHER,
      });

      expect(updated.firstName).toBe('Updated');
      expect(updated.medicalNotes).toBe('Updated medical notes');
      expect(updated.gender).toBe(Gender.OTHER);
      expect(updated.lastName).toBe(testChildData.lastName); // unchanged
    });

    it('should throw NotFoundException for non-existent child', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', { firstName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow changing parent', async () => {
      const created = await repository.create(testChildData);
      expect(created.parentId).toBe(testParent.id);

      const updated = await repository.update(created.id, {
        parentId: otherParent.id,
      });

      expect(updated.parentId).toBe(otherParent.id);
    });

    it('should throw NotFoundException for non-existent new parentId', async () => {
      const created = await repository.create(testChildData);

      await expect(
        repository.update(created.id, {
          parentId: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete existing child', async () => {
      const created = await repository.create(testChildData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent child', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAgeInMonths', () => {
    it('should calculate age in months correctly', async () => {
      // Create a child born 2 years and 3 months ago
      const now = new Date();
      const dob = new Date(now.getFullYear() - 2, now.getMonth() - 3, now.getDate());

      const created = await repository.create({
        ...testChildData,
        dateOfBirth: dob,
      });

      const ageInMonths = repository.getAgeInMonths(created);

      expect(ageInMonths).toBe(27); // 2 years * 12 months + 3 months
    });

    it('should handle day-of-month adjustments', async () => {
      // Create a child where birthday this month hasn't happened yet
      const now = new Date();
      const dob = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 15);

      // Only test if we're not near the end of the month
      if (now.getDate() <= 15) {
        const created = await repository.create({
          ...testChildData,
          dateOfBirth: dob,
        });

        const ageInMonths = repository.getAgeInMonths(created);

        // Should be 11 months, not 12, because birthday hasn't happened yet this month
        expect(ageInMonths).toBe(11);
      }
    });

    it('should handle young children (< 12 months)', async () => {
      // Create a child born 6 months ago
      const now = new Date();
      const dob = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

      const created = await repository.create({
        ...testChildData,
        dateOfBirth: dob,
      });

      const ageInMonths = repository.getAgeInMonths(created);

      expect(ageInMonths).toBe(6);
    });
  });

  describe('cascade delete from parent', () => {
    it('should be deleted when parent is deleted', async () => {
      const child = await repository.create(testChildData);

      // Verify child exists
      const childBefore = await repository.findById(child.id);
      expect(childBefore).not.toBeNull();

      // Delete parent
      await prisma.parent.delete({
        where: { id: testParent.id },
      });

      // Verify child is also deleted (cascade)
      const childAfter = await repository.findById(child.id);
      expect(childAfter).toBeNull();
    });
  });
});
