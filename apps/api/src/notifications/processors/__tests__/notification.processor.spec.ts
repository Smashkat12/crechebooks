import { Test, TestingModule } from '@nestjs/testing';
import { NotificationProcessor } from '../notification.processor';
import { InAppNotificationService } from '../../in-app-notification.service';
import { InAppPreferenceService } from '../../in-app-preference.service';
import { EventEmitterService } from '../../../websocket/services/event-emitter.service';
import { NotificationJobData } from '../../types/in-app-notification.types';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let inAppService: { create: jest.Mock };
  let preferenceService: { getPreferences: jest.Mock; shouldNotify: jest.Mock };
  let eventEmitter: { emitNotificationCreated: jest.Mock };

  const notificationInput = {
    tenantId: 'tenant-1',
    recipientType: 'USER' as const,
    recipientId: 'user-1',
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: 'R500 received',
  };

  const createdNotification = {
    id: 'notif-1',
    tenantId: 'tenant-1',
    recipientType: 'USER',
    recipientId: 'user-1',
    type: 'PAYMENT_RECEIVED',
    priority: 'NORMAL',
    title: 'Payment received',
    body: 'R500 received',
    actionUrl: null,
    metadata: null,
    isRead: false,
    readAt: null,
    expiresAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
  };

  function makeJob(data: NotificationJobData) {
    return { data, id: 'job-1' } as any;
  }

  beforeEach(async () => {
    inAppService = { create: jest.fn() };
    preferenceService = {
      getPreferences: jest.fn().mockResolvedValue({
        disabledTypes: [],
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        inAppEnabled: true,
        emailDigest: false,
      }),
      shouldNotify: jest.fn().mockReturnValue(true),
    };
    eventEmitter = { emitNotificationCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: InAppNotificationService, useValue: inAppService },
        { provide: InAppPreferenceService, useValue: preferenceService },
        { provide: EventEmitterService, useValue: eventEmitter },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  it('should persist notification via InAppNotificationService.create', async () => {
    inAppService.create.mockResolvedValue(createdNotification);

    await processor.handleNotification(
      makeJob({ notification: notificationInput }),
    );

    expect(inAppService.create).toHaveBeenCalledWith(notificationInput);
  });

  it('should emit WebSocket event after persistence', async () => {
    inAppService.create.mockResolvedValue(createdNotification);

    await processor.handleNotification(
      makeJob({ notification: notificationInput }),
    );

    expect(eventEmitter.emitNotificationCreated).toHaveBeenCalledWith(
      'tenant-1',
      {
        notificationId: 'notif-1',
        type: 'PAYMENT_RECEIVED',
        priority: 'NORMAL',
        title: 'Payment received',
        recipientType: 'USER',
        recipientId: 'user-1',
      },
    );
  });

  it('should not throw on create error (logs instead)', async () => {
    inAppService.create.mockRejectedValue(new Error('DB down'));

    // Should not throw — errors are caught and logged
    await expect(
      processor.handleNotification(
        makeJob({ notification: notificationInput }),
      ),
    ).resolves.toBeUndefined();

    // WebSocket emit should not have been called
    expect(eventEmitter.emitNotificationCreated).not.toHaveBeenCalled();
  });

  it('should not throw on WebSocket error (logs instead)', async () => {
    inAppService.create.mockResolvedValue(createdNotification);
    eventEmitter.emitNotificationCreated.mockImplementation(() => {
      throw new Error('WS unavailable');
    });

    // The entire try block catches the error — should not propagate
    await expect(
      processor.handleNotification(
        makeJob({ notification: notificationInput }),
      ),
    ).resolves.toBeUndefined();
  });
});
