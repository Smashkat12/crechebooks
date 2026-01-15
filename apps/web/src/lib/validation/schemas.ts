/**
 * Zod Validation Schemas with Custom Messages
 * TASK UI-005: Fix Form Validation Messages
 *
 * Provides reusable validation schemas for South African specific validations
 * and common form fields with user-friendly error messages.
 */

import { z } from 'zod';
import {
  SA_ID_NUMBER_MESSAGES,
  SA_PHONE_MESSAGES,
  SA_TAX_NUMBER_MESSAGES,
  EMAIL_MESSAGES,
  PASSWORD_MESSAGES,
  NAME_MESSAGES,
  CURRENCY_MESSAGES,
  DATE_MESSAGES,
  BANK_ACCOUNT_MESSAGES,
  ADDRESS_MESSAGES,
} from './messages';

// ============================================================================
// South African ID Number Validation
// ============================================================================

/**
 * Validate SA ID number using Luhn algorithm
 * The SA ID number format: YYMMDD SSSS C A Z
 * - YYMMDD: Date of birth
 * - SSSS: Sequence number (5000+ = male, <5000 = female)
 * - C: Citizenship (0 = SA citizen, 1 = permanent resident)
 * - A: Usually 8 (was 9 for older IDs)
 * - Z: Checksum digit (Luhn algorithm)
 */
export function validateSaIdLuhn(idNumber: string): boolean {
  if (!/^\d{13}$/.test(idNumber)) return false;

  // Validate date portion
  const _year = parseInt(idNumber.substring(0, 2), 10);
  const month = parseInt(idNumber.substring(2, 4), 10);
  const day = parseInt(idNumber.substring(4, 6), 10);

  // Basic date validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Check months with 30 days
  if ([4, 6, 9, 11].includes(month) && day > 30) return false;

  // Check February (simplified - doesn't account for leap years perfectly)
  if (month === 2 && day > 29) return false;

  // Luhn algorithm validation
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(idNumber[i], 10);

    if (i % 2 === 0) {
      // Odd positions (1st, 3rd, 5th, etc.) - add digit
      sum += digit;
    } else {
      // Even positions (2nd, 4th, 6th, etc.) - double and sum digits
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
      sum += digit;
    }
  }

  return sum % 10 === 0;
}

/**
 * Extract date of birth from SA ID number
 */
export function extractDobFromSaId(idNumber: string): Date | null {
  if (!/^\d{13}$/.test(idNumber)) return null;

  const year = parseInt(idNumber.substring(0, 2), 10);
  const month = parseInt(idNumber.substring(2, 4), 10);
  const day = parseInt(idNumber.substring(4, 6), 10);

  // Determine century (assuming 00-29 = 2000s, 30-99 = 1900s)
  const currentYear = new Date().getFullYear();
  const century = year <= (currentYear % 100) + 10 ? 2000 : 1900;
  const fullYear = century + year;

  const date = new Date(fullYear, month - 1, day);

  // Validate the date is valid
  if (
    date.getFullYear() !== fullYear ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

/**
 * Extract gender from SA ID number
 */
export function extractGenderFromSaId(idNumber: string): 'male' | 'female' | null {
  if (!/^\d{13}$/.test(idNumber)) return null;

  const genderDigits = parseInt(idNumber.substring(6, 10), 10);
  return genderDigits >= 5000 ? 'male' : 'female';
}

/**
 * Check if SA ID indicates SA citizen or permanent resident
 */
export function isSaCitizen(idNumber: string): boolean | null {
  if (!/^\d{13}$/.test(idNumber)) return null;

  const citizenshipDigit = parseInt(idNumber[10], 10);
  return citizenshipDigit === 0;
}

export const saIdNumberSchema = z
  .string()
  .min(1, SA_ID_NUMBER_MESSAGES.required)
  .length(13, SA_ID_NUMBER_MESSAGES.length)
  .regex(/^\d{13}$/, SA_ID_NUMBER_MESSAGES.format)
  .refine(validateSaIdLuhn, SA_ID_NUMBER_MESSAGES.invalid);

export const optionalSaIdNumberSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      if (value.length !== 13) return false;
      if (!/^\d{13}$/.test(value)) return false;
      return validateSaIdLuhn(value);
    },
    SA_ID_NUMBER_MESSAGES.invalid
  );

