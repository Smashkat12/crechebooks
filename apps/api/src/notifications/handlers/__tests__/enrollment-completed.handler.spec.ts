import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnrollmentCompletedHandler } from '../enrollment-completed.handler';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EmailService } from '../../../integrations/email/email.service';
import { EmailTemplateService } from '../../../common/services/email-template/email-template.service';
import { EventEmitterService } from '../../../websocket/services/event-emitter.service';
import { NotificationEmitter } from '../../helpers/notification-emitter';
import { EnrollmentCompletedEvent } from '../../../database/events/enrollment.events';

describe('EnrollmentCompletedHandler', () => {
  let handler: EnrollmentCompletedHandler;
  let prisma: {
    user: { findMany: jest.Mock };
    tenant: { findUnique: jest.Mock };
  };
  let emailService: { sendEmailWithOptions: jest.Mock };
  let emailTemplateService: { renderEnrollmentNotification: jest.Mock };
  let wsEventEmitter: { emitToTenant: jest.Mock };
  let configService: { get: jest.Mock };
  let notificationEmitter: { notifyAdmins: jest.Mock };

  const tenantId = 'tenant-123';

  const baseEvent: EnrollmentCompletedEvent = {
    tenantId,
    enrollmentId: 'enroll-1',
    childId: 'child-1',
    childName: 'Jane Doe',
    parentName: 'John Doe',
    parentEmail: 'john@example.com',
    feeStructureName: 'Full Day',
    monthlyFeeCents: 350000,
    startDate: new Date('2026-02-01'),
    invoiceNumber: 'INV-001',
    source: 'whatsapp_onboarding',
  };

  const mockTenant = {
    name: 'Elle Elephant',
    email: 'info@elle.co.za',
    logoUrl: null,
    primaryColor: '#2563eb',
    footerText: null,
  };

  const mockRendered = {
    subject: 'New Enrollment: Jane Doe at Elle Elephant',
    html: '<html>...</html>',
    text: 'New enrollment...',
  };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn() },
      tenant: { findUnique: jest.fn() },
    };
    emailService = { sendEmailWithOptions: jest.fn() };
    emailTemplateService = { renderEnrollmentNotification: jest.fn() };
    wsEventEmitter = { emitToTenant: jest.fn() };
    configService = { get: jest.fn() };
    notificationEmitter = {
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentCompletedHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: EmailTemplateService, useValue: emailTemplateService },
        { provide: EventEmitterService, useValue: wsEventEmitter },
        { provide: ConfigService, useValue: configService },
        { provide: NotificationEmitter, useValue: notificationEmitter },
      ],
    }).compile();

    handler = module.get(EnrollmentCompletedHandler);
  });

  it('should send email to all admins', async () => {
    const admins = [
      { email: 'admin@elle.co.za', name: 'Admin One' },
      { email: 'owner@elle.co.za', name: 'Owner' },
    ];

    configService.get.mockReturnValue('production');
    prisma.user.findMany.mockResolvedValue(admins);
    prisma.tenant.findUnique.mockResolvedValue(mockTenant);
    emailTemplateService.renderEnrollmentNotification.mockReturnValue(
      mockRendered,
    );
    emailService.sendEmailWithOptions.mockResolvedValue({
      messageId: 'msg-1',
      status: 'sent',
    });

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        role: { in: ['ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { email: true, name: true },
    });

    expect(emailService.sendEmailWithOptions).toHaveBeenCalledTimes(2);
    expect(emailService.sendEmailWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@elle.co.za',
        subject: mockRendered.subject,
        html: mockRendered.html,
        tags: ['enrollment-notification', 'whatsapp_onboarding'],
      }),
    );
  });

  it('should suppress emails in staging environment', async () => {
    configService.get.mockReturnValue('staging');
    prisma.user.findMany.mockResolvedValue([
      { email: 'admin@elle.co.za', name: 'Admin' },
    ]);

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(emailService.sendEmailWithOptions).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('should still emit WebSocket event in staging', async () => {
    configService.get.mockReturnValue('staging');
    prisma.user.findMany.mockResolvedValue([
      { email: 'admin@elle.co.za', name: 'Admin' },
    ]);

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(wsEventEmitter.emitToTenant).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        type: 'enrollment_completed',
        tenantId,
        data: expect.objectContaining({
          childName: 'Jane Doe',
          source: 'whatsapp_onboarding',
        }),
      }),
    );
  });

  it('should handle no admins found gracefully', async () => {
    configService.get.mockReturnValue('production');
    prisma.user.findMany.mockResolvedValue([]);

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(emailService.sendEmailWithOptions).not.toHaveBeenCalled();
  });

  it('should continue sending to other admins if one fails', async () => {
    const admins = [
      { email: 'fail@elle.co.za', name: 'Fail Admin' },
      { email: 'ok@elle.co.za', name: 'OK Admin' },
    ];

    configService.get.mockReturnValue('production');
    prisma.user.findMany.mockResolvedValue(admins);
    prisma.tenant.findUnique.mockResolvedValue(mockTenant);
    emailTemplateService.renderEnrollmentNotification.mockReturnValue(
      mockRendered,
    );
    emailService.sendEmailWithOptions
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValueOnce({ messageId: 'msg-2', status: 'sent' });

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(emailService.sendEmailWithOptions).toHaveBeenCalledTimes(2);
  });

  it('should skip admins without email', async () => {
    configService.get.mockReturnValue('production');
    prisma.user.findMany.mockResolvedValue([
      { email: null, name: 'No Email' },
      { email: 'ok@elle.co.za', name: 'Has Email' },
    ]);
    prisma.tenant.findUnique.mockResolvedValue(mockTenant);
    emailTemplateService.renderEnrollmentNotification.mockReturnValue(
      mockRendered,
    );
    emailService.sendEmailWithOptions.mockResolvedValue({
      messageId: 'msg-1',
      status: 'sent',
    });

    await handler.handleEnrollmentCompleted(baseEvent);

    expect(emailService.sendEmailWithOptions).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmailWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ok@elle.co.za' }),
    );
  });

  it('should format source label correctly for admin_api', async () => {
    configService.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'APP_ENV') return 'production';
      if (key === 'FRONTEND_URL') return defaultVal;
      return defaultVal;
    });
    prisma.user.findMany.mockResolvedValue([
      { email: 'admin@elle.co.za', name: 'Admin' },
    ]);
    prisma.tenant.findUnique.mockResolvedValue(mockTenant);
    emailTemplateService.renderEnrollmentNotification.mockReturnValue(
      mockRendered,
    );
    emailService.sendEmailWithOptions.mockResolvedValue({
      messageId: 'msg-1',
      status: 'sent',
    });

    await handler.handleEnrollmentCompleted({
      ...baseEvent,
      source: 'admin_api',
    });

    expect(
      emailTemplateService.renderEnrollmentNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentSource: 'Admin Portal',
      }),
    );
  });
});
