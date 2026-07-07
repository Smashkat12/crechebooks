/**
 * ArrearsController POST /arrears/reminder Tests
 *
 * The endpoint was a stub (returned fake counts, sent nothing). It now
 * delegates to ReminderService.sendManualParentReminders and audit-logs
 * the operator-initiated send. ReminderService is mocked — no real sends.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ArrearsController } from '../../../src/api/arrears/arrears.controller';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { ArrearsReportPdfService } from '../../../src/database/services/arrears-report-pdf.service';
import { ReminderService } from '../../../src/database/services/reminder.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { DeliveryChannel } from '../../../src/database/dto/reminder.dto';
import { ReminderMethod } from '../../../src/api/arrears/dto';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';

describe('ArrearsController - POST /arrears/reminder', () => {
  let controller: ArrearsController;
  let mockReminderService: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';

  const adminUser: IUser = {
    id: 'user-1',
    tenantId,
    auth0Id: 'auth0|admin',
    email: 'admin@school.com',
    role: UserRole.ADMIN,
    name: 'Admin',
    isActive: true,
    lastLoginAt: null,
    currentTenantId: tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const serviceResult = {
    sent: 1,
    failed: 0,
    skipped: 1,
    byChannel: {
      email: { sent: 1, failed: 0 },
      whatsapp: { sent: 0, failed: 0 },
    },
    details: [
      { parentId: 'parent-1', status: 'SENT' as const, invoiceId: 'inv-1' },
      {
        parentId: 'parent-2',
        status: 'SKIPPED' as const,
        error: 'No overdue invoices',
      },
    ],
  };

  beforeEach(async () => {
    mockReminderService = {
      sendManualParentReminders: jest.fn().mockResolvedValue(serviceResult),
    };
    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArrearsController],
      providers: [
        { provide: InvoiceRepository, useValue: { findOverdue: jest.fn() } },
        { provide: ParentRepository, useValue: { findById: jest.fn() } },
        { provide: ChildRepository, useValue: { findById: jest.fn() } },
        {
          provide: ArrearsReportPdfService,
          useValue: { generatePdf: jest.fn() },
        },
        { provide: ReminderService, useValue: mockReminderService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    controller = module.get<ArrearsController>(ArrearsController);
  });

  it('delegates to ReminderService with the mapped channel and template', async () => {
    await controller.sendReminder(
      {
        parentIds: ['parent-1', 'parent-2'],
        method: ReminderMethod.BOTH,
        template: 'Dear Jane Doe, please settle. Elle Elephant',
      },
      adminUser,
    );

    expect(mockReminderService.sendManualParentReminders).toHaveBeenCalledWith({
      tenantId,
      parentIds: ['parent-1', 'parent-2'],
      channel: DeliveryChannel.BOTH,
      template: 'Dear Jane Doe, please settle. Elle Elephant',
    });
  });

  it('returns the true counts from the service (not fake parentIds.length)', async () => {
    const response = await controller.sendReminder(
      {
        parentIds: ['parent-1', 'parent-2'],
        method: ReminderMethod.EMAIL,
        template: 'Reminder',
      },
      adminUser,
    );

    expect(response).toEqual({
      success: true,
      sent: 1,
      failed: 0,
      skipped: 1,
      byChannel: serviceResult.byChannel,
    });
  });

  it('reports success=false when any parent send failed', async () => {
    mockReminderService.sendManualParentReminders.mockResolvedValue({
      ...serviceResult,
      sent: 0,
      failed: 2,
      byChannel: {
        email: { sent: 0, failed: 2 },
        whatsapp: { sent: 0, failed: 0 },
      },
    });

    const response = await controller.sendReminder(
      { parentIds: ['parent-1', 'parent-2'], method: ReminderMethod.EMAIL },
      adminUser,
    );

    expect(response.success).toBe(false);
    expect(response.failed).toBe(2);
  });

  it('audit-logs the send with userId and outcome counts', async () => {
    await controller.sendReminder(
      {
        parentIds: ['parent-1', 'parent-2'],
        method: ReminderMethod.WHATSAPP,
        template: 'Reminder',
      },
      adminUser,
    );

    expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        userId: 'user-1',
        entityType: 'ArrearsReminder',
        afterValue: expect.objectContaining({
          method: ReminderMethod.WHATSAPP,
          sent: 1,
          failed: 0,
          skipped: 1,
        }),
      }),
    );
  });

  it('propagates service errors without swallowing them', async () => {
    mockReminderService.sendManualParentReminders.mockRejectedValue(
      new Error('Tenant tenant-123 not found'),
    );

    await expect(
      controller.sendReminder(
        { parentIds: ['parent-1'], method: ReminderMethod.EMAIL },
        adminUser,
      ),
    ).rejects.toThrow('Tenant tenant-123 not found');

    expect(mockAuditLogService.logAction).not.toHaveBeenCalled();
  });
});
