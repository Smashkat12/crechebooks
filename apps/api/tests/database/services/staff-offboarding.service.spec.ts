/**
 * Staff Offboarding Service Tests
 *
 * Focused on the leave payout calculation (BCEA Section 20-22):
 * - SimplePay-sourced balances (preferred when tenant is connected + mapped)
 * - Local fallback: 1.25 days/month accrual anchored to start-date anniversary
 * - Edge cases: <1 month tenure, taken > accrued (clamp to 0),
 *   unpaid/non-annual leave exclusion, missing start date
 * - Audit payload traceability ({ accruedDays, takenDays, dailyRateCents, source })
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { StaffOffboardingService } from '../../../src/database/services/staff-offboarding.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { StaffOffboardingRepository } from '../../../src/database/repositories/staff-offboarding.repository';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PayeService } from '../../../src/database/services/paye.service';
import { UifService } from '../../../src/database/services/uif.service';
import { SimplePayServicePeriodService } from '../../../src/integrations/simplepay/simplepay-service-period.service';
import { SimplePayLeaveService } from '../../../src/integrations/simplepay/simplepay-leave.service';

// Configure Decimal.js (same settings as the service)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

const WORKING_DAYS_PER_MONTH = 21.67;

describe('StaffOffboardingService - leave payout', () => {
  let service: StaffOffboardingService;
  let prisma: any;
  let simplePayRepo: any;
  let simplePayLeave: any;
  let offboardingRepo: any;
  let auditLogService: any;

  const mockStaff = {
    id: 'staff-001',
    tenantId: 'tenant-001',
    firstName: 'Jane',
    lastName: 'Dlamini',
    basicSalaryCents: 2_500_000, // R25,000/month
    payFrequency: 'MONTHLY',
    startDate: new Date(2023, 2, 1), // 1 March 2023 (local time)
    dateOfBirth: new Date(1990, 0, 1),
    medicalAidMembers: 0,
    isActive: true,
  };

  const dailyRateCents = Math.round(
    mockStaff.basicSalaryCents / WORKING_DAYS_PER_MONTH,
  );

  const simplePayBalance = (name: string, balance: number) => ({
    leave_type_id: 1418851,
    leave_type_name: name,
    opening_balance: 0,
    accrued: 0,
    taken: 0,
    pending: 0,
    adjustment: 0,
    current_balance: balance,
    units: 'days' as const,
  });

  beforeEach(async () => {
    prisma = {
      staff: {
        findUnique: jest.fn().mockResolvedValue(mockStaff),
        findFirst: jest.fn().mockResolvedValue(mockStaff),
        update: jest.fn(),
      },
      staffOffboarding: {
        update: jest.fn(),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    offboardingRepo = {
      findOffboardingById: jest.fn(),
      findOffboardingByStaffId: jest.fn().mockResolvedValue(null),
      createOffboarding: jest.fn(),
      updateFinalPay: jest.fn(),
      createAssetReturn: jest.fn(),
    };

    auditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    simplePayRepo = {
      findConnection: jest.fn().mockResolvedValue(null),
      findEmployeeMapping: jest.fn().mockResolvedValue(null),
    };

    simplePayLeave = {
      getLeaveBalancesByStaff: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffOffboardingService,
        { provide: PrismaService, useValue: prisma },
        { provide: StaffOffboardingRepository, useValue: offboardingRepo },
        {
          provide: PayeService,
          useValue: {
            calculatePaye: jest.fn().mockResolvedValue({ netPayeCents: 0 }),
          },
        },
        {
          provide: UifService,
          useValue: {
            calculateUif: jest
              .fn()
              .mockResolvedValue({ employeeContributionCents: 0 }),
          },
        },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: SimplePayServicePeriodService,
          useValue: { terminateEmployee: jest.fn() },
        },
        { provide: SimplePayLeaveService, useValue: simplePayLeave },
        { provide: SimplePayRepository, useValue: simplePayRepo },
      ],
    }).compile();

    service = module.get<StaffOffboardingService>(StaffOffboardingService);
  });

  describe('SimplePay source (preferred)', () => {
    beforeEach(() => {
      simplePayRepo.findConnection.mockResolvedValue({ isActive: true });
      simplePayRepo.findEmployeeMapping.mockResolvedValue({
        simplePayEmployeeId: 'sp-emp-1',
      });
    });

    it('uses the SimplePay annual leave balance when connected and mapped', async () => {
      simplePayLeave.getLeaveBalancesByStaff.mockResolvedValue([
        simplePayBalance('Sick', 5),
        simplePayBalance('Annual', 10),
      ]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 5, 30),
        false,
      );

      expect(result.leaveBalanceDays).toBe(10);
      expect(result.leavePayoutCents).toBe(Math.round(dailyRateCents * 10));
      expect(result.leaveCalculation).toEqual({
        balanceDays: 10,
        accruedDays: 0,
        takenDays: 0,
        source: 'SIMPLEPAY',
      });
      // Local computation must not run
      expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
    });

    it('matches the annual type by name, case-insensitively', async () => {
      simplePayLeave.getLeaveBalancesByStaff.mockResolvedValue([
        simplePayBalance('ANNUAL LEAVE', 3.5),
      ]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 5, 30),
        false,
      );

      expect(result.leaveBalanceDays).toBe(3.5);
      expect(result.leaveCalculation?.source).toBe('SIMPLEPAY');
    });

    it('clamps a negative SimplePay balance to 0 (BCEA: no negative payout)', async () => {
      simplePayLeave.getLeaveBalancesByStaff.mockResolvedValue([
        simplePayBalance('Annual', -4),
      ]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 5, 30),
        false,
      );

      expect(result.leaveBalanceDays).toBe(0);
      expect(result.leavePayoutCents).toBe(0);
    });

    it('falls back to local computation when the SimplePay call fails', async () => {
      simplePayLeave.getLeaveBalancesByStaff.mockRejectedValue(
        new Error('SimplePay API unavailable'),
      );

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15), // 15 Sep 2026
        false,
      );

      expect(result.leaveCalculation?.source).toBe('LOCAL_COMPUTATION');
      expect(prisma.leaveRequest.findMany).toHaveBeenCalled();
    });

    it('falls back to local computation when SimplePay has no annual leave type', async () => {
      simplePayLeave.getLeaveBalancesByStaff.mockResolvedValue([
        simplePayBalance('Sick', 12),
      ]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15),
        false,
      );

      expect(result.leaveCalculation?.source).toBe('LOCAL_COMPUTATION');
    });

    it('does not call SimplePay when the staff member has no employee mapping', async () => {
      simplePayRepo.findEmployeeMapping.mockResolvedValue(null);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15),
        false,
      );

      expect(simplePayLeave.getLeaveBalancesByStaff).not.toHaveBeenCalled();
      expect(result.leaveCalculation?.source).toBe('LOCAL_COMPUTATION');
    });
  });

  describe('Local computation (fallback)', () => {
    // No SimplePay connection in these tests (findConnection -> null)

    it('accrues 1.25 days per completed month in the current cycle', async () => {
      // Cycle anchored to 1 March anniversary; 1 Mar 2026 -> 15 Sep 2026
      // = 6 completed months = 7.5 days accrued, 2 days taken -> 5.5 balance
      prisma.leaveRequest.findMany.mockResolvedValue([{ totalDays: 2 }]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15), // 15 Sep 2026
        false,
      );

      expect(result.leaveCalculation).toEqual({
        balanceDays: 5.5,
        accruedDays: 7.5,
        takenDays: 2,
        source: 'LOCAL_COMPUTATION',
      });
      expect(result.leaveBalanceDays).toBe(5.5);
      expect(result.leavePayoutCents).toBe(Math.round(dailyRateCents * 5.5));
    });

    it('queries only APPROVED annual leave within the current cycle (excludes unpaid/other leave)', async () => {
      await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15),
        false,
      );

      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith({
        where: {
          staffId: mockStaff.id,
          status: 'APPROVED',
          leaveTypeName: { contains: 'annual', mode: 'insensitive' },
          startDate: {
            gte: new Date(2026, 2, 1), // cycle start: 1 March 2026 anniversary
            lte: new Date(2026, 8, 15),
          },
        },
        select: { totalDays: true },
      });
    });

    it('sums Decimal totalDays across multiple approved annual leave requests', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([
        { totalDays: new Decimal('1.5') },
        { totalDays: new Decimal('2') },
      ]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15),
        false,
      );

      expect(result.leaveCalculation?.takenDays).toBe(3.5);
      expect(result.leaveBalanceDays).toBe(4); // 7.5 - 3.5
    });

    it('yields 0 accrual and 0 payout for tenure under one month', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...mockStaff,
        startDate: new Date(2026, 5, 20), // 20 Jun 2026
      });

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 5, 30), // 30 Jun 2026 - 10 days later
        false,
      );

      expect(result.leaveCalculation).toEqual({
        balanceDays: 0,
        accruedDays: 0,
        takenDays: 0,
        source: 'LOCAL_COMPUTATION',
      });
      expect(result.leavePayoutCents).toBe(0);
    });

    it('clamps the balance to 0 when taken exceeds accrued (BCEA: no negative payout)', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([{ totalDays: 10 }]);

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15), // 6 months -> 7.5 accrued, 10 taken
        false,
      );

      expect(result.leaveCalculation?.balanceDays).toBe(0);
      expect(result.leaveBalanceDays).toBe(0);
      expect(result.leavePayoutCents).toBe(0);
    });

    it('treats a missing start date conservatively as 0 accrual', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        ...mockStaff,
        startDate: null,
      });

      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 8, 15),
        false,
      );

      expect(result.leaveCalculation).toEqual({
        balanceDays: 0,
        accruedDays: 0,
        takenDays: 0,
        source: 'LOCAL_COMPUTATION',
      });
      expect(result.leavePayoutCents).toBe(0);
      expect(prisma.leaveRequest.findMany).not.toHaveBeenCalled();
    });

    it('anchors the cycle to the most recent start-date anniversary', async () => {
      // Anniversary 1 March; last working day 15 Feb 2026 -> cycle started
      // 1 March 2025 -> 11 completed months -> 13.75 accrued
      const result = await service.calculateFinalPay(
        mockStaff.id,
        new Date(2026, 1, 15), // 15 Feb 2026
        false,
      );

      expect(result.leaveCalculation?.accruedDays).toBe(13.75);
      expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startDate: {
              gte: new Date(2025, 2, 1), // 1 March 2025
              lte: new Date(2026, 1, 15),
            },
          }),
        }),
      );
    });
  });

  describe('audit traceability', () => {
    it('records accruedDays, takenDays, dailyRateCents and source when initiating offboarding', async () => {
      prisma.leaveRequest.findMany.mockResolvedValue([{ totalDays: 2 }]);
      offboardingRepo.createOffboarding.mockResolvedValue({ id: 'offb-001' });
      jest
        .spyOn(service, 'getOffboardingProgress')
        .mockResolvedValue({} as any);

      await service.initiateOffboarding(
        'tenant-001',
        {
          staffId: mockStaff.id,
          reason: 'RESIGNATION',
          lastWorkingDay: new Date(2026, 8, 15),
        } as any,
        'user-001',
      );

      expect(auditLogService.logCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            leaveCalculation: {
              accruedDays: 7.5,
              takenDays: 2,
              dailyRateCents,
              source: 'LOCAL_COMPUTATION',
            },
          }),
        }),
      );
    });

    it('records the system-computed leave calculation when final pay is manually updated', async () => {
      offboardingRepo.findOffboardingById.mockResolvedValue({
        id: 'offb-001',
        staffId: mockStaff.id,
        lastWorkingDay: new Date(2026, 8, 15),
        outstandingSalaryCents: 0,
        leavePayoutCents: 0,
        noticePayCents: 0,
      });

      await service.updateFinalPay(
        'offb-001',
        { leavePayoutCents: 999_999 } as any,
        'tenant-001',
        'user-001',
      );

      expect(auditLogService.logUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            leavePayoutCents: 999_999,
            leaveCalculation: expect.objectContaining({
              accruedDays: 7.5,
              takenDays: 0,
              dailyRateCents,
              source: 'LOCAL_COMPUTATION',
            }),
          }),
        }),
      );
    });
  });
});
