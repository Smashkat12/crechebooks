/**
 * Leave Calculator Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 * Tests BCEA-compliant pro-rata leave calculations for South Africa
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LeaveCalculator,
  LeaveCalculationContext,
} from '../../../src/integrations/simplepay/setup-pipeline/leave-calculator';
import { BCEA_LEAVE } from '../../../src/database/entities/employee-setup-log.entity';

describe('LeaveCalculator', () => {
  let calculator: LeaveCalculator;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeaveCalculator],
    }).compile();

    calculator = module.get<LeaveCalculator>(LeaveCalculator);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(calculator).toBeDefined();
    });
  });

  describe('BCEA Leave Constants', () => {
    it('should have correct BCEA annual leave days', () => {
      expect(BCEA_LEAVE.ANNUAL_DAYS_PER_YEAR).toBe(15);
    });

    it('should have correct BCEA sick leave days per 3-year cycle', () => {
      expect(BCEA_LEAVE.SICK_DAYS_PER_CYCLE).toBe(30);
    });

    it('should have correct BCEA sick leave cycle years', () => {
      expect(BCEA_LEAVE.SICK_CYCLE_YEARS).toBe(3);
    });

    it('should have correct BCEA family responsibility days', () => {
      expect(BCEA_LEAVE.FAMILY_RESPONSIBILITY_DAYS).toBe(3);
    });

    it('should have correct BCEA maternity leave months', () => {
      expect(BCEA_LEAVE.MATERNITY_MONTHS).toBe(4);
    });

    it('should have correct working hours per day', () => {
      expect(BCEA_LEAVE.WORKING_HOURS_PER_DAY).toBe(8);
    });

    it('should have correct working days per week', () => {
      expect(BCEA_LEAVE.WORKING_DAYS_PER_WEEK).toBe(5);
    });
  });

  describe('calculateProRataLeave', () => {
    describe('for full year employment (start at leave year beginning)', () => {
      it('should calculate full year entitlements', () => {
        const context: LeaveCalculationContext = {
          startDate: new Date('2024-03-01'), // Leave year starts March
          referenceDate: new Date('2024-06-01'),
          employmentType: 'PERMANENT',
          isPartTime: false,
        };

        const result = calculator.calculateProRataLeave(context);

        expect(result.entitlements.annualDays).toBe(15); // Full 15 days
        expect(result.entitlements.sickDays).toBe(30); // Full 30 days (NOT pro-rated)
        expect(result.entitlements.familyResponsibilityDays).toBe(3); // Full 3 days
        expect(result.entitlements.maternityMonths).toBe(4); // 4 months
      });
    });

    describe('for mid-year employment start', () => {
      it('should calculate pro-rata annual leave', () => {
        // Start September (6 months remaining in leave year ending Feb)
        const context: LeaveCalculationContext = {
          startDate: new Date('2024-09-01'),
          referenceDate: new Date('2024-09-15'),
          employmentType: 'PERMANENT',
          isPartTime: false,
          leaveYearStart: 3, // March
        };

        const result = calculator.calculateProRataLeave(context);

        // 6 months remaining = 50% of annual leave
        expect(result.entitlements.annualDays).toBeLessThan(15);
        expect(result.entitlements.annualDays).toBeGreaterThan(5);
        // Sick leave is NOT pro-rated per BCEA
        expect(result.entitlements.sickDays).toBe(30);
      });

      it('should calculate pro-rata family responsibility leave', () => {
        const context: LeaveCalculationContext = {
          startDate: new Date('2024-09-01'),
          referenceDate: new Date('2024-09-15'),
          employmentType: 'PERMANENT',
          isPartTime: false,
        };

        const result = calculator.calculateProRataLeave(context);

        expect(result.entitlements.familyResponsibilityDays).toBeLessThan(3);
        expect(result.entitlements.familyResponsibilityDays).toBeGreaterThan(0);
      });
    });

    describe('for part-time employees', () => {
      it('should apply part-time multiplier to leave entitlements', () => {
        const fullTimeContext: LeaveCalculationContext = {
          startDate: new Date('2024-03-01'),
          referenceDate: new Date('2024-06-01'),
          employmentType: 'PERMANENT',
          isPartTime: false,
        };

        const partTimeContext: LeaveCalculationContext = {
          startDate: new Date('2024-03-01'),
          referenceDate: new Date('2024-06-01'),
          employmentType: 'PERMANENT',
          isPartTime: true,
          hoursPerWeek: 20, // Half time (40 hours is full time)
        };

        const fullTimeResult =
          calculator.calculateProRataLeave(fullTimeContext);
        const partTimeResult =
          calculator.calculateProRataLeave(partTimeContext);

        expect(partTimeResult.entitlements.annualDays).toBeLessThan(
          fullTimeResult.entitlements.annualDays,
        );
        expect(partTimeResult.calculationDetails.partTimeMultiplier).toBe(0.5);
      });
    });

    describe('calculation details', () => {
      it('should include complete calculation details', () => {
        const context: LeaveCalculationContext = {
          startDate: new Date('2024-06-01'),
          referenceDate: new Date('2024-06-15'),
          employmentType: 'PERMANENT',
          isPartTime: false,
        };

        const result = calculator.calculateProRataLeave(context);

        expect(result.calculationDetails).toBeDefined();
        expect(result.calculationDetails.startDate).toBeDefined();
        expect(result.calculationDetails.referenceDate).toBeDefined();
        expect(result.calculationDetails.leaveYearStart).toBe(3);
        expect(result.calculationDetails.proRataFactor).toBeDefined();
        expect(result.calculationDetails.isPartTime).toBe(false);
        expect(result.calculationDetails.partTimeMultiplier).toBe(1);
      });
    });
  });

  describe('calculateAnnualLeave', () => {
    it('should return 15 days for full pro-rata factor', () => {
      const result = calculator.calculateAnnualLeave(1, 1);
      expect(result).toBe(15);
    });

    it('should return 7.5 days for 50% pro-rata factor', () => {
      const result = calculator.calculateAnnualLeave(0.5, 1);
      expect(result).toBe(7.5);
    });

    it('should apply part-time multiplier', () => {
      const result = calculator.calculateAnnualLeave(1, 0.5);
      expect(result).toBe(7.5);
    });

    it('should combine pro-rata and part-time multipliers', () => {
      const result = calculator.calculateAnnualLeave(0.5, 0.5);
      expect(result).toBe(3.8); // 15 * 0.5 * 0.5 = 3.75, rounded to 3.8
    });
  });

  describe('calculateSickLeave', () => {
    it('should always return 30 days (NOT pro-rated per BCEA)', () => {
      const result = calculator.calculateSickLeave();
      expect(result).toBe(30);
    });
  });

  describe('calculateFamilyResponsibilityLeave', () => {
    it('should return 3 days for full pro-rata factor', () => {
      const result = calculator.calculateFamilyResponsibilityLeave(1, 1);
      expect(result).toBe(3);
    });

    it('should return 1.5 days for 50% pro-rata factor', () => {
      const result = calculator.calculateFamilyResponsibilityLeave(0.5, 1);
      expect(result).toBe(1.5);
    });

    it('should apply part-time multiplier', () => {
      const result = calculator.calculateFamilyResponsibilityLeave(1, 0.5);
      expect(result).toBe(1.5);
    });
  });

  describe('getLeaveYearInfo', () => {
    it('should calculate correct leave year boundaries for March year start', () => {
      const startDate = new Date('2024-06-01');
      const referenceDate = new Date('2024-06-15');
      const leaveYearStartMonth = 3; // March

      const result = calculator.getLeaveYearInfo(
        startDate,
        referenceDate,
        leaveYearStartMonth,
      );

      expect(result.yearStart.getMonth()).toBe(2); // March (0-indexed)
      expect(result.yearStart.getFullYear()).toBe(2024);
      expect(result.monthsInYear).toBe(12);
    });

    it('should handle reference date before leave year start', () => {
      const startDate = new Date('2024-01-01');
      const referenceDate = new Date('2024-02-15'); // Before March
      const leaveYearStartMonth = 3; // March

      const result = calculator.getLeaveYearInfo(
        startDate,
        referenceDate,
        leaveYearStartMonth,
      );

      // Should use previous year's leave year
      expect(result.yearStart.getFullYear()).toBe(2023);
      expect(result.yearStart.getMonth()).toBe(2); // March
    });
  });

  describe('calculateProRataFactor', () => {
    it('should return 1 for start before leave year start', () => {
      const yearStart = new Date('2024-03-01');
      const yearEnd = new Date('2025-02-28');
      const startDate = new Date('2024-01-01'); // Before year start

      const factor = calculator.calculateProRataFactor(
        startDate,
        yearStart,
        yearEnd,
      );

      expect(factor).toBe(1);
    });

    it('should return 0 for start after leave year end', () => {
      const yearStart = new Date('2024-03-01');
      const yearEnd = new Date('2025-02-28');
      const startDate = new Date('2025-03-15'); // After year end

      const factor = calculator.calculateProRataFactor(
        startDate,
        yearStart,
        yearEnd,
      );

      expect(factor).toBe(0);
    });

    it('should return partial factor for mid-year start', () => {
      const yearStart = new Date('2024-03-01');
      const yearEnd = new Date('2025-02-28');
      const startDate = new Date('2024-09-01'); // 6 months remaining

      const factor = calculator.calculateProRataFactor(
        startDate,
        yearStart,
        yearEnd,
      );

      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(1);
    });
  });

  describe('daysToHours', () => {
    it('should convert days to hours using default 8 hours/day', () => {
      const hours = calculator.daysToHours(5);
      expect(hours).toBe(40);
    });

    it('should use custom hours per day', () => {
      const hours = calculator.daysToHours(5, 9);
      expect(hours).toBe(45);
    });
  });

  describe('hoursToDays', () => {
    it('should convert hours to days using default 8 hours/day', () => {
      const days = calculator.hoursToDays(40);
      expect(days).toBe(5);
    });

    it('should use custom hours per day', () => {
      const days = calculator.hoursToDays(45, 9);
      expect(days).toBe(5);
    });
  });

  describe('qualifiesForBCEALeave', () => {
    it('should return true for employees working more than 24 hours/month', () => {
      expect(calculator.qualifiesForBCEALeave(25)).toBe(true);
      expect(calculator.qualifiesForBCEALeave(160)).toBe(true);
    });

    it('should return false for employees working 24 hours or less per month', () => {
      expect(calculator.qualifiesForBCEALeave(24)).toBe(false);
      expect(calculator.qualifiesForBCEALeave(20)).toBe(false);
    });
  });

  describe('calculateCasualWorkerLeave', () => {
    it('should return zero leave for casual workers not qualifying for BCEA', () => {
      const context: LeaveCalculationContext = {
        startDate: new Date('2024-06-01'),
        employmentType: 'CASUAL',
        isPartTime: true,
        hoursPerWeek: 4, // Less than 24 hours/month
      };

      const result = calculator.calculateCasualWorkerLeave(context);

      expect(result.entitlements.annualDays).toBe(0);
      expect(result.entitlements.sickDays).toBe(0);
      expect(result.entitlements.familyResponsibilityDays).toBe(0);
      // Maternity is still entitled per BCEA
      expect(result.entitlements.maternityMonths).toBe(4);
    });

    it('should include calculation details for casual workers', () => {
      const context: LeaveCalculationContext = {
        startDate: new Date('2024-06-01'),
        employmentType: 'CASUAL',
        isPartTime: true,
      };

      const result = calculator.calculateCasualWorkerLeave(context);

      expect(result.calculationDetails).toBeDefined();
      expect(result.calculationDetails.proRataFactor).toBe(0);
      expect(result.calculationDetails.partTimeMultiplier).toBe(0);
    });
  });
});
