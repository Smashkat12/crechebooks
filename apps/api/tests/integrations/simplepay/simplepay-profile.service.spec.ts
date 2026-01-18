/**
 * SimplePay Profile Service Tests
 * TASK-SPAY-006: SimplePay Profile Mapping Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayProfileService } from '../../../src/integrations/simplepay/simplepay-profile.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { ProfileMappingSyncRepository } from '../../../src/database/repositories/profile-mapping-sync.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { EncryptionService } from '../../../src/shared/services/encryption.service';
import { Tenant, Staff } from '@prisma/client';

describe('SimplePayProfileService', () => {
  let service: SimplePayProfileService;
  let prisma: PrismaService;
  let profileMappingRepo: ProfileMappingSyncRepository;
  let tenant: Tenant;
  let staff: Staff;

  // Mock API client methods
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockPatch = jest.fn();
  const mockDelete = jest.fn();
  const mockInitializeForTenant = jest.fn();
  const mockGetClientId = jest.fn().mockReturnValue('test-client-123');

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayProfileService,
        {
          provide: SimplePayApiClient,
          useValue: {
            get: mockGet,
            post: mockPost,
            patch: mockPatch,
            delete: mockDelete,
            initializeForTenant: mockInitializeForTenant,
            getClientId: mockGetClientId,
          },
        },
        SimplePayRepository,
        ProfileMappingSyncRepository,
        StaffRepository,
        PrismaService,
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest
              .fn()
              .mockImplementation((text) => `encrypted:${text}`),
            decrypt: jest
              .fn()
              .mockImplementation((text) => text.replace('encrypted:', '')),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SIMPLEPAY_API_URL: 'https://api.simplepay.co.za/v1',
                SIMPLEPAY_API_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SimplePayProfileService>(SimplePayProfileService);
    profileMappingRepo = module.get<ProfileMappingSyncRepository>(
      ProfileMappingSyncRepository,
    );
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockInitializeForTenant.mockResolvedValue(undefined);

    // Clean database in exact order - profileMappingSync and servicePeriodSync first
    await prisma.profileMappingSync.deleteMany({});
    await prisma.servicePeriodSync.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.simplePayPayslipImport.deleteMany({});
    await prisma.simplePayEmployeeMapping.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staffOffboarding.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

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
        basicSalaryCents: 2500000,
        isActive: true,
        position: 'Teacher',
      },
    });

    // Create SimplePay connection
    await prisma.simplePayConnection.create({
      data: {
        tenantId: tenant.id,
        clientId: 'test-client-123',
        apiKey: 'encrypted:test-api-key',
        isActive: true,
      },
    });

    // Create employee mapping
    await prisma.simplePayEmployeeMapping.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayEmployeeId: 'emp-123',
        syncStatus: 'SYNCED',
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('getAvailableProfiles', () => {
    it('should return available profiles from SimplePay', async () => {
      mockGet.mockResolvedValueOnce([
        {
          profile: {
            id: 100,
            name: 'Teacher Profile',
            description: 'Standard teacher calculation template',
            calculation_items: [{ id: 1 }, { id: 2 }],
            is_default: true,
          },
        },
        {
          profile: {
            id: 101,
            name: 'Admin Profile',
            description: 'Admin staff template',
            calculation_items: [{ id: 1 }],
            is_default: false,
          },
        },
      ]);

      const result = await service.getAvailableProfiles(tenant.id);

      expect(result.length).toBe(2);
      expect(result[0].id).toBe(100);
      expect(result[0].name).toBe('Teacher Profile');
      expect(result[0].calculationCount).toBe(2);
      expect(result[0].isDefault).toBe(true);
    });
  });

  describe('getEmployeeProfileMappings', () => {
    it('should return profile mappings for an employee', async () => {
      mockGet.mockResolvedValueOnce([
        {
          profile_mapping: {
            id: 12345,
            employee_id: 123,
            profile_id: 100,
            profile_name: 'Teacher Profile',
            calculation_settings: [
              {
                calculation_id: 1,
                calculation_code: 'BASIC',
                calculation_name: 'Basic Salary',
                is_enabled: true,
                amount_cents: null,
                percentage: null,
                formula: null,
              },
            ],
            created_at: '2024-01-15',
            updated_at: '2024-01-15',
          },
        },
      ]);

      const result = await service.getEmployeeProfileMappings(
        tenant.id,
        staff.id,
      );

      expect(result.length).toBe(1);
      expect(result[0].id).toBe(12345);
      expect(result[0].profile_name).toBe('Teacher Profile');
    });

    it('should throw error if staff is not linked to SimplePay', async () => {
      // Create unlinked staff
      const unlinkedStaff = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '8501015009088',
          email: 'jane@example.com',
          dateOfBirth: new Date('1985-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 2000000,
          isActive: true,
        },
      });

      await expect(
        service.getEmployeeProfileMappings(tenant.id, unlinkedStaff.id),
      ).rejects.toThrow('not linked to SimplePay');
    });
  });

  describe('assignProfile', () => {
    it('should assign a profile to an employee', async () => {
      mockPost.mockResolvedValueOnce({
        profile_mapping: {
          id: 12345,
          employee_id: 123,
          profile_id: 100,
          profile_name: 'Teacher Profile',
          calculation_settings: [],
          created_at: '2024-01-15',
          updated_at: '2024-01-15',
        },
      });

      const result = await service.assignProfile(tenant.id, {
        staffId: staff.id,
        profileId: 100,
      });

      expect(result.success).toBe(true);
      expect(result.simplePayMappingId).toBe(12345);
      expect(result.profileName).toBe('Teacher Profile');

      // Verify local record was created
      const localRecord = await profileMappingRepo.findBySimplePayMappingId(
        tenant.id,
        staff.id,
        12345,
      );
      expect(localRecord).toBeDefined();
    });

    it('should return error if staff is not linked', async () => {
      const unlinkedStaff = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '8501015009088',
          email: 'jane@example.com',
          dateOfBirth: new Date('1985-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 2000000,
          isActive: true,
        },
      });

      const result = await service.assignProfile(tenant.id, {
        staffId: unlinkedStaff.id,
        profileId: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not linked to SimplePay');
    });
  });

  describe('updateProfileMapping', () => {
    it('should update calculation settings', async () => {
      mockPatch.mockResolvedValueOnce({
        profile_mapping: {
          id: 12345,
          employee_id: 123,
          profile_id: 100,
          profile_name: 'Teacher Profile',
          calculation_settings: [
            {
              calculation_id: 1,
              calculation_code: 'BASIC',
              calculation_name: 'Basic Salary',
              is_enabled: false,
              amount_cents: null,
              percentage: null,
              formula: null,
            },
          ],
          created_at: '2024-01-15',
          updated_at: '2024-01-16',
        },
      });

      const result = await service.updateProfileMapping(tenant.id, staff.id, {
        mappingId: 12345,
        calculationSettings: [
          {
            calculationId: 1,
            isEnabled: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.updatedSettings[0].isEnabled).toBe(false);
    });
  });

  describe('removeProfileMapping', () => {
    it('should remove a profile mapping', async () => {
      mockDelete.mockResolvedValueOnce(undefined);

      // Create local record first
      await profileMappingRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayMappingId: 12345,
        simplePayProfileId: 100,
        profileName: 'Teacher Profile',
        calculationSettings: [],
      });

      const result = await service.removeProfileMapping(
        tenant.id,
        staff.id,
        12345,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('bulkAssignProfile', () => {
    it('should assign profile to multiple employees', async () => {
      // Create second staff member
      const staff2 = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '8501015009088',
          email: 'jane@example.com',
          dateOfBirth: new Date('1985-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 2000000,
          isActive: true,
        },
      });

      // Link second staff to SimplePay
      await prisma.simplePayEmployeeMapping.create({
        data: {
          tenantId: tenant.id,
          staffId: staff2.id,
          simplePayEmployeeId: 'emp-456',
          syncStatus: 'SYNCED',
        },
      });

      mockPost
        .mockResolvedValueOnce({
          profile_mapping: {
            id: 12345,
            profile_id: 100,
            profile_name: 'Teacher Profile',
            calculation_settings: [],
          },
        })
        .mockResolvedValueOnce({
          profile_mapping: {
            id: 12346,
            profile_id: 100,
            profile_name: 'Teacher Profile',
            calculation_settings: [],
          },
        });

      const result = await service.bulkAssignProfile(tenant.id, {
        profileId: 100,
        staffIds: [staff.id, staff2.id],
      });

      expect(result.totalRequested).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      mockPost
        .mockResolvedValueOnce({
          profile_mapping: {
            id: 12345,
            profile_id: 100,
            profile_name: 'Teacher Profile',
            calculation_settings: [],
          },
        })
        .mockRejectedValueOnce(new Error('API error'));

      // Create second staff member without SimplePay link
      const unlinkedStaff = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '8501015009088',
          email: 'jane@example.com',
          dateOfBirth: new Date('1985-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 2000000,
          isActive: true,
        },
      });

      const result = await service.bulkAssignProfile(tenant.id, {
        profileId: 100,
        staffIds: [staff.id, unlinkedStaff.id],
      });

      expect(result.totalRequested).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('getSuggestedProfileForRole', () => {
    it('should suggest profiles based on staff role', async () => {
      // Mock must return profile name that matches CRECHE_PROFILES['FULL_TIME_TEACHER'] = 'Full-Time Teacher'
      mockGet.mockResolvedValueOnce([
        {
          profile: {
            id: 100,
            name: 'Full-Time Teacher',
            description: null,
            calculation_items: [],
            is_default: false,
          },
        },
      ]);

      const result = await service.getSuggestedProfileForRole(
        tenant.id,
        staff.id,
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].matchReason).toContain('Teacher');
    });

    it('should suggest default profile when no role match', async () => {
      // Create staff without matching role
      const adminStaff = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Mike',
          lastName: 'Smith',
          idNumber: '7001015009089',
          email: 'mike@example.com',
          dateOfBirth: new Date('1970-01-01'),
          startDate: new Date('2024-01-15'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 3000000,
          isActive: true,
          position: 'Janitor', // No matching profile type
        },
      });

      mockGet.mockResolvedValueOnce([
        {
          profile: {
            id: 100,
            name: 'Default Profile',
            description: null,
            calculation_items: [],
            is_default: true,
          },
        },
      ]);

      const result = await service.getSuggestedProfileForRole(
        tenant.id,
        adminStaff.id,
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getLocalSyncRecords', () => {
    it('should return local sync records', async () => {
      await profileMappingRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayMappingId: 12345,
        simplePayProfileId: 100,
        profileName: 'Teacher Profile',
        calculationSettings: [],
      });

      const result = await service.getLocalSyncRecords(tenant.id);

      expect(result.length).toBe(1);
      expect(result[0].profileName).toBe('Teacher Profile');
    });
  });

  describe('toggleCalculation', () => {
    it('should toggle a specific calculation', async () => {
      // Create local mapping
      await profileMappingRepo.create({
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
        ],
      });

      mockPatch.mockResolvedValueOnce({
        profile_mapping: {
          id: 12345,
          profile_id: 100,
          profile_name: 'Teacher Profile',
          calculation_settings: [
            {
              calculation_id: 1,
              calculation_code: 'BASIC',
              calculation_name: 'Basic Salary',
              is_enabled: false,
              amount_cents: null,
              percentage: null,
              formula: null,
            },
          ],
        },
      });

      const result = await service.toggleCalculation(
        tenant.id,
        staff.id,
        12345,
        1,
        false,
      );

      expect(result.success).toBe(true);
    });

    it('should return error if mapping not found', async () => {
      const result = await service.toggleCalculation(
        tenant.id,
        staff.id,
        99999,
        1,
        false,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
