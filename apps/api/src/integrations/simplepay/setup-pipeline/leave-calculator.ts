/**
 * Leave Calculator
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Calculates BCEA-compliant pro-rata leave entitlements for new employees.
 * South African Basic Conditions of Employment Act (BCEA) requirements:
 * - Annual Leave: 15 working days per year (pro-rata for first year)
 * - Sick Leave: 30 days per 3-year cycle (NOT pro-rated)
 * - Family Responsibility Leave: 3 days per year (pro-rata for first year)
 * - Maternity Leave: 4 months (handled separately, not pro-rated)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  LeaveEntitlements,
  BCEA_LEAVE,
} from '../../../database/entities/employee-setup-log.entity';

/**
 * Leave calculation context
 */
export interface LeaveCalculationContext {
  startDate: Date;
  referenceDate?: Date; // Date for calculation (defaults to now)
  employmentType: string;
  isPartTime: boolean;
  hoursPerWeek?: number; // For part-time pro-rata
  leaveYearStart?: number; // Month (1-12) when leave year starts (defaults to March = 3)
}

/**
 * Leave calculation result
 */
export interface LeaveCalculationResult {
  entitlements: LeaveEntitlements;
  calculationDetails: {
    startDate: string;
    referenceDate: string;
    leaveYearStart: number;
    leaveYearEnd: number;
    monthsInYear: number;
    proRataFactor: number;
    isPartTime: boolean;
    partTimeMultiplier: number;
  };
}

/**
 * Leave Calculator - BCEA-compliant leave entitlement calculation
 */
@Injectable()
export class LeaveCalculator {
  private readonly logger = new Logger(LeaveCalculator.name);

  /**
   * Calculate pro-rata leave entitlements for a new employee
   */
  calculateProRataLeave(
    context: LeaveCalculationContext,
  ): LeaveCalculationResult {
    const {
      startDate,
      referenceDate = new Date(),
      employmentType,
      isPartTime = false,
      hoursPerWeek = BCEA_LEAVE.WORKING_DAYS_PER_WEEK *
        BCEA_LEAVE.WORKING_HOURS_PER_DAY,
      leaveYearStart = 3, // March
    } = context;

    this.logger.debug(
      `Calculating leave for start date: ${startDate.toISOString()}`,
    );

    // Determine leave year boundaries
    const { yearStart, yearEnd, monthsInYear } = this.getLeaveYearInfo(
      startDate,
      referenceDate,
      leaveYearStart,
    );

    // Calculate pro-rata factor (0-1)
    const proRataFactor = this.calculateProRataFactor(
      startDate,
      yearStart,
      yearEnd,
    );

    // Calculate part-time multiplier
    const fullTimeHours =
      BCEA_LEAVE.WORKING_DAYS_PER_WEEK * BCEA_LEAVE.WORKING_HOURS_PER_DAY;
    const partTimeMultiplier = isPartTime
      ? Math.min(hoursPerWeek / fullTimeHours, 1)
      : 1;

    // Calculate each leave type
    const annualDays = this.calculateAnnualLeave(
      proRataFactor,
      partTimeMultiplier,
    );
    const sickDays = this.calculateSickLeave(); // NOT pro-rated per BCEA
    const familyResponsibilityDays = this.calculateFamilyResponsibilityLeave(
      proRataFactor,
      partTimeMultiplier,
    );
    const maternityMonths = BCEA_LEAVE.MATERNITY_MONTHS; // Fixed, not pro-rated

    const entitlements: LeaveEntitlements = {
      annualDays,
      sickDays,
      familyResponsibilityDays,
      maternityMonths,
    };

    const result: LeaveCalculationResult = {
      entitlements,
      calculationDetails: {
        startDate: startDate.toISOString(),
        referenceDate: referenceDate.toISOString(),
        leaveYearStart,
        leaveYearEnd: ((leaveYearStart + 11) % 12) + 1,
        monthsInYear,
        proRataFactor,
        isPartTime,
        partTimeMultiplier,
      },
    };

    this.logger.log(
      `Calculated leave: annual=${annualDays}, sick=${sickDays}, family=${familyResponsibilityDays}, maternity=${maternityMonths} months`,
    );

    return result;
  }

  /**
   * Calculate annual leave days (pro-rata)
   * BCEA: 15 working days per year
   */
  calculateAnnualLeave(
    proRataFactor: number,
    partTimeMultiplier: number = 1,
  ): number {
    const baseDays = BCEA_LEAVE.ANNUAL_DAYS_PER_YEAR;
    const proRataDays = baseDays * proRataFactor * partTimeMultiplier;
    // Round to 1 decimal place
    return Math.round(proRataDays * 10) / 10;
  }

