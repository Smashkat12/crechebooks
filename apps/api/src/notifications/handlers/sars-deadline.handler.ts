/**
 * SARS Deadline Handler
 * Notifies admins when SARS tax return deadlines are approaching.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as DomainEvents from '../../database/events/domain-events';
import { NotificationEmitter } from '../helpers/notification-emitter';

function deadlinePriority(daysRemaining: number): string {
  if (daysRemaining <= 3) return 'URGENT';
  if (daysRemaining <= 7) return 'HIGH';
  if (daysRemaining <= 14) return 'NORMAL';
  return 'LOW';
}

@Injectable()
export class SarsDeadlineHandler {
  private readonly logger = new Logger(SarsDeadlineHandler.name);

  constructor(private readonly emitter: NotificationEmitter) {}

  @OnEvent('sars.deadline.approaching', { async: true })
  async handleDeadlineApproaching(
    event: DomainEvents.SarsDeadlineEvent,
  ): Promise<void> {
    try {
      const dueFormatted = event.dueDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'SARS_DEADLINE',
        priority: deadlinePriority(event.daysRemaining),
        title: `${event.returnType} due in ${event.daysRemaining} day${event.daysRemaining === 1 ? '' : 's'}`,
        body: `${event.returnType} submission deadline: ${dueFormatted}`,
        actionUrl: '/sars',
        metadata: {
          returnType: event.returnType,
          dueDate: event.dueDate.toISOString(),
          daysRemaining: event.daysRemaining,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle sars.deadline.approaching: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
