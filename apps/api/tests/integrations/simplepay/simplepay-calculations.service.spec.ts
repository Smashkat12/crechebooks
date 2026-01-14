import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SimplePayCalculationsService } from '../../../src/integrations/simplepay/simplepay-calculations.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { CalculationCacheRepository } from '../../../src/database/repositories/calculation-cache.repository';
import { PayrollAdjustmentRepository } from '../../../src/database/repositories/payroll-adjustment.repository';
import { Tenant, Staff } from '@prisma/client';
import { SA_PAYROLL_CODES } from '../../../src/database/entities/calculation.entity';

describe('SimplePayCalculationsService', () => {
  let service: SimplePayCalculationsService;
  let prisma: PrismaService;
  let cacheRepo: CalculationCacheRepository;
  let apiClient: jest.Mocked<SimplePayApiClient>;
  let tenant: Tenant;
  let staff: Staff;

  beforeAll(async () => {
    // Create mock for SimplePayApiClient
    const mockApiClient = {
      initializeForTenant: jest.fn(),
      getClientId: jest.fn().mockReturnValue('test-client-id'),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        SimplePayCalculationsService,
        CalculationCacheRepository,
        PayrollAdjustmentRepository,
        {
          provide: SimplePayApiClient,
          useValue: mockApiClient,
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<SimplePayCalculationsService>(
      SimplePayCalculationsService,
    );
    cacheRepo = module.get<CalculationCacheRepository>(
      CalculationCacheRepository,
    );
    apiClient = module.get(SimplePayApiClient);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
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
    await prisma.simplePayEmployeeMapping.deleteMany({});
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
        firstName: 'Test',
        lastName: 'Employee',
        idNumber: '8501015800084',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2024-01-01'),
        employmentType: 'PERMANENT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 1500000,
      },
    });

    // Reset mock
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getCacheStatus', () => {
    it('should return invalid status when no cache exists', async () => {
      const status = await service.getCacheStatus(tenant.id);

      expect(status.isValid).toBe(false);
      expect(status.itemCount).toBe(0);
      expect(status.needsRefresh).toBe(true);
    });

    it('should return valid status when cache exists', async () => {
      // Create some cached items
      await prisma.calculationItemCache.create({
        data: {
          tenantId: tenant.id,
          code: '3601',
          name: 'Basic Salary',
          type: 'EARNING',
          taxable: true,
          affectsUif: true,
        },
      });

      const status = await service.getCacheStatus(tenant.id);

      expect(status.isValid).toBe(true);
      expect(status.itemCount).toBeGreaterThan(0);
      expect(status.needsRefresh).toBe(false);
    });
  });

  describe('getCalculationItems', () => {
    beforeEach(async () => {
      // Pre-populate cache
      await prisma.calculationItemCache.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: '3601',
            name: 'Basic Salary',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '4101',
            name: 'PAYE',
            type: 'DEDUCTION',
            taxable: false,
            affectsUif: false,
          },
          {
            tenantId: tenant.id,
            code: '4001',
            name: 'Pension',
            type: 'DEDUCTION',
            taxable: false,
            affectsUif: false,
          },
        ],
      });
    });

    it('should return cached items without calling API', async () => {
      const items = await service.getCalculationItems(tenant.id);

      expect(items).toHaveLength(3);
      expect(apiClient.initializeForTenant).not.toHaveBeenCalled();
    });

    it('should filter by type', async () => {
      const earnings = await service.getCalculationItems(tenant.id, {
        type: 'EARNING',
      });

      expect(earnings).toHaveLength(1);
      expect(earnings[0].code).toBe('3601');
    });
  });

  describe('getCalculationItemsByType', () => {
    beforeEach(async () => {
      await prisma.calculationItemCache.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: '3601',
            name: 'Basic Salary',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '3602',
            name: 'Overtime',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '4101',
            name: 'PAYE',
            type: 'DEDUCTION',
            taxable: false,
            affectsUif: false,
          },
        ],
      });
    });

    it('should return items of specified type', async () => {
      const earnings = await service.getCalculationItemsByType(
        tenant.id,
        'EARNING',
      );

      expect(earnings).toHaveLength(2);
      expect(earnings.every((e) => e.type === 'EARNING')).toBe(true);
    });
  });

  describe('getCalculationItemByCode', () => {
    beforeEach(async () => {
      await prisma.calculationItemCache.create({
        data: {
          tenantId: tenant.id,
          code: '3601',
          name: 'Basic Salary',
          type: 'EARNING',
          taxable: true,
          affectsUif: true,
        },
      });
    });

    it('should return item by code', async () => {
      const item = await service.getCalculationItemByCode(tenant.id, '3601');

      expect(item).toBeDefined();
      expect(item?.code).toBe('3601');
      expect(item?.name).toBe('Basic Salary');
    });

    it('should return null for non-existent code', async () => {
      const item = await service.getCalculationItemByCode(
        tenant.id,
        'NONEXISTENT',
      );

      expect(item).toBeNull();
    });
  });

  describe('getEarnings/getDeductions/getEmployerContributions', () => {
    beforeEach(async () => {
      await prisma.calculationItemCache.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: '3601',
            name: 'Basic Salary',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '4001',
            name: 'Pension',
            type: 'DEDUCTION',
            taxable: false,
            affectsUif: false,
          },
          {
            tenantId: tenant.id,
            code: '4501',
            name: 'Employer Pension',
            type: 'COMPANY_CONTRIBUTION',
            taxable: false,
            affectsUif: false,
          },
        ],
      });
    });

    it('should return only earnings', async () => {
      const earnings = await service.getEarnings(tenant.id);
      expect(earnings).toHaveLength(1);
      expect(earnings[0].type).toBe('EARNING');
    });

    it('should return only deductions', async () => {
      const deductions = await service.getDeductions(tenant.id);
      expect(deductions).toHaveLength(1);
      expect(deductions[0].type).toBe('DEDUCTION');
    });

    it('should return only employer contributions', async () => {
      const contributions = await service.getEmployerContributions(tenant.id);
      expect(contributions).toHaveLength(1);
      expect(contributions[0].type).toBe('COMPANY_CONTRIBUTION');
    });
  });

  describe('getActiveAdjustments', () => {
    beforeEach(async () => {
      await prisma.payrollAdjustment.createMany({
        data: [
          {
            tenantId: tenant.id,
            staffId: staff.id,
            itemCode: '3601',
            itemName: 'Basic Salary',
            type: 'EARNING',
            amountCents: 100000,
            isRecurring: true,
            effectiveDate: new Date('2024-01-01'),
          },
          {
            tenantId: tenant.id,
            staffId: staff.id,
            itemCode: '3602',
            itemName: 'Overtime',
            type: 'EARNING',
            amountCents: 50000,
            isRecurring: true,
            effectiveDate: new Date('2024-01-01'),
            endDate: new Date('2024-06-30'),
          },
        ],
      });
    });

    it('should return active adjustments for a staff member', async () => {
      const adjustments = await service.getActiveAdjustments(staff.id);
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].itemCode).toBe('3601');
    });

    it('should return adjustments active on specific date', async () => {
      const adjustments = await service.getActiveAdjustments(
        staff.id,
        new Date('2024-03-15'),
      );
      expect(adjustments).toHaveLength(2);
    });
  });

  describe('getItemCount', () => {
    it('should return count of items for a tenant', async () => {
      await prisma.calculationItemCache.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: '3601',
            name: 'Item 1',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '3602',
            name: 'Item 2',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
        ],
      });

      const count = await service.getItemCount(tenant.id);
      expect(count).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should delete all cache entries for a tenant', async () => {
      await prisma.calculationItemCache.createMany({
        data: [
          {
            tenantId: tenant.id,
            code: '3601',
            name: 'Item 1',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
          {
            tenantId: tenant.id,
            code: '3602',
            name: 'Item 2',
            type: 'EARNING',
            taxable: true,
            affectsUif: true,
          },
        ],
      });

      const deletedCount = await service.clearCache(tenant.id);
      expect(deletedCount).toBe(2);

      const remaining = await cacheRepo.findByTenantId(tenant.id);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('SA_PAYROLL_CODES', () => {
    it('should have correct statutory codes', () => {
      expect(SA_PAYROLL_CODES.PAYE).toBe('4101');
      expect(SA_PAYROLL_CODES.UIF_EMPLOYEE).toBe('4102');
      expect(SA_PAYROLL_CODES.UIF_EMPLOYER).toBe('4103');
      expect(SA_PAYROLL_CODES.SDL).toBe('4104');
      expect(SA_PAYROLL_CODES.ETI).toBe('4105');
    });

    it('should have correct earning codes', () => {
      expect(SA_PAYROLL_CODES.BASIC_SALARY).toBe('3601');
      expect(SA_PAYROLL_CODES.OVERTIME).toBe('3603');
      expect(SA_PAYROLL_CODES.BONUS).toBe('3604');
      expect(SA_PAYROLL_CODES.TRAVEL_ALLOWANCE).toBe('3701');
    });

    it('should have correct deduction codes', () => {
      expect(SA_PAYROLL_CODES.PENSION_FUND).toBe('4001');
      expect(SA_PAYROLL_CODES.MEDICAL_AID).toBe('4011');
      expect(SA_PAYROLL_CODES.GARNISHEE).toBe('4021');
    });
  });
});
