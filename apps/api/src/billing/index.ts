/**
 * Billing Module Exports
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * TASK-PAY-015: Payment Reminder Scheduler Service
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 */

export { BillingSchedulerModule } from './billing.module';
export { InvoiceScheduleService } from './invoice-schedule.service';
export { PaymentReminderService } from './payment-reminder.service';
export { ReminderTemplateService } from './reminder-template.service';

// Re-export from types (original reminder types)
export type {
  ReminderStage,
  ReminderChannel,
  ReminderSchedule,
  InvoiceWithParent,
  OverdueInvoice,
  ReminderHistory,
  PaymentReminderResult,
} from './types/reminder.types';

export {
  DEFAULT_REMINDER_SCHEDULE,
  getStageForDaysOverdue,
  getScheduleForStage,
  shouldUseWhatsApp,
} from './types/reminder.types';

// Re-export template DTOs (with aliases to avoid conflicts)
export {
  ReminderStage as TemplateReminderStage,
  ReminderChannel as TemplateReminderChannel,
  CreateReminderTemplateDto,
  UpdateReminderTemplateDto,
  DEFAULT_TEMPLATES,
  getDefaultTemplate,
  TEMPLATE_PLACEHOLDERS,
} from './dto/reminder-template.dto';

export type {
  ReminderTemplateResponse,
  TemplateVariables,
  DefaultTemplateContent,
} from './dto/reminder-template.dto';
