import { Test, TestingModule } from '@nestjs/testing';
import { StaffEventsHandler } from '../staff-events.handler';
import { NotificationEmitter } from '../../helpers/notification-emitter';
import type {
  StaffLeaveRequestedEvent,
  StaffLeaveDecisionEvent,
} from '../../../database/events/domain-events';

describe('StaffEventsHandler', () => {
  let handler: StaffEventsHandler;
  let notificationEmitter: { notifyAdmins: jest.Mock; notifyStaff: jest.Mock };

  const tenantId = 'tenant-abc';

  const baseLeaveRequestedEvent: StaffLeaveRequestedEvent = {
    tenantId,
    staffId: 'staff-1',
    staffName: 'Jane Smith',
    leaveType: 'Annual',
    startDate: new Date('2026-06-02'),
    endDate: new Date('2026-06-06'),
    days: 5,
  };

  const baseLeaveDecisionEvent: StaffLeaveDecisionEvent = {
    tenantId,
    staffId: 'staff-1',
    staffName: 'Jane Smith',
    leaveType: 'Annual',
    startDate: new Date('2026-06-02'),
    endDate: new Date('2026-06-06'),
    decision: 'APPROVED',
  };

  beforeEach(async () => {
    notificationEmitter = {
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      notifyStaff: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffEventsHandler,
        { provide: NotificationEmitter, useValue: notificationEmitter },
      ],
    }).compile();

    handler = module.get(StaffEventsHandler);
  });

  describe('handleLeaveRequested', () => {
    it('should call notifyAdmins with STAFF_LEAVE_REQUESTED type', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      expect(notificationEmitter.notifyAdmins).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ type: 'STAFF_LEAVE_REQUESTED' }),
      );
    });

    it('should include staff name, days, and leave type in the body', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.body).toContain('Jane Smith');
      expect(params.body).toContain('5 days');
      expect(params.body).toContain('Annual');
    });

    it('body must contain "Any admin can approve" (case-insensitive)', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.body.toLowerCase()).toContain('any admin can approve');
    });

    it('should use singular "day" when days === 1', async () => {
      await handler.handleLeaveRequested({
        ...baseLeaveRequestedEvent,
        days: 1,
      });

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.body).toContain('1 day ');
      expect(params.body).not.toContain('1 days');
    });

    it('should keep title unchanged as "Leave request: {staffName}"', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.title).toBe('Leave request: Jane Smith');
    });

    it('should keep actionUrl as "/staff/leave"', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.actionUrl).toBe('/staff/leave');
    });

    it('should keep metadata with staffId, leaveType, and days', async () => {
      await handler.handleLeaveRequested(baseLeaveRequestedEvent);

      const params = notificationEmitter.notifyAdmins.mock.calls[0][1];
      expect(params.metadata).toEqual({
        staffId: 'staff-1',
        leaveType: 'Annual',
        days: 5,
      });
    });

    it('should not throw on notifyAdmins failure', async () => {
      notificationEmitter.notifyAdmins.mockRejectedValueOnce(
        new Error('Queue unavailable'),
      );

      await expect(
        handler.handleLeaveRequested(baseLeaveRequestedEvent),
      ).resolves.not.toThrow();
    });
  });

  describe('handleLeaveDecided', () => {
    it('should call notifyStaff with STAFF_LEAVE_DECISION type', async () => {
      await handler.handleLeaveDecided(baseLeaveDecisionEvent);

      expect(notificationEmitter.notifyStaff).toHaveBeenCalledWith(
        tenantId,
        'staff-1',
        expect.objectContaining({ type: 'STAFF_LEAVE_DECISION' }),
      );
    });

    it('should use "approved" in body for APPROVED decision', async () => {
      await handler.handleLeaveDecided(baseLeaveDecisionEvent);

      const params = notificationEmitter.notifyStaff.mock.calls[0][2];
      expect(params.body).toContain('approved');
      expect(params.title).toBe('Leave approved');
    });

    it('should use "rejected" in body for REJECTED decision', async () => {
      await handler.handleLeaveDecided({
        ...baseLeaveDecisionEvent,
        decision: 'REJECTED',
      });

      const params = notificationEmitter.notifyStaff.mock.calls[0][2];
      expect(params.body).toContain('rejected');
      expect(params.title).toBe('Leave rejected');
    });

    it('should not throw on notifyStaff failure', async () => {
      notificationEmitter.notifyStaff.mockRejectedValueOnce(
        new Error('Queue unavailable'),
      );

      await expect(
        handler.handleLeaveDecided(baseLeaveDecisionEvent),
      ).resolves.not.toThrow();
    });
  });
});
