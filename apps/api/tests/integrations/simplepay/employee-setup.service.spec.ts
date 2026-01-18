/**
 * SimplePay Employee Setup Service Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Unit tests for the setup service - focuses on initialization and statistics.
 * Integration tests with real database are in separate e2e tests.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayEmployeeSetupService } from '../../../src/integrations/simplepay/simplepay-employee-setup.service';
import { EmployeeSetupLogRepository } from '../../../src/database/repositories/employee-setup-log.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { SetupPipeline } from '../../../src/integrations/simplepay/setup-pipeline/setup-pipeline';
import { ProfileSelector } from '../../../src/integrations/simplepay/setup-pipeline/profile-selector';
import { LeaveCalculator } from '../../../src/integrations/simplepay/setup-pipeline/leave-calculator';
import { CreateEmployeeStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/create-employee.step';
import { SetSalaryStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/set-salary.step';
import { AssignProfileStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/assign-profile.step';
import { SetupLeaveStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/setup-leave.step';
import { ConfigureTaxStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/configure-tax.step';
import { AddCalculationsStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/add-calculations.step';
import { VerifySetupStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/verify-setup.step';
import { SendNotificationStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/send-notification.step';
import { SetupStatus } from '../../../src/database/entities/employee-setup-log.entity';
import { Tenant, Staff } from '@prisma/client';

describe('SimplePayEmployeeSetupService', () => {
  let service: SimplePayEmployeeSetupService;
  let prisma: PrismaService;
  let setupLogRepo: EmployeeSetupLogRepository;
  let staffRepo: StaffRepository;
  let pipeline: SetupPipeline;
  let profileSelector: ProfileSelector;
  let leaveCalculator: LeaveCalculator;
  let tenant: Tenant;
  let staff: Staff;

  const mockPipeline = {
    execute: jest.fn(),
    rollback: jest.fn(),
    getSteps: jest.fn(),
    registerStep: jest.fn(),
    executeFromStep: jest.fn(),
    getOrderedSteps: jest.fn().mockReturnValue([]),
    getFinalStatus: jest.fn().mockReturnValue('COMPLETED'),
    getStepCounts: jest.fn().mockReturnValue({
      total: 8,
      completed: 8,
      failed: 0,
      skipped: 0,
      pending: 0,
    }),
  };

  const mockProfileSelector = {
    selectProfile: jest.fn(),
    getProfileMapping: jest.fn(),
    clearCache: jest.fn(),
  };

  const mockSimplePayRepo = {
    findConnection: jest.fn(),
    createConnection: jest.fn(),
    createEmployeeMapping: jest.fn(),
    findEmployeeMapping: jest.fn(),
  };

  const mockStep = {
    name: 'mock_step',
    description: 'Mock step',
    execute: jest.fn().mockResolvedValue(true),
    rollback: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        SimplePayEmployeeSetupService,
        EmployeeSetupLogRepository,
        StaffRepository,
        LeaveCalculator,
        {
          provide: SimplePayRepository,
          useValue: mockSimplePayRepo,
        },
        {
          provide: SetupPipeline,
          useValue: mockPipeline,
        },
        {
          provide: ProfileSelector,
          useValue: mockProfileSelector,
        },
        {
          provide: CreateEmployeeStep,
          useValue: { ...mockStep, name: 'create_employee' },
        },
        {
          provide: SetSalaryStep,
          useValue: { ...mockStep, name: 'set_salary' },
        },
        {
          provide: AssignProfileStep,
          useValue: { ...mockStep, name: 'assign_profile' },
        },
        {
          provide: SetupLeaveStep,
          useValue: { ...mockStep, name: 'setup_leave' },
        },
        {
          provide: ConfigureTaxStep,
          useValue: { ...mockStep, name: 'configure_tax' },
        },
        {
          provide: AddCalculationsStep,
          useValue: { ...mockStep, name: 'add_calculations' },
        },
        {
          provide: VerifySetupStep,
          useValue: { ...mockStep, name: 'verify_setup' },
        },
        {
          provide: SendNotificationStep,
          useValue: { ...mockStep, name: 'send_notification' },
        },
      ],
    }).compile();

    service = module.get<SimplePayEmployeeSetupService>(
      SimplePayEmployeeSetupService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    setupLogRepo = module.get<EmployeeSetupLogRepository>(
      EmployeeSetupLogRepository,
    );
    staffRepo = module.get<StaffRepository>(StaffRepository);
    pipeline = module.get(SetupPipeline);
    profileSelector = module.get(ProfileSelector);
    leaveCalculator = module.get<LeaveCalculator>(LeaveCalculator);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clean database
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
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
        name: 'Test Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@creche.co.za`,
      },
    });

    // Create test staff
    staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: 'EMP-001',
        firstName: 'Thabo',
        lastName: 'Modise',
        idNumber: '8501015800084',
        email: 'thabo@creche.co.za',
        phone: '+27821234567',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2024-01-15'),
        employmentType: 'PERMANENT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 1500000,
        position: 'TEACHER',
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have setup log repository', () => {
      expect(setupLogRepo).toBeDefined();
    });

    it('should have staff repository', () => {
      expect(staffRepo).toBeDefined();
    });

    it('should have pipeline', () => {
      expect(pipeline).toBeDefined();
    });

    it('should have profile selector', () => {
      expect(profileSelector).toBeDefined();
    });

    it('should have leave calculator', () => {
      expect(leaveCalculator).toBeDefined();
    });
  });

  describe('getSetupStatus', () => {
    it('should return setup status for staff', async () => {
      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.COMPLETED,
      });

      const status = await service.getSetupStatus(tenant.id, staff.id);

      expect(status).toBeDefined();
      expect(status?.status).toBe(SetupStatus.COMPLETED);
    });

    it('should return null for staff without setup log', async () => {
      const status = await service.getSetupStatus(tenant.id, staff.id);

      expect(status).toBeNull();
    });

    it('should return null for staff in different tenant', async () => {
      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.COMPLETED,
      });

      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other St',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8000',
          phone: '+27211234568',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      const status = await service.getSetupStatus(otherTenant.id, staff.id);

      expect(status).toBeNull();
    });
  });

  describe('getSetupStatistics', () => {
    it('should return statistics for tenant', async () => {
      const log = await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      await setupLogRepo.markCompleted(log.id, {});

      const stats = await service.getSetupStatistics(tenant.id);

      expect(stats.total).toBe(1);
      expect(stats.completed).toBe(1);
    });

    it('should return zero counts for tenant with no setups', async () => {
      const stats = await service.getSetupStatistics(tenant.id);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('should count different statuses correctly', async () => {
      // Create multiple setup logs with different statuses
      const staff2 = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          employeeNumber: 'EMP-002',
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '9001015800085',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-02-01'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 1200000,
        },
      });

      const staff3 = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          employeeNumber: 'EMP-003',
          firstName: 'John',
          lastName: 'Smith',
          idNumber: '9201015800086',
          dateOfBirth: new Date('1992-01-01'),
          startDate: new Date('2024-03-01'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 1100000,
        },
      });

      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.COMPLETED,
      });

      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff2.id,
        triggeredBy: 'system',
        status: SetupStatus.FAILED,
      });

      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff3.id,
        triggeredBy: 'system',
        status: SetupStatus.PENDING,
      });

      const stats = await service.getSetupStatistics(tenant.id);

      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(1);
    });

    it('should include partial and rolled back counts', async () => {
      const staff2 = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          employeeNumber: 'EMP-002',
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '9001015800085',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-02-01'),
          employmentType: 'PERMANENT',
          payFrequency: 'MONTHLY',
          basicSalaryCents: 1200000,
        },
      });

      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.PARTIAL,
      });

      await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff2.id,
        triggeredBy: 'system',
        status: SetupStatus.ROLLED_BACK,
      });

      const stats = await service.getSetupStatistics(tenant.id);

      expect(stats.total).toBe(2);
      expect(stats.partial).toBe(1);
      expect(stats.rolledBack).toBe(1);
    });
  });

  describe('setupEmployeeComprehensive - validation', () => {
    it('should throw error if staff not found', async () => {
      // Setup mock to return active connection
      mockSimplePayRepo.findConnection.mockResolvedValue({
        id: 'connection-1',
        tenantId: tenant.id,
        clientId: 'client-123',
        isActive: true,
      });

      await expect(
        service.setupEmployeeComprehensive(tenant.id, {
          staffId: 'non-existent-id',
          triggeredBy: 'system',
        }),
      ).rejects.toThrow();
    });

    it('should throw error if staff is in different tenant', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other St',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8000',
          phone: '+27211234568',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      // Setup mock to return active connection
      mockSimplePayRepo.findConnection.mockResolvedValue({
        id: 'connection-1',
        tenantId: otherTenant.id,
        clientId: 'client-123',
        isActive: true,
      });

      await expect(
        service.setupEmployeeComprehensive(otherTenant.id, {
          staffId: staff.id,
          triggeredBy: 'system',
        }),
      ).rejects.toThrow();
    });

    it('should fail if SimplePay connection not configured', async () => {
      mockSimplePayRepo.findConnection.mockResolvedValue(null);

      const result = await service.setupEmployeeComprehensive(tenant.id, {
        staffId: staff.id,
        triggeredBy: 'system',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail if SimplePay connection is inactive', async () => {
      mockSimplePayRepo.findConnection.mockResolvedValue({
        id: 'connection-1',
        tenantId: tenant.id,
        clientId: 'client-123',
        isActive: false,
      });

      const result = await service.setupEmployeeComprehensive(tenant.id, {
        staffId: staff.id,
        triggeredBy: 'system',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('retrySetup - validation', () => {
    it('should throw error for non-existent setup log', async () => {
      await expect(
        service.retrySetup(tenant.id, 'non-existent-id'),
      ).rejects.toThrow();
    });

    it('should throw error for completed setup without force flag', async () => {
      const log = await setupLogRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.COMPLETED,
      });

      await expect(service.retrySetup(tenant.id, log.id)).rejects.toThrow();
    });
  });
});
