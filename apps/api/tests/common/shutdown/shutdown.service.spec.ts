/**
 * Shutdown Service Tests
 * TASK-INFRA-007: Implement Bull Queue Graceful Shutdown
 *
 * Tests graceful shutdown of Bull queues:
 * - Queues are paused during shutdown
 * - Active jobs are waited for
 * - Timeout forces shutdown
 * - shuttingDown flag behavior
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import type { Queue, JobCounts } from 'bull';
import { ShutdownService } from '../../../src/common/shutdown/shutdown.service';
import { StructuredLoggerService } from '../../../src/common/logger';
import { QUEUE_NAMES } from '../../../src/scheduler/types/scheduler.types';
import { SIMPLEPAY_SYNC_QUEUE } from '../../../src/integrations/simplepay/simplepay-sync.processor';

// Mock queue factory
const createMockQueue = (
  name: string,
  activeJobs = 0,
): {
  queue: jest.Mocked<Queue>;
  getJobCountsMock: jest.Mock<Promise<JobCounts>>;
} => {
  const getJobCountsMock = jest.fn<Promise<JobCounts>, []>().mockResolvedValue({
    waiting: 0,
    active: activeJobs,
    completed: 0,
    failed: 0,
    delayed: 0,
  });

  const queue = {
    name,
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    getJobCounts: getJobCountsMock,
  } as unknown as jest.Mocked<Queue>;

  return { queue, getJobCountsMock };
};

// Mock logger
const createMockLogger = (): jest.Mocked<StructuredLoggerService> => {
  return {
    setContext: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
    logRequest: jest.fn(),
    getPinoLogger: jest.fn(),
  } as unknown as jest.Mocked<StructuredLoggerService>;
};

describe('ShutdownService', () => {
  let service: ShutdownService;
  let mockLogger: jest.Mocked<StructuredLoggerService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockQueues: Map<string, ReturnType<typeof createMockQueue>>;

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

    mockQueues = new Map([
      [QUEUE_NAMES.INVOICE_GENERATION, createMockQueue('invoice-generation')],
      [QUEUE_NAMES.PAYMENT_REMINDER, createMockQueue('payment-reminder')],
      [QUEUE_NAMES.SARS_DEADLINE, createMockQueue('sars-deadline')],
      [QUEUE_NAMES.BANK_SYNC, createMockQueue('bank-sync')],
      [
        QUEUE_NAMES.STATEMENT_GENERATION,
        createMockQueue('statement-generation'),
      ],
      [SIMPLEPAY_SYNC_QUEUE, createMockQueue('simplepay-sync')],
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: StructuredLoggerService,
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
          useValue: mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!.queue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.PAYMENT_REMINDER),
          useValue: mockQueues.get(QUEUE_NAMES.PAYMENT_REMINDER)!.queue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.SARS_DEADLINE),
          useValue: mockQueues.get(QUEUE_NAMES.SARS_DEADLINE)!.queue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.BANK_SYNC),
          useValue: mockQueues.get(QUEUE_NAMES.BANK_SYNC)!.queue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.STATEMENT_GENERATION),
          useValue: mockQueues.get(QUEUE_NAMES.STATEMENT_GENERATION)!.queue,
        },
        {
          provide: getQueueToken(SIMPLEPAY_SYNC_QUEUE),
          useValue: mockQueues.get(SIMPLEPAY_SYNC_QUEUE)!.queue,
        },
        ShutdownService,
      ],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isShuttingDown', () => {
    it('should return false initially', () => {
      expect(service.isShuttingDown).toBe(false);
    });

    it('should return true after onApplicationShutdown is called', async () => {
      expect(service.isShuttingDown).toBe(false);

      await service.onApplicationShutdown('SIGTERM');

      expect(service.isShuttingDown).toBe(true);
    });
  });

  describe('onApplicationShutdown', () => {
    it('should pause all queues during shutdown', async () => {
      await service.onApplicationShutdown('SIGTERM');

      for (const [, { queue }] of mockQueues) {
        expect(queue.pause).toHaveBeenCalledWith(true);
      }
    });

    it('should close all queue connections', async () => {
      await service.onApplicationShutdown('SIGTERM');

      for (const [, { queue }] of mockQueues) {
        expect(queue.close).toHaveBeenCalled();
      }
    });

    it('should log shutdown initiation with signal', async () => {
      await service.onApplicationShutdown('SIGTERM');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown initiated',
        expect.objectContaining({
          signal: 'SIGTERM',
          queueCount: 6,
        }),
      );
    });

    it('should log shutdown completion', async () => {
      await service.onApplicationShutdown('SIGINT');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.objectContaining({
          durationMs: expect.any(Number),
          queueCount: 6,
        }),
      );
    });

    it('should handle SIGINT signal', async () => {
      await service.onApplicationShutdown('SIGINT');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown initiated',
        expect.objectContaining({
          signal: 'SIGINT',
        }),
      );
    });

    it('should handle undefined signal', async () => {
      await service.onApplicationShutdown(undefined);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown initiated',
        expect.objectContaining({
          signal: undefined,
        }),
      );
    });
  });

  describe('waiting for active jobs', () => {
    it('should wait for active jobs to complete', async () => {
      // Start with 2 active jobs, then 1, then 0
      const invoiceQueue = mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!;
      invoiceQueue.getJobCountsMock
        .mockResolvedValueOnce({
          waiting: 0,
          active: 2,
          completed: 0,
          failed: 0,
          delayed: 0,
        })
        .mockResolvedValueOnce({
          waiting: 0,
          active: 1,
          completed: 1,
          failed: 0,
          delayed: 0,
        })
        .mockResolvedValue({
          waiting: 0,
          active: 0,
          completed: 2,
          failed: 0,
          delayed: 0,
        });

      await service.onApplicationShutdown('SIGTERM');

      // Should have polled job counts multiple times
      expect(invoiceQueue.getJobCountsMock.mock.calls.length).toBeGreaterThan(
        1,
      );
      expect(mockLogger.log).toHaveBeenCalledWith('All active jobs completed');
    });

    it('should log when jobs complete successfully', async () => {
      await service.onApplicationShutdown('SIGTERM');

      expect(mockLogger.log).toHaveBeenCalledWith('All active jobs completed');
    });
  });

  describe('timeout handling', () => {
    it('should use default timeout of 30000ms', () => {
      mockConfigService.get.mockReturnValue(undefined);

      // Re-create service to pick up default
      const newService = new ShutdownService(
        mockLogger,
        mockConfigService,
        mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!.queue,
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('ShutdownService initialized'),
        expect.objectContaining({
          shutdownTimeout: 30000,
        }),
      );
    });

    it('should use custom timeout from SHUTDOWN_TIMEOUT env var', async () => {
      mockConfigService.get.mockReturnValue(5000);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: StructuredLoggerService,
            useValue: mockLogger,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
            useValue: mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!.queue,
          },
          ShutdownService,
        ],
      }).compile();

      const serviceWithCustomTimeout =
        module.get<ShutdownService>(ShutdownService);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('ShutdownService initialized'),
        expect.objectContaining({
          shutdownTimeout: 5000,
        }),
      );
    });

    it('should warn when timeout is reached with active jobs remaining', async () => {
      // Use very short timeout
      mockConfigService.get.mockReturnValue(100);

      // Always return active jobs
      const invoiceQueue = mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!;
      invoiceQueue.getJobCountsMock.mockResolvedValue({
        waiting: 0,
        active: 5,
        completed: 0,
        failed: 0,
        delayed: 0,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: StructuredLoggerService,
            useValue: mockLogger,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
            useValue: invoiceQueue.queue,
          },
          ShutdownService,
        ],
      }).compile();

      const serviceWithShortTimeout =
        module.get<ShutdownService>(ShutdownService);
      await serviceWithShortTimeout.onApplicationShutdown('SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Shutdown timeout reached with 5 active jobs remaining',
        ),
        expect.objectContaining({
          timeout: 100,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle queue pause errors gracefully', async () => {
      const invoiceQueue = mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!;
      invoiceQueue.queue.pause.mockRejectedValue(
        new Error('Redis connection lost'),
      );

      await service.onApplicationShutdown('SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to pause queue'),
        expect.objectContaining({
          error: 'Redis connection lost',
        }),
      );

      // Should still continue with shutdown
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.any(Object),
      );
    });

    it('should handle queue close errors gracefully', async () => {
      const invoiceQueue = mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!;
      invoiceQueue.queue.close.mockRejectedValue(
        new Error('Connection already closed'),
      );

      await service.onApplicationShutdown('SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to close queue connection'),
        expect.objectContaining({
          error: 'Connection already closed',
        }),
      );

      // Should still complete shutdown
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.any(Object),
      );
    });

    it('should handle getJobCounts errors gracefully', async () => {
      const invoiceQueue = mockQueues.get(QUEUE_NAMES.INVOICE_GENERATION)!;
      invoiceQueue.getJobCountsMock.mockRejectedValue(
        new Error('Redis timeout'),
      );

      await service.onApplicationShutdown('SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get job counts'),
        expect.objectContaining({
          error: 'Redis timeout',
        }),
      );

      // Should still complete shutdown
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.any(Object),
      );
    });

    it('should not re-throw errors during shutdown', async () => {
      // All queues fail
      for (const [, { queue }] of mockQueues) {
        queue.pause.mockRejectedValue(new Error('Connection lost'));
        queue.close.mockRejectedValue(new Error('Already closed'));
      }

      // Should not throw
      await expect(
        service.onApplicationShutdown('SIGTERM'),
      ).resolves.toBeUndefined();
    });
  });

  describe('no queues configured', () => {
    it('should handle gracefully when no queues are available', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: StructuredLoggerService,
            useValue: mockLogger,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          ShutdownService,
        ],
      }).compile();

      const serviceWithNoQueues = module.get<ShutdownService>(ShutdownService);

      await serviceWithNoQueues.onApplicationShutdown('SIGTERM');

      expect(mockLogger.log).toHaveBeenCalledWith(
        'No queues to shut down, skipping graceful shutdown',
      );
    });
  });

  describe('partial queue configuration', () => {
    it('should work with only some queues configured', async () => {
      const invoiceQueue = createMockQueue('invoice-generation');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: StructuredLoggerService,
            useValue: mockLogger,
          },
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
            useValue: invoiceQueue.queue,
          },
          ShutdownService,
        ],
      }).compile();

      const serviceWithOneQueue = module.get<ShutdownService>(ShutdownService);

      await serviceWithOneQueue.onApplicationShutdown('SIGTERM');

      expect(invoiceQueue.queue.pause).toHaveBeenCalledWith(true);
      expect(invoiceQueue.queue.close).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Graceful shutdown completed',
        expect.objectContaining({
          queueCount: 1,
        }),
      );
    });
  });
});

describe('ShutdownService integration with Health Controller', () => {
  it('should be injectable into health controller context', async () => {
    const mockLogger = createMockLogger();
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: StructuredLoggerService,
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        ShutdownService,
      ],
    }).compile();

    const service = module.get<ShutdownService>(ShutdownService);

    // Before shutdown
    expect(service.isShuttingDown).toBe(false);

    // After shutdown
    await service.onApplicationShutdown('SIGTERM');
    expect(service.isShuttingDown).toBe(true);
  });
});
