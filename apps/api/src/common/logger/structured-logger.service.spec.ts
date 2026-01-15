/**
 * Structured Logger Service Tests
 * TASK-INFRA-005: Tests for Pino-based structured logging
 */

import { StructuredLoggerService } from './structured-logger.service';
import {
  correlationStorage,
  CorrelationStore,
} from './correlation-id.middleware';

// Mock pino
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => mockLogger),
  };
  return jest.fn(() => mockLogger);
});

describe('StructuredLoggerService', () => {
  let logger: StructuredLoggerService;
  let mockPinoLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new StructuredLoggerService();
    mockPinoLogger = logger.getPinoLogger();
  });

  describe('constructor', () => {
    it('should create a logger instance', () => {
      expect(logger).toBeDefined();
      expect(mockPinoLogger).toBeDefined();
    });
  });

  describe('setContext', () => {
    it('should set the logging context', () => {
      logger.setContext('TestController');
      logger.log('test message');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'TestController' }),
        'test message',
      );
    });
  });

  describe('log', () => {
    it('should log info level messages', () => {
      logger.log('test message');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.any(Object),
        'test message',
      );
    });

    it('should include correlation ID when in request context', (done) => {
      const store: CorrelationStore = {
        correlationId: 'test-correlation-id',
        startTime: Date.now(),
      };

      correlationStorage.run(store, () => {
        logger.log('test message');

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({ correlationId: 'test-correlation-id' }),
          'test message',
        );
        done();
      });
    });

    it('should handle object messages', () => {
      logger.log({ key: 'value' });

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.any(Object),
        '{"key":"value"}',
      );
    });

    it('should handle additional context objects', () => {
      logger.log('test message', { extra: 'data' });

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ extra: 'data' }),
        'test message',
      );
    });

    it('should handle NestJS context string pattern', () => {
      logger.setContext('OriginalContext');
      logger.log('test message', 'OverrideContext');

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ context: 'OverrideContext' }),
        'test message',
      );
    });
  });

  describe('error', () => {
    it('should log error level messages', () => {
      logger.error('error message');

      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        expect.any(Object),
        'error message',
      );
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      logger.error('error occurred', error);

      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error',
          errorName: 'Error',
        }),
        'error occurred',
      );
    });

    it('should include request duration for error tracking', (done) => {
      const store: CorrelationStore = {
        correlationId: 'test-id',
        startTime: Date.now() - 100, // 100ms ago
      };

      correlationStorage.run(store, () => {
        logger.error('error message');

        expect(mockPinoLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            durationMs: expect.any(Number),
          }),
          'error message',
        );
        done();
      });
    });
  });

  describe('warn', () => {
    it('should log warn level messages', () => {
      logger.warn('warning message');

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        expect.any(Object),
        'warning message',
      );
    });
  });

  describe('debug', () => {
    it('should log debug level messages', () => {
      logger.debug('debug message');

      expect(mockPinoLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'debug message',
      );
    });
  });

  describe('verbose', () => {
    it('should log trace level messages', () => {
      logger.verbose('verbose message');

      expect(mockPinoLogger.trace).toHaveBeenCalledWith(
        expect.any(Object),
        'verbose message',
      );
    });
  });

  describe('fatal', () => {
    it('should log fatal level messages', () => {
      logger.fatal('fatal message');

      expect(mockPinoLogger.fatal).toHaveBeenCalledWith(
        expect.any(Object),
        'fatal message',
      );
    });

    it('should accept additional context', () => {
      logger.fatal('fatal message', { operation: 'critical-op' });

      expect(mockPinoLogger.fatal).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'critical-op' }),
        'fatal message',
      );
    });
  });

  describe('child', () => {
    it('should create a child logger with additional bindings', () => {
      const childLogger = logger.child({ requestId: 'req-123' });

      expect(childLogger).toBeInstanceOf(StructuredLoggerService);
      expect(mockPinoLogger.child).toHaveBeenCalledWith({
        requestId: 'req-123',
      });
    });
  });

  describe('logRequest', () => {
    it('should log successful requests at info level', () => {
      logger.logRequest('GET', '/api/users', 200, 50);

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/api/users',
          statusCode: 200,
          durationMs: 50,
        }),
        'GET /api/users 200 - 50ms',
      );
    });

    it('should log client errors at warn level', () => {
      logger.logRequest('POST', '/api/users', 400, 25);

      expect(mockPinoLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
        }),
        'POST /api/users 400 - 25ms',
      );
    });

    it('should log server errors at error level', () => {
      logger.logRequest('DELETE', '/api/users/1', 500, 100);

      expect(mockPinoLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        'DELETE /api/users/1 500 - 100ms',
      );
    });

    it('should include additional context', () => {
      logger.logRequest('GET', '/api/users', 200, 50, { userId: 'user-123' });

      expect(mockPinoLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        }),
        expect.any(String),
      );
    });
  });

  describe('tenant and user context', () => {
    it('should include tenant and user IDs from correlation store', (done) => {
      const store: CorrelationStore = {
        correlationId: 'test-id',
        startTime: Date.now(),
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      correlationStorage.run(store, () => {
        logger.log('test message');

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123',
            userId: 'user-456',
          }),
          'test message',
        );
        done();
      });
    });
  });
});
