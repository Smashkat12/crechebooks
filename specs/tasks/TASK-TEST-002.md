<task_spec id="TASK-TEST-002" version="1.0">

<metadata>
  <title>Add Fail-Fast Error Logging</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>testing</layer>
  <sequence>153</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>EC-TEST-002</requirement_ref>
    <requirement_ref>EC-ERR-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - can be done anytime -->
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis and development, it was noted that error logging
in tests and some services does not provide enough context for debugging.
Fail-fast error handling with detailed logs is needed.

## Current State
- Services use NestJS Logger but inconsistently
- Some errors are swallowed or logged without context
- Stack traces sometimes missing
- Correlation IDs not consistently used
- E2E tests don't capture detailed error context

## What Should Happen
Error logging should:
1. Include correlation ID for tracing
2. Include relevant context (entity IDs, operation type)
3. Preserve stack traces
4. Use structured logging format
5. Fail fast on critical errors (no silent swallowing)
6. Provide meaningful error messages to users

## Project Context
- **Logger**: NestJS Logger used throughout
- **Exception Filters**: `apps/api/src/shared/filters/`
- **Shared Exceptions**: `apps/api/src/shared/exceptions/`
- **Services**: Various services in `apps/api/src/database/services/`

## Key Files to Enhance
1. `apps/api/src/shared/filters/http-exception.filter.ts` - HTTP error handling
2. `apps/api/src/shared/exceptions/index.ts` - Custom exceptions
3. `apps/api/src/database/services/` - Service error logging
</context>

<input_context_files>
  <file purpose="http_filter">apps/api/src/shared/filters/http-exception.filter.ts</file>
  <file purpose="exceptions">apps/api/src/shared/exceptions/index.ts</file>
  <file purpose="example_service">apps/api/src/database/services/invoice-delivery.service.ts</file>
</input_context_files>

<prerequisites>
  <check>NestJS Logger infrastructure in place</check>
  <check>Exception filter configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Enhance HTTP exception filter with correlation IDs
    - Add structured error context to all exceptions
    - Create error logging utility function
    - Update key services to use enhanced logging
    - Add correlation ID generation/propagation
    - Ensure stack traces preserved
    - Add fail-fast patterns where appropriate
  </in_scope>
  <out_of_scope>
    - External logging services (Sentry, DataDog)
    - Log aggregation
    - Performance monitoring
    - Alert systems
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/shared/logging/error-logger.ts">
      import { Logger } from '@nestjs/common';

      export interface ErrorContext {
        correlationId?: string;
        entityType?: string;
        entityId?: string;
        operation?: string;
        userId?: string;
        tenantId?: string;
        [key: string]: any;
      }

      /**
       * Log error with structured context
       */
      export function logError(
        logger: Logger,
        error: Error,
        context: ErrorContext,
      ): void;

      /**
       * Create error with structured context
       */
      export function createContextualError(
        message: string,
        code: string,
        context: ErrorContext,
        cause?: Error,
      ): BusinessException;

      /**
       * Generate correlation ID for request tracing
       */
      export function generateCorrelationId(): string;
    </signature>

    <signature file="apps/api/src/shared/filters/http-exception.filter.ts">
      @Catch()
      export class AllExceptionsFilter implements ExceptionFilter {
        catch(exception: unknown, host: ArgumentsHost): void;

        /**
         * Extract correlation ID from request or generate new one
         */
        private getCorrelationId(request: Request): string;

        /**
         * Format error response with correlation ID
         */
        private formatErrorResponse(
          exception: unknown,
          correlationId: string,
        ): ErrorResponse;
      }
    </signature>
  </signatures>

  <constraints>
    - Correlation ID must be included in all error responses
    - Stack traces must be logged (not exposed to client in production)
    - Context must include tenantId and userId when available
    - Fail-fast: critical errors must throw, not swallow
    - Logging must be structured for parsing
    - Performance impact must be minimal
  </constraints>

  <verification>
    - All HTTP errors include correlation ID
    - Stack traces logged for debugging
    - Error context includes relevant IDs
    - Fail-fast behavior in critical paths
    - No silent error swallowing
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
Error Logger Utility (apps/api/src/shared/logging/error-logger.ts):

import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../exceptions';

export interface ErrorContext {
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  operation?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: any;
}

/**
 * Log error with structured context
 */
