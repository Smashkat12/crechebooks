<task_spec id="TASK-SARS-017" version="1.0">

<metadata>
  <title>SARS Deadline Reminder System</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>104</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-SARS-011</requirement_ref>
    <critical_issue_ref>CRIT-005</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-INFRA-011</task_ref>
    <task_ref status="COMPLETE">TASK-SARS-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use compliance and scheduling thinking.
This task involves:
1. SARS deadline calendar management
2. Cron job for daily deadline checks
3. Multi-level reminders (30, 14, 7, 3, 1 days)
4. Multi-channel delivery
5. Tenant preference management
</reasoning_mode>

<context>
CRITICAL GAP: No SARS deadline reminder system exists. Missing deadlines results in SARS penalties.

REQ-SARS-011 specifies: "Deadline reminders for VAT201, EMP201, IRP5 submissions."

This task creates SarsDeadlineProcessor using SchedulerModule to send proactive deadline reminders.
</context>

<current_state>
## Codebase State
- SchedulerModule created (TASK-INFRA-011)
- QUEUE_NAMES.SARS_DEADLINE defined
- NotificationService exists
- SARS submission tracking exists
- No deadline reminder processor

## SARS Deadlines (South Africa)
- VAT201: 25th of following month
- EMP201: 7th of following month
- IRP5: End of May annually
</current_state>

<input_context_files>
  <file purpose="scheduler_module">apps/api/src/scheduler/scheduler.module.ts</file>
  <file purpose="sars_types">apps/api/src/sars/types/sars.types.ts</file>
  <file purpose="notification_service">apps/api/src/notifications/notification.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - SarsDeadlineProcessor extending BaseProcessor
    - SARS deadline calendar for VAT201, EMP201, IRP5
    - Daily cron job at 08:00 SAST
    - Reminder levels: 30, 14, 7, 3, 1 days before
    - Email and WhatsApp delivery
    - Tenant preference management
    - Reminder history tracking
  </in_scope>
  <out_of_scope>
    - Actual SARS submission (existing)
    - SARS eFiling integration (HIGH-007)
    - Custom deadline types
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/scheduler/processors/sars-deadline.processor.ts">
      @Processor(QUEUE_NAMES.SARS_DEADLINE)
      export class SarsDeadlineProcessor extends BaseProcessor<SarsDeadlineJobData> {
        protected readonly logger = new Logger(SarsDeadlineProcessor.name);

        protected async processJob(job: Job<SarsDeadlineJobData>): Promise<void>;

        private async checkUpcomingDeadlines(tenantId: string): Promise<UpcomingDeadline[]>;

        private async sendDeadlineReminder(
          tenantId: string,
          deadline: UpcomingDeadline,
          daysRemaining: number
        ): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/sars/sars-deadline.service.ts">
      @Injectable()
      export class SarsDeadlineService {
        getUpcomingDeadlines(tenantId: string, lookAheadDays?: number): Promise<UpcomingDeadline[]>;
        getDeadlineDate(type: SarsDeadlineType, referenceDate: Date): Date;
        getReminderPreferences(tenantId: string): Promise<DeadlineReminderPrefs>;
        updateReminderPreferences(tenantId: string, prefs: Partial<DeadlineReminderPrefs>): Promise<void>;
        getReminderHistory(tenantId: string, type: SarsDeadlineType): Promise<DeadlineReminder[]>;
      }
    </signature>
    <signature file="apps/api/src/sars/types/deadline.types.ts">
      export type SarsDeadlineType = 'VAT201' | 'EMP201' | 'IRP5';

      export interface UpcomingDeadline {
        type: SarsDeadlineType;
        deadline: Date;
        daysRemaining: number;
        period: string;
        isSubmitted: boolean;
      }

      export interface DeadlineReminderPrefs {
        reminderDays: number[];
        channels: ('email' | 'whatsapp')[];
        recipientEmails: string[];
        enabled: boolean;
      }

      export const DEFAULT_REMINDER_DAYS = [30, 14, 7, 3, 1];
    </signature>
  </signatures>

  <constraints>
    - Default schedule: 0 8 * * * (08:00 SAST daily)
    - Reminder levels: 30, 14, 7, 3, 1 days before deadline
    - No duplicate reminders within same day
    - Respect tenant timezone (SAST default)
    - Include submission status in reminder
    - Skip reminders for already-submitted returns
  </constraints>

  <verification>
    - Cron job runs at 08:00 SAST daily
    - Correct deadline dates calculated
    - Reminders sent at correct intervals
    - No reminders for submitted returns
    - No duplicate reminders
    - Tenant preferences respected
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/scheduler/processors/sars-deadline.processor.ts">Deadline processor</file>
  <file path="apps/api/src/sars/sars-deadline.service.ts">Deadline service</file>
  <file path="apps/api/src/sars/types/deadline.types.ts">Types</file>
  <file path="apps/api/src/scheduler/processors/__tests__/sars-deadline.processor.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/scheduler/scheduler.module.ts">Register SarsDeadlineProcessor</file>
  <file path="apps/api/src/sars/sars.module.ts">Export SarsDeadlineService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Processor registered with queue</criterion>
  <criterion>Cron job runs at 08:00 SAST</criterion>
  <criterion>Deadline calculations correct</criterion>
  <criterion>Reminder intervals respected</criterion>
  <criterion>No duplicates within same day</criterion>
  <criterion>Submitted returns skipped</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="sars-deadline" --verbose</command>
</test_commands>

</task_spec>
