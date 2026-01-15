/**
 * Tax Period Utilities
 * TASK-SARS-004: Fix Tax Period Boundaries
 *
 * South African tax year utilities for SARS compliance.
 * SA Tax Year: April 1 to March 31 (not calendar year)
 *
 * @module common/utils/tax-period
 */

/**
 * South Africa timezone offset in hours (UTC+2)
 * Used for normalizing dates to SA timezone for billing calculations
 */
export const SA_TIMEZONE_OFFSET_HOURS = 2;

/**
 * SA tax year starts in April (0-indexed: month 3)
 */
const TAX_YEAR_START_MONTH = 3; // April

/**
 * VAT period configuration
 * VAT periods are bi-monthly in South Africa
 */
const VAT_PERIODS_PER_YEAR = 6;

/**
 * Get the South African tax year for a given date.
 *
 * SA tax year runs from April 1 to March 31.
 * - Dates from April 1 to December 31 belong to that calendar year's tax year
 * - Dates from January 1 to March 31 belong to the PREVIOUS calendar year's tax year
 *
 * @param date - Date to get tax year for
 * @returns Tax year number (e.g., 2025 for dates Apr 2025 - Mar 2026)
 *
 * @example
 * getTaxYear(new Date('2025-04-01')) // Returns 2025
 * getTaxYear(new Date('2026-03-31')) // Returns 2025
 * getTaxYear(new Date('2025-01-15')) // Returns 2024 (Jan-Mar is previous tax year)
 */
export function getTaxYear(date: Date): number {
  const month = date.getMonth(); // 0-indexed (0 = January, 3 = April)
  const year = date.getFullYear();

  // If Jan-Mar (months 0-2), we're in the previous calendar year's tax year
  // If Apr-Dec (months 3-11), we're in the current calendar year's tax year
  return month < TAX_YEAR_START_MONTH ? year - 1 : year;
}

/**
 * Get the start and end dates for a South African tax year.
 *
 * @param taxYear - Tax year to get boundaries for (e.g., 2025)
 * @returns Object with start (April 1) and end (March 31 next year) dates
 *
 * @example
 * getTaxPeriodBoundaries(2025)
 * // Returns: { start: 2025-04-01T00:00:00, end: 2026-03-31T23:59:59.999 }
 */
export function getTaxPeriodBoundaries(taxYear: number): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(taxYear, TAX_YEAR_START_MONTH, 1, 0, 0, 0, 0), // April 1
    end: new Date(taxYear + 1, TAX_YEAR_START_MONTH - 1, 31, 23, 59, 59, 999), // March 31 next year
  };
}

/**
 * Get the VAT period for a given date.
 *
 * South African VAT periods are bi-monthly:
 * - Period 1: January - February
 * - Period 2: March - April
 * - Period 3: May - June
 * - Period 4: July - August
 * - Period 5: September - October
 * - Period 6: November - December
 *
 * @param date - Date to get VAT period for
 * @returns Object with period number (1-6) and start/end dates
 *
 * @example
 * getVatPeriod(new Date('2025-03-15'))
 * // Returns: { period: 2, start: 2025-03-01, end: 2025-04-30 }
 */
export function getVatPeriod(date: Date): {
  period: number;
  start: Date;
  end: Date;
} {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();

  // VAT periods are bi-monthly: Jan-Feb (0-1)=1, Mar-Apr (2-3)=2, etc.
  const period = Math.floor(month / 2) + 1;

  // Calculate period start (first month of the bi-monthly period)
  const periodStartMonth = (period - 1) * 2; // 0, 2, 4, 6, 8, 10
  const periodStart = new Date(year, periodStartMonth, 1, 0, 0, 0, 0);

  // Calculate period end (last day of second month)
  // Use day 0 of the next month to get last day of current month
  const periodEndMonth = periodStartMonth + 2; // Month after the bi-monthly period
  const periodEnd = new Date(year, periodEndMonth, 0, 23, 59, 59, 999);

  return {
    period,
    start: periodStart,
    end: periodEnd,
  };
}

/**
 * Get all VAT periods for a given calendar year.
 *
 * @param year - Calendar year
 * @returns Array of 6 VAT period objects
 */
export function getVatPeriodsForYear(
  year: number,
): Array<{ period: number; start: Date; end: Date }> {
  const periods: Array<{ period: number; start: Date; end: Date }> = [];

  for (let i = 0; i < VAT_PERIODS_PER_YEAR; i++) {
    const monthInPeriod = i * 2; // 0, 2, 4, 6, 8, 10
    const date = new Date(year, monthInPeriod, 15); // Mid-month date
    periods.push(getVatPeriod(date));
  }

  return periods;
}

/**
 * Get the EMP201 submission period for a given date.
 *
 * EMP201 (monthly PAYE/UIF/SDL) periods are monthly, aligned with calendar months.
 * Deadline is typically the 7th of the following month.
 *
 * @param date - Date to get EMP201 period for
 * @returns Object with period details and deadline
 */
