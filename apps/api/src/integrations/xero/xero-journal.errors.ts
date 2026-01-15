/**
 * Xero Journal Error Classes
 * TASK-STAFF-001: Implement Xero Journal Posting
 *
 * Custom error classes for Xero API journal operations.
 * These errors provide specific handling for different failure modes
 * when interacting with the Xero API.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base error class for all Xero journal-related errors.
 * Uses HTTP 502 Bad Gateway as the default status since these
 * represent failures in an external service (Xero).
 */
export class XeroJournalError extends HttpException {
  constructor(
    message: string,
    public readonly xeroError?: unknown,
    statusCode: HttpStatus = HttpStatus.BAD_GATEWAY,
  ) {
    super(
      {
        success: false,
        error: {
          code: 'XERO_JOURNAL_ERROR',
          message,
          xeroError,
        },
      },
      statusCode,
    );
    this.name = 'XeroJournalError';
  }

  /**
   * Get the underlying Xero API error details if available
   */
  getXeroError(): unknown {
    return this.xeroError;
  }
}

/**
 * Error thrown when Xero authentication fails.
 * This typically indicates an expired or invalid access token.
 * HTTP Status: 401 Unauthorized
 */
export class XeroAuthenticationError extends XeroJournalError {
  constructor(
    message: string = 'Xero authentication failed. Token may be expired.',
    xeroError?: unknown,
  ) {
    super(message, xeroError, HttpStatus.UNAUTHORIZED);
    this.name = 'XeroAuthenticationError';
  }
}

/**
 * Error thrown when Xero request validation fails.
 * This includes invalid account codes, unbalanced journals, etc.
 * HTTP Status: 400 Bad Request
 */
export class XeroValidationError extends XeroJournalError {
  constructor(
    message: string,
    public readonly validationErrors?: unknown,
    xeroError?: unknown,
  ) {
    super(message, xeroError, HttpStatus.BAD_REQUEST);
    this.name = 'XeroValidationError';
    // Store validation errors in the response
    const response = this.getResponse() as Record<string, unknown>;
    if (response && typeof response === 'object') {
      response.error = {
        ...(response.error as Record<string, unknown>),
        code: 'XERO_VALIDATION_ERROR',
        validationErrors,
      };
    }
  }

  /**
   * Get specific validation errors from Xero
   */
  getValidationErrors(): unknown {
    return this.validationErrors;
  }
}

/**
 * Error thrown when Xero rate limit is exceeded.
 * Includes retry-after information when available.
 * HTTP Status: 429 Too Many Requests
 */
export class XeroRateLimitError extends XeroJournalError {
  constructor(
    public readonly retryAfterSeconds?: number,
    xeroError?: unknown,
  ) {
    const message = retryAfterSeconds
      ? `Xero rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`
      : 'Xero rate limit exceeded. Please try again later.';
    super(message, xeroError, HttpStatus.TOO_MANY_REQUESTS);
    this.name = 'XeroRateLimitError';

    // Update response with retry info
    const response = this.getResponse() as Record<string, unknown>;
    if (response && typeof response === 'object') {
      response.error = {
        ...(response.error as Record<string, unknown>),
        code: 'XERO_RATE_LIMIT',
        retryAfterSeconds,
      };
    }
  }

  /**
   * Get the number of seconds to wait before retrying
   */
  getRetryAfterSeconds(): number | undefined {
    return this.retryAfterSeconds;
  }
}

/**
 * Error thrown when Xero server returns a 5xx error.
 * These are typically transient and should be retried.
 * HTTP Status: 502 Bad Gateway
 */
export class XeroServerError extends XeroJournalError {
  constructor(
    message: string = 'Xero server error. Please try again.',
    xeroError?: unknown,
  ) {
    super(message, xeroError, HttpStatus.BAD_GATEWAY);
    this.name = 'XeroServerError';

    // Update response with specific code
    const response = this.getResponse() as Record<string, unknown>;
    if (response && typeof response === 'object') {
      response.error = {
        ...(response.error as Record<string, unknown>),
        code: 'XERO_SERVER_ERROR',
      };
    }
  }
}

/**
 * Error thrown when the Xero connection is not configured.
 * HTTP Status: 424 Failed Dependency
 */
export class XeroNotConnectedError extends XeroJournalError {
  constructor(
    message: string = 'Xero is not connected. Please connect to Xero first.',
  ) {
    super(message, undefined, HttpStatus.FAILED_DEPENDENCY);
    this.name = 'XeroNotConnectedError';

    // Update response with specific code
    const response = this.getResponse() as Record<string, unknown>;
    if (response && typeof response === 'object') {
      response.error = {
        ...(response.error as Record<string, unknown>),
        code: 'XERO_NOT_CONNECTED',
      };
    }
  }
}

/**
 * Error thrown when journal lines don't balance (debits != credits)
 * HTTP Status: 422 Unprocessable Entity
 */
export class XeroJournalUnbalancedError extends XeroValidationError {
  constructor(
    public readonly totalDebitsCents: number,
    public readonly totalCreditsCents: number,
  ) {
    const diffCents = Math.abs(totalDebitsCents - totalCreditsCents);
    const message = `Journal is unbalanced. Debits: ${totalDebitsCents} cents, Credits: ${totalCreditsCents} cents. Difference: ${diffCents} cents.`;
    super(message, {
      totalDebitsCents,
      totalCreditsCents,
      differenceCents: diffCents,
    });
    this.name = 'XeroJournalUnbalancedError';
  }
}

/**
 * Error thrown when an account code is invalid or not found in Xero
 * HTTP Status: 400 Bad Request
 */
export class XeroInvalidAccountCodeError extends XeroValidationError {
  constructor(
    public readonly accountCode: string,
    message?: string,
  ) {
    super(message || `Invalid or inactive account code: ${accountCode}`, {
      accountCode,
    });
    this.name = 'XeroInvalidAccountCodeError';
  }
}

/**
 * Error thrown when maximum retry attempts are exhausted
 * HTTP Status: 504 Gateway Timeout
 */
export class XeroMaxRetriesExceededError extends XeroJournalError {
  constructor(
    public readonly attempts: number,
    public readonly lastError?: Error,
  ) {
    super(
      `Maximum retry attempts (${attempts}) exceeded for Xero API call`,
      { attempts, lastErrorMessage: lastError?.message },
      HttpStatus.GATEWAY_TIMEOUT,
    );
    this.name = 'XeroMaxRetriesExceededError';

    // Update response with specific code
    const response = this.getResponse() as Record<string, unknown>;
    if (response && typeof response === 'object') {
      response.error = {
        ...(response.error as Record<string, unknown>),
        code: 'XERO_MAX_RETRIES',
        attempts,
      };
    }
  }
}

/**
 * Helper function to determine if an error is retryable
 */
export function isRetryableXeroError(error: unknown): boolean {
  if (error instanceof XeroRateLimitError) return true;
  if (error instanceof XeroServerError) return true;

  // Network errors are retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Helper function to extract retry-after from Xero error
 */
export function extractRetryAfter(error: unknown): number | undefined {
  if (error instanceof XeroRateLimitError) {
    return error.getRetryAfterSeconds();
  }

  // Check for Axios-style response
  const axiosError = error as {
    response?: {
      headers?: {
        'retry-after'?: string;
      };
    };
  };

  const retryAfterHeader = axiosError?.response?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const parsed = parseInt(retryAfterHeader, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
