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
  constructor(message: string = 'Access denied') {
    super(message, 'FORBIDDEN', 403);
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
