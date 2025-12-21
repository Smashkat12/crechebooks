<task_spec id="TASK-PAY-014" version="2.0">

<metadata>
  <title>Payment Reminder Service</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>27</sequence>
  <implements>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <requirement_ref>REQ-PAY-010</requirement_ref>
    <requirement_ref>REQ-PAY-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <spec_version>2.0</spec_version>
  <last_updated>2025-12-21</last_updated>
</metadata>

<!-- ============================================================
     PROJECT CONTEXT (CRITICAL - READ FIRST)
     ============================================================ -->

<project_context>
  <current_state>
    <total_tests>989</total_tests>
    <tasks_complete>26/62 (41.9%)</tasks_complete>
    <foundation_complete>15/15 (100%)</foundation_complete>
    <logic_complete>11/21 (52.4%)</logic_complete>
  </current_state>

  <tech_stack>
    <language>TypeScript 5.x / Node.js 20.x</language>
    <framework>NestJS 10.x with @Injectable() decorators</framework>
    <database>PostgreSQL 16.x via Prisma ORM</database>
    <testing>Jest with real database (NO mock data)</testing>
    <financial>Decimal.js with banker's rounding (ROUND_HALF_EVEN)</financial>
    <currency>ZAR - all amounts in CENTS (integers)</currency>
  </tech_stack>

  <critical_rules>
    - ALL monetary values stored as integers (cents)
    - Use Decimal.js for calculations, convert to integer for storage
    - Every query MUST filter by tenantId (multi-tenant isolation)
    - Try-catch with logging BEFORE throwing
    - FAIL FAST - no workarounds or fallbacks
    - NO mock data in tests - use real database
    - External services (Email, WhatsApp) ARE mocked in tests
  </critical_rules>
</project_context>

<!-- ============================================================
     VERIFIED PREREQUISITES
     ============================================================ -->

<prerequisites verified="2025-12-21">
  <check status="COMPLETE">
    TASK-PAY-013 ArrearsService exists at src/database/services/arrears.service.ts
    Methods: getArrearsReport(), calculateAging(), getParentHistory(), getTopDebtors()
    Uses ArrearsReport with invoices array containing daysOverdue
  </check>
  <check status="COMPLETE">
    EmailService exists at src/integrations/email/email.service.ts
    Method: sendEmail(to, subject, body, from?)
    Returns: { messageId, status: 'sent' | 'failed' }
    Throws: BusinessException on error
  </check>
  <check status="COMPLETE">
    WhatsAppService exists at src/integrations/whatsapp/whatsapp.service.ts
    Method: sendMessage(to, message) - throws NOT_IMPLEMENTED
    Has: sanitizePhoneNumber(), isValidPhoneNumber()
    NOTE: Currently throws WHATSAPP_NOT_IMPLEMENTED (expected behavior)
  </check>
  <check status="COMPLETE">
    InvoiceRepository at src/database/repositories/invoice.repository.ts
    ParentRepository at src/database/repositories/parent.repository.ts
  </check>
  <check status="REQUIRED">
    Reminder model does NOT exist in schema - must create via migration
  </check>
  <check status="COMPLETE">
    Prisma enums available: DeliveryMethod (EMAIL, WHATSAPP, BOTH), DeliveryStatus
  </check>
</prerequisites>

<!-- ============================================================
     CORRECT FILE PATHS
     ============================================================ -->

<file_paths>
  <services_location>src/database/services/</services_location>
  <dto_location>src/database/dto/</dto_location>
  <repositories_location>src/database/repositories/</repositories_location>
  <tests_location>tests/database/services/</tests_location>
  <integrations_location>src/integrations/</integrations_location>
  <module_file>src/database/database.module.ts</module_file>
  <prisma_schema>prisma/schema.prisma</prisma_schema>
</file_paths>

<!-- ============================================================
     TASK CONTEXT
     ============================================================ -->

<context>
This task creates ReminderService which handles automated and manual payment reminders
for overdue invoices. It integrates with ArrearsService (TASK-PAY-013) for overdue data
and uses EmailService/WhatsAppService for delivery.

Key features:
- Template-based content with escalation tones (friendly → firm → final)
- Multi-channel delivery (Email and WhatsApp)
- Duplicate prevention (minimum 3 days between reminders per invoice)
- Reminder history tracking per parent
- Scheduled reminders for future dates
- Escalation rules: FRIENDLY (1-7 days), FIRM (8-14 days), FINAL (15+ days)
</context>

