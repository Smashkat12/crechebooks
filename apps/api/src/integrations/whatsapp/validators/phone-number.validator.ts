/**
 * Phone Number Validator for WhatsApp Integration
 * TASK-INT-006: Input Validation Before DB Query
 *
 * Validates and sanitizes phone numbers for WhatsApp Business API.
 * Implements E.164 format validation and injection prevention.
 */

import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * E.164 format regex: + followed by 8-15 digits, first digit non-zero
 * Examples: +27123456789, +14155551234, +442071234567
 */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * WhatsApp phone format (without + prefix)
 * WhatsApp Cloud API sometimes returns numbers without the + prefix
 */
export const WHATSAPP_PHONE_REGEX = /^[1-9]\d{7,14}$/;

/**
 * Characters allowed in phone numbers (for sanitization)
 */
const ALLOWED_PHONE_CHARS = /[^\d+]/g;

/**
 * Dangerous injection patterns to detect
 */
const INJECTION_PATTERNS = [
  /['";]/, // SQL injection markers
  /--/, // SQL comment
  /\/\*/, // SQL block comment start
  /\*\//, // SQL block comment end
  /\bOR\b/i, // SQL OR keyword
  /\bAND\b/i, // SQL AND keyword
  /\bUNION\b/i, // SQL UNION keyword
  /\bSELECT\b/i, // SQL SELECT keyword
  /\bDROP\b/i, // SQL DROP keyword
  /\bDELETE\b/i, // SQL DELETE keyword
  /\bINSERT\b/i, // SQL INSERT keyword
  /\bUPDATE\b/i, // SQL UPDATE keyword
  /\$gt\b/, // NoSQL $gt operator
  /\$lt\b/, // NoSQL $lt operator
  /\$ne\b/, // NoSQL $ne operator
  /\$eq\b/, // NoSQL $eq operator
  /\$regex\b/, // NoSQL $regex operator
  /\$where\b/, // NoSQL $where operator
  /\{.*\}/, // JSON object (potential NoSQL injection)
  /\[.*\]/, // JSON array (potential injection)
  /<[a-z]/i, // HTML tag opening (XSS attempt)
  /javascript\s*:/i, // javascript: protocol (XSS attempt)
  /on\w+\s*=/i, // Event handlers (onerror=, onclick=, etc.)
  /data\s*:/i, // data: protocol (potential XSS)
  /vbscript\s*:/i, // vbscript: protocol (XSS attempt)
];

/**
 * Check if input contains potential injection patterns
 */
export function containsInjectionPattern(input: string): boolean {
  if (typeof input !== 'string') return true;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Validator constraint for phone numbers
 */
@ValidatorConstraint({ name: 'isPhoneNumber', async: false })
export class IsPhoneNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, _args: ValidationArguments): boolean {
    // Must be a string
    if (typeof value !== 'string') {
      return false;
    }

    // Empty strings are invalid
    if (value.trim().length === 0) {
      return false;
    }

    // Check for injection patterns before any processing
    if (containsInjectionPattern(value)) {
      return false;
    }

    // Validate against E.164 or WhatsApp format
    return E164_REGEX.test(value) || WHATSAPP_PHONE_REGEX.test(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Phone number must be in E.164 format (e.g., +27123456789) or WhatsApp format (27123456789)';
  }
}

/**
 * Custom decorator for phone number validation
 *
 * @example
 * class MessageDto {
 *   @IsPhoneNumber()
 *   from: string;
 * }
 */
export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPhoneNumberConstraint,
    });
  };
}

/**
 * Normalize phone number to E.164 format
 * Adds + prefix if missing and validates the result
 *
 * @param phone - Phone number to normalize
 * @returns Normalized E.164 phone number
 * @throws Error if phone number is invalid
 *
 * @example
 * normalizePhoneNumber('27123456789')  // Returns '+27123456789'
 * normalizePhoneNumber('+27123456789') // Returns '+27123456789'
 */
export function normalizePhoneNumber(phone: string): string {
  if (typeof phone !== 'string') {
    throw new Error('Phone number must be a string');
  }

  // Check for injection patterns
  if (containsInjectionPattern(phone)) {
    throw new Error('Invalid phone number: contains suspicious characters');
  }

  // Remove common separators (spaces, dashes, dots, parentheses)
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, '');

  // If already in E.164 format, validate and return
  if (cleaned.startsWith('+')) {
    if (!E164_REGEX.test(cleaned)) {
      throw new Error('Invalid E.164 phone number format');
    }
    return cleaned;
  }

  // Add + prefix for WhatsApp format numbers
  const normalized = `+${cleaned}`;

  if (!E164_REGEX.test(normalized)) {
    throw new Error('Invalid phone number format');
  }

  return normalized;
}

/**
 * Sanitize phone number input by removing all non-digit characters except +
 * This is a defensive measure against injection attacks
 *
 * @param input - Raw input to sanitize
 * @returns Sanitized string containing only digits and optional + prefix
 *
 * @example
 * sanitizePhoneNumber('+27 123-456-789')  // Returns '+27123456789'
 * sanitizePhoneNumber("27'; DROP TABLE--") // Returns '27'
 */
export function sanitizePhoneNumber(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove everything except digits and +
  const sanitized = input.replace(ALLOWED_PHONE_CHARS, '');

  // Ensure only one + at the start
  if (sanitized.includes('+')) {
    const plusIndex = sanitized.indexOf('+');
    if (plusIndex === 0) {
      // + is at the start, remove any other + characters
      return '+' + sanitized.slice(1).replace(/\+/g, '');
    } else {
      // + is not at start, remove all + characters
      return sanitized.replace(/\+/g, '');
    }
  }

  return sanitized;
}

/**
 * Validate phone number without throwing (returns boolean)
 *
 * @param phone - Phone number to validate
 * @returns true if valid, false otherwise
 */
export function isValidPhoneNumber(phone: unknown): phone is string {
  if (typeof phone !== 'string' || phone.trim().length === 0) {
    return false;
  }

  if (containsInjectionPattern(phone)) {
    return false;
  }

  return E164_REGEX.test(phone) || WHATSAPP_PHONE_REGEX.test(phone);
}
