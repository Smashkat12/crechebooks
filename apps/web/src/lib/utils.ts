import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// DUPLICATION NOTE (frontend-engineer-021): formatCurrency, formatDate, and
// formatDateTime below are also defined in lib/utils/format.ts. The two files
// differ: format.ts uses Intl.DateTimeFormat with Africa/Johannesburg timezone
// (dd/MM/yyyy); this file uses date-fns `format` with 'dd MMM yyyy'. Callers
// are split ~179 importing from here vs ~23 from format.ts. Do NOT consolidate
// without auditing all callers for output-format sensitivity.

/**
 * Format currency in South African Rand (ZAR)
 * Handles null, undefined, and NaN values gracefully
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) {
    return 'R 0.00';
  }
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  return format(dateObj, 'dd MMM yyyy');
}

/**
 * Format datetime to readable string
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  return format(dateObj, 'dd MMM yyyy HH:mm');
}
