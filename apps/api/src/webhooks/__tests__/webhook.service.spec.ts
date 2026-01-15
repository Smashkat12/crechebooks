/**
 * Webhook Service Tests
 * TASK-BILL-035: Delivery Status Webhook Handlers
 *
 * @description Tests for webhook processing with real database operations.
 * NO MOCK DATA - Uses actual database operations with test data.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { WebhookService } from '../webhook.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import {
  mapEmailEventToStatus,
  mapWhatsAppStatusToDeliveryStatus,
  shouldUpdateStatus,
  EmailEvent,
  WhatsAppWebhookPayload,
} from '../types/webhook.types';

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: PrismaService;

  // Test data IDs
  let testTenantId: string;
  let testParentId: string;
  let testChildId: string;
  let testInvoiceId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [WebhookService, PrismaService, AuditLogService],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    prisma = module.get<PrismaService>(PrismaService);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    await prisma.$disconnect();
  });

  /**
   * Setup test data in database
   */
  async function setupTestData(): Promise<void> {
    const timestamp = Date.now();

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        id: `test-webhook-tenant-${timestamp}`,
        name: 'Test Webhook Creche',
        tradingName: 'Webhook Test Daycare',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27 21 123 4567',
        email: `webhook-test-${timestamp}@test.co.za`,
        taxStatus: 'NOT_REGISTERED',
      },
    });
    testTenantId = tenant.id;

    // Create parent
    const parent = await prisma.parent.create({
      data: {
        id: `test-webhook-parent-${timestamp}`,
        tenant: { connect: { id: testTenantId } },
        firstName: 'Test',
        lastName: 'Parent',
        email: `parent-${timestamp}@test.co.za`,
        phone: '+27821234567',
        preferredContact: 'EMAIL',
      },
    });
    testParentId = parent.id;

    // Create child
    const child = await prisma.child.create({
      data: {
        id: `test-webhook-child-${timestamp}`,
        tenant: { connect: { id: testTenantId } },
        parent: { connect: { id: testParentId } },
        firstName: 'Test',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-01'),
        gender: 'MALE',
        medicalNotes: '',
      },
    });
    testChildId = child.id;

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        id: `test-webhook-invoice-${timestamp}`,
        tenant: { connect: { id: testTenantId } },
        parent: { connect: { id: testParentId } },
        child: { connect: { id: testChildId } },
        invoiceNumber: `INV-WEBHOOK-${timestamp}`,
        billingPeriodStart: new Date('2024-01-01'),
        billingPeriodEnd: new Date('2024-01-31'),
        issueDate: new Date('2024-01-01'),
        dueDate: new Date('2024-01-15'),
        subtotalCents: 100000,
        vatCents: 15000,
        totalCents: 115000,
        status: 'DRAFT',
        deliveryStatus: 'SENT',
      },
    });
    testInvoiceId = invoice.id;
  }

  /**
   * Cleanup test data from database
   */
  async function cleanupTestData(): Promise<void> {
    try {
      if (testInvoiceId) {
        await prisma.invoiceDeliveryLog
          .deleteMany({ where: { invoiceId: testInvoiceId } })
          .catch(() => {});
        await prisma.invoice
          .delete({ where: { id: testInvoiceId } })
          .catch(() => {});
      }
      if (testChildId) {
        await prisma.child
          .delete({ where: { id: testChildId } })
          .catch(() => {});
      }
      if (testParentId) {
        await prisma.parent
          .delete({ where: { id: testParentId } })
          .catch(() => {});
      }
      if (testTenantId) {
        await prisma.tenant
          .delete({ where: { id: testTenantId } })
          .catch(() => {});
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  describe('Type Mapping Functions', () => {
    it('should map email events to delivery status correctly', () => {
      expect(mapEmailEventToStatus('delivered')).toBe('DELIVERED');
      expect(mapEmailEventToStatus('open')).toBe('OPENED');
      expect(mapEmailEventToStatus('click')).toBe('CLICKED');
      expect(mapEmailEventToStatus('bounce')).toBe('BOUNCED');
      expect(mapEmailEventToStatus('dropped')).toBe('BOUNCED');
      expect(mapEmailEventToStatus('spam_report')).toBe('COMPLAINED');
      expect(mapEmailEventToStatus('processed')).toBeNull();
      expect(mapEmailEventToStatus('deferred')).toBeNull();
    });

    it('should map WhatsApp statuses to delivery status correctly', () => {
      expect(mapWhatsAppStatusToDeliveryStatus('sent')).toBe('SENT');
      expect(mapWhatsAppStatusToDeliveryStatus('delivered')).toBe('DELIVERED');
      expect(mapWhatsAppStatusToDeliveryStatus('read')).toBe('OPENED');
      expect(mapWhatsAppStatusToDeliveryStatus('failed')).toBe('FAILED');
    });

    it('should determine status progression correctly', () => {
      // Progression: PENDING < SENT < DELIVERED < OPENED < CLICKED
      expect(shouldUpdateStatus('PENDING', 'SENT')).toBe(true);
      expect(shouldUpdateStatus('SENT', 'DELIVERED')).toBe(true);
      expect(shouldUpdateStatus('DELIVERED', 'OPENED')).toBe(true);
      expect(shouldUpdateStatus('OPENED', 'CLICKED')).toBe(true);

      // Backwards should not update
      expect(shouldUpdateStatus('CLICKED', 'OPENED')).toBe(false);
      expect(shouldUpdateStatus('DELIVERED', 'SENT')).toBe(false);
      expect(shouldUpdateStatus('SENT', 'PENDING')).toBe(false);

      // Same status should not update
      expect(shouldUpdateStatus('DELIVERED', 'DELIVERED')).toBe(false);

      // Terminal states should override non-terminal
      expect(shouldUpdateStatus('SENT', 'BOUNCED')).toBe(true);
      expect(shouldUpdateStatus('DELIVERED', 'COMPLAINED')).toBe(true);
      expect(shouldUpdateStatus('OPENED', 'FAILED')).toBe(true);

      // Terminal states should not override each other
      expect(shouldUpdateStatus('BOUNCED', 'COMPLAINED')).toBe(false);
      expect(shouldUpdateStatus('FAILED', 'BOUNCED')).toBe(false);

      // Non-terminal should not override terminal
      expect(shouldUpdateStatus('BOUNCED', 'DELIVERED')).toBe(false);
      expect(shouldUpdateStatus('FAILED', 'OPENED')).toBe(false);
    });
  });

  describe('Signature Verification', () => {
    it('should throw when email webhook key is not configured (FAIL FAST)', () => {
      // SECURITY: Webhooks MUST fail fast when secrets not configured
      expect(() =>
        service.verifyEmailSignature('test payload', 'test-sig', '12345'),
      ).toThrow('SENDGRID_WEBHOOK_KEY not configured');
    });

    it('should return false for missing signature headers when key configured', () => {
      // Set a temporary key to test validation
      (service as any).sendgridWebhookKey = 'test-key';
      const result = service.verifyEmailSignature('test payload', '', '12345');
      expect(result).toBe(false);
      // Reset
      (service as any).sendgridWebhookKey = undefined;
    });

    it('should return false for missing timestamp when key configured', () => {
      (service as any).sendgridWebhookKey = 'test-key';
      const result = service.verifyEmailSignature('test payload', 'sig', '');
      expect(result).toBe(false);
      (service as any).sendgridWebhookKey = undefined;
    });

    it('should return false for invalid email signature', () => {
      (service as any).sendgridWebhookKey = 'test-key';
      const result = service.verifyEmailSignature(
        'test payload',
        'invalid-signature',
        '12345',
      );
      expect(result).toBe(false);
      (service as any).sendgridWebhookKey = undefined;
    });

    it('should throw when WhatsApp app secret is not configured (FAIL FAST)', () => {
      // SECURITY: Webhooks MUST fail fast when secrets not configured
      expect(() =>
        service.verifyWhatsAppSignature('test payload', 'test-sig'),
      ).toThrow('WHATSAPP_APP_SECRET not configured');
    });

    it('should return false for missing WhatsApp signature header when secret configured', () => {
      (service as any).whatsappAppSecret = 'test-secret';
      const result = service.verifyWhatsAppSignature('test payload', '');
      expect(result).toBe(false);
      (service as any).whatsappAppSecret = undefined;
    });

    it('should return false for invalid WhatsApp signature', () => {
      (service as any).whatsappAppSecret = 'test-secret';
      const result = service.verifyWhatsAppSignature(
        'test payload',
        'sha256=invalid',
      );
      expect(result).toBe(false);
      (service as any).whatsappAppSecret = undefined;
    });

    it('should verify valid WhatsApp signature', () => {
      const secret = 'test-secret';
      const payload = 'test payload';
      const crypto = require('crypto');
      const expectedSig =
        'sha256=' +
        crypto.createHmac('sha256', secret).update(payload).digest('hex');

      (service as any).whatsappAppSecret = secret;
      const result = service.verifyWhatsAppSignature(payload, expectedSig);
      expect(result).toBe(true);
      (service as any).whatsappAppSecret = undefined;
    });

    it('should verify valid email signature', () => {
      const key = 'test-key';
      const payload = 'test payload';
      const timestamp = '12345';
      const crypto = require('crypto');
      const expectedSig = crypto
        .createHmac('sha256', key)
        .update(timestamp + payload)
        .digest('base64');

      (service as any).sendgridWebhookKey = key;
      const result = service.verifyEmailSignature(
        payload,
        expectedSig,
        timestamp,
      );
      expect(result).toBe(true);
      (service as any).sendgridWebhookKey = undefined;
    });
  });

  describe('WhatsApp Subscription Verification', () => {
    it('should throw for invalid mode', () => {
      expect(() =>
        service.verifyWhatsAppSubscription('invalid', 'token', 'challenge'),
      ).toThrow('Invalid webhook mode');
    });

    it('should throw when verify token is not configured', () => {
      expect(() =>
        service.verifyWhatsAppSubscription('subscribe', 'token', 'challenge'),
      ).toThrow('Webhook not configured');
    });

    it('should return challenge when token matches', () => {
      (service as any).whatsappVerifyToken = 'correct-token';
      const result = service.verifyWhatsAppSubscription(
        'subscribe',
        'correct-token',
        'my-challenge',
      );
      expect(result).toBe('my-challenge');
      (service as any).whatsappVerifyToken = undefined;
    });

    it('should throw when token does not match', () => {
      (service as any).whatsappVerifyToken = 'correct-token';
      expect(() =>
        service.verifyWhatsAppSubscription(
          'subscribe',
          'wrong-token',
          'challenge',
        ),
      ).toThrow('Invalid verify token');
      (service as any).whatsappVerifyToken = undefined;
    });
  });

  describe('updateDeliveryStatus', () => {
    it('should update invoice delivery status in database', async () => {
      // Reset to SENT status
      await prisma.invoice.update({
        where: { id: testInvoiceId },
        data: { deliveryStatus: 'SENT' },
      });

      await service.updateDeliveryStatus(
        testInvoiceId,
        testTenantId,
        'email',
        'DELIVERED',
        { event: 'delivered', messageId: 'test-msg-1' },
      );

      const updated = await prisma.invoice.findUnique({
        where: { id: testInvoiceId },
      });

      expect(updated?.deliveryStatus).toBe('DELIVERED');
    });

    it('should create delivery log entry', async () => {
      const logsBefore = await prisma.invoiceDeliveryLog.count({
        where: { invoiceId: testInvoiceId },
      });

      await service.updateDeliveryStatus(
        testInvoiceId,
        testTenantId,
        'email',
        'OPENED',
        { event: 'open', messageId: 'test-msg-2' },
      );

      const logsAfter = await prisma.invoiceDeliveryLog.count({
        where: { invoiceId: testInvoiceId },
      });

      expect(logsAfter).toBeGreaterThan(logsBefore);
    });

    it('should skip update for same or lower status', async () => {
      // Set to CLICKED (highest non-terminal)
      await prisma.invoice.update({
        where: { id: testInvoiceId },
        data: { deliveryStatus: 'CLICKED' },
      });

      await service.updateDeliveryStatus(
        testInvoiceId,
        testTenantId,
        'email',
        'OPENED', // Lower than CLICKED
        { event: 'open', messageId: 'test-msg-3' },
      );

      const invoice = await prisma.invoice.findUnique({
        where: { id: testInvoiceId },
      });

      // Should still be CLICKED
      expect(invoice?.deliveryStatus).toBe('CLICKED');
    });

    it('should throw for non-existent invoice', async () => {
      await expect(
        service.updateDeliveryStatus(
          'non-existent-id',
          testTenantId,
          'email',
          'DELIVERED',
          {},
        ),
      ).rejects.toThrow('not found');
    });

    it('should throw for wrong tenant (tenant isolation)', async () => {
      await expect(
        service.updateDeliveryStatus(
          testInvoiceId,
          'wrong-tenant-id',
          'email',
          'DELIVERED',
          {},
        ),
      ).rejects.toThrow('not found');
    });
  });

  describe('processEmailEvent', () => {
    it('should skip events without invoiceId', async () => {
      const events: EmailEvent[] = [
        {
          event: 'delivered',
          timestamp: Date.now(),
          sg_message_id: 'msg-no-invoice',
          email: 'test@test.com',
          // No invoiceId or tenantId
        },
      ];

      const result = await service.processEmailEvent(events);

      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('should skip non-status-change events', async () => {
      const events: EmailEvent[] = [
        {
          event: 'processed', // Not a status change
          timestamp: Date.now(),
          sg_message_id: 'msg-processed',
          email: 'test@test.com',
          invoiceId: testInvoiceId,
          tenantId: testTenantId,
        },
      ];

      const result = await service.processEmailEvent(events);

      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
    });

    it('should process valid delivery events', async () => {
      // Reset status
      await prisma.invoice.update({
        where: { id: testInvoiceId },
        data: { deliveryStatus: 'SENT' },
      });

      const events: EmailEvent[] = [
        {
          event: 'delivered',
          timestamp: Math.floor(Date.now() / 1000),
          sg_message_id: 'msg-delivered-test',
          email: 'test@test.com',
          invoiceId: testInvoiceId,
          tenantId: testTenantId,
        },
      ];

      const result = await service.processEmailEvent(events);

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(0);

      const invoice = await prisma.invoice.findUnique({
        where: { id: testInvoiceId },
      });
      expect(invoice?.deliveryStatus).toBe('DELIVERED');
    });
  });

  describe('getDeliveryAnalytics', () => {
    it('should aggregate delivery statistics', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const analytics = await service.getDeliveryAnalytics(
        testTenantId,
        startDate,
        endDate,
      );

      expect(analytics).toBeDefined();
      expect(typeof analytics.totalSent).toBe('number');
      expect(typeof analytics.delivered).toBe('number');
      expect(typeof analytics.opened).toBe('number');
      expect(typeof analytics.clicked).toBe('number');
      expect(typeof analytics.bounced).toBe('number');
      expect(typeof analytics.complained).toBe('number');
      expect(typeof analytics.failed).toBe('number');
      expect(typeof analytics.deliveryRate).toBe('number');
      expect(typeof analytics.openRate).toBe('number');
      expect(typeof analytics.clickRate).toBe('number');
    });
  });
});
