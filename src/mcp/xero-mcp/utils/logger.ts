/**
 * MCP Server Logger
 * Structured logging for Xero MCP operations
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: Record<string, unknown>;
}

export class Logger {
  private readonly context: string;
  private readonly minLevel: LogLevel;

  private static readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context: string, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Log with full context for debugging
   */
  logWithContext(
    level: LogLevel,
    message: string,
    context: Record<string, unknown>,
  ): void {
    this.log(level, message, context);
  }

  /**
   * Log an error with stack trace
   */
  logError(error: Error, additionalData?: Record<string, unknown>): void {
    const data: Record<string, unknown> = {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...additionalData,
    };

    if ('code' in error) {
      data.code = (error as { code: string }).code;
    }

    if ('statusCode' in error) {
      data.statusCode = (error as { statusCode: number }).statusCode;
    }

    this.error(error.message, data);
  }

  /**
   * Log API call for audit trail
   */
  logAPICall(
    tool: string,
    tenantId: string,
    success: boolean,
    durationMs: number,
    error?: Error,
  ): void {
    const data: Record<string, unknown> = {
      tool,
      tenantId,
      success,
      durationMs,
    };

    if (error) {
      data.error = error.message;
      data.errorCode = (error as { code?: string }).code;
    }

    if (success) {
      this.info(`API call completed: ${tool}`, data);
    } else {
      this.error(`API call failed: ${tool}`, data);
    }
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (Logger.levelPriority[level] < Logger.levelPriority[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
    };

    // Sanitize sensitive data before logging
    const sanitizedEntry = this.sanitize(entry);

    const output = JSON.stringify(sanitizedEntry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'debug':
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Remove sensitive data from log entries
   */
  private sanitize(entry: LogEntry): LogEntry {
    if (!entry.data) {
      return entry;
    }

    const sensitiveKeys = [
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'password',
      'secret',
      'encryptedTokens',
      'TOKEN_ENCRYPTION_KEY',
    ];

    const sanitizedData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(entry.data)) {
      if (
        sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))
      ) {
        sanitizedData[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitizedData[key] = '[object]';
      } else {
        sanitizedData[key] = value;
      }
    }

    return { ...entry, data: sanitizedData };
  }
}
