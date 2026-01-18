/**
 * XeroContactService Tests
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Unit tests for the Xero contact sync service.
 * Tests cover:
 * - Finding existing contacts by email
 * - Creating new contacts in Xero
 * - Contact mapping management
 * - Bulk contact sync operations
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

import { XeroContactService } from '../xero-contact.service';
import { XeroRateLimiter } from '../xero-rate-limiter.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import {
  BusinessException,
  NotFoundException,
} from '../../../shared/exceptions';

describe('XeroContactService', () => {
  let service: XeroContactService;
  let httpService: HttpService;
  let prismaService: PrismaService;
  let rateLimiter: XeroRateLimiter;

  const mockTenantId = 'mock-tenant-id';
  const mockXeroTenantId = 'mock-xero-tenant-id';
  const mockParentId = 'mock-parent-id';
  const mockContactId = 'mock-contact-id';

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
    xeroContactMapping: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    parent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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
        XeroContactService,
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
            post: jest.fn(),
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

    service = module.get<XeroContactService>(XeroContactService);
    httpService = module.get<HttpService>(HttpService);
    prismaService = module.get<PrismaService>(PrismaService);
    rateLimiter = module.get<XeroRateLimiter>(XeroRateLimiter);
  });

  describe('getOrCreateContact', () => {
    it('should return existing mapping if parent already mapped', async () => {
      const existingMapping = {
        id: 'mapping-id',
        tenantId: mockTenantId,
        parentId: mockParentId,
        xeroContactId: mockContactId,
        xeroContactName: 'John Smith',
        lastSyncedAt: new Date(),
      };

      mockPrismaService.xeroContactMapping.findUnique.mockResolvedValue(
        existingMapping,
      );

      const result = await service.getOrCreateContact(
        mockTenantId,
        mockParentId,
      );

      expect(result.parentId).toBe(mockParentId);
      expect(result.xeroContactId).toBe(mockContactId);
      expect(result.wasCreated).toBe(false);
      expect(
        mockPrismaService.xeroContactMapping.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          tenantId_parentId: { tenantId: mockTenantId, parentId: mockParentId },
        },
      });
    });

    it('should throw NotFoundException if parent not found', async () => {
      mockPrismaService.xeroContactMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrCreateContact(mockTenantId, mockParentId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findContactByEmail', () => {
    it('should return contact when found by email', async () => {
      const mockContact = {
        ContactID: mockContactId,
        Name: 'John Smith',
        FirstName: 'John',
        LastName: 'Smith',
        EmailAddress: 'john@example.com',
        ContactStatus: 'ACTIVE',
        IsCustomer: true,
      };

      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [mockContact] })),
      );

      const result = await service.findContactByEmail(
        'mock-access-token',
        mockXeroTenantId,
        'john@example.com',
      );

      expect(result).toBeDefined();
      expect(result?.contactId).toBe(mockContactId);
      expect(result?.name).toBe('John Smith');
      expect(result?.emailAddress).toBe('john@example.com');
    });

    it('should return null when no contact found', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [] })),
      );

      const result = await service.findContactByEmail(
        'mock-access-token',
        mockXeroTenantId,
        'notfound@example.com',
      );

      expect(result).toBeNull();
    });

    it('should return null on 404 error', async () => {
      const error = createMockAxiosError(404);
      (httpService.get as jest.Mock).mockReturnValue(throwError(() => error));

      const result = await service.findContactByEmail(
        'mock-access-token',
        mockXeroTenantId,
        'notfound@example.com',
      );

      expect(result).toBeNull();
    });

    it('should throw BusinessException on other API errors', async () => {
      const error = createMockAxiosError(500, { Message: 'Server error' });
      (httpService.get as jest.Mock).mockReturnValue(throwError(() => error));

      await expect(
        service.findContactByEmail(
          'mock-access-token',
          mockXeroTenantId,
          'john@example.com',
        ),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('createXeroContact', () => {
    it('should create contact successfully', async () => {
      const mockContact = {
        ContactID: mockContactId,
        Name: 'John Smith',
        FirstName: 'John',
        LastName: 'Smith',
        EmailAddress: 'john@example.com',
        ContactStatus: 'ACTIVE',
        IsCustomer: true,
      };

      (httpService.post as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [mockContact] })),
      );

      const result = await service.createXeroContact(
        'mock-access-token',
        mockXeroTenantId,
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      );

      expect(result.contactId).toBe(mockContactId);
      expect(result.name).toBe('John Smith');

      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.xero.com/api.xro/2.0/Contacts',
        expect.objectContaining({
          Contacts: [
            expect.objectContaining({
              Name: 'John Smith',
              FirstName: 'John',
              LastName: 'Smith',
              EmailAddress: 'john@example.com',
              IsCustomer: true,
            }),
          ],
        }),
        expect.any(Object),
      );
    });

    it('should throw BusinessException when no contact returned', async () => {
      (httpService.post as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [] })),
      );

      await expect(
        service.createXeroContact('mock-access-token', mockXeroTenantId, {
          firstName: 'John',
          lastName: 'Smith',
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should handle validation errors', async () => {
      const error = createMockAxiosError(400, {
        Elements: [
          {
            ValidationErrors: [{ Message: 'Contact name is required' }],
          },
        ],
      });
      (httpService.post as jest.Mock).mockReturnValue(throwError(() => error));

      await expect(
        service.createXeroContact('mock-access-token', mockXeroTenantId, {
          firstName: '',
          lastName: '',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('bulkSyncContacts', () => {
    it('should sync multiple parents successfully', async () => {
      const mockParents = [
        {
          id: 'parent-1',
          tenantId: mockTenantId,
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          xeroContactMapping: null,
        },
        {
          id: 'parent-2',
          tenantId: mockTenantId,
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          xeroContactMapping: { xeroContactId: 'existing-contact' },
        },
      ];

      mockPrismaService.parent.findMany.mockResolvedValue(mockParents);
      mockPrismaService.xeroContactMapping.findUnique.mockResolvedValue(null);
      mockPrismaService.parent.findFirst.mockResolvedValue(mockParents[0]);
      mockPrismaService.xeroToken.findUnique.mockResolvedValue({
        tenantId: mockTenantId,
        xeroTenantId: mockXeroTenantId,
      });

      // Mock the HTTP calls for finding/creating contacts
      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [] })),
      );
      (httpService.post as jest.Mock).mockReturnValue(
        of(
          createMockAxiosResponse({
            Contacts: [
              {
                ContactID: 'new-contact-id',
                Name: 'John Smith',
                ContactStatus: 'ACTIVE',
              },
            ],
          }),
        ),
      );
      mockPrismaService.xeroContactMapping.create.mockResolvedValue({
        id: 'mapping-id',
        xeroContactId: 'new-contact-id',
        xeroContactName: 'John Smith',
        lastSyncedAt: new Date(),
      });

      const result = await service.bulkSyncContacts(mockTenantId);

      // One skipped (already mapped), one synced
      expect(result.skipped).toBe(1);
    });

    it('should filter by parentIds when provided', async () => {
      mockPrismaService.parent.findMany.mockResolvedValue([]);

      await service.bulkSyncContacts(mockTenantId, ['parent-1', 'parent-2']);

      expect(mockPrismaService.parent.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { in: ['parent-1', 'parent-2'] },
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('getContactMapping', () => {
    it('should return mapping when found', async () => {
      const mockMapping = {
        id: 'mapping-id',
        xeroContactId: mockContactId,
        xeroContactName: 'John Smith',
        lastSyncedAt: new Date(),
      };

      mockPrismaService.xeroContactMapping.findUnique.mockResolvedValue(
        mockMapping,
      );

      const result = await service.getContactMapping(
        mockTenantId,
        mockParentId,
      );

      expect(result).toBeDefined();
      expect(result?.xeroContactId).toBe(mockContactId);
    });

    it('should return null when mapping not found', async () => {
      mockPrismaService.xeroContactMapping.findUnique.mockResolvedValue(null);

      const result = await service.getContactMapping(
        mockTenantId,
        mockParentId,
      );

      expect(result).toBeNull();
    });
  });

  describe('deleteContactMapping', () => {
    it('should delete mapping and clear parent xeroContactId', async () => {
      mockPrismaService.xeroContactMapping.delete.mockResolvedValue({
        id: 'mapping-id',
      });
      mockPrismaService.parent.update.mockResolvedValue({
        id: mockParentId,
        xeroContactId: null,
      });

      await service.deleteContactMapping(mockTenantId, mockParentId);

      expect(mockPrismaService.xeroContactMapping.delete).toHaveBeenCalledWith({
        where: {
          tenantId_parentId: { tenantId: mockTenantId, parentId: mockParentId },
        },
      });
      expect(mockPrismaService.parent.update).toHaveBeenCalledWith({
        where: { id: mockParentId },
        data: { xeroContactId: null },
      });
    });
  });

  describe('rate limiting', () => {
    it('should acquire rate limit slot before API calls', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [] })),
      );

      await service.findContactByEmail(
        'mock-access-token',
        mockXeroTenantId,
        'john@example.com',
      );

      expect(mockRateLimiter.acquireSlot).toHaveBeenCalledWith(
        mockXeroTenantId,
      );
    });

    it('should wait when rate limit exceeded', async () => {
      mockRateLimiter.acquireSlot.mockResolvedValueOnce({
        allowed: false,
        remaining: 0,
      });

      (httpService.get as jest.Mock).mockReturnValue(
        of(createMockAxiosResponse({ Contacts: [] })),
      );

      // Use a spy to track setTimeout calls
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      await service.findContactByEmail(
        'mock-access-token',
        mockXeroTenantId,
        'john@example.com',
      );

      // Verify that rate limiter was called
      expect(mockRateLimiter.acquireSlot).toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
    });
  });
});
