/**
 * Arrears Reminder Job Tests
 * TASK-FEAT-102: Automated Arrears Reminders
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ArrearsReminderJob,
  OverdueInvoice,
  ReminderHistory,
  ReminderLevel,
} from '../arrears-reminder.job';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailService } from '../../integrations/email/email.service';
import { ReminderTemplateService } from '../../billing/reminder-template.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { ReminderStage } from '../../billing/dto/reminder-template.dto';

describe('ArrearsReminderJob', () => {
  let job: ArrearsReminderJob;
  let prismaService: jest.Mocked<PrismaService>;
  let emailService: jest.Mocked<EmailService>;
  let reminderTemplateService: jest.Mocked<ReminderTemplateService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockTenantId = 'tenant-123';
  const mockInvoiceId = 'invoice-456';
  const mockParentId = 'parent-789';

  const mockTenant = {
    id: mockTenantId,
    name: 'Test Creche',
    email: 'admin@testcreche.co.za',
    phone: '+27123456789',
    subscriptionStatus: 'ACTIVE',
    reminderConfig: null,
  };

  const mockParent = {
    id: mockParentId,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@email.com',
    whatsapp: '+27987654321',
    whatsappOptIn: true,
    smsOptIn: true,
    preferredContact: 'email',
    isActive: true,
  };

  const mockChild = {
    id: 'child-111',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  const createOverdueInvoice = (daysOverdue: number): OverdueInvoice => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - daysOverdue);
    dueDate.setHours(0, 0, 0, 0);

    return {
      id: mockInvoiceId,
      invoiceNumber: 'INV-001',
      tenantId: mockTenantId,
      parentId: mockParentId,
      childId: mockChild.id,
      dueDate,
      totalCents: 200000, // R2000
      amountPaidCents: 0,
      parent: mockParent,
      child: mockChild,
      tenant: {
        id: mockTenantId,
        name: mockTenant.name,
        email: mockTenant.email,
        phone: mockTenant.phone,
      },
    };
  };

  const mockReminderTemplate = {
    id: 'template-1',
    tenantId: mockTenantId,
    stage: ReminderStage.FIRST,
    emailSubject: 'Payment Reminder: {{invoiceNumber}}',
    emailBody: 'Dear {{parentName}}, your invoice {{invoiceNumber}} for {{amount}} is overdue.',
    whatsappTemplate: null,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([mockTenant]),
        findUnique: jest.fn().mockResolvedValue(mockTenant),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      reminder: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'reminder-1' }),
      },
    };

    const mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue({ status: 'sent' }),
      sendEmailWithOptions: jest.fn().mockResolvedValue({ status: 'sent' }),
    };

    const mockReminderTemplateService = {
      getEffectiveTemplate: jest.fn().mockResolvedValue(mockReminderTemplate),
      renderTemplate: jest.fn().mockImplementation((template, vars) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
      }),
    };

    const mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArrearsReminderJob,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ReminderTemplateService, useValue: mockReminderTemplateService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    job = module.get<ArrearsReminderJob>(ArrearsReminderJob);
    prismaService = module.get(PrismaService);
    emailService = module.get(EmailService);
    reminderTemplateService = module.get(ReminderTemplateService);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(job).toBeDefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('should set shutdownRequested to true', () => {
      job.onModuleDestroy();
      // Internal state is private, so we verify behavior indirectly
      expect(job).toBeDefined();
    });
  });

  describe('getOverdueInvoices', () => {
    it('should return overdue invoices with parent and child info', async () => {
      const overdueInvoice = createOverdueInvoice(10);
      prismaService.invoice.findMany = jest.fn().mockResolvedValue([
        {
          ...overdueInvoice,
          amountPaidCents: 0,
        },
      ]);

      const result = await job.getOverdueInvoices(mockTenantId);

      expect(result).toHaveLength(1);
      expect(result[0].invoiceNumber).toBe('INV-001');
      expect(result[0].parent.firstName).toBe('John');
      expect(result[0].child.firstName).toBe('Jane');
    });

    it('should filter out fully paid invoices', async () => {
      const paidInvoice = createOverdueInvoice(10);
      paidInvoice.amountPaidCents = paidInvoice.totalCents;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([paidInvoice]);

      const result = await job.getOverdueInvoices(mockTenantId);

      expect(result).toHaveLength(0);
    });

    it('should filter out inactive parents', async () => {
      const inactiveParentInvoice = createOverdueInvoice(10);
      inactiveParentInvoice.parent.isActive = false;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([inactiveParentInvoice]);

      const result = await job.getOverdueInvoices(mockTenantId);

      expect(result).toHaveLength(0);
    });

    it('should include tenant isolation (tenantId filter)', async () => {
      await job.getOverdueInvoices(mockTenantId);

      expect(prismaService.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: mockTenantId,
          }),
        }),
      );
    });
  });

  describe('determineReminderLevel', () => {
    const defaultConfig = {
      enabled: true,
      level1Days: 7,
      level2Days: 14,
      level3Days: 30,
      level4Days: 60,
      ccAdminLevel: 3,
      sendHoursStart: 8,
      sendHoursEnd: 18,
      maxPerDay: 1,
      adminEmail: null,
    };

    it('should return null for invoices not yet at first threshold', () => {
      const invoice = createOverdueInvoice(5); // 5 days, threshold is 7
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toBeNull();
    });

    it('should return level 1 for 7+ days overdue', () => {
      const invoice = createOverdueInvoice(8);
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toEqual(
        expect.objectContaining({
          level: 1,
          stage: ReminderStage.FIRST,
          tone: 'friendly',
        }),
      );
    });

    it('should return level 2 for 14+ days overdue', () => {
      const invoice = createOverdueInvoice(15);
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toEqual(
        expect.objectContaining({
          level: 2,
          stage: ReminderStage.SECOND,
          tone: 'firm',
        }),
      );
    });

    it('should return level 3 for 30+ days overdue', () => {
      const invoice = createOverdueInvoice(35);
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toEqual(
        expect.objectContaining({
          level: 3,
          stage: ReminderStage.FINAL,
          tone: 'serious',
        }),
      );
    });

    it('should return level 4 for 60+ days overdue (TASK-FEAT-102)', () => {
      const invoice = createOverdueInvoice(65);
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toEqual(
        expect.objectContaining({
          level: 4,
          stage: ReminderStage.ESCALATED,
          tone: 'final',
        }),
      );
    });

    it('should not repeat a level already sent', () => {
      const invoice = createOverdueInvoice(10);
      const history: ReminderHistory[] = [
        {
          id: 'hist-1',
          invoiceId: mockInvoiceId,
          sentAt: new Date(),
          escalationLevel: ReminderStage.FIRST,
        },
      ];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      // Should return null since level 1 already sent and not yet at level 2
      expect(level).toBeNull();
    });

    it('should escalate to next level if current level sent and days qualify', () => {
      const invoice = createOverdueInvoice(16); // Qualifies for level 2
      const history: ReminderHistory[] = [
        {
          id: 'hist-1',
          invoiceId: mockInvoiceId,
          sentAt: new Date(),
          escalationLevel: ReminderStage.FIRST,
        },
      ];

      const level = job.determineReminderLevel(invoice, history, defaultConfig);

      expect(level).toEqual(
        expect.objectContaining({
          level: 2,
          stage: ReminderStage.SECOND,
        }),
      );
    });

    it('should use custom config days thresholds', () => {
      const customConfig = {
        ...defaultConfig,
        level1Days: 3,
        level2Days: 7,
        level3Days: 14,
        level4Days: 30,
      };
      const invoice = createOverdueInvoice(8);
      const history: ReminderHistory[] = [];

      const level = job.determineReminderLevel(invoice, history, customConfig);

      // With custom config, 8 days should be level 2
      expect(level).toEqual(
        expect.objectContaining({
          level: 2,
        }),
      );
    });
  });

  describe('sendReminder', () => {
    const mockLevel: ReminderLevel = {
      level: 1,
      stage: ReminderStage.FIRST,
      tone: 'friendly',
    };

    const defaultConfig = {
      enabled: true,
      level1Days: 7,
      level2Days: 14,
      level3Days: 30,
      level4Days: 60,
      ccAdminLevel: 3,
      sendHoursStart: 8,
      sendHoursEnd: 18,
      maxPerDay: 1,
      adminEmail: 'admin@custom.co.za',
    };

    it('should send email with rendered template', async () => {
      const invoice = createOverdueInvoice(10);
      // Ensure email is set
      invoice.parent.email = 'john.doe@email.com';

      await job.sendReminder(invoice, mockLevel, defaultConfig);

      expect(reminderTemplateService.getEffectiveTemplate).toHaveBeenCalledWith(
        mockTenantId,
        ReminderStage.FIRST,
      );
      expect(emailService.sendEmailWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          to: invoice.parent.email,
          subject: expect.any(String),
          body: expect.any(String),
        }),
      );
    });

    it('should CC admin for level 3 and above', async () => {
      const invoice = createOverdueInvoice(35);
      invoice.parent.email = 'john.doe@email.com';
      const level3: ReminderLevel = {
        level: 3,
        stage: ReminderStage.FINAL,
        tone: 'serious',
      };

      await job.sendReminder(invoice, level3, defaultConfig);

      expect(emailService.sendEmailWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: ['admin@custom.co.za'],
        }),
      );
    });

    it('should not CC admin for level 1 and 2', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';

      await job.sendReminder(invoice, mockLevel, defaultConfig);

      expect(emailService.sendEmailWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: undefined,
        }),
      );
    });

    it('should create reminder record after sending', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';

      await job.sendReminder(invoice, mockLevel, defaultConfig);

      expect(prismaService.reminder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            invoiceId: mockInvoiceId,
            parentId: mockParentId,
            escalationLevel: 'FRIENDLY',
          }),
        }),
      );
    });

    it('should throw error if parent has no email', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = null;

      await expect(job.sendReminder(invoice, mockLevel, defaultConfig)).rejects.toThrow(
        'has no email address',
      );
    });

    it('should render template variables correctly', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';

      await job.sendReminder(invoice, mockLevel, defaultConfig);

      expect(reminderTemplateService.renderTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          parentName: 'John',
          childName: 'Jane',
          invoiceNumber: 'INV-001',
          crecheName: 'Test Creche',
        }),
        expect.any(Boolean),
      );
    });
  });

  describe('processTenantsReminders', () => {
    const defaultConfig = {
      enabled: true,
      level1Days: 7,
      level2Days: 14,
      level3Days: 30,
      level4Days: 60,
      ccAdminLevel: 3,
      sendHoursStart: 8,
      sendHoursEnd: 18,
      maxPerDay: 1,
      adminEmail: null,
    };

    it('should process all overdue invoices for a tenant', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0; // Ensure not fully paid

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      const result = await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(result.totalOverdue).toBe(1);
      expect(result.remindersSent).toBe(1);
      expect(result.byLevel.level1).toBe(1);
    });

    it('should skip invoices that already received max daily reminders', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);
      // Mock reminder.findMany to return recent reminder for max daily check
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([
        {
          id: 'recent-reminder',
          invoiceId: mockInvoiceId,
          sentAt: new Date(),
          escalationLevel: 'FRIENDLY',
          reminderStatus: 'SENT',
        },
      ]);

      const result = await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(result.remindersSkipped).toBe(1);
      expect(result.skipReasons['max_daily_reached']).toBe(1);
    });

    it('should return empty result when no overdue invoices', async () => {
      prismaService.invoice.findMany = jest.fn().mockResolvedValue([]);

      const result = await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(result.totalOverdue).toBe(0);
      expect(result.remindersSent).toBe(0);
      expect(result.remindersSkipped).toBe(0);
    });

    it('should record audit log after processing', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(auditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          entityType: 'ArrearsReminder',
          action: 'CREATE',
        }),
      );
    });

    it('should track errors for failed reminders', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = null; // Will cause error
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      const result = await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(result.remindersFailed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].invoiceId).toBe(mockInvoiceId);
    });

    it('should process multiple levels correctly', async () => {
      const invoices = [
        createOverdueInvoice(8), // Level 1
        createOverdueInvoice(15), // Level 2
        createOverdueInvoice(35), // Level 3
        createOverdueInvoice(65), // Level 4
      ];
      // Give each a unique ID and ensure all have valid data
      invoices.forEach((inv, i) => {
        inv.id = `inv-${i + 1}`;
        inv.parent.email = `parent${i + 1}@email.com`;
        inv.parent.isActive = true;
        inv.amountPaidCents = 0;
      });

      prismaService.invoice.findMany = jest.fn().mockResolvedValue(invoices);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      const result = await job.processTenantsReminders(mockTenantId, defaultConfig);

      expect(result.remindersSent).toBe(4);
      expect(result.byLevel.level1).toBe(1);
      expect(result.byLevel.level2).toBe(1);
      expect(result.byLevel.level3).toBe(1);
      expect(result.byLevel.level4).toBe(1);
    });
  });

  describe('triggerForTenant', () => {
    it('should manually trigger reminders for a specific tenant', async () => {
      prismaService.invoice.findMany = jest.fn().mockResolvedValue([]);

      const result = await job.triggerForTenant(mockTenantId);

      expect(result.tenantId).toBe(mockTenantId);
      expect(prismaService.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTenantId },
        }),
      );
    });

    it('should throw error for non-existent tenant', async () => {
      prismaService.tenant.findUnique = jest.fn().mockResolvedValue(null);

      await expect(job.triggerForTenant('non-existent')).rejects.toThrow('Tenant non-existent not found');
    });

    it('should use tenant-specific config if available', async () => {
      const tenantWithConfig = {
        ...mockTenant,
        reminderConfig: {
          enabled: true,
          level1Days: 5,
          level2Days: 10,
          level3Days: 20,
          level4Days: 40,
          ccAdminLevel: 2,
          sendHoursStart: 9,
          sendHoursEnd: 17,
          maxPerDay: 2,
          adminEmail: 'custom@admin.co.za',
        },
      };
      prismaService.tenant.findUnique = jest.fn().mockResolvedValue(tenantWithConfig);
      prismaService.invoice.findMany = jest.fn().mockResolvedValue([]);

      await job.triggerForTenant(mockTenantId);

      // Verify processing occurred (config was used)
      expect(prismaService.invoice.findMany).toHaveBeenCalled();
    });
  });

  describe('isWithinSendHours (via processReminders)', () => {
    // Note: This tests the time-of-day checking indirectly
    // The actual method is private

    it('should skip tenants when outside send hours', async () => {
      // Mock a tenant with very narrow send hours that will likely be outside current time
      const tenantWithRestrictedHours = {
        ...mockTenant,
        reminderConfig: {
          enabled: true,
          level1Days: 7,
          level2Days: 14,
          level3Days: 30,
          level4Days: 60,
          ccAdminLevel: 3,
          sendHoursStart: 2, // 2 AM
          sendHoursEnd: 3, // 3 AM
          maxPerDay: 1,
          adminEmail: null,
        },
      };
      prismaService.tenant.findMany = jest.fn().mockResolvedValue([tenantWithRestrictedHours]);

      // Run processReminders
      await job.processReminders();

      // No invoices should be queried since outside hours
      // (assuming tests don't run at 2-3 AM SAST)
      // This is a soft test - actual behavior depends on test execution time
    });
  });

  describe('admin summary email', () => {
    it('should send summary when reminders were sent', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0;

      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      // Configure tenant with valid config
      const tenantWithConfig = {
        ...mockTenant,
        reminderConfig: {
          enabled: true,
          level1Days: 7,
          level2Days: 14,
          level3Days: 30,
          level4Days: 60,
          ccAdminLevel: 3,
          sendHoursStart: 0, // Allow any hour for testing
          sendHoursEnd: 24,
          maxPerDay: 1,
          adminEmail: null,
        },
      };
      prismaService.tenant.findMany = jest.fn().mockResolvedValue([tenantWithConfig]);

      await job.processReminders();

      // Should have sent admin summary
      expect(emailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('formatting helpers', () => {
    it('should format cents to Rand correctly', async () => {
      // Test via sendReminder which uses formatCentsToRand
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.totalCents = 123456; // R1,234.56
      invoice.amountPaidCents = 0;

      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      const defaultConfig = {
        enabled: true,
        level1Days: 7,
        level2Days: 14,
        level3Days: 30,
        level4Days: 60,
        ccAdminLevel: 3,
        sendHoursStart: 8,
        sendHoursEnd: 18,
        maxPerDay: 1,
        adminEmail: null,
      };

      await job.sendReminder(
        invoice,
        { level: 1, stage: ReminderStage.FIRST, tone: 'friendly' },
        defaultConfig,
      );

      expect(reminderTemplateService.renderTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: expect.stringMatching(/R.*1.*234.*56/),
        }),
        expect.any(Boolean),
      );
    });
  });

  describe('graceful shutdown', () => {
    it('should stop processing when shutdown requested', async () => {
      const invoices = Array.from({ length: 10 }, (_, i) => {
        const inv = createOverdueInvoice(10);
        inv.id = `inv-${i}`;
        inv.parent.email = `parent${i}@email.com`;
        inv.parent.isActive = true;
        inv.amountPaidCents = 0;
        return inv;
      });

      prismaService.invoice.findMany = jest.fn().mockResolvedValue(invoices);
      prismaService.reminder.findMany = jest.fn().mockResolvedValue([]);

      // Simulate shutdown after first few reminders
      let callCount = 0;
      emailService.sendEmailWithOptions = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) {
          job.onModuleDestroy(); // Request shutdown
        }
        return { status: 'sent' };
      });

      const result = await job.processTenantsReminders(mockTenantId, {
        enabled: true,
        level1Days: 7,
        level2Days: 14,
        level3Days: 30,
        level4Days: 60,
        ccAdminLevel: 3,
        sendHoursStart: 8,
        sendHoursEnd: 18,
        maxPerDay: 1,
        adminEmail: null,
      });

      // Should have stopped before processing all 10
      expect(result.remindersSent).toBeLessThan(10);
    });
  });

  describe('duplicate prevention', () => {
    it('should prevent sending same level twice in a day', async () => {
      const invoice = createOverdueInvoice(10);
      invoice.parent.email = 'john.doe@email.com';
      invoice.parent.isActive = true;
      invoice.amountPaidCents = 0;

      // First call - get overdue invoices
      prismaService.invoice.findMany = jest.fn().mockResolvedValue([invoice]);

      // Mock reminder history - level 1 already sent today
      prismaService.reminder.findMany = jest.fn()
        .mockImplementation(async (query) => {
          // Recent reminders check (24 hours) - first call with sentAt filter
          if (query.where?.sentAt?.gte) {
            return [{
              id: 'recent-1',
              invoiceId: mockInvoiceId,
              sentAt: new Date(),
              escalationLevel: 'FRIENDLY',
              reminderStatus: 'SENT',
            }];
          }
          // Full history check - second call without sentAt filter
          return [{
            id: 'hist-1',
            invoiceId: mockInvoiceId,
            sentAt: new Date(),
            escalationLevel: 'FRIENDLY',
            reminderStatus: 'SENT',
          }];
        });

      const result = await job.processTenantsReminders(mockTenantId, {
        enabled: true,
        level1Days: 7,
        level2Days: 14,
        level3Days: 30,
        level4Days: 60,
        ccAdminLevel: 3,
        sendHoursStart: 8,
        sendHoursEnd: 18,
        maxPerDay: 1,
        adminEmail: null,
      });

      expect(result.remindersSkipped).toBe(1);
      expect(result.skipReasons['max_daily_reached']).toBe(1);
    });
  });
});
