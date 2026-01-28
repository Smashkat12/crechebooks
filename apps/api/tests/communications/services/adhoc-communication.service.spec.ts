/**
 * AdhocCommunicationService Unit Tests
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Tests broadcast creation, sending, and cancellation.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AdhocCommunicationService } from '../../../src/communications/services/adhoc-communication.service';
import { RecipientResolverService } from '../../../src/communications/services/recipient-resolver.service';
import { BroadcastMessageEntity } from '../../../src/communications/entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../../../src/communications/entities/message-recipient.entity';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { cleanDatabase } from '../../helpers/clean-database';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
} from '../../../src/communications/types/communication.types';

describe('AdhocCommunicationService', () => {
  let service: AdhocCommunicationService;
  let prisma: PrismaService;
  let broadcastEntity: BroadcastMessageEntity;

  // Test data
  let testTenantId: string;
  let testUserId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdhocCommunicationService,
        RecipientResolverService,
        BroadcastMessageEntity,
        MessageRecipientEntity,
        AuditLogService,
        PrismaService,
      ],
    }).compile();

    service = module.get<AdhocCommunicationService>(AdhocCommunicationService);
    prisma = module.get<PrismaService>(PrismaService);
    broadcastEntity = module.get<BroadcastMessageEntity>(
      BroadcastMessageEntity,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '0211234567',
        email: `test-adhoc-${Date.now()}@creche.com`,
      },
    });
    testTenantId = tenant.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        auth0Id: `auth0|adhoc${Date.now()}`,
        email: `admin-adhoc-${Date.now()}@test.com`,
        name: 'Admin User',
        role: 'ADMIN',
      },
    });
    testUserId = user.id;

    // Create some test parents
    await prisma.parent.createMany({
      data: [
        {
          tenantId: testTenantId,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '0821234567',
          whatsapp: '0821234567',
          whatsappOptIn: true,
          isActive: true,
        },
        {
          tenantId: testTenantId,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: '0829876543',
          whatsappOptIn: false,
          isActive: true,
        },
      ],
    });
  });

  describe('createBroadcast', () => {
    it('should create a broadcast with resolved recipients', async () => {
      const result = await service.createBroadcast(testTenantId, testUserId, {
        tenantId: testTenantId,
        subject: 'Test Broadcast',
        body: 'This is a test message',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      expect(result).toBeDefined();
      expect(result.subject).toBe('Test Broadcast');
      expect(result.body).toBe('This is a test message');
      expect(result.status).toBe(BroadcastStatus.DRAFT);
      expect(result.totalRecipients).toBe(2);
    });

    it('should create recipient records for each resolved recipient', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Test',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      const recipients = await prisma.messageRecipient.findMany({
        where: { broadcastId: broadcast.id },
      });

      expect(recipients).toHaveLength(2);
      expect(recipients.map((r) => r.recipientName)).toContain('John Doe');
      expect(recipients.map((r) => r.recipientName)).toContain('Jane Smith');
    });

    it('should filter recipients by WhatsApp opt-in', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'WhatsApp Test',
          body: 'Message for WhatsApp',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.WHATSAPP,
        },
      );

      // Only John has WhatsApp opt-in
      expect(broadcast.totalRecipients).toBe(1);

      const recipients = await prisma.messageRecipient.findMany({
        where: { broadcastId: broadcast.id },
      });

      expect(recipients).toHaveLength(1);
      expect(recipients[0].recipientName).toBe('John Doe');
    });

    it('should create audit log entry', async () => {
      await service.createBroadcast(testTenantId, testUserId, {
        tenantId: testTenantId,
        subject: 'Audit Test',
        body: 'Message',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          entityType: 'BroadcastMessage',
          action: AuditAction.CREATE,
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.changeSummary).toContain('Audit Test');
    });
  });

  describe('cancelBroadcast', () => {
    it('should cancel a draft broadcast', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'To Cancel',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      await service.cancelBroadcast(testTenantId, broadcast.id, testUserId);

      const cancelled = await broadcastEntity.findById(broadcast.id);
      expect(cancelled?.status).toBe(BroadcastStatus.CANCELLED);
    });

    it('should throw NotFoundException for non-existent broadcast', async () => {
      await expect(
        service.cancelBroadcast(
          testTenantId,
          '00000000-0000-0000-0000-000000000000',
          testUserId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error when cancelling a SENT broadcast', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Already Sent',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      // Manually set status to SENT
      await broadcastEntity.updateStatus(broadcast.id, BroadcastStatus.SENT);

      await expect(
        service.cancelBroadcast(testTenantId, broadcast.id, testUserId),
      ).rejects.toThrow(/Cannot cancel/);
    });
  });

  describe('getBroadcast', () => {
    it('should return broadcast by ID', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Test Get',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      const result = await service.getBroadcast(testTenantId, broadcast.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(broadcast.id);
      expect(result?.subject).toBe('Test Get');
    });

    it('should return null for wrong tenant', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Test',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      const result = await service.getBroadcast(
        '00000000-0000-0000-0000-000000000000',
        broadcast.id,
      );

      expect(result).toBeNull();
    });
  });

  describe('listBroadcasts', () => {
    it('should list broadcasts for tenant', async () => {
      // Create multiple broadcasts
      await service.createBroadcast(testTenantId, testUserId, {
        tenantId: testTenantId,
        subject: 'Broadcast 1',
        body: 'Message 1',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      await service.createBroadcast(testTenantId, testUserId, {
        tenantId: testTenantId,
        subject: 'Broadcast 2',
        body: 'Message 2',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      const result = await service.listBroadcasts(testTenantId);

      expect(result).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Draft Broadcast',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      // Cancel one
      await service.cancelBroadcast(testTenantId, broadcast.id, testUserId);

      // Create another draft
      await service.createBroadcast(testTenantId, testUserId, {
        tenantId: testTenantId,
        subject: 'Another Draft',
        body: 'Message',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      const drafts = await service.listBroadcasts(testTenantId, {
        status: BroadcastStatus.DRAFT,
      });

      expect(drafts).toHaveLength(1);
      expect(drafts[0].subject).toBe('Another Draft');
    });
  });

  describe('previewRecipientCount', () => {
    it('should return count without creating broadcast', async () => {
      const count = await service.previewRecipientCount(testTenantId, {
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      });

      expect(count).toBe(2);

      // Verify no broadcast was created
      const broadcasts = await prisma.broadcastMessage.findMany({
        where: { tenantId: testTenantId },
      });
      expect(broadcasts).toHaveLength(0);
    });
  });

  describe('getDeliveryStats', () => {
    it('should return delivery statistics', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Stats Test',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      const stats = await service.getDeliveryStats(testTenantId, broadcast.id);

      expect(stats).toBeDefined();
      expect(stats.total).toBe(2);
    });

    it('should throw NotFoundException for invalid broadcast', async () => {
      await expect(
        service.getDeliveryStats(
          testTenantId,
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendBroadcast (without Redis)', () => {
    it('should throw error when Redis is not configured', async () => {
      const broadcast = await service.createBroadcast(
        testTenantId,
        testUserId,
        {
          tenantId: testTenantId,
          subject: 'Send Test',
          body: 'Message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
        },
      );

      // Without Redis configured, sendBroadcast should throw
      await expect(
        service.sendBroadcast(testTenantId, broadcast.id, testUserId),
      ).rejects.toThrow(/queue not configured/);
    });
  });
});
