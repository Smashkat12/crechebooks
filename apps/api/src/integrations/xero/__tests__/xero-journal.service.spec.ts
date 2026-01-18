/**
 * XeroJournalService Tests
 * TASK-STAFF-001: Implement Xero Journal Posting
 *
 * Unit tests for the Xero journal posting service.
 * Tests cover:
 * - Journal balance validation
 * - Payload construction
 * - API interaction with mocked HTTP responses
 * - Retry logic with exponential backoff
 * - Error mapping
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import {
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosHeaders,
} from 'axios';

import { XeroJournalService } from '../xero-journal.service';
import { CreateJournalDto, JournalLineDto } from '../dto/xero-journal.dto';
import {
  XeroAuthenticationError,
  XeroValidationError,
  XeroRateLimitError,
  XeroServerError,
  XeroJournalUnbalancedError,
  XeroMaxRetriesExceededError,
} from '../xero-journal.errors';
import { XeroRateLimiter } from '../xero-rate-limiter.service';

describe('XeroJournalService', () => {
  let service: XeroJournalService;
  let httpService: HttpService;
  let rateLimiter: XeroRateLimiter;

  const mockAccessToken = 'mock-access-token';
  const mockXeroTenantId = 'mock-xero-tenant-id';
  const mockTenantId = 'mock-internal-tenant-id';

  // Mock rate limiter that always allows requests
  const mockRateLimiter = {
    acquireSlot: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 59,
    }),
    getStatus: jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 60,
    }),
    reset: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };

  const createMockAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  const createMockAxiosError = (
    status: number,
    data?: unknown,
    headers?: Record<string, string>,
  ): AxiosError => {
    const error = new Error('Axios Error') as AxiosError;
    error.response = {
      status,
      statusText: 'Error',
      data,
      headers: headers ?? {},
      config: {
        headers: new AxiosHeaders(),
      } as InternalAxiosRequestConfig,
    };
    error.isAxiosError = true;
    return error;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroJournalService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: number) => {
                switch (key) {
                  case 'XERO_MAX_RETRIES':
                    return 2; // Use lower value for faster tests
                  case 'XERO_BASE_DELAY_MS':
                    return 10; // Very short delay for tests
                  case 'XERO_MAX_DELAY_MS':
                    return 100;
                  default:
                    return defaultValue;
                }
              }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
        {
          provide: XeroRateLimiter,
          useValue: mockRateLimiter,
        },
      ],
    }).compile();

    service = module.get<XeroJournalService>(XeroJournalService);
    httpService = module.get<HttpService>(HttpService);
    rateLimiter = module.get<XeroRateLimiter>(XeroRateLimiter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateJournalBalance', () => {
    it('should pass validation when debits equal credits', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 10000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).not.toThrow();
    });

    it('should pass validation with multiple lines that balance', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 5000, isDebit: true },
        { accountCode: '201', amountCents: 5000, isDebit: true },
        { accountCode: '400', amountCents: 7000, isDebit: false },
        { accountCode: '401', amountCents: 3000, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).not.toThrow();
    });

    it('should throw XeroJournalUnbalancedError when debits exceed credits', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 15000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).toThrow(
        XeroJournalUnbalancedError,
      );
    });

    it('should throw XeroJournalUnbalancedError when credits exceed debits', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 10000, isDebit: true },
        { accountCode: '400', amountCents: 15000, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).toThrow(
        XeroJournalUnbalancedError,
      );
    });

    it('should include totals in the unbalanced error', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 15000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ];

      try {
        service.validateJournalBalance(lines);
        fail('Should have thrown XeroJournalUnbalancedError');
      } catch (error) {
        expect(error).toBeInstanceOf(XeroJournalUnbalancedError);
        const unbalancedError = error as XeroJournalUnbalancedError;
        expect(unbalancedError.totalDebitsCents).toBe(15000);
        expect(unbalancedError.totalCreditsCents).toBe(10000);
      }
    });

    it('should handle zero amounts correctly', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 0, isDebit: true },
        { accountCode: '400', amountCents: 0, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).not.toThrow();
    });

    it('should handle large amounts without precision loss', () => {
      const lines: JournalLineDto[] = [
        { accountCode: '200', amountCents: 999999999999, isDebit: true },
        { accountCode: '400', amountCents: 999999999999, isDebit: false },
      ];

      expect(() => service.validateJournalBalance(lines)).not.toThrow();
    });
  });

  describe('createJournal', () => {
    const validJournal: CreateJournalDto = {
      date: '2024-01-15',
      narration: 'Test journal entry',
      lines: [
        { accountCode: '200', amountCents: 10000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ],
    };

    const mockXeroResponse = {
      ManualJournals: [
        {
          ManualJournalID: 'xero-journal-123',
          Narration: 'Test journal entry',
          Date: '2024-01-15T00:00:00',
          Status: 'POSTED',
          JournalLines: [
            {
              AccountCode: '200',
              Description: '',
              LineAmount: 100.0,
              TaxType: 'NONE',
            },
            {
              AccountCode: '400',
              Description: '',
              LineAmount: -100.0,
              TaxType: 'NONE',
            },
          ],
        },
      ],
    };

    it('should create a journal successfully', async () => {
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockXeroResponse)));

      const result = await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      expect(result.manualJournalId).toBe('xero-journal-123');
      expect(result.narration).toBe('Test journal entry');
      expect(result.status).toBe('POSTED');
      expect(result.totalDebitCents).toBe(10000);
      expect(result.totalCreditCents).toBe(10000);
    });

    it('should include correct headers in API request', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockXeroResponse)));

      await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      expect(postSpy).toHaveBeenCalledWith(
        expect.stringContaining('/ManualJournals'),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockAccessToken}`,
            'xero-tenant-id': mockXeroTenantId,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should convert cents to decimal amounts in payload', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockXeroResponse)));

      await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      const payload = postSpy.mock.calls[0][1] as {
        ManualJournals: Array<{
          JournalLines: Array<{ LineAmount: number }>;
        }>;
      };

      // First line is debit (positive)
      expect(payload.ManualJournals[0].JournalLines[0].LineAmount).toBe(100);
      // Second line is credit (negative)
      expect(payload.ManualJournals[0].JournalLines[1].LineAmount).toBe(-100);
    });

    it('should throw XeroJournalUnbalancedError for unbalanced journals', async () => {
      const unbalancedJournal: CreateJournalDto = {
        date: '2024-01-15',
        narration: 'Unbalanced',
        lines: [
          { accountCode: '200', amountCents: 15000, isDebit: true },
          { accountCode: '400', amountCents: 10000, isDebit: false },
        ],
      };

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          unbalancedJournal,
        ),
      ).rejects.toThrow(XeroJournalUnbalancedError);
    });

    it('should handle validation errors from Xero', async () => {
      const errorResponse = {
        ManualJournals: [
          {
            ManualJournalID: '',
            Narration: 'Test',
            Date: '2024-01-15',
            Status: 'DRAFT',
            ValidationErrors: [{ Message: 'Account code 999 is not valid' }],
          },
        ],
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(errorResponse)));

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroValidationError);
    });

    it('should throw XeroAuthenticationError on 401', async () => {
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(
          throwError(() =>
            createMockAxiosError(401, { Message: 'Unauthorized' }),
          ),
        );

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroAuthenticationError);
    });

    it('should throw XeroValidationError on 400', async () => {
      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() =>
          createMockAxiosError(400, {
            Message: 'Invalid data',
            Elements: [
              {
                ValidationErrors: [{ Message: 'Account code required' }],
              },
            ],
          }),
        ),
      );

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroValidationError);
    });

    it('should throw XeroMaxRetriesExceededError on persistent 429', async () => {
      // 429 is retryable, so after exhausting retries it throws XeroMaxRetriesExceededError
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(
          throwError(() =>
            createMockAxiosError(
              429,
              { Message: 'Rate limit' },
              { 'retry-after': '1' },
            ),
          ),
        );

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroMaxRetriesExceededError);
    });

    it('should throw XeroMaxRetriesExceededError on persistent 500', async () => {
      // 500 is retryable, so after exhausting retries it throws XeroMaxRetriesExceededError
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(
          throwError(() =>
            createMockAxiosError(500, { Message: 'Server error' }),
          ),
        );

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroMaxRetriesExceededError);
    });
  });

  describe('retry logic', () => {
    const validJournal: CreateJournalDto = {
      date: '2024-01-15',
      narration: 'Test journal',
      lines: [
        { accountCode: '200', amountCents: 10000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ],
    };

    const mockXeroResponse = {
      ManualJournals: [
        {
          ManualJournalID: 'xero-journal-123',
          Narration: 'Test journal',
          Date: '2024-01-15T00:00:00',
          Status: 'POSTED',
          JournalLines: [
            { AccountCode: '200', LineAmount: 100.0, TaxType: 'NONE' },
            { AccountCode: '400', LineAmount: -100.0, TaxType: 'NONE' },
          ],
        },
      ],
    };

    it('should retry on 500 error and succeed', async () => {
      const postSpy = jest.spyOn(httpService, 'post');

      // First call fails, second succeeds
      postSpy
        .mockReturnValueOnce(throwError(() => createMockAxiosError(500)))
        .mockReturnValueOnce(of(createMockAxiosResponse(mockXeroResponse)));

      const result = await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      expect(result.manualJournalId).toBe('xero-journal-123');
      expect(postSpy).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 rate limit and succeed', async () => {
      const postSpy = jest.spyOn(httpService, 'post');

      postSpy
        .mockReturnValueOnce(
          throwError(() =>
            createMockAxiosError(429, {}, { 'retry-after': '1' }),
          ),
        )
        .mockReturnValueOnce(of(createMockAxiosResponse(mockXeroResponse)));

      const result = await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      expect(result.manualJournalId).toBe('xero-journal-123');
      expect(postSpy).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 401 authentication error', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => createMockAxiosError(401)));

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroAuthenticationError);

      // Should only try once (no retries for auth errors)
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 400 validation error', async () => {
      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => createMockAxiosError(400)));

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroValidationError);

      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw XeroMaxRetriesExceededError after exhausting retries', async () => {
      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(throwError(() => createMockAxiosError(500)));

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroMaxRetriesExceededError);
    });
  });

  describe('voidJournal', () => {
    it('should void a journal successfully', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test journal',
            Date: '2024-01-15T00:00:00',
            Status: 'VOIDED',
          },
        ],
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      const result = await service.voidJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        'xero-journal-123',
      );

      expect(result.status).toBe('VOIDED');
      expect(result.manualJournalId).toBe('xero-journal-123');
    });
  });

  describe('getJournal', () => {
    it('should retrieve a journal successfully', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test journal',
            Date: '2024-01-15T00:00:00',
            Status: 'POSTED',
            JournalLines: [
              { AccountCode: '200', LineAmount: 100.0, TaxType: 'NONE' },
              { AccountCode: '400', LineAmount: -100.0, TaxType: 'NONE' },
            ],
          },
        ],
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      const result = await service.getJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        'xero-journal-123',
      );

      expect(result.manualJournalId).toBe('xero-journal-123');
      expect(result.status).toBe('POSTED');
      expect(result.totalDebitCents).toBe(10000);
      expect(result.totalCreditCents).toBe(10000);
    });
  });

  describe('payload construction', () => {
    const validJournal: CreateJournalDto = {
      date: '2024-01-15',
      narration: 'Test with options',
      lines: [
        {
          accountCode: '200',
          amountCents: 10000,
          isDebit: true,
          description: 'Sales revenue',
          taxType: 'OUTPUT',
          trackingCategoryName: 'Department',
          trackingOptionName: 'Sales',
        },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ],
      reference: 'REF-001',
      sourceUrl: 'https://app.example.com/invoice/123',
      showOnCashBasisReports: true,
    };

    it('should include all optional fields in payload', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test with options',
            Date: '2024-01-15T00:00:00',
            Status: 'POSTED',
            JournalLines: [
              { AccountCode: '200', LineAmount: 100.0, TaxType: 'OUTPUT' },
              { AccountCode: '400', LineAmount: -100.0, TaxType: 'NONE' },
            ],
          },
        ],
      };

      const postSpy = jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      const payload = postSpy.mock.calls[0][1] as {
        ManualJournals: Array<{
          Url?: string;
          ShowOnCashBasisReports?: boolean;
          JournalLines: Array<{
            Description?: string;
            TaxType?: string;
            Tracking?: Array<{ Name: string; Option: string }>;
          }>;
        }>;
      };

      expect(payload.ManualJournals[0].Url).toBe(
        'https://app.example.com/invoice/123',
      );
      expect(payload.ManualJournals[0].ShowOnCashBasisReports).toBe(true);
      expect(payload.ManualJournals[0].JournalLines[0].Description).toBe(
        'Sales revenue',
      );
      expect(payload.ManualJournals[0].JournalLines[0].TaxType).toBe('OUTPUT');
      expect(payload.ManualJournals[0].JournalLines[0].Tracking).toEqual([
        { Name: 'Department', Option: 'Sales' },
      ]);
    });
  });

  describe('rate limiting integration', () => {
    const validJournal: CreateJournalDto = {
      date: '2024-01-15',
      narration: 'Test journal',
      lines: [
        { accountCode: '200', amountCents: 10000, isDebit: true },
        { accountCode: '400', amountCents: 10000, isDebit: false },
      ],
    };

    it('should check rate limit before API call', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test journal',
            Date: '2024-01-15T00:00:00',
            Status: 'POSTED',
            JournalLines: [
              { AccountCode: '200', LineAmount: 100.0, TaxType: 'NONE' },
              { AccountCode: '400', LineAmount: -100.0, TaxType: 'NONE' },
            ],
          },
        ],
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      await service.createJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        validJournal,
      );

      expect(mockRateLimiter.acquireSlot).toHaveBeenCalledWith(mockTenantId);
    });

    it('should throw XeroRateLimitError when rate limit is exceeded', async () => {
      mockRateLimiter.acquireSlot.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfter: 30,
      });

      await expect(
        service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        ),
      ).rejects.toThrow(XeroRateLimitError);

      // HTTP call should not be made when rate limited
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should include retryAfter in rate limit error', async () => {
      mockRateLimiter.acquireSlot.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
        retryAfter: 45,
      });

      try {
        await service.createJournal(
          mockTenantId,
          mockAccessToken,
          mockXeroTenantId,
          validJournal,
        );
        fail('Should have thrown XeroRateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(XeroRateLimitError);
        const rateLimitError = error as XeroRateLimitError;
        expect(rateLimitError.getRetryAfterSeconds()).toBe(45);
      }
    });

    it('should check rate limit for voidJournal', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test journal',
            Date: '2024-01-15T00:00:00',
            Status: 'VOIDED',
          },
        ],
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      await service.voidJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        'xero-journal-123',
      );

      expect(mockRateLimiter.acquireSlot).toHaveBeenCalledWith(mockTenantId);
    });

    it('should check rate limit for getJournal', async () => {
      const mockResponse = {
        ManualJournals: [
          {
            ManualJournalID: 'xero-journal-123',
            Narration: 'Test journal',
            Date: '2024-01-15T00:00:00',
            Status: 'POSTED',
            JournalLines: [
              { AccountCode: '200', LineAmount: 100.0, TaxType: 'NONE' },
              { AccountCode: '400', LineAmount: -100.0, TaxType: 'NONE' },
            ],
          },
        ],
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of(createMockAxiosResponse(mockResponse)));

      await service.getJournal(
        mockTenantId,
        mockAccessToken,
        mockXeroTenantId,
        'xero-journal-123',
      );

      expect(mockRateLimiter.acquireSlot).toHaveBeenCalledWith(mockTenantId);
    });
  });
});
