/**
 * Twilio Content API Service Tests
 * TASK-WA-007: Twilio Content API Integration Service
 */

// Set environment variables before any imports
process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
process.env.TWILIO_STATUS_CALLBACK_URL = 'https://example.com/webhook';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwilioContentService } from '../services/twilio-content.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { CONTENT_LIMITS } from '../types/content.types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TwilioContentService', () => {
  let service: TwilioContentService;
  let mockPrisma: jest.Mocked<Partial<PrismaService>>;
  let mockAuditLogService: jest.Mocked<Partial<AuditLogService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    mockFetch.mockReset();

    mockPrisma = {
      whatsAppContentTemplate: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          TWILIO_ACCOUNT_SID: 'ACtest123',
          TWILIO_AUTH_TOKEN: 'test-auth-token',
          TWILIO_WHATSAPP_NUMBER: '+14155238886',
          TWILIO_STATUS_CALLBACK_URL: 'https://example.com/webhook',
        };
        return config[key];
      }),
    } as any;

    // Setup default mock responses for fetch
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      // Content list endpoint
      if (url.includes('/Content?PageSize=') && options?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              contents: [
                {
                  sid: 'HX123',
                  friendly_name: 'invoice_notification',
                  language: 'en',
                  variables: { '1': 'parent_name', '2': 'amount' },
                  types: { 'twilio/quick-reply': {} },
                  date_created: '2024-01-01T00:00:00Z',
                  date_updated: '2024-01-01T00:00:00Z',
                  url: 'https://content.twilio.com/v1/Content/HX123',
                  account_sid: 'ACtest123',
                },
              ],
              meta: {
                page: 0,
                page_size: 100,
                first_page_url: '',
                previous_page_url: null,
                url: '',
                next_page_url: null,
                key: 'contents',
              },
            }),
        });
      }

      // Content create endpoint
      if (
        url.includes('/Content') &&
        options?.method === 'POST' &&
        !url.includes('/ApprovalRequests')
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sid: 'HXnew123',
              friendly_name: 'test_template',
              language: 'en',
              variables: {},
              types: {},
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              url: 'https://content.twilio.com/v1/Content/HXnew123',
              account_sid: 'ACtest123',
            }),
        });
      }

      // Messages endpoint
      if (url.includes('/Messages.json') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sid: 'SMtest123',
              status: 'queued',
            }),
        });
      }

      // Approval request endpoint
      if (url.includes('/ApprovalRequests/whatsapp')) {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'pending' }),
          });
        }
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ status: 'approved' }),
          });
        }
      }

      // Content delete endpoint
      if (url.includes('/Content/HX') && options?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }

      // Default fallback
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not found' }),
      });
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioContentService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<TwilioContentService>(TwilioContentService);

    // Manually trigger onModuleInit
    await service.onModuleInit();
  });

  describe('initialization', () => {
    it('should initialize when configured', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should load templates on initialization', async () => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/Content?PageSize=100'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should cache loaded templates', () => {
      const template = service.getTemplate('invoice_notification');
      expect(template).toBeDefined();
      expect(template?.sid).toBe('HX123');
    });
  });

  describe('sendContentMessage', () => {
    it('should send message with content SID and variables', async () => {
      const result = await service.sendContentMessage(
        '+27821234567',
        'HX123',
        [
          { key: '1', value: 'John Doe' },
          { key: '2', value: 'R1,500.00' },
        ],
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.messageSid).toBe('SMtest123');

      // Verify the fetch call to Messages API
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/Messages.json'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
    });

    it('should format South African numbers correctly', async () => {
      await service.sendContentMessage('0821234567', 'HX123', []);

      // Find the Messages API call
      const messagesCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/Messages.json'),
      );
      expect(messagesCall).toBeDefined();
      expect(messagesCall[1].body).toContain('whatsapp%3A%2B27821234567');
    });

    it('should log audit trail when tenant provided', async () => {
      await service.sendContentMessage(
        '+27821234567',
        'HX123',
        [],
        'tenant-123',
      );

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          entityType: 'WhatsAppContentMessage',
        }),
      );
    });

    it('should return error on API failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/Messages.json')) {
          return Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({
                error_message: 'API error',
                error_code: 12345,
              }),
          });
        }
        // Keep other endpoints working
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ contents: [] }),
        });
      });

      const result = await service.sendContentMessage(
        '+27821234567',
        'HX123',
        [],
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('sendSessionQuickReply', () => {
    it('should create temporary content and send quick reply', async () => {
      const result = await service.sendSessionQuickReply(
        '+27821234567',
        'Would you like to proceed?',
        [
          { title: 'Yes', id: 'yes' },
          { title: 'No', id: 'no' },
        ],
      );

      expect(result.success).toBe(true);

      // Verify content creation was called
      const createCall = mockFetch.mock.calls.find(
        (call) =>
          call[0].includes('/Content') &&
          call[1]?.method === 'POST' &&
          !call[0].includes('/ApprovalRequests'),
      );
      expect(createCall).toBeDefined();

      const requestBody = JSON.parse(createCall[1].body);
      expect(requestBody.types['twilio/quick-reply']).toBeDefined();
      expect(requestBody.types['twilio/quick-reply'].body).toBe(
        'Would you like to proceed?',
      );
      expect(requestBody.types['twilio/quick-reply'].actions).toHaveLength(2);
    });

    it('should reject more than 3 buttons for session messages', async () => {
      const result = await service.sendSessionQuickReply(
        '+27821234567',
        'Test',
        [
          { title: 'Button 1', id: '1' },
          { title: 'Button 2', id: '2' },
          { title: 'Button 3', id: '3' },
          { title: 'Button 4', id: '4' }, // Too many
        ],
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BUTTON_LIMIT_EXCEEDED');
      expect(result.error).toContain(
        `max ${CONTENT_LIMITS.SESSION_QUICK_REPLY_BUTTONS}`,
      );
    });

    it('should truncate button titles to max length', async () => {
      await service.sendSessionQuickReply('+27821234567', 'Test', [
        {
          title: 'This is a very long button title that exceeds limit',
          id: 'btn1',
        },
      ]);

      // Find content creation call
      const createCall = mockFetch.mock.calls.find(
        (call) =>
          call[0].includes('/Content') &&
          call[1]?.method === 'POST' &&
          !call[0].includes('/ApprovalRequests'),
      );

      const requestBody = JSON.parse(createCall[1].body);
      expect(requestBody.types['twilio/quick-reply'].actions[0].title).toBe(
        'This is a very long ',
      );
    });
  });

  describe('sendListPicker', () => {
    it('should create and send list picker message', async () => {
      const result = await service.sendListPicker(
        '+27821234567',
        'Select an option',
        'View Options',
        [
          { item: 'Option 1', id: 'opt1', description: 'First option' },
          { item: 'Option 2', id: 'opt2', description: 'Second option' },
        ],
      );

      expect(result.success).toBe(true);

      // Verify content creation was called
      const createCall = mockFetch.mock.calls.find(
        (call) =>
          call[0].includes('/Content') &&
          call[1]?.method === 'POST' &&
          !call[0].includes('/ApprovalRequests'),
      );

      const requestBody = JSON.parse(createCall[1].body);
      expect(requestBody.types['twilio/list-picker']).toBeDefined();
      expect(requestBody.types['twilio/list-picker'].body).toBe(
        'Select an option',
      );
      expect(requestBody.types['twilio/list-picker'].button).toBe(
        'View Options',
      );
      expect(requestBody.types['twilio/list-picker'].items).toHaveLength(2);
    });

    it('should reject more than 10 list items', async () => {
      const items = Array.from({ length: 11 }, (_, i) => ({
        item: `Item ${i}`,
        id: `item${i}`,
      }));

      const result = await service.sendListPicker(
        '+27821234567',
        'Test',
        'Select',
        items,
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LIST_LIMIT_EXCEEDED');
      expect(result.error).toContain(`max ${CONTENT_LIMITS.MAX_LIST_ITEMS}`);
    });

    it('should truncate list item fields to limits', async () => {
      await service.sendListPicker('+27821234567', 'Test', 'Select', [
        {
          item: 'This item title is way too long for the limit',
          id: 'x'.repeat(250), // Exceeds 200 char limit
          description: 'y'.repeat(100), // Exceeds 72 char limit
        },
      ]);

      // Find content creation call
      const createCall = mockFetch.mock.calls.find(
        (call) =>
          call[0].includes('/Content') &&
          call[1]?.method === 'POST' &&
          !call[0].includes('/ApprovalRequests'),
      );

      const requestBody = JSON.parse(createCall[1].body);
      const item = requestBody.types['twilio/list-picker'].items[0];

      expect(item.item.length).toBe(CONTENT_LIMITS.LIST_ITEM_TITLE);
      expect(item.id.length).toBe(CONTENT_LIMITS.LIST_ITEM_ID);
      expect(item.description.length).toBe(
        CONTENT_LIMITS.LIST_ITEM_DESCRIPTION,
      );
    });
  });

  describe('getTemplate', () => {
    it('should return cached template by friendly name', () => {
      const template = service.getTemplate('invoice_notification');
      expect(template).toBeDefined();
      expect(template?.friendlyName).toBe('invoice_notification');
    });

    it('should return undefined for non-existent template', () => {
      const template = service.getTemplate('non_existent');
      expect(template).toBeUndefined();
    });
  });

  describe('getTemplateAsync', () => {
    it('should return cached template if available', async () => {
      const template = await service.getTemplateAsync('invoice_notification');
      expect(template).toBeDefined();
      expect(template?.friendlyName).toBe('invoice_notification');
    });

    it('should load from database if not cached', async () => {
      mockPrisma.whatsAppContentTemplate!.findUnique = jest
        .fn()
        .mockResolvedValue({
          contentSid: 'HXdb123',
          friendlyName: 'db_template',
          language: 'en',
          variables: {},
          approvalStatus: 'approved',
        });

      const template = await service.getTemplateAsync('db_template');

      expect(template).toBeDefined();
      expect(template?.sid).toBe('HXdb123');
      expect(
        mockPrisma.whatsAppContentTemplate!.findUnique,
      ).toHaveBeenCalledWith({
        where: { friendlyName: 'db_template' },
      });
    });

    it('should return null if template not found', async () => {
      mockPrisma.whatsAppContentTemplate!.findUnique = jest
        .fn()
        .mockResolvedValue(null);

      const template = await service.getTemplateAsync('unknown_template');
      expect(template).toBeNull();
    });
  });

  describe('registerTemplate', () => {
    it('should create template in Twilio and cache it', async () => {
      const result = await service.registerTemplate({
        friendlyName: 'new_template',
        language: 'en',
        category: 'UTILITY',
        variables: { '1': 'name' },
        types: {
          'twilio/text': { body: 'Hello {{1}}' },
        },
      });

      expect(result.success).toBe(true);
      expect(result.contentSid).toBe('HXnew123');
    });

    it('should persist template to database', async () => {
      await service.registerTemplate({
        friendlyName: 'new_template',
        language: 'en',
        category: 'UTILITY',
        variables: {},
        types: {},
      });

      expect(mockPrisma.whatsAppContentTemplate!.upsert).toHaveBeenCalled();
    });

    it('should return error on registration failure', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (
          url.includes('/Content') &&
          options?.method === 'POST' &&
          !url.includes('/ApprovalRequests')
        ) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ message: 'Registration failed' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ contents: [] }),
        });
      });

      const result = await service.registerTemplate({
        friendlyName: 'failed_template',
        language: 'en',
        category: 'UTILITY',
        variables: {},
        types: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Registration failed');
    });
  });

  describe('submitForApproval', () => {
    it('should submit template for WhatsApp approval', async () => {
      const result = await service.submitForApproval('HX123', 'UTILITY');

      expect(result.success).toBe(true);
      expect(result.status).toBe('pending');

      // Verify the approval request was made
      const approvalCall = mockFetch.mock.calls.find(
        (call) =>
          call[0].includes('/ApprovalRequests/whatsapp') &&
          call[1]?.method === 'POST',
      );
      expect(approvalCall).toBeDefined();
    });

    it('should update database with pending approval status', async () => {
      await service.submitForApproval('HX123', 'UTILITY');

      expect(
        mockPrisma.whatsAppContentTemplate!.updateMany,
      ).toHaveBeenCalledWith({
        where: { contentSid: 'HX123' },
        data: {
          approvalStatus: 'pending',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('getApprovalStatus', () => {
    it('should fetch and return approval status', async () => {
      const status = await service.getApprovalStatus('HX123');

      expect(status).toBe('approved');

      // Verify database was updated
      expect(
        mockPrisma.whatsAppContentTemplate!.updateMany,
      ).toHaveBeenCalledWith({
        where: { contentSid: 'HX123' },
        data: expect.objectContaining({
          approvalStatus: 'approved',
        }),
      });
    });
  });

  describe('getAllTemplates', () => {
    it('should return all cached templates', () => {
      const templates = service.getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });
  });

  describe('refreshCache', () => {
    it('should clear and reload templates', async () => {
      const initialCallCount = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/Content?PageSize='),
      ).length;

      await service.refreshCache();

      const finalCallCount = mockFetch.mock.calls.filter((call) =>
        call[0].includes('/Content?PageSize='),
      ).length;

      expect(finalCallCount).toBe(initialCallCount + 1);
    });
  });

  describe('phone number formatting', () => {
    it('should format 0-prefixed SA numbers', async () => {
      await service.sendContentMessage('0821234567', 'HX123', []);

      const messagesCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/Messages.json'),
      );
      expect(messagesCall[1].body).toContain('whatsapp%3A%2B27821234567');
    });

    it('should format 27-prefixed numbers', async () => {
      await service.sendContentMessage('27821234567', 'HX123', []);

      const messagesCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/Messages.json'),
      );
      expect(messagesCall[1].body).toContain('whatsapp%3A%2B27821234567');
    });

    it('should preserve E.164 format', async () => {
      await service.sendContentMessage('+27821234567', 'HX123', []);

      const messagesCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/Messages.json'),
      );
      expect(messagesCall[1].body).toContain('whatsapp%3A%2B27821234567');
    });

    it('should remove non-digit characters', async () => {
      await service.sendContentMessage('082-123-4567', 'HX123', []);

      const messagesCall = mockFetch.mock.calls.find((call) =>
        call[0].includes('/Messages.json'),
      );
      expect(messagesCall[1].body).toContain('whatsapp%3A%2B27821234567');
    });
  });
});

describe('TwilioContentService (unconfigured)', () => {
  let service: TwilioContentService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioContentService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
      ],
    }).compile();

    service = module.get<TwilioContentService>(TwilioContentService);
    await service.onModuleInit();
  });

  it('should report not configured', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('should throw when trying to load templates', async () => {
    await expect(service.loadTemplates()).rejects.toThrow(
      'Twilio Content API not configured',
    );
  });

  it('should throw when trying to send content message', async () => {
    await expect(
      service.sendContentMessage('+27821234567', 'HX123', []),
    ).rejects.toThrow('Twilio Content API not configured');
  });
});
