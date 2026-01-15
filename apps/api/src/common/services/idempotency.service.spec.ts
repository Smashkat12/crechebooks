/**
 * Idempotency Service Tests
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdempotencyService } from './idempotency.service';

// Create a mock Redis instance that we can control
const mockRedisInstance = {
  set: jest.fn(),
  get: jest.fn(),
  exists: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

// Mock ioredis module
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockRedisInstance.set.mockReset();
    mockRedisInstance.get.mockReset();
    mockRedisInstance.exists.mockReset();
    mockRedisInstance.del.mockReset();
    mockRedisInstance.ttl.mockReset();
    mockRedisInstance.on.mockReset();
    mockRedisInstance.once.mockReset();
    mockRedisInstance.quit.mockResolvedValue('OK');

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          REDIS_URL: 'redis://localhost:6379',
          IDEMPOTENCY_TTL: 86400,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);

    // Simulate Redis ready event
    const onCalls = mockRedisInstance.on.mock.calls;
    const readyHandler = onCalls.find(
      (call: unknown[]) => call[0] === 'ready',
    )?.[1] as (() => void) | undefined;
    if (readyHandler) {
      readyHandler();
    }
  });

  afterEach(async () => {
    // Clean up
    if (service) {
      await service.onModuleDestroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with Redis when REDIS_URL is configured', async () => {
      // Need to call onModuleInit to trigger Redis connection
      await service.onModuleInit();

      // After initialization with valid config, redis instance should be set
      expect((service as unknown as { redis: unknown }).redis).toBeDefined();
    });

    it('should handle missing Redis configuration gracefully', async () => {
      jest.clearAllMocks();

      const noRedisConfig = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'REDIS_URL' || key === 'REDIS_HOST') {
            return undefined;
          }
          return defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IdempotencyService,
          { provide: ConfigService, useValue: noRedisConfig },
        ],
      }).compile();

      const noRedisService = module.get<IdempotencyService>(IdempotencyService);
      await noRedisService.onModuleInit();

      // Should not throw, should gracefully disable
      expect(noRedisService.isAvailable()).toBe(false);
    });
  });

  describe('checkAndSet', () => {
    beforeEach(() => {
      // Ensure service is connected
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return true for new requests', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await service.checkAndSet('test-key');

      expect(result).toBe(true);
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'idempotency:test-key',
        expect.any(String),
        'EX',
        86400,
        'NX',
      );
    });

    it('should return false for duplicate requests', async () => {
      mockRedisInstance.set.mockResolvedValue(null); // NX returns null if key exists

      const result = await service.checkAndSet('duplicate-key');

      expect(result).toBe(false);
    });

    it('should use custom TTL when provided', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await service.checkAndSet('test-key', 3600);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'idempotency:test-key',
        expect.any(String),
        'EX',
        3600,
        'NX',
      );
    });

    it('should return true when Redis is unavailable (graceful degradation)', async () => {
      (service as unknown as { redis: unknown }).redis = null;
      (service as unknown as { isConnected: boolean }).isConnected = false;

      const result = await service.checkAndSet('test-key');

      expect(result).toBe(true);
    });

    it('should return true on Redis error (graceful degradation)', async () => {
      mockRedisInstance.set.mockRejectedValue(
        new Error('Redis connection lost'),
      );

      const result = await service.checkAndSet('test-key');

      expect(result).toBe(true);
    });
  });

  describe('isProcessed', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return true if key exists', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);

      const result = await service.isProcessed('existing-key');

      expect(result).toBe(true);
      expect(mockRedisInstance.exists).toHaveBeenCalledWith(
        'idempotency:existing-key',
      );
    });

    it('should return false if key does not exist', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);

      const result = await service.isProcessed('new-key');

      expect(result).toBe(false);
    });

    it('should return false when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      const result = await service.isProcessed('test-key');

      expect(result).toBe(false);
    });
  });

  describe('markProcessed', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should store result with TTL', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await service.markProcessed('test-key', { processed: true }, 3600);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'idempotency:test-key',
        expect.stringContaining('"result":{"processed":true}'),
        'EX',
        3600,
      );
    });

    it('should store metadata when provided', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await service.markProcessed('test-key', { count: 5 }, undefined, {
        source: 'webhook',
      });

      const callArgs = mockRedisInstance.set.mock.calls[0];
      const storedData = JSON.parse(callArgs[1] as string);
      expect(storedData.metadata).toEqual({ source: 'webhook' });
    });

    it('should not throw when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      await expect(
        service.markProcessed('test-key', { data: true }),
      ).resolves.not.toThrow();
    });
  });

  describe('getStoredResult', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return stored result', async () => {
      const storedEntry = {
        processedAt: '2024-01-15T10:00:00Z',
        result: { status: 'success', count: 5 },
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(storedEntry));

      const result = await service.getStoredResult('test-key');

      expect(result).toEqual({ status: 'success', count: 5 });
    });

    it('should return null if no result stored', async () => {
      const storedEntry = {
        processedAt: '2024-01-15T10:00:00Z',
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(storedEntry));

      const result = await service.getStoredResult('test-key');

      expect(result).toBeNull();
    });

    it('should return null if key does not exist', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await service.getStoredResult('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null on parse error', async () => {
      mockRedisInstance.get.mockResolvedValue('invalid-json');

      const result = await service.getStoredResult('test-key');

      expect(result).toBeNull();
    });

    it('should return null when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      const result = await service.getStoredResult('test-key');

      expect(result).toBeNull();
    });
  });

  describe('check', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return full idempotency result for existing key', async () => {
      const storedEntry = {
        processedAt: '2024-01-15T10:00:00Z',
        result: { processed: true },
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(storedEntry));

      const result = await service.check('existing-key');

      expect(result).toEqual({
        isNew: false,
        storedResult: { processed: true },
        processedAt: '2024-01-15T10:00:00Z',
      });
    });

    it('should return isNew: true for new key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await service.check('new-key');

      expect(result).toEqual({ isNew: true });
    });

    it('should return isNew: true when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      const result = await service.check('test-key');

      expect(result).toEqual({ isNew: true });
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return true when key is deleted', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      const result = await service.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedisInstance.del).toHaveBeenCalledWith(
        'idempotency:test-key',
      );
    });

    it('should return false when key does not exist', async () => {
      mockRedisInstance.del.mockResolvedValue(0);

      const result = await service.delete('nonexistent-key');

      expect(result).toBe(false);
    });

    it('should return false when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      const result = await service.delete('test-key');

      expect(result).toBe(false);
    });
  });

  describe('getTTL', () => {
    beforeEach(() => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;
    });

    it('should return TTL for existing key', async () => {
      mockRedisInstance.ttl.mockResolvedValue(3600);

      const result = await service.getTTL('test-key');

      expect(result).toBe(3600);
    });

    it('should return -2 for nonexistent key', async () => {
      mockRedisInstance.ttl.mockResolvedValue(-2);

      const result = await service.getTTL('nonexistent-key');

      expect(result).toBe(-2);
    });

    it('should return -2 when Redis is unavailable', async () => {
      (service as unknown as { redis: unknown }).redis = null;

      const result = await service.getTTL('test-key');

      expect(result).toBe(-2);
    });
  });

  describe('generateKey', () => {
    it('should generate key with provider and eventId', () => {
      const key = IdempotencyService.generateKey('sendgrid', 'msg-123');

      expect(key).toBe('sendgrid:msg-123');
    });

    it('should generate key with provider, eventId, and eventType', () => {
      const key = IdempotencyService.generateKey(
        'sendgrid',
        'msg-123',
        'delivered',
      );

      expect(key).toBe('sendgrid:msg-123:delivered');
    });

    it('should handle empty eventType', () => {
      const key = IdempotencyService.generateKey('whatsapp', 'wa-456', '');

      // Empty string is falsy, so should not be included
      expect(key).toBe('whatsapp:wa-456');
    });
  });

  describe('isAvailable', () => {
    it('should return true when connected', () => {
      (service as unknown as { isConnected: boolean }).isConnected = true;
      (service as unknown as { redis: unknown }).redis = mockRedisInstance;

      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when not connected', () => {
      (service as unknown as { isConnected: boolean }).isConnected = false;

      expect(service.isAvailable()).toBe(false);
    });

    it('should return false when redis is null', () => {
      (service as unknown as { redis: unknown }).redis = null;

      expect(service.isAvailable()).toBe(false);
    });
  });
});
