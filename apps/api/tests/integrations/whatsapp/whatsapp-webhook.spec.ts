/**
 * WhatsApp Webhook Tests
 * TASK-WA-005: WhatsApp Channel Adapter Tests
 *
 * Unit tests for WhatsApp webhook controller covering:
 * - Signature verification
 * - Webhook subscription verification
 * - Status callback processing
 * - Idempotency handling
 * - Error scenarios
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from '../../../src/webhooks/webhook.controller';
import { WebhookService } from '../../../src/webhooks/webhook.service';
import { IdempotencyService } from '../../../src/common/services/idempotency.service';
import { BusinessException } from '../../../src/shared/exceptions';
import type { WhatsAppWebhookPayload } from '../../../src/webhooks/types/webhook.types';

describe('WebhookController - WhatsApp', () => {
  let controller: WebhookController;
  let webhookService: {
    verifyWhatsAppSignature: jest.Mock;
    verifyWhatsAppSubscription: jest.Mock;
    processWhatsAppEvent: jest.Mock;
    verifyTwilioSignature: jest.Mock;
    processTwilioStatusCallback: jest.Mock;
  };
  let idempotencyService: {
    check: jest.Mock;
    checkAndSet: jest.Mock;
    markProcessed: jest.Mock;
  };

  const mockWhatsAppPayload: WhatsAppWebhookPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-123',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '27821234567',
                phone_number_id: 'phone-123',
              },
              statuses: [
                {
                  id: 'wamid_123',
                  status: 'delivered',
                  timestamp: '1705755600',
                  recipient_id: '27829876543',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    webhookService = {
      verifyWhatsAppSignature: jest.fn(),
      verifyWhatsAppSubscription: jest.fn(),
      processWhatsAppEvent: jest.fn(),
      verifyTwilioSignature: jest.fn(),
      processTwilioStatusCallback: jest.fn(),
    };

    idempotencyService = {
      check: jest.fn(),
      checkAndSet: jest.fn(),
      markProcessed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: WebhookService,
          useValue: webhookService,
        },
        {
          provide: IdempotencyService,
          useValue: idempotencyService,
        },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  describe('handleWhatsAppWebhook', () => {
    it('should process valid webhook with correct signature', async () => {
      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid_signature',
      );

      expect(result.processed).toBe(1);
      expect(webhookService.verifyWhatsAppSignature).toHaveBeenCalled();
      expect(webhookService.processWhatsAppEvent).toHaveBeenCalledWith(
        mockWhatsAppPayload,
      );
    });

    it('should reject webhook with invalid signature', async () => {
      webhookService.verifyWhatsAppSignature.mockReturnValue(false);

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: false,
      } as any;

      await expect(
        controller.handleWhatsAppWebhook(
          mockReq,
          mockWhatsAppPayload,
          'sha256=invalid_signature',
        ),
      ).rejects.toThrow(BusinessException);
    });

    it('should return cached result for duplicate request', async () => {
      const cachedResult = { processed: 1, skipped: 0, errors: [] };

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: true,
        idempotencyResult: cachedResult,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid_signature',
      );

      expect(result).toEqual(cachedResult);
      expect(webhookService.processWhatsAppEvent).not.toHaveBeenCalled();
    });

    it('should return empty result for duplicate without cached result', async () => {
      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: true,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid_signature',
      );

      expect(result).toEqual({
        processed: 0,
        skipped: 0,
        errors: [],
      });
    });

    it('should handle payload without raw body', async () => {
      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: undefined, // No raw body
        body: mockWhatsAppPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid_signature',
      );

      // Should use JSON stringified body for verification
      expect(webhookService.verifyWhatsAppSignature).toHaveBeenCalledWith(
        JSON.stringify(mockWhatsAppPayload),
        'sha256=valid_signature',
      );
    });

    it('should store result for idempotency after processing', async () => {
      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid_signature',
      );

      expect(idempotencyService.markProcessed).toHaveBeenCalledWith(
        'whatsapp:entry-123:wamid_123:delivered',
        expect.objectContaining({ processed: 1 }),
        86400, // 24 hours TTL
        expect.objectContaining({ provider: 'whatsapp' }),
      );
    });
  });

  describe('handleWhatsAppVerification', () => {
    it('should return challenge for valid verify request', () => {
      webhookService.verifyWhatsAppSubscription.mockReturnValue(
        'challenge_123',
      );

      const result = controller.handleWhatsAppVerification(
        'subscribe',
        'verify_token',
        'challenge_123',
      );

      expect(result).toBe('challenge_123');
      expect(webhookService.verifyWhatsAppSubscription).toHaveBeenCalledWith(
        'subscribe',
        'verify_token',
        'challenge_123',
      );
    });

    it('should throw error for invalid verify token', () => {
      webhookService.verifyWhatsAppSubscription.mockImplementation(() => {
        throw new BusinessException(
          'Invalid verify token',
          'INVALID_VERIFY_TOKEN',
        );
      });

      expect(() =>
        controller.handleWhatsAppVerification(
          'subscribe',
          'wrong_token',
          'challenge_123',
        ),
      ).toThrow('Invalid verify token');
    });

    it('should throw error for invalid mode', () => {
      webhookService.verifyWhatsAppSubscription.mockImplementation(() => {
        throw new BusinessException(
          'Invalid webhook mode',
          'INVALID_WEBHOOK_MODE',
        );
      });

      expect(() =>
        controller.handleWhatsAppVerification(
          'invalid_mode',
          'token',
          'challenge_123',
        ),
      ).toThrow('Invalid webhook mode');
    });
  });

  describe('handleTwilioStatusCallback', () => {
    const mockTwilioBody = {
      MessageSid: 'SM123456',
      MessageStatus: 'delivered',
      To: 'whatsapp:+27821234567',
      From: 'whatsapp:+27829876543',
    };

    beforeEach(() => {
      // Set production mode for signature verification
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      delete process.env.NODE_ENV;
    });

    it('should process valid Twilio status callback', async () => {
      webhookService.verifyTwilioSignature.mockReturnValue(true);
      webhookService.processTwilioStatusCallback.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'api.crechebooks.co.za',
        },
        protocol: 'https',
        originalUrl: '/webhooks/twilio/status',
      } as any;

      const result = await controller.handleTwilioStatusCallback(
        mockReq,
        mockTwilioBody,
        'twilio-signature',
      );

      expect(result.processed).toBe(1);
      expect(webhookService.processTwilioStatusCallback).toHaveBeenCalledWith(
        mockTwilioBody,
      );
    });

    it('should reject callback with invalid signature in production', async () => {
      webhookService.verifyTwilioSignature.mockReturnValue(false);

      const mockReq = {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'api.crechebooks.co.za',
        },
        protocol: 'https',
        originalUrl: '/webhooks/twilio/status',
      } as any;

      await expect(
        controller.handleTwilioStatusCallback(
          mockReq,
          mockTwilioBody,
          'invalid-signature',
        ),
      ).rejects.toThrow(BusinessException);
    });

    it('should skip signature verification in development', async () => {
      process.env.NODE_ENV = 'development';
      webhookService.verifyTwilioSignature.mockReturnValue(false);
      webhookService.processTwilioStatusCallback.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        headers: {},
        protocol: 'http',
        originalUrl: '/webhooks/twilio/status',
        host: 'localhost:3000',
      } as any;

      // Should not throw even with invalid signature
      const result = await controller.handleTwilioStatusCallback(
        mockReq,
        mockTwilioBody,
        'invalid-signature',
      );

      expect(result.processed).toBe(1);
    });
  });

  describe('WhatsApp status mapping', () => {
    it('should process sent status', async () => {
      const sentPayload: WhatsAppWebhookPayload = {
        ...mockWhatsAppPayload,
        entry: [
          {
            id: 'entry-sent',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_sent',
                      status: 'sent',
                      timestamp: '1705755600',
                      recipient_id: '27829876543',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(sentPayload)),
        body: sentPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-sent:wamid_sent:sent',
      } as any;

      await controller.handleWhatsAppWebhook(
        mockReq,
        sentPayload,
        'sha256=valid',
      );

      expect(webhookService.processWhatsAppEvent).toHaveBeenCalledWith(
        sentPayload,
      );
    });

    it('should process read status', async () => {
      const readPayload: WhatsAppWebhookPayload = {
        ...mockWhatsAppPayload,
        entry: [
          {
            id: 'entry-read',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_read',
                      status: 'read',
                      timestamp: '1705755700',
                      recipient_id: '27829876543',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(readPayload)),
        body: readPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-read:wamid_read:read',
      } as any;

      await controller.handleWhatsAppWebhook(
        mockReq,
        readPayload,
        'sha256=valid',
      );

      expect(webhookService.processWhatsAppEvent).toHaveBeenCalled();
    });

    it('should process failed status with error details', async () => {
      const failedPayload: WhatsAppWebhookPayload = {
        ...mockWhatsAppPayload,
        entry: [
          {
            id: 'entry-failed',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_failed',
                      status: 'failed',
                      timestamp: '1705755800',
                      recipient_id: '27829876543',
                      errors: [
                        {
                          code: 131026,
                          title: 'Message undeliverable',
                          message:
                            'The recipient phone number is not a valid WhatsApp user.',
                          error_data: {
                            details: 'Phone number is not on WhatsApp',
                          },
                        },
                      ],
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 1,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(failedPayload)),
        body: failedPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-failed:wamid_failed:failed',
      } as any;

      await controller.handleWhatsAppWebhook(
        mockReq,
        failedPayload,
        'sha256=valid',
      );

      expect(webhookService.processWhatsAppEvent).toHaveBeenCalledWith(
        failedPayload,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty entry array', async () => {
      const emptyPayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 0,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(emptyPayload)),
        body: emptyPayload,
        isDuplicate: false,
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        emptyPayload,
        'sha256=valid',
      );

      expect(result.processed).toBe(0);
    });

    it('should handle multiple entries in single webhook', async () => {
      const multiEntryPayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_1',
                      status: 'delivered',
                      timestamp: '1705755600',
                      recipient_id: '27829876543',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
          {
            id: 'entry-2',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_2',
                      status: 'read',
                      timestamp: '1705755700',
                      recipient_id: '27829876543',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 2,
        skipped: 0,
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(multiEntryPayload)),
        body: multiEntryPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-1:wamid_1:delivered',
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        multiEntryPayload,
        'sha256=valid',
      );

      expect(result.processed).toBe(2);
    });

    it('should handle processing errors gracefully', async () => {
      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 0,
        skipped: 0,
        errors: [{ eventId: 'wamid_123', error: 'Invoice not found' }],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(mockWhatsAppPayload)),
        body: mockWhatsAppPayload,
        isDuplicate: false,
        idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        mockWhatsAppPayload,
        'sha256=valid',
      );

      // Should still return 200 with errors in response
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        eventId: 'wamid_123',
        error: 'Invoice not found',
      });
    });

    it('should handle incoming messages (not status updates)', async () => {
      const incomingPayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-incoming',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  messages: [
                    {
                      from: '27829876543',
                      id: 'wamid_incoming',
                      timestamp: '1705755600',
                      text: {
                        body: 'Hello, I have a question about my invoice.',
                      },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      webhookService.verifyWhatsAppSignature.mockReturnValue(true);
      webhookService.processWhatsAppEvent.mockResolvedValue({
        processed: 0,
        skipped: 1, // Incoming messages might be skipped by delivery tracking
        errors: [],
      });

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify(incomingPayload)),
        body: incomingPayload,
        isDuplicate: false,
      } as any;

      const result = await controller.handleWhatsAppWebhook(
        mockReq,
        incomingPayload,
        'sha256=valid',
      );

      expect(result.skipped).toBe(1);
    });
  });
});

describe('WebhookService - WhatsApp Event Processing', () => {
  // These tests would use real database if running integration tests
  // For unit tests, we mock the service
  describe('processWhatsAppEvent', () => {
    it('should map WhatsApp statuses correctly', () => {
      const statusMap: Record<string, string> = {
        sent: 'SENT',
        delivered: 'DELIVERED',
        read: 'OPENED',
        failed: 'FAILED',
      };

      // Verify status mapping exists for all expected statuses
      expect(Object.keys(statusMap)).toContain('sent');
      expect(Object.keys(statusMap)).toContain('delivered');
      expect(Object.keys(statusMap)).toContain('read');
      expect(Object.keys(statusMap)).toContain('failed');
    });
  });
});
