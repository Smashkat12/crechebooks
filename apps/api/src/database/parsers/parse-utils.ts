import { ValidationException } from '../../shared/exceptions';

/**
 * Parses South African currency formats and returns amount in cents (integer).
 *
 * Supported formats:
 * - Standard: "1234.56" → 123456
 * - Thousand separator: "1,234.56" → 123456
 * - SA format with spaces: "1 234.56" → 123456
 * - European format: "1234,56" → 123456 (only when no decimal point present)
 * - With R symbol: "R1000.00" → 100000
 * - Negative: "-500.00" → -50000
 *
 * @param value - Currency string to parse
 * @returns Amount in cents (integer)
 * @throws ValidationException if value is invalid or cannot be parsed
 *
 * @example
 * parseCurrency("1,234.56")  // Returns 123456
 * parseCurrency("R500.00")   // Returns 50000
 * parseCurrency("-123.45")   // Returns -12345
 */
export function parseCurrency(value: string): number {
  if (!value || typeof value !== 'string') {
    throw new ValidationException('Invalid currency value', [
      {
        field: 'amount',
        message: 'Currency value must be a non-empty string',
        value,
      },
    ]);
  }

  // Remove whitespace and currency symbols
  let cleaned = value.trim().replace(/[R\s]/g, '');

  if (!cleaned) {
    throw new ValidationException('Invalid currency value', [
      {
        field: 'amount',
        message: 'Currency value is empty after removing symbols',
        value,
      },
    ]);
  }

  // Detect negative numbers
  const isNegative = cleaned.startsWith('-');
  if (isNegative) {
    cleaned = cleaned.substring(1);
  }

  // Determine decimal separator
  // If both comma and dot exist, the last one is the decimal separator
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let decimalSeparator: string;

  if (hasComma && hasDot) {
    // Both exist - last one is decimal separator
    const lastCommaIndex = cleaned.lastIndexOf(',');
    const lastDotIndex = cleaned.lastIndexOf('.');
    decimalSeparator = lastCommaIndex > lastDotIndex ? ',' : '.';
  } else if (hasComma) {
    // Only comma - could be thousands or decimal
    // If comma is followed by exactly 2 digits, it's decimal
    const commaIndex = cleaned.lastIndexOf(',');
    const afterComma = cleaned.substring(commaIndex + 1);
    decimalSeparator = /^\d{2}$/.test(afterComma) ? ',' : 'THOUSANDS';
  } else if (hasDot) {
    decimalSeparator = '.';
  } else {
    decimalSeparator = 'NONE';
  }

  // Remove thousand separators
  if (decimalSeparator === '.') {
    cleaned = cleaned.replace(/,/g, '');
  } else if (decimalSeparator === ',') {
    cleaned = cleaned.replace(/\./g, '');
    cleaned = cleaned.replace(',', '.');
  } else if (decimalSeparator === 'THOUSANDS') {
    cleaned = cleaned.replace(/,/g, '');
  }

  // Parse as float
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    throw new ValidationException('Invalid currency value', [
      {
        field: 'amount',
        message: 'Cannot parse currency value to number',
        value,
      },
    ]);
  }

  // Convert to cents using Math.round to avoid float precision issues
  const cents = Math.round(parsed * 100);

  return isNegative ? -cents : cents;
}

/**
 * Parses various date formats and returns Date object in UTC.
 *
 * Supported formats:
 * - DD/MM/YYYY (South African format): "15/01/2024"
 * - YYYY-MM-DD (ISO format): "2024-01-15"
 * - DD-MM-YYYY: "15-01-2024"
 *
 * All dates are created with UTC timezone (midnight UTC).
 *
 * @param value - Date string to parse
 * @returns Date object in UTC timezone
 * @throws ValidationException if format is invalid or unsupported
 *
 * @example
 * parseDate("15/01/2024")    // Returns Date object for 2024-01-15T00:00:00Z
 * parseDate("2024-01-15")    // Returns Date object for 2024-01-15T00:00:00Z
 * parseDate("15-01-2024")    // Returns Date object for 2024-01-15T00:00:00Z
 */
