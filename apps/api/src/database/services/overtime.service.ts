/**
 * Overtime Calculation Service
 * TASK-STAFF-006: Fix Overtime Calculation
 *
 * SA BCEA Compliant Overtime Calculations:
 * - Normal hours: max 45/week, 9/day (5-day week) or 8/day (6-day week)
 * - Overtime rate: 1.5x for first 10 hours, 2x thereafter
 * - Sunday/Public holiday: 2x rate
 * - Night shift differential (18:00-06:00): +10%
 *
 * All monetary values in CENTS (integers)
 * Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN)
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  NotFoundException,
  ValidationException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// BCEA Constants
export const BCEA_NORMAL_WEEKLY_HOURS = 45;
export const BCEA_NORMAL_DAILY_5DAY = 9; // 5-day work week
export const BCEA_NORMAL_DAILY_6DAY = 8; // 6-day work week
export const OVERTIME_RATE_STANDARD = 1.5; // First 10 hours
export const OVERTIME_RATE_EXTENDED = 2.0; // After 10 overtime hours
export const SUNDAY_HOLIDAY_RATE = 2.0;
export const NIGHT_SHIFT_DIFFERENTIAL = 0.1; // 10% extra
export const MAX_WEEKLY_OVERTIME_HOURS = 10; // BCEA limit

// Night shift hours
export const NIGHT_SHIFT_START_HOUR = 18; // 6 PM
export const NIGHT_SHIFT_END_HOUR = 6; // 6 AM

// South African Public Holidays 2026
const SA_PUBLIC_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-03-21', // Human Rights Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Family Day
  '2026-04-27', // Freedom Day
  '2026-05-01', // Workers' Day
  '2026-06-16', // Youth Day
  '2026-08-09', // National Women's Day
  '2026-08-10', // National Women's Day (observed)
  '2026-09-24', // Heritage Day
  '2026-12-16', // Day of Reconciliation
  '2026-12-25', // Christmas Day
  '2026-12-26', // Day of Goodwill
];

export interface IOvertimeEntry {
  id: string;
  staffId: string;
  date: Date;
  normalHoursWorked: number;
  overtimeHours: number;
  normalPayCents: number;
  overtimePayCents: number;
  nightShiftPayCents: number;
  totalPayCents: number;
  isWeekend: boolean;
  isSunday: boolean;
  isPublicHoliday: boolean;
  hasNightShift: boolean;
  overtimeRate: number;
}

export interface IOvertimeCalculation {
  hoursWorked: number;
  normalHours: number;
  overtimeHours: number;
  hourlyRateCents: number;
  normalPayCents: number;
  overtimePayCents: number;
  nightShiftPayCents: number;
  totalPayCents: number;
  effectiveOvertimeRate: number;
  breakdown: {
    standardOvertimeHours: number;
    extendedOvertimeHours: number;
    standardOvertimePayCents: number;
    extendedOvertimePayCents: number;
    sundayHolidayPayCents: number;
    nightDifferentialCents: number;
  };
}

export interface IMonthlyOvertimeSummary {
  staffId: string;
  staffName: string;
  month: number;
  year: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  totalNormalPayCents: number;
  totalOvertimePayCents: number;
  totalNightShiftPayCents: number;
  totalPayCents: number;
  dailyBreakdown: IOvertimeEntry[];
  weeklyTotals: {
    weekNumber: number;
    normalHours: number;
    overtimeHours: number;
    totalPayCents: number;
  }[];
}

export interface IOvertimeRequest {
  staffId: string;
  date: Date;
  hoursWorked: number;
  shiftStartTime?: string; // HH:mm format
  shiftEndTime?: string;
}

@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Calculate overtime pay for given hours worked
   * SA BCEA Compliant calculation
   *
   * @param hoursWorked - Total hours worked
   * @param normalHours - Normal hours for the day (9 for 5-day, 8 for 6-day)
   * @param hourlyRateCents - Base hourly rate in cents
   * @param isWeekend - Is it a weekend (Saturday)
   * @param isPublicHoliday - Is it a public holiday
   * @param isNightShift - Is it a night shift (18:00-06:00)
   * @returns Complete overtime calculation breakdown
   */
  calculateOvertimePay(
    hoursWorked: number,
    normalHours: number,
    hourlyRateCents: number,
    isWeekend: boolean,
    isPublicHoliday: boolean,
    isNightShift: boolean,
  ): IOvertimeCalculation {
    // Validate inputs
    if (hoursWorked < 0) {
      throw new ValidationException('Hours worked cannot be negative', [
        { field: 'hoursWorked', message: 'Hours worked cannot be negative' },
      ]);
    }
    if (hourlyRateCents < 0) {
      throw new ValidationException('Hourly rate cannot be negative', [
        { field: 'hourlyRateCents', message: 'Hourly rate cannot be negative' },
      ]);
    }

    const isSunday = isWeekend && new Date().getDay() === 0;
    const overtimeHours = Math.max(0, hoursWorked - normalHours);

    // Calculate normal pay
    const normalWorkedHours = Math.min(hoursWorked, normalHours);
    let normalPayCents = new Decimal(normalWorkedHours)
      .mul(hourlyRateCents)
      .round()
      .toNumber();

    // For Sunday/Public Holiday, even normal hours are at 2x
    if (isPublicHoliday || isSunday) {
      normalPayCents = new Decimal(normalWorkedHours)
        .mul(hourlyRateCents)
        .mul(SUNDAY_HOLIDAY_RATE)
        .round()
        .toNumber();
    }

    // Calculate overtime pay
    let standardOvertimeHours = 0;
    let extendedOvertimeHours = 0;
    let standardOvertimePayCents = 0;
    let extendedOvertimePayCents = 0;
    let sundayHolidayPayCents = 0;

    if (overtimeHours > 0) {
      if (isPublicHoliday || isSunday) {
        // All overtime at 2x rate for Sunday/public holiday
        sundayHolidayPayCents = new Decimal(overtimeHours)
          .mul(hourlyRateCents)
          .mul(SUNDAY_HOLIDAY_RATE)
          .round()
          .toNumber();
      } else {
        // First 10 hours at 1.5x, thereafter at 2x
        standardOvertimeHours = Math.min(
          overtimeHours,
          MAX_WEEKLY_OVERTIME_HOURS,
        );
        extendedOvertimeHours = Math.max(
          0,
          overtimeHours - MAX_WEEKLY_OVERTIME_HOURS,
        );

        standardOvertimePayCents = new Decimal(standardOvertimeHours)
          .mul(hourlyRateCents)
          .mul(OVERTIME_RATE_STANDARD)
          .round()
          .toNumber();

        extendedOvertimePayCents = new Decimal(extendedOvertimeHours)
          .mul(hourlyRateCents)
          .mul(OVERTIME_RATE_EXTENDED)
          .round()
          .toNumber();
      }
    }

    const overtimePayCents =
      standardOvertimePayCents +
      extendedOvertimePayCents +
      sundayHolidayPayCents;

    // Calculate night shift differential
    let nightDifferentialCents = 0;
    let nightShiftPayCents = 0;
    if (isNightShift) {
      const basePayForNight = normalPayCents + overtimePayCents;
      nightDifferentialCents = new Decimal(basePayForNight)
        .mul(NIGHT_SHIFT_DIFFERENTIAL)
        .round()
        .toNumber();
      nightShiftPayCents = nightDifferentialCents;
    }

    const totalPayCents =
      normalPayCents + overtimePayCents + nightShiftPayCents;

    // Calculate effective overtime rate
    const effectiveOvertimeRate =
      overtimeHours > 0
        ? new Decimal(overtimePayCents)
            .div(overtimeHours)
            .div(hourlyRateCents)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    return {
      hoursWorked,
      normalHours: normalWorkedHours,
      overtimeHours,
      hourlyRateCents,
      normalPayCents,
      overtimePayCents,
      nightShiftPayCents,
      totalPayCents,
      effectiveOvertimeRate,
      breakdown: {
        standardOvertimeHours,
        extendedOvertimeHours,
        standardOvertimePayCents,
        extendedOvertimePayCents,
        sundayHolidayPayCents,
        nightDifferentialCents,
      },
    };
  }

  /**
   * Calculate daily overtime for a staff member
   */
  async calculateDailyOvertime(
    tenantId: string,
    request: IOvertimeRequest,
  ): Promise<IOvertimeEntry> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: request.staffId, tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', request.staffId);
    }

    const date = new Date(request.date);
    const isWeekend = this.isWeekend(date);
    const isSunday = date.getDay() === 0;
    const isPublicHoliday = this.isPublicHoliday(date);
    const hasNightShift = this.isNightShift(
      request.shiftStartTime,
      request.shiftEndTime,
    );

    // Calculate hourly rate from monthly salary
    const hourlyRateCents = this.calculateHourlyRate(staff.basicSalaryCents);

    // Get normal hours based on work schedule (assume 5-day week)
    const normalHours = BCEA_NORMAL_DAILY_5DAY;

    const calculation = this.calculateOvertimePay(
      request.hoursWorked,
      normalHours,
      hourlyRateCents,
      isWeekend,
      isPublicHoliday,
      hasNightShift,
    );

    return {
      id: this.generateId(),
      staffId: request.staffId,
      date,
      normalHoursWorked: calculation.normalHours,
      overtimeHours: calculation.overtimeHours,
      normalPayCents: calculation.normalPayCents,
      overtimePayCents: calculation.overtimePayCents,
      nightShiftPayCents: calculation.nightShiftPayCents,
      totalPayCents: calculation.totalPayCents,
      isWeekend,
      isSunday,
      isPublicHoliday,
      hasNightShift,
      overtimeRate: calculation.effectiveOvertimeRate,
    };
  }

  /**
   * Calculate monthly overtime summary
   */
  async calculateMonthlyOvertime(
    tenantId: string,
    staffId: string,
    month: number,
    year: number,
  ): Promise<IMonthlyOvertimeSummary> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const _startDate = new Date(year, month - 1, 1);
    const _endDate = new Date(year, month, 0);

    // In production, fetch actual time entries using _startDate and _endDate
    // For now, return empty summary structure
    const dailyBreakdown: IOvertimeEntry[] = [];
    const weeklyTotals: {
      weekNumber: number;
      normalHours: number;
      overtimeHours: number;
      totalPayCents: number;
    }[] = [];

    return {
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      month,
      year,
      totalNormalHours: 0,
      totalOvertimeHours: 0,
      totalNormalPayCents: 0,
      totalOvertimePayCents: 0,
      totalNightShiftPayCents: 0,
      totalPayCents: 0,
      dailyBreakdown,
      weeklyTotals,
    };
  }

  /**
   * Calculate weekly overtime totals
   * Ensures total weekly hours don't exceed BCEA limits
   */
  calculateWeeklyOvertimeTotals(dailyEntries: IOvertimeEntry[]): {
    totalNormalHours: number;
    totalOvertimeHours: number;
    exceededWeeklyLimit: boolean;
    excessHours: number;
  } {
    let totalNormalHours = 0;
    let totalOvertimeHours = 0;

    for (const entry of dailyEntries) {
      totalNormalHours += entry.normalHoursWorked;
      totalOvertimeHours += entry.overtimeHours;
    }

    const totalWeeklyHours = totalNormalHours + totalOvertimeHours;
    const maxWeeklyHours = BCEA_NORMAL_WEEKLY_HOURS + MAX_WEEKLY_OVERTIME_HOURS;
    const exceededWeeklyLimit = totalWeeklyHours > maxWeeklyHours;
    const excessHours = Math.max(0, totalWeeklyHours - maxWeeklyHours);

    return {
      totalNormalHours,
      totalOvertimeHours,
      exceededWeeklyLimit,
      excessHours,
    };
  }

  /**
   * Check if date falls on a weekend
   */
  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  /**
   * Check if date is a South African public holiday
   */
  isPublicHoliday(date: Date): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return SA_PUBLIC_HOLIDAYS_2026.includes(dateStr);
  }

  /**
   * Check if shift includes night hours (18:00-06:00)
   */
  isNightShift(startTime?: string, endTime?: string): boolean {
    if (!startTime || !endTime) {
      return false;
    }

    const [startHour] = startTime.split(':').map(Number);
    const [endHour] = endTime.split(':').map(Number);

    // Check if any part of shift falls in night hours
    return (
      startHour >= NIGHT_SHIFT_START_HOUR ||
      startHour < NIGHT_SHIFT_END_HOUR ||
      endHour >= NIGHT_SHIFT_START_HOUR ||
      endHour < NIGHT_SHIFT_END_HOUR
    );
  }

  /**
   * Calculate hourly rate from monthly salary
   * Using BCEA standard: 45 hours/week * 52 weeks / 12 months = 195 hours/month
   */
  calculateHourlyRate(monthlySalaryCents: number): number {
    const hoursPerMonth = (BCEA_NORMAL_WEEKLY_HOURS * 52) / 12;
    return new Decimal(monthlySalaryCents)
      .div(hoursPerMonth)
      .round()
      .toNumber();
  }

  /**
   * Get normal daily hours based on work schedule type
   */
  getNormalDailyHours(workDaysPerWeek: 5 | 6): number {
    return workDaysPerWeek === 5
      ? BCEA_NORMAL_DAILY_5DAY
      : BCEA_NORMAL_DAILY_6DAY;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get list of SA public holidays for a year
   */
  getPublicHolidays(year: number): string[] {
    // In production, this would be configurable per tenant
    // For now, return 2026 holidays
    if (year === 2026) {
      return SA_PUBLIC_HOLIDAYS_2026;
    }
    return [];
  }
}
