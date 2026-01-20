/**
 * Webhook Signature Guard Tests
 * TASK-SEC-102: Webhook Signature Validation
 *
 * @description Comprehensive tests for the unified WebhookSignatureGuard.
 * Tests all provider signature verification methods and edge cases.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  WebhookSignatureGuard,
  WEBHOOK_PROVIDER_KEY,
  WebhookProvider,
} from '../../../webhooks/guards/webhook-signature.guard';

describe('WebhookSignatureGuard', () => {
  let guard: WebhookSignatureGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockConfigService: jest.Mocked<ConfigService>;

  interface MockRequest {
    body?: Record<string, unknown>;
    headers?: Record<string, string | undefined>;
    rawBody?: Buffer;
  }

  const createMockExecutionContext = (
    request: MockRequest,
    provider?: WebhookProvider,
  ): ExecutionContext => {
    const mockRequest = {
      body: {},
      headers: {},
      ...request,
    };

    const handler = jest.fn();
    if (provider) {
      mockReflector.get.mockReturnValue(provider);
    }

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => handler,
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    mockReflector = {
      get: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSignatureGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<WebhookSignatureGuard>(WebhookSignatureGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Configuration', () => {
    it('should throw UnauthorizedException when no provider is specified', () => {
      mockReflector.get.mockReturnValue(undefined);

      const context = createMockExecutionContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Webhook provider not configured',
      );
    });

    it('should throw UnauthorizedException for unknown provider', () => {
      mockReflector.get.mockReturnValue('unknown-provider');

      const context = createMockExecutionContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Unknown webhook provider: unknown-provider',
      );
    });

    it('should throw UnauthorizedException when secret is not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': 'some-signature' },
        },
        'simplepay',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'SIMPLEPAY_WEBHOOK_SECRET not configured',
      );
    });
  });

  describe('SimplePay Signature Verification', () => {
    const SIMPLEPAY_SECRET = 'simplepay-test-secret';

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });
    });

    it('should verify valid SimplePay signature (hex encoding)', () => {
      const payload = JSON.stringify({ event: 'payrun.completed', data: {} });
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject invalid SimplePay signature', () => {
      const payload = JSON.stringify({ event: 'payrun.completed', data: {} });

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': 'invalid-signature' },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Invalid webhook signature',
      );
    });

    it('should throw UnauthorizedException when SimplePay signature header is missing', () => {
      const payload = JSON.stringify({ event: 'payrun.completed', data: {} });

      const context = createMockExecutionContext(
        {
          headers: {},
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow(
        'Missing webhook signature',
      );
    });

    it('should use raw body for signature verification when available', () => {
      const rawPayload = '{"event":"payrun.completed","data":{}}';
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(rawPayload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(rawPayload),
          body: { event: 'payrun.completed', data: {} },
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should fall back to JSON.stringify(body) when rawBody is not available', () => {
      const body = { event: 'payrun.completed', data: {} };
      const stringifiedBody = JSON.stringify(body);
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(stringifiedBody)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          body,
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Xero Signature Verification', () => {
    const XERO_SECRET = 'xero-test-secret';

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'XERO_WEBHOOK_SECRET') return XERO_SECRET;
        return undefined;
      });
    });

    it('should verify valid Xero signature (base64 encoding)', () => {
      const payload = JSON.stringify({ events: [] });
      const expectedSignature = crypto
        .createHmac('sha256', XERO_SECRET)
        .update(payload)
        .digest('base64');

      const context = createMockExecutionContext(
        {
          headers: { 'x-xero-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'xero',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject invalid Xero signature', () => {
      const payload = JSON.stringify({ events: [] });

      const context = createMockExecutionContext(
        {
          headers: { 'x-xero-signature': 'invalid-base64-signature' },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'xero',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('Stripe Signature Verification', () => {
    const STRIPE_SECRET = 'whsec_test_secret';

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'STRIPE_WEBHOOK_SECRET') return STRIPE_SECRET;
        return undefined;
      });
    });

    it('should verify valid Stripe signature with timestamp', () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', STRIPE_SECRET)
        .update(signedPayload)
        .digest('hex');

      const stripeSignature = `t=${timestamp},v1=${signature}`;

      const context = createMockExecutionContext(
        {
          headers: { 'stripe-signature': stripeSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'stripe',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject Stripe signature with missing timestamp', () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });

      const context = createMockExecutionContext(
        {
          headers: { 'stripe-signature': 'v1=somesignature' },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'stripe',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should reject Stripe signature with missing v1 signature', () => {
      const payload = JSON.stringify({ type: 'payment_intent.succeeded' });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const context = createMockExecutionContext(
        {
          headers: { 'stripe-signature': `t=${timestamp}` },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'stripe',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('WhatsApp/Meta Signature Verification', () => {
    const WHATSAPP_SECRET = 'whatsapp-app-secret';

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'WHATSAPP_APP_SECRET') return WHATSAPP_SECRET;
        return undefined;
      });
    });

    it('should verify valid WhatsApp signature with sha256= prefix', () => {
      const payload = JSON.stringify({ entry: [] });
      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', WHATSAPP_SECRET)
          .update(payload)
          .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-hub-signature-256': expectedSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'whatsapp',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject WhatsApp signature without sha256= prefix', () => {
      const payload = JSON.stringify({ entry: [] });
      const signatureWithoutPrefix = crypto
        .createHmac('sha256', WHATSAPP_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-hub-signature-256': signatureWithoutPrefix },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'whatsapp',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('SendGrid Signature Verification', () => {
    const SENDGRID_SECRET = 'sendgrid-verification-key';

    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SENDGRID_WEBHOOK_KEY') return SENDGRID_SECRET;
        return undefined;
      });
    });

    it('should verify valid SendGrid signature with timestamp', () => {
      const payload = JSON.stringify([{ event: 'delivered' }]);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payloadToSign = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', SENDGRID_SECRET)
        .update(payloadToSign)
        .digest('base64');

      const context = createMockExecutionContext(
        {
          headers: {
            'x-twilio-email-event-webhook-signature': expectedSignature,
            'x-twilio-email-event-webhook-timestamp': timestamp,
          },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'sendgrid',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject SendGrid signature without timestamp header', () => {
      const payload = JSON.stringify([{ event: 'delivered' }]);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payloadToSign = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', SENDGRID_SECRET)
        .update(payloadToSign)
        .digest('base64');

      const context = createMockExecutionContext(
        {
          headers: {
            'x-twilio-email-event-webhook-signature': expectedSignature,
            // Missing timestamp header
          },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'sendgrid',
      );

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should use constant-time comparison for signatures', () => {
      // This test verifies the behavior, not the timing
      // The actual timing-safe comparison is handled by crypto.timingSafeEqual
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ event: 'test' });
      const validSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      // Valid signature should pass
      const validContext = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': validSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(guard.canActivate(validContext)).toBe(true);

      // Similar but different signature should fail
      const invalidSignature = validSignature.slice(0, -1) + 'x';
      const invalidContext = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': invalidSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(invalidContext)).toThrow(
        UnauthorizedException,
      );
    });

    it('should handle different length signatures safely', () => {
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ event: 'test' });

      // Very short signature (different length)
      const shortContext = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': 'short' },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(shortContext)).toThrow(
        UnauthorizedException,
      );

      // Very long signature (different length)
      const longSignature = 'a'.repeat(1000);
      const longContext = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': longSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(longContext)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty object payload', () => {
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      // Empty object as payload
      const payload = '{}';
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: {},
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle unicode payload', () => {
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ name: 'Test User \u00E9\u00E8\u00EA' });
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle large payload', () => {
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      // Create a large payload (100KB)
      const largeData = { data: 'x'.repeat(100000) };
      const payload = JSON.stringify(largeData);
      const expectedSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: largeData,
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should handle special characters in secret', () => {
      const SPECIAL_SECRET = 'secret!@#$%^&*()_+-=[]{}|;:,.<>?';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SPECIAL_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ event: 'test' });
      const expectedSignature = crypto
        .createHmac('sha256', SPECIAL_SECRET)
        .update(payload)
        .digest('hex');

      const context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': expectedSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('Encoding Differences', () => {
    it('should use hex encoding for SimplePay (NOT base64)', () => {
      const SIMPLEPAY_SECRET = 'simplepay-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'SIMPLEPAY_WEBHOOK_SECRET') return SIMPLEPAY_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ event: 'test' });

      // Generate base64 signature (WRONG for SimplePay)
      const base64Signature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('base64');

      // Generate hex signature (CORRECT for SimplePay)
      const hexSignature = crypto
        .createHmac('sha256', SIMPLEPAY_SECRET)
        .update(payload)
        .digest('hex');

      // Base64 should fail
      const base64Context = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': base64Signature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(() => guard.canActivate(base64Context)).toThrow(
        UnauthorizedException,
      );

      // Hex should succeed
      const hexContext = createMockExecutionContext(
        {
          headers: { 'x-simplepay-signature': hexSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'simplepay',
      );

      expect(guard.canActivate(hexContext)).toBe(true);
    });

    it('should use base64 encoding for Xero (NOT hex)', () => {
      const XERO_SECRET = 'xero-test-secret';
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'XERO_WEBHOOK_SECRET') return XERO_SECRET;
        return undefined;
      });

      const payload = JSON.stringify({ events: [] });

      // Generate hex signature (WRONG for Xero)
      const hexSignature = crypto
        .createHmac('sha256', XERO_SECRET)
        .update(payload)
        .digest('hex');

      // Generate base64 signature (CORRECT for Xero)
      const base64Signature = crypto
        .createHmac('sha256', XERO_SECRET)
        .update(payload)
        .digest('base64');

      // Hex should fail
      const hexContext = createMockExecutionContext(
        {
          headers: { 'x-xero-signature': hexSignature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'xero',
      );

      expect(() => guard.canActivate(hexContext)).toThrow(
        UnauthorizedException,
      );

      // Base64 should succeed
      const base64Context = createMockExecutionContext(
        {
          headers: { 'x-xero-signature': base64Signature },
          rawBody: Buffer.from(payload),
          body: JSON.parse(payload),
        },
        'xero',
      );

      expect(guard.canActivate(base64Context)).toBe(true);
    });
  });
});
