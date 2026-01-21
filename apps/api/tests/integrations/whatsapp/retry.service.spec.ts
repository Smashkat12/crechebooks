/**
 * WhatsAppRetryService Unit Tests
 * TASK-WA-006: WhatsApp Message Retry Service Tests
 *
 * Tests for the retry service with BullMQ integration.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { WhatsAppRetryService } from '../../../src/integrations/whatsapp/services/retry.service';
import { WhatsAppMessageEntity } from '../../../src/integrations/whatsapp/entities/whatsapp-message.entity';
import { WhatsAppRetryProcessor } from '../../../src/integrations/whatsapp/processors/whatsapp-retry.processor';
import { QUEUE_NAMES } from '../../../src/scheduler/types/scheduler.types';
import {
  WhatsAppContextType,
  WhatsAppMessageStatus,
} from '../../../src/integrations/whatsapp/types/message-history.types';

describe('WhatsAppRetryService', () => {
  let service: WhatsAppRetryService;
  let mockQueue: jest.Mocked<any>;
  let mockMessageEntity: jest.Mocked<WhatsAppMessageEntity>;

  beforeEach(async () => {
    // Create mock queue
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
      getJob: jest.fn(),
      getWaitingCount: jest.fn().mockResolvedValue(5),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(100),
      getFailedCount: jest.fn().mockResolvedValue(10),
      getDelayedCount: jest.fn().mockResolvedValue(3),
      getJobs: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      clean: jest.fn().mockResolvedValue([]),
    };

    // Create mock message entity
    mockMessageEntity = {
      findById: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      markAsSent: jest.fn(),
      markAsFailed: jest.fn(),
    } as unknown as jest.Mocked<WhatsAppMessageEntity>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppRetryService,
        {
          provide: getQueueToken(QUEUE_NAMES.WHATSAPP_RETRY),
          useValue: mockQueue,
        },
        { provide: WhatsAppMessageEntity, useValue: mockMessageEntity },
      ],
    }).compile();

    service = module.get<WhatsAppRetryService>(WhatsAppRetryService);
  });

  describe('scheduleRetry', () => {
    it('should schedule a retry job with default config', async () => {
      const jobId = await service.scheduleRetry(
        'msg-123',
        '+27821234567',
        'invoice_notification',
        [{ type: 'body', parameters: [] }],
        WhatsAppContextType.INVOICE,
        'inv-123',
      );

      expect(jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: 'msg-123',
          recipientPhone: '+27821234567',
          templateName: 'invoice_notification',
          contextType: WhatsAppContextType.INVOICE,
          contextId: 'inv-123',
          retryCount: 0,
          maxRetries: 5,
        }),
        expect.objectContaining({
          attempts: 5,
          backoff: expect.objectContaining({
            type: 'exponential',
          }),
        }),
      );
    });

    it('should respect custom retry config', async () => {
      await service.scheduleRetry(
        'msg-123',
        '+27821234567',
        'invoice_notification',
        [],
        WhatsAppContextType.INVOICE,
        undefined,
        { maxRetries: 3, priority: 1 },
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 3,
        }),
        expect.objectContaining({
          priority: 1,
          attempts: 3,
        }),
      );
    });
  });

  describe('scheduleRetryFromMessage', () => {
    it('should schedule retry from existing message', async () => {
      const mockMessage = {
        id: 'msg-123',
        recipientPhone: '+27821234567',
        templateName: 'invoice_notification',
        templateParams: { key: 'value' },
        contextType: WhatsAppContextType.INVOICE,
        contextId: 'inv-123',
      };

      mockMessageEntity.findById.mockResolvedValue(mockMessage as any);

      const jobId = await service.scheduleRetryFromMessage('msg-123');

      expect(mockMessageEntity.findById).toHaveBeenCalledWith('msg-123');
      expect(jobId).toBe('job-123');
    });

    it('should return null if message not found', async () => {
      mockMessageEntity.findById.mockResolvedValue(null);

      const jobId = await service.scheduleRetryFromMessage('nonexistent');

      expect(jobId).toBeNull();
    });
  });

  describe('cancelRetry', () => {
    it('should cancel a pending retry job', async () => {
      const mockJob = { remove: jest.fn().mockResolvedValue(undefined) };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.cancelRetry('job-123');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should return false if job not found', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.cancelRetry('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      const stats = await service.getStats();

      expect(stats).toEqual({
        pending: 5,
        active: 2,
        completed: 100,
        failed: 10,
        delayed: 3,
      });
    });
  });

  describe('getPendingRetries', () => {
    it('should return pending retries for a message', async () => {
      const mockJobs = [
        { data: { messageId: 'msg-123' } },
        { data: { messageId: 'msg-456' } },
        { data: { messageId: 'msg-123' } },
      ];
      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const retries = await service.getPendingRetries('msg-123');

      expect(retries).toHaveLength(2);
      expect(retries.every((j: any) => j.data.messageId === 'msg-123')).toBe(
        true,
      );
    });
  });

  describe('getFailedRetries', () => {
    it('should return failed retry jobs', async () => {
      const mockFailedJobs = [
        { id: '1', data: { messageId: 'msg-1' } },
        { id: '2', data: { messageId: 'msg-2' } },
      ];
      mockQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const failed = await service.getFailedRetries(10);

      expect(failed).toHaveLength(2);
      expect(mockQueue.getFailed).toHaveBeenCalledWith(0, 9);
    });
  });

  describe('retryAllFailed', () => {
    it('should retry all failed jobs', async () => {
      const mockFailedJobs = [
        { id: '1', retry: jest.fn().mockResolvedValue(undefined) },
        { id: '2', retry: jest.fn().mockResolvedValue(undefined) },
        { id: '3', retry: jest.fn().mockRejectedValue(new Error('fail')) },
      ];
      mockQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const count = await service.retryAllFailed();

      expect(count).toBe(2); // Only 2 succeeded
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
      expect(mockFailedJobs[2].retry).toHaveBeenCalled();
    });
  });

  describe('cleanCompletedJobs', () => {
    it('should clean completed jobs older than specified time', async () => {
      mockQueue.clean.mockResolvedValue(['job-1', 'job-2', 'job-3']);

      const count = await service.cleanCompletedJobs(86400000);

      expect(count).toBe(3);
      expect(mockQueue.clean).toHaveBeenCalledWith(86400000, 'completed');
    });
  });

  describe('isAvailable', () => {
    it('should return true when queue is available', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('getHealth', () => {
    it('should return health status with stats', async () => {
      const health = await service.getHealth();

      expect(health).toEqual({
        available: true,
        connected: true,
        stats: {
          pending: 5,
          active: 2,
          completed: 100,
          failed: 10,
          delayed: 3,
        },
      });
    });
  });
});

describe('WhatsAppRetryService without queue', () => {
  let service: WhatsAppRetryService;

  beforeEach(async () => {
    // Create service without queue (simulating Redis not configured)
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppRetryService,
        // No queue provided
      ],
    }).compile();

    service = module.get<WhatsAppRetryService>(WhatsAppRetryService);
  });

  it('should return false for isAvailable', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('should return null for scheduleRetry', async () => {
    const result = await service.scheduleRetry(
      'msg-123',
      '+27821234567',
      'template',
      [],
      WhatsAppContextType.INVOICE,
    );

    expect(result).toBeNull();
  });

  it('should return null for getStats', async () => {
    const stats = await service.getStats();
    expect(stats).toBeNull();
  });

  it('should return empty array for getPendingRetries', async () => {
    const retries = await service.getPendingRetries('msg-123');
    expect(retries).toEqual([]);
  });

  it('should return false for cancelRetry', async () => {
    const result = await service.cancelRetry('job-123');
    expect(result).toBe(false);
  });

  it('should return 0 for retryAllFailed', async () => {
    const count = await service.retryAllFailed();
    expect(count).toBe(0);
  });

  it('should return 0 for cleanCompletedJobs', async () => {
    const count = await service.cleanCompletedJobs();
    expect(count).toBe(0);
  });

  it('should indicate unavailable in health check', async () => {
    const health = await service.getHealth();

    expect(health).toEqual({
      available: false,
      connected: false,
      stats: null,
    });
  });
});

describe('WhatsAppRetryProcessor', () => {
  describe('calculateDelay', () => {
    it('should calculate exponential delay', () => {
      // Initial delay is 30 seconds
      expect(WhatsAppRetryProcessor.calculateDelay(0)).toBe(30000);
      // After 1 retry: 30 * 2 = 60 seconds
      expect(WhatsAppRetryProcessor.calculateDelay(1)).toBe(60000);
      // After 2 retries: 30 * 4 = 120 seconds
      expect(WhatsAppRetryProcessor.calculateDelay(2)).toBe(120000);
      // After 3 retries: 30 * 8 = 240 seconds
      expect(WhatsAppRetryProcessor.calculateDelay(3)).toBe(240000);
    });

    it('should cap delay at 1 hour', () => {
      // After many retries, should cap at 1 hour (3600000 ms)
      expect(WhatsAppRetryProcessor.calculateDelay(10)).toBe(3600000);
      expect(WhatsAppRetryProcessor.calculateDelay(20)).toBe(3600000);
    });
  });

  describe('getDefaultMaxRetries', () => {
    it('should return default max retries', () => {
      expect(WhatsAppRetryProcessor.getDefaultMaxRetries()).toBe(5);
    });
  });
});
