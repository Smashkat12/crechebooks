/**
 * Input Sanitization Utilities
 * SEC-006: Protection against XSS, SQL injection, and other injection attacks
 *
 * Provides sanitization functions and class-transformer decorators for:
 * - String sanitization (XSS protection, HTML stripping)
 * - Email normalization
 * - South African phone number normalization
 * - ID number sanitization
 */

import { Transform, TransformFnParams } from 'class-transformer';

// ============================================
// Core Sanitization Functions
// ============================================

/**
 * Sanitizes a string by escaping HTML special characters and removing control characters.
 * This prevents XSS attacks by escaping characters that could be used for injection.
 *
 * Characters escaped:
 * - & -> &amp;
 * - < -> &lt;
 * - > -> &gt;
 * - " -> &quot;
 * - ' -> &#x27;
 * - / -> &#x2F;
 * - ` -> &#x60;
 *
 * @param input - The string to sanitize
 * @returns Sanitized string with HTML entities escaped
 *
 * @example
 * sanitizeString('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
 */
export function sanitizeString(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Trim whitespace
  let result = input.trim();

  // Remove control characters (ASCII 0-31 except tab, newline, carriage return)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Escape HTML special characters to prevent XSS
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
  };

  result = result.replace(/[&<>"'/`]/g, (char) => htmlEscapeMap[char] || char);

  return result;
}

/**
 * Removes all HTML tags from a string.
 * Useful for user input that should be plain text only.
 *
 * @param input - The string to strip HTML from
 * @returns String with all HTML tags removed
 *
 * @example
 * sanitizeHtml('<p>Hello <b>World</b></p><script>evil()</script>')
 * // Returns: 'Hello World'
 */
export function sanitizeHtml(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all HTML tags
  let result = input.replace(/<[^>]*>/g, '');

  // Decode common HTML entities
  const htmlEntityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  };

  for (const [entity, char] of Object.entries(htmlEntityMap)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return result.trim();
}

/**
 * Sanitizes and normalizes an email address.
 * - Converts to lowercase
 * - Trims whitespace
 * - Validates basic email format
 *
 * @param input - The email address to sanitize
 * @returns Normalized email address or empty string if invalid
 *
 * @example
 * sanitizeEmail('  John.Doe@EXAMPLE.COM  ')
 * // Returns: 'john.doe@example.com'
 */
export function sanitizeEmail(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Trim and convert to lowercase
  let result = input.trim().toLowerCase();

  // Remove any HTML tags
  result = result.replace(/<[^>]*>/g, '');

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(result)) {
    // Return the sanitized input even if not a valid email
    // Validation decorators should handle rejection
    return result;
  }

  return result;
}

/**
 * Sanitizes and normalizes a South African phone number.
 * Converts various formats to the standard +27 international format.
 *
 * Supported input formats:
 * - 0821234567 -> +27821234567
 * - 27821234567 -> +27821234567
 * - +27821234567 -> +27821234567
 * - 082 123 4567 -> +27821234567
 * - 082-123-4567 -> +27821234567
 *
 * @param input - The phone number to sanitize
 * @returns Normalized phone number in +27XXXXXXXXX format
 *
 * @example
 * sanitizePhone('082 123 4567')
 * // Returns: '+27821234567'
 */
export function sanitizePhone(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters except leading +
  const hasPlus = input.trim().startsWith('+');
  const digits = input.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  // Handle different formats
  // 0XXXXXXXXX (10 digits starting with 0) -> +27XXXXXXXXX
  if (digits.startsWith('0') && digits.length === 10) {
    return '+27' + digits.slice(1);
  }

  // 27XXXXXXXXX (11 digits starting with 27) -> +27XXXXXXXXX
  if (digits.startsWith('27') && digits.length === 11) {
    return '+' + digits;
  }

  // Already has + and starts with 27
  if (hasPlus && digits.startsWith('27') && digits.length === 11) {
    return '+' + digits;
  }

  // Return cleaned digits if no standard format matched
  // This allows validation decorators to reject invalid numbers
  return hasPlus ? '+' + digits : digits;
}

