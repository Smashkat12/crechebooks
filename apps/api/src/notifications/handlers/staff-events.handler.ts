/**
 * Staff Events Handler
 * Notifies admins of leave requests and staff of leave decisions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as DomainEvents from '../../database/events/domain-events';
import { NotificationEmitter } from '../helpers/notification-emitter';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

@Injectable()
export class StaffEventsHandler {
  private readonly logger = new Logger(StaffEventsHandler.name);

  constructor(private readonly emitter: NotificationEmitter) {}

  @OnEvent('staff.leave.requested', { async: true })
  async handleLeaveRequested(
    event: DomainEvents.StaffLeaveRequestedEvent,
  ): Promise<void> {
    try {
      const period = `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;

      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'STAFF_LEAVE_REQUESTED',
        title: `Leave request: ${event.staffName}`,
        body: `${event.staffName} requested ${event.days} day${event.days === 1 ? '' : 's'} ${event.leaveType} leave (${period})`,
        actionUrl: '/staff/leave',
        metadata: {
          staffId: event.staffId,
          leaveType: event.leaveType,
          days: event.days,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle staff.leave.requested: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @OnEvent('staff.leave.decided', { async: true })
  async handleLeaveDecided(
    event: DomainEvents.StaffLeaveDecisionEvent,
  ): Promise<void> {
    try {
      const period = `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
      const verb = event.decision === 'APPROVED' ? 'approved' : 'rejected';

      await this.emitter.notifyStaff(event.tenantId, event.staffId, {
        type: 'STAFF_LEAVE_DECISION',
        title: `Leave ${verb}`,
        body: `Your ${event.leaveType} leave request (${period}) has been ${verb}`,
        actionUrl: '/staff/leave',
        metadata: {
          decision: event.decision,
          leaveType: event.leaveType,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle staff.leave.decided: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
