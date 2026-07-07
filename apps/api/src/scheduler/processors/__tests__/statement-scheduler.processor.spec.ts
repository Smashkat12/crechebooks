/**
 * Statement Scheduler Processor Tests
 * TASK-STMT-008: Scheduled Monthly Statement Generation
 *
 * Covers the admin notification (real email, previously a log-only stub)
 * and auto-deliver failure accounting (previously swallowed with a warn).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { StatementSchedulerProcessor } from '../statement-scheduler.processor';
import { StatementGenerationService } from '../../../database/services/statement-generation.service';
import { StatementDeliveryService } from '../../../database/services/statement-delivery.service';
import { StatementRepository } from '../../../database/repositories/statement.repository';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EmailService } from '../../../integrations/email/email.service';

describe('StatementSchedulerProcessor', () => {
  let processor: StatementSchedulerProcessor;
  let mockGenerationService: any;
  let mockDeliveryService: any;
  let mockStatementRepository: any;
  let mockAuditLogService: any;
  let mockPrisma: any;
  let mockEmailService: any;

  const tenantId = 'tenant-123';
  const statementMonth = '2025-01';

  const createMockJob = (data = {}) => ({
    id: 'job-stmt-1',
    data: {
      tenantId,
      statementMonth,
      triggeredBy: 'cron' as const,
      scheduledAt: new Date(),
      dryRun: false,
      ...data,
    },
    progress: jest.fn(),
  });

  beforeEach(async () => {
    mockGenerationService = {
      generateStatement: jest.fn(),
    };

    mockDeliveryService = {
      deliverStatement: jest.fn(),
    };

    mockStatementRepository = {
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    mockPrisma = {
      parent: { findMany: jest.fn() },
      tenant: { findUnique: jest.fn() },
      $transaction: jest.fn(),
      invoice: { count: jest.fn(), findMany: jest.fn() },
      payment: { count: jest.fn() },
    };

    mockEmailService = {
      sendEmail: jest
        .fn()
        .mockResolvedValue({ messageId: 'msg-001', status: 'sent' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatementSchedulerProcessor,
        { provide: StatementGenerationService, useValue: mockGenerationService },
        { provide: StatementDeliveryService, useValue: mockDeliveryService },
        { provide: StatementRepository, useValue: mockStatementRepository },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    processor = module.get<StatementSchedulerProcessor>(
      StatementSchedulerProcessor,
    );
  });

  it('sends a real admin notification email after generation', async () => {
    const mockJob = createMockJob();
    mockPrisma.parent.findMany.mockResolvedValue([{ id: 'parent-1' }]);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Creche',
      email: 'admin@test.co.za',
    });
    mockGenerationService.generateStatement.mockResolvedValue({
      id: 'stmt-1',
    });

    await processor.processJob(mockJob as any);

    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      'admin@test.co.za',
      expect.stringContaining('Statement Generation Completed'),
      expect.stringContaining('Statements Generated: 1'),
    );
    expect(mockJob.progress).toHaveBeenCalledWith(100);
  });

  it('counts auto-deliver failures and includes them in the admin notification', async () => {
    const mockJob = createMockJob({ autoFinalize: true, autoDeliver: true });
    mockPrisma.parent.findMany.mockResolvedValue([
      { id: 'parent-1' },
      { id: 'parent-2' },
    ]);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Creche',
      email: 'admin@test.co.za',
    });
    mockGenerationService.generateStatement
      .mockResolvedValueOnce({ id: 'stmt-1' })
      .mockResolvedValueOnce({ id: 'stmt-2' });
    mockDeliveryService.deliverStatement
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('SMTP unreachable'));

    await processor.processJob(mockJob as any);

    // Audit log carries the delivery-failure count
    expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        afterValue: expect.objectContaining({
          deliveredCount: 1,
          deliveryFailedCount: 1,
        }),
      }),
    );

    // Admin email flags errors and carries the failure detail
    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      'admin@test.co.za',
      expect.stringContaining('Completed with Errors'),
      expect.stringContaining('SMTP unreachable'),
    );
  });

  it('counts unsuccessful (non-throwing) deliveries as failures', async () => {
    const mockJob = createMockJob({ autoFinalize: true, autoDeliver: true });
    mockPrisma.parent.findMany.mockResolvedValue([{ id: 'parent-1' }]);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Creche',
      email: 'admin@test.co.za',
    });
    mockGenerationService.generateStatement.mockResolvedValue({ id: 'stmt-1' });
    mockDeliveryService.deliverStatement.mockResolvedValue({ success: false });

    await processor.processJob(mockJob as any);

    expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        afterValue: expect.objectContaining({
          deliveredCount: 0,
          deliveryFailedCount: 1,
        }),
      }),
    );
  });

  it('does not fail the job when the admin email send fails', async () => {
    const mockJob = createMockJob();
    mockPrisma.parent.findMany.mockResolvedValue([]);
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Creche',
      email: 'admin@test.co.za',
    });
    mockEmailService.sendEmail.mockRejectedValue(
      new Error('Email service not configured'),
    );

    await processor.processJob(mockJob as any);

    expect(mockJob.progress).toHaveBeenCalledWith(100);
  });
});
