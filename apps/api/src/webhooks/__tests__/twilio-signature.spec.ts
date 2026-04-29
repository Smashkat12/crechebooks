/**
 * Unit tests for WebhookService.verifyTwilioSignature
 * SEC-08: Regression guard — ensure HMAC-SHA1 verification uses sorted params
 *
 * These tests do NOT touch the database. All Prisma-dependent behaviour lives
 * in webhook.service.spec.ts (which requires a local Postgres instance).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as crypto from 'crypto';
import { WebhookService } from '../webhook.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';

// Minimal stubs so NestJS DI resolves without a live DB
const mockPrisma = {};
const mockAuditLog = {};

describe('WebhookService.verifyTwilioSignature (unit)', () => {
  let service: WebhookService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  /**
   * Build the Twilio signature string exactly as documented:
   * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
   */
  function buildTwilioSignature(
    token: string,
    url: string,
    params: Record<string, string>,
  ): string {
    let data = url;
    for (const key of Object.keys(params).sort()) {
      data += key + params[key];
    }
    return crypto
      .createHmac('sha1', token)
      .update(data, 'utf-8')
      .digest('base64');
  }

  describe('when TWILIO_AUTH_TOKEN is not configured', () => {
    it('should return false (fail-closed) when token is absent and signature provided', () => {
      (service as any).twilioAuthToken = undefined;
      const result = service.verifyTwilioSignature(
        'https://example.com/webhooks/twilio/status',
        { MessageSid: 'SMxxx', MessageStatus: 'delivered' },
        'some-signature',
      );
      // Dev shortcut: returns false when token missing (SEC-01 maps false → 401)
      expect(result).toBe(false);
    });
  });

  describe('when TWILIO_AUTH_TOKEN is configured', () => {
    const TOKEN = 'test-twilio-auth-token';
    const URL = 'https://api.example.com/api/v1/webhooks/twilio/status';

    beforeEach(() => {
      (service as any).twilioAuthToken = TOKEN;
    });

    afterEach(() => {
      (service as any).twilioAuthToken = undefined;
    });

    it('should return false when signature header is absent', () => {
      const result = service.verifyTwilioSignature(
        URL,
        { MessageSid: 'SMxxx', MessageStatus: 'delivered' },
        '',
      );
      expect(result).toBe(false);
    });

    it('should verify a valid HMAC-SHA1 signature computed over url+sorted-params', () => {
      const params: Record<string, string> = {
        MessageStatus: 'delivered',
        MessageSid: 'SMxxx123',
        To: 'whatsapp:+27600123456',
        From: 'whatsapp:+27821234567',
      };
      const sig = buildTwilioSignature(TOKEN, URL, params);

      const result = service.verifyTwilioSignature(URL, params, sig);
      expect(result).toBe(true);
    });

    it('should reject a signature computed with the wrong URL', () => {
      const params: Record<string, string> = {
        MessageStatus: 'delivered',
        MessageSid: 'SMxxx123',
      };
      // Sign with a different URL
      const sigForWrongUrl = buildTwilioSignature(
        TOKEN,
        'https://attacker.example.com/inject',
        params,
      );

      const result = service.verifyTwilioSignature(URL, params, sigForWrongUrl);
      expect(result).toBe(false);
    });

    it('should reject a signature when POST params are tampered (body integrity)', () => {
      const originalParams: Record<string, string> = {
        MessageStatus: 'delivered',
        MessageSid: 'SMoriginal',
      };
      const validSig = buildTwilioSignature(TOKEN, URL, originalParams);

      // Attacker changes MessageSid in the body
      const tamperedParams: Record<string, string> = {
        MessageStatus: 'delivered',
        MessageSid: 'SMtampered',
      };

      const result = service.verifyTwilioSignature(
        URL,
        tamperedParams,
        validSig,
      );
      expect(result).toBe(false);
    });

    it('should reject a signature computed with the wrong token', () => {
      const params: Record<string, string> = {
        MessageStatus: 'sent',
        MessageSid: 'SMabc',
      };
      const sigWithWrongToken = buildTwilioSignature(
        'wrong-token',
        URL,
        params,
      );

      const result = service.verifyTwilioSignature(
        URL,
        params,
        sigWithWrongToken,
      );
      expect(result).toBe(false);
    });

    it('should handle params with special characters correctly', () => {
      const params: Record<string, string> = {
        Body: 'Hello World! Special: &=+#',
        From: 'whatsapp:+27821234567',
        MessageSid: 'SMspecial',
      };
      const sig = buildTwilioSignature(TOKEN, URL, params);

      const result = service.verifyTwilioSignature(URL, params, sig);
      expect(result).toBe(true);
    });
  });
});
