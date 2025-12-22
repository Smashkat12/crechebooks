/**
 * Utility functions and constants
 * Re-exports all utilities for convenient importing
 */

// Formatting utilities
export {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatNumber,
} from './format';

// Helper utilities
export {
  getStatusBadgeVariant,
  truncate,
  pluralize,
  initials,
  slugify,
  isEmpty,
  debounce,
  type BadgeVariant,
} from './helpers';

// Constants
export {
  CURRENCY_CODE,
  CURRENCY_SYMBOL,
  TIMEZONE,
  DATE_FORMAT,
  DATETIME_FORMAT,
  AGING_BANDS,
  VAT_RATE,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  INVOICE_STATUSES,
  TRANSACTION_STATUSES,
  PAYMENT_STATUSES,
  SARS_STATUSES,
  DATE_RANGES,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  API_BASE_URL,
  API_ENDPOINTS,
} from './constants';
