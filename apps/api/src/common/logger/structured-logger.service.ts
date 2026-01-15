/**
 * Structured Logger Service
 * TASK-INFRA-005: Pino-based structured JSON logging for production observability
 *
 * Features:
 * - JSON format in production for log aggregation
 * - Pretty printing in development for readability
 * - Automatic correlation ID injection
 * - Context-aware logging with tenant/user info
 * - Performance metrics tracking
 */

import { Injectable, LoggerService, Scope } from '@nestjs/common';
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import {
  getCorrelationId,
  getCorrelationStore,
  getRequestDuration,
} from './correlation-id.middleware';

/**
 * Log context interface for additional metadata
 */
export interface LogContext {
  /** Optional operation name for tracking */
  operation?: string;
  /** Optional entity type being operated on */
  entity?: string;
  /** Optional entity ID */
  entityId?: string;
  /** Optional duration in milliseconds */
  durationMs?: number;
  /** Any additional context */
  [key: string]: unknown;
}

/**
 * Structured Logger Service implementing NestJS LoggerService
 *
 * Provides consistent, structured logging across the application with:
 * - Automatic correlation ID injection from AsyncLocalStorage
 * - Context preservation for class-level logging
 * - JSON output in production, pretty output in development
 * - Request duration tracking
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLoggerService implements LoggerService {
  private logger: PinoLogger;
  private context?: string;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

    const options: LoggerOptions = {
      level: logLevel,
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          pid: bindings.pid,
          hostname: bindings.hostname,
        }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      base: {
        service: process.env.SERVICE_NAME || 'crechebooks-api',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      // Redact sensitive fields
      redact: {
        paths: [
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'authorization',
          'cookie',
          'secret',
          'apiKey',
          'api_key',
          'creditCard',
          'ssn',
        ],
        censor: '[REDACTED]',
      },
    };

    // Use pino-pretty transport in development for readable output
    if (!isProduction) {
      options.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      };
    }

    this.logger = pino(options);
  }

  /**
   * Set the logging context (typically the class name)
   * @param context - Context string, usually the class name
   */
  setContext(context: string): void {
    this.context = context;
  }

  /**
   * Build common log metadata including correlation context
   */
  private buildMetadata(extra?: LogContext): Record<string, unknown> {
    const store = getCorrelationStore();
    const metadata: Record<string, unknown> = {
      correlationId: store?.correlationId,
      context: this.context,
    };

    // Add tenant/user context if available
    if (store?.tenantId) {
      metadata.tenantId = store.tenantId;
    }
    if (store?.userId) {
      metadata.userId = store.userId;
    }

    // Merge extra context
    if (extra) {
      Object.assign(metadata, extra);
    }

    return metadata;
  }

  /**
   * Format message and extract context from optional params
   * Handles NestJS Logger compatibility
   */
  private formatMessage(
    message: unknown,
    optionalParams: unknown[],
  ): { msg: string; extra?: LogContext; contextOverride?: string } {
    let msg: string;
    let extra: LogContext | undefined;
    let contextOverride: string | undefined;

    // Handle message formatting
    if (typeof message === 'string') {
      msg = message;
    } else if (message instanceof Error) {
      msg = message.message;
      extra = { error: message.stack };
    } else {
      msg = JSON.stringify(message);
    }

    // Process optional params
    if (optionalParams.length > 0) {
      const lastParam = optionalParams[optionalParams.length - 1];

      // Check if last param is context string (NestJS pattern)
      if (typeof lastParam === 'string' && optionalParams.length <= 2) {
        contextOverride = lastParam;
        optionalParams = optionalParams.slice(0, -1);
      }

      // Handle remaining params
      if (optionalParams.length === 1) {
        const param = optionalParams[0];
        if (param instanceof Error) {
          extra = {
            ...extra,
            error: param.message,
            stack: param.stack,
            errorName: param.name,
          };
        } else if (typeof param === 'object' && param !== null) {
          extra = { ...extra, ...(param as LogContext) };
        }
      } else if (optionalParams.length > 1) {
        extra = { ...extra, params: optionalParams };
      }
    }

    return { msg, extra, contextOverride };
  }

  /**
   * Log an info-level message
   */
  log(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, extra, contextOverride } = this.formatMessage(
      message,
      optionalParams,
    );
    const originalContext = this.context;
    if (contextOverride) {
      this.context = contextOverride;
    }
    this.logger.info(this.buildMetadata(extra), msg);
    this.context = originalContext;
  }

  /**
   * Log an error-level message
   */
  error(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, extra, contextOverride } = this.formatMessage(
      message,
      optionalParams,
    );
    const originalContext = this.context;
    if (contextOverride) {
      this.context = contextOverride;
    }

    // Enhance with request duration for error tracking
    const duration = getRequestDuration();
    const errorMeta = {
      ...extra,
      durationMs: duration,
    };

    this.logger.error(this.buildMetadata(errorMeta), msg);
    this.context = originalContext;
  }

  /**
   * Log a warning-level message
   */
  warn(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, extra, contextOverride } = this.formatMessage(
      message,
      optionalParams,
    );
    const originalContext = this.context;
    if (contextOverride) {
      this.context = contextOverride;
    }
    this.logger.warn(this.buildMetadata(extra), msg);
    this.context = originalContext;
  }

  /**
   * Log a debug-level message
   */
  debug(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, extra, contextOverride } = this.formatMessage(
      message,
      optionalParams,
    );
    const originalContext = this.context;
    if (contextOverride) {
      this.context = contextOverride;
    }
    this.logger.debug(this.buildMetadata(extra), msg);
    this.context = originalContext;
  }

  /**
   * Log a verbose/trace-level message
   */
  verbose(message: unknown, ...optionalParams: unknown[]): void {
    const { msg, extra, contextOverride } = this.formatMessage(
      message,
      optionalParams,
    );
    const originalContext = this.context;
    if (contextOverride) {
      this.context = contextOverride;
    }
    this.logger.trace(this.buildMetadata(extra), msg);
    this.context = originalContext;
  }

  /**
   * Log a fatal-level message (not in NestJS LoggerService but useful)
   */
  fatal(message: unknown, context?: LogContext): void {
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    this.logger.fatal(this.buildMetadata(context), msg);
  }

  /**
   * Create a child logger with additional context
   * Useful for request-scoped or operation-scoped logging
   */
  child(bindings: Record<string, unknown>): StructuredLoggerService {
    const childLogger = new StructuredLoggerService();
    childLogger.logger = this.logger.child(bindings);
    childLogger.context = this.context;
    return childLogger;
  }

  /**
   * Log HTTP request completion with timing
   */
  logRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    extra?: LogContext,
  ): void {
    const level =
      statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const metadata = this.buildMetadata({
      ...extra,
      method,
      path,
      statusCode,
      durationMs,
    });

    this.logger[level](
      metadata,
      `${method} ${path} ${statusCode} - ${durationMs}ms`,
    );
  }

  /**
   * Get the underlying Pino logger for advanced usage
   */
  getPinoLogger(): PinoLogger {
    return this.logger;
  }
}
