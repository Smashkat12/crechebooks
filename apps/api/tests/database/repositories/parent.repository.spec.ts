import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { CreateParentDto } from '../../../src/database/dto/parent.dto';
import { PreferredContact } from '../../../src/database/entities/parent.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('ParentRepository', () => {
  let repository: ParentRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let otherTenant: Tenant;

  // Real test data - South African parent
  const testParentData: CreateParentDto = {
    tenantId: '', // Will be set in beforeEach
    firstName: 'Thabo',
    lastName: 'Mbeki',
    email: 'thabo@family.co.za',
    phone: '+27821234567',
    whatsapp: '+27821234567',
    preferredContact: PreferredContact.WHATSAPP,
    idNumber: '8501015800088',
    address: '45 Vilakazi Street, Soweto, Johannesburg',
    notes: 'Primary contact for billing',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ParentRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<ParentRepository>(ParentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

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
    testParentData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a parent with all fields', async () => {
      const parent = await repository.create(testParentData);

      expect(parent.id).toBeDefined();
      expect(parent.tenantId).toBe(testTenant.id);
      expect(parent.firstName).toBe(testParentData.firstName);
      expect(parent.lastName).toBe(testParentData.lastName);
      expect(parent.email).toBe(testParentData.email);
      expect(parent.phone).toBe(testParentData.phone);
      expect(parent.whatsapp).toBe(testParentData.whatsapp);
      expect(parent.preferredContact).toBe(PreferredContact.WHATSAPP);
      expect(parent.idNumber).toBe(testParentData.idNumber);
      expect(parent.address).toBe(testParentData.address);
      expect(parent.notes).toBe(testParentData.notes);
      expect(parent.isActive).toBe(true);
      expect(parent.xeroContactId).toBeNull();
      expect(parent.createdAt).toBeInstanceOf(Date);
      expect(parent.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a parent with minimum required fields', async () => {
      const minimalData: CreateParentDto = {
        tenantId: testTenant.id,
        firstName: 'Nomvula',
        lastName: 'Mokonyane',
      };

      const parent = await repository.create(minimalData);

      expect(parent.id).toBeDefined();
      expect(parent.firstName).toBe('Nomvula');
      expect(parent.lastName).toBe('Mokonyane');
      expect(parent.email).toBeNull();
      expect(parent.phone).toBeNull();
      expect(parent.whatsapp).toBeNull();
      expect(parent.preferredContact).toBe('EMAIL'); // default
      expect(parent.isActive).toBe(true);
    });

    it('should throw ConflictException for duplicate email per tenant', async () => {
      await repository.create(testParentData);

      // Try to create another parent with same email in same tenant
      const duplicateData: CreateParentDto = {
        ...testParentData,
        firstName: 'Different',
        lastName: 'Person',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same email for different tenants', async () => {
      await repository.create(testParentData);

      // Same email for different tenant should work
      const otherTenantData: CreateParentDto = {
        ...testParentData,
        tenantId: otherTenant.id,
      };

      const parent = await repository.create(otherTenantData);
      expect(parent.tenantId).toBe(otherTenant.id);
      expect(parent.email).toBe(testParentData.email);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateParentDto = {
        ...testParentData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find parent by id', async () => {
      const created = await repository.create(testParentData);
      const found = await repository.findById(created.id, testTenant.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.firstName).toBe(testParentData.firstName);
      expect(found?.lastName).toBe(testParentData.lastName);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        testTenant.id,
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return paginated results with metadata', async () => {
      await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });

      const result = await repository.findByTenant(testTenant.id, {});

      // TASK-DATA-004: Verify paginated response structure
      expect(result.data).toHaveLength(2);
      expect(result.meta).toBeDefined();
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20); // DEFAULT_LIMIT
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should apply default pagination when no params provided', async () => {
      // Create 3 parents
      await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });
      await repository.create({
        ...testParentData,
        firstName: 'Sipho',
        lastName: 'Nkosi',
        email: 'sipho@family.co.za',
      });

      const result = await repository.findByTenant(testTenant.id, {});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.data).toHaveLength(3);
    });

    it('should respect custom pagination parameters', async () => {
      // Create 5 parents for pagination test
      for (let i = 0; i < 5; i++) {
        await repository.create({
          ...testParentData,
          firstName: `Parent${i}`,
          lastName: `Test${i}`,
          email: `parent${i}@family.co.za`,
        });
      }

      // Request page 2 with limit 2
      const result = await repository.findByTenant(testTenant.id, {
        page: 2,
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(2);
      expect(result.meta.total).toBe(5);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
    });

    it('should enforce MAX_LIMIT when limit exceeds 100', async () => {
      await repository.create(testParentData);

      // Request limit of 500 - should be capped at MAX_LIMIT (100)
      const result = await repository.findByTenant(testTenant.id, {
        limit: 500,
      });

      expect(result.meta.limit).toBe(100);
    });

    it('should handle empty results correctly', async () => {
      const result = await repository.findByTenant(testTenant.id, {});

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should return accurate total count across pages', async () => {
      // Create 7 parents
      for (let i = 0; i < 7; i++) {
        await repository.create({
          ...testParentData,
          firstName: `Parent${i}`,
          lastName: `Test${i}`,
          email: `parent${i}@family.co.za`,
        });
      }

      // Check page 1
      const page1 = await repository.findByTenant(testTenant.id, {
        page: 1,
        limit: 3,
      });
      expect(page1.meta.total).toBe(7);
      expect(page1.data).toHaveLength(3);

      // Check page 3 (last page with 1 item)
      const page3 = await repository.findByTenant(testTenant.id, {
        page: 3,
        limit: 3,
      });
      expect(page3.meta.total).toBe(7);
      expect(page3.data).toHaveLength(1);
      expect(page3.meta.hasNext).toBe(false);
      expect(page3.meta.hasPrev).toBe(true);
    });

    it('should filter by isActive with pagination', async () => {
      const p1 = await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Inactive',
        lastName: 'Parent',
        email: 'inactive@family.co.za',
      });

      // Deactivate one parent
      await prisma.parent.update({
        where: { id: p1.id },
        data: { isActive: false },
      });

      const activeParents = await repository.findByTenant(testTenant.id, {
        isActive: true,
      });

      expect(activeParents.data).toHaveLength(1);
      expect(activeParents.data[0].firstName).toBe('Inactive');
      expect(activeParents.meta.total).toBe(1);
    });

    it('should search by firstName, lastName, or email with pagination', async () => {
      await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });

      const searchResult = await repository.findByTenant(testTenant.id, {
        search: 'thabo',
      });

      expect(searchResult.data).toHaveLength(1);
      expect(searchResult.data[0].firstName).toBe('Thabo');
      expect(searchResult.meta.total).toBe(1);
    });

    it('should order by lastName, firstName ascending with pagination', async () => {
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });
      await repository.create(testParentData); // Mbeki

      const result = await repository.findByTenant(testTenant.id, {});

      expect(result.data[0].lastName).toBe('Dlamini');
      expect(result.data[1].lastName).toBe('Mbeki');
    });

    it('should handle last page with hasNext=false', async () => {
      // Create exactly 10 parents
      for (let i = 0; i < 10; i++) {
        await repository.create({
          ...testParentData,
          firstName: `Parent${i}`,
          lastName: `Test${String(i).padStart(2, '0')}`,
          email: `parent${i}@family.co.za`,
        });
      }

      // Request last page
      const result = await repository.findByTenant(testTenant.id, {
        page: 2,
        limit: 5,
      });

      expect(result.data).toHaveLength(5);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(2);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(true);
    });
  });

  describe('findByEmail', () => {
    it('should find parent by email within tenant', async () => {
      await repository.create(testParentData);

      const found = await repository.findByEmail(
        testTenant.id,
        testParentData.email!,
      );

      expect(found).not.toBeNull();
      expect(found?.email).toBe(testParentData.email);
    });

    it('should return null for non-existent email', async () => {
      const found = await repository.findByEmail(
        testTenant.id,
        'nonexistent@test.co.za',
      );
      expect(found).toBeNull();
    });

    it('should respect tenant isolation', async () => {
      await repository.create(testParentData);

      // Same email but different tenant
      const found = await repository.findByEmail(
        otherTenant.id,
        testParentData.email!,
      );

      expect(found).toBeNull();
    });
  });

  describe('findByXeroContactId', () => {
    it('should find parent by xeroContactId', async () => {
      const created = await repository.create(testParentData);

      // Set xeroContactId directly
      await prisma.parent.update({
        where: { id: created.id },
        data: { xeroContactId: 'xero-contact-12345' },
      });

      const found = await repository.findByXeroContactId('xero-contact-12345');

      expect(found).not.toBeNull();
      expect(found?.xeroContactId).toBe('xero-contact-12345');
    });

    it('should return null for non-existent xeroContactId', async () => {
      const found = await repository.findByXeroContactId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update parent fields', async () => {
      const created = await repository.create(testParentData);

      const updated = await repository.update(created.id, testTenant.id, {
        firstName: 'Updated',
        phone: '+27829999999',
        preferredContact: PreferredContact.EMAIL,
      });

      expect(updated.firstName).toBe('Updated');
      expect(updated.phone).toBe('+27829999999');
      expect(updated.preferredContact).toBe(PreferredContact.EMAIL);
      expect(updated.lastName).toBe(testParentData.lastName); // unchanged
    });

    it('should throw NotFoundException for non-existent parent', async () => {
      await expect(
        repository.update(
          '00000000-0000-0000-0000-000000000000',
          testTenant.id,
          {
            firstName: 'Test',
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate email', async () => {
      const p1 = await repository.create(testParentData);
      const p2 = await repository.create({
        ...testParentData,
        firstName: 'Other',
        lastName: 'Parent',
        email: 'other@family.co.za',
      });

      // Try to update p2's email to p1's email
      await expect(
        repository.update(p2.id, testTenant.id, { email: p1.email! }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should delete existing parent', async () => {
      const created = await repository.create(testParentData);

      await repository.delete(created.id, testTenant.id);

      const found = await repository.findById(created.id, testTenant.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent parent', async () => {
      await expect(
        repository.delete(
          '00000000-0000-0000-0000-000000000000',
          testTenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should cascade delete to children', async () => {
      const parent = await repository.create(testParentData);

      // Create a child linked to this parent
      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: parent.id,
          firstName: 'Lerato',
          lastName: 'Mbeki',
          dateOfBirth: new Date('2021-03-15'),
        },
      });

      // Verify child exists
      const childBefore = await prisma.child.findUnique({
        where: { id: child.id },
      });
      expect(childBefore).not.toBeNull();

      // Delete parent
      await repository.delete(parent.id, testTenant.id);

      // Verify child is also deleted (cascade)
      const childAfter = await prisma.child.findUnique({
        where: { id: child.id },
      });
      expect(childAfter).toBeNull();
    });
  });
});