<scope>
  <in_scope>
    - Create Reminder model in Prisma schema with migration
    - Create ReminderRepository
    - Create ReminderService with all methods
    - Create reminder.dto.ts with DTOs and enums
    - Create reminder templates (constant strings)
    - Register in DatabaseModule
    - Integration tests with real database
  </in_scope>
  <out_of_scope>
    - Cron/scheduler jobs (infrastructure layer)
    - API endpoints (TASK-PAY-032)
    - WhatsApp API implementation (not available)
    - Payment portal links
  </out_of_scope>
</scope>

<!-- ============================================================
     PRISMA SCHEMA ADDITIONS
     ============================================================ -->

<prisma_schema_changes>
Add to prisma/schema.prisma:

```prisma
// Add after existing enums

enum EscalationLevel {
  FRIENDLY   // 1-7 days overdue
  FIRM       // 8-14 days overdue
  FINAL      // 15+ days overdue
}

enum ReminderStatus {
  PENDING    // Scheduled for future
  SENT       // Successfully sent
  DELIVERED  // Confirmed delivered (if trackable)
  READ       // Opened/read (if trackable)
  FAILED     // Delivery failed
}

// Add after existing models

model Reminder {
  id              String          @id @default(uuid())
  tenantId        String          @map("tenant_id")
  invoiceId       String          @map("invoice_id")
  parentId        String          @map("parent_id")
  escalationLevel EscalationLevel @map("escalation_level")
  deliveryMethod  DeliveryMethod  @map("delivery_method")
  reminderStatus  ReminderStatus  @default(PENDING) @map("reminder_status")
  scheduledFor    DateTime?       @map("scheduled_for")
  sentAt          DateTime?       @map("sent_at")
  deliveredAt     DateTime?       @map("delivered_at")
  readAt          DateTime?       @map("read_at")
  content         String
  subject         String?
  failureReason   String?         @map("failure_reason")
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")

  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  invoice         Invoice         @relation(fields: [invoiceId], references: [id])
  parent          Parent          @relation(fields: [parentId], references: [id])

  @@map("reminders")
  @@index([tenantId, invoiceId])
  @@index([tenantId, parentId])
  @@index([tenantId, scheduledFor])
}
```

Also add to Tenant, Invoice, and Parent models:
```prisma
// In Tenant model:
reminders       Reminder[]

// In Invoice model:
reminders       Reminder[]

// In Parent model:
reminders       Reminder[]
```
</prisma_schema_changes>

<!-- ============================================================
     DTO DEFINITIONS
     ============================================================ -->

<dto_file path="src/database/dto/reminder.dto.ts">
```typescript
import { IsUUID, IsOptional, IsDate, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Escalation levels for reminder tones
 */
export enum EscalationLevel {
  FRIENDLY = 'FRIENDLY',  // 1-7 days overdue
  FIRM = 'FIRM',          // 8-14 days overdue
  FINAL = 'FINAL',        // 15+ days overdue
}

/**
 * Reminder status tracking
 */
export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

/**
 * Delivery channel options
 */
export enum DeliveryChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

/**
 * Input for sending reminders
 */
export class SendRemindersDto {
  @IsUUID('4', { each: true })
  invoiceIds: string[];

  @IsOptional()
  @IsEnum(DeliveryChannel)
  channel?: DeliveryChannel;
}

/**
 * Input for scheduling a reminder
 */
export class ScheduleReminderDto {
  @IsUUID()
  invoiceId: string;

  @IsDate()
  @Type(() => Date)
  sendDate: Date;

  @IsEnum(DeliveryChannel)
  channel: DeliveryChannel;
}

/**
 * Generated reminder content
 */
export interface ReminderContent {
  subject: string;
  body: string;
  escalationLevel: EscalationLevel;
  invoiceNumber: string;
  outstandingCents: number;
  daysOverdue: number;
}

/**
 * Result of sending reminders
 */
export interface ReminderResult {
  sent: number;
  failed: number;
  skipped: number;
  details: {
    invoiceId: string;
    status: 'sent' | 'failed' | 'skipped';
    reason?: string;
  }[];
}

/**
 * Result of escalation processing
 */
export interface EscalationResult {
  friendly: number;
  firm: number;
  final: number;
  totalProcessed: number;
  totalSent: number;
  totalSkipped: number;
}

/**
 * Reminder history entry for a parent
 */
export interface ReminderHistoryEntry {
  reminderId: string;
  invoiceId: string;
  invoiceNumber: string;
  sentAt: Date;
  escalationLevel: EscalationLevel;
  deliveryChannel: DeliveryChannel;
  reminderStatus: ReminderStatus;
  outstandingCents: number;
}
```
</dto_file>

