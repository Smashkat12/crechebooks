/**
 * SimplePay Service Period Service Tests
 * TASK-SPAY-004: SimplePay Service Period Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SimplePayServicePeriodService } from '../../../src/integrations/simplepay/simplepay-service-period.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { ServicePeriodSyncRepository } from '../../../src/database/repositories/service-period-sync.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../../src/shared/services/encryption.service';
import {
  TERMINATION_CODE_MAP,
  UIF_ELIGIBILITY,
} from '../../../src/database/entities/service-period.entity';
import { Tenant, Staff, TerminationCode } from '@prisma/client';

describe('SimplePayServicePeriodService', () => {
  let service: SimplePayServicePeriodService;
  let servicePeriodRepo: ServicePeriodSyncRepository;
  let staffRepo: StaffRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;

  // Mock API client methods
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockPatch = jest.fn();
  const mockDelete = jest.fn();
  const mockInitializeForTenant = jest.fn();
  const mockGetClientId = jest.fn().mockReturnValue('test-client-123');

  // Mock findEmployeeMapping
  const mockFindEmployeeMapping = jest.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayServicePeriodService,
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
        {
          provide: SimplePayRepository,
          useValue: {
            findEmployeeMapping: mockFindEmployeeMapping,
          },
        },
        ServicePeriodSyncRepository,
        StaffRepository,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SIMPLEPAY_API_URL: 'https://api.simplepay.co.za/v1',
                SIMPLEPAY_API_KEY: 'test-key',
                ENCRYPTION_KEY:
                  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
              };
              return config[key];
            }),
          },
        },
        EncryptionService,
      ],
    }).compile();

    service = module.get<SimplePayServicePeriodService>(
      SimplePayServicePeriodService,
    );
    servicePeriodRepo = module.get<ServicePeriodSyncRepository>(
      ServicePeriodSyncRepository,
    );
    staffRepo = module.get<StaffRepository>(StaffRepository);
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
    staff = await staffRepo.create({
      tenantId: tenant.id,
      employeeNumber: 'EMP-001',
      firstName: 'Thabo',
      lastName: 'Modise',
      idNumber: '8501015800084',
      email: 'thabo@littlestars.co.za',
      phone: '+27821234567',
      dateOfBirth: new Date('1985-01-01'),
      startDate: new Date('2024-01-15'),
      employmentType: 'PERMANENT',
      payFrequency: 'MONTHLY',
      basicSalaryCents: 2500000, // R25,000
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('getAllTerminationCodes', () => {
    it('should return all SA UI-19 termination codes', () => {
      const codes = service.getAllTerminationCodes();

      expect(codes.length).toBe(9); // SA UI-19 has 9 codes

      // Verify code mapping
      codes.forEach((code) => {
        expect(code.code).toBeDefined();
        expect(code.simplePayCode).toBeDefined();
        expect(code.description).toBeDefined();
        expect(typeof code.uifEligible).toBe('boolean');
        expect(typeof code.uifWaitingPeriod).toBe('boolean');
        expect(code.uifNotes).toBeDefined();
      });
    });

    it('should correctly map RESIGNATION to code 1', () => {
      const codes = service.getAllTerminationCodes();
      const resignation = codes.find((c) => c.code === 'RESIGNATION');

      expect(resignation).toBeDefined();
      expect(resignation?.simplePayCode).toBe('1');
      expect(resignation?.uifEligible).toBe(true);
      expect(resignation?.uifWaitingPeriod).toBe(true);
    });

    it('should correctly identify codes NOT eligible for UIF', () => {
      const codes = service.getAllTerminationCodes();

      const misconduct = codes.find((c) => c.code === 'DISMISSAL_MISCONDUCT');
      expect(misconduct?.uifEligible).toBe(false);

      const absconded = codes.find((c) => c.code === 'ABSCONDED');
      expect(absconded?.uifEligible).toBe(false);
    });
  });

  describe('getServicePeriods', () => {
    it('should throw error when employee not linked to SimplePay', async () => {
      mockFindEmployeeMapping.mockResolvedValue(null);

      await expect(
        service.getServicePeriods(tenant.id, staff.id),
      ).rejects.toThrow();
    });

    it('should return service periods from SimplePay API', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });

      mockGet.mockResolvedValue([
        {
          service_period: {
            id: 'sp_1',
            employee_id: 'emp_123',
            start_date: '2024-01-15',
            end_date: null,
            termination_reason: null,
            termination_code: null,
            last_working_day: null,
            is_active: true,
          },
        },
      ]);

      const periods = await service.getServicePeriods(tenant.id, staff.id);

      expect(periods.length).toBe(1);
      expect(periods[0].isActive).toBe(true);
      expect(mockGet).toHaveBeenCalledWith(
        '/employees/emp_123/service_periods',
      );
    });
  });

  describe('getCurrentServicePeriod', () => {
    it('should return the active service period', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });

      mockGet.mockResolvedValue([
        {
          service_period: {
            id: 'sp_1',
            employee_id: 'emp_123',
            start_date: '2023-01-15',
            end_date: '2023-12-31',
            termination_reason: '1',
            termination_code: '1',
            last_working_day: '2023-12-28',
            is_active: false,
          },
        },
        {
          service_period: {
            id: 'sp_2',
            employee_id: 'emp_123',
            start_date: '2024-01-15',
            end_date: null,
            termination_reason: null,
            termination_code: null,
            last_working_day: null,
            is_active: true,
          },
        },
      ]);

      const period = await service.getCurrentServicePeriod(tenant.id, staff.id);

      expect(period).toBeDefined();
      expect(period?.isActive).toBe(true);
      expect(period?.id).toBe('sp_2');
    });

    it('should return null when no active period exists', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });

      mockGet.mockResolvedValue([
        {
          service_period: {
            id: 'sp_1',
            employee_id: 'emp_123',
            start_date: '2024-01-15',
            end_date: '2024-06-30',
            termination_reason: '1',
            termination_code: '1',
            last_working_day: '2024-06-28',
            is_active: false,
          },
        },
      ]);

      const period = await service.getCurrentServicePeriod(tenant.id, staff.id);
      expect(period).toBeNull();
    });
  });

  describe('terminateEmployee', () => {
    it('should return error when staff not found', async () => {
      const result = await service.terminateEmployee(tenant.id, {
        staffId: '00000000-0000-0000-0000-000000000000',
        terminationCode: 'RESIGNATION',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when staff not linked to SimplePay', async () => {
      mockFindEmployeeMapping.mockResolvedValue(null);

      const result = await service.terminateEmployee(tenant.id, {
        staffId: staff.id,
        terminationCode: 'RESIGNATION',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not linked to SimplePay');
    });

    it('should successfully terminate employee with RESIGNATION', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });
      mockPatch.mockResolvedValue({});

      const result = await service.terminateEmployee(tenant.id, {
        staffId: staff.id,
        terminationCode: 'RESIGNATION',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
        terminationReason: 'Accepted new position',
      });

      expect(result.success).toBe(true);
      expect(result.terminationCode).toBe('RESIGNATION');
      expect(result.uifEligible).toBe(true);
      expect(result.uifWaitingPeriod).toBe(true);
      expect(mockPatch).toHaveBeenCalled();
    });

    it('should correctly set UIF ineligibility for DISMISSAL_MISCONDUCT', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });
      mockPatch.mockResolvedValue({});

      const result = await service.terminateEmployee(tenant.id, {
        staffId: staff.id,
        terminationCode: 'DISMISSAL_MISCONDUCT',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
        terminationReason: 'Gross misconduct',
      });

      expect(result.success).toBe(true);
      expect(result.terminationCode).toBe('DISMISSAL_MISCONDUCT');
      expect(result.uifEligible).toBe(false);
      expect(result.uifWaitingPeriod).toBe(false);
    });

    it('should correctly handle RETRENCHMENT code', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });
      mockPatch.mockResolvedValue({});

      const result = await service.terminateEmployee(tenant.id, {
        staffId: staff.id,
        terminationCode: 'RETRENCHMENT',
        lastWorkingDay: new Date('2024-06-28'),
        endDate: new Date('2024-06-30'),
        terminationReason: 'Operational requirements',
      });

      expect(result.success).toBe(true);
      expect(result.terminationCode).toBe('RETRENCHMENT');
      expect(result.uifEligible).toBe(true);
      expect(result.uifWaitingPeriod).toBe(false); // No waiting period for retrenchment
    });
  });

  describe('reinstateEmployee', () => {
    it('should return error when staff not found', async () => {
      const result = await service.reinstateEmployee(tenant.id, {
        staffId: '00000000-0000-0000-0000-000000000000',
        effectiveDate: new Date('2024-07-01'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when staff not linked to SimplePay', async () => {
      mockFindEmployeeMapping.mockResolvedValue(null);

      const result = await service.reinstateEmployee(tenant.id, {
        staffId: staff.id,
        effectiveDate: new Date('2024-07-01'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not linked to SimplePay');
    });

    it('should successfully reinstate terminated employee', async () => {
      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });
      mockPatch.mockResolvedValue({});

      const result = await service.reinstateEmployee(tenant.id, {
        staffId: staff.id,
        effectiveDate: new Date('2024-07-01'),
        reason: 'Re-hired after resignation',
      });

      expect(result.success).toBe(true);
      expect(result.simplePayEmployeeId).toBe('emp_123');
      expect(mockPatch).toHaveBeenCalledWith('/employees/emp_123', {
        employee: {
          termination_date: null,
        },
      });
    });
  });

  describe('undoTermination', () => {
    it('should return error when no termination record exists', async () => {
      const result = await service.undoTermination(tenant.id, staff.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No termination record found');
    });

    it('should successfully undo termination when no final payslip', async () => {
      // Create a terminated service period first
      await servicePeriodRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayEmployeeId: 'emp_123',
        simplePayPeriodId: 'sp_456',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-06-30'),
        terminationCode: 'RESIGNATION',
        terminationReason: 'Testing',
        lastWorkingDay: new Date('2024-06-28'),
        isActive: false,
      });

      mockFindEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'emp_123',
      });
      mockPatch.mockResolvedValue({});

      const result = await service.undoTermination(tenant.id, staff.id);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should return error when final payslip is processed', async () => {
      // Create a terminated service period with final payslip
      await servicePeriodRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayEmployeeId: 'emp_123',
        simplePayPeriodId: 'sp_456',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-06-30'),
        terminationCode: 'RESIGNATION',
        terminationReason: 'Testing',
        lastWorkingDay: new Date('2024-06-28'),
        finalPayslipId: 'payslip_789', // Final payslip processed
        isActive: false,
      });

      const result = await service.undoTermination(tenant.id, staff.id);

      expect(result.success).toBe(false);
      expect(result.error).toContain('final payslip');
    });
  });

  describe('getLocalServicePeriods', () => {
    it('should return empty when no service periods exist', async () => {
      const result = await service.getLocalServicePeriods(tenant.id);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return service periods with pagination', async () => {
      // Create service period
      await servicePeriodRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayEmployeeId: 'emp_123',
        simplePayPeriodId: 'sp_456',
        startDate: new Date('2024-01-15'),
        isActive: true,
      });

      const result = await service.getLocalServicePeriods(tenant.id, {
        page: 1,
        limit: 10,
      });

      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getTerminatedEmployeesForPeriod', () => {
    it('should return terminated employees in date range', async () => {
      // Create terminated service period
      await servicePeriodRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        simplePayEmployeeId: 'emp_123',
        simplePayPeriodId: 'sp_456',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-06-15'),
        terminationCode: 'RETRENCHMENT',
        isActive: false,
      });

      const result = await service.getTerminatedEmployeesForPeriod(
        tenant.id,
        new Date('2024-06-01'),
        new Date('2024-06-30'),
      );

      expect(result.length).toBe(1);
      expect(result[0].terminationCode).toBe('RETRENCHMENT');
    });
  });

  describe('SA UI-19 Termination Code Mapping', () => {
    it('should correctly map all 9 UI-19 codes to SimplePay codes', () => {
      const expectedMappings: Record<TerminationCode, string> = {
        RESIGNATION: '1',
        DISMISSAL_MISCONDUCT: '2',
        DISMISSAL_INCAPACITY: '3',
        RETRENCHMENT: '4',
        CONTRACT_EXPIRY: '5',
        RETIREMENT: '6',
        DEATH: '7',
        ABSCONDED: '8',
        TRANSFER: '9',
      };

      Object.entries(expectedMappings).forEach(([code, expectedValue]) => {
        expect(TERMINATION_CODE_MAP[code as TerminationCode]).toBe(
          expectedValue,
        );
      });
    });

    it('should correctly identify UIF eligibility for each code', () => {
      const uifEligibleCodes: TerminationCode[] = [
        'RESIGNATION',
        'DISMISSAL_INCAPACITY',
        'RETRENCHMENT',
        'CONTRACT_EXPIRY',
        'RETIREMENT',
        'DEATH',
      ];

      const uifIneligibleCodes: TerminationCode[] = [
        'DISMISSAL_MISCONDUCT',
        'ABSCONDED',
        'TRANSFER',
      ];

      uifEligibleCodes.forEach((code) => {
        expect(UIF_ELIGIBILITY[code].eligible).toBe(true);
      });

      uifIneligibleCodes.forEach((code) => {
        expect(UIF_ELIGIBILITY[code].eligible).toBe(false);
      });
    });

    it('should identify RESIGNATION as having a waiting period', () => {
      expect(UIF_ELIGIBILITY.RESIGNATION.waitingPeriod).toBe(true);
    });

    it('should identify RETRENCHMENT as having no waiting period', () => {
      expect(UIF_ELIGIBILITY.RETRENCHMENT.waitingPeriod).toBe(false);
    });
  });
});
