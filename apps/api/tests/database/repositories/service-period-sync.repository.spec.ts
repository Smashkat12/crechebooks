/**
 * Service Period Sync Repository Tests
 * TASK-SPAY-004: SimplePay Service Period Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ServicePeriodSyncRepository } from '../../../src/database/repositories/service-period-sync.repository';
import { CreateServicePeriodSyncDto } from '../../../src/database/dto/service-period.dto';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant, Staff, TerminationCode } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('ServicePeriodSyncRepository', () => {
  let repository: ServicePeriodSyncRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ServicePeriodSyncRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<ServicePeriodSyncRepository>(
      ServicePeriodSyncRepository,
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

  // Test data for service period syncs
  const createTestServicePeriodData = (): CreateServicePeriodSyncDto => ({
    tenantId: tenant.id,
    staffId: staff.id,
    simplePayEmployeeId: 'emp_123',
    simplePayPeriodId: 'sp_456',
    startDate: new Date('2024-01-15'),
    isActive: true,
  });

  describe('create', () => {
    it('should create a service period sync', async () => {
      const data = createTestServicePeriodData();
      const result = await repository.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.staffId).toBe(staff.id);
      expect(result.simplePayEmployeeId).toBe('emp_123');
      expect(result.simplePayPeriodId).toBe('sp_456');
      expect(result.isActive).toBe(true);
      expect(result.terminationCode).toBeNull();
    });

    it('should throw ConflictException for duplicate tenant/staff/period combination', async () => {
      const data = createTestServicePeriodData();
      await repository.create(data);

      await expect(repository.create(data)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const data = createTestServicePeriodData();
      data.tenantId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      const data = createTestServicePeriodData();
      data.staffId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should create a terminated service period with SA UI-19 code', async () => {
      const data: CreateServicePeriodSyncDto = {
        ...createTestServicePeriodData(),
        terminationCode: 'RETRENCHMENT',
        terminationReason: 'Operational requirements',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
        isActive: false,
      };

      const result = await repository.create(data);

      expect(result.terminationCode).toBe('RETRENCHMENT');
      expect(result.terminationReason).toBe('Operational requirements');
      expect(result.isActive).toBe(false);
    });
  });

  describe('findById', () => {
    it('should find a service period sync by ID with matching tenant', async () => {
      const data = createTestServicePeriodData();
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
      const data = createTestServicePeriodData();
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

      // Try to access service period sync with different tenant ID
      const result = await repository.findById(created.id, otherTenant.id);

      expect(result).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should find a service period sync by ID with matching tenant', async () => {
      const data = createTestServicePeriodData();
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
      const data = createTestServicePeriodData();
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

  describe('findByStaff', () => {
    it('should find all service periods for a staff member', async () => {
      const data = createTestServicePeriodData();
      await repository.create(data);

      // Create second period (e.g., after reinstatement)
      await repository.create({
        ...data,
        simplePayPeriodId: 'sp_789',
        startDate: new Date('2024-07-01'),
      });

      const results = await repository.findByStaff(tenant.id, staff.id);

      expect(results.length).toBe(2);
    });

    it('should return empty array for staff with no service periods', async () => {
      const results = await repository.findByStaff(tenant.id, staff.id);
      expect(results).toEqual([]);
    });
  });

  describe('findActiveByStaff', () => {
    it('should find the active service period for a staff member', async () => {
      const data = createTestServicePeriodData();
      await repository.create(data);

      const result = await repository.findActiveByStaff(tenant.id, staff.id);

      expect(result).toBeDefined();
      expect(result?.isActive).toBe(true);
    });

    it('should return null when no active period exists', async () => {
      const data: CreateServicePeriodSyncDto = {
        ...createTestServicePeriodData(),
        isActive: false,
        endDate: new Date('2024-06-30'),
      };
      await repository.create(data);

      const result = await repository.findActiveByStaff(tenant.id, staff.id);
      expect(result).toBeNull();
    });
  });

  describe('markTerminated', () => {
    it('should mark a service period as terminated with UI-19 code', async () => {
      const data = createTestServicePeriodData();
      const created = await repository.create(data);

      const terminationCode: TerminationCode = 'RESIGNATION';
      const endDate = new Date('2024-06-30');
      const lastWorkingDay = new Date('2024-06-28');
      const terminationReason = 'Employee accepted new position';

      const result = await repository.markTerminated(
        created.id,
        terminationCode,
        endDate,
        lastWorkingDay,
        terminationReason,
        null,
      );

      expect(result.terminationCode).toBe('RESIGNATION');
      expect(result.endDate).toEqual(endDate);
      expect(result.lastWorkingDay).toEqual(lastWorkingDay);
      expect(result.terminationReason).toBe(terminationReason);
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.markTerminated(
          '00000000-0000-0000-0000-000000000000',
          'RESIGNATION',
          new Date(),
          new Date(),
          null,
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('undoTermination', () => {
    it('should undo termination when no final payslip processed', async () => {
      // Create and terminate
      const data = createTestServicePeriodData();
      const created = await repository.create(data);

      await repository.markTerminated(
        created.id,
        'RESIGNATION',
        new Date('2024-06-30'),
        new Date('2024-06-28'),
        'Testing',
        null,
      );

      // Undo termination
      const result = await repository.undoTermination(created.id, tenant.id);

      expect(result.terminationCode).toBeNull();
      expect(result.endDate).toBeNull();
      expect(result.lastWorkingDay).toBeNull();
      expect(result.terminationReason).toBeNull();
      expect(result.isActive).toBe(true);
    });

    it('should throw ConflictException when final payslip is processed', async () => {
      const data = createTestServicePeriodData();
      const created = await repository.create(data);

      // Terminate with final payslip
      await repository.markTerminated(
        created.id,
        'RESIGNATION',
        new Date('2024-06-30'),
        new Date('2024-06-28'),
        'Testing',
        'payslip_123', // Final payslip ID
      );

      await expect(
        repository.undoTermination(created.id, tenant.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = createTestServicePeriodData();
      const created = await repository.create(data);

      // Terminate
      await repository.markTerminated(
        created.id,
        'RESIGNATION',
        new Date('2024-06-30'),
        new Date('2024-06-28'),
        'Testing',
        null,
      );

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Daycare Undo',
          addressLine1: '999 Other Street',
          city: 'Pretoria',
          province: 'Gauteng',
          postalCode: '0001',
          phone: '+27127654321',
          email: `other-undo-${Date.now()}@otherdaycare.co.za`,
        },
      });

      await expect(
        repository.undoTermination(created.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findTerminatedByPeriod', () => {
    it('should find terminated employees within a date range', async () => {
      // Create terminated period
      await repository.create({
        ...createTestServicePeriodData(),
        terminationCode: 'RETRENCHMENT',
        endDate: new Date('2024-06-15'),
        isActive: false,
      });

      const results = await repository.findTerminatedByPeriod(
        tenant.id,
        new Date('2024-06-01'),
        new Date('2024-06-30'),
      );

      expect(results.length).toBe(1);
      expect(results[0].terminationCode).toBe('RETRENCHMENT');
    });
  });

  describe('findByTerminationCode', () => {
    it('should find all service periods with a specific termination code', async () => {
      // Create terminated period with retrenchment
      await repository.create({
        ...createTestServicePeriodData(),
        terminationCode: 'RETRENCHMENT',
        endDate: new Date('2024-06-30'),
        isActive: false,
      });

      const results = await repository.findByTerminationCode(
        tenant.id,
        'RETRENCHMENT',
      );

      expect(results.length).toBe(1);
      expect(results[0].terminationCode).toBe('RETRENCHMENT');
    });
  });

  describe('upsert', () => {
    it('should create when record does not exist', async () => {
      const data = createTestServicePeriodData();
      const result = await repository.upsert(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should update when record exists', async () => {
      const data = createTestServicePeriodData();
      const created = await repository.upsert(data);

      const updatedData: CreateServicePeriodSyncDto = {
        ...data,
        terminationCode: 'RETIREMENT',
        endDate: new Date('2024-12-31'),
        isActive: false,
      };

      const result = await repository.upsert(updatedData);

      expect(result.id).toBe(created.id);
      expect(result.terminationCode).toBe('RETIREMENT');
      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('TC-002: should delete a service period sync with correct tenant', async () => {
      const data = createTestServicePeriodData();
      const created = await repository.create(data);

      await repository.delete(created.id, tenant.id);

      const result = await repository.findById(created.id, tenant.id);
      expect(result).toBeNull();
    });

    it('TC-001: should throw NotFoundException when deleting with wrong tenant (cross-tenant deletion blocked)', async () => {
      const data = createTestServicePeriodData();
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
      const data = createTestServicePeriodData();
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

  describe('SA UI-19 Termination Codes', () => {
    const testCases: Array<{ code: TerminationCode; description: string }> = [
      { code: 'RESIGNATION', description: 'Code 1: Voluntary resignation' },
      {
        code: 'DISMISSAL_MISCONDUCT',
        description: 'Code 2: Dismissal for misconduct',
      },
      {
        code: 'DISMISSAL_INCAPACITY',
        description: 'Code 3: Dismissal for incapacity',
      },
      { code: 'RETRENCHMENT', description: 'Code 4: Retrenchment' },
      { code: 'CONTRACT_EXPIRY', description: 'Code 5: Contract expiry' },
      { code: 'RETIREMENT', description: 'Code 6: Retirement' },
      { code: 'DEATH', description: 'Code 7: Death' },
      { code: 'ABSCONDED', description: 'Code 8: Absconded' },
      { code: 'TRANSFER', description: 'Code 9: Transfer' },
    ];

    testCases.forEach(({ code, description }) => {
      it(`should store ${description}`, async () => {
        const data: CreateServicePeriodSyncDto = {
          ...createTestServicePeriodData(),
          simplePayPeriodId: `sp_${code}`,
          terminationCode: code,
          endDate: new Date('2024-06-30'),
          isActive: false,
        };

        const result = await repository.create(data);

        expect(result.terminationCode).toBe(code);
      });
    });
  });
});