// ============================================================================
// South African Phone Number Validation
// ============================================================================

/**
 * Validate South African phone number
 * Accepts formats:
 * - 0XX XXX XXXX (local format)
 * - +27 XX XXX XXXX (international format)
 * - 0XXXXXXXXX (no spaces)
 * - +27XXXXXXXXX (no spaces)
 *
 * Valid prefixes:
 * - 06X, 07X, 08X for mobile
 * - 01X, 02X, 03X, 04X, 05X for landlines
 */
export function validateSaPhone(phone: string): boolean {
  // Remove all spaces, hyphens, and parentheses
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // Check for +27 format
  if (cleaned.startsWith('+27')) {
    // Should be +27 followed by 9 digits (total 12 chars)
    return /^\+27[1-8][0-9]{8}$/.test(cleaned);
  }

  // Check for 0 format
  if (cleaned.startsWith('0')) {
    // Should be 0 followed by 9 digits (total 10 chars)
    return /^0[1-8][0-9]{8}$/.test(cleaned);
  }

  return false;
}

/**
 * Validate South African mobile number specifically
 */
export function validateSaMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+27')) {
    // Mobile prefixes: 6, 7, 8 after +27
    return /^\+27[6-8][0-9]{8}$/.test(cleaned);
  }

  if (cleaned.startsWith('0')) {
    // Mobile prefixes: 06, 07, 08
    return /^0[6-8][0-9]{8}$/.test(cleaned);
  }

  return false;
}

/**
 * Format phone number to standard format
 */
export function formatSaPhone(phone: string, international = false): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');

  let digits: string;

  if (cleaned.startsWith('+27')) {
    digits = cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    digits = cleaned.substring(1);
  } else {
    return phone;
  }

  if (digits.length !== 9) return phone;

  if (international) {
    return `+27 ${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5)}`;
  }

  return `0${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5)}`;
}

export const saPhoneSchema = z
  .string()
  .min(1, SA_PHONE_MESSAGES.required)
  .refine(validateSaPhone, SA_PHONE_MESSAGES.invalid);

export const saMobileSchema = z
  .string()
  .min(1, SA_PHONE_MESSAGES.required)
  .refine(validateSaMobile, SA_PHONE_MESSAGES.mobile);

export const optionalSaPhoneSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return validateSaPhone(value);
    },
    SA_PHONE_MESSAGES.invalid
  );

export const optionalSaMobileSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return validateSaMobile(value);
    },
    SA_PHONE_MESSAGES.mobile
  );

// ============================================================================
// South African Tax Number Validation
// ============================================================================

/**
 * Validate SARS tax reference number
 * Format: 10 digits starting with 0, 1, 2, 3, or 9
 */
export function validateSaTaxNumber(taxNumber: string): boolean {
  const cleaned = taxNumber.replace(/[\s\-]/g, '');

  // Must be exactly 10 digits
  if (!/^\d{10}$/.test(cleaned)) return false;

  // First digit should be 0, 1, 2, 3, or 9
  const firstDigit = cleaned[0];
  return ['0', '1', '2', '3', '9'].includes(firstDigit);
}

export const saTaxNumberSchema = z
  .string()
  .min(1, SA_TAX_NUMBER_MESSAGES.required)
  .length(10, SA_TAX_NUMBER_MESSAGES.length)
  .regex(/^\d{10}$/, SA_TAX_NUMBER_MESSAGES.format)
  .refine(validateSaTaxNumber, SA_TAX_NUMBER_MESSAGES.invalid);

export const optionalSaTaxNumberSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return validateSaTaxNumber(value);
    },
    SA_TAX_NUMBER_MESSAGES.invalid
  );

// ============================================================================
// Email Validation
// ============================================================================

