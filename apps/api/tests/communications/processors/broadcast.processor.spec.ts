/**
 * BroadcastProcessor Unit Tests
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Tests background processing of broadcast messages.
 * Uses mocked email and WhatsApp services.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { BroadcastProcessor } from '../../../src/communications/processors/broadcast.processor';
import { BroadcastMessageEntity } from '../../../src/communications/entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../../../src/communications/entities/message-recipient.entity';
import { EmailService } from '../../../src/integrations/email/email.service';
import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
  DeliveryStatus,
} from '../../../src/communications/types/communication.types';

// Mock services for testing
const mockEmailService = {
  sendRaw: jest.fn(),
};

const mockWhatsAppService = {
  sendTextMessage: jest.fn(),
};

describe('BroadcastProcessor', () => {
  let processor: BroadcastProcessor;
  let prisma: PrismaService;
  let broadcastEntity: BroadcastMessageEntity;
  let recipientEntity: MessageRecipientEntity;

  // Test data
  let testTenantId: string;
  let testUserId: string;
  let testBroadcastId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastProcessor,
        BroadcastMessageEntity,
        MessageRecipientEntity,
        AuditLogService,
        PrismaService,
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: WhatsAppService,
          useValue: mockWhatsAppService,
        },
      ],
    }).compile();

    processor = module.get<BroadcastProcessor>(BroadcastProcessor);
    prisma = module.get<PrismaService>(PrismaService);
    broadcastEntity = module.get<BroadcastMessageEntity>(
      BroadcastMessageEntity,
    );
    recipientEntity = module.get<MessageRecipientEntity>(
      MessageRecipientEntity,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockEmailService.sendRaw.mockResolvedValue({ messageId: 'test-msg-id' });
    mockWhatsAppService.sendTextMessage.mockResolvedValue({
      wamid: 'test-wamid',
    });

    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.messageRecipient.deleteMany({});
    await prisma.broadcastMessage.deleteMany({});
    await prisma.recipientGroup.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.linkedBankAccount.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.pendingSync.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '0211234567',
        email: `test-processor-${Date.now()}@creche.com`,
      },
    });
    testTenantId = tenant.id;

    // Create test user
    const user = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        auth0Id: `auth0|processor${Date.now()}`,
        email: `admin-processor-${Date.now()}@test.com`,
        name: 'Admin User',
        role: 'ADMIN',
      },
    });
    testUserId = user.id;

    // Create test broadcast with recipients
    const broadcast = await broadcastEntity.create(
      {
        tenantId: testTenantId,
        subject: 'Test Broadcast',
        body: 'This is a test message',
        recipientType: RecipientType.PARENT,
        channel: CommunicationChannel.EMAIL,
      },
      testUserId,
    );
    testBroadcastId = broadcast.id;

    // Create test recipients
    await recipientEntity.createMany([
      {
        broadcastId: testBroadcastId,
        recipientId: 'parent-1',
        recipientType: RecipientType.PARENT,
        recipientName: 'John Doe',
        recipientEmail: 'john@example.com',
        recipientPhone: '0821234567',
      },
      {
        broadcastId: testBroadcastId,
        recipientId: 'parent-2',
        recipientType: RecipientType.PARENT,
        recipientName: 'Jane Smith',
        recipientEmail: 'jane@example.com',
        recipientPhone: '0829876543',
      },
    ]);

    // Update total count
    await broadcastEntity.updateStatus(testBroadcastId, BroadcastStatus.DRAFT, {
      totalRecipients: 2,
    });
  });

  describe('handleSend', () => {
    it('should send emails to all recipients', async () => {
      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      // Verify email service was called for each recipient
      expect(mockEmailService.sendRaw).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          subject: 'Test Broadcast',
          text: 'This is a test message',
        }),
      );
      expect(mockEmailService.sendRaw).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
        }),
      );
    });

    it('should update broadcast status to SENT on success', async () => {
      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      const broadcast = await broadcastEntity.findById(testBroadcastId);
      expect(broadcast?.status).toBe(BroadcastStatus.SENT);
      expect(broadcast?.sentCount).toBe(2);
      expect(broadcast?.failedCount).toBe(0);
    });

    it('should update broadcast status to PARTIALLY_SENT on partial failure', async () => {
      // Make email service fail for the second recipient
      mockEmailService.sendRaw
        .mockResolvedValueOnce({ messageId: 'msg-1' })
        .mockRejectedValueOnce(new Error('Email send failed'));

      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      const broadcast = await broadcastEntity.findById(testBroadcastId);
      expect(broadcast?.status).toBe(BroadcastStatus.PARTIALLY_SENT);
      expect(broadcast?.sentCount).toBe(1);
      expect(broadcast?.failedCount).toBe(1);
    });

    it('should update broadcast status to FAILED when all sends fail', async () => {
      mockEmailService.sendRaw.mockRejectedValue(
        new Error('Email send failed'),
      );

      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      const broadcast = await broadcastEntity.findById(testBroadcastId);
      expect(broadcast?.status).toBe(BroadcastStatus.FAILED);
      expect(broadcast?.sentCount).toBe(0);
      expect(broadcast?.failedCount).toBe(2);
    });

    it('should send via WhatsApp when channel is WHATSAPP', async () => {
      // Update broadcast to use WhatsApp
      await prisma.broadcastMessage.update({
        where: { id: testBroadcastId },
        data: { channel: CommunicationChannel.WHATSAPP },
      });

      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      expect(mockWhatsAppService.sendTextMessage).toHaveBeenCalledTimes(2);
      expect(mockWhatsAppService.sendTextMessage).toHaveBeenCalledWith(
        '0821234567',
        'This is a test message',
      );
    });

    it('should send via both channels when channel is ALL', async () => {
      // Update broadcast to use ALL channels
      await prisma.broadcastMessage.update({
        where: { id: testBroadcastId },
        data: { channel: CommunicationChannel.ALL },
      });

      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      // Should send via both email and WhatsApp
      expect(mockEmailService.sendRaw).toHaveBeenCalledTimes(2);
      expect(mockWhatsAppService.sendTextMessage).toHaveBeenCalledTimes(2);
    });

    it('should update recipient status after sending', async () => {
      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      const recipients = await prisma.messageRecipient.findMany({
        where: { broadcastId: testBroadcastId },
      });

      expect(recipients).toHaveLength(2);
      recipients.forEach((r) => {
        expect(r.emailStatus).toBe(DeliveryStatus.SENT);
        expect(r.emailMessageId).toBe('test-msg-id');
      });
    });

    it('should create audit log entry', async () => {
      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: testBroadcastId,
      });

      await processor.handleSend(job);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId: testTenantId,
          entityType: 'BroadcastMessage',
          entityId: testBroadcastId,
          action: AuditAction.UPDATE,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.changeSummary).toContain('completed');
    });

    it('should throw error for non-existent broadcast', async () => {
      const job = createMockJob({
        tenantId: testTenantId,
        broadcastId: '00000000-0000-0000-0000-000000000000',
      });

      await expect(processor.handleSend(job)).rejects.toThrow(/not found/);
    });
  });
});

/**
 * Create a mock Bull job for testing
 */
function createMockJob(data: { tenantId: string; broadcastId: string }) {
  return {
    id: 'test-job-id',
    data,
    attemptsMade: 0,
    progress: jest.fn(),
  } as any;
}
