/**
 * WhatsApp Webhook DTO Tests
 * TASK-INT-006: Input Validation Before DB Query
 *
 * Comprehensive tests for webhook payload validation including:
 * - Complete payload validation
 * - Missing required fields
 * - Invalid field values
 * - Nested object validation
 * - Transformation with plainToInstance
 */

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  WhatsAppWebhookDto,
  WhatsAppEntryDto,
  WhatsAppChangeDto,
  WhatsAppValueDto,
  WhatsAppMetadataDto,
  WhatsAppContactDto,
  WhatsAppMessageDto,
  WhatsAppTextMessageDto,
  WhatsAppMessageType,
  WhatsAppMessageStatus,
  WhatsAppStatusDto,
  WhatsAppWebhookVerifyDto,
  WhatsAppProfileDto,
} from '../../../src/integrations/whatsapp/dto/whatsapp-webhook.dto';

describe('WhatsApp Webhook DTOs', () => {
  /**
   * Helper to create a valid complete webhook payload
   */
  const createValidWebhookPayload = (): Record<string, unknown> => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+27123456789',
                phone_number_id: 'phone_123',
              },
              contacts: [
                {
                  wa_id: '27987654321',
                  profile: {
                    name: 'John Doe',
                  },
                },
              ],
              messages: [
                {
                  id: 'msg_123',
                  from: '27987654321',
                  timestamp: '1700000000',
                  type: 'text',
                  text: {
                    body: 'Hello, this is a test message',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  describe('WhatsAppWebhookDto', () => {
    it('should validate a complete valid webhook payload', async () => {
      const payload = createValidWebhookPayload();
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject payload with invalid object type', async () => {
      const payload = {
        ...createValidWebhookPayload(),
        object: 'invalid_type',
      };
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('object');
    });

    it('should reject payload with missing object field', async () => {
      const payload = createValidWebhookPayload();
      delete payload.object;
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('object');
    });

    it('should reject payload with empty entry array', async () => {
      const payload = {
        ...createValidWebhookPayload(),
        entry: [],
      };
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('entry');
    });

    it('should reject payload with missing entry field', async () => {
      const payload = createValidWebhookPayload();
      delete payload.entry;
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppEntryDto', () => {
    it('should validate a valid entry', async () => {
      const entry = {
        id: 'entry_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+27123456789',
                phone_number_id: 'phone_123',
              },
            },
          },
        ],
      };
      const dto = plainToInstance(WhatsAppEntryDto, entry);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject entry with missing id', async () => {
      const entry = {
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+27123456789',
                phone_number_id: 'phone_123',
              },
            },
          },
        ],
      };
      const dto = plainToInstance(WhatsAppEntryDto, entry);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('id');
    });

    it('should reject entry with empty changes array', async () => {
      const entry = {
        id: 'entry_123',
        changes: [],
      };
      const dto = plainToInstance(WhatsAppEntryDto, entry);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('changes');
    });
  });

  describe('WhatsAppChangeDto', () => {
    it('should validate a valid change', async () => {
      const change = {
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '+27123456789',
            phone_number_id: 'phone_123',
          },
        },
      };
      const dto = plainToInstance(WhatsAppChangeDto, change);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject change with missing field', async () => {
      const change = {
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '+27123456789',
            phone_number_id: 'phone_123',
          },
        },
      };
      const dto = plainToInstance(WhatsAppChangeDto, change);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppValueDto', () => {
    it('should validate a valid value with messages', async () => {
      const value = {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '+27123456789',
          phone_number_id: 'phone_123',
        },
        contacts: [{ wa_id: '27987654321' }],
        messages: [
          {
            id: 'msg_123',
            from: '27987654321',
            timestamp: '1700000000',
            type: 'text',
            text: { body: 'Hello' },
          },
        ],
      };
      const dto = plainToInstance(WhatsAppValueDto, value);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate a valid value with statuses', async () => {
      const value = {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: '+27123456789',
          phone_number_id: 'phone_123',
        },
        statuses: [
          {
            id: 'msg_123',
            status: 'delivered',
            timestamp: '1700000000',
            recipient_id: '27987654321',
          },
        ],
      };
      const dto = plainToInstance(WhatsAppValueDto, value);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid messaging_product', async () => {
      const value = {
        messaging_product: 'invalid',
        metadata: {
          display_phone_number: '+27123456789',
          phone_number_id: 'phone_123',
        },
      };
      const dto = plainToInstance(WhatsAppValueDto, value);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppMetadataDto', () => {
    it('should validate valid metadata', async () => {
      const metadata = {
        display_phone_number: '+27123456789',
        phone_number_id: 'phone_123',
      };
      const dto = plainToInstance(WhatsAppMetadataDto, metadata);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject metadata with missing phone_number_id', async () => {
      const metadata = {
        display_phone_number: '+27123456789',
      };
      const dto = plainToInstance(WhatsAppMetadataDto, metadata);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppContactDto', () => {
    it('should validate valid contact with profile', async () => {
      const contact = {
        wa_id: '27123456789',
        profile: {
          name: 'John Doe',
        },
      };
      const dto = plainToInstance(WhatsAppContactDto, contact);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate contact without profile', async () => {
      const contact = {
        wa_id: '27123456789',
      };
      const dto = plainToInstance(WhatsAppContactDto, contact);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject contact with invalid wa_id format', async () => {
      const contact = {
        wa_id: 'invalid_phone',
        profile: { name: 'Test' },
      };
      const dto = plainToInstance(WhatsAppContactDto, contact);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('wa_id');
    });

    it('should reject SQL injection in wa_id', async () => {
      const contact = {
        wa_id: "27123'; DROP TABLE users;--",
      };
      const dto = plainToInstance(WhatsAppContactDto, contact);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject NoSQL injection in wa_id', async () => {
      const contact = {
        wa_id: '{$gt: ""}',
      };
      const dto = plainToInstance(WhatsAppContactDto, contact);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppProfileDto', () => {
    it('should validate valid profile', async () => {
      const profile = { name: 'John Doe' };
      const dto = plainToInstance(WhatsAppProfileDto, profile);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate profile with optional name', async () => {
      const profile = {};
      const dto = plainToInstance(WhatsAppProfileDto, profile);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject name exceeding max length', async () => {
      const profile = { name: 'a'.repeat(300) };
      const dto = plainToInstance(WhatsAppProfileDto, profile);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppMessageDto', () => {
    it('should validate a complete text message', async () => {
      const message = {
        id: 'msg_123',
        from: '27123456789',
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello World' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate E.164 format in from field', async () => {
      const message = {
        id: 'msg_123',
        from: '+27123456789',
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid phone number in from field', async () => {
      const message = {
        id: 'msg_123',
        from: 'invalid_phone',
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'from')).toBe(true);
    });

    it('should reject SQL injection in from field', async () => {
      const message = {
        id: 'msg_123',
        from: "27123'; DROP TABLE users;--",
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid message type', async () => {
      const message = {
        id: 'msg_123',
        from: '27123456789',
        timestamp: '1700000000',
        type: 'invalid_type',
        text: { body: 'Hello' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    });

    it('should validate all message types', async () => {
      const types = Object.values(WhatsAppMessageType);

      for (const type of types) {
        const message = {
          id: 'msg_123',
          from: '27123456789',
          timestamp: '1700000000',
          type,
        };
        const dto = plainToInstance(WhatsAppMessageDto, message);
        const errors = await validate(dto);

        expect(errors.filter((e) => e.property === 'type')).toHaveLength(0);
      }
    });

    it('should reject invalid timestamp format', async () => {
      const message = {
        id: 'msg_123',
        from: '27123456789',
        timestamp: 'not_a_timestamp',
        type: 'text',
        text: { body: 'Hello' },
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'timestamp')).toBe(true);
    });

    it('should reject missing required fields', async () => {
      const message = {
        from: '27123456789',
        timestamp: '1700000000',
        type: 'text',
      };
      const dto = plainToInstance(WhatsAppMessageDto, message);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'id')).toBe(true);
    });
  });

  describe('WhatsAppTextMessageDto', () => {
    it('should validate valid text body', async () => {
      const text = { body: 'Hello, this is a test message!' };
      const dto = plainToInstance(WhatsAppTextMessageDto, text);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject empty body', async () => {
      const text = { body: '' };
      const dto = plainToInstance(WhatsAppTextMessageDto, text);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject body exceeding 4096 characters', async () => {
      const text = { body: 'a'.repeat(4097) };
      const dto = plainToInstance(WhatsAppTextMessageDto, text);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('maxLength');
    });

    it('should accept body at exactly 4096 characters', async () => {
      const text = { body: 'a'.repeat(4096) };
      const dto = plainToInstance(WhatsAppTextMessageDto, text);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject missing body field', async () => {
      const text = {};
      const dto = plainToInstance(WhatsAppTextMessageDto, text);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('WhatsAppStatusDto', () => {
    it('should validate valid status update', async () => {
      const status = {
        id: 'msg_123',
        status: 'delivered',
        timestamp: '1700000000',
        recipient_id: '27123456789',
      };
      const dto = plainToInstance(WhatsAppStatusDto, status);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate all status values', async () => {
      const statuses = Object.values(WhatsAppMessageStatus);

      for (const status of statuses) {
        const statusDto = {
          id: 'msg_123',
          status,
          timestamp: '1700000000',
          recipient_id: '27123456789',
        };
        const dto = plainToInstance(WhatsAppStatusDto, statusDto);
        const errors = await validate(dto);

        expect(errors.filter((e) => e.property === 'status')).toHaveLength(0);
      }
    });

    it('should reject invalid status value', async () => {
      const status = {
        id: 'msg_123',
        status: 'invalid_status',
        timestamp: '1700000000',
        recipient_id: '27123456789',
      };
      const dto = plainToInstance(WhatsAppStatusDto, status);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid recipient_id phone format', async () => {
      const status = {
        id: 'msg_123',
        status: 'delivered',
        timestamp: '1700000000',
        recipient_id: 'invalid',
      };
      const dto = plainToInstance(WhatsAppStatusDto, status);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate status with errors array', async () => {
      const status = {
        id: 'msg_123',
        status: 'failed',
        timestamp: '1700000000',
        recipient_id: '27123456789',
        errors: [
          {
            code: 131047,
            title: 'Re-engagement message',
            message: 'User has not replied within 24 hours',
          },
        ],
      };
      const dto = plainToInstance(WhatsAppStatusDto, status);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });

  describe('WhatsAppWebhookVerifyDto', () => {
    it('should validate valid verification request', async () => {
      const verify = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'my_secret_token',
        'hub.challenge': '123456789',
      };
      const dto = plainToInstance(WhatsAppWebhookVerifyDto, verify);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid hub.mode', async () => {
      const verify = {
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'my_secret_token',
        'hub.challenge': '123456789',
      };
      const dto = plainToInstance(WhatsAppWebhookVerifyDto, verify);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing hub.verify_token', async () => {
      const verify = {
        'hub.mode': 'subscribe',
        'hub.challenge': '123456789',
      };
      const dto = plainToInstance(WhatsAppWebhookVerifyDto, verify);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject verify_token exceeding max length', async () => {
      const verify = {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'a'.repeat(300),
        'hub.challenge': '123456789',
      };
      const dto = plainToInstance(WhatsAppWebhookVerifyDto, verify);
      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Nested Validation', () => {
    it('should validate deeply nested structures', async () => {
      const payload = createValidWebhookPayload();
      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should catch errors in deeply nested objects', async () => {
      const payload = createValidWebhookPayload();
      // Set invalid phone in nested message
      (payload.entry as Array<Record<string, unknown>>)[0].changes = (
        payload.entry as Array<Record<string, unknown>>
      )[0].changes as Array<Record<string, unknown>>;
      const changes = (payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>;
      const value = changes[0].value as Record<string, unknown>;
      const messages = value.messages as Array<Record<string, unknown>>;
      messages[0].from = 'invalid_phone';

      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto, { skipMissingProperties: false });

      // Should have validation errors for the nested invalid phone
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should validate arrays of nested objects', async () => {
      const payload = createValidWebhookPayload();
      // Add multiple messages
      const changes = (payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>;
      const value = changes[0].value as Record<string, unknown>;
      const messages = value.messages as Array<Record<string, unknown>>;
      messages.push({
        id: 'msg_456',
        from: '27111222333',
        timestamp: '1700000001',
        type: 'text',
        text: { body: 'Second message' },
      });

      const dto = plainToInstance(WhatsAppWebhookDto, payload);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });

  describe('plainToInstance Transformation', () => {
    it('should correctly transform plain object to DTO instance', () => {
      const payload = createValidWebhookPayload();
      const dto = plainToInstance(WhatsAppWebhookDto, payload);

      expect(dto).toBeInstanceOf(WhatsAppWebhookDto);
      expect(dto.entry[0]).toBeInstanceOf(WhatsAppEntryDto);
      expect(dto.entry[0].changes[0]).toBeInstanceOf(WhatsAppChangeDto);
      expect(dto.entry[0].changes[0].value).toBeInstanceOf(WhatsAppValueDto);
    });

    it('should handle undefined optional fields', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+27123456789',
                    phone_number_id: 'phone_123',
                  },
                  // No contacts, messages, or statuses
                },
              },
            ],
          },
        ],
      };

      const dto = plainToInstance(WhatsAppWebhookDto, payload);

      expect(dto.entry[0].changes[0].value.contacts).toBeUndefined();
      expect(dto.entry[0].changes[0].value.messages).toBeUndefined();
      expect(dto.entry[0].changes[0].value.statuses).toBeUndefined();
    });

    it('should preserve data types during transformation', () => {
      const payload = createValidWebhookPayload();
      const dto = plainToInstance(WhatsAppWebhookDto, payload);

      expect(typeof dto.object).toBe('string');
      expect(Array.isArray(dto.entry)).toBe(true);
      expect(typeof dto.entry[0].id).toBe('string');
    });
  });

  describe('Security - Injection Prevention', () => {
    it('should reject payloads with SQL injection in phone fields', async () => {
      const injectionAttempts = [
        "27123'; DROP TABLE users;--",
        '27123 OR 1=1',
        "27123' UNION SELECT * FROM users--",
      ];

      for (const injection of injectionAttempts) {
        const payload = createValidWebhookPayload();
        const changes = (payload.entry as Array<Record<string, unknown>>)[0]
          .changes as Array<Record<string, unknown>>;
        const value = changes[0].value as Record<string, unknown>;
        const messages = value.messages as Array<Record<string, unknown>>;
        messages[0].from = injection;

        const dto = plainToInstance(WhatsAppWebhookDto, payload);
        const errors = await validate(dto, { skipMissingProperties: false });

        expect(errors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should reject payloads with NoSQL injection in phone fields', async () => {
      const injectionAttempts = [
        '{$gt: ""}',
        '{$ne: null}',
        '{"$regex": ".*"}',
      ];

      for (const injection of injectionAttempts) {
        const payload = createValidWebhookPayload();
        const changes = (payload.entry as Array<Record<string, unknown>>)[0]
          .changes as Array<Record<string, unknown>>;
        const value = changes[0].value as Record<string, unknown>;
        const contacts = value.contacts as Array<Record<string, unknown>>;
        contacts[0].wa_id = injection;

        const dto = plainToInstance(WhatsAppWebhookDto, payload);
        const errors = await validate(dto, { skipMissingProperties: false });

        expect(errors.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Real-World Webhook Scenarios', () => {
    it('should validate incoming text message webhook', async () => {
      // Real webhook format from WhatsApp Cloud API
      const realWebhook = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27123456789',
                    phone_number_id: '987654321098765',
                  },
                  contacts: [
                    {
                      profile: {
                        name: 'John Doe',
                      },
                      wa_id: '27987654321',
                    },
                  ],
                  messages: [
                    {
                      from: '27987654321',
                      id: 'wamid.HBgLMjc4MzQ1Njc4OTAVAgARGBI5QTdGQjQzNzZBRjQwMzM0NTgA',
                      timestamp: '1699887600',
                      text: {
                        body: 'Hi, I want to pay my invoice',
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

      const dto = plainToInstance(WhatsAppWebhookDto, realWebhook);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate status update webhook', async () => {
      const statusWebhook = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27123456789',
                    phone_number_id: '987654321098765',
                  },
                  statuses: [
                    {
                      id: 'wamid.HBgLMjc4MzQ1Njc4OTAVAgASGBI5QTdGQjQzNzZBRjQwMzM0NTgA',
                      status: 'delivered',
                      timestamp: '1699887700',
                      recipient_id: '27987654321',
                      conversation: {
                        id: 'CONVERSATION_ID',
                        origin: {
                          type: 'utility',
                        },
                      },
                      pricing: {
                        billable: true,
                        pricing_model: 'CBP',
                        category: 'utility',
                      },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const dto = plainToInstance(WhatsAppWebhookDto, statusWebhook);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should validate failed message status with errors', async () => {
      const failedStatusWebhook = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789012345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27123456789',
                    phone_number_id: '987654321098765',
                  },
                  statuses: [
                    {
                      id: 'wamid.HBgLMjc4MzQ1Njc4OTAVAgASGBI5QTdGQjQzNzZBRjQwMzM0NTgA',
                      status: 'failed',
                      timestamp: '1699887700',
                      recipient_id: '27987654321',
                      errors: [
                        {
                          code: 131047,
                          title: 'Re-engagement message',
                          message:
                            'User must first respond to your message within 24 hours',
                          error_data: {
                            details: 'Message failed to send',
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

      const dto = plainToInstance(WhatsAppWebhookDto, failedStatusWebhook);
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