export const emailSchema = z
  .string()
  .min(1, EMAIL_MESSAGES.required)
  .email(EMAIL_MESSAGES.invalid)
  .max(255, 'Email address is too long');

export const optionalEmailSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return z.string().email().safeParse(value).success;
    },
    EMAIL_MESSAGES.invalid
  );

// ============================================================================
// Password Validation
// ============================================================================

export const passwordSchema = z
  .string()
  .min(1, PASSWORD_MESSAGES.required)
  .min(8, PASSWORD_MESSAGES.minLength)
  .max(128, PASSWORD_MESSAGES.maxLength)
  .refine(
    (password) => /[A-Z]/.test(password),
    PASSWORD_MESSAGES.uppercase
  )
  .refine(
    (password) => /[a-z]/.test(password),
    PASSWORD_MESSAGES.lowercase
  )
  .refine(
    (password) => /[0-9]/.test(password),
    PASSWORD_MESSAGES.number
  )
  .refine(
    (password) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    PASSWORD_MESSAGES.special
  );

export const simplePasswordSchema = z
  .string()
  .min(1, PASSWORD_MESSAGES.required)
  .min(8, PASSWORD_MESSAGES.minLength)
  .max(128, PASSWORD_MESSAGES.maxLength);

// ============================================================================
// Name Validation
// ============================================================================

const nameRegex = /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+([ '\-][a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]+)*$/;

export const firstNameSchema = z
  .string()
  .min(1, NAME_MESSAGES.firstName.required)
  .min(2, NAME_MESSAGES.firstName.minLength)
  .max(50, NAME_MESSAGES.firstName.maxLength)
  .regex(nameRegex, NAME_MESSAGES.firstName.format);

export const lastNameSchema = z
  .string()
  .min(1, NAME_MESSAGES.lastName.required)
  .min(2, NAME_MESSAGES.lastName.minLength)
  .max(50, NAME_MESSAGES.lastName.maxLength)
  .regex(nameRegex, NAME_MESSAGES.lastName.format);

export const fullNameSchema = z
  .string()
  .min(1, NAME_MESSAGES.fullName.required)
  .min(3, NAME_MESSAGES.fullName.minLength)
  .max(100, NAME_MESSAGES.fullName.maxLength);

// ============================================================================
// Currency Validation (South African Rand)
// ============================================================================

/**
 * Validate currency amount
 * Accepts: 1500, 1500.00, 1,500.00, R1500, R 1,500.00
 */
export function parseCurrencyValue(value: string): number | null {
  const cleaned = value.replace(/[R\s,]/g, '');
  const num = parseFloat(cleaned);

  if (isNaN(num)) return null;
  if (num < 0) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  return num;
}

export const currencySchema = z
  .string()
  .min(1, CURRENCY_MESSAGES.required)
  .refine(
    (value) => {
      const num = parseCurrencyValue(value);
      return num !== null && num >= 0;
    },
    CURRENCY_MESSAGES.format
  )
  .transform((value) => {
    return parseCurrencyValue(value) ?? 0;
  });

export const optionalCurrencySchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      const num = parseCurrencyValue(value);
      return num !== null && num >= 0;
    },
    CURRENCY_MESSAGES.format
  )
  .transform((value) => {
    if (!value || value === '') return undefined;
    return parseCurrencyValue(value) ?? undefined;
  });

export const positiveCurrencySchema = z
  .string()
  .min(1, CURRENCY_MESSAGES.required)
  .refine(
    (value) => {
      const num = parseCurrencyValue(value);
      return num !== null && num > 0;
    },
    CURRENCY_MESSAGES.positive
  )
  .transform((value) => {
    return parseCurrencyValue(value) ?? 0;
  });

// ============================================================================
// Date Validation
// ============================================================================

export const dateSchema = z
  .string()
  .min(1, DATE_MESSAGES.required)
  .refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    DATE_MESSAGES.invalid
  );

export const optionalDateSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    },
    DATE_MESSAGES.invalid
  );

