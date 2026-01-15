/**
 * Calendar Service
 * TASK-STAFF-007: SA Public Holiday Calendar
 *
 * @module database/services/calendar
 * @description Comprehensive service for South African public holiday management,
 * working day calculations, and BCEA-compliant public holiday pay calculations.
 *
 * Key Features:
 * - Dynamic holiday generation using Computus algorithm for Easter
 * - Sunday observance rule handling
 * - Working days calculation (excludes weekends and holidays)
 * - Leave deduction calculations
 * - Public holiday pay calculations (BCEA double pay)
 *
 * References:
 * - Public Holidays Act 36 of 1994
 * - Basic Conditions of Employment Act (BCEA), Section 18
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SAPublicHoliday,
  generateHolidaysForYear,
  checkPublicHoliday,
  getHolidaysInRange as getHolidaysInRangeFromConstants,
  calculateEasterSunday,
  calculateGoodFriday,
  calculateFamilyDay,
} from '../constants/sa-public-holidays.constants';

/**
 * Leave deduction calculation result
 */
export interface LeaveDeduction {
  /** Total calendar days in the period */
  totalCalendarDays: number;
  /** Number of working days (excludes weekends) */
  workingDays: number;
  /** Number of public holidays excluded */
  publicHolidaysExcluded: number;
  /** Number of weekend days excluded */
  weekendsExcluded: number;
  /** Final days to deduct from leave balance */
  daysToDeduct: number;
  /** List of holidays in the range */
  holidaysInRange: Array<{ date: Date; name: string }>;
}

/**
 * Public holiday pay calculation result
 */
export interface PublicHolidayPayResult {
  /** Regular daily rate in cents */
  regularDailyRateCents: number;
  /** Hours worked on the holiday */
  hoursWorked: number;
  /** Standard hours in a work day (typically 8) */
  standardWorkDayHours: number;
  /** Total pay for the holiday work in cents */
  totalPayCents: number;
  /** Breakdown of the pay calculation */
  breakdown: {
    /** Base pay for the day (if normally paid for public holidays) */
    basePayCents: number;
    /** Additional pay for working (1x regular rate) */
    additionalPayCents: number;
    /** Pro-rated if less than full day worked */
    proRataFactor: number;
  };
}

/**
 * Working days calculation options
 */
export interface WorkingDaysOptions {
  /** Include public holidays in the count (default: false - excludes them) */
  includePublicHolidays?: boolean;
  /** Custom dates to exclude */
  customExclusions?: Date[];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  /** Standard hours in a work day per BCEA */
  private readonly STANDARD_WORK_DAY_HOURS = 8;

  /** BCEA public holiday pay multiplier (double pay for work) */
  private readonly BCEA_HOLIDAY_PAY_MULTIPLIER = 2;

  /**
   * Get all public holidays for a specific year
   *
   * @param year - The year to get holidays for
   * @returns Array of public holidays including observed dates
   *
   * @example
   * const holidays2025 = calendarService.getHolidaysForYear(2025);
   */
  getHolidaysForYear(year: number): SAPublicHoliday[] {
    this.logger.debug(`Generating holidays for year ${year}`);
    return generateHolidaysForYear(year);
  }

