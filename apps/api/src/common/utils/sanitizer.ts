/**
 * Sensitive Data Sanitizer
 * TASK-SEC-104: Error Handling Standardization
 *
 * Removes PII and sensitive data from error messages and details
 * before sending to clients. Full details are preserved in logs.
 *
 * Patterns sanitized:
 * - Email addresses
 * - South African ID numbers (13 digits)
 * - Bank account numbers
 * - API keys and tokens
 * - Phone numbers
 * - Credit card numbers
 * - JWT tokens
 */

/**
 * Regular expressions for sensitive data patterns
 */
const SENSITIVE_PATTERNS = {
  // Email addresses
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,

  // South African ID number (13 digits)
  saIdNumber: /\b\d{13}\b/g,

  // Bank account numbers (8-16 digits that aren't SA ID)
  bankAccount: /\b\d{8,16}\b/g,

  // API keys (typically long alphanumeric strings with prefixes)
  apiKey:
    /\b(sk_|pk_|api_|key_|token_|secret_)[A-Za-z0-9_-]{20,}\b/gi,

  // Generic tokens (long alphanumeric strings)
  token: /\b[A-Za-z0-9_-]{40,}\b/g,

  // JWT tokens
  jwt: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,

  // Phone numbers (South African and international)
  phone: /\b(\+?27|0)\d{9,10}\b/g,

  // Credit card numbers (16 digits with optional spaces/dashes)
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

  // UUID (to prevent leaking internal IDs in some cases)
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,

  // Password patterns in JSON/URLs
  password: /"password"\s*:\s*"[^"]+"/gi,

  // Bearer tokens in headers
  bearerToken: /Bearer\s+[A-Za-z0-9_-]+/gi,
};

/**
 * Replacement strings for each pattern type
 */
const REPLACEMENTS: Record<keyof typeof SENSITIVE_PATTERNS, string> = {
  email: '[EMAIL_REDACTED]',
  saIdNumber: '[ID_REDACTED]',
  bankAccount: '[ACCOUNT_REDACTED]',
  apiKey: '[API_KEY_REDACTED]',
  token: '[TOKEN_REDACTED]',
  jwt: '[JWT_REDACTED]',
  phone: '[PHONE_REDACTED]',
  creditCard: '[CARD_REDACTED]',
  uuid: '[ID_REDACTED]',
  password: '"password": "[REDACTED]"',
  bearerToken: 'Bearer [TOKEN_REDACTED]',
};

/**
 * Fields that should be completely removed from error details
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'cookie',
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'idNumber',
  'id_number',
  'bankAccount',
  'bank_account',
  'accountNumber',
  'account_number',
  'privateKey',
  'private_key',
]);

export interface SanitizerOptions {
  /** Preserve UUIDs (useful for correlation IDs) */
  preserveUuids?: boolean;
  /** Additional patterns to sanitize */
  additionalPatterns?: RegExp[];
  /** Additional fields to remove */
  additionalFields?: string[];
  /** Maximum string length (truncate longer strings) */
  maxStringLength?: number;
}

/**
 * Sanitize a string by removing sensitive patterns
 */
export function sanitizeString(
  input: string,
  options: SanitizerOptions = {},
): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  let result = input;

  // Apply each pattern
  for (const [patternName, pattern] of Object.entries(SENSITIVE_PATTERNS)) {
    // Skip UUID sanitization if preserveUuids is true
    if (patternName === 'uuid' && options.preserveUuids) {
      continue;
    }

    const replacement = REPLACEMENTS[patternName as keyof typeof SENSITIVE_PATTERNS];
    result = result.replace(pattern, replacement);
  }

  // Apply additional patterns
  if (options.additionalPatterns) {
    for (const pattern of options.additionalPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }
  }

  // Truncate if too long
  if (options.maxStringLength && result.length > options.maxStringLength) {
    result = result.substring(0, options.maxStringLength) + '...[TRUNCATED]';
  }

  return result;
}

/**
 * Recursively sanitize an object by removing sensitive fields and patterns
 */
export function sanitizeObject<T>(
  obj: T,
  options: SanitizerOptions = {},
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj, options) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    const allSensitiveFields = new Set([
      ...SENSITIVE_FIELDS,
      ...(options.additionalFields || []),
    ]);

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip sensitive fields entirely
      if (allSensitiveFields.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize
      result[key] = sanitizeObject(value, options);
    }

    return result as T;
  }

  return obj;
}

/**
 * Sanitize error details for production responses
 * Preserves structure but removes sensitive data
 */
export function sanitizeErrorDetails(
  details: unknown,
  options: SanitizerOptions = {},
): unknown {
  // Default options for error sanitization
  const sanitizerOptions: SanitizerOptions = {
    preserveUuids: true, // Keep correlation IDs visible
    maxStringLength: 500, // Limit string length
    ...options,
  };

  return sanitizeObject(details, sanitizerOptions);
}

/**
 * Sanitize a message string for production
 */
export function sanitizeMessage(
  message: string,
  options: SanitizerOptions = {},
): string {
  return sanitizeString(message, {
    preserveUuids: true,
    maxStringLength: 200,
    ...options,
  });
}

/**
 * Check if a string contains any sensitive data
 */
export function containsSensitiveData(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  for (const pattern of Object.values(SENSITIVE_PATTERNS)) {
    if (pattern.test(input)) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      return true;
    }
  }

  return false;
}

/**
 * Sanitize stack trace for development mode
 * Removes file paths that might contain usernames
 */
export function sanitizeStackTrace(stack: string): string {
  if (!stack) return stack;

  // Remove home directory paths
  let sanitized = stack.replace(/\/home\/[^/]+\//g, '/home/[USER]/');
  sanitized = sanitized.replace(/C:\\Users\\[^\\]+\\/gi, 'C:\\Users\\[USER]\\');

  // Remove node_modules paths (keep package names)
  sanitized = sanitized.replace(
    /node_modules\/([^/]+)/g,
    'node_modules/$1',
  );

  return sanitized;
}

/**
 * Create a safe error message for external display
 * Maps internal errors to user-friendly messages
 */
export function createSafeMessage(
  internalMessage: string,
  fallbackMessage: string = 'An error occurred',
): string {
  // If message contains sensitive data, return fallback
  if (containsSensitiveData(internalMessage)) {
    return fallbackMessage;
  }

  // Sanitize and truncate
  const sanitized = sanitizeMessage(internalMessage);

  // If sanitization changed the message significantly, use fallback
  if (
    sanitized.includes('[REDACTED]') ||
    sanitized.includes('[EMAIL_REDACTED]')
  ) {
    return fallbackMessage;
  }

  return sanitized;
}
