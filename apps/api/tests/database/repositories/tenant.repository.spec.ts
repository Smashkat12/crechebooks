import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { CreateTenantDto } from '../../../src/database/dto/tenant.dto';
import {
  TaxStatus,
  SubscriptionStatus,
} from '../../../src/database/entities/tenant.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';

describe('TenantRepository', () => {
  let repository: TenantRepository;
  let prisma: PrismaService;

  // Real test data - South African creche
  const testTenantData: CreateTenantDto = {
    name: 'Little Stars Creche',
    tradingName: 'Little Stars ECD',
    registrationNumber: '2024/123456/07',
    vatNumber: '4123456789',
    taxStatus: TaxStatus.VAT_REGISTERED,
    addressLine1: '123 Main Street',
    addressLine2: 'Sandton Central',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2196',
    phone: '+27114561234',
    email: 'admin@littlestars.co.za',
    invoiceDayOfMonth: 1,
    invoiceDueDays: 7,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TenantRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<TenantRepository>(TenantRepository);

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
  });

  describe('create', () => {
    it('should create a new tenant with all fields', async () => {
      const tenant = await repository.create(testTenantData);

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe(testTenantData.name);
      expect(tenant.tradingName).toBe(testTenantData.tradingName);
      expect(tenant.email).toBe(testTenantData.email);
      expect(tenant.taxStatus).toBe(TaxStatus.VAT_REGISTERED);
      expect(tenant.subscriptionStatus).toBe(SubscriptionStatus.TRIAL);
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });

    it('should create tenant with minimum required fields', async () => {
      const minimalData: CreateTenantDto = {
        name: 'Minimal Creche',
        addressLine1: '1 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: 'test@minimal.co.za',
      };

      const tenant = await repository.create(minimalData);

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe(minimalData.name);
      expect(tenant.taxStatus).toBe(TaxStatus.NOT_REGISTERED); // default
      expect(tenant.subscriptionStatus).toBe(SubscriptionStatus.TRIAL); // default
      expect(tenant.invoiceDayOfMonth).toBe(1); // default
      expect(tenant.invoiceDueDays).toBe(7); // default
    });

    it('should throw ConflictException for duplicate email', async () => {
      await repository.create(testTenantData);

      await expect(repository.create(testTenantData)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findById', () => {
    it('should find tenant by id', async () => {
      const created = await repository.create(testTenantData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(testTenantData.email);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.findByIdOrThrow('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should find tenant by email', async () => {
      await repository.create(testTenantData);
      const found = await repository.findByEmail(testTenantData.email);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(testTenantData.email);
    });

    it('should return null for non-existent email', async () => {
      const found = await repository.findByEmail('nonexistent@test.com');
      expect(found).toBeNull();
    });
  });

  describe('findByXeroTenantId', () => {
    it('should find tenant by xeroTenantId', async () => {
      const dataWithXero = { ...testTenantData, xeroTenantId: 'xero-12345' };
      await repository.create(dataWithXero);

      const found = await repository.findByXeroTenantId('xero-12345');

      expect(found).not.toBeNull();
      expect(found?.xeroTenantId).toBe('xero-12345');
    });

    it('should return null for non-existent xeroTenantId', async () => {
      const found = await repository.findByXeroTenantId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update tenant fields', async () => {
      const created = await repository.create(testTenantData);

      const updated = await repository.update(created.id, {
        name: 'Updated Stars Creche',
        taxStatus: TaxStatus.NOT_REGISTERED,
      });

      expect(updated.name).toBe('Updated Stars Creche');
      expect(updated.taxStatus).toBe(TaxStatus.NOT_REGISTERED);
      expect(updated.email).toBe(testTenantData.email); // unchanged
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          name: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all tenants ordered by createdAt desc', async () => {
      const tenant1 = await repository.create(testTenantData);
      const tenant2 = await repository.create({
        ...testTenantData,
        email: 'second@test.co.za',
        name: 'Second Creche',
      });

      const all = await repository.findAll();

      expect(all).toHaveLength(2);
      expect(all[0].id).toBe(tenant2.id); // newer first
      expect(all[1].id).toBe(tenant1.id);
    });

    it('should return empty array when no tenants exist', async () => {
      const all = await repository.findAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete existing tenant', async () => {
      const created = await repository.create(testTenantData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
