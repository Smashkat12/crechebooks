/**
 * Profile Mapping Sync Repository Tests
 * TASK-SPAY-006: SimplePay Profile Mapping Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ProfileMappingSyncRepository } from '../../../src/database/repositories/profile-mapping-sync.repository';
import { CreateProfileMappingSyncDto } from '../../../src/database/dto/profile.dto';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant, Staff } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('ProfileMappingSyncRepository', () => {
  let repository: ProfileMappingSyncRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ProfileMappingSyncRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<ProfileMappingSyncRepository>(
      ProfileMappingSyncRepository,
    );

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    // Create test staff
    staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Thabo',
        lastName: 'Mokoena',
        idNumber: '9001015009087',
        email: 'thabo@example.com',
        phone: '+27821234567',
        dateOfBirth: new Date('1990-01-01'),
        startDate: new Date('2024-01-15'),
        employmentType: 'PERMANENT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 2500000, // R25,000
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // Test data for profile mapping syncs
  const createTestProfileMappingData = (): CreateProfileMappingSyncDto => ({
    tenantId: tenant.id,
    staffId: staff.id,
    simplePayMappingId: 12345,
    simplePayProfileId: 100,
    profileName: 'Teacher Profile',
    calculationSettings: [
      {
        calculation_id: 1,
        calculation_code: 'BASIC',
        calculation_name: 'Basic Salary',
        is_enabled: true,
        amount_cents: null,
        percentage: null,
        formula: null,
      },
      {
        calculation_id: 2,
        calculation_code: 'UIF',
        calculation_name: 'UIF Contribution',
        is_enabled: true,
        amount_cents: null,
        percentage: 1,
        formula: null,
      },
    ],
  });

  describe('create', () => {
    it('should create a profile mapping sync', async () => {
      const data = createTestProfileMappingData();
      const result = await repository.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.staffId).toBe(staff.id);
      expect(result.simplePayMappingId).toBe(12345);
      expect(result.simplePayProfileId).toBe(100);
      expect(result.profileName).toBe('Teacher Profile');
      expect(result.calculationSettings).toBeDefined();
    });

    it('should throw ConflictException for duplicate tenant/staff/mapping combination', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      await expect(repository.create(data)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const data = createTestProfileMappingData();
      data.tenantId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      const data = createTestProfileMappingData();
      data.staffId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find a profile mapping sync by ID with matching tenant', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      const result = await repository.findById(created.id, tenant.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const result = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        tenant.id,
      );
      expect(result).toBeNull();
    });

    it('should return null for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Daycare',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27217654321',
          email: `other${Date.now()}@otherdaycare.co.za`,
        },
      });

      // Try to access profile mapping with different tenant ID
      const result = await repository.findById(created.id, otherTenant.id);

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should find a profile mapping sync by ID with matching tenant', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      const result = await repository.findByIdOrThrow(created.id, tenant.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(created.id);
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.findByIdOrThrow(
          '00000000-0000-0000-0000-000000000000',
          tenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Daycare 2',
          addressLine1: '789 Other Street',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4001',
          phone: '+27317654321',
          email: `other2-${Date.now()}@otherdaycare.co.za`,
        },
      });

      await expect(
        repository.findByIdOrThrow(created.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySimplePayMappingId', () => {
    it('should find by SimplePay mapping ID', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      const result = await repository.findBySimplePayMappingId(
        tenant.id,
        staff.id,
        12345,
      );

      expect(result).toBeDefined();
      expect(result?.simplePayMappingId).toBe(12345);
    });

    it('should return null for non-existent mapping ID', async () => {
      const result = await repository.findBySimplePayMappingId(
        tenant.id,
        staff.id,
        99999,
      );
      expect(result).toBeNull();
    });
  });

  describe('findByStaff', () => {
    it('should find all profile mappings for a staff member', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      // Create second mapping
      await repository.create({
        ...data,
        simplePayMappingId: 12346,
        simplePayProfileId: 101,
        profileName: 'Assistant Profile',
      });

      const results = await repository.findByStaff(tenant.id, staff.id);

      expect(results.length).toBe(2);
    });

    it('should return empty array for staff with no mappings', async () => {
      const results = await repository.findByStaff(tenant.id, staff.id);
      expect(results).toEqual([]);
    });
  });

  describe('findByTenant', () => {
    it('should find all profile mappings for a tenant', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      const results = await repository.findByTenant(tenant.id);

      expect(results.length).toBe(1);
    });

    it('should filter by profile ID', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);
      await repository.create({
        ...data,
        simplePayMappingId: 12346,
        simplePayProfileId: 101,
      });

      const results = await repository.findByTenant(tenant.id, {
        profileId: 100,
      });

      expect(results.length).toBe(1);
      expect(results[0].simplePayProfileId).toBe(100);
    });

    it('should filter by profile name', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      const results = await repository.findByTenant(tenant.id, {
        profileName: 'Teacher',
      });

      expect(results.length).toBe(1);
    });
  });

  describe('findByProfile', () => {
    it('should find all mappings for a specific profile', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      const results = await repository.findByProfile(tenant.id, 100);

      expect(results.length).toBe(1);
      expect(results[0].simplePayProfileId).toBe(100);
    });
  });

  describe('update', () => {
    it('should update a profile mapping sync', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      const result = await repository.update(created.id, {
        profileName: 'Updated Profile Name',
      });

      expect(result.profileName).toBe('Updated Profile Name');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          profileName: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsert', () => {
    it('should create when record does not exist', async () => {
      const data = createTestProfileMappingData();
      const result = await repository.upsert(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should update when record exists', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.upsert(data);

      const updatedData: CreateProfileMappingSyncDto = {
        ...data,
        profileName: 'Updated via Upsert',
      };

      const result = await repository.upsert(updatedData);

      expect(result.id).toBe(created.id);
      expect(result.profileName).toBe('Updated via Upsert');
    });
  });

  describe('delete', () => {
    it('TC-002: should delete a profile mapping sync with correct tenant', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      await repository.delete(created.id, tenant.id);

      const result = await repository.findById(created.id, tenant.id);
      expect(result).toBeNull();
    });

    it('TC-001: should throw NotFoundException when deleting with wrong tenant (cross-tenant deletion blocked)', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Daycare Delete',
          addressLine1: '456 Delete Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27217654321',
          email: `other-delete-${Date.now()}@otherdaycare.co.za`,
        },
      });

      // Attempt cross-tenant deletion - should fail
      await expect(
        repository.delete(created.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);

      // Verify original record still exists
      const result = await repository.findById(created.id, tenant.id);
      expect(result).not.toBeNull();
    });

    it('TC-003: should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('TC-004: error message should not leak tenant information', async () => {
      const data = createTestProfileMappingData();
      const created = await repository.create(data);

      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Leak Test Daycare',
          addressLine1: '789 Test Street',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4001',
          phone: '+27317654321',
          email: `leak-test-${Date.now()}@daycare.co.za`,
        },
      });

      try {
        await repository.delete(created.id, otherTenant.id);
        fail('Expected NotFoundException to be thrown');
      } catch (error) {
        // Error message should be generic "not found" - not reveal tenant ownership
        expect(error.message).not.toContain(tenant.id);
        expect(error.message).not.toContain(otherTenant.id);
        expect(error.message).not.toContain('wrong tenant');
        expect(error.message).not.toContain('different tenant');
      }
    });
  });

  describe('deleteBySimplePayMappingId', () => {
    it('should delete by SimplePay mapping ID', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      await repository.deleteBySimplePayMappingId(tenant.id, staff.id, 12345);

      const result = await repository.findBySimplePayMappingId(
        tenant.id,
        staff.id,
        12345,
      );
      expect(result).toBeNull();
    });

    it('should throw NotFoundException for non-existent mapping ID', async () => {
      await expect(
        repository.deleteBySimplePayMappingId(tenant.id, staff.id, 99999),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteByStaff', () => {
    it('should delete all mappings for a staff member', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);
      await repository.create({
        ...data,
        simplePayMappingId: 12346,
      });

      const deletedCount = await repository.deleteByStaff(tenant.id, staff.id);

      expect(deletedCount).toBe(2);

      const results = await repository.findByStaff(tenant.id, staff.id);
      expect(results.length).toBe(0);
    });
  });

  describe('getStaffIdsByProfile', () => {
    it('should return staff IDs that have a profile assigned', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);

      const staffIds = await repository.getStaffIdsByProfile(tenant.id, 100);

      expect(staffIds).toContain(staff.id);
    });
  });

  describe('getUniqueProfileIds', () => {
    it('should return unique profile IDs for a tenant', async () => {
      const data = createTestProfileMappingData();
      await repository.create(data);
      await repository.create({
        ...data,
        simplePayMappingId: 12346,
        simplePayProfileId: 101,
      });

      const profileIds = await repository.getUniqueProfileIds(tenant.id);

      expect(profileIds).toContain(100);
      expect(profileIds).toContain(101);
      expect(profileIds.length).toBe(2);
    });
  });
});
