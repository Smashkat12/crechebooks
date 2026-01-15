/**
 * Idempotency Guard Tests
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyService } from '../services/idempotency.service';
import {
  IDEMPOTENCY_KEY,
  IdempotencyOptions,
} from '../decorators/idempotent.decorator';

describe('IdempotencyGuard', () => {
  let guard: IdempotencyGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockIdempotencyService: jest.Mocked<IdempotencyService>;

  interface MockRequest {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    isDuplicate?: boolean;
    idempotencyKey?: string;
    idempotencyResult?: unknown;
  }

  const createMockExecutionContext = (
    request: MockRequest,
  ): ExecutionContext => {
    const mockRequest = {
      body: {},
      headers: {},
      ...request,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    mockReflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockIdempotencyService = {
      checkAndSet: jest.fn(),
      getStoredResult: jest.fn(),
      isProcessed: jest.fn(),
      markProcessed: jest.fn(),
      isAvailable: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    guard = module.get<IdempotencyGuard>(IdempotencyGuard);
  });

  describe('canActivate', () => {
    it('should return true when no @Idempotent decorator is present', async () => {
      mockReflector.get.mockReturnValue(undefined);

      const context = createMockExecutionContext({});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).not.toHaveBeenCalled();
    });

    it('should return true when no idempotency key is found', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);

      const context = createMockExecutionContext({
        headers: {},
        body: {},
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).not.toHaveBeenCalled();
    });

    it('should extract key from x-idempotency-key header by default', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'test-key-123' },
        body: {},
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'test-key-123',
        undefined,
      );
    });

    it('should use custom header name when specified', async () => {
      const options: IdempotencyOptions = { headerName: 'x-custom-key' };
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-custom-key': 'custom-123' },
        body: {},
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'custom-123',
        undefined,
      );
    });

    it('should extract key from body.idempotencyKey', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: {},
        body: { idempotencyKey: 'body-key-456' },
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'body-key-456',
        undefined,
      );
    });

    it('should use custom keyExtractor function', async () => {
      const options: IdempotencyOptions = {
        keyExtractor: (req) =>
          (req.body as { sg_message_id?: string })?.sg_message_id || null,
      };
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: {},
        body: { sg_message_id: 'sendgrid-msg-789' },
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'sendgrid-msg-789',
        undefined,
      );
    });

    it('should apply keyPrefix when specified', async () => {
      const options: IdempotencyOptions = {
        keyPrefix: 'webhook:',
      };
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'event-123' },
        body: {},
      });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'webhook:event-123',
        undefined,
      );
    });

    it('should use custom TTL when specified', async () => {
      const options: IdempotencyOptions = { ttl: 172800 }; // 48 hours
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'test-key' },
        body: {},
      });
      await guard.canActivate(context);

      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'test-key',
        172800,
      );
    });

    it('should mark request as duplicate when key exists', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(false); // Duplicate

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'duplicate-key' },
        body: {},
      });
      const result = await guard.canActivate(context);

      // Should always return true (let controller decide)
      expect(result).toBe(true);

      // Should mark as duplicate
      const modifiedRequest = context.switchToHttp().getRequest();
      expect(modifiedRequest.isDuplicate).toBe(true);
      expect(modifiedRequest.idempotencyKey).toBe('duplicate-key');
    });

    it('should retrieve cached result for duplicates when cacheResult is true', async () => {
      const options: IdempotencyOptions = { cacheResult: true };
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(false); // Duplicate
      mockIdempotencyService.getStoredResult.mockResolvedValue({
        processed: 5,
        skipped: 2,
      });

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'cached-key' },
        body: {},
      });
      await guard.canActivate(context);

      const modifiedRequest = context.switchToHttp().getRequest();
      expect(modifiedRequest.isDuplicate).toBe(true);
      expect(modifiedRequest.idempotencyResult).toEqual({
        processed: 5,
        skipped: 2,
      });
    });

    it('should not call getStoredResult when cacheResult is false', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(false); // Duplicate

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'no-cache-key' },
        body: {},
      });
      await guard.canActivate(context);

      expect(mockIdempotencyService.getStoredResult).not.toHaveBeenCalled();
    });

    it('should mark new requests correctly', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true); // New request

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'new-key' },
        body: {},
      });
      await guard.canActivate(context);

      const modifiedRequest = context.switchToHttp().getRequest();
      expect(modifiedRequest.isDuplicate).toBe(false);
      expect(modifiedRequest.idempotencyKey).toBe('new-key');
    });

    it('should handle keyExtractor errors gracefully', async () => {
      const options: IdempotencyOptions = {
        keyExtractor: () => {
          throw new Error('Extraction failed');
        },
      };
      mockReflector.get.mockReturnValue(options);

      const context = createMockExecutionContext({
        headers: {},
        body: {},
      });
      const result = await guard.canActivate(context);

      // Should return true and skip idempotency check
      expect(result).toBe(true);
      expect(mockIdempotencyService.checkAndSet).not.toHaveBeenCalled();
    });

    it('should prefer keyExtractor over headers', async () => {
      const options: IdempotencyOptions = {
        keyExtractor: () => 'extracted-key',
      };
      mockReflector.get.mockReturnValue(options);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'header-key' },
        body: { idempotencyKey: 'body-key' },
      });
      await guard.canActivate(context);

      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'extracted-key',
        undefined,
      );
    });

    it('should prefer header over body.idempotencyKey', async () => {
      mockReflector.get.mockReturnValue({} as IdempotencyOptions);
      mockIdempotencyService.checkAndSet.mockResolvedValue(true);

      const context = createMockExecutionContext({
        headers: { 'x-idempotency-key': 'header-key' },
        body: { idempotencyKey: 'body-key' },
      });
      await guard.canActivate(context);

      expect(mockIdempotencyService.checkAndSet).toHaveBeenCalledWith(
        'header-key',
        undefined,
      );
    });
  });
});
