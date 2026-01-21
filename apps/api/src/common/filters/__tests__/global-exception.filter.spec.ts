/**
 * Global Exception Filter Tests
 * TASK-SEC-104: Error Handling Standardization
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  GlobalExceptionFilter,
  StandardErrorResponse,
} from '../global-exception.filter';
import { AppException } from '../../../shared/exceptions/base.exception';
import { ErrorCode } from '../../../shared/exceptions/error-codes';
import * as correlationIdModule from '../../logger/correlation-id.middleware';

// Mock correlation ID module
jest.mock('../../logger/correlation-id.middleware', () => ({
  getCorrelationId: jest.fn(),
}));

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let configService: ConfigService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };

  const mockRequest = {
    path: '/api/test',
    method: 'GET',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'user-agent': 'test-agent' },
  };

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (correlationIdModule.getCorrelationId as jest.Mock).mockReturnValue(
      'test-correlation-id',
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalExceptionFilter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'development';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Basic Exception Handling', () => {
    it('should handle HttpException with standard format', () => {
      const exception = new BadRequestException('Invalid input');

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalled();

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      // Status 400 maps to VALIDATION_ERROR in ERROR_CODE_STATUS_MAP
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Invalid input');
      expect(response.error.correlationId).toBe('test-correlation-id');
      expect(response.error.timestamp).toBeDefined();
      expect(response.error.path).toBe('/api/test');
    });

    it('should handle AppException with custom error code', () => {
      // AppException constructor: (message, code, statusCode, details)
      const exception = new AppException(
        'Email is invalid',
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        { field: 'email', constraint: 'isEmail' },
      );

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Email is invalid');
    });

    it('should handle generic Error with INTERNAL_ERROR code', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle unknown exceptions', () => {
      const exception = 'string error';

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('Correlation ID Handling', () => {
    it('should include correlation ID from middleware', () => {
      (correlationIdModule.getCorrelationId as jest.Mock).mockReturnValue(
        'custom-correlation-id',
      );

      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.correlationId).toBe('custom-correlation-id');
    });

    it('should generate fallback ID when none exists', () => {
      (correlationIdModule.getCorrelationId as jest.Mock).mockReturnValue(null);

      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.correlationId).toMatch(/^fallback-\d+-[a-z0-9]+$/);
    });

    it('should set correlation ID header in response', () => {
      filter.catch(new BadRequestException(), mockHost as any);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-correlation-id',
        'test-correlation-id',
      );
    });
  });

  describe('HTTP Status Code Mapping', () => {
    // Note: Status 400 maps to VALIDATION_ERROR in ERROR_CODE_STATUS_MAP (first match)
    const statusCases = [
      {
        exception: new BadRequestException(),
        expectedStatus: 400,
        expectedCode: 'VALIDATION_ERROR',
      },
      {
        exception: new UnauthorizedException(),
        expectedStatus: 401,
        expectedCode: 'UNAUTHORIZED',
      },
      {
        exception: new ForbiddenException(),
        expectedStatus: 403,
        expectedCode: 'FORBIDDEN',
      },
      {
        exception: new NotFoundException(),
        expectedStatus: 404,
        expectedCode: 'NOT_FOUND',
      },
      {
        exception: new InternalServerErrorException(),
        expectedStatus: 500,
        expectedCode: 'INTERNAL_ERROR',
      },
    ];

    statusCases.forEach(({ exception, expectedStatus, expectedCode }) => {
      it(`should map ${exception.constructor.name} to ${expectedStatus} with code ${expectedCode}`, () => {
        filter.catch(exception, mockHost as any);

        expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
        const response: StandardErrorResponse =
          mockResponse.json.mock.calls[0][0];
        expect(response.error.code).toBe(expectedCode);
      });
    });
  });

  describe('Environment-Aware Error Details', () => {
    it('should include stack trace in development', () => {
      const exception = new Error('Test error');

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.details).toBeDefined();
      expect((response.error.details as any).stack).toBeDefined();
    });

    it('should exclude stack trace in production', async () => {
      // Create filter with production config
      const productionModule = await Test.createTestingModule({
        providers: [
          GlobalExceptionFilter,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NODE_ENV') return 'production';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const productionFilter = productionModule.get<GlobalExceptionFilter>(
        GlobalExceptionFilter,
      );

      const exception = new Error('Test error');

      productionFilter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.details?.stack).toBeUndefined();
    });

    it('should use generic message for internal errors in production', async () => {
      const productionModule = await Test.createTestingModule({
        providers: [
          GlobalExceptionFilter,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NODE_ENV') return 'production';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const productionFilter = productionModule.get<GlobalExceptionFilter>(
        GlobalExceptionFilter,
      );
      const exception = new Error(
        'Database connection failed to postgres://user:pass@localhost',
      );

      productionFilter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      // In production, internal errors use the generic message from ERROR_CODE_MESSAGES
      expect(response.error.message).toBe('An internal server error occurred');
      expect(response.error.message).not.toContain('postgres');
    });
  });

  describe('Validation Error Formatting', () => {
    it('should include field-level validation details', () => {
      const exception = new BadRequestException({
        message: 'Validation failed',
        errors: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'age', message: 'Must be a positive number' },
        ],
      });

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.details).toBeDefined();
    });

    it('should handle class-validator style errors', () => {
      const exception = new BadRequestException({
        statusCode: 400,
        message: ['email must be an email', 'name should not be empty'],
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.message).toContain('email must be an email');
    });
  });

  describe('Sensitive Data Sanitization', () => {
    it('should sanitize email addresses in error messages', () => {
      const exception = new BadRequestException(
        'User test@example.com not found',
      );

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.message).not.toContain('test@example.com');
      // Sanitizer uses [EMAIL_REDACTED] format
      expect(response.error.message).toContain('[EMAIL_REDACTED]');
    });

    it('should sanitize South African ID numbers', () => {
      const exception = new BadRequestException('Invalid ID: 8501015800083');

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.message).not.toContain('8501015800083');
      // Sanitizer uses [ID_REDACTED] format
      expect(response.error.message).toContain('[ID_REDACTED]');
    });

    it('should sanitize API keys in error messages', () => {
      // Use a longer key that matches the pattern (20+ chars after prefix)
      const exception = new BadRequestException(
        'Invalid key: sk_live_abc123def456ghi789jkl012',
      );

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.message).not.toContain(
        'sk_live_abc123def456ghi789jkl012',
      );
      // Sanitizer uses [API_KEY_REDACTED] format
      expect(response.error.message).toContain('[API_KEY_REDACTED]');
    });

    it('should hide internal error details in development mode', () => {
      // In development, detailed error messages are shown but PII is still sanitized
      const exception = new BadRequestException(
        'User john@example.com with ID 8501015800083 failed',
      );

      filter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.message).not.toContain('john@example.com');
      expect(response.error.message).not.toContain('8501015800083');
    });
  });

  describe('Business Logic Exceptions', () => {
    it('should handle CONFLICT error for already paid invoice', () => {
      // AppException constructor: (message, code, statusCode, details)
      const exception = new AppException(
        'This invoice has already been paid',
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        { invoiceId: 'INV-001' },
      );

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('CONFLICT');
    });

    it('should handle BUSINESS_ERROR for insufficient funds', () => {
      // AppException constructor: (message, code, statusCode, details)
      const exception = new AppException(
        'Insufficient funds to complete this operation',
        ErrorCode.BUSINESS_ERROR,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('BUSINESS_ERROR');
    });
  });

  describe('External Service Errors', () => {
    it('should handle Xero sync errors', () => {
      // AppException constructor: (message, code, statusCode, details)
      const exception = new AppException(
        'Failed to sync with Xero',
        ErrorCode.XERO_ERROR,
        HttpStatus.BAD_GATEWAY,
        { xeroError: 'Token expired' },
      );

      filter.catch(exception, mockHost as any);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.code).toBe('XERO_ERROR');
    });

    it('should sanitize external service error details in production', async () => {
      const productionModule = await Test.createTestingModule({
        providers: [
          GlobalExceptionFilter,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'NODE_ENV') return 'production';
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      const productionFilter = productionModule.get<GlobalExceptionFilter>(
        GlobalExceptionFilter,
      );

      // AppException constructor: (message, code, statusCode, details)
      const exception = new AppException(
        'External API failed',
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        HttpStatus.BAD_GATEWAY,
        { apiKey: 'secret_key_12345', endpoint: 'https://api.example.com' },
      );

      productionFilter.catch(exception, mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      // In production, sensitive details should be sanitized or omitted
      if (response.error.details) {
        expect(JSON.stringify(response.error.details)).not.toContain(
          'secret_key',
        );
      }
    });
  });

  describe('Response Format Consistency', () => {
    it('should always include success: false', () => {
      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.success).toBe(false);
    });

    it('should always include error object with required fields', () => {
      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error).toBeDefined();
      expect(response.error.code).toBeDefined();
      expect(response.error.message).toBeDefined();
      expect(response.error.correlationId).toBeDefined();
      expect(response.error.timestamp).toBeDefined();
    });

    it('should include valid ISO timestamp', () => {
      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      const timestamp = new Date(response.error.timestamp);
      expect(timestamp.toISOString()).toBe(response.error.timestamp);
    });

    it('should include request path', () => {
      filter.catch(new BadRequestException(), mockHost as any);

      const response: StandardErrorResponse =
        mockResponse.json.mock.calls[0][0];
      expect(response.error.path).toBe('/api/test');
    });
  });

  describe('User Context in Logs', () => {
    it('should extract user and tenant info for logging', () => {
      const requestWithUser = {
        ...mockRequest,
        user: {
          id: 'user-123',
          tenantId: 'tenant-456',
        },
      };

      const hostWithUser = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => requestWithUser,
        }),
      };

      // Spy on logger
      const loggerSpy = jest
        .spyOn(filter['logger'], 'warn')
        .mockImplementation();

      filter.catch(new BadRequestException(), hostWithUser as any);

      expect(loggerSpy).toHaveBeenCalled();
      const logCall = loggerSpy.mock.calls[0];
      expect(logCall[1]).toContain('user-123');
      expect(logCall[1]).toContain('tenant-456');
    });
  });
});
