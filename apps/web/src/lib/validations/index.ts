import { z } from 'zod';

/**
 * Email validation schema
 */
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address');

/**
 * South African phone number validation
 * Accepts formats: +27 XX XXX XXXX, 0XX XXX XXXX, +27XXXXXXXXX, 0XXXXXXXXX
 */
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .refine(
    (value) => {
      // Remove all spaces and formatting
      const cleaned = value.replace(/\s/g, '');

      // Check for +27 format (10 digits after +27)
      if (cleaned.startsWith('+27')) {
        return /^\+27\d{9}$/.test(cleaned);
      }

      // Check for 0 format (10 digits starting with 0)
      if (cleaned.startsWith('0')) {
        return /^0\d{9}$/.test(cleaned);
      }

      return false;
    },
    {
      message: 'Invalid South African phone number. Use format: +27 XX XXX XXXX or 0XX XXX XXXX',
    }
  );

/**
 * South African ID number validation (13 digits)
 * Format: YYMMDD SSSS C A Z
 * - YYMMDD: Date of birth
 * - SSSS: Sequence number (gender)
 * - C: Citizenship (0 = SA, 1 = other)
 * - A: Usually 8 or 9
 * - Z: Checksum digit
 */
export const saIdNumberSchema = z
  .string()
  .min(1, 'ID number is required')
  .length(13, 'ID number must be exactly 13 digits')
  .regex(/^\d{13}$/, 'ID number must contain only digits')
  .refine(
    (value) => {
      // Basic date validation (first 6 digits)
      const _year = parseInt(value.substring(0, 2), 10);
      const month = parseInt(value.substring(2, 4), 10);
      const day = parseInt(value.substring(4, 6), 10);

      if (month < 1 || month > 12) return false;
      if (day < 1 || day > 31) return false;

      // Luhn algorithm checksum validation
      let sum = 0;
      for (let i = 0; i < 13; i++) {
        let digit = parseInt(value[i], 10);

        if (i % 2 === 0) {
          // Odd position (1st, 3rd, 5th, etc.) - multiply by 1
          sum += digit;
        } else {
          // Even position (2nd, 4th, 6th, etc.) - multiply by 2
          digit *= 2;
          if (digit > 9) {
            digit -= 9;
          }
          sum += digit;
        }
      }

      return sum % 10 === 0;
    },
    {
      message: 'Invalid South African ID number',
    }
  );

/**
 * Currency validation schema (ZAR)
 * Accepts numbers with up to 2 decimal places
 */
export const currencySchema = z
  .string()
  .min(1, 'Amount is required')
  .refine(
    (value) => {
      // Remove R and spaces if present
      const cleaned = value.replace(/[R\s,]/g, '');
      const num = parseFloat(cleaned);
      return !isNaN(num) && num >= 0 && /^\d+(\.\d{1,2})?$/.test(cleaned);
    },
    {
      message: 'Invalid currency amount. Must be a positive number with up to 2 decimal places',
    }
  )
  .transform((value) => {
    // Convert to number for storage
    const cleaned = value.replace(/[R\s,]/g, '');
    return parseFloat(cleaned);
  });

/**
 * Optional currency schema (allows empty values)
 */
export const optionalCurrencySchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      const cleaned = value.replace(/[R\s,]/g, '');
      const num = parseFloat(cleaned);
      return !isNaN(num) && num >= 0 && /^\d+(\.\d{1,2})?$/.test(cleaned);
    },
    {
      message: 'Invalid currency amount. Must be a positive number with up to 2 decimal places',
    }
  )
  .transform((value) => {
    if (!value || value === '') return undefined;
    const cleaned = value.replace(/[R\s,]/g, '');
    return parseFloat(cleaned);
  });

/**
 * Date validation schema
 */
export const dateSchema = z
  .string()
  .min(1, 'Date is required')
  .refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    {
      message: 'Invalid date',
    }
  );

/**
 * Optional date schema
 */
export const optionalDateSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    {
      message: 'Invalid date',
    }
  );

/**
 * Date range validation schema
 */
export const dateRangeSchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
  })
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return fromDate <= toDate;
    },
    {
      message: 'End date must be after start date',
      path: ['to'],
    }
  );

/**
 * Optional date range schema
 */
export const optionalDateRangeSchema = z
  .object({
    from: optionalDateSchema,
    to: optionalDateSchema,
  })
  .optional()
  .refine(
    (data) => {
      if (!data || !data.from || !data.to) return true;
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return fromDate <= toDate;
    },
    {
      message: 'End date must be after start date',
      path: ['to'],
    }
  );
