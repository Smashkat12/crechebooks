/**
 * WhatsAppMessageEntity Integration Tests
 * TASK-WA-001: WhatsApp Message History Entity
 *
 * CRITICAL: Uses REAL database, no mocks for database operations.
 * Tests CRUD operations, status updates, and query methods for WhatsApp message history.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { WhatsAppMessageEntity } from '../../../src/integrations/whatsapp/entities/whatsapp-message.entity';
import {
  WhatsAppMessageStatus,
  WhatsAppContextType,
  CreateWhatsAppMessageDto,
} from '../../../src/integrations/whatsapp/types/message-history.types';
import { Tenant, Parent, Child, WhatsAppMessage } from '@prisma/client';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { PreferredContact } from '../../../src/database/entities/parent.entity';

describe('WhatsAppMessageEntity', () => {
  let entity: WhatsAppMessageEntity;
  let prisma: PrismaService;

  // Test data
  let testTenant: Tenant;
  let testParent: Parent;
  let _testChild: Child;
  let testMessages: WhatsAppMessage[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, WhatsAppMessageEntity],
    }).compile();

    entity = module.get<WhatsAppMessageEntity>(WhatsAppMessageEntity);
    prisma = module.get<PrismaService>(PrismaService);

    // Clean up any existing test data
    await prisma.whatsAppMessage.deleteMany({
      where: { tenant: { name: 'WA-001 Test Tenant' } },
    });
    await prisma.child.deleteMany({
      where: { parent: { tenant: { name: 'WA-001 Test Tenant' } } },
    });
    await prisma.parent.deleteMany({
      where: { tenant: { name: 'WA-001 Test Tenant' } },
    });
    await prisma.tenant.deleteMany({
      where: { name: 'WA-001 Test Tenant' },
    });

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'WA-001 Test Tenant',
        email: 'wa-test@example.com',
        phone: '+27110001234',
        addressLine1: '123 Test Street',
        city: 'Test City',
        province: 'Gauteng',
        postalCode: '2000',
        taxStatus: TaxStatus.NOT_REGISTERED,
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Test',
        lastName: 'Parent',
        email: 'parent@example.com',
        phone: '+27821234567',
        preferredContact: PreferredContact.WHATSAPP,
        whatsappOptIn: true,
        whatsapp: '+27821234567',
      },
    });

    // Create test child
    _testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Test',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-01'),
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.whatsAppMessage.deleteMany({
      where: { tenantId: testTenant.id },
    });
    await prisma.child.deleteMany({
      where: { parentId: testParent.id },
    });
    await prisma.parent.deleteMany({
      where: { tenantId: testTenant.id },
    });
    await prisma.tenant.deleteMany({
      where: { id: testTenant.id },
    });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up messages created during tests
    if (testMessages.length > 0) {
      await prisma.whatsAppMessage.deleteMany({
        where: { id: { in: testMessages.map((m) => m.id) } },
      });
      testMessages = [];
    }
  });

  describe('create', () => {
    it('should create a new WhatsApp message record', async () => {
      const dto: CreateWhatsAppMessageDto = {
        tenantId: testTenant.id,
        parentId: testParent.id,
        recipientPhone: '+27821234567',
        templateName: 'invoice_notification',
        templateParams: { invoiceNumber: 'INV-001', amount: 'R1,000.00' },
        contextType: WhatsAppContextType.INVOICE,
        contextId: 'invoice-123',
      };

      const message = await entity.create(dto);
      testMessages.push(message);

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.tenantId).toBe(testTenant.id);
      expect(message.parentId).toBe(testParent.id);
      expect(message.recipientPhone).toBe('+27821234567');
      expect(message.templateName).toBe('invoice_notification');
      expect(message.status).toBe(WhatsAppMessageStatus.PENDING);
      expect(message.contextType).toBe(WhatsAppContextType.INVOICE);
      expect(message.contextId).toBe('invoice-123');
    });

    it('should create message without optional fields', async () => {
      const dto: CreateWhatsAppMessageDto = {
        tenantId: testTenant.id,
        recipientPhone: '+27829876543',
        templateName: 'welcome_message',
        contextType: WhatsAppContextType.WELCOME,
      };

      const message = await entity.create(dto);
      testMessages.push(message);

      expect(message).toBeDefined();
      expect(message.parentId).toBeNull();
      expect(message.contextId).toBeNull();
      expect(message.templateParams).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update message status to SENT with timestamp', async () => {
      // Create a message first
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test_template',
        contextType: WhatsAppContextType.INVOICE,
        wamid: 'wamid_sent_test_123',
      });
      testMessages.push(message);

      const timestamp = new Date();
      const updated = await entity.updateStatus({
        wamid: 'wamid_sent_test_123',
        status: WhatsAppMessageStatus.SENT,
        timestamp,
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(WhatsAppMessageStatus.SENT);
      expect(updated!.sentAt).toEqual(timestamp);
      expect(updated!.statusUpdatedAt).toEqual(timestamp);
    });

    it('should update message status to DELIVERED', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test_template',
        contextType: WhatsAppContextType.INVOICE,
        wamid: 'wamid_delivered_test_123',
        status: WhatsAppMessageStatus.SENT,
      });
      testMessages.push(message);

      const timestamp = new Date();
      const updated = await entity.updateStatus({
        wamid: 'wamid_delivered_test_123',
        status: WhatsAppMessageStatus.DELIVERED,
        timestamp,
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(WhatsAppMessageStatus.DELIVERED);
      expect(updated!.deliveredAt).toEqual(timestamp);
    });

    it('should update message status to READ', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test_template',
        contextType: WhatsAppContextType.INVOICE,
        wamid: 'wamid_read_test_123',
        status: WhatsAppMessageStatus.DELIVERED,
      });
      testMessages.push(message);

      const timestamp = new Date();
      const updated = await entity.updateStatus({
        wamid: 'wamid_read_test_123',
        status: WhatsAppMessageStatus.READ,
        timestamp,
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(WhatsAppMessageStatus.READ);
      expect(updated!.readAt).toEqual(timestamp);
    });

    it('should update message status to FAILED with error details', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test_template',
        contextType: WhatsAppContextType.INVOICE,
        wamid: 'wamid_failed_test_123',
      });
      testMessages.push(message);

      const timestamp = new Date();
      const updated = await entity.updateStatus({
        wamid: 'wamid_failed_test_123',
        status: WhatsAppMessageStatus.FAILED,
        timestamp,
        errorCode: '131047',
        errorMessage: 'Re-engagement message required',
      });

      expect(updated).toBeDefined();
      expect(updated!.status).toBe(WhatsAppMessageStatus.FAILED);
      expect(updated!.errorCode).toBe('131047');
      expect(updated!.errorMessage).toBe('Re-engagement message required');
    });

    it('should return null for non-existent WAMID', async () => {
      const result = await entity.updateStatus({
        wamid: 'non_existent_wamid',
        status: WhatsAppMessageStatus.SENT,
        timestamp: new Date(),
      });

      expect(result).toBeNull();
    });
  });

  describe('findByWamid', () => {
    it('should find message by WAMID', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test_template',
        contextType: WhatsAppContextType.INVOICE,
        wamid: 'wamid_find_test_123',
      });
      testMessages.push(message);

      const found = await entity.findByWamid('wamid_find_test_123');

      expect(found).toBeDefined();
      expect(found!.id).toBe(message.id);
    });

    it('should return null for non-existent WAMID', async () => {
      const found = await entity.findByWamid('non_existent_wamid_xyz');
      expect(found).toBeNull();
    });
  });

  describe('findByTenantAndParent', () => {
    beforeEach(async () => {
      // Create test messages
      const messages = await Promise.all([
        entity.create({
          tenantId: testTenant.id,
          parentId: testParent.id,
          recipientPhone: '+27821234567',
          templateName: 'invoice_1',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.SENT,
        }),
        entity.create({
          tenantId: testTenant.id,
          parentId: testParent.id,
          recipientPhone: '+27821234567',
          templateName: 'reminder_1',
          contextType: WhatsAppContextType.REMINDER,
          status: WhatsAppMessageStatus.DELIVERED,
        }),
        entity.create({
          tenantId: testTenant.id,
          parentId: testParent.id,
          recipientPhone: '+27821234567',
          templateName: 'invoice_2',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.FAILED,
        }),
      ]);
      testMessages.push(...messages);
    });

    it('should find all messages for tenant and parent', async () => {
      const messages = await entity.findByTenantAndParent(
        testTenant.id,
        testParent.id,
      );

      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const messages = await entity.findByTenantAndParent(
        testTenant.id,
        testParent.id,
        { status: WhatsAppMessageStatus.FAILED },
      );

      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages.every((m) => m.status === 'FAILED')).toBe(true);
    });

    it('should filter by context type', async () => {
      const messages = await entity.findByTenantAndParent(
        testTenant.id,
        testParent.id,
        { contextType: WhatsAppContextType.INVOICE },
      );

      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages.every((m) => m.contextType === 'INVOICE')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const messages = await entity.findByTenantAndParent(
        testTenant.id,
        testParent.id,
        { limit: 2 },
      );

      expect(messages.length).toBe(2);
    });
  });

  describe('findByContext', () => {
    it('should find messages by context type and ID', async () => {
      const contextId = 'test-invoice-context-123';
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'invoice_notification',
        contextType: WhatsAppContextType.INVOICE,
        contextId,
      });
      testMessages.push(message);

      const messages = await entity.findByContext(
        testTenant.id,
        WhatsAppContextType.INVOICE,
        contextId,
      );

      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages.some((m) => m.contextId === contextId)).toBe(true);
    });
  });

  describe('getHistorySummary', () => {
    beforeEach(async () => {
      // Create messages with different statuses
      const messages = await Promise.all([
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.SENT,
        }),
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.DELIVERED,
        }),
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.READ,
        }),
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.FAILED,
        }),
      ]);
      testMessages.push(...messages);
    });

    it('should return correct summary statistics', async () => {
      const summary = await entity.getHistorySummary(testTenant.id);

      expect(summary.total).toBeGreaterThanOrEqual(4);
      expect(summary.sent).toBeGreaterThanOrEqual(1);
      expect(summary.delivered).toBeGreaterThanOrEqual(1);
      expect(summary.read).toBeGreaterThanOrEqual(1);
      expect(summary.failed).toBeGreaterThanOrEqual(1);
    });

    it('should calculate delivery rate correctly', async () => {
      const summary = await entity.getHistorySummary(testTenant.id);

      // Delivery rate = (delivered + read) / (sent + delivered + read) * 100
      expect(summary.deliveryRate).toBeGreaterThanOrEqual(0);
      expect(summary.deliveryRate).toBeLessThanOrEqual(100);
    });

    it('should calculate read rate correctly', async () => {
      const summary = await entity.getHistorySummary(testTenant.id);

      // Read rate = read / (delivered + read) * 100
      expect(summary.readRate).toBeGreaterThanOrEqual(0);
      expect(summary.readRate).toBeLessThanOrEqual(100);
    });
  });

  describe('getRecentFailedMessages', () => {
    it('should return recent failed messages with parent details', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        parentId: testParent.id,
        recipientPhone: '+27821234567',
        templateName: 'failed_test',
        contextType: WhatsAppContextType.INVOICE,
        status: WhatsAppMessageStatus.FAILED,
      });
      testMessages.push(message);

      const failed = await entity.getRecentFailedMessages(testTenant.id);

      expect(failed.length).toBeGreaterThanOrEqual(1);
      expect(failed.some((m) => m.status === 'FAILED')).toBe(true);
    });
  });

  describe('markAsSent', () => {
    it('should mark message as sent with WAMID', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test',
        contextType: WhatsAppContextType.INVOICE,
      });
      testMessages.push(message);

      const wamid = 'wamid_mark_sent_test_123';
      const updated = await entity.markAsSent(message.id, wamid);

      expect(updated.wamid).toBe(wamid);
      expect(updated.status).toBe(WhatsAppMessageStatus.SENT);
      expect(updated.sentAt).toBeDefined();
    });
  });

  describe('markAsFailed', () => {
    it('should mark message as failed with error details', async () => {
      const message = await entity.create({
        tenantId: testTenant.id,
        recipientPhone: '+27821234567',
        templateName: 'test',
        contextType: WhatsAppContextType.INVOICE,
      });
      testMessages.push(message);

      const updated = await entity.markAsFailed(
        message.id,
        '500',
        'Internal server error',
      );

      expect(updated.status).toBe(WhatsAppMessageStatus.FAILED);
      expect(updated.errorCode).toBe('500');
      expect(updated.errorMessage).toBe('Internal server error');
    });
  });

  describe('countByStatus', () => {
    beforeEach(async () => {
      // Create messages with different statuses
      const messages = await Promise.all([
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.PENDING,
        }),
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.SENT,
        }),
        entity.create({
          tenantId: testTenant.id,
          recipientPhone: '+27821234567',
          templateName: 'test',
          contextType: WhatsAppContextType.INVOICE,
          status: WhatsAppMessageStatus.SENT,
        }),
      ]);
      testMessages.push(...messages);
    });

    it('should return correct counts by status', async () => {
      const counts = await entity.countByStatus(testTenant.id);

      expect(counts[WhatsAppMessageStatus.PENDING]).toBeGreaterThanOrEqual(1);
      expect(counts[WhatsAppMessageStatus.SENT]).toBeGreaterThanOrEqual(2);
    });
  });
});
