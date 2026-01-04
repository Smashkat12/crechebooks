<task_spec id="TASK-BILL-016" version="1.0">

<metadata>
  <title>Invoice Generation Scheduling Cron Job</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>101</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-BILL-002</requirement_ref>
    <critical_issue_ref>CRIT-009</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-012</task_ref>
    <task_ref status="PENDING">TASK-INFRA-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use scheduling and reliability thinking.
This task involves:
1. Cron job for automated invoice generation
2. Tenant-configurable schedule
3. Batch processing to prevent timeout
4. Retry logic for failures
5. Admin notifications
</reasoning_mode>

<context>
CRITICAL GAP: No automated invoice generation. Currently only manual API trigger works.

REQ-BILL-002 specifies: "Invoices generated on configurable date (default: 1st of month at 6AM)."

This task creates InvoiceSchedulerProcessor using the SchedulerModule (TASK-INFRA-011) to automatically generate monthly invoices.
</context>

<current_state>
## Codebase State
- InvoiceGenerationService exists (TASK-BILL-012)
- SchedulerModule created (TASK-INFRA-011)
- QUEUE_NAMES.INVOICE_GENERATION defined
- No invoice scheduler processor

## What Exists
- generateMonthlyInvoices(tenantId, billingMonth) method
- generateForEnrollment(enrollmentId) method
- Xero sync for created invoices
</current_state>

<input_context_files>
  <file purpose="invoice_service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="scheduler_module">apps/api/src/scheduler/scheduler.module.ts</file>
  <file purpose="scheduler_types">apps/api/src/scheduler/types/scheduler.types.ts</file>
  <file purpose="base_processor">apps/api/src/scheduler/processors/base.processor.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - InvoiceSchedulerProcessor extending BaseProcessor
    - Cron job registration for each tenant
    - Tenant-specific schedule configuration
    - Batch processing (10 children at a time)
    - Retry with exponential backoff
    - Admin notification on completion/failure
  </in_scope>
  <out_of_scope>
    - Invoice content changes
    - Delivery scheduling (separate task)
    - UI for schedule configuration
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/scheduler/processors/invoice-scheduler.processor.ts">
      @Processor(QUEUE_NAMES.INVOICE_GENERATION)
      export class InvoiceSchedulerProcessor extends BaseProcessor<InvoiceGenerationJobData> {
        protected readonly logger = new Logger(InvoiceSchedulerProcessor.name);

        protected async processJob(job: Job<InvoiceGenerationJobData>): Promise<void>;

        private async generateInBatches(tenantId: string, billingMonth: string): Promise<GenerationResult>;
      }
    </signature>
    <signature file="apps/api/src/billing/invoice-schedule.service.ts">
      @Injectable()
      export class InvoiceScheduleService {
        async scheduleTenantInvoices(tenantId: string): Promise<void>;
        async cancelSchedule(tenantId: string): Promise<void>;
        async updateSchedule(tenantId: string, cronExpression: string): Promise<void>;
        async triggerManualGeneration(tenantId: string, billingMonth: string): Promise<Job>;
      }
    </signature>
  </signatures>

  <constraints>
    - Default schedule: 0 6 1 * * (6AM on 1st of month)
    - Batch size: 10 enrollments per iteration
    - Max retries: 3 with exponential backoff
    - Timeout: 30 minutes per tenant
    - Must respect tenant timezone (SAST default)
  </constraints>

  <verification>
    - Cron job triggers at scheduled time
    - All enrolled children invoiced
    - Failed invoices retried
    - Admin notified of results
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/scheduler/processors/invoice-scheduler.processor.ts">Invoice processor</file>
  <file path="apps/api/src/billing/invoice-schedule.service.ts">Schedule management</file>
  <file path="apps/api/src/scheduler/processors/__tests__/invoice-scheduler.processor.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/scheduler/scheduler.module.ts">Register InvoiceSchedulerProcessor</file>
</files_to_modify>

<validation_criteria>
  <criterion>Processor registered with queue</criterion>
  <criterion>Cron job runs at scheduled time</criterion>
  <criterion>Batch processing works</criterion>
  <criterion>Retry on failure</criterion>
  <criterion>Admin notification sent</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="invoice-scheduler" --verbose</command>
</test_commands>

</task_spec>
