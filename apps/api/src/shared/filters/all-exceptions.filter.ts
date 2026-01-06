/**
 * All Exceptions Filter
 * TASK-TEST-002: Add Fail-Fast Error Logging
 *
 * Catches all exceptions and formats them with correlation IDs for tracing.
 * Logs full error details for debugging while returning sanitized responses.
 */
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { generateCorrelationId } from '../logging/error-logger';
import {
  AppException,
  BusinessException,
  NotFoundException,
  ValidationException,
} from '../exceptions';

/**
 * Standardized error response format
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}

/**
 * Extended request type with user info
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    tenantId?: string;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    const correlationId = this.getCorrelationId(request);
    const { status, errorResponse } = this.formatErrorResponse(
      exception,
      correlationId,
    );

    // Log full error with stack trace
    this.logError(exception, correlationId, request);

    // Send sanitized response to client
    response.status(status).json(errorResponse);
  }

  /**
   * Extract correlation ID from request headers or generate new one
   */
  private getCorrelationId(request: Request): string {
    const existingId = request.headers['x-correlation-id'];
    if (typeof existingId === 'string') {
      return existingId;
    }
    return generateCorrelationId();
  }

  /**
   * Format error response based on exception type
   */
  private formatErrorResponse(
    exception: unknown,
    correlationId: string,
  ): { status: number; errorResponse: ErrorResponse } {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    // Handle NestJS HttpException
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        code = (resp.error as string) || code;
      } else {
        message = exceptionResponse as string;
      }
    }

    // Handle our custom AppException hierarchy
    if (exception instanceof AppException) {
      status = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    }

    // Specific handling for ValidationException
    if (exception instanceof ValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = exception.message;
      details = exception.errors;
    }

    // Specific handling for NotFoundException
    if (exception instanceof NotFoundException) {
      status = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = exception.message;
    }

    // Specific handling for BusinessException
    if (exception instanceof BusinessException) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    }

    const errorObj: ErrorResponse['error'] = {
      code,
      message,
      correlationId,
    };

    if (details) {
      errorObj.details = details;
    }

    return {
      status,
      errorResponse: {
        success: false,
        error: errorObj,
      },
    };
  }

  /**
   * Log full error details for debugging
   */
  private logError(
    exception: unknown,
    correlationId: string,
    request: AuthenticatedRequest,
  ): void {
    const errorInfo = {
      correlationId,
      method: request.method,
      url: request.url,
      userId: request.user?.id,
      tenantId: request.user?.tenantId,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof Error) {
      this.logger.error(
        `[${correlationId}] ${exception.message}`,
        JSON.stringify(
          {
            ...errorInfo,
            errorName: exception.name,
            stack: exception.stack,
          },
          null,
          2,
        ),
      );
    } else {
      this.logger.error(
        `[${correlationId}] Unknown error`,
        JSON.stringify({ ...errorInfo, exception: String(exception) }, null, 2),
      );
    }
  }
}
