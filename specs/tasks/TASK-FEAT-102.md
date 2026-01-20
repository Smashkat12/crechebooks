<task_spec id="TASK-FEAT-102" version="1.0">

<metadata>
  <title>Automated Arrears Reminders</title>
  <status>ready</status>
  <phase>usacf-sprint-4</phase>
  <layer>feature</layer>
  <sequence>211</sequence>
  <priority>P1-HIGH</priority>
  <sprint>4</sprint>
  <estimated_effort>5 days (40 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP010</opportunity_ref>
    <gap_ref>C005</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="required">TASK-REL-101</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>88%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP010</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture - reminder configs are per-tenant.
    Arrears collection is critical for creche cash flow - automation is high-value.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <queue>BullMQ with Redis for scheduled jobs</queue>
    <email>Existing email service for sending</email>
    <cron>@nestjs/schedule for cron jobs</cron>
    <testing>Jest for unit/integration, no mock data - test real email scenarios</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - new reminder system replaces any manual process</rule>
    <rule id="2">NO MOCK DATA in tests - test with real email service (use test mailbox)</rule>
    <rule id="3">ROBUST ERROR LOGGING - log all failed sends with recipient, reason</rule>
    <rule id="4">TENANT ISOLATION - reminder configs and history per tenantId</rule>
    <rule id="5">RESPECT OPT-OUT - never send reminders to opted-out parents</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="jobs">Background jobs in apps/api/src/jobs/ with @Cron decorator</pattern>
    <pattern name="entity">Database entities in apps/api/src/database/entities/</pattern>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="templates">Email templates in apps/api/src/notifications/templates/</pattern>
  </coding_patterns>

  <existing_email_structure>
    - Email service at apps/api/src/notifications/email.service.ts
    - Invoice service at apps/api/src/database/services/invoice.service.ts
    - Currently NO automated reminders (this task adds them)
  </existing_email_structure>

  <reminder_business_rules>
    - Level 1: 7 days overdue - friendly tone
    - Level 2: 14 days overdue - firm tone
    - Level 3: 30 days overdue - serious, CC admin
    - Level 4: 60 days overdue - final notice
    - Stop reminders immediately when payment received
    - Maximum 1 reminder per invoice per day
    - Only send between 8 AM - 6 PM local time
  </reminder_business_rules>
</project_context>

<executive_summary>
Implement automated email reminders for overdue invoices with configurable escalation
schedule. Currently, arrears notifications are manual, leading to delayed follow-up and
increased bad debt. System will send progressive reminders at 7, 14, 30, and 60 days
with escalating urgency.
</executive_summary>

<business_case>
  <problem>Manual arrears follow-up causes delays and inconsistency</problem>
  <solution>Automated progressive reminder emails with configurable schedule</solution>
  <benefit>Faster payment collection, reduced bad debt</benefit>
  <roi>Estimated 15% improvement in arrears collection rate</roi>
</business_case>

<context>
GAP C005: No automated arrears reminders.

Current State:
- Administrators manually track arrears
- Email reminders sent individually
- No escalation schedule
- Inconsistent follow-up

Impact:
- Delayed payment collection
- Increased bad debt
- Administrative burden
- Missed follow-up opportunities
</context>

<input_context_files>
  <file purpose="invoice_service">apps/api/src/database/services/invoice.service.ts</file>
  <file purpose="email_service">apps/api/src/notifications/email.service.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Arrears detection job
    - Configurable reminder schedule
    - Email template per escalation level
    - Reminder history tracking
    - Opt-out management
    - Tenant-specific configuration
    - Admin notification summary
    - Circuit breaker for email service
  </in_scope>
  <out_of_scope>
    - SMS/WhatsApp reminders (future feature)
    - Automated payment links
    - Legal notice generation
    - Debt collection integration
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/jobs/arrears-reminder.job.ts">
      @Injectable()
      export class ArrearsReminderJob {
        @Cron('0 8 * * *') // Daily at 8 AM
        async processReminders(): Promise&lt;ReminderJobResult&gt;;

        async getOverdueInvoices(tenantId: string): Promise&lt;OverdueInvoice[]&gt;;

        async determineReminderLevel(
          invoice: OverdueInvoice,
          history: ReminderHistory[]
        ): Promise&lt;ReminderLevel&gt;;

        async sendReminder(
          invoice: OverdueInvoice,
          level: ReminderLevel
        ): Promise&lt;void&gt;;
      }
    </signature>
    <signature file="apps/api/src/database/entities/reminder-history.entity.ts">
      @Entity('reminder_history')
      export class ReminderHistory {
        id: string;
        invoiceId: string;
        tenantId: string;
        level: ReminderLevel;
        sentAt: Date;
        recipientEmail: string;
        templateUsed: string;
        deliveryStatus: 'sent' | 'delivered' | 'failed' | 'bounced';
      }
    </signature>
    <signature file="apps/api/src/database/entities/reminder-config.entity.ts">
      @Entity('reminder_config')
      export class ReminderConfig {
        tenantId: string;
        level1Days: number;  // Default: 7
        level2Days: number;  // Default: 14
        level3Days: number;  // Default: 30
        level4Days: number;  // Default: 60
        enabled: boolean;
        ccAdmin: boolean;
      }
    </signature>
    <signature file="apps/api/src/notifications/templates/arrears-reminder.template.ts">
      export interface ArrearsReminderData {
        parentName: string;
        childName: string;
        invoiceNumber: string;
        amount: number;
        dueDate: Date;
        daysOverdue: number;
        level: ReminderLevel;
        paymentLink?: string;
      }

      export function renderArrearsReminder(
        data: ArrearsReminderData,
        level: ReminderLevel
      ): EmailContent;
    </signature>
  </signatures>

  <constraints>
    - Reminders sent between 8 AM - 6 PM local time only
    - Maximum 1 reminder per invoice per day
    - Respect opt-out preferences
    - CC administrator on level 3+
    - Track delivery status
    - Pause reminders if payment received
  </constraints>

  <verification>
    - Reminders sent at correct intervals
    - Email delivery tracked
    - Opt-out respected
    - Payment stops reminders
    - Admin summary generated
    - All existing tests pass
  </verification>
</definition_of_done>

<reminder_schedule>
  <level number="1" days="7" tone="friendly">
    Gentle reminder of upcoming/recently passed due date
  </level>
  <level number="2" days="14" tone="firm">
    Second reminder with payment urgency
  </level>
  <level number="3" days="30" tone="serious">
    Formal notice with potential consequences
  </level>
  <level number="4" days="60" tone="final">
    Final notice before further action
  </level>
</reminder_schedule>

<implementation_approach>
  <step order="1">
    Create ReminderHistory and ReminderConfig entities
  </step>
  <step order="2">
    Create ArrearsReminderJob cron job
  </step>
  <step order="3">
    Implement reminder level determination logic
  </step>
  <step order="4">
    Create email templates for each level
  </step>
  <step order="5">
    Integrate with email service (with circuit breaker)
  </step>
  <step order="6">
    Create admin summary email
  </step>
  <step order="7">
    Add opt-out management
  </step>
  <step order="8">
    Create configuration UI (optional)
  </step>
</implementation_approach>

<email_templates>
  <template level="1" subject="Friendly Payment Reminder - {invoiceNumber}">
    Dear {parentName},

    This is a friendly reminder that invoice {invoiceNumber} for {childName}'s
    fees was due on {dueDate}. The outstanding amount is R{amount}.

    Please arrange payment at your earliest convenience.

    Best regards,
    {crecheName}
  </template>
  <template level="2" subject="Second Payment Reminder - {invoiceNumber}">
    Dear {parentName},

    Our records show that invoice {invoiceNumber} is now {daysOverdue} days
    overdue. The outstanding amount is R{amount}.

    Please prioritize this payment to avoid any disruption.

    Best regards,
    {crecheName}
  </template>
  <template level="3" subject="Important: Payment Required - {invoiceNumber}">
    Dear {parentName},

    Invoice {invoiceNumber} is now {daysOverdue} days overdue. Despite
    previous reminders, we have not received payment of R{amount}.

    Please contact us immediately to discuss payment arrangements.

    Regards,
    {crecheName}
  </template>
  <template level="4" subject="Final Notice - Immediate Payment Required">
    Dear {parentName},

    This is a final notice regarding invoice {invoiceNumber}, which is
    {daysOverdue} days overdue. The outstanding amount is R{amount}.

    Failure to pay or contact us within 7 days may result in further action.

    Regards,
    {crecheName}
  </template>
</email_templates>

<files_to_create>
  <file path="apps/api/src/database/entities/reminder-history.entity.ts">
    Reminder history entity
  </file>
  <file path="apps/api/src/database/entities/reminder-config.entity.ts">
    Reminder configuration entity
  </file>
  <file path="apps/api/src/jobs/arrears-reminder.job.ts">
    Arrears reminder cron job
  </file>
  <file path="apps/api/src/notifications/templates/arrears-reminder.template.ts">
    Email templates
  </file>
  <file path="apps/api/src/api/admin/reminder-config.controller.ts">
    Configuration API
  </file>
  <file path="apps/api/src/jobs/__tests__/arrears-reminder.job.spec.ts">
    Job tests
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">
    Add ReminderHistory and ReminderConfig models
  </file>
  <file path="apps/api/src/database/services/invoice.service.ts">
    Add method to check/pause reminders on payment
  </file>
  <file path="apps/api/src/notifications/email.service.ts">
    Add arrears reminder method
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Reminders sent at correct day intervals</criterion>
  <criterion>Email templates render correctly</criterion>
  <criterion>Payment stops future reminders</criterion>
  <criterion>Opt-out preference respected</criterion>
  <criterion>Admin receives summary</criterion>
  <criterion>Delivery status tracked</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_reminder_tables</command>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="arrears-reminder" --verbose</command>
</test_commands>

<success_metrics>
  <metric name="reminder_delivery_rate">99%</metric>
  <metric name="collection_improvement">15%</metric>
  <metric name="admin_time_saved">80%</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: AUTOMATED_REMINDERS (default: true)
  - Disable cron job without data loss
  - Manual reminders still possible
</rollback_plan>

</task_spec>