<!-- ============================================================
     REMINDER TEMPLATES (constants, not Handlebars)
     ============================================================ -->

<templates_file path="src/database/constants/reminder-templates.ts">
```typescript
/**
 * Reminder message templates
 * South African English, friendly tone appropriate for creche context
 *
 * Placeholders:
 * {parentName} - Parent first name
 * {childName} - Child first name
 * {invoiceNumber} - Invoice reference
 * {amount} - Outstanding amount in Rands (formatted: R1,234.56)
 * {dueDate} - Original due date (formatted: 15 January 2025)
 * {daysOverdue} - Number of days overdue
 * {crecheName} - Tenant/Creche name
 * {crechePhone} - Tenant phone
 * {crecheEmail} - Tenant email
 * {bankName} - Bank name
 * {accountNumber} - Bank account number
 * {branchCode} - Bank branch code
 */

export const REMINDER_TEMPLATES = {
  FRIENDLY: {
    subject: 'Friendly reminder: Invoice {invoiceNumber} payment',
    body: `Hi {parentName},

Just a friendly reminder that invoice {invoiceNumber} for {childName}'s fees is now {daysOverdue} days overdue.

Amount due: {amount}
Original due date: {dueDate}

We understand things can get busy! Please process the payment at your earliest convenience.

Banking details:
{bankName}
Account: {accountNumber}
Branch: {branchCode}
Reference: {invoiceNumber}

If you've already paid, please ignore this message. For any queries, contact us at {crechePhone} or {crecheEmail}.

Thank you!
{crecheName}`,
  },

  FIRM: {
    subject: 'Payment overdue: Invoice {invoiceNumber}',
    body: `Hi {parentName},

This is an important reminder regarding invoice {invoiceNumber} for {childName}.

Amount overdue: {amount}
Days overdue: {daysOverdue}

Please arrange payment urgently to avoid further action.

Banking details:
{bankName}
Account: {accountNumber}
Branch: {branchCode}
Reference: {invoiceNumber}

If you're experiencing difficulty, please contact us immediately to discuss payment arrangements.

{crecheName}
{crechePhone} | {crecheEmail}`,
  },

  FINAL: {
    subject: 'FINAL NOTICE: Invoice {invoiceNumber} - Immediate action required',
    body: `FINAL NOTICE

Dear {parentName},

Invoice {invoiceNumber} for {childName} is seriously overdue.

Amount outstanding: {amount}
Days overdue: {daysOverdue}

IMMEDIATE PAYMENT IS REQUIRED.

Failure to settle this account may result in:
- Suspension of services
- Legal action to recover debt

Banking details:
{bankName}
Account: {accountNumber}
Branch: {branchCode}
Reference: {invoiceNumber}

Contact us urgently if you need to discuss this: {crechePhone} or {crecheEmail}

{crecheName}`,
  },
} as const;

/**
 * WhatsApp-friendly versions (shorter, no formatting)
 */
export const REMINDER_TEMPLATES_WHATSAPP = {
  FRIENDLY: `Hi {parentName}, friendly reminder: Invoice {invoiceNumber} for {childName} is {daysOverdue} days overdue. Amount: {amount}. Ref: {invoiceNumber}. Contact {crechePhone} for queries. - {crecheName}`,

  FIRM: `IMPORTANT: {parentName}, invoice {invoiceNumber} for {childName} is {daysOverdue} days overdue. Amount: {amount}. Please pay urgently or contact {crechePhone}. - {crecheName}`,

  FINAL: `FINAL NOTICE: {parentName}, invoice {invoiceNumber} ({amount}) is {daysOverdue} days overdue. Immediate payment required to avoid service suspension. Call {crechePhone} NOW. - {crecheName}`,
} as const;
```
</templates_file>

<!-- ============================================================
     SERVICE IMPLEMENTATION
     ============================================================ -->

