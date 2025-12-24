/**
 * Billing Module
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * TASK-PAY-015: Payment Reminder Scheduler Service
 *
 * Provides billing services including invoice and payment reminder scheduling.
 */

import { Module } from '@nestjs/common';
import { InvoiceScheduleService } from './invoice-schedule.service';
import { PaymentReminderService } from './payment-reminder.service';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [SchedulerModule, DatabaseModule],
  providers: [InvoiceScheduleService, PaymentReminderService],
  exports: [InvoiceScheduleService, PaymentReminderService],
})
export class BillingSchedulerModule {}
