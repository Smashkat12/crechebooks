/**
 * Global Exception Filter
 * TASK-SEC-104: Error Handling Standardization
 *
 * Transforms all exceptions into standardized API responses.
 * Features:
 * - Environment-aware error details (no stack traces in production)
 * - Correlation ID on every error
 * - Sensitive data sanitization
 * - Structured logging of full error context
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { getCorrelationId } from '../logger/correlation-id.middleware';
import {
  ErrorCode,
  ERROR_CODE_STATUS_MAP,
  ERROR_CODE_MESSAGES,
  isServerError,
} from '../../shared/exceptions/error-codes';
import { AppException } from '../../shared/exceptions/base.exception';
import {
  sanitizeErrorDetails,
  sanitizeMessage,
  sanitizeStackTrace,
} from '../utils/sanitizer';

/**
 * Standard error response format for all API errors
 */
export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId: string;
    timestamp: string;
    path?: string;
  };
}

/**
 * Internal error log structure
 */
interface ErrorLogContext {
  correlationId: string;
  statusCode: number;
  errorCode: string;
  message: string;
  path: string;
  method: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  tenantId?: string;
  stack?: string;
  details?: unknown;
  originalError?: {
    name: string;
    message: string;
  };
}

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService<Record<string, unknown>>) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Get or generate correlation ID
    const correlationId = getCorrelationId() || this.generateFallbackId();

    // Extract error information
    const errorInfo = this.extractErrorInfo(exception);

    // Build log context (full details for internal logging)
    const logContext = this.buildLogContext(
      exception,
      errorInfo,
      request,
      correlationId,
    );

    // Log the error internally
    this.logError(errorInfo, logContext);

    // Build client response (sanitized)
    const errorResponse = this.buildErrorResponse(
      errorInfo,
      correlationId,
      request.path,
    );

    // Set correlation ID header
    response.setHeader('x-correlation-id', correlationId);

    // Send response
    response.status(errorInfo.statusCode).json(errorResponse);
  }

  /**
   * Extract error information from various exception types
   */
  private extractErrorInfo(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  } {
    // Handle our custom AppException
    if (exception instanceof AppException) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        stack: exception.stack,
      };
    }

    // Handle NestJS HttpException
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      let code = this.statusToErrorCode(status);
      let message = exception.message;
      let details: unknown;

      // Handle structured response from HttpException
      if (typeof response === 'object' && response !== null) {
        const res = response as Record<string, unknown>;
        if (res.code) code = res.code as string;
        if (res.message) {
          message = Array.isArray(res.message)
            ? res.message.join(', ')
            : (res.message as string);
        }
        if (res.error && !res.message) {
          message = res.error as string;
        }
        // Extract validation details
        if (res.errors || res.details) {
          details = res.errors || res.details;
        }
      }

      return {
        statusCode: status,
        code,
        message,
        details,
        stack: exception.stack,
      };
    }

    // Handle TypeError, ReferenceError, etc.
    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: ErrorCode.INTERNAL_ERROR,
        message: this.isProduction
          ? ERROR_CODE_MESSAGES[ErrorCode.INTERNAL_ERROR]
          : exception.message,
        stack: exception.stack,
      };
    }

    // Handle unknown exceptions
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.UNKNOWN_ERROR,
      message: ERROR_CODE_MESSAGES[ErrorCode.UNKNOWN_ERROR],
    };
  }

  /**
   * Map HTTP status code to ErrorCode
   */
  private statusToErrorCode(status: number): string {
    // Find matching error code for status
    for (const [code, mappedStatus] of Object.entries(ERROR_CODE_STATUS_MAP)) {
      if (mappedStatus === status) {
        return code;
      }
    }

    // Fallback mappings
    switch (status) {
      case 400:
        return ErrorCode.BAD_REQUEST;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 422:
        return ErrorCode.UNPROCESSABLE_ENTITY;
      case 429:
        return ErrorCode.TOO_MANY_REQUESTS;
      case 500:
        return ErrorCode.INTERNAL_ERROR;
      case 502:
        return ErrorCode.BAD_GATEWAY;
      case 503:
        return ErrorCode.SERVICE_UNAVAILABLE;
      case 504:
        return ErrorCode.GATEWAY_TIMEOUT;
      default:
        return status >= 500
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.BAD_REQUEST;
    }
  }

  /**
   * Build log context with full error details
   */
  private buildLogContext(
    exception: unknown,
    errorInfo: { statusCode: number; code: string; message: string; details?: unknown; stack?: string },
    request: Request,
    correlationId: string,
  ): ErrorLogContext {
    const context: ErrorLogContext = {
      correlationId,
      statusCode: errorInfo.statusCode,
      errorCode: errorInfo.code,
      message: errorInfo.message,
      path: request.path,
      method: request.method,
      ip: request.ip || request.socket?.remoteAddress,
      userAgent: request.headers['user-agent'],
    };

    // Add user/tenant context if available
    const reqAny = request as unknown as Record<string, unknown>;
    if (reqAny.user) {
      const user = reqAny.user as Record<string, unknown>;
      context.userId = user.id as string | undefined;
      context.tenantId = user.tenantId as string | undefined;
    }

    // Add stack trace (only in logs, never in response)
    if (errorInfo.stack) {
      context.stack = this.isProduction
        ? sanitizeStackTrace(errorInfo.stack)
        : errorInfo.stack;
    }

    // Add error details
    if (errorInfo.details) {
      context.details = errorInfo.details;
    }

    // Add original error info if available
    if (exception instanceof Error) {
      context.originalError = {
        name: exception.name,
        message: exception.message,
      };
    }

    return context;
  }

  /**
   * Log error with appropriate level
   */
  private logError(
    errorInfo: { statusCode: number; code: string },
    context: ErrorLogContext,
  ): void {
    const logMessage = `[${context.correlationId}] ${context.method} ${context.path} - ${errorInfo.code}`;

    // Use error level for 5xx, warn for 4xx
    if (isServerError(errorInfo.code as ErrorCode)) {
      this.logger.error(logMessage, JSON.stringify(context));
    } else {
      this.logger.warn(logMessage, JSON.stringify(context));
    }
  }

  /**
   * Build sanitized error response for client
   */
  private buildErrorResponse(
    errorInfo: { statusCode: number; code: string; message: string; details?: unknown; stack?: string },
    correlationId: string,
    path: string,
  ): StandardErrorResponse {
    const response: StandardErrorResponse = {
      success: false,
      error: {
        code: errorInfo.code,
        message: sanitizeMessage(errorInfo.message),
        correlationId,
        timestamp: new Date().toISOString(),
        path,
      },
    };

    // Add details based on environment and error type
    if (errorInfo.details) {
      if (this.isProduction) {
        // In production, sanitize details and only include safe information
        const sanitized = sanitizeErrorDetails(errorInfo.details);
        // Only include validation errors or safe details
        if (this.isSafeDetails(sanitized)) {
          response.error.details = sanitized;
        }
      } else {
        // In development, include full details and stack trace
        response.error.details = {
          ...((errorInfo.details as object) || {}),
          stack: errorInfo.stack,
        };
      }
    } else if (!this.isProduction && errorInfo.stack) {
      // In development, always include stack trace
      response.error.details = { stack: errorInfo.stack };
    }

    return response;
  }

  /**
   * Check if details are safe to include in production response
   */
  private isSafeDetails(details: unknown): boolean {
    if (!details || typeof details !== 'object') {
      return false;
    }

    // Allow validation errors with field details
    const obj = details as Record<string, unknown>;
    if (obj.errors || obj.fields) {
      return true;
    }

    // Allow specific safe fields
    const safeFields = ['fields', 'errors', 'validationErrors', 'retryAfter', 'maxSize'];
    return Object.keys(obj).some((key) => safeFields.includes(key));
  }

  /**
   * Generate a fallback correlation ID if none exists
   */
  private generateFallbackId(): string {
    return `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Factory function for creating GlobalExceptionFilter
 * Used when configService is not available via DI
 */
export function createGlobalExceptionFilter(
  configService: ConfigService,
): GlobalExceptionFilter {
  return new GlobalExceptionFilter(configService);
}
