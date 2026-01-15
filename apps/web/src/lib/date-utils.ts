/**
 * South Africa Timezone Date Utilities
 * TASK-UI-007: Fix Date Picker Timezone
 *
 * Provides timezone-aware date handling for the CrecheBooks application.
 * All dates are handled in South African timezone (Africa/Johannesburg, UTC+2).
 *
 * Features:
 * - Consistent SA timezone handling
 * - Billing period boundary calculations
 * - Date range preset generation
 * - ISO format conversion for API communication
 */

import {
  format,
  parseISO,
  isValid,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
  addDays,
  addMonths,
  isBefore,
  isAfter,
  differenceInDays,
} from 'date-fns';
import {
  formatInTimeZone,
  toZonedTime,
  fromZonedTime,
} from 'date-fns-tz';

// ============================================================================
// Constants
// ============================================================================

/** South African timezone identifier */
export const SA_TIMEZONE = 'Africa/Johannesburg';

/** Default date format for SA locale (day/month/year) */
export const SA_DATE_FORMAT = 'dd/MM/yyyy';

/** ISO date format for API submission */
export const ISO_DATE_FORMAT = 'yyyy-MM-dd';

/** DateTime format with time component */
export const SA_DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';

/** Long date format for display */
export const SA_LONG_DATE_FORMAT = 'dd MMMM yyyy';

/** Month-year format */
export const SA_MONTH_YEAR_FORMAT = 'MMMM yyyy';

// ============================================================================
// Core Timezone Conversion Functions
// ============================================================================

/**
 * Convert a Date or ISO string to SA timezone
 * @param date - Date object or ISO string
 * @returns Date adjusted to SA timezone
 */
export function toSATimezone(date: Date | string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) {
    throw new Error('Invalid date provided');
  }
  return toZonedTime(d, SA_TIMEZONE);
}

/**
 * Convert a SA local date to UTC for API submission
 * @param date - Date in SA local time
 * @returns Date in UTC
 */
export function fromSATimezone(date: Date): Date {
  return fromZonedTime(date, SA_TIMEZONE);
}

/**
 * Get the current date/time in SA timezone
 * @returns Current date in SA timezone
 */
export function nowSA(): Date {
  return toZonedTime(new Date(), SA_TIMEZONE);
}

/**
 * Get today's date at start of day in SA timezone
 * @returns Start of today in SA timezone
 */
export function todaySA(): Date {
  return startOfDay(nowSA());
}

// ============================================================================
// Date Formatting Functions
// ============================================================================

/**
 * Format a date for display in SA timezone
 * @param date - Date or ISO string to format
 * @param formatStr - Format string (default: dd/MM/yyyy)
 * @returns Formatted date string or empty string if invalid
 */
export function formatSADate(
  date: Date | string | null | undefined,
  formatStr: string = SA_DATE_FORMAT
): string {
  if (!date) return '';

  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return '';
    return formatInTimeZone(d, SA_TIMEZONE, formatStr);
  } catch {
    return '';
  }
}

/**
 * Format a date with time component in SA timezone
 * @param date - Date or ISO string to format
 * @returns Formatted datetime string
 */
export function formatSADateTime(
  date: Date | string | null | undefined
): string {
  return formatSADate(date, SA_DATETIME_FORMAT);
}

/**
 * Format a date in long format (e.g., "15 January 2026")
 * @param date - Date or ISO string to format
 * @returns Formatted long date string
 */
export function formatSALongDate(
  date: Date | string | null | undefined
): string {
  return formatSADate(date, SA_LONG_DATE_FORMAT);
}

/**
 * Format month and year (e.g., "January 2026")
 * @param date - Date or ISO string to format
 * @returns Formatted month-year string
 */
export function formatSAMonthYear(
  date: Date | string | null | undefined
): string {
  return formatSADate(date, SA_MONTH_YEAR_FORMAT);
}

// ============================================================================
// Date Boundary Functions (SA Timezone)
// ============================================================================

/**
 * Get start of day in SA timezone
 * @param date - Date to get start of day for
 * @returns Start of day in SA timezone (UTC)
 */