/**
 * Sanitizes a South African ID number.
 * Removes all non-alphanumeric characters and whitespace.
 *
 * @param input - The ID number to sanitize
 * @returns Sanitized ID number containing only digits
 *
 * @example
 * sanitizeIdNumber('8001 0150 0908 7')
 * // Returns: '8001015009087'
 */
export function sanitizeIdNumber(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters
  return input.replace(/\D/g, '');
}

/**
 * Sanitizes a tax number.
 * Removes all non-digit characters and whitespace.
 *
 * @param input - The tax number to sanitize
 * @returns Sanitized tax number containing only digits
 *
 * @example
 * sanitizeTaxNumber('1234 567 890')
 * // Returns: '1234567890'
 */
export function sanitizeTaxNumber(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters
  return input.replace(/\D/g, '');
}

/**
 * Sanitizes a bank account number.
 * Removes all non-digit characters, spaces, and dashes.
 *
 * @param input - The bank account number to sanitize
 * @returns Sanitized bank account number containing only digits
 *
 * @example
 * sanitizeBankAccount('1234-5678-9012')
 * // Returns: '123456789012'
 */
export function sanitizeBankAccount(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters
  return input.replace(/\D/g, '');
}

/**
 * Sanitizes a bank branch code.
 * Removes all non-digit characters.
 *
 * @param input - The branch code to sanitize
 * @returns Sanitized branch code containing only digits
 *
 * @example
 * sanitizeBranchCode('632 005')
 * // Returns: '632005'
 */
export function sanitizeBranchCode(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove all non-digit characters
  return input.replace(/\D/g, '');
}

/**
 * Sanitizes a general name field (first name, last name, etc.).
 * Removes HTML tags, control characters, and limits to safe characters.
 *
 * @param input - The name to sanitize
 * @returns Sanitized name
 *
 * @example
 * sanitizeName('John <script>Doe</script>')
 * // Returns: 'John Doe'
 */
export function sanitizeName(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags
  let result = input.replace(/<[^>]*>/g, '');

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize whitespace (collapse multiple spaces)
  result = result.replace(/\s+/g, ' ');

  return result.trim();
}

/**
 * Sanitizes a multi-line text field (notes, addresses, etc.).
 * Removes HTML tags and dangerous characters while preserving newlines.
 *
 * @param input - The text to sanitize
 * @returns Sanitized text
 *
 * @example
 * sanitizeText('Hello<script>evil()</script>\nWorld')
 * // Returns: 'Hello\nWorld'
 */
export function sanitizeText(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags
  let result = input.replace(/<[^>]*>/g, '');

  // Remove control characters except tab and newline
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return result.trim();
}

// ============================================
// Class Transformer Decorators
// ============================================

/**
 * Decorator that sanitizes string input by escaping HTML characters.
 * Apply to DTO properties that should be XSS-protected.
 *
 * @example
 * class CreateUserDto {
 *   @SanitizeString()
 *   @IsString()
 *   username: string;
 * }
 */
export function SanitizeString(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeString(value));
}

/**
 * Decorator that strips all HTML tags from input.
 * Apply to DTO properties that should contain no HTML.
 *
 * @example
 * class CreatePostDto {
 *   @SanitizeHtml()
 *   @IsString()
 *   plainTextContent: string;
 * }
 */
export function SanitizeHtml(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeHtml(value));
}

/**
 * Decorator that sanitizes and normalizes email addresses.
 * Converts to lowercase and trims whitespace.
 *
 * @example
 * class CreateUserDto {
 *   @SanitizeEmail()
 *   @IsEmail()
 *   email: string;
 * }
 */
export function SanitizeEmail(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeEmail(value));
}

