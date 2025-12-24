import { Injectable } from '@nestjs/common';
import {
  SA_PUBLIC_HOLIDAYS,
  type PublicHoliday,
} from '../constants/sa-holidays.constants';

/**
 * BusinessDayService
 *
 * Handles business day calculations for South Africa, including:
 * - Weekend detection (Saturday, Sunday)
 * - Public holiday detection with observed dates
 * - Business day window matching for reconciliation
 * - Business day arithmetic
 *
 * Default reconciliation window: 3 business days
 * Configurable per tenant: 1-5 business days
 */
@Injectable()
export class BusinessDayService {
  private readonly holidayCache: Map<string, boolean> = new Map();

  /**
   * Checks if a given date is a business day
   * (not a weekend and not a public holiday)
   */
  isBusinessDay(date: Date): boolean {
    if (this.isWeekend(date)) {
      return false;
    }

    if (this.isPublicHoliday(date)) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a given date falls on a weekend (Saturday or Sunday)
   */
  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  /**
   * Checks if a given date is a South African public holiday
   * Uses observed dates (when holiday falls on weekend, moved to Monday)
   */
  isPublicHoliday(date: Date): boolean {
    const dateString = this.formatDate(date);

    // Check cache first
    if (this.holidayCache.has(dateString)) {
      return this.holidayCache.get(dateString)!;
    }

    const year = date.getFullYear();
    const holidays = SA_PUBLIC_HOLIDAYS[year];

    if (!holidays) {
      // No holiday data for this year
      this.holidayCache.set(dateString, false);
      return false;
    }

    const isHoliday = holidays.some(
      (holiday: PublicHoliday) => holiday.observed === dateString,
    );

    this.holidayCache.set(dateString, isHoliday);
    return isHoliday;
  }

  /**
   * Checks if two dates are within a specified number of business days
   * Used for reconciliation window matching
   *
   * @param date1 First date
   * @param date2 Second date
   * @param days Number of business days (default: 3)
   * @returns true if dates are within the business day window
   */
  isWithinBusinessDays(date1: Date, date2: Date, days: number = 3): boolean {
    if (days < 1 || days > 5) {
      throw new Error('Business day window must be between 1 and 5 days');
    }

    const businessDays = this.getBusinessDaysBetween(date1, date2);
    return businessDays <= days;
  }

  /**
   * Calculates the number of business days between two dates
   * Does not include the start date, includes the end date
   *
   * @param startDate Start date (exclusive)
   * @param endDate End date (inclusive)
   * @returns Number of business days
   */
  getBusinessDaysBetween(startDate: Date, endDate: Date): number {
    // Ensure we're working with dates without time components
    const start = this.stripTime(startDate);
    const end = this.stripTime(endDate);

    // Handle same day or reversed dates
    if (start >= end) {
      return 0;
    }

    let count = 0;
    const current = new Date(start);
    current.setDate(current.getDate() + 1); // Start from next day

    while (current <= end) {
      if (this.isBusinessDay(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  /**
   * Adds a specified number of business days to a date
   *
   * @param date Starting date
   * @param days Number of business days to add (can be negative)
   * @returns New date after adding business days
   */
  addBusinessDays(date: Date, days: number): Date {
    // Create a new date object to avoid mutating the input
    const result = new Date(this.stripTime(date));
    const increment = days >= 0 ? 1 : -1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
      result.setDate(result.getDate() + increment);

      if (this.isBusinessDay(result)) {
        remaining--;
      }
    }

    return result;
  }

  /**
   * Formats a date to YYYY-MM-DD string format
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Strips time component from a date, returning midnight UTC
   */
  private stripTime(date: Date): Date {
    // Use Date.UTC to ensure we get midnight in UTC, not local time
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }

  /**
   * Clears the holiday cache (useful for testing)
   */
  clearCache(): void {
    this.holidayCache.clear();
  }
}