<service_file path="src/database/services/reminder.service.ts">
```typescript
/**
 * ReminderService
 * TASK-PAY-014: Payment Reminder Service
 *
 * CRITICAL: All monetary values in cents (integers)
 * CRITICAL: Fail fast with detailed logging
 * CRITICAL: Filter by tenantId on ALL queries
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { ArrearsService } from './arrears.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { NotFoundException, DatabaseException, BusinessException } from '../../shared/exceptions';
import { REMINDER_TEMPLATES, REMINDER_TEMPLATES_WHATSAPP } from '../constants/reminder-templates';
import {
  EscalationLevel,
  ReminderStatus,
  DeliveryChannel,
  ReminderContent,
  ReminderResult,
  EscalationResult,
  ReminderHistoryEntry,
  ScheduleReminderDto,
} from '../dto/reminder.dto';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private static readonly MIN_DAYS_BETWEEN_REMINDERS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly arrearsService: ArrearsService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Send reminders for specified invoices
   */
  async sendReminders(
    invoiceIds: string[],
    channel: DeliveryChannel | undefined,
    tenantId: string,
  ): Promise<ReminderResult>;

  /**
   * Generate reminder content based on escalation level
   */
  async generateReminderContent(
    invoiceId: string,
    escalationLevel: EscalationLevel,
    tenantId: string,
  ): Promise<ReminderContent>;

  /**
   * Schedule a reminder for future delivery
   */
  async scheduleReminder(
    dto: ScheduleReminderDto,
    tenantId: string,
  ): Promise<{ reminderId: string; scheduledFor: Date }>;

  /**
   * Process all overdue invoices and send escalated reminders
   */
  async escalateOverdue(tenantId: string): Promise<EscalationResult>;

  /**
   * Get reminder history for a parent
   */
  async getReminderHistory(
    parentId: string,
    tenantId: string,
  ): Promise<ReminderHistoryEntry[]>;

  /**
   * Determine escalation level based on days overdue
   * FRIENDLY: 1-7 days, FIRM: 8-14 days, FINAL: 15+ days
   */
  private determineEscalationLevel(daysOverdue: number): EscalationLevel;

  /**
   * Check if invoice has recent reminder (within MIN_DAYS_BETWEEN_REMINDERS)
   */
  private async hasRecentReminder(
    invoiceId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Send reminder via email
   */
  private async sendViaEmail(
    parentEmail: string,
    content: ReminderContent,
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  /**
   * Send reminder via WhatsApp
   */
  private async sendViaWhatsApp(
    parentPhone: string,
    content: ReminderContent,
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  /**
   * Replace template placeholders with actual values
   */
  private renderTemplate(
    template: string,
    values: Record<string, string>,
  ): string;

  /**
   * Format cents to Rand string (e.g., 150000 -> "R1,500.00")
   */
  private formatCentsToRand(cents: number): string;
}
```

PSEUDO-CODE IMPLEMENTATION:

