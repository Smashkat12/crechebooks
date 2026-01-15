/**
 * Frontend Logger Utility
 * TASK-UI-006: Structured logging with environment-based filtering
 *
 * - debug: Only in development (NODE_ENV !== 'production')
 * - info/warn/error: Always logged
 * - JSON format for structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Check if a log level should be emitted based on environment
 */
const shouldLog = (level: LogLevel): boolean => {
  // In production, only log info and above
  if (process.env.NODE_ENV === 'production') {
    return level !== 'debug';
  }
  // In development/test, log everything
  return true;
};

/**
 * Format log entry as JSON for structured logging
 */
const formatLogEntry = (level: LogLevel, message: string, context?: LogContext): string => {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };
  return JSON.stringify(entry);
};

/**
 * Structured logger for frontend applications
 *
 * @example
 * // Debug logging (development only)
 * logger.debug('Processing request', { path: '/api/users' });
 *
 * // Info logging (all environments)
 * logger.info('User logged in', { userId: '123' });
 *
 * // Warning logging
 * logger.warn('Deprecated API called', { endpoint: '/v1/old' });
 *
 * // Error logging
 * logger.error('Failed to fetch data', { error: err.message });
 */
export const logger = {
  /**
   * Debug level - only logged in development
   * Use for detailed debugging information
   */
  debug: (message: string, context?: LogContext): void => {
    if (shouldLog('debug')) {
      console.debug(formatLogEntry('debug', message, context));
    }
  },

  /**
   * Info level - logged in all environments
   * Use for general operational information
   */
  info: (message: string, context?: LogContext): void => {
    if (shouldLog('info')) {
      console.info(formatLogEntry('info', message, context));
    }
  },

  /**
   * Warn level - logged in all environments
   * Use for warnings that don't prevent operation
   */
  warn: (message: string, context?: LogContext): void => {
    if (shouldLog('warn')) {
      console.warn(formatLogEntry('warn', message, context));
    }
  },

  /**
   * Error level - logged in all environments
   * Use for errors that affect operation
   */
  error: (message: string, context?: LogContext): void => {
    if (shouldLog('error')) {
      console.error(formatLogEntry('error', message, context));
    }
  },
};

export default logger;