  /**
   * Calculate sick leave days
   * BCEA: 30 days per 3-year cycle, NOT pro-rated in first year
   * Employee is entitled to full sick leave from start date
   */
  calculateSickLeave(): number {
    // Per BCEA Section 22: Full sick leave is available immediately
    // 30 days over 3-year cycle, so 10 days per year equivalent
    // But employee has access to full 30 days if needed
    return BCEA_LEAVE.SICK_DAYS_PER_CYCLE;
  }

  /**
   * Calculate family responsibility leave days (pro-rata)
   * BCEA: 3 days per year
   */
  calculateFamilyResponsibilityLeave(
    proRataFactor: number,
    partTimeMultiplier: number = 1,
  ): number {
    const baseDays = BCEA_LEAVE.FAMILY_RESPONSIBILITY_DAYS;
    const proRataDays = baseDays * proRataFactor * partTimeMultiplier;
    // Round to 1 decimal place
    return Math.round(proRataDays * 10) / 10;
  }

  /**
   * Get leave year information
   */
  getLeaveYearInfo(
    startDate: Date,
    referenceDate: Date,
    leaveYearStartMonth: number,
  ): {
    yearStart: Date;
    yearEnd: Date;
    monthsInYear: number;
  } {
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth() + 1; // 1-12

    // Determine current leave year boundaries
    let yearStart: Date;
    let yearEnd: Date;

    if (refMonth >= leaveYearStartMonth) {
      // Current leave year started this calendar year
      yearStart = new Date(refYear, leaveYearStartMonth - 1, 1);
      yearEnd = new Date(refYear + 1, leaveYearStartMonth - 1, 0); // Last day before next year start
    } else {
      // Current leave year started last calendar year
      yearStart = new Date(refYear - 1, leaveYearStartMonth - 1, 1);
      yearEnd = new Date(refYear, leaveYearStartMonth - 1, 0);
    }

    const monthsInYear = 12;

    return { yearStart, yearEnd, monthsInYear };
  }

  /**
   * Calculate pro-rata factor based on start date within leave year
   */
  calculateProRataFactor(
    startDate: Date,
    yearStart: Date,
    yearEnd: Date,
  ): number {
    // If start date is before leave year start, employee gets full entitlement
    if (startDate <= yearStart) {
      return 1;
    }

    // If start date is after leave year end, no entitlement for this year
    if (startDate > yearEnd) {
      return 0;
    }

    // Calculate remaining months in the leave year
    const totalMonths = 12;
    const monthsWorked = this.getMonthsBetween(startDate, yearEnd);

    // Pro-rata factor
    const factor = monthsWorked / totalMonths;

    // Round to 2 decimal places
    return Math.round(factor * 100) / 100;
  }

  /**
   * Get number of months between two dates (inclusive)
   */
  private getMonthsBetween(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let months = (end.getFullYear() - start.getFullYear()) * 12;
    months += end.getMonth() - start.getMonth();
    months += 1; // Include the start month

    return Math.max(0, months);
  }

  /**
   * Convert days to hours
   */
  daysToHours(
    days: number,
    hoursPerDay: number = BCEA_LEAVE.WORKING_HOURS_PER_DAY,
  ): number {
    return days * hoursPerDay;
  }

  /**
   * Convert hours to days
   */
  hoursToDays(
    hours: number,
    hoursPerDay: number = BCEA_LEAVE.WORKING_HOURS_PER_DAY,
  ): number {
    return hours / hoursPerDay;
  }

  /**
   * Validate employment qualifies for BCEA leave
   * BCEA applies to employees working more than 24 hours per month
   */
  qualifiesForBCEALeave(hoursPerMonth: number): boolean {
    return hoursPerMonth > 24;
  }

  /**
   * Calculate leave for casual workers
   * Casual workers (<24 hours/month) may have different entitlements
   */
  calculateCasualWorkerLeave(
    context: LeaveCalculationContext,
  ): LeaveCalculationResult {
    // Casual workers working less than 24 hours/month don't qualify for BCEA leave
    // But we still track some entitlements
    const entitlements: LeaveEntitlements = {
      annualDays: 0,
      sickDays: 0,
      familyResponsibilityDays: 0,
      maternityMonths: BCEA_LEAVE.MATERNITY_MONTHS, // Still entitled to maternity
    };

    return {
      entitlements,
      calculationDetails: {
        startDate: context.startDate.toISOString(),
        referenceDate: (context.referenceDate || new Date()).toISOString(),
        leaveYearStart: context.leaveYearStart || 3,
        leaveYearEnd: (((context.leaveYearStart || 3) + 11) % 12) + 1,
        monthsInYear: 12,
        proRataFactor: 0,
        isPartTime: true,
        partTimeMultiplier: 0,
      },
    };
  }
}
