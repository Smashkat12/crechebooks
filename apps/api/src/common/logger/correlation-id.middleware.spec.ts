/**
 * Correlation ID Middleware Tests
 * TASK-INFRA-005: Tests for request correlation tracking
 */

import { Request, Response } from 'express';
import {
  CorrelationIdMiddleware,
  correlationStorage,
  getCorrelationId,
  getCorrelationStore,
  getRequestDuration,
  updateCorrelationStore,
  CORRELATION_ID_HEADER,
} from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  describe('use', () => {
    it('should generate a new correlation ID when not provided in headers', () => {
      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect((mockRequest as any).correlationId).toBeDefined();
      expect(typeof (mockRequest as any).correlationId).toBe('string');
      expect((mockRequest as any).correlationId.length).toBe(36); // UUID format
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        CORRELATION_ID_HEADER,
        (mockRequest as any).correlationId,
      );
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should use existing correlation ID from headers', () => {
      const existingCorrelationId = 'existing-correlation-id-123';
      mockRequest.headers = {
        [CORRELATION_ID_HEADER]: existingCorrelationId,
      };

      middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction,
      );

      expect((mockRequest as any).correlationId).toBe(existingCorrelationId);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        CORRELATION_ID_HEADER,
        existingCorrelationId,
      );
    });

    it('should make correlation ID available via AsyncLocalStorage', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        const store = correlationStorage.getStore();
        expect(store).toBeDefined();
        expect(store?.correlationId).toBe((mockRequest as any).correlationId);
        expect(store?.startTime).toBeDefined();
        expect(typeof store?.startTime).toBe('number');
        done();
      });
    });

    it('should track request start time', (done) => {
      const beforeTime = Date.now();

      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        const store = correlationStorage.getStore();
        const afterTime = Date.now();

        expect(store?.startTime).toBeGreaterThanOrEqual(beforeTime);
        expect(store?.startTime).toBeLessThanOrEqual(afterTime);
        done();
      });
    });
  });

  describe('getCorrelationId', () => {
    it('should return undefined when not in request context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return correlation ID when in request context', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        const correlationId = getCorrelationId();
        expect(correlationId).toBe((mockRequest as any).correlationId);
        done();
      });
    });
  });

  describe('getCorrelationStore', () => {
    it('should return undefined when not in request context', () => {
      expect(getCorrelationStore()).toBeUndefined();
    });

    it('should return full store when in request context', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        const store = getCorrelationStore();
        expect(store).toBeDefined();
        expect(store?.correlationId).toBeDefined();
        expect(store?.startTime).toBeDefined();
        done();
      });
    });
  });

  describe('getRequestDuration', () => {
    it('should return undefined when not in request context', () => {
      expect(getRequestDuration()).toBeUndefined();
    });

    it('should return duration in milliseconds when in request context', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        // Small delay to ensure measurable duration
        setTimeout(() => {
          const duration = getRequestDuration();
          expect(duration).toBeDefined();
          expect(typeof duration).toBe('number');
          expect(duration).toBeGreaterThanOrEqual(0);
          done();
        }, 5);
      });
    });
  });

  describe('updateCorrelationStore', () => {
    it('should do nothing when not in request context', () => {
      // Should not throw
      expect(() => {
        updateCorrelationStore({ tenantId: 'test-tenant' });
      }).not.toThrow();
    });

    it('should update store with additional context', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, () => {
        updateCorrelationStore({
          tenantId: 'test-tenant',
          userId: 'test-user',
        });

        const store = getCorrelationStore();
        expect(store?.tenantId).toBe('test-tenant');
        expect(store?.userId).toBe('test-user');
        // Original values should still be present
        expect(store?.correlationId).toBeDefined();
        expect(store?.startTime).toBeDefined();
        done();
      });
    });
  });
});
