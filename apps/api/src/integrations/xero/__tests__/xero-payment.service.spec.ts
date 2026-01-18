/**
 * XeroPaymentService Tests
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Unit tests for the Xero payment sync service.
 * Tests cover:
 * - Pushing payments to Xero
 * - Pulling payments from Xero
 * - Payment mapping management
 * - Amount conversion (cents to Rands)
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

import { XeroPaymentService } from '../xero-payment.service';
import { XeroRateLimiter } from '../xero-rate-limiter.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BusinessException,
  NotFoundException,
} from '../../../shared/exceptions';
import { centsToRands, randsToCents } from '../dto/xero-payment.dto';

describe('XeroPaymentService', () => {
  let service: XeroPaymentService;
  let httpService: HttpService;
  let prismaService: PrismaService;
  let rateLimiter: XeroRateLimiter;

  const mockTenantId = 'mock-tenant-id';
  const mockXeroTenantId = 'mock-xero-tenant-id';
  const mockPaymentId = 'mock-payment-id';
  const mockXeroPaymentId = 'mock-xero-payment-id';
  const mockXeroInvoiceId = 'mock-xero-invoice-id';
  const mockBankAccountId = 'mock-bank-account-id';

  // Mock rate limiter
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

  // Mock Prisma service
  const mockPrismaService = {
    xeroPaymentMapping: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    xeroInvoiceMapping: {
      findUnique: jest.fn(),
    },
    xeroToken: {
      findUnique: jest.fn(),
    },
  };

  // Mock TokenManager
  jest.mock('../../../mcp/xero-mcp/auth/token-manager', () => ({
    TokenManager: jest.fn().mockImplementation(() => ({
      getAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
    })),
  }));

  const createMockAxiosResponse = <T>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    } as InternalAxiosRequestConfig,
  });

  const createMockAxiosError = (status: number, data?: unknown): AxiosError => {
    const error = new Error('Axios Error') as AxiosError;
    error.response = {
      status,
      statusText: 'Error',
      data,
      headers: {},
      config: {
        headers: new AxiosHeaders(),
      } as InternalAxiosRequestConfig,
    };
    error.isAxiosError = true;
    return error;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroPaymentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'XERO_API_URL') {
                return 'https://api.xero.com/api.xro/2.0';
              }
              return undefined;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            put: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: XeroRateLimiter,
          useValue: mockRateLimiter,
        },
      ],
    }).compile();

    service = module.get<XeroPaymentService>(XeroPaymentService);
    httpService = module.get<HttpService>(HttpService);
    prismaService = module.get<PrismaService>(PrismaService);
    rateLimiter = module.get<XeroRateLimiter>(XeroRateLimiter);
  });

  describe('centsToRands and randsToCents helpers', () => {
    it('should convert cents to rands correctly', () => {
      expect(centsToRands(150000)).toBe(1500);
      expect(centsToRands(12345)).toBe(123.45);
      expect(centsToRands(0)).toBe(0);
      expect(centsToRands(1)).toBe(0.01);
    });

    it('should convert rands to cents correctly', () => {
      expect(randsToCents(1500)).toBe(150000);
      expect(randsToCents(123.45)).toBe(12345);
      expect(randsToCents(0)).toBe(0);
      expect(randsToCents(0.01)).toBe(1);
    });

    it('should round cents correctly', () => {
      expect(randsToCents(123.456)).toBe(12346); // Rounds up
      expect(randsToCents(123.454)).toBe(12345); // Rounds down
      expect(randsToCents(123.455)).toBe(12346); // Rounds up (banker's rounding edge)
    });
  });

  describe('syncPaymentToXero', () => {
    it('should return existing mapping if payment already synced', async () => {
      const existingMapping = {
        id: 'mapping-id',
        tenantId: mockTenantId,
        paymentId: mockPaymentId,
        xeroPaymentId: mockXeroPaymentId,
        xeroInvoiceId: mockXeroInvoiceId,
        amountCents: 150000,
        syncDirection: 'push',
        lastSyncedAt: new Date(),
      };

      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(
        existingMapping,
      );

      const result = await service.syncPaymentToXero(
        mockTenantId,
        mockPaymentId,
        mockXeroInvoiceId,
      );

      expect(result.paymentId).toBe(mockPaymentId);
      expect(result.xeroPaymentId).toBe(mockXeroPaymentId);
      expect(result.syncDirection).toBe('push');
    });

    it('should throw NotFoundException if payment not found', async () => {
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.syncPaymentToXero(
          mockTenantId,
          mockPaymentId,
          mockXeroInvoiceId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create payment in Xero and mapping', async () => {
      const mockPayment = {
        id: mockPaymentId,
        tenantId: mockTenantId,
        amountCents: 150000,
        paymentDate: new Date('2024-01-15'),
        reference: 'PAY-001',
        invoice: { id: 'invoice-id' },
      };

      const mockXeroPayment = {
        PaymentID: mockXeroPaymentId,
        Amount: 1500,
        Date: '2024-01-15',
        Status: 'AUTHORISED',
      };

      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });

      // Mock getting bank accounts
      (httpService.get as jest.Mock).mockReturnValue(
        of(
          createMockAxiosResponse({
            Accounts: [{ AccountID: mockBankAccountId, Type: 'BANK' }],
          }),
        ),
      );

      // Mock creating payment
      (httpService.put as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Payments: [mockXeroPayment] })),
      );

      mockPrismaService.xeroPaymentMapping.create.mockResolvedValue({
        id: 'mapping-id',
        paymentId: mockPaymentId,
        xeroPaymentId: mockXeroPaymentId,
        xeroInvoiceId: mockXeroInvoiceId,
        amountCents: 150000,
        syncDirection: 'push',
        lastSyncedAt: new Date(),
      });

      const result = await service.syncPaymentToXero(
        mockTenantId,
        mockPaymentId,
        mockXeroInvoiceId,
      );

      expect(result.xeroPaymentId).toBe(mockXeroPaymentId);
      expect(result.amountCents).toBe(150000);
      expect(result.syncDirection).toBe('push');

      // Verify the API call was made with correct amount conversion
      expect(httpService.put).toHaveBeenCalledWith(
        'https://api.xero.com/api.xro/2.0/Payments',
        expect.objectContaining({
          Payments: [
            expect.objectContaining({
              Amount: 1500, // cents converted to rands
              Invoice: { InvoiceID: mockXeroInvoiceId },
            }),
          ],
        }),
        expect.any(Object),
      );
    });

    it('should throw BusinessException when no bank account available', async () => {
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        tenantId: mockTenantId,
        amountCents: 150000,
        paymentDate: new Date(),
        invoice: {},
      });
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });

      // Mock no bank accounts
      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Accounts: [] })),
      );

      await expect(
        service.syncPaymentToXero(
          mockTenantId,
          mockPaymentId,
          mockXeroInvoiceId,
        ),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('pullPaymentsFromXero', () => {
    it('should throw BusinessException if invoice not mapped', async () => {
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });
      mockPrismaService.xeroInvoiceMapping.findUnique.mockResolvedValue(null);

      await expect(
        service.pullPaymentsFromXero(mockTenantId, mockXeroInvoiceId),
      ).rejects.toThrow(BusinessException);
    });

    it('should pull and create payments successfully', async () => {
      const mockInvoiceMapping = {
        invoiceId: 'local-invoice-id',
        xeroInvoiceId: mockXeroInvoiceId,
        invoice: { id: 'local-invoice-id' },
      };

      const mockXeroPayments = [
        {
          PaymentID: 'xero-payment-1',
          Amount: 500,
          Date: '2024-01-10',
          Reference: 'PAY-001',
          Status: 'AUTHORISED',
        },
        {
          PaymentID: 'xero-payment-2',
          Amount: 1000,
          Date: '2024-01-15',
          Reference: 'PAY-002',
          Status: 'AUTHORISED',
        },
      ];

      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });
      mockPrismaService.xeroInvoiceMapping.findUnique.mockResolvedValue(
        mockInvoiceMapping,
      );
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);

      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Payments: mockXeroPayments })),
      );

      mockPrismaService.payment.create.mockImplementation(({ data }) => ({
        id: `new-payment-${data.xeroPaymentId}`,
        ...data,
      }));

      mockPrismaService.xeroPaymentMapping.create.mockImplementation(
        ({ data }) => ({
          id: `mapping-${data.xeroPaymentId}`,
          ...data,
          lastSyncedAt: new Date(),
        }),
      );

      const result = await service.pullPaymentsFromXero(
        mockTenantId,
        mockXeroInvoiceId,
      );

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].syncDirection).toBe('pull');
      // Verify amount conversion from rands to cents
      expect(result.results[0].amountCents).toBe(50000);
      expect(result.results[1].amountCents).toBe(100000);
    });

    it('should skip already mapped payments', async () => {
      const mockInvoiceMapping = {
        invoiceId: 'local-invoice-id',
        xeroInvoiceId: mockXeroInvoiceId,
        invoice: { id: 'local-invoice-id' },
      };

      const mockXeroPayments = [
        {
          PaymentID: 'xero-payment-1',
          Amount: 500,
          Date: '2024-01-10',
          Status: 'AUTHORISED',
        },
      ];

      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });
      mockPrismaService.xeroInvoiceMapping.findUnique.mockResolvedValue(
        mockInvoiceMapping,
      );

      // Already mapped
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue({
        id: 'existing-mapping',
        xeroPaymentId: 'xero-payment-1',
      });

      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Payments: mockXeroPayments })),
      );

      const result = await service.pullPaymentsFromXero(
        mockTenantId,
        mockXeroInvoiceId,
      );

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('getPaymentMapping', () => {
    it('should return mapping when found', async () => {
      const mockMapping = {
        id: 'mapping-id',
        xeroPaymentId: mockXeroPaymentId,
        xeroInvoiceId: mockXeroInvoiceId,
        amountCents: 150000,
        syncDirection: 'push',
        lastSyncedAt: new Date(),
      };

      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(
        mockMapping,
      );

      const result = await service.getPaymentMapping(
        mockTenantId,
        mockPaymentId,
      );

      expect(result).toBeDefined();
      expect(result?.xeroPaymentId).toBe(mockXeroPaymentId);
      expect(result?.amountCents).toBe(150000);
    });

    it('should return null when mapping not found', async () => {
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);

      const result = await service.getPaymentMapping(
        mockTenantId,
        mockPaymentId,
      );

      expect(result).toBeNull();
    });
  });

  describe('rate limiting', () => {
    it('should acquire rate limit slot before API calls', async () => {
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });
      mockPrismaService.xeroInvoiceMapping.findUnique.mockResolvedValue({
        invoiceId: 'local-invoice-id',
        invoice: {},
      });

      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Payments: [] })),
      );

      await service.pullPaymentsFromXero(mockTenantId, mockXeroInvoiceId);

      expect(mockRateLimiter.acquireSlot).toHaveBeenCalledWith(
        mockXeroTenantId,
      );
    });
  });

  describe('error handling', () => {
    it('should handle API validation errors', async () => {
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        tenantId: mockTenantId,
        amountCents: 150000,
        paymentDate: new Date(),
        invoice: {},
      });
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });

      // Mock bank account
      (httpService.get as jest.Mock).mockReturnValue(
        of(
          createMockAxiosResponse({
            Accounts: [{ AccountID: mockBankAccountId }],
          }),
        ),
      );

      // Mock validation error
      const error = createMockAxiosError(400, {
        Elements: [
          {
            ValidationErrors: [{ Message: 'Payment amount exceeds invoice' }],
          },
        ],
      });
      (httpService.put as jest.Mock).mockReturnValue(throwError(() => error));

      await expect(
        service.syncPaymentToXero(
          mockTenantId,
          mockPaymentId,
          mockXeroInvoiceId,
        ),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw BusinessException when no Xero connection', async () => {
      mockPrismaService.xeroPaymentMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.payment.findFirst.mockResolvedValue({
        id: mockPaymentId,
        amountCents: 150000,
        paymentDate: new Date(),
        invoice: {},
      });
      mockPrismaService.xeroToken.findUnique.mockResolvedValue(null);

      await expect(
        service.syncPaymentToXero(
          mockTenantId,
          mockPaymentId,
          mockXeroInvoiceId,
        ),
      ).rejects.toThrow(BusinessException);
    });
  });
});
