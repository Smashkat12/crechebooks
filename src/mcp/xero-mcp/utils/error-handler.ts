/**
 * Xero MCP Error Handler
 * Centralized error handling with typed exceptions
 */

export class XeroMCPError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'XeroMCPError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    Error.captureStackTrace(this, XeroMCPError);
  }
}

export class TokenExpiredError extends XeroMCPError {
  constructor(tenantId: string) {
    super(`Token expired for tenant ${tenantId}`, 'TOKEN_EXPIRED', 401, {
      tenantId,
    });
    this.name = 'TokenExpiredError';
  }
}

export class TokenNotFoundError extends XeroMCPError {
  constructor(tenantId: string) {
    super(
      `No Xero connection found for tenant ${tenantId}`,
      'NO_CONNECTION',
      404,
      { tenantId },
    );
    this.name = 'TokenNotFoundError';
  }
}

export class RateLimitError extends XeroMCPError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded. Retry after ${retryAfterMs}ms`,
      'RATE_LIMITED',
      429,
      { retryAfterMs },
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class XeroAPIError extends XeroMCPError {
  constructor(message: string, statusCode: number, xeroErrorCode?: string) {
    super(message, xeroErrorCode ?? 'XERO_API_ERROR', statusCode, {
      xeroErrorCode,
    });
    this.name = 'XeroAPIError';
  }
}

export class EncryptionError extends XeroMCPError {
  constructor(operation: 'encrypt' | 'decrypt') {
    super(`Failed to ${operation} token data`, 'ENCRYPTION_ERROR', 500, {
      operation,
    });
    this.name = 'EncryptionError';
  }
}

/**
 * Handle errors from Xero API and convert to typed XeroMCPError
 */
export function handleXeroError(error: unknown): never {
  if (error instanceof XeroMCPError) {
    throw error;
  }

  if (error instanceof Error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const body = (error as { body?: { Message?: string } }).body;

    if (statusCode === 401) {
      throw new XeroAPIError('Unauthorized - invalid or expired token', 401);
    }

    if (statusCode === 403) {
      throw new XeroAPIError('Forbidden - insufficient permissions', 403);
    }

    if (statusCode === 404) {
      throw new XeroAPIError('Resource not found', 404);
    }

    if (statusCode === 429) {
      throw new RateLimitError(60000);
    }

    if (statusCode && statusCode >= 500) {
      throw new XeroAPIError('Xero API server error', statusCode);
    }

    throw new XeroMCPError(
      body?.Message ?? error.message,
      'XERO_API_ERROR',
      statusCode,
      { originalError: error.message },
    );
  }

  throw new XeroMCPError('Unknown error occurred', 'UNKNOWN_ERROR', 500, {
    originalError: String(error),
  });
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) {
    return true;
  }

  if (error instanceof XeroAPIError) {
    return error.statusCode !== undefined && error.statusCode >= 500;
  }

  return false;
}
