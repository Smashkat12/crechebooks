/**
 * Base exception class for all CrecheBooks application errors.
 * Provides structured error information for API responses and logging.
 */
export class AppException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppException';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Validation error - thrown when input data fails validation
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export class ValidationException extends AppException {
  constructor(
    message: string,
    public readonly errors: ValidationError[],
  ) {
    super(message, 'VALIDATION_ERROR', 400, { errors });
    this.name = 'ValidationException';
  }
}

/**
 * Not found error - thrown when a requested resource doesn't exist
 */
export class NotFoundException extends AppException {
  constructor(resource: string, identifier: string | number) {
    super(
      `${resource} with identifier '${identifier}' not found`,
      'NOT_FOUND',
      404,
      { resource, identifier },
    );
    this.name = 'NotFoundException';
  }
}

/**
 * Conflict error - thrown when operation conflicts with existing state
 */
export class ConflictException extends AppException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictException';
  }
}

/**
 * Unauthorized error - thrown when authentication is required but not provided
 */
export class UnauthorizedException extends AppException {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedException';
  }
}

/**
 * Forbidden error - thrown when user doesn't have permission
 */
export class ForbiddenException extends AppException {
  constructor(
    message: string = 'Access denied',
    code: string = 'FORBIDDEN',
    details?: Record<string, unknown>,
  ) {
    super(message, code, 403, details);
    this.name = 'ForbiddenException';
  }
}

/**
 * External service error - thrown when an external API fails
 */
export class ExternalServiceException extends AppException {
  constructor(service: string, message: string, originalError?: Error) {
    super(
      `External service '${service}' failed: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      {
        service,
        originalMessage: message,
        stack: originalError?.stack,
      },
    );
    this.name = 'ExternalServiceException';
  }
}

/**
 * Database error - thrown when database operations fail
 */
export class DatabaseException extends AppException {
  constructor(operation: string, message: string, originalError?: Error) {
    super(
      `Database operation '${operation}' failed: ${message}`,
      'DATABASE_ERROR',
      500,
      {
        operation,
        originalMessage: message,
        stack: originalError?.stack,
      },
    );
    this.name = 'DatabaseException';
  }
}

/**
 * Business logic error - thrown when business rules are violated
 */
export class BusinessException extends AppException {
  constructor(
    message: string,
    code: string = 'BUSINESS_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message, code, 422, details);
    this.name = 'BusinessException';
  }
}

/**
 * Too Many Requests error - thrown when rate limit is exceeded
 * HTTP Status: 429
 */
export class TooManyRequestsException extends AppException {
  constructor(
    message: string = 'Too many requests. Please try again later.',
    public readonly retryAfter: number = 60,
    details?: Record<string, unknown>,
  ) {
    super(message, 'TOO_MANY_REQUESTS', 429, {
      ...details,
      retryAfter,
    });
    this.name = 'TooManyRequestsException';
  }

  /**
   * Get the Retry-After header value in seconds.
   */
  getRetryAfterSeconds(): number {
    return this.retryAfter;
  }
}

/**
 * Service Unavailable error - thrown when a required service is down
 * HTTP Status: 503
 */
export class ServiceUnavailableException extends AppException {
  constructor(
    service: string,
    message: string = 'Service temporarily unavailable',
    retryAfter?: number,
  ) {
    super(`${service}: ${message}`, 'SERVICE_UNAVAILABLE', 503, {
      service,
      retryAfter,
    });
    this.name = 'ServiceUnavailableException';
  }
}

/**
 * Payload Too Large error - thrown when request body exceeds size limit
 * HTTP Status: 413
 * TASK-INFRA-008: Request payload size limits
 */
export class PayloadTooLargeException extends AppException {
  constructor(
    message: string = 'Request payload is too large',
    public readonly maxSize?: string,
    public readonly actualSize?: number,
  ) {
    super(message, 'PAYLOAD_TOO_LARGE', 413, {
      maxSize,
      actualSize,
    });
    this.name = 'PayloadTooLargeException';
  }

  /**
   * Get the maximum allowed size as a human-readable string.
   */
  getMaxSize(): string | undefined {
    return this.maxSize;
  }
}
