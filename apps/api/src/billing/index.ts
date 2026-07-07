/**
 * Billing Module Exports
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * TASK-PAY-017: Tenant-Customizable Reminder Template Entity
 *
 * BillingSchedulerModule dissolved into SchedulerModule (TASK-BILL-016 fix).
 * InvoiceScheduleService and StatementScheduleService are provided by
 * SchedulerModule and imported there directly — they are not re-exported from
 * this barrel to avoid confusion.
 *
 * PaymentReminderService and its types/reminder.types were deleted: they
 * duplicated ArrearsReminderJob (src/jobs/arrears-reminder.job.ts), the
 * complete always-on arrears reminder engine.
 */

export { ReminderTemplateService } from './reminder-template.service';

// Re-export template DTOs
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
