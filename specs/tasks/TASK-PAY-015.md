<task_spec id="TASK-PAY-015" version="1.0">

<metadata>
  <title>Payment Reminder Scheduler Service</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>102</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <critical_issue_ref>CRIT-011</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-INFRA-011</task_ref>
    <task_ref status="COMPLETE">TASK-PAY-008</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use scheduling and workflow thinking.
This task involves:
1. Cron job for automated payment reminders
2. Configurable reminder intervals (7, 14, 30, 45 days)
3. Multi-channel delivery (email/WhatsApp)
4. Escalation after 3 reminders
5. Duplicate prevention
</reasoning_mode>

<context>
CRITICAL GAP: No automated payment reminders exist. Currently only manual API trigger works.

REQ-PAY-009 specifies: "Automated reminders for overdue payments."

This task creates PaymentReminderProcessor using the SchedulerModule (TASK-INFRA-011) to automatically send payment reminders.
</context>

<current_state>
## Codebase State
- SchedulerModule created (TASK-INFRA-011)
- QUEUE_NAMES.PAYMENT_REMINDER defined
- NotificationService exists for email
- WhatsAppService exists (TASK-BILL-015)
- No payment reminder processor

## What Exists
- ArrearsReport generation
- Invoice entity with dueDate
- Parent entity with contactPreferences
</current_state>

<input_context_files>
  <file purpose="scheduler_module">apps/api/src/scheduler/scheduler.module.ts</file>
  <file purpose="notification_service">apps/api/src/notifications/notification.service.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="parent_entity">apps/api/src/database/entities/parent.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - PaymentReminderProcessor extending BaseProcessor
    - Cron job registration (daily at 09:00 SAST)
    - Configurable reminder intervals
    - Multi-channel delivery
    - Escalation logic after 3 reminders
    - Duplicate reminder prevention
    - Reminder history tracking
  </in_scope>
  <out_of_scope>
    - Template content editing (HIGH-006)
    - Collection agency integration
    - SMS channel (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/scheduler/processors/payment-reminder.processor.ts">
      @Processor(QUEUE_NAMES.PAYMENT_REMINDER)
      export class PaymentReminderProcessor extends BaseProcessor<PaymentReminderJobData> {
        protected readonly logger = new Logger(PaymentReminderProcessor.name);

        protected async processJob(job: Job<PaymentReminderJobData>): Promise<void>;

        private async findOverdueInvoices(tenantId: string): Promise<InvoiceWithParent[]>;

        private async sendReminder(invoice: InvoiceWithParent, stage: ReminderStage): Promise<void>;

        private async checkDuplicateReminder(invoiceId: string, stage: ReminderStage): Promise<boolean>;
      }
    </signature>
    <signature file="apps/api/src/billing/payment-reminder.service.ts">
      @Injectable()
      export class PaymentReminderService {
        async scheduleReminders(tenantId: string): Promise<void>;
        async cancelReminders(tenantId: string): Promise<void>;
        async getOverdueInvoices(tenantId: string): Promise<OverdueInvoice[]>;
        async getReminderHistory(invoiceId: string): Promise<ReminderHistory[]>;
        async markEscalated(invoiceId: string): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/billing/types/reminder.types.ts">
      export type ReminderStage = 'FIRST' | 'SECOND' | 'FINAL' | 'ESCALATED';

      export interface ReminderSchedule {
        stage: ReminderStage;
        daysOverdue: number;
        channels: ('email' | 'whatsapp')[];
      }

      export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule[] = [
        { stage: 'FIRST', daysOverdue: 7, channels: ['email'] },
        { stage: 'SECOND', daysOverdue: 14, channels: ['email', 'whatsapp'] },
        { stage: 'FINAL', daysOverdue: 30, channels: ['email', 'whatsapp'] },
        { stage: 'ESCALATED', daysOverdue: 45, channels: ['email'] },
      ];
    </signature>
  </signatures>

  <constraints>
    - Default schedule: 0 9 * * * (09:00 SAST daily)
    - Reminder intervals: 7, 14, 30, 45 days overdue
    - Max 4 reminders per invoice
    - Must respect parent notification preferences
    - No duplicate reminders within 24 hours
    - Escalation at 45 days flags for manual review
  </constraints>

  <verification>
    - Cron job runs daily at 09:00 SAST
    - Overdue invoices identified correctly
    - Reminders sent at correct intervals
    - No duplicate reminders
    - Escalation triggers at 45 days
    - History tracked per invoice
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/scheduler/processors/payment-reminder.processor.ts">Reminder processor</file>
  <file path="apps/api/src/billing/payment-reminder.service.ts">Reminder service</file>
  <file path="apps/api/src/billing/types/reminder.types.ts">Types</file>
  <file path="apps/api/src/scheduler/processors/__tests__/payment-reminder.processor.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/scheduler/scheduler.module.ts">Register PaymentReminderProcessor</file>
  <file path="apps/api/src/billing/billing.module.ts">Export PaymentReminderService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Processor registered with queue</criterion>
  <criterion>Cron job runs at 09:00 SAST</criterion>
  <criterion>Reminder intervals respected</criterion>
  <criterion>No duplicate reminders</criterion>
  <criterion>Escalation at 45 days</criterion>
  <criterion>Multi-channel delivery works</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="payment-reminder" --verbose</command>
</test_commands>

</task_spec>
