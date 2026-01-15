/**
 * Logger Module Tests
 * TASK-INFRA-005: Tests for logger module configuration
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from './logger.module';
import { StructuredLoggerService } from './structured-logger.service';

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

describe('LoggerModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [LoggerModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide StructuredLoggerService', async () => {
    // Use resolve() for transient-scoped providers
    const loggerService = await module.resolve<StructuredLoggerService>(
      StructuredLoggerService,
    );
    expect(loggerService).toBeDefined();
    expect(loggerService).toBeInstanceOf(StructuredLoggerService);
  });

  it('should export StructuredLoggerService', async () => {
    // The service should be accessible from the module exports
    const loggerService = await module.resolve<StructuredLoggerService>(
      StructuredLoggerService,
    );
    expect(loggerService).toBeDefined();
  });

  describe('StructuredLoggerService usage', () => {
    it('should allow setting context', async () => {
      const loggerService = await module.resolve<StructuredLoggerService>(
        StructuredLoggerService,
      );
      expect(() => loggerService.setContext('TestContext')).not.toThrow();
    });

    it('should allow logging messages', async () => {
      const loggerService = await module.resolve<StructuredLoggerService>(
        StructuredLoggerService,
      );
      expect(() => loggerService.log('Test message')).not.toThrow();
    });
  });
});
