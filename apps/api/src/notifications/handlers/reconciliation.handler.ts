/**
 * Reconciliation Events Handler
 * Notifies admins when bank reconciliation completes or has discrepancies.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as DomainEvents from '../../database/events/domain-events';
import { NotificationEmitter } from '../helpers/notification-emitter';

@Injectable()
export class ReconciliationHandler {
  private readonly logger = new Logger(ReconciliationHandler.name);

  constructor(private readonly emitter: NotificationEmitter) {}

  @OnEvent('reconciliation.completed', { async: true })
  async handleCompleted(
    event: DomainEvents.ReconciliationCompletedEvent,
  ): Promise<void> {
    try {
      const summary = `${event.matchedCount} matched, ${event.unmatchedCount} unmatched`;

      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'RECONCILIATION_COMPLETED',
        title: `Reconciliation complete: ${event.period}`,
        body: summary,
        actionUrl: '/reconciliation',
        metadata: {
          period: event.period,
          matchedCount: event.matchedCount,
          unmatchedCount: event.unmatchedCount,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle reconciliation.completed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @OnEvent('reconciliation.discrepancy', { async: true })
  async handleDiscrepancy(
    event: DomainEvents.ReconciliationCompletedEvent,
  ): Promise<void> {
    try {
      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'RECONCILIATION_DISCREPANCY',
        priority: 'HIGH',
        title: `Reconciliation discrepancies: ${event.period}`,
        body: `${event.discrepancyCount} discrepanc${event.discrepancyCount === 1 ? 'y' : 'ies'} found for ${event.period}`,
        actionUrl: '/reconciliation',
        metadata: {
          period: event.period,
          discrepancyCount: event.discrepancyCount,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle reconciliation.discrepancy: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
