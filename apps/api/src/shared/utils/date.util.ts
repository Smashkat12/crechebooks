/**
 * Date utilities for CrecheBooks.
 * All dates should be in Africa/Johannesburg timezone.
 */

const TIMEZONE = 'Africa/Johannesburg';

/**
 * Get current date in South African timezone
 */
export function nowSA(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

/**
 * Format date as YYYY-MM-DD (ISO date only, no time)
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format date for display in SA format (DD/MM/YYYY)
 */
export function formatDateSA(date: Date): string {
  return date.toLocaleDateString('en-ZA', { timeZone: TIMEZONE });
}

/**
 * Format datetime for display in SA format
 */
export function formatDateTimeSA(date: Date): string {
  return date.toLocaleString('en-ZA', { timeZone: TIMEZONE });
}

/**
 * Get start of month in SA timezone
 */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of month in SA timezone
 */
export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Get number of days in a month
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Check if date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add months to a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Get billing period string (YYYY-MM)
 */
export function getBillingPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Check if a date is before another date (date only, ignoring time)
 */
export function isDateBefore(a: Date, b: Date): boolean {
  return formatDate(a) < formatDate(b);
}

/**
 * Check if a date is after another date (date only, ignoring time)
 */
export function isDateAfter(a: Date, b: Date): boolean {
  return formatDate(a) > formatDate(b);
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return formatDate(a) === formatDate(b);
}

export const SOUTH_AFRICAN_TIMEZONE = TIMEZONE;