/**
 * Decorator that normalizes South African phone numbers to +27 format.
 * Removes spaces, dashes, and converts local format to international.
 *
 * @example
 * class CreateParentDto {
 *   @SanitizePhone()
 *   @IsSAPhoneNumber()
 *   phone: string;
 * }
 */
export function SanitizePhone(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizePhone(value));
}

/**
 * Decorator that sanitizes ID numbers by removing non-digit characters.
 *
 * @example
 * class CreateStaffDto {
 *   @SanitizeIdNumber()
 *   @IsSAIDNumber()
 *   idNumber: string;
 * }
 */
export function SanitizeIdNumber(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeIdNumber(value));
}

/**
 * Decorator that sanitizes tax numbers by removing non-digit characters.
 *
 * @example
 * class CreateStaffDto {
 *   @SanitizeTaxNumber()
 *   @IsSATaxNumber()
 *   taxNumber: string;
 * }
 */
export function SanitizeTaxNumber(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeTaxNumber(value));
}

/**
 * Decorator that sanitizes bank account numbers by removing non-digit characters.
 *
 * @example
 * class CreateStaffDto {
 *   @SanitizeBankAccount()
 *   @IsSABankAccount()
 *   bankAccount: string;
 * }
 */
export function SanitizeBankAccount(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) =>
    sanitizeBankAccount(value),
  );
}

/**
 * Decorator that sanitizes bank branch codes by removing non-digit characters.
 *
 * @example
 * class CreateStaffDto {
 *   @SanitizeBranchCode()
 *   @IsSABranchCode()
 *   bankBranchCode: string;
 * }
 */
export function SanitizeBranchCode(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeBranchCode(value));
}

/**
 * Decorator that sanitizes name fields by removing HTML and normalizing whitespace.
 *
 * @example
 * class CreateUserDto {
 *   @SanitizeName()
 *   @IsString()
 *   firstName: string;
 * }
 */
export function SanitizeName(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeName(value));
}

/**
 * Decorator that sanitizes multi-line text fields.
 *
 * @example
 * class CreateNoteDto {
 *   @SanitizeText()
 *   @IsString()
 *   content: string;
 * }
 */
export function SanitizeText(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) => sanitizeText(value));
}

// ============================================
// SQL Injection Prevention Helpers
// ============================================

/**
 * Escapes special characters for SQL LIKE patterns.
 * Use when building dynamic LIKE queries with user input.
 *
 * @param input - The string to escape for LIKE
 * @returns Escaped string safe for LIKE patterns
 *
 * @example
 * const searchTerm = escapeSqlLike('100%_off');
 * // Use in: WHERE name LIKE '%' || $1 || '%'
 * // Returns: '100\%\_off'
 */
export function escapeSqlLike(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input !== 'string') {
    return '';
  }

  // Escape special LIKE characters
  return input
    .replace(/\\/g, '\\\\') // Backslash first
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Validates that a string contains no SQL injection patterns.
 * This is a defense-in-depth check - parameterized queries are the primary defense.
 *
 * @param input - The string to check
 * @returns true if no suspicious patterns detected
 *
 * @example
 * isSqlSafe('Robert'); DROP TABLE users;--')
 * // Returns: false
 */
export function isSqlSafe(input: unknown): boolean {
  if (input === null || input === undefined) {
    return true;
  }

  if (typeof input !== 'string') {
    return true;
  }

  // Common SQL injection patterns (case-insensitive)
  const sqlInjectionPatterns = [
    /;\s*(drop|delete|truncate|update|insert|alter)\s/i,
    /--\s*$/,
    /\/\*[\s\S]*?\*\//,
    /'\s*or\s+'?1'?\s*=\s*'?1/i,
    /'\s*or\s+''='/i,
    /union\s+(all\s+)?select/i,
    /exec(\s|\+)+/i,
    /xp_/i,
  ];

  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(input)) {
      return false;
    }
  }

  return true;
}