export function startOfDaySA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const startOfDayZoned = startOfDay(zonedDate);
  return fromZonedTime(startOfDayZoned, SA_TIMEZONE);
}

/**
 * Get end of day in SA timezone
 * @param date - Date to get end of day for
 * @returns End of day in SA timezone (UTC)
 */
export function endOfDaySA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const endOfDayZoned = endOfDay(zonedDate);
  return fromZonedTime(endOfDayZoned, SA_TIMEZONE);
}

/**
 * Get start of week in SA timezone (week starts Monday)
 * @param date - Date within the week
 * @returns Start of week in SA timezone (UTC)
 */
export function startOfWeekSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const startOfWeekZoned = startOfWeek(zonedDate, { weekStartsOn: 1 });
  return fromZonedTime(startOfWeekZoned, SA_TIMEZONE);
}

/**
 * Get end of week in SA timezone (week ends Sunday)
 * @param date - Date within the week
 * @returns End of week in SA timezone (UTC)
 */
export function endOfWeekSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const endOfWeekZoned = endOfWeek(zonedDate, { weekStartsOn: 1 });
  return fromZonedTime(endOfWeekZoned, SA_TIMEZONE);
}

/**
 * Get start of month in SA timezone
 * @param date - Date within the month
 * @returns Start of month in SA timezone (UTC)
 */
export function startOfMonthSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const startOfMonthZoned = startOfMonth(zonedDate);
  return fromZonedTime(startOfMonthZoned, SA_TIMEZONE);
}

/**
 * Get end of month in SA timezone
 * @param date - Date within the month
 * @returns End of month in SA timezone (UTC)
 */
export function endOfMonthSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const endOfMonthZoned = endOfMonth(zonedDate);
  return fromZonedTime(endOfMonthZoned, SA_TIMEZONE);
}

/**
 * Get start of quarter in SA timezone
 * @param date - Date within the quarter
 * @returns Start of quarter in SA timezone (UTC)
 */
export function startOfQuarterSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const startOfQuarterZoned = startOfQuarter(zonedDate);
  return fromZonedTime(startOfQuarterZoned, SA_TIMEZONE);
}

/**
 * Get end of quarter in SA timezone
 * @param date - Date within the quarter
 * @returns End of quarter in SA timezone (UTC)
 */
export function endOfQuarterSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const endOfQuarterZoned = endOfQuarter(zonedDate);
  return fromZonedTime(endOfQuarterZoned, SA_TIMEZONE);
}

/**
 * Get start of year in SA timezone
 * @param date - Date within the year
 * @returns Start of year in SA timezone (UTC)
 */
export function startOfYearSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const startOfYearZoned = startOfYear(zonedDate);
  return fromZonedTime(startOfYearZoned, SA_TIMEZONE);
}

/**
 * Get end of year in SA timezone
 * @param date - Date within the year
 * @returns End of year in SA timezone (UTC)
 */
export function endOfYearSA(date: Date): Date {
  const zonedDate = toZonedTime(date, SA_TIMEZONE);
  const endOfYearZoned = endOfYear(zonedDate);
  return fromZonedTime(endOfYearZoned, SA_TIMEZONE);
}

// ============================================================================
// Billing Period Functions
// ============================================================================

/**
 * Date range interface
 */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/**
 * Billing period boundaries
 */
export interface BillingPeriod {
  start: Date;
  end: Date;
  year: number;
  month: number;
  label: string;
}

/**
 * Get billing period boundaries for a specific month/year in SA timezone
 * @param year - Year (e.g., 2026)
 * @param month - Month (1-12, where 1 = January)
 * @returns Billing period with start and end dates
 */
export function getBillingPeriod(year: number, month: number): BillingPeriod {
  // Create date in SA timezone
  const periodDate = new Date(year, month - 1, 1);
  const start = startOfMonthSA(periodDate);
  const end = endOfMonthSA(periodDate);

  return {
    start,
    end,
    year,
    month,
    label: formatSAMonthYear(periodDate),
  };
}

