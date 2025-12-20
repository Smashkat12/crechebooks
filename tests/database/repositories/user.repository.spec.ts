import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { UserRepository } from '../../../src/database/repositories/user.repository';
import { CreateUserDto, UpdateUserDto } from '../../../src/database/dto/user.dto';
import { UserRole } from '../../../src/database/entities/user.entity';
import { NotFoundException, ConflictException } from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('UserRepository', () => {
  let repository: UserRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  // Real test data - South African creche user
  const testUserData: CreateUserDto = {
    auth0Id: 'auth0|507f1f77bcf86cd799439011',
    tenantId: '', // Will be set in beforeEach
    email: 'john.doe@littlestars.co.za',
    name: 'John Doe',
    role: UserRole.ADMIN,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, UserRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<UserRepository>(UserRepository);

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

    // Create a test tenant for user tests
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27114561234',
        email: 'admin@littlestars.co.za',
      },
    });

    // Update test user data with the created tenant ID
    testUserData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a user with valid data', async () => {
      const user = await repository.create(testUserData);

      expect(user.id).toBeDefined();
      expect(user.auth0Id).toBe(testUserData.auth0Id);
      expect(user.tenantId).toBe(testTenant.id);
      expect(user.email).toBe(testUserData.email);
      expect(user.name).toBe(testUserData.name);
      expect(user.role).toBe(UserRole.ADMIN);
      expect(user.isActive).toBe(true); // default
      expect(user.lastLoginAt).toBeNull();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a user with minimum required fields', async () => {
      const minimalData: CreateUserDto = {
        auth0Id: 'auth0|minimal123456789',
        tenantId: testTenant.id,
        email: 'minimal@test.co.za',
        name: 'Jane Smith',
        role: UserRole.VIEWER,
      };

      const user = await repository.create(minimalData);

      expect(user.id).toBeDefined();
      expect(user.auth0Id).toBe(minimalData.auth0Id);
      expect(user.email).toBe(minimalData.email);
      expect(user.name).toBe(minimalData.name);
      expect(user.role).toBe(UserRole.VIEWER);
      expect(user.isActive).toBe(true); // default
      expect(user.lastLoginAt).toBeNull(); // default
    });

    it('should throw ConflictException for duplicate auth0Id', async () => {
      await repository.create(testUserData);

      // Try to create another user with same auth0Id
      const duplicateData: CreateUserDto = {
        ...testUserData,
        email: 'different@email.co.za', // different email
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate tenantId+email', async () => {
      await repository.create(testUserData);

      // Try to create another user with same email in same tenant
      const duplicateData: CreateUserDto = {
        ...testUserData,
        auth0Id: 'auth0|different123456', // different auth0Id
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateUserDto = {
        ...testUserData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const created = await repository.create(testUserData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(testUserData.email);
      expect(found?.auth0Id).toBe(testUserData.auth0Id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByAuth0Id', () => {
    it('should find user by auth0Id', async () => {
      await repository.create(testUserData);
      const found = await repository.findByAuth0Id(testUserData.auth0Id);

      expect(found).not.toBeNull();
      expect(found?.auth0Id).toBe(testUserData.auth0Id);
      expect(found?.email).toBe(testUserData.email);
    });

    it('should return null for non-existent auth0Id', async () => {
      const found = await repository.findByAuth0Id('auth0|nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findByTenantAndEmail', () => {
    it('should find user by tenant and email', async () => {
      await repository.create(testUserData);
      const found = await repository.findByTenantAndEmail(
        testTenant.id,
        testUserData.email,
      );

      expect(found).not.toBeNull();
      expect(found?.tenantId).toBe(testTenant.id);
      expect(found?.email).toBe(testUserData.email);
    });

    it('should return null for non-existent combination', async () => {
      const found = await repository.findByTenantAndEmail(
        testTenant.id,
        'nonexistent@test.co.za',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all users for tenant', async () => {
      const user1 = await repository.create(testUserData);
      const user2 = await repository.create({
        ...testUserData,
        auth0Id: 'auth0|second123456',
        email: 'jane.smith@littlestars.co.za',
        name: 'Jane Smith',
      });

      const users = await repository.findByTenant(testTenant.id);

      expect(users).toHaveLength(2);
      expect(users[0].id).toBe(user2.id); // newer first (createdAt desc)
      expect(users[1].id).toBe(user1.id);
    });

    it('should return empty array when no users exist', async () => {
      const users = await repository.findByTenant(testTenant.id);
      expect(users).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update user fields', async () => {
      const created = await repository.create(testUserData);

      const updateData: UpdateUserDto = {
        name: 'Johnny Updated',
        role: UserRole.ACCOUNTANT,
      };

      const updated = await repository.update(created.id, updateData);

      expect(updated.name).toBe('Johnny Updated');
      expect(updated.role).toBe(UserRole.ACCOUNTANT);
      expect(updated.email).toBe(testUserData.email); // unchanged
      expect(updated.auth0Id).toBe(testUserData.auth0Id); // unchanged
    });

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          name: 'Test User',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate email in tenant', async () => {
      // Create two users
      const user1 = await repository.create(testUserData);
      const user2 = await repository.create({
        ...testUserData,
        auth0Id: 'auth0|second123456',
        email: 'jane.smith@littlestars.co.za',
      });

      // Try to update user2's email to user1's email
      await expect(
        repository.update(user2.id, { email: user1.email }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateLastLogin', () => {
    it('should update lastLoginAt timestamp', async () => {
      const created = await repository.create(testUserData);
      expect(created.lastLoginAt).toBeNull();

      const beforeUpdate = new Date();
      const updated = await repository.updateLastLogin(created.id);

      expect(updated.lastLoginAt).not.toBeNull();
      expect(updated.lastLoginAt).toBeInstanceOf(Date);
      expect(updated.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime(),
      );
    });

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(
        repository.updateLastLogin('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      const created = await repository.create(testUserData);
      expect(created.isActive).toBe(true);

      const deactivated = await repository.deactivate(created.id);

      expect(deactivated.isActive).toBe(false);
      expect(deactivated.id).toBe(created.id);
      expect(deactivated.email).toBe(created.email); // other fields unchanged
    });

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(
        repository.deactivate('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
