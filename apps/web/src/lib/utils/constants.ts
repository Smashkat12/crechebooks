/**
 * Application-wide constants
 * Used for formatting, localization, and business logic
 */

// Currency configuration
export const CURRENCY_CODE = 'ZAR';
export const CURRENCY_SYMBOL = 'R';

// Timezone and date formatting
export const TIMEZONE = 'Africa/Johannesburg';
export const DATE_FORMAT = 'dd/MM/yyyy';
export const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';

/**
 * Aging bands for arrears reporting
 * Used to categorize overdue amounts by age
 */
export const AGING_BANDS = [
  { label: 'Current', min: 0, max: 0, color: '#22c55e' },
  { label: '1-30 Days', min: 1, max: 30, color: '#eab308' },
  { label: '31-60 Days', min: 31, max: 60, color: '#f97316' },
  { label: '61-90 Days', min: 61, max: 90, color: '#ef4444' },
  { label: '90+ Days', min: 91, max: Infinity, color: '#dc2626' },
] as const;

// Tax configuration (South Africa)
export const VAT_RATE = 0.15; // 15% VAT

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

// Invoice statuses
export const INVOICE_STATUSES = [
  'draft',
  'pending',
  'sent',
  'paid',
  'overdue',
  'cancelled',
] as const;

// Transaction statuses
export const TRANSACTION_STATUSES = [
  'categorized',
  'uncategorized',
  'needs_review',
] as const;

// Payment statuses
export const PAYMENT_STATUSES = [
  'matched',
  'unmatched',
  'partial',
] as const;

// SARS submission statuses
export const SARS_STATUSES = [
  'draft',
  'submitted',
  'accepted',
  'rejected',
] as const;

// Date ranges for filters
export const DATE_RANGES = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7days: 'Last 7 Days',
  last30days: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisYear: 'This Year',
  custom: 'Custom Range',
} as const;

// Maximum file upload size (in bytes)
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Supported file types for uploads
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

// API endpoints base paths
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const API_ENDPOINTS = {
  auth: '/api/auth',
  invoices: '/api/billing/invoices',
  children: '/api/billing/children',
  payments: '/api/payment',
  transactions: '/api/transaction',
  sars: '/api/sars',
  reconciliation: '/api/reconciliation',
} as const;
