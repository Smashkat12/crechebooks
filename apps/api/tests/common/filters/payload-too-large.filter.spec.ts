/**
 * Payload Too Large Filter Tests
 * TASK-INFRA-008: Request payload size limits
 */

import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { PayloadTooLargeFilter } from '../../../src/common/filters/payload-too-large.filter';
import { StructuredLoggerService } from '../../../src/common/logger';

describe('PayloadTooLargeFilter', () => {
  let filter: PayloadTooLargeFilter;
  let mockLogger: jest.Mocked<StructuredLoggerService>;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let mockRequest: {
    method: string;
    path: string;
    ip: string;
    headers: Record<string, string>;
  };

  const createMockArgumentsHost = (): ArgumentsHost => {
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<StructuredLoggerService>;

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      method: 'POST',
      path: '/api/v1/uploads',
      ip: '127.0.0.1',
      headers: {
        'content-type': 'application/json',
        'content-length': '15000000',
        'user-agent': 'TestClient/1.0',
      },
    };

    filter = new PayloadTooLargeFilter(mockLogger);
  });

  describe('catch', () => {
    it('should handle entity.too.large error type from body-parser', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
        length?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 10485760; // 10MB
      error.length = 15000000; // 15MB

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'PAYLOAD_TOO_LARGE',
            message: expect.stringContaining('10.0 MB'),
            details: expect.objectContaining({
              maxSize: '10.0 MB',
              actualSize: '14.3 MB',
            }),
          }),
        }),
      );
    });

    it('should handle statusCode 413 errors', () => {
      const error = new Error('Payload too large') as Error & {
        statusCode?: number;
      };
      error.statusCode = 413;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'PAYLOAD_TOO_LARGE',
          }),
        }),
      );
    });

    it('should handle status 413 errors', () => {
      const error = new Error('Payload too large') as Error & {
        status?: number;
      };
      error.status = 413;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    });

    it('should handle errors with "request entity too large" message', () => {
      const error = new Error('request entity too large');

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    });

    it('should handle errors with "payload too large" message', () => {
      const error = new Error('Payload Too Large');

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    });

    it('should re-throw non-payload-too-large errors', () => {
      const error = new Error('Some other error');

      const host = createMockArgumentsHost();

      expect(() => filter.catch(error, host)).toThrow('Some other error');
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should log oversized request with details', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
        length?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 10485760;
      error.length = 15000000;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Request payload too large',
        expect.objectContaining({
          operation: 'payload_size_exceeded',
          method: 'POST',
          path: '/api/v1/uploads',
          ip: '127.0.0.1',
          contentType: 'application/json',
          contentLength: '15000000',
          maxSize: '10.0 MB',
          actualSize: '14.3 MB',
        }),
      );
    });

    it('should include timestamp in response', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
      };
      error.type = 'entity.too.large';

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });

    it('should include path in response', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
      };
      error.type = 'entity.too.large';

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/v1/uploads',
        }),
      );
    });

    it('should include helpful suggestion in error details', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
      };
      error.type = 'entity.too.large';

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              suggestion: expect.stringContaining('compressing'),
            }),
          }),
        }),
      );
    });

    it('should include supported content types in error details', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
      };
      error.type = 'entity.too.large';

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              supportedContentTypes: expect.arrayContaining([
                'application/json',
                'application/x-www-form-urlencoded',
              ]),
            }),
          }),
        }),
      );
    });

    it('should format bytes correctly for KB range', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
        length?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 1024; // 1KB
      error.length = 2048; // 2KB

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              maxSize: '1.0 KB',
              actualSize: '2.0 KB',
            }),
          }),
        }),
      );
    });

    it('should format bytes correctly for byte range', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
        length?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 500;
      error.length = 600;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              maxSize: '500 bytes',
              actualSize: '600 bytes',
            }),
          }),
        }),
      );
    });

    it('should use BODY_LIMIT_JSON env var when limit is not in error', () => {
      const originalEnv = process.env.BODY_LIMIT_JSON;
      process.env.BODY_LIMIT_JSON = '5mb';

      const error = new Error('request entity too large') as Error & {
        type?: string;
      };
      error.type = 'entity.too.large';

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('5mb'),
          }),
        }),
      );

      process.env.BODY_LIMIT_JSON = originalEnv;
    });

    it('should handle error with expected property instead of length', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
        expected?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 10485760;
      error.expected = 20000000;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              actualSize: '19.1 MB',
            }),
          }),
        }),
      );
    });

    it('should set logger context on construction', () => {
      expect(mockLogger.setContext).toHaveBeenCalledWith(
        'PayloadTooLargeFilter',
      );
    });

    it('should not include actualSize when length is not provided', () => {
      const error = new Error('request entity too large') as Error & {
        type?: string;
        limit?: number;
      };
      error.type = 'entity.too.large';
      error.limit = 10485760;

      const host = createMockArgumentsHost();
      filter.catch(error, host);

      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.error.details.actualSize).toBeUndefined();
    });
  });
});
