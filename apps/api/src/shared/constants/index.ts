/**
 * Shared constants for CrecheBooks
 */

// South African public holidays
export * from './sa-holidays.constants';

// South African VAT rate (15%)
export const VAT_RATE = 0.15;

// VAT registration threshold in cents (R1,000,000)
export const VAT_REGISTRATION_THRESHOLD_CENTS = 100000000;

// Timezone for all date operations
export const TIMEZONE = 'Africa/Johannesburg';

// Currency code
export const CURRENCY_CODE = 'ZAR';
export const CURRENCY_SYMBOL = 'R';

// Categorization confidence thresholds
export const CATEGORIZATION_AUTO_THRESHOLD = 80; // Auto-apply if >= 80%
export const CATEGORIZATION_REVIEW_THRESHOLD = 50; // Flag for review if >= 50%

// Payment matching confidence thresholds
export const PAYMENT_EXACT_MATCH_THRESHOLD = 100;
export const PAYMENT_AUTO_APPLY_THRESHOLD = 80;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Retry configuration
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 1000;

// Audit log actions
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CATEGORIZE = 'CATEGORIZE',
  MATCH = 'MATCH',
  RECONCILE = 'RECONCILE',
  SUBMIT = 'SUBMIT',
}

// User roles
export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
  ACCOUNTANT = 'ACCOUNTANT',
}

// Invoice statuses
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

// Transaction statuses
export enum TransactionStatus {
  PENDING = 'PENDING',
  CATEGORIZED = 'CATEGORIZED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  SYNCED = 'SYNCED',
}
