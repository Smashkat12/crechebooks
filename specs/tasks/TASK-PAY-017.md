<task_spec id="TASK-PAY-017" version="1.0">

<metadata>
  <title>Tenant-Customizable Reminder Template Entity</title>
  <status>complete</status>
  <layer>data</layer>
  <sequence>142</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <gap_ref>GAP-003</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use data-modeling thinking with tenant customization awareness.
This task involves:
1. ReminderTemplate Prisma entity
2. Migration for reminder_templates table
3. Default template seeding
4. Template service for CRUD operations
5. Integration with PaymentReminderProcessor
</reasoning_mode>

<context>
GAP-003: Reminder schedules and content are hardcoded in DEFAULT_REMINDER_SCHEDULE. Tenants cannot customize:
- Days overdue thresholds
- Reminder message templates
- Delivery channels per stage

REQ-PAY-009 specifies: "Automated reminders for overdue payments."

This task creates a ReminderTemplate entity allowing tenants to customize their reminder flow while maintaining sensible defaults.
</context>

<current_state>
## Codebase State
- PaymentReminderProcessor exists: apps/api/src/scheduler/processors/payment-reminder.processor.ts
- DEFAULT_REMINDER_SCHEDULE hardcoded: apps/api/src/billing/types/reminder.types.ts
- NotificationService exists for email
- WhatsAppService exists for WhatsApp

## What Exists
- ReminderStage type (FIRST, SECOND, FINAL, ESCALATED)
- ReminderChannel type (email, whatsapp)
- ReminderSchedule interface

## What's Missing
- ReminderTemplate Prisma model
- Database-backed template storage
- Template service for CRUD
- Integration with payment reminder processor
</current_state>

<input_context_files>
  <file purpose="reminder_types">apps/api/src/billing/types/reminder.types.ts</file>
  <file purpose="payment_reminder_processor">apps/api/src/scheduler/processors/payment-reminder.processor.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<scope>
  <in_scope>
    - ReminderTemplate Prisma model
    - Migration for reminder_templates table
    - ReminderTemplateService for CRUD
    - Default template seeding per tenant
    - Integration with PaymentReminderProcessor
    - Template content placeholders ({{parentName}}, {{amount}}, {{dueDate}})
  </in_scope>
  <out_of_scope>
    - Visual template editor (UI layer)
    - SMS channel support
    - Multi-language template variants
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/prisma/schema.prisma">
      model ReminderTemplate {
        id            String   @id @default(uuid())
        tenantId      String
        stage         String   // FIRST, SECOND, FINAL, ESCALATED
        daysOverdue   Int
        channels      String[] // email, whatsapp
        emailSubject  String?
        emailBody     String?
        whatsappBody  String?
        isActive      Boolean  @default(true)
        createdAt     DateTime @default(now())
        updatedAt     DateTime @updatedAt
        tenant        Tenant   @relation(fields: [tenantId], references: [id])

        @@unique([tenantId, stage])
        @@index([tenantId])
        @@map("reminder_templates")
      }
    </signature>
    <signature file="apps/api/src/billing/reminder-template.service.ts">
      @Injectable()
      export class ReminderTemplateService {
        async getTemplates(tenantId: string): Promise<ReminderTemplate[]>;
        async getTemplateForStage(tenantId: string, stage: ReminderStage): Promise<ReminderTemplate>;
        async upsertTemplate(tenantId: string, data: CreateReminderTemplateDto): Promise<ReminderTemplate>;
        async resetToDefaults(tenantId: string): Promise<void>;
        async seedDefaults(tenantId: string): Promise<void>;
        renderTemplate(template: string, variables: TemplateVariables): string;
      }
    </signature>
  </signatures>

  <constraints>
    - Templates tenant-isolated (unique constraint on tenantId + stage)
    - Default templates seeded on tenant creation
    - Placeholders: {{parentName}}, {{childName}}, {{invoiceNumber}}, {{amount}}, {{dueDate}}, {{daysOverdue}}
    - Fallback to hardcoded defaults if no template found
    - All operations filter by tenantId
  </constraints>

  <verification>
    - ReminderTemplate entity created in database
    - Templates seeded for new tenants
    - PaymentReminderProcessor uses database templates
    - Template rendering replaces placeholders
    - CRUD operations work correctly
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/billing/reminder-template.service.ts">Template CRUD service</file>
  <file path="apps/api/src/billing/dto/reminder-template.dto.ts">DTOs for template operations</file>
  <file path="apps/api/prisma/migrations/YYYYMMDD_add_reminder_templates/migration.sql">Migration</file>
  <file path="apps/api/src/billing/__tests__/reminder-template.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add ReminderTemplate model</file>
  <file path="apps/api/src/scheduler/processors/payment-reminder.processor.ts">Use database templates</file>
  <file path="apps/api/src/billing/billing.module.ts">Export ReminderTemplateService</file>
</files_to_modify>

<validation_criteria>
  <criterion>ReminderTemplate model added to schema</criterion>
  <criterion>Migration runs successfully</criterion>
  <criterion>Templates seeded on tenant creation</criterion>
  <criterion>PaymentReminderProcessor uses database templates</criterion>
  <criterion>Placeholder rendering works</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_reminder_templates</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="reminder-template" --verbose</command>
</test_commands>

</task_spec>
