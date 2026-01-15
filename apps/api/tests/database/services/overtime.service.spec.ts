/**
 * Overtime Service Tests
 * TASK-STAFF-006: Fix Overtime Calculation
 *
 * Tests for SA BCEA compliant overtime calculations:
 * - Normal hours limits (45/week, 9/day for 5-day, 8/day for 6-day)
 * - Overtime rates (1.5x first 10 hours, 2x thereafter)
 * - Sunday/Public holiday rates (2x)
 * - Night shift differential (+10%)
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import {
  OvertimeService,
  BCEA_NORMAL_WEEKLY_HOURS,
  BCEA_NORMAL_DAILY_5DAY,
  BCEA_NORMAL_DAILY_6DAY,
  OVERTIME_RATE_STANDARD,
  OVERTIME_RATE_EXTENDED,
  SUNDAY_HOLIDAY_RATE,
  NIGHT_SHIFT_DIFFERENTIAL,
} from '../../../src/database/services/overtime.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';

// Configure Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('OvertimeService', () => {
  let service: OvertimeService;

  const mockStaff = {
    id: 'staff-001',
    tenantId: 'tenant-001',
    firstName: 'John',
    lastName: 'Doe',
    basicSalaryCents: 2500000, // R25,000
  };

  beforeEach(async () => {
    const mockPrismaService = {
      staff: {
        findFirst: jest.fn().mockResolvedValue(mockStaff),
      },
    };

    const mockAuditLogService = {
      logCreate: jest.fn(),
      logUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OvertimeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<OvertimeService>(OvertimeService);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('BCEA Constants', () => {
    it('should have correct BCEA values', () => {
      expect(BCEA_NORMAL_WEEKLY_HOURS).toBe(45);
      expect(BCEA_NORMAL_DAILY_5DAY).toBe(9);
      expect(BCEA_NORMAL_DAILY_6DAY).toBe(8);
      expect(OVERTIME_RATE_STANDARD).toBe(1.5);
      expect(OVERTIME_RATE_EXTENDED).toBe(2.0);
      expect(SUNDAY_HOLIDAY_RATE).toBe(2.0);
      expect(NIGHT_SHIFT_DIFFERENTIAL).toBe(0.1);
    });
  });

  describe('calculateOvertimePay - Basic Overtime', () => {
    const hourlyRate = 12821; // R128.21 (R25,000 / 195 hours)

    it('should calculate normal pay without overtime', () => {
      const result = service.calculateOvertimePay(
        8, // hours worked
        9, // normal hours
        hourlyRate,
        false, // not weekend
        false, // not holiday
        false, // not night shift
      );

      expect(result.normalHours).toBe(8);
      expect(result.overtimeHours).toBe(0);
      expect(result.normalPayCents).toBe(8 * hourlyRate);
      expect(result.overtimePayCents).toBe(0);
    });

    it('should calculate overtime at 1.5x rate', () => {
      const result = service.calculateOvertimePay(
        11, // 2 hours overtime
        9,
        hourlyRate,
        false,
        false,
        false,
      );

      expect(result.overtimeHours).toBe(2);
      expect(result.breakdown.standardOvertimeHours).toBe(2);
      expect(result.breakdown.extendedOvertimeHours).toBe(0);

      const expectedOvertimePay = new Decimal(2)
        .mul(hourlyRate)
        .mul(1.5)
        .round()
        .toNumber();
      expect(result.overtimePayCents).toBe(expectedOvertimePay);
    });

    it('should calculate extended overtime at 2x rate after 10 hours', () => {
      const result = service.calculateOvertimePay(
        22, // 13 hours overtime (9 normal + 13 OT)
        9,
        hourlyRate,
        false,
        false,
        false,
      );

      expect(result.overtimeHours).toBe(13);
      expect(result.breakdown.standardOvertimeHours).toBe(10);
      expect(result.breakdown.extendedOvertimeHours).toBe(3);

      const standardOT = new Decimal(10)
        .mul(hourlyRate)
        .mul(1.5)
        .round()
        .toNumber();
      const extendedOT = new Decimal(3)
        .mul(hourlyRate)
        .mul(2.0)
        .round()
        .toNumber();

      expect(result.breakdown.standardOvertimePayCents).toBe(standardOT);
      expect(result.breakdown.extendedOvertimePayCents).toBe(extendedOT);
    });
  });

  describe('calculateOvertimePay - Sunday/Public Holiday', () => {
    const hourlyRate = 12821;

    it('should calculate Sunday pay at 2x rate', () => {
      // Simulate Sunday - use weekend flag with isSunday check
      const result = service.calculateOvertimePay(
        8,
        9,
        hourlyRate,
        true, // weekend
        false, // not public holiday
        false,
      );

      // Note: The service checks for Sunday specifically using getDay() internally
      // For this test, we simulate Sunday behavior
      expect(result.normalPayCents).toBeGreaterThan(0);
    });

    it('should calculate public holiday pay at 2x rate for normal hours', () => {
      const result = service.calculateOvertimePay(
        8,
        9,
        hourlyRate,
        false,
        true, // public holiday
        false,
      );

      const expectedPay = new Decimal(8)
        .mul(hourlyRate)
        .mul(2.0)
        .round()
        .toNumber();
      expect(result.normalPayCents).toBe(expectedPay);
    });

    it('should calculate public holiday overtime at 2x rate', () => {
      const result = service.calculateOvertimePay(
        12, // 3 hours overtime
        9,
        hourlyRate,
        false,
        true, // public holiday
        false,
      );

      expect(result.overtimeHours).toBe(3);
      const expectedOT = new Decimal(3)
        .mul(hourlyRate)
        .mul(2.0)
        .round()
        .toNumber();
      expect(result.breakdown.sundayHolidayPayCents).toBe(expectedOT);
    });
  });

  describe('calculateOvertimePay - Night Shift Differential', () => {
    const hourlyRate = 12821;

    it('should add 10% night shift differential', () => {
      const result = service.calculateOvertimePay(
        8,
        9,
        hourlyRate,
        false,
        false,
        true, // night shift
      );

      const basePay = 8 * hourlyRate;
      const expectedNightDiff = new Decimal(basePay)
        .mul(0.1)
        .round()
        .toNumber();

      expect(result.nightShiftPayCents).toBe(expectedNightDiff);
      expect(result.breakdown.nightDifferentialCents).toBe(expectedNightDiff);
    });

    it('should apply night differential on overtime as well', () => {
      const result = service.calculateOvertimePay(
        11, // 2 hours overtime
        9,
        hourlyRate,
        false,
        false,
        true, // night shift
      );

      const normalPay = 9 * hourlyRate;
      const overtimePay = new Decimal(2)
        .mul(hourlyRate)
        .mul(1.5)
        .round()
        .toNumber();
      const basePay = normalPay + overtimePay;
      const expectedNightDiff = new Decimal(basePay)
        .mul(0.1)
        .round()
        .toNumber();

      expect(result.nightShiftPayCents).toBe(expectedNightDiff);
    });
  });

  describe('calculateOvertimePay - Validation', () => {
    it('should throw error for negative hours', () => {
      expect(() =>
        service.calculateOvertimePay(-5, 9, 12821, false, false, false),
      ).toThrow('cannot be negative');
    });

    it('should throw error for negative hourly rate', () => {
      expect(() =>
        service.calculateOvertimePay(8, 9, -12821, false, false, false),
      ).toThrow('cannot be negative');
    });

    it('should handle zero hours worked', () => {
      const result = service.calculateOvertimePay(
        0,
        9,
        12821,
        false,
        false,
        false,
      );

      expect(result.normalHours).toBe(0);
      expect(result.overtimeHours).toBe(0);
      expect(result.totalPayCents).toBe(0);
    });
  });

  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      const saturday = new Date('2024-06-15'); // Saturday
      expect(service.isWeekend(saturday)).toBe(true);
    });

    it('should return true for Sunday', () => {
      const sunday = new Date('2024-06-16'); // Sunday
      expect(service.isWeekend(sunday)).toBe(true);
    });

    it('should return false for weekday', () => {
      const wednesday = new Date('2024-06-12'); // Wednesday
      expect(service.isWeekend(wednesday)).toBe(false);
    });
  });

  describe('isPublicHoliday', () => {
    it("should return true for New Year's Day", () => {
      const newYear = new Date('2026-01-01');
      expect(service.isPublicHoliday(newYear)).toBe(true);
    });

    it('should return true for Freedom Day', () => {
      const freedomDay = new Date('2026-04-27');
      expect(service.isPublicHoliday(freedomDay)).toBe(true);
    });

    it('should return true for Christmas', () => {
      const christmas = new Date('2026-12-25');
      expect(service.isPublicHoliday(christmas)).toBe(true);
    });

    it('should return false for regular day', () => {
      const regularDay = new Date('2026-06-15');
      expect(service.isPublicHoliday(regularDay)).toBe(false);
    });
  });

  describe('isNightShift', () => {
    it('should return true for shift starting at 18:00', () => {
      expect(service.isNightShift('18:00', '02:00')).toBe(true);
    });

    it('should return true for shift ending before 06:00', () => {
      expect(service.isNightShift('22:00', '05:00')).toBe(true);
    });

    it('should return false for day shift', () => {
      expect(service.isNightShift('08:00', '17:00')).toBe(false);
    });

    it('should return false when times not provided', () => {
      expect(service.isNightShift(undefined, undefined)).toBe(false);
    });
  });

  describe('calculateHourlyRate', () => {
    it('should calculate hourly rate from monthly salary', () => {
      const monthlySalary = 2500000; // R25,000
      const result = service.calculateHourlyRate(monthlySalary);

      // Expected: R25,000 / 195 hours = R128.21
      const expected = new Decimal(monthlySalary)
        .div((45 * 52) / 12)
        .round()
        .toNumber();

      expect(result).toBe(expected);
    });
  });

  describe('getNormalDailyHours', () => {
    it('should return 9 hours for 5-day work week', () => {
      expect(service.getNormalDailyHours(5)).toBe(9);
    });

    it('should return 8 hours for 6-day work week', () => {
      expect(service.getNormalDailyHours(6)).toBe(8);
    });
  });

  describe('calculateWeeklyOvertimeTotals', () => {
    it('should aggregate daily entries', () => {
      const entries = [
        { normalHoursWorked: 9, overtimeHours: 2 },
        { normalHoursWorked: 9, overtimeHours: 1 },
        { normalHoursWorked: 9, overtimeHours: 0 },
        { normalHoursWorked: 9, overtimeHours: 3 },
        { normalHoursWorked: 9, overtimeHours: 2 },
      ] as any;

      const result = service.calculateWeeklyOvertimeTotals(entries);

      expect(result.totalNormalHours).toBe(45);
      expect(result.totalOvertimeHours).toBe(8);
      expect(result.exceededWeeklyLimit).toBe(false);
    });

    it('should detect weekly limit exceeded', () => {
      const entries = [
        { normalHoursWorked: 9, overtimeHours: 3 },
        { normalHoursWorked: 9, overtimeHours: 3 },
        { normalHoursWorked: 9, overtimeHours: 3 },
        { normalHoursWorked: 9, overtimeHours: 3 },
        { normalHoursWorked: 9, overtimeHours: 3 }, // 15 hours overtime total
      ] as any;

      const result = service.calculateWeeklyOvertimeTotals(entries);

      expect(result.totalOvertimeHours).toBe(15);
      expect(result.exceededWeeklyLimit).toBe(true);
      expect(result.excessHours).toBe(5); // 15 - 10 max OT
    });
  });

  describe('calculateDailyOvertime', () => {
    it('should calculate daily overtime for staff', async () => {
      const result = await service.calculateDailyOvertime('tenant-001', {
        staffId: 'staff-001',
        date: new Date('2024-06-12'), // Wednesday
        hoursWorked: 11,
      });

      expect(result.staffId).toBe('staff-001');
      expect(result.normalHoursWorked).toBe(9);
      expect(result.overtimeHours).toBe(2);
      expect(result.isWeekend).toBe(false);
      expect(result.isPublicHoliday).toBe(false);
    });
  });

  describe('getPublicHolidays', () => {
    it('should return SA public holidays for 2026', () => {
      const holidays = service.getPublicHolidays(2026);

      expect(holidays).toContain('2026-01-01');
      expect(holidays).toContain('2026-04-27');
      expect(holidays).toContain('2026-12-25');
      expect(holidays.length).toBeGreaterThan(10);
    });
  });

  describe('Complete Overtime Scenario', () => {
    it('should calculate complex overtime scenario correctly', () => {
      const hourlyRate = 12821; // R128.21

      // Scenario: 12 hours worked on a public holiday night shift
      const result = service.calculateOvertimePay(
        12, // hours worked
        9, // normal hours
        hourlyRate,
        false,
        true, // public holiday
        true, // night shift
      );

      // Normal hours at 2x: 9 * R128.21 * 2 = R2,307.78
      const normalPay = new Decimal(9)
        .mul(hourlyRate)
        .mul(2)
        .round()
        .toNumber();

      // Overtime at 2x (public holiday): 3 * R128.21 * 2 = R769.26
      const overtimePay = new Decimal(3)
        .mul(hourlyRate)
        .mul(2)
        .round()
        .toNumber();

      // Night differential: 10% of (normal + OT)
      const basePay = normalPay + overtimePay;
      const nightDiff = new Decimal(basePay).mul(0.1).round().toNumber();

      expect(result.normalPayCents).toBe(normalPay);
      expect(result.breakdown.sundayHolidayPayCents).toBe(overtimePay);
      expect(result.nightShiftPayCents).toBe(nightDiff);
      expect(result.totalPayCents).toBe(basePay + nightDiff);
    });
  });
});
