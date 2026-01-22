/**
 * Staff Termination Service Tests
 * TASK-STAFF-004: Fix Staff Termination Process
 *
 * Tests for:
 * - Final pay calculation (pro-rata, leave payout, notice pay)
 * - BCEA-compliant notice period calculation
 * - Tenure calculation
 * - Severance pay (retrenchment)
 * - Termination workflow
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import {
  StaffTerminationService,
  TerminationReasonCode,
} from '../../../src/database/services/staff-termination.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { StaffOffboardingRepository } from '../../../src/database/repositories/staff-offboarding.repository';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PayeService } from '../../../src/database/services/paye.service';
import { UifService } from '../../../src/database/services/uif.service';

// Configure Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('StaffTerminationService', () => {
  let service: StaffTerminationService;
  let prisma: jest.Mocked<PrismaService>;
  let staffRepo: jest.Mocked<StaffRepository>;
  let offboardingRepo: jest.Mocked<StaffOffboardingRepository>;
  let simplePayRepo: jest.Mocked<SimplePayRepository>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let payeService: jest.Mocked<PayeService>;
  let uifService: jest.Mocked<UifService>;

  const mockStaff = {
    id: 'staff-001',
    tenantId: 'tenant-001',
    firstName: 'John',
    lastName: 'Doe',
    idNumber: '9001015800087',
    employeeNumber: 'EMP001',
    basicSalaryCents: 2500000, // R25,000
    payFrequency: 'MONTHLY',
    startDate: new Date('2020-01-15'),
    dateOfBirth: new Date('1990-01-01'),
    medicalAidMembers: 0,
    isActive: true,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      staff: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      staffOffboarding: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn) => fn(mockPrismaService)),
    };

    const mockStaffRepo = {
      findById: jest.fn(),
    };

    const mockOffboardingRepo = {
      findOffboardingByStaffId: jest.fn(),
      findOffboardingById: jest.fn(),
      createOffboarding: jest.fn(),
      updateFinalPay: jest.fn(),
      createAssetReturn: jest.fn(),
    };

    const mockSimplePayRepo = {
      findEmployeeMapping: jest.fn(),
      findConnection: jest.fn(),
    };

    const mockAuditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    const mockPayeService = {
      calculatePaye: jest.fn().mockResolvedValue({
        netPayeCents: 300000, // R3,000
      }),
    };

    const mockUifService = {
      calculateUif: jest.fn().mockResolvedValue({
        employeeContributionCents: 17750, // 1% of cap
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffTerminationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StaffRepository, useValue: mockStaffRepo },
        { provide: StaffOffboardingRepository, useValue: mockOffboardingRepo },
        { provide: SimplePayRepository, useValue: mockSimplePayRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PayeService, useValue: mockPayeService },
        { provide: UifService, useValue: mockUifService },
      ],
    }).compile();

    service = module.get<StaffTerminationService>(StaffTerminationService);
    prisma = module.get(PrismaService);
    staffRepo = module.get(StaffRepository);
    offboardingRepo = module.get(StaffOffboardingRepository);
    simplePayRepo = module.get(SimplePayRepository);
    auditLogService = module.get(AuditLogService);
    payeService = module.get(PayeService);
    uifService = module.get(UifService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('calculateNoticePeriodDays', () => {
    it('should return 7 days for tenure less than 6 months', () => {
      const startDate = new Date('2024-01-01');
      const terminationDate = new Date('2024-04-01'); // 3 months

      const result = service.calculateNoticePeriodDays(
        startDate,
        terminationDate,
      );

      expect(result).toBe(7);
    });

    it('should return 14 days for tenure 6-12 months', () => {
      const startDate = new Date('2024-01-01');
      const terminationDate = new Date('2024-08-01'); // 7 months

      const result = service.calculateNoticePeriodDays(
        startDate,
        terminationDate,
      );

      expect(result).toBe(14);
    });

    it('should return 28 days for tenure over 12 months', () => {
      const startDate = new Date('2022-01-01');
      const terminationDate = new Date('2024-06-01'); // 2.5 years

      const result = service.calculateNoticePeriodDays(
        startDate,
        terminationDate,
      );

      expect(result).toBe(28);
    });
  });

  describe('calculateTenure', () => {
    it('should calculate tenure correctly for full years', () => {
      const startDate = new Date('2020-01-01');
      const endDate = new Date('2025-01-01');

      const result = service.calculateTenure(startDate, endDate);

      expect(result.years).toBe(5);
      expect(result.months).toBe(0);
      expect(result.days).toBe(0);
    });

    it('should calculate tenure with months and days', () => {
      const startDate = new Date('2020-01-15');
      const endDate = new Date('2024-06-20');

      const result = service.calculateTenure(startDate, endDate);

      expect(result.years).toBe(4);
      expect(result.months).toBe(5);
      expect(result.days).toBe(5);
    });

    it('should handle month wraparound', () => {
      const startDate = new Date('2020-10-15');
      const endDate = new Date('2021-03-10');

      const result = service.calculateTenure(startDate, endDate);

      expect(result.years).toBe(0);
      expect(result.months).toBe(4);
    });
  });

  describe('calculateProRataSalary', () => {
    it('should calculate pro-rata for half month', () => {
      const monthlySalary = 2500000; // R25,000
      const lastWorkingDay = new Date('2024-06-15');

      const result = service.calculateProRataSalary(
        monthlySalary,
        lastWorkingDay,
      );

      // 15 days out of 30 = 50%
      expect(result).toBeGreaterThan(1200000);
      expect(result).toBeLessThan(1350000);
    });

    it('should calculate pro-rata for full month', () => {
      const monthlySalary = 2500000; // R25,000
      const lastWorkingDay = new Date('2024-06-30');

      const result = service.calculateProRataSalary(
        monthlySalary,
        lastWorkingDay,
      );

      // 30 days out of 30 = 100% (actually calculates days 1-30)
      expect(result).toBeGreaterThanOrEqual(2500000);
    });

    it('should calculate pro-rata for first week', () => {
      const monthlySalary = 3000000; // R30,000
      const lastWorkingDay = new Date('2024-06-07');

      const result = service.calculateProRataSalary(
        monthlySalary,
        lastWorkingDay,
      );

      // 7 days out of 30 = ~23%
      expect(result).toBeGreaterThan(600000);
      expect(result).toBeLessThanOrEqual(800000);
    });
  });

  describe('calculateSeverancePay', () => {
    it('should return zero for non-retrenchment reasons', () => {
      const result = service.calculateSeverancePay(
        TerminationReasonCode.RESIGNATION,
        new Date('2020-01-01'),
        new Date('2024-06-01'),
        11540, // R115.40 daily rate
      );

      expect(result).toBe(0);
    });

    it('should calculate severance for retrenchment (1 week per year)', () => {
      const dailyRate = 11540; // R115.40
      const weeklyRate = dailyRate * 5;

      const result = service.calculateSeverancePay(
        TerminationReasonCode.RETRENCHMENT,
        new Date('2020-01-01'),
        new Date('2024-01-01'), // 4 years
        dailyRate,
      );

      // 4 years * 1 week = 4 * R577 = R2,308
      expect(result).toBe(weeklyRate * 4);
    });

    it('should calculate severance based on completed years only', () => {
      const dailyRate = 10000; // R100
      const weeklyRate = dailyRate * 5;

      const result = service.calculateSeverancePay(
        TerminationReasonCode.RETRENCHMENT,
        new Date('2021-06-01'),
        new Date('2024-03-01'), // 2 years 9 months
        dailyRate,
      );

      // Only 2 completed years
      expect(result).toBe(weeklyRate * 2);
    });
  });

  describe('calculateFinalPay', () => {
    it('should calculate complete final pay breakdown', async () => {
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.calculateFinalPay(
        mockStaff as any,
        new Date('2024-06-15'),
        false,
        TerminationReasonCode.RESIGNATION,
      );

      expect(result.proRataSalaryCents).toBeGreaterThan(0);
      expect(result.grossEarningsCents).toBeGreaterThan(0);
      expect(result.totalDeductionsCents).toBeGreaterThanOrEqual(0);
      expect(result.netPayCents).toBeLessThanOrEqual(result.grossEarningsCents);
      expect(result.dailyRateCents).toBeGreaterThan(0);
    });

    it('should include notice pay when waived', async () => {
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);

      const withoutNotice = await service.calculateFinalPay(
        mockStaff as any,
        new Date('2024-06-15'),
        false,
        TerminationReasonCode.RESIGNATION,
      );

      const withNotice = await service.calculateFinalPay(
        mockStaff as any,
        new Date('2024-06-15'),
        true,
        TerminationReasonCode.RESIGNATION,
      );

      expect(withNotice.noticePayCents).toBeGreaterThan(0);
      expect(withoutNotice.noticePayCents).toBe(0);
      expect(withNotice.grossEarningsCents).toBeGreaterThan(
        withoutNotice.grossEarningsCents,
      );
    });

    it('should calculate PAYE and UIF deductions', async () => {
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.calculateFinalPay(
        mockStaff as any,
        new Date('2024-06-15'),
        false,
        TerminationReasonCode.RESIGNATION,
      );

      expect(result.payeDeductionCents).toBeGreaterThan(0);
      expect(result.uifDeductionCents).toBeGreaterThan(0);
    });
  });

  describe('initiateTermination', () => {
    it('should create termination record for valid staff', async () => {
      staffRepo.findById.mockResolvedValue(mockStaff as any);
      offboardingRepo.findOffboardingByStaffId.mockResolvedValue(null);
      (prisma.staffOffboarding.create as jest.Mock).mockResolvedValue({
        ...mockStaff,
        id: 'offboarding-001',
        staffId: mockStaff.id,
        status: 'INITIATED',
      });
      (prisma.leaveRequest.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.initiateTermination('tenant-001', {
        staffId: mockStaff.id,
        reason: TerminationReasonCode.RESIGNATION,
        lastWorkingDay: new Date('2024-06-30'),
        initiatedBy: 'admin-001',
      });

      expect(result.staffId).toBe(mockStaff.id);
      expect(result.reason).toBe(TerminationReasonCode.RESIGNATION);
      expect(result.status).toBe('INITIATED');
      expect(auditLogService.logCreate).toHaveBeenCalled();
    });

    it('should throw error for inactive staff', async () => {
      staffRepo.findById.mockResolvedValue({
        ...mockStaff,
        isActive: false,
      } as any);

      await expect(
        service.initiateTermination('tenant-001', {
          staffId: mockStaff.id,
          reason: TerminationReasonCode.RESIGNATION,
          lastWorkingDay: new Date('2024-06-30'),
          initiatedBy: 'admin-001',
        }),
      ).rejects.toThrow('Staff member is already inactive');
    });

    it('should throw error for non-existent staff', async () => {
      staffRepo.findById.mockResolvedValue(null);

      await expect(
        service.initiateTermination('tenant-001', {
          staffId: 'non-existent',
          reason: TerminationReasonCode.RESIGNATION,
          lastWorkingDay: new Date('2024-06-30'),
          initiatedBy: 'admin-001',
        }),
      ).rejects.toThrow('Staff');
    });

    it('should throw error if termination already exists', async () => {
      staffRepo.findById.mockResolvedValue(mockStaff as any);
      offboardingRepo.findOffboardingByStaffId.mockResolvedValue({
        id: 'existing-offboarding',
        status: 'IN_PROGRESS',
      } as any);

      await expect(
        service.initiateTermination('tenant-001', {
          staffId: mockStaff.id,
          reason: TerminationReasonCode.RESIGNATION,
          lastWorkingDay: new Date('2024-06-30'),
          initiatedBy: 'admin-001',
        }),
      ).rejects.toThrow('Termination process already exists');
    });
  });

  describe('Termination Reason Codes', () => {
    it('should support all BCEA termination reasons', () => {
      const reasons = Object.values(TerminationReasonCode);

      expect(reasons).toContain('RESIGNATION');
      expect(reasons).toContain('TERMINATION');
      expect(reasons).toContain('RETIREMENT');
      expect(reasons).toContain('DEATH');
      expect(reasons).toContain('CONTRACT_END');
      expect(reasons).toContain('MUTUAL_AGREEMENT');
      expect(reasons).toContain('RETRENCHMENT');
      expect(reasons).toContain('DISMISSAL');
      expect(reasons).toContain('ABSCONDED');
    });
  });

  describe('Decimal Precision', () => {
    it("should use banker's rounding for monetary calculations", () => {
      // Test case: With banker's rounding, 0.5 rounds to nearest even number
      // 2500001/2 = 1250000.5 -> rounds to 1250000 (even)
      const test1 = new Decimal('2500001').div(2).round().toNumber();
      expect(test1).toBe(1250000); // banker's rounding: 1250000.5 -> 1250000 (even)

      // Test: Precise calculation
      const salary = 2573912; // R25,739.12
      const dailyRate = new Decimal(salary).div(21.67).round().toNumber();
      expect(dailyRate).toBeGreaterThan(0);
      expect(Number.isInteger(dailyRate)).toBe(true);
    });
  });
});
