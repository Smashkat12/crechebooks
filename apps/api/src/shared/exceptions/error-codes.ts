/**
 * Error Code Enumeration
 * TASK-SEC-104: Error Handling Standardization
 *
 * Centralized error codes for consistent API responses.
 * Used by GlobalExceptionFilter and AppException classes.
 */

/**
 * Standard error codes used across the application.
 * Each code maps to a specific HTTP status and error category.
 */
export enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  BAD_REQUEST = 'BAD_REQUEST',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  NOT_ACCEPTABLE = 'NOT_ACCEPTABLE',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',

  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BAD_GATEWAY = 'BAD_GATEWAY',
  GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',

  // Business Logic Errors
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  TENANT_ERROR = 'TENANT_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Integration Errors
  XERO_ERROR = 'XERO_ERROR',
  SIMPLEPAY_ERROR = 'SIMPLEPAY_ERROR',
  WEBHOOK_ERROR = 'WEBHOOK_ERROR',

  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Error code to HTTP status mapping.
 * Used by GlobalExceptionFilter to determine response status.
 */
export const ERROR_CODE_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.METHOD_NOT_ALLOWED]: 405,
  [ErrorCode.NOT_ACCEPTABLE]: 406,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.UNPROCESSABLE_ENTITY]: 422,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.BAD_GATEWAY]: 502,
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [ErrorCode.XERO_ERROR]: 502,
  [ErrorCode.SIMPLEPAY_ERROR]: 502,
  [ErrorCode.WEBHOOK_ERROR]: 502,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.GATEWAY_TIMEOUT]: 504,
  [ErrorCode.BUSINESS_ERROR]: 422,
  [ErrorCode.TENANT_ERROR]: 403,
  [ErrorCode.QUOTA_EXCEEDED]: 429,
  [ErrorCode.UNKNOWN_ERROR]: 500,
};

/**
 * User-friendly error messages for each error code.
 * Used when specific message is not provided.
 */
export const ERROR_CODE_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_ERROR]: 'The provided data is invalid',
  [ErrorCode.BAD_REQUEST]: 'The request could not be understood',
  [ErrorCode.UNAUTHORIZED]: 'Authentication is required',
  [ErrorCode.FORBIDDEN]: 'Access to this resource is denied',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found',
  [ErrorCode.METHOD_NOT_ALLOWED]: 'This HTTP method is not allowed',
  [ErrorCode.NOT_ACCEPTABLE]: 'The requested format is not supported',
  [ErrorCode.CONFLICT]: 'The request conflicts with existing data',
  [ErrorCode.PAYLOAD_TOO_LARGE]: 'The request payload is too large',
  [ErrorCode.UNPROCESSABLE_ENTITY]: 'The request could not be processed',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests. Please try again later',
  [ErrorCode.INTERNAL_ERROR]: 'An internal server error occurred',
  [ErrorCode.DATABASE_ERROR]: 'A database error occurred',
  [ErrorCode.BAD_GATEWAY]: 'An external service returned an invalid response',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'An external service error occurred',
  [ErrorCode.XERO_ERROR]: 'Xero integration error',
  [ErrorCode.SIMPLEPAY_ERROR]: 'SimplePay integration error',
  [ErrorCode.WEBHOOK_ERROR]: 'Webhook processing error',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable',
  [ErrorCode.GATEWAY_TIMEOUT]: 'An external service timed out',
  [ErrorCode.BUSINESS_ERROR]: 'A business rule was violated',
  [ErrorCode.TENANT_ERROR]: 'Tenant access error',
  [ErrorCode.QUOTA_EXCEEDED]: 'Your usage quota has been exceeded',
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred',
};

/**
 * Check if an error code represents a client error (4xx)
 */
export function isClientError(code: ErrorCode): boolean {
  const status = ERROR_CODE_STATUS_MAP[code];
  return status >= 400 && status < 500;
}

/**
 * Check if an error code represents a server error (5xx)
 */
export function isServerError(code: ErrorCode): boolean {
  const status = ERROR_CODE_STATUS_MAP[code];
  return status >= 500;
}

/**
 * Get the HTTP status code for an error code
 */
export function getStatusForCode(code: ErrorCode): number {
  return ERROR_CODE_STATUS_MAP[code] || 500;
}

/**
 * Get the default message for an error code
 */
export function getMessageForCode(code: ErrorCode): string {
  return ERROR_CODE_MESSAGES[code] || 'An unexpected error occurred';
}
