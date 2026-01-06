/**
 * Error Logger Utility
 * TASK-TEST-002: Add Fail-Fast Error Logging
 *
 * Provides structured error logging with correlation IDs for request tracing.
 * Implements fail-fast patterns for critical error handling.
 */
import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AppException, BusinessException } from '../exceptions';

/**
 * Context information for structured error logging
 */
export interface ErrorContext {
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  operation?: string;
  userId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

/**
 * Structured log payload for error tracking
 */
interface ErrorLogPayload {
  correlationId: string;
  errorName: string;
  errorMessage: string;
  errorCode: string;
  stack?: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Generate correlation ID for request tracing
 * Format: req_XXXXXXXX (8 char hex)
 */
export function generateCorrelationId(): string {
  return `req_${uuidv4().slice(0, 8)}`;
}

/**
 * Log error with structured context
 * Ensures all errors are logged with correlation ID and relevant context
 *
 * @param logger - NestJS Logger instance
 * @param error - Error to log
 * @param context - Additional context for debugging
 */
export function logError(
  logger: Logger,
  error: Error,
  context: ErrorContext,
): void {
  const correlationId = context.correlationId || generateCorrelationId();

  const logPayload: ErrorLogPayload = {
    correlationId,
    errorName: error.name,
    errorMessage: error.message,
    errorCode: error instanceof AppException ? error.code : 'UNKNOWN',
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  logger.error(
    `[${correlationId}] ${error.message}`,
    JSON.stringify(logPayload, null, 2),
  );
}

/**
 * Create error with structured context
 * Preserves cause stack trace for debugging chain
 *
 * @param message - Error message
 * @param code - Error code for programmatic handling
 * @param context - Additional context
 * @param cause - Original error that caused this one
 * @returns BusinessException with enhanced context
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

  // Preserve cause stack trace for debugging
  if (cause) {
    error.stack = `${error.stack}\nCaused by: ${cause.stack}`;
  }

  return error;
}

/**
 * Fail-fast wrapper - throws if operation fails
 * Use this for critical operations that must succeed
 *
 * @param operation - Async operation to execute
 * @param errorMessage - Message if operation fails
 * @param context - Context for error logging
 * @returns Result of operation
 * @throws BusinessException with context if operation fails
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

/**
 * Safe operation wrapper - logs error but doesn't throw
 * Use this for non-critical operations where failure should be logged but not fatal
 *
 * @param logger - Logger instance
 * @param operation - Async operation to execute
 * @param context - Context for error logging
 * @param fallback - Fallback value if operation fails
 * @returns Result of operation or fallback value
 */
export async function safeOperation<T>(
  logger: Logger,
  operation: () => Promise<T>,
  context: ErrorContext,
  fallback: T,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logError(
      logger,
      error instanceof Error ? error : new Error(String(error)),
      context,
    );
    return fallback;
  }
}

/**
 * Assert condition with fail-fast error
 * Use this for precondition checks
 *
 * @param condition - Condition to assert
 * @param errorMessage - Message if assertion fails
 * @param code - Error code
 * @param context - Context for error
 * @throws BusinessException if condition is false
 */
export function assertCondition(
  condition: boolean,
  errorMessage: string,
  code: string,
  context: ErrorContext,
): asserts condition {
  if (!condition) {
    throw createContextualError(errorMessage, code, context);
  }
}
