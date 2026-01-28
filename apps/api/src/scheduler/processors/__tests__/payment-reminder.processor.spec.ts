/**
 * Payment Reminder Processor Tests
 * TASK-PAY-015: Payment Reminder Scheduler Service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentReminderProcessor } from '../payment-reminder.processor';
import { ReminderService } from '../../../database/services/reminder.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ReminderTemplateService } from '../../../billing/reminder-template.service';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';
import {
  ReminderStatus,
  DeliveryChannel,
  EscalationLevel,
} from '../../../database/dto/reminder.dto';

describe('PaymentReminderProcessor', () => {
  let processor: PaymentReminderProcessor;
  let mockReminderService: any;
  let mockAuditLogService: any;
  let mockPrisma: any;
  let mockReminderTemplateService: any;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockReminderService = {
      sendReminders: jest.fn(),
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    mockPrisma = {
      invoice: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      reminder: {
        findFirst: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    mockReminderTemplateService = {
      getEffectiveTemplate: jest.fn().mockResolvedValue({
        channels: ['email'],
        isCustom: false,
      }),
      getTemplateForStage: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReminderProcessor,
        { provide: ReminderService, useValue: mockReminderService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ReminderTemplateService,
          useValue: mockReminderTemplateService,
        },
      ],
    }).compile();

    processor = module.get<PaymentReminderProcessor>(PaymentReminderProcessor);
  });

  describe('processJob', () => {
    const createMockJob = (data = {}) => ({
      id: 'job-123',
      data: {
        tenantId,
        triggeredBy: 'cron' as const,
        scheduledAt: new Date(),
        reminderType: 'gentle' as const,
        ...data,
      },
      progress: jest.fn(),
    });

    const createOverdueInvoice = (id: string, daysOverdue: number) => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - daysOverdue);
      dueDate.setHours(0, 0, 0, 0);

      return {
        id,
        invoiceNumber: `INV-${id}`,
        tenantId,
        parentId: 'parent-123',
        childId: 'child-123',
        dueDate,
        totalCents: 150000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
        isDeleted: false,
        parent: {
          id: 'parent-123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '0821234567',
          whatsapp: '0821234567',
          whatsappOptIn: true,
          preferredContact: 'EMAIL',
        },
      };
    };

    it('should process overdue invoices successfully', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [
        createOverdueInvoice('inv-1', 7), // FIRST stage
        createOverdueInvoice('inv-2', 15), // SECOND stage
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockReminderService.sendReminders.mockResolvedValue({
        sent: 1,
        failed: 0,
        skipped: 0,
        details: [{ status: 'SENT' }],
      });

      await processor.processJob(mockJob as any);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalled();
      expect(mockReminderService.sendReminders).toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should handle no overdue invoices', async () => {
      const mockJob = createMockJob();

      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      expect(mockReminderService.sendReminders).not.toHaveBeenCalled();
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should skip invoices with recent reminders', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [createOverdueInvoice('inv-1', 10)];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue({
        id: 'reminder-1',
        sentAt: new Date(),
        reminderStatus: 'SENT',
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      // Should skip due to recent reminder
      expect(mockReminderService.sendReminders).not.toHaveBeenCalled();
    });

    it('should escalate invoices at 60+ days overdue', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [createOverdueInvoice('inv-1', 65)]; // ESCALATED stage

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.invoice.update.mockResolvedValue({});
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockReminderService.sendReminders.mockResolvedValue({
        sent: 1,
        failed: 0,
        skipped: 0,
        details: [{ status: 'SENT' }],
      });

      await processor.processJob(mockJob as any);

      // Should mark as escalated
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: expect.objectContaining({
            status: InvoiceStatus.OVERDUE,
          }),
        }),
      );
    });

    it('should process specific invoice IDs when provided', async () => {
      const mockJob = createMockJob({ invoiceIds: ['inv-1'] });
      const overdueInvoices = [createOverdueInvoice('inv-1', 10)];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockReminderService.sendReminders.mockResolvedValue({
        sent: 1,
        failed: 0,
        skipped: 0,
        details: [{ status: 'SENT' }],
      });

      await processor.processJob(mockJob as any);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['inv-1'] },
          }),
        }),
      );
    });

    it('should count invoices by stage correctly', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [
        createOverdueInvoice('inv-1', 7), // FIRST: 7 days
        createOverdueInvoice('inv-2', 14), // SECOND: 14 days
        createOverdueInvoice('inv-3', 30), // FINAL: 30 days
        createOverdueInvoice('inv-4', 60), // ESCALATED: 60 days
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.invoice.update.mockResolvedValue({});
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockReminderService.sendReminders.mockResolvedValue({
        sent: 1,
        failed: 0,
        skipped: 0,
        details: [{ status: 'SENT' }],
      });

      await processor.processJob(mockJob as any);

      // Verify audit log contains stage breakdown
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            byStage: expect.objectContaining({
              first: 1,
              second: 1,
              final: 1,
              escalated: 1,
            }),
          }),
        }),
      );
    });

    it('should continue processing when one invoice fails', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [
        createOverdueInvoice('inv-1', 10),
        createOverdueInvoice('inv-2', 15),
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      // First call fails, second succeeds
      mockReminderService.sendReminders
        .mockResolvedValueOnce({
          sent: 0,
          failed: 1,
          skipped: 0,
          details: [{ status: 'FAILED', error: 'Email failed' }],
        })
        .mockResolvedValueOnce({
          sent: 1,
          failed: 0,
          skipped: 0,
          details: [{ status: 'SENT' }],
        });

      await processor.processJob(mockJob as any);

      // Should process both invoices
      expect(mockReminderService.sendReminders).toHaveBeenCalledTimes(2);
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          afterValue: expect.objectContaining({
            remindersSent: 1,
            remindersFailed: 1,
          }),
        }),
      );
    });

    it('should filter out paid invoices', async () => {
      const mockJob = createMockJob();
      const paidInvoice = {
        ...createOverdueInvoice('inv-1', 10),
        amountPaidCents: 150000, // Fully paid
      };

      mockPrisma.invoice.findMany.mockResolvedValue([paidInvoice]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      await processor.processJob(mockJob as any);

      // Should not send reminder for paid invoice
      expect(mockReminderService.sendReminders).not.toHaveBeenCalled();
    });

    it('should update job progress during processing', async () => {
      const mockJob = createMockJob();
      const overdueInvoices = [
        createOverdueInvoice('inv-1', 10),
        createOverdueInvoice('inv-2', 15),
        createOverdueInvoice('inv-3', 20),
      ];

      mockPrisma.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrisma.reminder.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test Creche',
        email: 'admin@test.co.za',
      });

      mockReminderService.sendReminders.mockResolvedValue({
        sent: 1,
        failed: 0,
        skipped: 0,
        details: [{ status: 'SENT' }],
      });

      await processor.processJob(mockJob as any);

      // Progress should be called multiple times
      expect(mockJob.progress).toHaveBeenCalled();
      expect(mockJob.progress).toHaveBeenLastCalledWith(100);
    });
  });
});

describe('Reminder Stage Detection', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    getStageForDaysOverdue,
  } = require('../../../billing/types/reminder.types');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('should return null for invoices not yet at threshold', () => {
    expect(getStageForDaysOverdue(0)).toBeNull();
    expect(getStageForDaysOverdue(3)).toBeNull();
    expect(getStageForDaysOverdue(6)).toBeNull();
  });

  it('should return FIRST for 7-13 days overdue', () => {
    expect(getStageForDaysOverdue(7)).toBe('FIRST');
    expect(getStageForDaysOverdue(10)).toBe('FIRST');
    expect(getStageForDaysOverdue(13)).toBe('FIRST');
  });

  it('should return SECOND for 14-29 days overdue', () => {
    expect(getStageForDaysOverdue(14)).toBe('SECOND');
    expect(getStageForDaysOverdue(21)).toBe('SECOND');
    expect(getStageForDaysOverdue(29)).toBe('SECOND');
  });

  it('should return FINAL for 30-59 days overdue', () => {
    expect(getStageForDaysOverdue(30)).toBe('FINAL');
    expect(getStageForDaysOverdue(45)).toBe('FINAL');
    expect(getStageForDaysOverdue(59)).toBe('FINAL');
  });

  it('should return ESCALATED for 60+ days overdue', () => {
    expect(getStageForDaysOverdue(60)).toBe('ESCALATED');
    expect(getStageForDaysOverdue(90)).toBe('ESCALATED');
    expect(getStageForDaysOverdue(120)).toBe('ESCALATED');
  });
});

describe('Default Reminder Schedule', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const {
    DEFAULT_REMINDER_SCHEDULE,
    getScheduleForStage,
    shouldUseWhatsApp,
  } = require('../../../billing/types/reminder.types');
  /* eslint-enable @typescript-eslint/no-require-imports */

  it('should have 4 stages defined', () => {
    expect(DEFAULT_REMINDER_SCHEDULE.length).toBe(4);
  });

  it('should have correct intervals', () => {
    const stages = DEFAULT_REMINDER_SCHEDULE.map((s: any) => ({
      stage: s.stage,
      days: s.daysOverdue,
    }));

    expect(stages).toEqual([
      { stage: 'FIRST', days: 7 },
      { stage: 'SECOND', days: 14 },
      { stage: 'FINAL', days: 30 },
      { stage: 'ESCALATED', days: 60 },
    ]);
  });

  it('should use email only for FIRST stage', () => {
    expect(shouldUseWhatsApp('FIRST')).toBe(false);
    const schedule = getScheduleForStage('FIRST');
    expect(schedule.channels).toEqual(['email']);
  });

  it('should use email and WhatsApp for SECOND and FINAL stages', () => {
    expect(shouldUseWhatsApp('SECOND')).toBe(true);
    expect(shouldUseWhatsApp('FINAL')).toBe(true);
  });

  it('should use email only for ESCALATED stage', () => {
    expect(shouldUseWhatsApp('ESCALATED')).toBe(false);
    const schedule = getScheduleForStage('ESCALATED');
    expect(schedule.channels).toEqual(['email']);
  });
});
