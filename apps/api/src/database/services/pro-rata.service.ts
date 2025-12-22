/**
 * Pro-rata Calculation Service
 * TASK-BILL-014: Pro-rata Calculation Service
 *
 * @module database/services/pro-rata
 * @description Calculates pro-rated fees for children who start or end
 * their enrollment mid-month. Accounts for school holidays (public
 * holidays and creche closure days) when calculating billable days.
 *
 * CRITICAL: All calculations use Decimal.js with banker's rounding.
 * CRITICAL: Daily rate = monthly_fee / school_days_in_month
 * CRITICAL: Pro-rata = daily_rate * billed_school_days
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TenantRepository } from '../repositories/tenant.repository';
import {
  ProRataCalculation,
  ExcludedDay,
  ExclusionReason,
} from '../dto/pro-rata.dto';
import { isPublicHoliday } from '../constants/public-holidays';
import { BusinessException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
});

@Injectable()
export class ProRataService {
  private readonly logger = new Logger(ProRataService.name);

  constructor(private readonly tenantRepo: TenantRepository) {}

  /**
   * Calculate pro-rata amount for partial month enrollment
   *
   * @param monthlyFeeCents - Monthly fee in cents (integer)
   * @param startDate - First attendance date (inclusive)
   * @param endDate - Last attendance date (inclusive)
   * @param tenantId - For tenant-specific holiday/closure settings
   * @returns Pro-rated amount in cents with banker's rounding
   */
  async calculateProRata(
    monthlyFeeCents: number,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<number> {
    // Normalize dates
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    // Validate dates
    if (normalizedStart > normalizedEnd) {
      throw new BusinessException(
        'Start date must be before or equal to end date',
        'INVALID_DATE_RANGE',
      );
    }

    // Get month boundaries for the billing period
    const monthStart = this.getMonthStart(normalizedStart);
    const monthEnd = this.getMonthEnd(normalizedStart);

    // Get school days in full month
    const schoolDaysInMonth = await this.getSchoolDays(
      monthStart,
      monthEnd,
      tenantId,
    );

    if (schoolDaysInMonth === 0) {
      // Edge case: entire month is holidays/weekends
      this.logger.warn(
        `No school days in month for tenant ${tenantId}, returning 0`,
      );
      return 0;
    }

    // Calculate daily rate using Decimal.js
    const monthlyFee = new Decimal(monthlyFeeCents);
    const dailyRate = monthlyFee.div(schoolDaysInMonth);

    // Get school days in billed period
    const billedDays = await this.getSchoolDays(
      normalizedStart,
      normalizedEnd,
      tenantId,
    );

    // Calculate pro-rata amount
    const proRataAmount = dailyRate.mul(billedDays);

    // Round to integer cents using banker's rounding
    const proRataCents = proRataAmount
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    this.logger.debug(
      `Pro-rata: ${monthlyFeeCents} cents → ${proRataCents} cents ` +
        `(${billedDays}/${schoolDaysInMonth} days)`,
    );

    return proRataCents;
  }

  /**
   * Calculate pro-rata with detailed breakdown
   * Useful for debugging and displaying calculation details
   */
  async calculateProRataDetailed(
    monthlyFeeCents: number,
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<ProRataCalculation> {
    // Normalize dates
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    // Validate dates
    if (normalizedStart > normalizedEnd) {
      throw new BusinessException(
        'Start date must be before or equal to end date',
        'INVALID_DATE_RANGE',
      );
    }

    // Get month boundaries
    const monthStart = this.getMonthStart(normalizedStart);
    const monthEnd = this.getMonthEnd(normalizedStart);

    // Get total days in month
    const totalDaysInMonth = monthEnd.getDate();

    // Get school days in full month
    const schoolDaysInMonth = await this.getSchoolDays(
      monthStart,
      monthEnd,
      tenantId,
    );

    // Calculate daily rate
    let dailyRateCents = 0;
    if (schoolDaysInMonth > 0) {
      const monthlyFee = new Decimal(monthlyFeeCents);
      const dailyRate = monthlyFee.div(schoolDaysInMonth);
      dailyRateCents = dailyRate
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber();
    }

    // Get excluded days in billed period
    const excludedDays = await this.getExcludedDays(
      normalizedStart,
      normalizedEnd,
      tenantId,
    );

    // Get billed school days
    const billedDays = await this.getSchoolDays(
      normalizedStart,
      normalizedEnd,
      tenantId,
    );

    // Calculate pro-rata amount
    let proRataCents = 0;
    if (schoolDaysInMonth > 0) {
      const monthlyFee = new Decimal(monthlyFeeCents);
      const dailyRate = monthlyFee.div(schoolDaysInMonth);
      const proRataAmount = dailyRate.mul(billedDays);
      proRataCents = proRataAmount
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
        .toNumber();
    }

    return {
      originalAmountCents: monthlyFeeCents,
      proRataAmountCents: proRataCents,
      dailyRateCents,
      totalDaysInMonth,
      schoolDaysInMonth,
      billedDays,
      startDate: normalizedStart,
      endDate: normalizedEnd,
      excludedDays,
    };
  }

  /**
   * Get number of school days in period (excludes weekends and holidays)
   *
   * @param startDate - Period start (inclusive)
   * @param endDate - Period end (inclusive)
   * @param tenantId - For tenant-specific closure days
   * @returns Count of billable days
   */
  async getSchoolDays(
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<number> {
    // Normalize dates
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);

    // Get tenant closure dates
    const closureDates = await this.getTenantClosureDates(tenantId);

    let schoolDays = 0;
    const currentDate = new Date(normalizedStart);

    while (currentDate <= normalizedEnd) {
      // Check if this is a school day
      let isSchoolDay = true;

      if (this.isWeekend(currentDate)) {
        isSchoolDay = false;
      } else if (isPublicHoliday(currentDate)) {
        isSchoolDay = false;
      } else if (this.isClosureDay(currentDate, closureDates)) {
        isSchoolDay = false;
      }

      if (isSchoolDay) {
        schoolDays++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return schoolDays;
  }

  /**
   * Calculate daily rate from monthly fee
   * Uses school days in month as denominator
   *
   * @param monthlyFeeCents - Monthly fee in cents
   * @param month - Any date in the target month
   * @param tenantId - For tenant-specific closure days
   * @returns Daily rate in cents with banker's rounding
   */
  async calculateDailyRate(
    monthlyFeeCents: number,
    month: Date,
    tenantId: string,
  ): Promise<number> {
    // Get month boundaries
    const monthStart = this.getMonthStart(month);
    const monthEnd = this.getMonthEnd(month);

    // Get school days in month
    const schoolDays = await this.getSchoolDays(monthStart, monthEnd, tenantId);

    if (schoolDays === 0) {
      return 0;
    }

    // Calculate daily rate with Decimal.js
    const monthlyFee = new Decimal(monthlyFeeCents);
    const dailyRate = monthlyFee.div(schoolDays);

    // Round to integer cents
    return dailyRate.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Handle mid-month enrollment (start date after month start)
   */
  async handleMidMonthEnrollment(
    monthlyFeeCents: number,
    enrollmentDate: Date,
    monthEnd: Date,
    tenantId: string,
  ): Promise<number> {
    return this.calculateProRata(
      monthlyFeeCents,
      enrollmentDate,
      monthEnd,
      tenantId,
    );
  }

  /**
   * Handle mid-month withdrawal (end date before month end)
   */
  async handleMidMonthWithdrawal(
    monthlyFeeCents: number,
    monthStart: Date,
    withdrawalDate: Date,
    tenantId: string,
  ): Promise<number> {
    return this.calculateProRata(
      monthlyFeeCents,
      monthStart,
      withdrawalDate,
      tenantId,
    );
  }

  /**
   * Check if date is a public holiday (South African calendar)
   * Uses the centralized public holiday constants
   */
  isPublicHoliday(date: Date): boolean {
    return isPublicHoliday(date);
  }

  /**
   * Check if date is a tenant closure day
   */
  async isTenantClosure(date: Date, tenantId: string): Promise<boolean> {
    const closureDates = await this.getTenantClosureDates(tenantId);
    return this.isClosureDay(date, closureDates);
  }

  /**
   * Check if date is a weekend (Saturday or Sunday)
   */
  isWeekend(date: Date): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
  }

  /**
   * Get excluded days with reasons for a period
   */
  private async getExcludedDays(
    startDate: Date,
    endDate: Date,
    tenantId: string,
  ): Promise<ExcludedDay[]> {
    const closureDates = await this.getTenantClosureDates(tenantId);
    const excludedDays: ExcludedDay[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      let reason: ExclusionReason | null = null;

      if (this.isWeekend(currentDate)) {
        reason = 'WEEKEND';
      } else if (isPublicHoliday(currentDate)) {
        reason = 'PUBLIC_HOLIDAY';
      } else if (this.isClosureDay(currentDate, closureDates)) {
        reason = 'CLOSURE';
      }

      if (reason) {
        excludedDays.push({
          date: new Date(currentDate),
          reason,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return excludedDays;
  }

  /**
   * Get tenant-specific closure dates from database
   */
  private async getTenantClosureDates(tenantId: string): Promise<Date[]> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      return [];
    }

    // closureDates is stored as JSON array of date strings
    const closureDatesJson = tenant.closureDates as unknown;
    if (!Array.isArray(closureDatesJson)) {
      return [];
    }

    return closureDatesJson
      .filter((dateStr): dateStr is string => typeof dateStr === 'string')
      .map((dateStr) => new Date(dateStr));
  }

  /**
   * Check if a date is in the closure dates list
   */
  private isClosureDay(date: Date, closureDates: Date[]): boolean {
    if (closureDates.length === 0) {
      return false;
    }

    const normalized = this.normalizeDate(date);

    for (const closure of closureDates) {
      const closureNormalized = this.normalizeDate(closure);
      if (normalized.getTime() === closureNormalized.getTime()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize a date by removing time component
   */
  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  /**
   * Get the first day of the month for a given date
   */
  private getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  /**
   * Get the last day of the month for a given date
   */
  private getMonthEnd(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
}
