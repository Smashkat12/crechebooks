import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { CreateParentDto } from '../../../src/database/dto/parent.dto';
import { PreferredContact } from '../../../src/database/entities/parent.entity';
import { NotFoundException, ConflictException } from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

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

      await expect(repository.create(duplicateData)).rejects.toThrow(ConflictException);
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

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find parent by id', async () => {
      const created = await repository.create(testParentData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.firstName).toBe(testParentData.firstName);
      expect(found?.lastName).toBe(testParentData.lastName);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all parents for tenant', async () => {
      await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });

      const parents = await repository.findByTenant(testTenant.id, {});

      expect(parents).toHaveLength(2);
    });

    it('should filter by isActive', async () => {
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

      const activeParents = await repository.findByTenant(testTenant.id, { isActive: true });

      expect(activeParents).toHaveLength(1);
      expect(activeParents[0].firstName).toBe('Inactive');
    });

    it('should search by firstName, lastName, or email', async () => {
      await repository.create(testParentData);
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });

      const searchResult = await repository.findByTenant(testTenant.id, { search: 'thabo' });

      expect(searchResult).toHaveLength(1);
      expect(searchResult[0].firstName).toBe('Thabo');
    });

    it('should order by lastName, firstName ascending', async () => {
      await repository.create({
        ...testParentData,
        firstName: 'Zanele',
        lastName: 'Dlamini',
        email: 'zanele@family.co.za',
      });
      await repository.create(testParentData); // Mbeki

      const parents = await repository.findByTenant(testTenant.id, {});

      expect(parents[0].lastName).toBe('Dlamini');
      expect(parents[1].lastName).toBe('Mbeki');
    });
  });

  describe('findByEmail', () => {
    it('should find parent by email within tenant', async () => {
      await repository.create(testParentData);

      const found = await repository.findByEmail(testTenant.id, testParentData.email!);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(testParentData.email);
    });

    it('should return null for non-existent email', async () => {
      const found = await repository.findByEmail(testTenant.id, 'nonexistent@test.co.za');
      expect(found).toBeNull();
    });

    it('should respect tenant isolation', async () => {
      await repository.create(testParentData);

      // Same email but different tenant
      const found = await repository.findByEmail(otherTenant.id, testParentData.email!);

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

      const updated = await repository.update(created.id, {
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
        repository.update('00000000-0000-0000-0000-000000000000', { firstName: 'Test' }),
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
      await expect(repository.update(p2.id, { email: p1.email! })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('delete', () => {
    it('should delete existing parent', async () => {
      const created = await repository.create(testParentData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent parent', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
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
      const childBefore = await prisma.child.findUnique({ where: { id: child.id } });
      expect(childBefore).not.toBeNull();

      // Delete parent
      await repository.delete(parent.id);

      // Verify child is also deleted (cascade)
      const childAfter = await prisma.child.findUnique({ where: { id: child.id } });
      expect(childAfter).toBeNull();
    });
  });
});