/**
 * Get the current billing period
 * @returns Current month's billing period
 */
export function getCurrentBillingPeriod(): BillingPeriod {
  const now = nowSA();
  return getBillingPeriod(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Get previous billing period
 * @param monthsBack - Number of months to go back (default: 1)
 * @returns Previous billing period
 */
export function getPreviousBillingPeriod(monthsBack: number = 1): BillingPeriod {
  const now = nowSA();
  const previousDate = subMonths(now, monthsBack);
  return getBillingPeriod(
    previousDate.getFullYear(),
    previousDate.getMonth() + 1
  );
}

/**
 * Get South African tax year boundaries
 * SA tax year runs from 1 March to 28/29 February
 * @param year - The year the tax year starts (e.g., 2025 for 2025/2026 tax year)
 * @returns Tax year start and end dates
 */
export function getSATaxYear(year: number): { start: Date; end: Date } {
  const start = fromZonedTime(new Date(year, 2, 1), SA_TIMEZONE); // 1 March
  const end = fromZonedTime(
    endOfMonth(new Date(year + 1, 1, 1)),
    SA_TIMEZONE
  ); // End of February next year

  return { start, end };
}

/**
 * Get current SA tax year
 * @returns Current tax year boundaries
 */
export function getCurrentSATaxYear(): { start: Date; end: Date; label: string } {
  const now = nowSA();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // If we're in Jan or Feb, the tax year started last year
  const taxYearStartYear = currentMonth < 2 ? currentYear - 1 : currentYear;
  const { start, end } = getSATaxYear(taxYearStartYear);

  return {
    start,
    end,
    label: `${taxYearStartYear}/${taxYearStartYear + 1} Tax Year`,
  };
}

// ============================================================================
// Preset Date Ranges
// ============================================================================

/**
 * Preset date range with label
 */
export interface DateRangePreset {
  label: string;
  range: DateRange;
}

/**
 * Get common date range presets for SA business context
 * @returns Array of preset date ranges
 */
export function getDateRangePresets(): DateRangePreset[] {
  const now = nowSA();

  return [
    {
      label: 'Today',
      range: {
        from: startOfDaySA(now),
        to: endOfDaySA(now),
      },
    },
    {
      label: 'Yesterday',
      range: {
        from: startOfDaySA(subDays(now, 1)),
        to: endOfDaySA(subDays(now, 1)),
      },
    },
    {
      label: 'Last 7 Days',
      range: {
        from: startOfDaySA(subDays(now, 6)),
        to: endOfDaySA(now),
      },
    },
    {
      label: 'Last 30 Days',
      range: {
        from: startOfDaySA(subDays(now, 29)),
        to: endOfDaySA(now),
      },
    },
    {
      label: 'This Week',
      range: {
        from: startOfWeekSA(now),
        to: endOfWeekSA(now),
      },
    },
    {
      label: 'Last Week',
      range: {
        from: startOfWeekSA(subDays(now, 7)),
        to: endOfWeekSA(subDays(now, 7)),
      },
    },
    {
      label: 'This Month',
      range: {
        from: startOfMonthSA(now),
        to: endOfMonthSA(now),
      },
    },
    {
      label: 'Last Month',
      range: {
        from: startOfMonthSA(subMonths(now, 1)),
        to: endOfMonthSA(subMonths(now, 1)),
      },
    },
    {
      label: 'This Quarter',
      range: {
        from: startOfQuarterSA(now),
        to: endOfQuarterSA(now),
      },
    },
    {
      label: 'Last Quarter',
      range: {
        from: startOfQuarterSA(subQuarters(now, 1)),
        to: endOfQuarterSA(subQuarters(now, 1)),
      },
    },
    {
      label: 'This Year',
      range: {
        from: startOfYearSA(now),
        to: endOfYearSA(now),
      },
    },
    {
      label: 'Last Year',
      range: {
        from: startOfYearSA(subYears(now, 1)),
        to: endOfYearSA(subYears(now, 1)),
      },
    },
  ];
}

/**
 * Get billing-specific date range presets
 * @returns Array of billing-focused preset date ranges
 */
export function getBillingPresets(): DateRangePreset[] {
  const current = getCurrentBillingPeriod();
  const previous = getPreviousBillingPeriod(1);
  const twoMonthsAgo = getPreviousBillingPeriod(2);
  const taxYear = getCurrentSATaxYear();

  return [
    {
      label: current.label,
      range: { from: current.start, to: current.end },
    },
    {
      label: previous.label,
      range: { from: previous.start, to: previous.end },
    },
    {
      label: twoMonthsAgo.label,
      range: { from: twoMonthsAgo.start, to: twoMonthsAgo.end },
    },
    {
      label: taxYear.label,
      range: { from: taxYear.start, to: taxYear.end },
    },
  ];
}

// ============================================================================
// API Conversion Functions
// ============================================================================

/**
 * Convert a date to ISO string for API submission
 * @param date - Date to convert
 * @returns ISO date string or empty string if invalid
 */
export function toISOString(date: Date | null | undefined): string {
  if (!date || !isValid(date)) return '';
  return date.toISOString();
}

/**
 * Convert a date to date-only string (YYYY-MM-DD) for API submission
 * @param date - Date to convert
 * @returns Date string in YYYY-MM-DD format
 */
export function toDateOnlyString(date: Date | null | undefined): string {
  if (!date || !isValid(date)) return '';
  return format(date, ISO_DATE_FORMAT);
}

/**
 * Parse an ISO string to Date
 * @param dateString - ISO date string
 * @returns Parsed Date or null if invalid
 */
export function parseISOSafe(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  try {
    const parsed = parseISO(dateString);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a date is in the future (SA timezone)
 * @param date - Date to check
 * @returns true if date is in the future
 */
export function isFutureDateSA(date: Date): boolean {
  return isAfter(date, endOfDaySA(nowSA()));
}

/**
 * Check if a date is in the past (SA timezone)
 * @param date - Date to check
 * @returns true if date is in the past
 */
export function isPastDateSA(date: Date): boolean {
  return isBefore(date, startOfDaySA(nowSA()));
}

/**
 * Check if a date is today (SA timezone)
 * @param date - Date to check
 * @returns true if date is today
 */
export function isTodaySA(date: Date): boolean {
  const today = todaySA();
  const dateStart = startOfDaySA(date);
  return dateStart.getTime() === today.getTime();
}

/**
 * Check if a date range is valid
 * @param range - Date range to validate
 * @returns true if range is valid (from <= to)
 */
export function isValidDateRange(range: DateRange): boolean {
  if (!range.from || !range.to) return false;
  return !isAfter(range.from, range.to);
}

/**
 * Get number of days in a date range
 * @param range - Date range
 * @returns Number of days (inclusive)
 */
export function getDaysInRange(range: DateRange): number {
  if (!range.from || !range.to) return 0;
  return differenceInDays(range.to, range.from) + 1;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Add days to a date in SA timezone
 * @param date - Base date
 * @param days - Number of days to add
 * @returns New date with days added
 */
export function addDaysSA(date: Date, days: number): Date {
  return addDays(date, days);
}

/**
 * Add months to a date in SA timezone
 * @param date - Base date
 * @param months - Number of months to add
 * @returns New date with months added
 */
export function addMonthsSA(date: Date, months: number): Date {
  return addMonths(date, months);
}

/**
 * Get all months between two dates (inclusive)
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Array of billing periods for each month
 */
export function getMonthsBetween(startDate: Date, endDate: Date): BillingPeriod[] {
  const months: BillingPeriod[] = [];
  let current = startOfMonthSA(startDate);
  const end = endOfMonthSA(endDate);

  while (!isAfter(current, end)) {
    const zonedCurrent = toZonedTime(current, SA_TIMEZONE);
    months.push(
      getBillingPeriod(zonedCurrent.getFullYear(), zonedCurrent.getMonth() + 1)
    );
    current = addMonths(current, 1);
  }

  return months;
}