```
sendReminders(invoiceIds, channel, tenantId):
  result = { sent: 0, failed: 0, skipped: 0, details: [] }

  FOR each invoiceId:
    TRY:
      // 1. Fetch invoice with parent, child, tenant relations
      invoice = prisma.invoice.findUnique({
        where: { id: invoiceId, tenantId, isDeleted: false },
        include: { parent: true, child: true, tenant: true }
      })

      IF !invoice:
        result.skipped++
        result.details.push({ invoiceId, status: 'skipped', reason: 'Invoice not found' })
        CONTINUE

      // 2. Skip if fully paid
      IF invoice.amountPaidCents >= invoice.totalCents:
        result.skipped++
        result.details.push({ invoiceId, status: 'skipped', reason: 'Invoice already paid' })
        CONTINUE

      // 3. Check for recent reminder
      IF await hasRecentReminder(invoiceId, tenantId):
        result.skipped++
        result.details.push({ invoiceId, status: 'skipped', reason: 'Recent reminder already sent' })
        CONTINUE

      // 4. Calculate days overdue
      daysOverdue = calculateDaysOverdue(invoice.dueDate)
      IF daysOverdue < 1:
        result.skipped++
        result.details.push({ invoiceId, status: 'skipped', reason: 'Invoice not yet overdue' })
        CONTINUE

      // 5. Determine escalation level
      escalationLevel = determineEscalationLevel(daysOverdue)

      // 6. Generate content
      content = await generateReminderContent(invoiceId, escalationLevel, tenantId)

      // 7. Determine delivery channel
      deliveryChannel = channel ?? mapPreferredContact(invoice.parent.preferredContact) ?? DeliveryChannel.EMAIL

      // 8. Send via appropriate channel(s)
      emailResult = null
      whatsappResult = null

      IF deliveryChannel == EMAIL OR deliveryChannel == BOTH:
        emailResult = await sendViaEmail(invoice.parent.email, content)

      IF deliveryChannel == WHATSAPP OR deliveryChannel == BOTH:
        whatsappResult = await sendViaWhatsApp(invoice.parent.phone, content)

      // 9. Determine overall status
      anySuccess = emailResult?.success OR whatsappResult?.success

      // 10. Create reminder record
      await prisma.reminder.create({
        data: {
          tenantId,
          invoiceId,
          parentId: invoice.parentId,
          escalationLevel,
          deliveryMethod: deliveryChannel,
          reminderStatus: anySuccess ? ReminderStatus.SENT : ReminderStatus.FAILED,
          sentAt: anySuccess ? new Date() : null,
          content: content.body,
          subject: content.subject,
          failureReason: !anySuccess ? (emailResult?.error ?? whatsappResult?.error) : null,
        }
      })

      IF anySuccess:
        result.sent++
        result.details.push({ invoiceId, status: 'sent' })
      ELSE:
        result.failed++
        result.details.push({ invoiceId, status: 'failed', reason: emailResult?.error ?? whatsappResult?.error })

    CATCH error:
      logger.error(`Failed to send reminder for ${invoiceId}`, error.stack)
      result.failed++
      result.details.push({ invoiceId, status: 'failed', reason: error.message })

  RETURN result


determineEscalationLevel(daysOverdue):
  IF daysOverdue <= 7:
    RETURN EscalationLevel.FRIENDLY
  ELSE IF daysOverdue <= 14:
    RETURN EscalationLevel.FIRM
  ELSE:
    RETURN EscalationLevel.FINAL


hasRecentReminder(invoiceId, tenantId):
  cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MIN_DAYS_BETWEEN_REMINDERS)

  recentReminder = await prisma.reminder.findFirst({
    where: {
      invoiceId,
      tenantId,
      sentAt: { gte: cutoffDate },
      reminderStatus: { in: [ReminderStatus.SENT, ReminderStatus.DELIVERED] }
    }
  })

  RETURN recentReminder !== null


generateReminderContent(invoiceId, escalationLevel, tenantId):
  invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, tenantId },
    include: { parent: true, child: true, tenant: true }
  })

  IF !invoice:
    THROW NotFoundException('Invoice', invoiceId)

  outstandingCents = invoice.totalCents - invoice.amountPaidCents
  daysOverdue = calculateDaysOverdue(invoice.dueDate)

  template = REMINDER_TEMPLATES[escalationLevel]

  values = {
    parentName: invoice.parent.firstName,
    childName: invoice.child.firstName,
    invoiceNumber: invoice.invoiceNumber,
    amount: formatCentsToRand(outstandingCents),
    dueDate: formatDate(invoice.dueDate),
    daysOverdue: daysOverdue.toString(),
    crecheName: invoice.tenant.name,
    crechePhone: invoice.tenant.phone ?? '',
    crecheEmail: invoice.tenant.email ?? '',
    bankName: invoice.tenant.bankName ?? '',
    accountNumber: invoice.tenant.bankAccountNumber ?? '',
    branchCode: invoice.tenant.bankBranchCode ?? '',
  }

  RETURN {
    subject: renderTemplate(template.subject, values),
    body: renderTemplate(template.body, values),
    escalationLevel,
    invoiceNumber: invoice.invoiceNumber,
    outstandingCents,
    daysOverdue,
  }


escalateOverdue(tenantId):
  result = { friendly: 0, firm: 0, final: 0, totalProcessed: 0, totalSent: 0, totalSkipped: 0 }

  // Use ArrearsService to get overdue invoices
  arrearsReport = await arrearsService.getArrearsReport(tenantId)

  FOR each arrearsInvoice IN arrearsReport.invoices:
    result.totalProcessed++

    escalationLevel = determineEscalationLevel(arrearsInvoice.daysOverdue)

    // Check for recent reminder
    IF await hasRecentReminder(arrearsInvoice.invoiceId, tenantId):
      result.totalSkipped++
      CONTINUE

    // Send reminder
    sendResult = await sendReminders([arrearsInvoice.invoiceId], undefined, tenantId)

    IF sendResult.sent > 0:
      result.totalSent++
      SWITCH escalationLevel:
        CASE FRIENDLY: result.friendly++
        CASE FIRM: result.firm++
        CASE FINAL: result.final++
    ELSE:
      result.totalSkipped++

  RETURN result


scheduleReminder(dto, tenantId):
  invoice = await invoiceRepo.findById(dto.invoiceId, tenantId)
  IF !invoice:
    THROW NotFoundException('Invoice', dto.invoiceId)

  IF dto.sendDate <= new Date():
    THROW BusinessException('Schedule date must be in the future', 'INVALID_SCHEDULE_DATE')

  daysOverdue = calculateDaysOverdue(invoice.dueDate)
  escalationLevel = determineEscalationLevel(daysOverdue)

  reminder = await prisma.reminder.create({
    data: {
      tenantId,
      invoiceId: dto.invoiceId,
      parentId: invoice.parentId,
      escalationLevel,
      deliveryMethod: dto.channel,
      reminderStatus: ReminderStatus.PENDING,
      scheduledFor: dto.sendDate,
      content: '', // Generated at send time
      subject: null,
    }
  })

  RETURN { reminderId: reminder.id, scheduledFor: reminder.scheduledFor }


getReminderHistory(parentId, tenantId):
  parent = await parentRepo.findById(parentId)
  IF !parent OR parent.tenantId !== tenantId:
    THROW NotFoundException('Parent', parentId)

  reminders = await prisma.reminder.findMany({
    where: { parentId, tenantId },
    include: { invoice: true },
    orderBy: { createdAt: 'desc' },
  })

  RETURN reminders.map(r => ({
    reminderId: r.id,
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoice.invoiceNumber,
    sentAt: r.sentAt,
    escalationLevel: r.escalationLevel,
    deliveryChannel: r.deliveryMethod,
    reminderStatus: r.reminderStatus,
    outstandingCents: r.invoice.totalCents - r.invoice.amountPaidCents,
  }))


renderTemplate(template, values):
  result = template
  FOR each [key, value] IN Object.entries(values):
    result = result.replaceAll(`{${key}}`, value)
  RETURN result


formatCentsToRand(cents):
  rands = cents / 100
  RETURN `R${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
```
</service_file>

<!-- ============================================================
     REPOSITORY
     ============================================================ -->

<repository_file path="src/database/repositories/reminder.repository.ts">
```typescript
/**
 * ReminderRepository
 * TASK-PAY-014: Payment Reminder Service
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Reminder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseException } from '../../shared/exceptions';

@Injectable()
export class ReminderRepository {
  private readonly logger = new Logger(ReminderRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ReminderCreateInput): Promise<Reminder>;
  async findById(id: string, tenantId: string): Promise<Reminder | null>;
  async findByInvoiceId(invoiceId: string, tenantId: string): Promise<Reminder[]>;
  async findByParentId(parentId: string, tenantId: string): Promise<Reminder[]>;
  async findPending(tenantId: string): Promise<Reminder[]>;
  async findRecentForInvoice(invoiceId: string, tenantId: string, sinceDate: Date): Promise<Reminder | null>;
  async updateStatus(id: string, status: ReminderStatus, additionalData?: Partial<Reminder>): Promise<Reminder>;
}
```
</repository_file>

<!-- ============================================================
     FILES TO CREATE/MODIFY
     ============================================================ -->

<files_to_create>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_add_reminders/migration.sql">
    Create reminders table with indexes
  </file>
  <file path="src/database/constants/reminder-templates.ts">
    Template constants for FRIENDLY, FIRM, FINAL
  </file>
  <file path="src/database/dto/reminder.dto.ts">
    DTOs and interfaces for reminders
  </file>
  <file path="src/database/repositories/reminder.repository.ts">
    ReminderRepository with CRUD operations
  </file>
  <file path="src/database/services/reminder.service.ts">
    ReminderService implementation (~400 lines)
  </file>
  <file path="tests/database/services/reminder.service.spec.ts">
    Integration tests (~50+ tests)
  </file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">
    Add EscalationLevel enum, ReminderStatus enum, Reminder model
    Add reminders relation to Tenant, Invoice, Parent models
  </file>
  <file path="src/database/dto/index.ts">
    Add: export * from './reminder.dto';
  </file>
  <file path="src/database/services/index.ts">
    Add: export * from './reminder.service';
  </file>
  <file path="src/database/database.module.ts">
    Import and register ReminderRepository, ReminderService
  </file>
</files_to_modify>

<!-- ============================================================
     TESTING REQUIREMENTS
     ============================================================ -->

<testing_requirements>
  <critical_rules>
    - Use REAL PostgreSQL database (same as other tests)
    - NO mock data for database operations
    - Mock ONLY external services (EmailService, WhatsAppService)
    - Proper setup/teardown with FK-order cleanup
    - Verify actual database records after operations
  </critical_rules>

  <test_structure>
```typescript
describe('ReminderService', () => {
  // Use same patterns as invoice-delivery.service.spec.ts

  // Mock external services ONLY
  const mockEmailService = {
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-123', status: 'sent' }),
    isValidEmail: jest.fn().mockReturnValue(true),
  };

  const mockWhatsAppService = {
    sendMessage: jest.fn().mockRejectedValue(new BusinessException('Not implemented', 'WHATSAPP_NOT_IMPLEMENTED')),
    sanitizePhoneNumber: jest.fn().mockImplementation(phone => phone.replace(/\D/g, '')),
    isValidPhoneNumber: jest.fn().mockReturnValue(true),
  };

  beforeAll(() => {
    // Setup NestJS test module with real PrismaService
  });

  beforeEach(() => {
    // Create test tenant, parent, child, invoices
    // Reset mock call counts
  });

  afterEach(() => {
    // Clean up: reminders → invoices → children → parents → tenants
  });

  describe('sendReminders', () => {
    it('should send reminder for overdue invoice via email');
    it('should skip invoice that is fully paid');
    it('should skip invoice with recent reminder (within 3 days)');
    it('should skip invoice not yet overdue');
    it('should create reminder record on success');
    it('should create reminder record with FAILED status on delivery failure');
    it('should use parent preferred contact method if channel not specified');
    it('should handle batch of invoices');
    // ... more tests
  });

  describe('generateReminderContent', () => {
    it('should generate FRIENDLY content for 1-7 days overdue');
    it('should generate FIRM content for 8-14 days overdue');
    it('should generate FINAL content for 15+ days overdue');
    it('should include all required fields in content');
    it('should format amount in Rands');
    // ... more tests
  });

  describe('scheduleReminder', () => {
    it('should create pending reminder for future date');
    it('should throw if invoice not found');
    it('should throw if schedule date is in the past');
    // ... more tests
  });

  describe('escalateOverdue', () => {
    it('should process all overdue invoices from ArrearsService');
    it('should skip invoices with recent reminders');
    it('should count escalation levels correctly');
    // ... more tests
  });

  describe('getReminderHistory', () => {
    it('should return reminder history for parent');
    it('should throw if parent not found');
    it('should return empty array if no reminders');
    // ... more tests
  });

  describe('determineEscalationLevel', () => {
    it('should return FRIENDLY for 1-7 days');
    it('should return FIRM for 8-14 days');
    it('should return FINAL for 15+ days');
    // ... more tests
  });
});
```
  </test_structure>
</testing_requirements>

<!-- ============================================================
     VALIDATION CRITERIA
     ============================================================ -->

<validation_criteria>
  <criterion>Prisma migration runs without errors</criterion>
  <criterion>npm run lint passes with 0 errors</criterion>
  <criterion>npm run build compiles successfully</criterion>
  <criterion>npm test passes (all existing 989 tests + new tests)</criterion>
  <criterion>sendReminders creates reminder records in database</criterion>
  <criterion>Duplicate prevention works (3-day minimum between reminders)</criterion>
  <criterion>Escalation levels: FRIENDLY (1-7), FIRM (8-14), FINAL (15+)</criterion>
  <criterion>Content includes invoice number, amount, days overdue</criterion>
  <criterion>Amount formatted as ZAR (R1,234.56)</criterion>
  <criterion>Tenant isolation enforced on all queries</criterion>
  <criterion>Error handling with logging before throwing</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_reminders</command>
  <command>npx prisma generate</command>
  <command>npm run lint</command>
  <command>npm run build</command>
  <command>npm test</command>
</test_commands>

</task_spec>