export function getEmp201Period(date: Date): {
  periodMonth: number;
  periodYear: number;
  start: Date;
  end: Date;
  deadline: Date;
} {
  const month = date.getMonth();
  const year = date.getFullYear();

  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Deadline is 7th of the following month
  const deadlineMonth = month + 1;
  const deadlineYear = deadlineMonth > 11 ? year + 1 : year;
  const deadline = new Date(
    deadlineYear % 12 === 0 && deadlineMonth === 12 ? year + 1 : year,
    deadlineMonth % 12,
    7,
    23,
    59,
    59,
    999,
  );

  return {
    periodMonth: month + 1, // 1-indexed for display
    periodYear: year,
    start,
    end,
    deadline,
  };
}

/**
 * TASK-BILL-005: Billing Period Utilities
 * Handle month boundary edge cases for South African timezone
 */

/**
 * Get the billing period boundaries for a given month.
 * Handles edge cases like leap years and varying month lengths.
 *
 * @param year - Year of billing period
 * @param month - Month (1-12) of billing period
 * @returns Object with start and end dates
 *
 * @example
 * getBillingPeriod(2024, 2) // February 2024 (leap year)
 * // Returns: { start: 2024-02-01, end: 2024-02-29T23:59:59.999 }
 */
export function getBillingPeriod(
  year: number,
  month: number,
): { start: Date; end: Date } {
  // Validate month
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
  }

  // Month is 1-indexed from input, convert to 0-indexed for Date constructor
  const monthIndex = month - 1;

  // Start: First day of month at midnight
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);

  // End: Last day of month at 23:59:59.999
  // Using day 0 of next month gives us the last day of current month
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Get the last day of a month, handling leap years correctly.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Last day of the month (28, 29, 30, or 31)
 */
export function getLastDayOfMonth(year: number, month: number): number {
  // Day 0 of next month gives us the last day of current month
  return new Date(year, month, 0).getDate();
}

/**
 * Check if a year is a leap year.
 *
 * @param year - Year to check
 * @returns true if leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Convert a date to South African timezone (UTC+2).
 * Useful for ensuring billing dates are calculated in SA timezone.
 *
 * @param date - Date in any timezone
 * @returns New Date object adjusted to SA timezone
 */
export function toSATimezone(date: Date): Date {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + SA_TIMEZONE_OFFSET_HOURS * 3600000);
}

/**
 * Get the start of day in South African timezone.
 * Handles timezone edge cases where midnight in SA differs from UTC.
 *
 * @param date - Date to get start of day for
 * @returns Start of day (00:00:00.000) in SA timezone
 */
export function getStartOfDaySA(date: Date): Date {
  const saDate = toSATimezone(date);
  saDate.setHours(0, 0, 0, 0);
  return saDate;
}

/**
 * Get the end of day in South African timezone.
 *
 * @param date - Date to get end of day for
 * @returns End of day (23:59:59.999) in SA timezone
 */
export function getEndOfDaySA(date: Date): Date {
  const saDate = toSATimezone(date);
  saDate.setHours(23, 59, 59, 999);
  return saDate;
}

/**
 * Validate a billing month string format.
 *
 * @param billingMonth - String in format YYYY-MM
 * @returns Parsed year and month, or null if invalid
 */
export function parseBillingMonth(
  billingMonth: string,
): { year: number; month: number } | null {
  const match = billingMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

/**
 * Format a billing month from year and month.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Formatted string YYYY-MM
 */
export function formatBillingMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Get the previous billing month.
 *
 * @param year - Current year
 * @param month - Current month (1-12)
 * @returns Previous month's year and month
 */
export function getPreviousBillingMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/**
 * Get the next billing month.
 *
 * @param year - Current year
 * @param month - Current month (1-12)
 * @returns Next month's year and month
 */
export function getNextBillingMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 };
  }
  return { year, month: month + 1 };
}

/**
 * Check if a date falls within a billing period.
 *
 * @param date - Date to check
 * @param periodStart - Start of billing period
 * @param periodEnd - End of billing period
 * @returns true if date is within period (inclusive)
 */
export function isDateInBillingPeriod(
  date: Date,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const time = date.getTime();
  return time >= periodStart.getTime() && time <= periodEnd.getTime();
}

/**
 * Get the number of days in a billing period.
 *
 * @param periodStart - Start of period
 * @param periodEnd - End of period
 * @returns Number of days (inclusive)
 */
export function getDaysInPeriod(periodStart: Date, periodEnd: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const startOfStartDay = new Date(periodStart);
  startOfStartDay.setHours(0, 0, 0, 0);
  const startOfEndDay = new Date(periodEnd);
  startOfEndDay.setHours(0, 0, 0, 0);

  return (
    Math.round(
      (startOfEndDay.getTime() - startOfStartDay.getTime()) / msPerDay,
    ) + 1
  );
}
