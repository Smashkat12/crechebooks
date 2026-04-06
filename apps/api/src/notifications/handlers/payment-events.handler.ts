/**
 * Payment Events Handler
 * Listens for payment domain events and creates in-app notifications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as DomainEvents from '../../database/events/domain-events';
import { NotificationEmitter } from '../helpers/notification-emitter';

@Injectable()
export class PaymentEventsHandler {
  private readonly logger = new Logger(PaymentEventsHandler.name);

  constructor(private readonly emitter: NotificationEmitter) {}

  @OnEvent('payment.allocated', { async: true })
  async handlePaymentAllocated(
    event: DomainEvents.PaymentAllocatedEvent,
  ): Promise<void> {
    try {
      const amount = `R ${(event.amountCents / 100).toFixed(2)}`;

      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'PAYMENT_ALLOCATED',
        title: `Payment received: ${amount}`,
        body: `${amount} from ${event.parentName} allocated to ${event.invoiceNumber}`,
        actionUrl: '/payments',
        metadata: {
          paymentId: event.paymentId,
          amountCents: event.amountCents,
        },
      });

      await this.emitter.notifyParent(event.tenantId, event.parentId, {
        type: 'PAYMENT_ALLOCATED',
        title: 'Payment confirmed',
        body: `Your payment of ${amount} has been allocated to invoice ${event.invoiceNumber}`,
        actionUrl: '/parent/payments',
      });
    } catch (error) {
      this.logger.error(
        `Failed to handle payment.allocated: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
