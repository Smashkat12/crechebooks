/**
 * Invoice Events Handler
 * Listens for invoice domain events and creates in-app notifications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as DomainEvents from '../../database/events/domain-events';
import { NotificationEmitter } from '../helpers/notification-emitter';

@Injectable()
export class InvoiceEventsHandler {
  private readonly logger = new Logger(InvoiceEventsHandler.name);

  constructor(private readonly emitter: NotificationEmitter) {}

  @OnEvent('invoice.batch.completed', { async: true })
  async handleBatchCompleted(
    event: DomainEvents.InvoiceBatchCompletedEvent,
  ): Promise<void> {
    try {
      const summary = `${event.successCount} generated, ${event.errorCount} failed, ${event.skippedCount} skipped`;

      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'INVOICE_BATCH_COMPLETED',
        priority: event.errorCount > 0 ? 'HIGH' : 'NORMAL',
        title: `Invoice batch for ${event.billingMonth} complete`,
        body: `${summary} (${event.totalEnrollments} enrollments)`,
        actionUrl: '/invoices',
        metadata: {
          billingMonth: event.billingMonth,
          successCount: event.successCount,
          errorCount: event.errorCount,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle invoice.batch.completed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @OnEvent('invoice.sent', { async: true })
  async handleInvoiceSent(
    event: DomainEvents.InvoiceSentEvent,
  ): Promise<void> {
    try {
      const amount = `R ${(event.amountCents / 100).toFixed(2)}`;

      await this.emitter.notifyParent(event.tenantId, event.parentId, {
        type: 'INVOICE_SENT',
        title: `Invoice ${event.invoiceNumber} available`,
        body: `Your invoice for ${amount} is ready to view`,
        actionUrl: '/parent/invoices',
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle invoice.sent: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @OnEvent('invoice.delivery.failed', { async: true })
  async handleDeliveryFailed(
    event: DomainEvents.InvoiceDeliveryFailedEvent,
  ): Promise<void> {
    try {
      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'INVOICE_DELIVERY_FAILED',
        priority: 'HIGH',
        title: `Invoice delivery failed: ${event.invoiceNumber}`,
        body: `Failed to deliver ${event.invoiceNumber} to ${event.parentName} via ${event.channel}: ${event.error}`,
        actionUrl: '/invoices',
        metadata: {
          invoiceId: event.invoiceId,
          channel: event.channel,
          error: event.error,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle invoice.delivery.failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