export function parseDate(value: string): Date {
  if (!value || typeof value !== 'string') {
    throw new ValidationException('Invalid date value', [
      {
        field: 'date',
        message: 'Date value must be a non-empty string',
        value,
      },
    ]);
  }

  const trimmed = value.trim();

  // Pattern 1: DD/MM/YYYY (South African format)
  const saFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const saMatch = trimmed.match(saFormat);
  if (saMatch) {
    const day = parseInt(saMatch[1], 10);
    const month = parseInt(saMatch[2], 10);
    const year = parseInt(saMatch[3], 10);

    if (month < 1 || month > 12) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Month must be between 1 and 12',
          value,
        },
      ]);
    }

    if (day < 1 || day > 31) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Day must be between 1 and 31',
          value,
        },
      ]);
    }

    // Create UTC date
    const date = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    );

    if (isNaN(date.getTime())) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Date is not valid (e.g., February 30th)',
          value,
        },
      ]);
    }

    return date;
  }

  // Pattern 2: YYYY-MM-DD (ISO format)
  const isoFormat = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  const isoMatch = trimmed.match(isoFormat);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    if (month < 1 || month > 12) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Month must be between 1 and 12',
          value,
        },
      ]);
    }

    if (day < 1 || day > 31) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Day must be between 1 and 31',
          value,
        },
      ]);
    }

    // Create UTC date
    const date = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    );

    if (isNaN(date.getTime())) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Date is not valid (e.g., February 30th)',
          value,
        },
      ]);
    }

    return date;
  }

  // Pattern 3: DD-MM-YYYY
  const dashFormat = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  const dashMatch = trimmed.match(dashFormat);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const month = parseInt(dashMatch[2], 10);
    const year = parseInt(dashMatch[3], 10);

    if (month < 1 || month > 12) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Month must be between 1 and 12',
          value,
        },
      ]);
    }

    if (day < 1 || day > 31) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Day must be between 1 and 31',
          value,
        },
      ]);
    }

    // Create UTC date
    const date = new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`,
    );

    if (isNaN(date.getTime())) {
      throw new ValidationException('Invalid date value', [
        {
          field: 'date',
          message: 'Date is not valid (e.g., February 30th)',
          value,
        },
      ]);
    }

    return date;
  }

  // No format matched
  throw new ValidationException('Invalid date format', [
    {
      field: 'date',
      message: 'Supported formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY',
      value,
    },
  ]);
}

/**
 * Extracts payee name from transaction description.
 *
 * Logic:
 * - Removes common prefixes: POS PURCHASE, POS, ATM, EFT, DEBIT ORDER, PAYMENT, TRANSFER
 * - Takes first 2-3 meaningful words (max 50 chars)
 * - Returns null for empty/whitespace-only descriptions
 *
 * @param description - Transaction description to parse
 * @returns Extracted payee name or null if none found
 *
 * @example
 * extractPayeeName("POS PURCHASE WOOLWORTHS MENLYN")  // Returns "WOOLWORTHS MENLYN"
 * extractPayeeName("DEBIT ORDER INSURANCE CO")        // Returns "INSURANCE CO"
 * extractPayeeName("   ")                              // Returns null
 */
export function extractPayeeName(description: string): string | null {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }

  // Remove common prefixes (case-insensitive)
  const prefixesToRemove = [
    /^POS\s+PURCHASE\s+/i,
    /^POS\s+/i,
    /^ATM\s+/i,
    /^EFT\s+/i,
    /^DEBIT\s+ORDER\s+/i,
    /^PAYMENT\s+/i,
    /^TRANSFER\s+/i,
  ];

  let cleaned = trimmed;
  for (const prefix of prefixesToRemove) {
    cleaned = cleaned.replace(prefix, '');
  }

  cleaned = cleaned.trim();
  if (!cleaned) {
    return null;
  }

  // Take first 2-3 meaningful words, max 50 chars
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);

  if (words.length === 0) {
    return null;
  }

  // Take up to 3 words
  const payeeWords = words.slice(0, 3);
  let payeeName = payeeWords.join(' ');

  // Truncate to 50 chars if needed
  if (payeeName.length > 50) {
    payeeName = payeeName.substring(0, 50).trim();
  }

  return payeeName;
}
