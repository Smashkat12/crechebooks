/**
 * Billing Module
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * TASK-PAY-015: Payment Reminder Scheduler Service
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 *
 * NOTE: BillingSchedulerModule was dissolved into SchedulerModule because it was
 * never imported into the app module graph, causing its providers to be unreachable.
 * InvoiceScheduleService and PaymentReminderService now live in SchedulerModule.
 * This file is retained for the remaining type / DTO exports consumed via billing/index.ts.
 */
