/**
 * Formatting utilities for currency, dates, numbers, and percentages
 * All formats use South African locale (en-ZA) and SAST timezone
 */

/**
 * Format a number as South African Rand (ZAR)
 * @param amount - The amount to format (null/undefined returns R 0.00)
 * @returns Formatted currency string (e.g., "R 1,234.56")
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'R 0.00';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date in South African format (dd/MM/yyyy)
 * @param date - Date object, ISO string, or null/undefined
 * @param format - Optional format string (currently unused, for future expansion)
 * @returns Formatted date string (e.g., "25/12/2024") or "-" if null
 */
export function formatDate(date: Date | string | null | undefined, _format?: string): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  // Default format: dd/MM/yyyy in SAST timezone
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  }).format(d);
}

/**
 * Format a date with time in South African format (dd/MM/yyyy HH:mm)
 * @param date - Date object, ISO string, or null/undefined
 * @returns Formatted datetime string (e.g., "25/12/2024 14:30") or "-" if null
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  }).format(d);
}

/**
 * Format a number as a percentage
 * @param value - The numeric value
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "15.0%")
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number with thousand separators
 * @param value - The numeric value
 * @returns Formatted number string (e.g., "1,234,567")
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-ZA').format(value);
}