  /**
   * Get public holidays within a date range
   *
   * @param startDate - Start of range (inclusive)
   * @param endDate - End of range (inclusive)
   * @returns Array of holidays in the range
   *
   * @example
   * const holidays = calendarService.getHolidaysInRange(
   *   new Date('2025-01-01'),
   *   new Date('2025-06-30')
   * );
   */
  getHolidaysInRange(startDate: Date, endDate: Date): SAPublicHoliday[] {
    this.logger.debug(
      `Getting holidays from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );
    return getHolidaysInRangeFromConstants(startDate, endDate);
  }

  /**
   * Check if a specific date is a public holiday
   *
   * @param date - The date to check
   * @returns true if the date is a public holiday (original or observed)
   *
   * @example
   * const isHoliday = calendarService.isPublicHoliday(new Date('2025-12-25'));
   */
  isPublicHoliday(date: Date): boolean {
    const result = checkPublicHoliday(date);
    return result.isHoliday;
  }

  /**
   * Get details of a public holiday if the date is one
   *
   * @param date - The date to check
   * @returns Holiday details or undefined if not a holiday
   */
  getPublicHolidayDetails(date: Date): SAPublicHoliday | undefined {
    const result = checkPublicHoliday(date);
    return result.holiday;
  }

  /**
   * Calculate the number of working days in a date range
   *
   * Working days exclude:
   * - Saturdays and Sundays
   * - Public holidays (unless specifically included)
   * - Custom exclusion dates
   *
   * @param startDate - Start of range (inclusive)
   * @param endDate - End of range (inclusive)
   * @param options - Optional configuration
   * @returns Number of working days
   *
   * @example
   * // Get working days excluding holidays
   * const workDays = calendarService.getWorkingDaysInRange(
   *   new Date('2025-01-01'),
   *   new Date('2025-01-31')
   * );
   */
  getWorkingDaysInRange(
    startDate: Date,
    endDate: Date,
    options: WorkingDaysOptions = {},
  ): number {
    const { includePublicHolidays = false, customExclusions = [] } = options;

    // Normalize dates
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    if (normalizedStart > normalizedEnd) {
      this.logger.warn(
        'Start date is after end date, returning 0 working days',
      );
      return 0;
    }

    // Get holidays in range if we're excluding them
    const holidays = includePublicHolidays
      ? []
      : this.getHolidaysInRange(normalizedStart, normalizedEnd);

    const holidayDates = new Set(holidays.map((h) => this.getDateKey(h.date)));

    // Normalize custom exclusions
    const customExclusionSet = new Set(
      customExclusions.map((d) => this.getDateKey(this.normalizeDate(d))),
    );

    let workingDays = 0;
    const currentDate = new Date(normalizedStart);

    while (currentDate <= normalizedEnd) {
      const dateKey = this.getDateKey(currentDate);
      const dayOfWeek = currentDate.getDay();

      // Check if it's a working day
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayDates.has(dateKey);
      const isCustomExclusion = customExclusionSet.has(dateKey);

      if (!isWeekend && !isHoliday && !isCustomExclusion) {
        workingDays++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.logger.debug(
      `Working days from ${normalizedStart.toISOString()} to ${normalizedEnd.toISOString()}: ${workingDays}`,
    );

    return workingDays;
  }

  /**
   * Calculate leave deduction for a leave period
   *
   * Per BCEA, leave is typically calculated in working days, excluding
   * weekends and public holidays that fall within the leave period.
   *
   * @param startDate - First day of leave (inclusive)
   * @param endDate - Last day of leave (inclusive)
   * @returns Detailed leave deduction calculation
   *
   * @example
   * const deduction = calendarService.getLeaveDeductionDays(
   *   new Date('2025-04-14'),
   *   new Date('2025-04-25')
   * );
   * // Returns working days excluding Good Friday and Family Day
   */
  getLeaveDeductionDays(startDate: Date, endDate: Date): LeaveDeduction {
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    // Calculate total calendar days
    const totalCalendarDays =
      this.getDaysBetween(normalizedStart, normalizedEnd) + 1;

    // Get holidays in the range
    const holidays = this.getHolidaysInRange(normalizedStart, normalizedEnd);
    const holidayDates = new Set(holidays.map((h) => this.getDateKey(h.date)));

    let weekendsExcluded = 0;
    let publicHolidaysExcluded = 0;
    let workingDays = 0;

    const currentDate = new Date(normalizedStart);
    const holidaysInRange: Array<{ date: Date; name: string }> = [];

    // Track which holiday dates we've already counted (to avoid double-counting)
    const countedHolidays = new Set<string>();

    while (currentDate <= normalizedEnd) {
      const dateKey = this.getDateKey(currentDate);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayDates.has(dateKey);

      if (isWeekend) {
        weekendsExcluded++;
        // If it's both a weekend AND a holiday, still only count as weekend
        // because weekends are already excluded from working days
      } else if (isHoliday && !countedHolidays.has(dateKey)) {
        publicHolidaysExcluded++;
        countedHolidays.add(dateKey);
        // Find and add holiday details
        const holiday = holidays.find(
          (h) => this.getDateKey(h.date) === dateKey,
        );
        if (holiday) {
          holidaysInRange.push({
            date: new Date(holiday.date),
            name: holiday.name,
          });
        }
      } else if (!isWeekend && !isHoliday) {
        workingDays++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Days to deduct = working days only (excluding weekends and holidays)
    const daysToDeduct = workingDays;

    this.logger.debug(
      `Leave deduction: ${totalCalendarDays} calendar days, ` +
        `${weekendsExcluded} weekends, ${publicHolidaysExcluded} holidays, ` +
        `${daysToDeduct} days to deduct`,
    );

    return {
      totalCalendarDays,
      workingDays,
      publicHolidaysExcluded,
      weekendsExcluded,
      daysToDeduct,
      holidaysInRange,
    };
  }

  /**
   * Calculate public holiday pay per BCEA Section 18
   *
   * BCEA Rules for Public Holiday Pay:
   * - If employee doesn't work: Entitled to normal daily wage
   * - If employee works: Entitled to at least DOUBLE the normal daily wage
   *
   * Double pay = Base pay (what they would have earned) + Additional pay (equal amount)
   *
   * @param dailyRateCents - Normal daily rate in cents
   * @param hoursWorkedOnHoliday - Hours actually worked on the public holiday
   * @returns Detailed pay calculation
   *
   * @example
   * // Employee with R500/day rate works 8 hours on a public holiday
   * const pay = calendarService.calculatePublicHolidayPay(50000, 8);
   * // Returns R1000 (double pay) = 100000 cents
   */
  calculatePublicHolidayPay(
    dailyRateCents: number,
    hoursWorkedOnHoliday: number,
  ): PublicHolidayPayResult {
    // Calculate hourly rate
    const hourlyRateCents = Math.round(
      dailyRateCents / this.STANDARD_WORK_DAY_HOURS,
    );

    // Calculate pro-rata factor for partial day work
    const proRataFactor = Math.min(
      hoursWorkedOnHoliday / this.STANDARD_WORK_DAY_HOURS,
      1, // Cap at 1 for full day
    );

    // Base pay (what they would earn for the holiday anyway)
    const basePayCents = Math.round(dailyRateCents * proRataFactor);

    // Additional pay for working (another 1x their rate)
    const additionalPayCents = Math.round(dailyRateCents * proRataFactor);

    // Total double pay
    const totalPayCents = basePayCents + additionalPayCents;

    this.logger.debug(
      `Public holiday pay: ${hoursWorkedOnHoliday}h worked, ` +
        `base ${basePayCents}c + additional ${additionalPayCents}c = ${totalPayCents}c`,
    );

    return {
      regularDailyRateCents: dailyRateCents,
      hoursWorked: hoursWorkedOnHoliday,
      standardWorkDayHours: this.STANDARD_WORK_DAY_HOURS,
      totalPayCents,
      breakdown: {
        basePayCents,
        additionalPayCents,
        proRataFactor,
      },
    };
  }

  /**
   * Get Easter Sunday date for a year
   *
   * @param year - The year
   * @returns Easter Sunday date
   */
  getEasterSunday(year: number): Date {
    return calculateEasterSunday(year);
  }

  /**
   * Get Good Friday date for a year
   *
   * @param year - The year
   * @returns Good Friday date
   */
  getGoodFriday(year: number): Date {
    return calculateGoodFriday(year);
  }

  /**
   * Get Family Day date for a year
   *
   * @param year - The year
   * @returns Family Day date (Monday after Easter)
   */
  getFamilyDay(year: number): Date {
    return calculateFamilyDay(year);
  }

  /**
   * Check if a date is a weekend (Saturday or Sunday)
   *
   * @param date - The date to check
   * @returns true if weekend
   */
  isWeekend(date: Date): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  /**
   * Check if a date is a working day (not weekend or public holiday)
   *
   * @param date - The date to check
   * @returns true if working day
   */
  isWorkingDay(date: Date): boolean {
    return !this.isWeekend(date) && !this.isPublicHoliday(date);
  }

  /**
   * Get the next working day from a given date
   *
   * @param date - Starting date
   * @returns Next working day (could be the same day if it's a working day)
   */
  getNextWorkingDay(date: Date): Date {
    const current = this.normalizeDate(date);

    while (!this.isWorkingDay(current)) {
      current.setDate(current.getDate() + 1);
    }

    return current;
  }

  /**
   * Get total working days in a month
   *
   * @param year - Year
   * @param month - Month (1-12)
   * @returns Number of working days
   */
  getWorkingDaysInMonth(year: number, month: number): number {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    return this.getWorkingDaysInRange(startOfMonth, endOfMonth);
  }

  /**
   * Generate holidays for a specific year (alias for getHolidaysForYear)
   * Included for API compatibility
   */
  generateHolidaysForYear(year: number): SAPublicHoliday[] {
    return this.getHolidaysForYear(year);
  }

  /**
   * Normalize a date to midnight
   */
  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  /**
   * Get a unique key for a date (for Set comparisons)
   */
  private getDateKey(date: Date): string {
    const normalized = this.normalizeDate(date);
    return `${normalized.getFullYear()}-${String(normalized.getMonth() + 1).padStart(2, '0')}-${String(normalized.getDate()).padStart(2, '0')}`;
  }

  /**
   * Calculate days between two dates
   */
  private getDaysBetween(startDate: Date, endDate: Date): number {
    const start = this.normalizeDate(startDate);
    const end = this.normalizeDate(endDate);
    const diffTime = end.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }
}
