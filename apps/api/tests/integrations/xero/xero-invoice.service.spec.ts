/**
 * XeroInvoiceService Tests
 * TASK-XERO-009: Bidirectional Invoice Sync with Xero
 *
 * Tests for XeroInvoiceService covering:
 * - Push invoices to Xero (CrecheBooks -> Xero)
 * - Pull invoices from Xero (Xero -> CrecheBooks)
 * - Invoice mapping and status conversion
 * - Rate limiting integration
 * - Error handling and retries
 *
 * South African context: All amounts in ZAR cents, 15% VAT
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { XeroInvoiceService } from '../../../src/integrations/xero/xero-invoice.service';
import {
  XeroRateLimiter,
  RateLimitResult,
} from '../../../src/integrations/xero/xero-rate-limiter.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  InvoiceSyncDirection,
  InvoiceSyncStatus,
  INVOICE_STATUS_MAP,
} from '../../../src/integrations/xero/dto/xero-invoice.dto';
import {
  XeroAuthenticationError,
  XeroValidationError,
  XeroRateLimitError,
} from '../../../src/integrations/xero/xero-journal.errors';

// Mock Prisma client methods
interface MockPrismaService {
  invoice: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  parent: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
  xeroInvoiceMapping: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
}

describe('XeroInvoiceService', () => {
  let service: XeroInvoiceService;
  let prisma: MockPrismaService;
  let httpService: jest.Mocked<HttpService>;
  let rateLimiter: jest.Mocked<XeroRateLimiter>;

  // Test data
  const tenantId = 'tenant-123';
  const accessToken = 'valid-access-token';
  const xeroTenantId = 'xero-tenant-456';

  const mockParent = {
    id: 'parent-001',
    tenantId,
    xeroContactId: null,
    firstName: 'Sipho',
    lastName: 'Mthembu',
    email: 'sipho.mthembu@email.co.za',
    phone: '+27821234567',
    whatsapp: '+27821234567',
    preferredContact: 'EMAIL',
    whatsappOptIn: true,
    smsOptIn: false,
    idNumber: '8501015800086',
    address: '123 Main Road, Sandton, Johannesburg',
    notes: null,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockChild = {
    id: 'child-001',
    tenantId,
    parentId: 'parent-001',
    firstName: 'Thabo',
    lastName: 'Mthembu',
    dateOfBirth: new Date('2020-03-15'),
    gender: 'MALE',
    medicalNotes: null,
    emergencyContact: 'Mama',
    emergencyPhone: '+27829876543',
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockInvoice = {
    id: 'invoice-001',
    tenantId,
    xeroInvoiceId: null,
    invoiceNumber: 'INV-2024-0001',
    parentId: 'parent-001',
    childId: 'child-001',
    billingPeriodStart: new Date('2024-01-01'),
    billingPeriodEnd: new Date('2024-01-31'),
    issueDate: new Date('2024-01-01'),
    dueDate: new Date('2024-01-15'),
    subtotalCents: 350000, // R3,500.00
    vatCents: 0, // Educational services exempt
    vatRate: 0,
    totalCents: 350000,
    amountPaidCents: 0,
    status: 'SENT',
    deliveryMethod: 'EMAIL',
    deliveryStatus: 'DELIVERED',
    deliveredAt: new Date('2024-01-01'),
    deliveryRetryCount: 0,
    pdfUrl: null,
    notes: 'January 2024 monthly fee',
    isDeleted: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    parent: mockParent,
    child: mockChild,
    lines: [
      {
        id: 'line-001',
        invoiceId: 'invoice-001',
        description: 'Monthly childcare fee - January 2024',
        quantity: 1,
        unitPriceCents: 350000,
        discountCents: 0,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        lineType: 'MONTHLY_FEE',
        accountCode: '200',
        sortOrder: 0,
        adHocChargeId: null,
        createdAt: new Date('2024-01-01'),
      },
    ],
  };

  const mockXeroInvoiceResponse = {
    Invoices: [
      {
        InvoiceID: 'xero-invoice-abc123',
        InvoiceNumber: 'INV-0001',
        Type: 'ACCREC',
        Status: 'AUTHORISED',
        Contact: {
          ContactID: 'xero-contact-xyz789',
          Name: 'Sipho Mthembu',
          EmailAddress: 'sipho.mthembu@email.co.za',
        },
        Date: '2024-01-01',
        DueDate: '2024-01-15',
        LineItems: [
          {
            Description: 'Monthly childcare fee - January 2024',
            Quantity: 1,
            UnitAmount: 3500.0,
            AccountCode: '200',
            TaxType: 'NONE',
            LineAmount: 3500.0,
          },
        ],
        SubTotal: 3500.0,
        TotalTax: 0,
        Total: 3500.0,
        AmountDue: 3500.0,
        AmountPaid: 0,
        UpdatedDateUTC: '2024-01-01T00:00:00',
      },
    ],
  };

  const mockXeroContactResponse = {
    Contacts: [
      {
        ContactID: 'xero-contact-xyz789',
        Name: 'Sipho Mthembu',
        EmailAddress: 'sipho.mthembu@email.co.za',
        FirstName: 'Sipho',
        LastName: 'Mthembu',
      },
    ],
  };

  const mockRateLimitAllowed: RateLimitResult = {
    allowed: true,
    remaining: 59,
  };

  const mockRateLimitExceeded: RateLimitResult = {
    allowed: false,
    remaining: 0,
    retryAfter: 30,
  };

  beforeEach(async () => {
    const mockPrismaService: MockPrismaService = {
      invoice: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      parent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      xeroInvoiceMapping: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
    };

    const mockRateLimiter = {
      acquireSlot: jest.fn(),
      getStatus: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroInvoiceService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                XERO_MAX_RETRIES: 3,
                XERO_BASE_DELAY_MS: 100,
                XERO_MAX_DELAY_MS: 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: XeroRateLimiter,
          useValue: mockRateLimiter,
        },
      ],
    }).compile();

    service = module.get<XeroInvoiceService>(XeroInvoiceService);
    prisma = module.get(PrismaService);
    httpService = module.get(HttpService);
    rateLimiter = module.get(XeroRateLimiter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('pushInvoice', () => {
    it('should successfully push invoice to Xero', async () => {
      // Setup mocks
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      // Mock contact search (not found, then create)
      httpService.get.mockReturnValueOnce(
        of({
          data: { Contacts: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      // Mock contact creation
      httpService.post.mockReturnValueOnce(
        of({
          data: mockXeroContactResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      // Mock invoice creation
      httpService.post.mockReturnValueOnce(
        of({
          data: mockXeroInvoiceResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      // Mock mapping creation
      const now = new Date();
      prisma.xeroInvoiceMapping.upsert.mockResolvedValue({
        id: 'mapping-001',
        tenantId,
        invoiceId: mockInvoice.id,
        xeroInvoiceId: 'xero-invoice-abc123',
        xeroInvoiceNumber: 'INV-0001',
        lastSyncedAt: now,
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
        syncErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      });

      prisma.invoice.update.mockResolvedValue({
        ...mockInvoice,
        xeroInvoiceId: 'xero-invoice-abc123',
      });
      prisma.parent.update.mockResolvedValue({
        ...mockParent,
        xeroContactId: 'xero-contact-xyz789',
      });

      // Execute
      const result = await service.pushInvoice(
        tenantId,
        mockInvoice.id,
        accessToken,
        xeroTenantId,
      );

      // Verify
      expect(result.invoiceId).toBe(mockInvoice.id);
      expect(result.xeroInvoiceId).toBe('xero-invoice-abc123');
      expect(result.xeroInvoiceNumber).toBe('INV-0001');
      expect(result.syncDirection).toBe(InvoiceSyncDirection.PUSH);
      expect(rateLimiter.acquireSlot).toHaveBeenCalledWith(tenantId);
    });

    it('should skip push if invoice already synced (no force)', async () => {
      const existingMapping = {
        id: 'mapping-001',
        tenantId,
        invoiceId: mockInvoice.id,
        xeroInvoiceId: 'xero-invoice-abc123',
        xeroInvoiceNumber: 'INV-0001',
        lastSyncedAt: new Date(),
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
      };

      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(existingMapping);

      const result = await service.pushInvoice(
        tenantId,
        mockInvoice.id,
        accessToken,
        xeroTenantId,
        false,
      );

      expect(result.xeroInvoiceId).toBe('xero-invoice-abc123');
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should re-push if force=true even when already synced', async () => {
      const existingMapping = {
        id: 'mapping-001',
        tenantId,
        invoiceId: mockInvoice.id,
        xeroInvoiceId: 'xero-invoice-abc123',
        xeroInvoiceNumber: 'INV-0001',
        lastSyncedAt: new Date(),
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
      };

      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(existingMapping);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      httpService.post.mockReturnValue(
        of({
          data: mockXeroInvoiceResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      prisma.xeroInvoiceMapping.upsert.mockResolvedValue(existingMapping);
      prisma.invoice.update.mockResolvedValue(mockInvoice);

      await service.pushInvoice(
        tenantId,
        mockInvoice.id,
        accessToken,
        xeroTenantId,
        true,
      );

      expect(httpService.post).toHaveBeenCalled();
    });

    it('should throw NotFoundException if invoice not found', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.pushInvoice(
          tenantId,
          'non-existent',
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw XeroRateLimitError when rate limit exceeded', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitExceeded);

      await expect(
        service.pushInvoice(
          tenantId,
          mockInvoice.id,
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(XeroRateLimitError);
    });

    it('should throw XeroValidationError for wrong tenant', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        tenantId: 'different-tenant',
      });

      await expect(
        service.pushInvoice(
          tenantId,
          mockInvoice.id,
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(XeroValidationError);
    });
  });

  describe('pushInvoices (bulk)', () => {
    it('should push multiple invoices and handle partial failures', async () => {
      const invoiceIds = ['invoice-001', 'invoice-002', 'invoice-003'];
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      // First invoice: no existing mapping (pre-check), no mapping in pushInvoice, succeeds
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValueOnce(null); // pushInvoices pre-check
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValueOnce(null); // pushInvoice check
      prisma.invoice.findUnique.mockResolvedValueOnce({
        ...mockInvoice,
        id: 'invoice-001',
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });

      httpService.post.mockReturnValueOnce(
        of({
          data: mockXeroInvoiceResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      prisma.xeroInvoiceMapping.upsert.mockResolvedValueOnce({
        id: 'mapping-001',
        tenantId,
        invoiceId: 'invoice-001',
        xeroInvoiceId: 'xero-invoice-abc123',
        xeroInvoiceNumber: 'INV-0001',
        lastSyncedAt: new Date(),
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
      });
      prisma.invoice.update.mockResolvedValueOnce(mockInvoice);

      // Second invoice: no existing mapping (pre-check), no mapping in pushInvoice, not found
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValueOnce(null); // pushInvoices pre-check
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValueOnce(null); // pushInvoice check
      prisma.invoice.findUnique.mockResolvedValueOnce(null);
      prisma.xeroInvoiceMapping.upsert.mockResolvedValueOnce({
        id: 'mapping-002',
        tenantId,
        invoiceId: 'invoice-002',
        xeroInvoiceId: '',
        lastSyncedAt: new Date(),
        syncDirection: 'PUSH',
        syncStatus: 'FAILED',
        syncErrorMessage: 'Invoice invoice-002 not found',
      });

      // Third invoice: has existing mapping (pre-check skips it)
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValueOnce({
        id: 'mapping-003',
        tenantId,
        invoiceId: 'invoice-003',
        xeroInvoiceId: 'xero-invoice-existing',
        xeroInvoiceNumber: 'INV-0003',
        lastSyncedAt: new Date(),
        syncDirection: 'PUSH',
        syncStatus: 'SYNCED',
      });

      const result = await service.pushInvoices(
        tenantId,
        invoiceIds,
        accessToken,
        xeroTenantId,
      );

      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].invoiceId).toBe('invoice-002');
    });

    it('should fetch unsynced invoices when no IDs provided', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'invoice-001' },
        { id: 'invoice-002' },
      ]);

      // Both fail for simplicity in this test
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue(null);
      prisma.xeroInvoiceMapping.upsert.mockResolvedValue({});

      await service.pushInvoices(
        tenantId,
        undefined,
        accessToken,
        xeroTenantId,
      );

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          xeroInvoiceId: null,
          status: { notIn: ['DRAFT', 'VOID'] },
          isDeleted: false,
        },
        select: { id: true },
      });
    });

    it('should return empty result when no invoices to push', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);

      const result = await service.pushInvoices(
        tenantId,
        [],
        accessToken,
        xeroTenantId,
      );

      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('pullInvoices', () => {
    it('should pull invoices from Xero', async () => {
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      httpService.get.mockReturnValue(
        of({
          data: mockXeroInvoiceResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.parent.findMany.mockResolvedValue([mockParent]);

      const result = await service.pullInvoices(
        tenantId,
        accessToken,
        xeroTenantId,
      );

      expect(result.totalFound).toBe(1);
      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0].xeroInvoiceId).toBe('xero-invoice-abc123');
      expect(result.invoices[0].totalCents).toBe(350000);
    });

    it('should update existing mappings on pull', async () => {
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      httpService.get.mockReturnValue(
        of({
          data: mockXeroInvoiceResponse,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      const existingMapping = {
        id: 'mapping-001',
        tenantId,
        invoiceId: 'invoice-001',
        xeroInvoiceId: 'xero-invoice-abc123',
        lastSyncedAt: new Date(),
        syncDirection: 'PULL',
        syncStatus: 'SYNCED',
      };

      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(existingMapping);
      prisma.parent.findMany.mockResolvedValue([mockParent]);

      const result = await service.pullInvoices(
        tenantId,
        accessToken,
        xeroTenantId,
      );

      expect(result.updated).toBe(1);
      expect(result.invoices[0].imported).toBe(true);
    });

    it('should skip invoices with no matching parent', async () => {
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      const invoiceWithDifferentEmail = {
        ...mockXeroInvoiceResponse.Invoices[0],
        Contact: {
          ...mockXeroInvoiceResponse.Invoices[0].Contact,
          EmailAddress: 'unknown@email.com',
        },
      };

      httpService.get.mockReturnValue(
        of({
          data: { Invoices: [invoiceWithDifferentEmail] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.parent.findMany.mockResolvedValue([mockParent]); // Different email

      const result = await service.pullInvoices(
        tenantId,
        accessToken,
        xeroTenantId,
      );

      expect(result.skipped).toBe(1);
      expect(result.invoices[0].imported).toBe(false);
      expect(result.invoices[0].importReason).toContain(
        'not found in CrecheBooks',
      );
    });

    it('should throw XeroRateLimitError when rate limit exceeded', async () => {
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitExceeded);

      await expect(
        service.pullInvoices(tenantId, accessToken, xeroTenantId),
      ).rejects.toThrow(XeroRateLimitError);
    });

    it('should filter by modified date when since provided', async () => {
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      httpService.get.mockReturnValue(
        of({
          data: { Invoices: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
        } as AxiosResponse),
      );

      prisma.parent.findMany.mockResolvedValue([]);

      await service.pullInvoices(
        tenantId,
        accessToken,
        xeroTenantId,
        '2024-01-01',
      );

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('ModifiedAfter=2024-01-01'),
        expect.any(Object),
      );
    });
  });

  describe('mapToXeroInvoice', () => {
    it('should correctly map CrecheBooks invoice to Xero format', () => {
      const result = service.mapToXeroInvoice(
        mockInvoice,
        'xero-contact-xyz789',
      );

      expect(result.Invoices).toHaveLength(1);
      const xeroInvoice = result.Invoices[0];

      expect(xeroInvoice.Type).toBe('ACCREC');
      expect(xeroInvoice.Contact?.ContactID).toBe('xero-contact-xyz789');
      expect(xeroInvoice.InvoiceNumber).toBe('INV-2024-0001');
      expect(xeroInvoice.Status).toBe('AUTHORISED'); // SENT -> AUTHORISED
      expect(xeroInvoice.LineItems).toHaveLength(1);
      expect(xeroInvoice.LineItems?.[0].UnitAmount).toBe(3500); // R3,500.00
      expect(xeroInvoice.LineItems?.[0].TaxType).toBe('NONE'); // Educational exempt
    });

    it('should map DRAFT status correctly', () => {
      const draftInvoice = { ...mockInvoice, status: 'DRAFT' };
      const result = service.mapToXeroInvoice(
        draftInvoice,
        'xero-contact-xyz789',
      );

      expect(result.Invoices[0].Status).toBe('DRAFT');
    });

    it('should map PAID status correctly', () => {
      const paidInvoice = { ...mockInvoice, status: 'PAID' };
      const result = service.mapToXeroInvoice(
        paidInvoice,
        'xero-contact-xyz789',
      );

      expect(result.Invoices[0].Status).toBe('PAID');
    });

    it('should convert cents to Rand correctly', () => {
      const result = service.mapToXeroInvoice(
        mockInvoice,
        'xero-contact-xyz789',
      );

      // 350000 cents = R3,500.00
      expect(result.Invoices[0].LineItems?.[0].UnitAmount).toBe(3500);
    });

    it('should handle VAT items', () => {
      const invoiceWithVat = {
        ...mockInvoice,
        lines: [
          {
            ...mockInvoice.lines[0],
            vatCents: 52500, // 15% VAT on R350.00 = R52.50
          },
        ],
      };

      const result = service.mapToXeroInvoice(
        invoiceWithVat,
        'xero-contact-xyz789',
      );

      expect(result.Invoices[0].LineItems?.[0].TaxType).toBe('OUTPUT');
    });
  });

  describe('mapFromXeroInvoice', () => {
    it('should correctly map Xero invoice to CrecheBooks format', () => {
      const xeroInvoice = mockXeroInvoiceResponse.Invoices[0];
      const result = service.mapFromXeroInvoice(xeroInvoice);

      expect(result.xeroInvoiceId).toBe('xero-invoice-abc123');
      expect(result.xeroInvoiceNumber).toBe('INV-0001');
      expect(result.contactName).toBe('Sipho Mthembu');
      expect(result.contactEmail).toBe('sipho.mthembu@email.co.za');
      expect(result.totalCents).toBe(350000); // R3,500.00 = 350000 cents
      expect(result.amountPaidCents).toBe(0);
      expect(result.status).toBe('AUTHORISED');
    });

    it('should convert Rand to cents correctly', () => {
      const xeroInvoice = {
        ...mockXeroInvoiceResponse.Invoices[0],
        Total: 1234.56,
        AmountPaid: 500.0,
      };

      const result = service.mapFromXeroInvoice(xeroInvoice);

      expect(result.totalCents).toBe(123456);
      expect(result.amountPaidCents).toBe(50000);
    });
  });

  describe('INVOICE_STATUS_MAP', () => {
    it('should map CrecheBooks statuses to Xero correctly', () => {
      expect(INVOICE_STATUS_MAP.toXero.DRAFT).toBe('DRAFT');
      expect(INVOICE_STATUS_MAP.toXero.SENT).toBe('AUTHORISED');
      expect(INVOICE_STATUS_MAP.toXero.VIEWED).toBe('AUTHORISED');
      expect(INVOICE_STATUS_MAP.toXero.PARTIALLY_PAID).toBe('AUTHORISED');
      expect(INVOICE_STATUS_MAP.toXero.PAID).toBe('PAID');
      expect(INVOICE_STATUS_MAP.toXero.VOID).toBe('VOIDED');
    });

    it('should map Xero statuses to CrecheBooks correctly', () => {
      expect(INVOICE_STATUS_MAP.fromXero.DRAFT).toBe('DRAFT');
      expect(INVOICE_STATUS_MAP.fromXero.SUBMITTED).toBe('SENT');
      expect(INVOICE_STATUS_MAP.fromXero.AUTHORISED).toBe('SENT');
      expect(INVOICE_STATUS_MAP.fromXero.PAID).toBe('PAID');
      expect(INVOICE_STATUS_MAP.fromXero.VOIDED).toBe('VOID');
    });
  });

  describe('Error handling', () => {
    it('should handle Xero 401 authentication error', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      const axiosError = new AxiosError(
        'Request failed',
        '401',
        undefined,
        undefined,
        {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
          data: { Message: 'Token expired' },
        },
      );

      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.pushInvoice(
          tenantId,
          mockInvoice.id,
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(XeroAuthenticationError);
    });

    it('should handle Xero 400 validation error', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      const axiosError = new AxiosError(
        'Request failed',
        '400',
        undefined,
        undefined,
        {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as InternalAxiosRequestConfig,
          data: { Message: 'Invalid invoice number' },
        },
      );

      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.pushInvoice(
          tenantId,
          mockInvoice.id,
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(XeroValidationError);
    });

    it('should handle Xero 429 rate limit with retry-after header', async () => {
      prisma.xeroInvoiceMapping.findUnique.mockResolvedValue(null);
      prisma.invoice.findUnique.mockResolvedValue({
        ...mockInvoice,
        parent: { ...mockParent, xeroContactId: 'xero-contact-xyz789' },
      });
      rateLimiter.acquireSlot.mockResolvedValue(mockRateLimitAllowed);

      const axiosError = new AxiosError(
        'Request failed',
        '429',
        undefined,
        undefined,
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '60' },
          config: {} as InternalAxiosRequestConfig,
          data: {},
        },
      );

      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.pushInvoice(
          tenantId,
          mockInvoice.id,
          accessToken,
          xeroTenantId,
        ),
      ).rejects.toThrow(XeroRateLimitError);
    });
  });

  describe('South African business context', () => {
    it('should handle ZAR amounts correctly', () => {
      // R35,000.00 monthly fee (higher-end childcare)
      const premiumInvoice = {
        ...mockInvoice,
        subtotalCents: 3500000,
        totalCents: 3500000,
        lines: [
          {
            ...mockInvoice.lines[0],
            unitPriceCents: 3500000,
            subtotalCents: 3500000,
            totalCents: 3500000,
          },
        ],
      };

      const result = service.mapToXeroInvoice(
        premiumInvoice,
        'xero-contact-xyz789',
      );

      // Should be R35,000.00
      expect(result.Invoices[0].LineItems?.[0].UnitAmount).toBe(35000);
    });

    it('should handle educational services VAT exemption', () => {
      // Educational services are VAT exempt under Section 12(h)
      const result = service.mapToXeroInvoice(
        mockInvoice,
        'xero-contact-xyz789',
      );

      expect(result.Invoices[0].LineItems?.[0].TaxType).toBe('NONE');
    });

    it('should handle 15% VAT for taxable items', () => {
      // Meals, transport are VAT-able at 15%
      const invoiceWithVatItems = {
        ...mockInvoice,
        subtotalCents: 100000, // R1,000.00
        vatCents: 15000, // R150.00 VAT
        totalCents: 115000, // R1,150.00 total
        lines: [
          {
            id: 'line-001',
            invoiceId: 'invoice-001',
            description: 'After-school meals - January 2024',
            quantity: 20,
            unitPriceCents: 5000, // R50.00 per meal
            discountCents: 0,
            subtotalCents: 100000,
            vatCents: 15000,
            totalCents: 115000,
            lineType: 'MEALS',
            accountCode: '410',
            sortOrder: 0,
            adHocChargeId: null,
            createdAt: new Date('2024-01-01'),
          },
        ],
      };

      const result = service.mapToXeroInvoice(
        invoiceWithVatItems,
        'xero-contact-xyz789',
      );

      expect(result.Invoices[0].LineItems?.[0].TaxType).toBe('OUTPUT');
    });
  });
});