export function logError(
  logger: Logger,
  error: Error,
  context: ErrorContext,
): void {
  const correlationId = context.correlationId || generateCorrelationId();

  const logPayload = {
    correlationId,
    errorName: error.name,
    errorMessage: error.message,
    errorCode: error instanceof BusinessException ? error.code : 'UNKNOWN',
    ...context,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  logger.error(
    `[${correlationId}] ${error.message}`,
    JSON.stringify(logPayload, null, 2),
  );
}

/**
 * Create error with structured context
 */
export function createContextualError(
  message: string,
  code: string,
  context: ErrorContext,
  cause?: Error,
): BusinessException {
  const correlationId = context.correlationId || generateCorrelationId();

  const error = new BusinessException(message, code, {
    correlationId,
    ...context,
  });

  // Preserve cause stack trace
  if (cause) {
    error.stack = `${error.stack}\nCaused by: ${cause.stack}`;
  }

  return error;
}

/**
 * Generate correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `req_${uuidv4().slice(0, 8)}`;
}

/**
 * Fail-fast wrapper - throws if operation fails
 */
export async function failFast<T>(
  operation: () => Promise<T>,
  errorMessage: string,
  context: ErrorContext,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw createContextualError(
      errorMessage,
      'OPERATION_FAILED',
      context,
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

// Enhanced HTTP Exception Filter (apps/api/src/shared/filters/http-exception.filter.ts):

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
import { BusinessException, NotFoundException, ValidationException } from '../exceptions';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: any;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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

  private getCorrelationId(request: Request): string {
    // Check for existing correlation ID in headers
    const existingId = request.headers['x-correlation-id'];
    if (typeof existingId === 'string') {
      return existingId;
    }
    return generateCorrelationId();
  }

  private formatErrorResponse(
    exception: unknown,
    correlationId: string,
  ): { status: number; errorResponse: ErrorResponse } {
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object') {
        message = (response as any).message || message;
        code = (response as any).error || code;
      } else {
        message = response as string;
      }
    }

    if (exception instanceof BusinessException) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.message;
      details = exception.context;
    }

    if (exception instanceof NotFoundException) {
      status = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = exception.message;
    }

    if (exception instanceof ValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_ERROR';
      message = exception.message;
      details = exception.validationErrors;
    }

    return {
      status,
      errorResponse: {
        success: false,
        error: {
          code,
          message,
          correlationId,
          ...(details && { details }),
        },
      },
    };
  }

  private logError(
    exception: unknown,
    correlationId: string,
    request: Request,
  ): void {
    const errorInfo = {
      correlationId,
      method: request.method,
      url: request.url,
      userId: (request as any).user?.id,
      tenantId: (request as any).user?.tenantId,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof Error) {
      this.logger.error(
        `[${correlationId}] ${exception.message}`,
        JSON.stringify({
          ...errorInfo,
          errorName: exception.name,
          stack: exception.stack,
        }, null, 2),
      );
    } else {
      this.logger.error(
        `[${correlationId}] Unknown error`,
        JSON.stringify({ ...errorInfo, exception: String(exception) }, null, 2),
      );
    }
  }
}

// Usage in services:

import { logError, failFast, generateCorrelationId } from '../../shared/logging/error-logger';

class SomeService {
  private readonly logger = new Logger(SomeService.name);

  async someOperation(tenantId: string, entityId: string): Promise<void> {
    const correlationId = generateCorrelationId();

    try {
      // Use failFast for critical operations
      const result = await failFast(
        () => this.repository.findById(entityId),
        `Failed to find entity ${entityId}`,
        { correlationId, tenantId, entityId, operation: 'findById' },
      );

      // Process result...

    } catch (error) {
      // Log with full context
      logError(this.logger, error as Error, {
        correlationId,
        tenantId,
        entityId,
        operation: 'someOperation',
      });
      throw error; // Re-throw - fail fast!
    }
  }
}
</pseudo_code>

<files_to_create>
  <file path="apps/api/src/shared/logging/error-logger.ts">Error logging utilities</file>
  <file path="apps/api/src/shared/logging/index.ts">Logging exports</file>
  <file path="apps/api/src/shared/logging/error-logger.spec.ts">Unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/shared/filters/http-exception.filter.ts">Add correlation ID and structured logging</file>
  <file path="apps/api/src/shared/exceptions/index.ts">Add context property to BusinessException</file>
  <file path="apps/api/src/database/services/invoice-delivery.service.ts">Use enhanced error logging</file>
  <file path="apps/api/src/database/services/payment-allocation.service.ts">Use enhanced error logging</file>
</files_to_modify>

<validation_criteria>
  <criterion>Correlation ID included in all error responses</criterion>
  <criterion>Stack traces logged for debugging</criterion>
  <criterion>Context includes tenantId and userId</criterion>
  <criterion>logError function logs structured data</criterion>
  <criterion>failFast wrapper throws with context</criterion>
  <criterion>HTTP filter returns consistent error format</criterion>
  <criterion>Unit tests pass</criterion>
  <criterion>No silent error swallowing in key services</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- error-logger</command>
  <command>npm run test -- http-exception.filter</command>
</test_commands>

</task_spec>
