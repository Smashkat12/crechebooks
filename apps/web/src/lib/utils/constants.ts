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
 * Aging bands for arrears reporting — aligned with reminder stages
 * 1-7 days: before first reminder
 * 8-14 days: first reminder sent
 * 15-30 days: second reminder sent
 * 31-60 days: final reminder sent
 * 60+ days: escalated for manual review
 */
export const AGING_BANDS = [
  { label: '1-7 Days', min: 1, max: 7, color: '#eab308', key: 'overdueBy7' as const },
  { label: '8-14 Days', min: 8, max: 14, color: '#f59e0b', key: 'overdueBy14' as const },
  { label: '15-30 Days', min: 15, max: 30, color: '#f97316', key: 'overdueBy30' as const },
  { label: '31-60 Days', min: 31, max: 60, color: '#ef4444', key: 'overdueBy60' as const },
  { label: '60+ Days', min: 61, max: Infinity, color: '#dc2626', key: 'overdueOver60' as const },
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

// South African banks with universal branch codes and SWIFT/BIC codes
export const SA_BANKS = [
  { name: 'ABSA', branchCode: '632005', swiftCode: 'ABSAZAJJ' },
  { name: 'African Bank', branchCode: '430000', swiftCode: '' },
  { name: 'Bidvest Bank', branchCode: '462005', swiftCode: 'BILOAJJX' },
  { name: 'Capitec Bank', branchCode: '470010', swiftCode: 'CABLZAJJ' },
  { name: 'Discovery Bank', branchCode: '679000', swiftCode: '' },
  { name: 'First National Bank (FNB)', branchCode: '250655', swiftCode: 'FIRNZAJJ' },
  { name: 'Grindrod Bank', branchCode: '584000', swiftCode: '' },
  { name: 'Investec', branchCode: '580105', swiftCode: 'IVESZAJJ' },
  { name: 'Nedbank', branchCode: '198765', swiftCode: 'NEDSZAJJ' },
  { name: 'Old Mutual', branchCode: '462005', swiftCode: '' },
  { name: 'Rand Merchant Bank', branchCode: '261251', swiftCode: '' },
  { name: 'SA Post Bank (Postbank)', branchCode: '460005', swiftCode: '' },
  { name: 'Sasfin Bank', branchCode: '683000', swiftCode: '' },
  { name: 'Standard Bank', branchCode: '051001', swiftCode: 'SBZAZAJJ' },
  { name: 'TymeBank', branchCode: '678910', swiftCode: '' },
] as const;

// South African provinces
export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const;

// Bank account types in South Africa
export const SA_ACCOUNT_TYPES = [
  'Cheque Account',
  'Savings Account',
  'Current Account',
  'Transmission Account',
] as const;

/**
 * Extract date of birth from a South African ID number.
 * SA ID format: YYMMDD GSSS C A Z
 * Returns a Date object or null if the ID is invalid/too short.
 */
export function extractDobFromSaId(idNumber: string): Date | null {
  if (!idNumber || idNumber.length < 6) return null;
  const digits = idNumber.replace(/\D/g, '');
  if (digits.length < 6) return null;

  const yy = parseInt(digits.substring(0, 2), 10);
  const mm = parseInt(digits.substring(2, 4), 10);
  const dd = parseInt(digits.substring(4, 6), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  // Determine century: if YY > current 2-digit year, assume 1900s
  const currentTwoDigitYear = new Date().getFullYear() % 100;
  const century = yy > currentTwoDigitYear ? 1900 : 2000;
  const fullYear = century + yy;

  const date = new Date(fullYear, mm - 1, dd);
  // Validate the date is real (e.g., Feb 30 would roll over)
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }

  return date;
}

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