export const pastDateSchema = z
  .string()
  .min(1, DATE_MESSAGES.required)
  .refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) && date <= new Date();
    },
    DATE_MESSAGES.future
  );

export const futureDateSchema = z
  .string()
  .min(1, DATE_MESSAGES.required)
  .refine(
    (value) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) && date >= new Date();
    },
    DATE_MESSAGES.past
  );

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
      message: DATE_MESSAGES.range,
      path: ['to'],
    }
  );

// ============================================================================
// Bank Account Validation
// ============================================================================

export const bankAccountNumberSchema = z
  .string()
  .min(1, BANK_ACCOUNT_MESSAGES.accountNumber.required)
  .min(6, BANK_ACCOUNT_MESSAGES.accountNumber.minLength)
  .max(20, BANK_ACCOUNT_MESSAGES.accountNumber.maxLength)
  .regex(/^\d+$/, BANK_ACCOUNT_MESSAGES.accountNumber.format);

export const bankBranchCodeSchema = z
  .string()
  .min(1, BANK_ACCOUNT_MESSAGES.branchCode.required)
  .length(6, BANK_ACCOUNT_MESSAGES.branchCode.length)
  .regex(/^\d{6}$/, BANK_ACCOUNT_MESSAGES.branchCode.format);

export const optionalBankAccountNumberSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return /^\d{6,20}$/.test(value);
    },
    BANK_ACCOUNT_MESSAGES.accountNumber.format
  );

export const optionalBankBranchCodeSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return /^\d{6}$/.test(value);
    },
    BANK_ACCOUNT_MESSAGES.branchCode.format
  );

// ============================================================================
// South African Address Validation
// ============================================================================

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

export const saPostalCodeSchema = z
  .string()
  .min(1, ADDRESS_MESSAGES.postalCode.required)
  .regex(/^\d{4}$/, ADDRESS_MESSAGES.postalCode.format);

export const saProvinceSchema = z.enum(SA_PROVINCES, {
  errorMap: () => ({ message: ADDRESS_MESSAGES.province.invalid }),
});

export const optionalSaPostalCodeSchema = z
  .string()
  .optional()
  .refine(
    (value) => {
      if (!value || value === '') return true;
      return /^\d{4}$/.test(value);
    },
    ADDRESS_MESSAGES.postalCode.format
  );

// ============================================================================
// Common Form Schema Builders
// ============================================================================

/**
 * Create a schema for a required string field with min/max length
 */
export function requiredString(
  fieldName: string,
  minLength = 1,
  maxLength = 255
) {
  return z
    .string()
    .min(minLength, minLength === 1
      ? `${fieldName} is required`
      : `${fieldName} must be at least ${minLength} characters`
    )
    .max(maxLength, `${fieldName} must be no more than ${maxLength} characters`);
}

/**
 * Create a schema for an optional string field with max length
 */
export function optionalString(maxLength = 255) {
  return z.string().max(maxLength).optional();
}

/**
 * Create a schema for a required numeric field
 */
export function requiredNumber(fieldName: string, min?: number, max?: number) {
  let schema = z.number({
    required_error: `${fieldName} is required`,
    invalid_type_error: `${fieldName} must be a number`,
  });

  if (min !== undefined) {
    schema = schema.min(min, `${fieldName} must be at least ${min}`);
  }
  if (max !== undefined) {
    schema = schema.max(max, `${fieldName} must be no more than ${max}`);
  }

  return schema;
}

/**
 * Create a schema for an optional numeric field
 */
export function optionalNumber(min?: number, max?: number) {
  if (min !== undefined || max !== undefined) {
    return z
      .number()
      .optional()
      .refine(
        (val) => {
          if (val === undefined || val === null) return true;
          if (min !== undefined && val < min) return false;
          if (max !== undefined && val > max) return false;
          return true;
        },
        {
          message: min !== undefined && max !== undefined
            ? `Value must be between ${min} and ${max}`
            : min !== undefined
              ? `Value must be at least ${min}`
              : `Value must be no more than ${max}`,
        }
      );
  }

  return z.number().optional();
}
