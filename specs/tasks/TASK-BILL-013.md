<task_spec id="TASK-BILL-013" version="2.0">

<metadata>
  <title>Invoice Delivery Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>22</sequence>
  <implements>
    <requirement_ref>REQ-BILL-006</requirement_ref>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-003</task_ref>
    <task_ref>TASK-BILL-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<critical_context>
## ABSOLUTE RULES - READ FIRST

1. **NO BACKWARDS COMPATIBILITY** - System must work or fail fast with clear errors
2. **NO WORKAROUNDS/FALLBACKS** - If something fails, throw with detailed error logging
3. **NO MOCK DATA IN TESTS** - Use real database operations with test fixtures
4. **FAIL FAST** - Robust error logging so failures are immediately debuggable

## Project Structure (ACTUAL - NOT HYPOTHETICAL)

Services are in: `src/database/services/`
Repositories are in: `src/database/repositories/`
DTOs are in: `src/database/dto/`
Entities are in: `src/database/entities/`
Module is: `src/database/database.module.ts`
Tests are in: `tests/database/services/`

**The `src/core/` directory DOES NOT EXIST. Do NOT create files there.**
**The `src/integrations/` directory DOES NOT EXIST. Create it for Email/WhatsApp services.**
</critical_context>

<context>
This task creates the InvoiceDeliveryService which handles multi-channel invoice
delivery to parents via Email and WhatsApp. The service:
- Sends invoices via email (primary) and WhatsApp (optional)
- Tracks delivery status (PENDING, SENT, DELIVERED, OPENED, FAILED)
- Updates invoice status from DRAFT to SENT on successful delivery
- Implements retry logic with exponential backoff for failed deliveries
- Logs all delivery attempts for audit trail

## Dependencies (Already Complete)
- TASK-BILL-003: Invoice and InvoiceLine entities ✅
- TASK-BILL-012: InvoiceGenerationService ✅ (invoices are generated as DRAFT)
</context>

<current_state>
## What Already Exists

### Invoice Entity (src/database/entities/invoice.entity.ts)
```typescript
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum DeliveryMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  FAILED = 'FAILED',
}

export interface IInvoice {
  id: string;
  tenantId: string;
  xeroInvoiceId: string | null;
  invoiceNumber: string;
  parentId: string;
  childId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  issueDate: Date;
  dueDate: Date;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
  status: InvoiceStatus;
  deliveryMethod: DeliveryMethod | null;
  deliveryStatus: DeliveryStatus | null;
  deliveredAt: Date | null;
  notes: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Parent Entity (src/database/entities/parent.entity.ts)
```typescript
export enum PreferredContact {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export interface IParent {
  id: string;
  tenantId: string;
  xeroContactId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;        // Email address
  phone: string | null;        // Phone number (NOT for WhatsApp)
  whatsapp: string | null;     // WhatsApp number (SEPARATE field)
  preferredContact: PreferredContact;
  idNumber: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### InvoiceRepository (src/database/repositories/invoice.repository.ts)
Key methods already available:
- `findById(id: string)` - Returns Invoice or null (SINGLE ARG, NOT tenantId + id)
- `findByIdWithLines(id: string)` - Returns Invoice with lines
- `findByStatus(tenantId: string, status: InvoiceStatus)` - Get invoices by status
- `update(id: string, dto: UpdateInvoiceDto)` - Update invoice
- `updateDeliveryStatus(id: string, deliveryStatus: string, deliveredAt?: Date)` - Update delivery status

### ParentRepository (src/database/repositories/parent.repository.ts)
Key methods already available:
- `findById(id: string)` - Returns Parent or null (SINGLE ARG, NOT tenantId + id)

### TenantRepository (src/database/repositories/tenant.repository.ts)
- `findById(id: string)` - Returns Tenant or null
</current_state>

<schema_changes_required>
## Prisma Schema Changes

Add `deliveryRetryCount` field to Invoice model in `prisma/schema.prisma`:

```prisma
model Invoice {
  // ... existing fields ...
  deliveryRetryCount Int @default(0) @map("delivery_retry_count")  // ADD THIS
  // ... rest of fields ...
}
```

After adding, run:
```bash
npx prisma migrate dev --name add_invoice_delivery_retry_count
npx prisma generate
```
</schema_changes_required>

<repository_changes_required>
## InvoiceRepository Changes

Add method to `src/database/repositories/invoice.repository.ts`:

```typescript
/**
 * Find invoices by delivery status with optional cutoff date
 * Used for retrying failed deliveries
 */
async findByDeliveryStatus(
  tenantId: string,
  deliveryStatus: DeliveryStatus,
  cutoffDate?: Date,
): Promise<Invoice[]> {
  try {
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      deliveryStatus,
      isDeleted: false,
    };

    if (cutoffDate) {
      where.updatedAt = { gte: cutoffDate };
    }

    return await this.prisma.invoice.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }],
    });
  } catch (error) {
    this.logger.error(
      `Failed to find invoices by delivery status ${deliveryStatus} for tenant: ${tenantId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'findByDeliveryStatus',
      'Failed to find invoices by delivery status',
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Increment delivery retry count for an invoice
 */
async incrementDeliveryRetryCount(id: string): Promise<Invoice> {
  try {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('Invoice', id);
    }

    return await this.prisma.invoice.update({
      where: { id },
      data: {
        deliveryRetryCount: { increment: 1 },
      },
    });
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw error;
    }
    this.logger.error(
      `Failed to increment delivery retry count for invoice: ${id}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'incrementDeliveryRetryCount',
      'Failed to increment delivery retry count',
      error instanceof Error ? error : undefined,
    );
  }
}
```

Also update `UpdateInvoiceDto` in `src/database/dto/invoice.dto.ts` to include:
```typescript
@IsOptional()
@IsInt()
@Min(0)
deliveryRetryCount?: number;
```
</repository_changes_required>

<files_to_create>
## Files to Create

### 1. src/integrations/email/email.service.ts
Email service for sending invoices. Uses nodemailer or similar.

### 2. src/integrations/email/email.module.ts
NestJS module for EmailService.

### 3. src/integrations/whatsapp/whatsapp.service.ts
WhatsApp service for sending messages. Uses WhatsApp Business API or similar.

### 4. src/integrations/whatsapp/whatsapp.module.ts
NestJS module for WhatsAppService.

### 5. src/database/services/invoice-delivery.service.ts
Main invoice delivery service.

### 6. src/database/dto/invoice-delivery.dto.ts
DTOs for invoice delivery operations.

### 7. tests/database/services/invoice-delivery.service.spec.ts
Integration tests using real database (no mock data).

### 8. tests/integrations/email/email.service.spec.ts
Unit tests for email service.

### 9. tests/integrations/whatsapp/whatsapp.service.spec.ts
Unit tests for WhatsApp service.
</files_to_create>

<definition_of_done>
<signatures>
<signature file="src/database/dto/invoice-delivery.dto.ts">
/**
 * Invoice Delivery Service DTOs
 * TASK-BILL-013: Invoice Delivery Service
 *
 * @module database/dto/invoice-delivery
 */

import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { DeliveryMethod, DeliveryStatus } from '../entities/invoice.entity';

/**
 * DTO for sending invoices
 */
export class SendInvoicesDto {
  @IsUUID()
  tenantId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  invoiceIds!: string[];

  @IsOptional()
  @IsEnum(DeliveryMethod)
  method?: DeliveryMethod;
}

/**
 * DTO for retrying failed deliveries
 */
export class RetryFailedDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAgeHours?: number;
}

/**
 * Result of sending invoices
 */
export interface DeliveryResult {
  sent: number;
  failed: number;
  failures: DeliveryFailure[];
}

/**
 * Individual delivery failure
 */
export interface DeliveryFailure {
  invoiceId: string;
  reason: string;
  channel?: 'EMAIL' | 'WHATSAPP';
  code: string;
}

/**
 * Individual delivery attempt record
 */
export interface DeliveryAttempt {
  invoiceId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: DeliveryStatus;
  attemptedAt: Date;
  error?: string;
}
</signature>

<signature file="src/database/services/invoice-delivery.service.ts">
/**
 * InvoiceDeliveryService
 * TASK-BILL-013
 *
 * Handles multi-channel invoice delivery via Email and WhatsApp.
 *
 * CRITICAL: All operations must filter by tenantId.
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { AuditLogService } from './audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import {
  DeliveryMethod,
  DeliveryStatus,
  InvoiceStatus,
} from '../entities/invoice.entity';
import { PreferredContact } from '../entities/parent.entity';
import {
  DeliveryResult,
  DeliveryAttempt,
  DeliveryFailure,
} from '../dto/invoice-delivery.dto';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000; // 5 seconds base delay

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Send invoices to parents via their preferred method(s)
   * @param tenantId - Tenant ID (REQUIRED for multi-tenancy)
   * @param invoiceIds - Array of invoice IDs to send
   * @param method - Optional override for delivery method
   * @returns Summary of successful sends and failures
   * @throws BusinessException if tenant not found
   */
  async sendInvoices(
    tenantId: string,
    invoiceIds: string[],
    method?: DeliveryMethod,
  ): Promise&lt;DeliveryResult&gt;;

  /**
   * Send invoice via email
   * @throws BusinessException if email send fails
   */
  async sendEmail(
    invoiceId: string,
    parentEmail: string,
    invoiceNumber: string,
    totalCents: number,
    dueDate: Date,
    childName: string,
    tenantName: string,
  ): Promise&lt;DeliveryAttempt&gt;;

  /**
   * Send invoice via WhatsApp
   * @throws BusinessException if WhatsApp send fails
   */
  async sendWhatsApp(
    invoiceId: string,
    parentWhatsapp: string,
    parentFirstName: string,
    invoiceNumber: string,
    totalCents: number,
    dueDate: Date,
    childName: string,
    tenantName: string,
  ): Promise&lt;DeliveryAttempt&gt;;

  /**
   * Track delivery attempt in audit log
   */
  async trackDelivery(
    tenantId: string,
    invoiceId: string,
    attempt: DeliveryAttempt,
  ): Promise&lt;void&gt;;

  /**
   * Retry failed deliveries with exponential backoff
   * @param tenantId - Tenant ID
   * @param maxAgeHours - Maximum age in hours for failed invoices to retry (default 24)
   * @returns Summary of retry results
   */
  async retryFailed(
    tenantId: string,
    maxAgeHours?: number,
  ): Promise&lt;DeliveryResult&gt;;
}
</signature>

<signature file="src/integrations/email/email.service.ts">
/**
 * EmailService
 * TASK-BILL-013
 *
 * Handles email sending for invoice delivery.
 * Uses nodemailer for SMTP.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { BusinessException } from '../../shared/exceptions';

export interface EmailResult {
  messageId: string;
  status: 'sent' | 'failed';
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Initialize transporter from environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send email
   * @throws BusinessException if send fails
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    from?: string,
  ): Promise&lt;EmailResult&gt;;

  /**
   * Validate email address format
   */
  isValidEmail(email: string): boolean;
}
</signature>

<signature file="src/integrations/whatsapp/whatsapp.service.ts">
/**
 * WhatsAppService
 * TASK-BILL-013
 *
 * Handles WhatsApp messaging for invoice delivery.
 * Uses WhatsApp Business API.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../shared/exceptions';

export interface WhatsAppResult {
  messageId: string;
  status: 'sent' | 'failed';
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  /**
   * Send WhatsApp message
   * @param to - Phone number (will be sanitized to South African format)
   * @param message - Message content
   * @throws BusinessException if send fails
   */
  async sendMessage(
    to: string,
    message: string,
  ): Promise&lt;WhatsAppResult&gt;;

  /**
   * Sanitize phone number to South African format
   * Removes non-digits, converts 0XX to 27XX
   */
  sanitizePhoneNumber(phone: string): string;

  /**
   * Validate phone number
   */
  isValidPhoneNumber(phone: string): boolean;
}
</signature>
</signatures>

<constraints>
- MUST validate invoice status is DRAFT before sending
- MUST validate parent has valid contact info for chosen method
- MUST update invoice status to SENT only after successful delivery
- MUST update deliveryStatus and deliveredAt on success
- MUST log all delivery attempts with timestamps via AuditLogService
- MUST handle service unavailability gracefully with retry
- MUST NOT mark as SENT if delivery fails
- MUST respect parent's preferredContact if no override provided
- Email subject format: "Invoice {invoiceNumber} - {TenantName}"
- WhatsApp uses parent.whatsapp field, NOT parent.phone
- Retry logic: exponential backoff (5s, 10s, 20s)
- MAX_RETRIES = 3 before giving up
- All financial amounts displayed in Rands (divide cents by 100)
- Phone numbers sanitized to South African format (+27)
</constraints>

<verification>
- TypeScript compiles without errors
- npm run lint passes with no errors
- npm run test passes all tests
- sendInvoices validates invoice status is DRAFT
- sendInvoices respects parent's preferredContact
- sendEmail validates email format before sending
- sendWhatsApp sanitizes phone to SA format
- Invoice status updated to SENT on success
- Invoice status remains DRAFT on failure
- deliveryStatus tracked correctly
- deliveredAt timestamp set on success
- retryFailed implements exponential backoff
- retryFailed respects MAX_RETRIES limit
- BOTH delivery method requires both channels
- All delivery attempts logged in audit trail
- Tests use real database (no mock data)
</verification>
</definition_of_done>

<pseudo_code>
InvoiceDeliveryService.sendInvoices(tenantId, invoiceIds, method?):
  result = { sent: 0, failed: 0, failures: [] }

  if invoiceIds.length === 0:
    return result

  // Get tenant for email context
  tenant = await tenantRepo.findById(tenantId)
  if !tenant:
    throw BusinessException('Tenant not found', 'TENANT_NOT_FOUND')

  for invoiceId in invoiceIds:
    try:
      // Get invoice - findById takes SINGLE arg
      invoice = await invoiceRepo.findById(invoiceId)
      if !invoice:
        result.failures.push({ invoiceId, reason: 'Invoice not found', code: 'NOT_FOUND' })
        result.failed++
        continue

      // Verify tenant isolation
      if invoice.tenantId !== tenantId:
        result.failures.push({ invoiceId, reason: 'Invoice belongs to different tenant', code: 'TENANT_MISMATCH' })
        result.failed++
        continue

      // Validate invoice status - MUST be DRAFT
      if invoice.status !== InvoiceStatus.DRAFT:
        result.failures.push({
          invoiceId,
          reason: `Invoice status is ${invoice.status}, expected DRAFT`,
          code: 'INVALID_STATUS'
        })
        result.failed++
        continue

      // Get parent - findById takes SINGLE arg
      parent = await parentRepo.findById(invoice.parentId)
      if !parent:
        result.failures.push({ invoiceId, reason: 'Parent not found', code: 'PARENT_NOT_FOUND' })
        result.failed++
        continue

      // Get child for name
      child = await childRepo.findById(invoice.childId)
      childName = child ? `${child.firstName} ${child.lastName}` : 'Unknown'

      // Determine delivery method
      deliveryMethod = method ?? this.mapPreferredContact(parent.preferredContact)

      emailSuccess = false
      whatsAppSuccess = false
      attempts: DeliveryAttempt[] = []

      // Send via EMAIL if required
      if deliveryMethod === DeliveryMethod.EMAIL || deliveryMethod === DeliveryMethod.BOTH:
        if !parent.email:
          result.failures.push({ invoiceId, reason: 'Parent has no email address', channel: 'EMAIL', code: 'NO_EMAIL' })
        else if !emailService.isValidEmail(parent.email):
          result.failures.push({ invoiceId, reason: 'Invalid email address format', channel: 'EMAIL', code: 'INVALID_EMAIL' })
        else:
          attempt = await this.sendEmail(
            invoiceId,
            parent.email,
            invoice.invoiceNumber,
            invoice.totalCents,
            invoice.dueDate,
            childName,
            tenant.name
          )
          attempts.push(attempt)
          emailSuccess = attempt.status === DeliveryStatus.SENT

      // Send via WHATSAPP if required - USE parent.whatsapp NOT parent.phone
      if deliveryMethod === DeliveryMethod.WHATSAPP || deliveryMethod === DeliveryMethod.BOTH:
        if !parent.whatsapp:
          result.failures.push({ invoiceId, reason: 'Parent has no WhatsApp number', channel: 'WHATSAPP', code: 'NO_WHATSAPP' })
        else if !whatsAppService.isValidPhoneNumber(parent.whatsapp):
          result.failures.push({ invoiceId, reason: 'Invalid WhatsApp number', channel: 'WHATSAPP', code: 'INVALID_WHATSAPP' })
        else:
          attempt = await this.sendWhatsApp(
            invoiceId,
            parent.whatsapp,
            parent.firstName,
            invoice.invoiceNumber,
            invoice.totalCents,
            invoice.dueDate,
            childName,
            tenant.name
          )
          attempts.push(attempt)
          whatsAppSuccess = attempt.status === DeliveryStatus.SENT

      // Determine overall success
      overallSuccess = false
      if deliveryMethod === DeliveryMethod.BOTH:
        overallSuccess = emailSuccess && whatsAppSuccess
      else:
        overallSuccess = emailSuccess || whatsAppSuccess

      if overallSuccess:
        // Update invoice to SENT
        await invoiceRepo.update(invoiceId, {
          status: InvoiceStatus.SENT,
          deliveryMethod: deliveryMethod,
          deliveryStatus: DeliveryStatus.SENT,
        })
        await invoiceRepo.updateDeliveryStatus(invoiceId, DeliveryStatus.SENT, new Date())
        result.sent++
      else:
        // Mark as failed
        await invoiceRepo.updateDeliveryStatus(invoiceId, DeliveryStatus.FAILED)
        result.failed++

      // Track all delivery attempts
      for attempt in attempts:
        await this.trackDelivery(tenantId, invoiceId, attempt)

    catch error:
      logger.error(`Failed to process invoice ${invoiceId}`, error.stack)
      result.failures.push({ invoiceId, reason: error.message, code: 'UNEXPECTED_ERROR' })
      result.failed++

  return result

InvoiceDeliveryService.retryFailed(tenantId, maxAgeHours = 24):
  result = { sent: 0, failed: 0, failures: [] }

  cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours)

  failedInvoices = await invoiceRepo.findByDeliveryStatus(
    tenantId,
    DeliveryStatus.FAILED,
    cutoffDate
  )

  for invoice in failedInvoices:
    // Check retry count
    retryCount = invoice.deliveryRetryCount ?? 0
    if retryCount >= MAX_RETRIES:
      continue

    // Exponential backoff delay
    delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
    await sleep(delay)

    // Attempt resend
    try:
      deliveryResult = await this.sendInvoices(tenantId, [invoice.id], invoice.deliveryMethod)

      if deliveryResult.sent > 0:
        result.sent++
      else:
        result.failed++
        result.failures.push(...deliveryResult.failures)
        // Increment retry count
        await invoiceRepo.incrementDeliveryRetryCount(invoice.id)
    catch error:
      result.failed++
      result.failures.push({ invoiceId: invoice.id, reason: error.message, code: 'RETRY_FAILED' })
      await invoiceRepo.incrementDeliveryRetryCount(invoice.id)

  return result

EmailService.sendEmail(to, subject, body, from?):
  if !this.isValidEmail(to):
    throw BusinessException('Invalid email address', 'INVALID_EMAIL')

  try:
    result = await this.transporter.sendMail({
      from: from ?? process.env.SMTP_FROM,
      to: to,
      subject: subject,
      text: body,
    })

    return { messageId: result.messageId, status: 'sent' }
  catch error:
    logger.error(`Failed to send email to ${to}: ${error.message}`)
    throw BusinessException(`Email send failed: ${error.message}`, 'EMAIL_SEND_FAILED')

EmailService.isValidEmail(email):
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

WhatsAppService.sendMessage(to, message):
  sanitizedPhone = this.sanitizePhoneNumber(to)
  if !this.isValidPhoneNumber(sanitizedPhone):
    throw BusinessException('Invalid phone number', 'INVALID_PHONE')

  try:
    // TODO: Implement actual WhatsApp Business API call
    // For now, throw NOT_IMPLEMENTED until WhatsApp MCP is available
    throw BusinessException('WhatsApp integration not yet implemented', 'NOT_IMPLEMENTED')
  catch error:
    logger.error(`Failed to send WhatsApp to ${sanitizedPhone}: ${error.message}`)
    throw error

WhatsAppService.sanitizePhoneNumber(phone):
  // Remove non-digit characters
  digits = phone.replace(/\D/g, '')

  // Convert SA format: 0XX... to 27XX...
  if digits.length === 10 && digits.startsWith('0'):
    digits = '27' + digits.substring(1)

  // Add country code if missing
  if digits.length === 9 && !digits.startsWith('27'):
    digits = '27' + digits

  return digits

WhatsAppService.isValidPhoneNumber(phone):
  sanitized = this.sanitizePhoneNumber(phone)
  // South African numbers: 27 + 9 digits = 11 total
  return /^27\d{9}$/.test(sanitized)
</pseudo_code>

<files_to_create>
  <file path="src/integrations/email/email.service.ts">EmailService with sendEmail method</file>
  <file path="src/integrations/email/email.module.ts">EmailModule for DI</file>
  <file path="src/integrations/whatsapp/whatsapp.service.ts">WhatsAppService with sendMessage method</file>
  <file path="src/integrations/whatsapp/whatsapp.module.ts">WhatsAppModule for DI</file>
  <file path="src/database/services/invoice-delivery.service.ts">InvoiceDeliveryService</file>
  <file path="src/database/dto/invoice-delivery.dto.ts">DTOs for invoice delivery</file>
  <file path="tests/database/services/invoice-delivery.service.spec.ts">Integration tests</file>
  <file path="tests/integrations/email/email.service.spec.ts">Email service tests</file>
  <file path="tests/integrations/whatsapp/whatsapp.service.spec.ts">WhatsApp service tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add deliveryRetryCount field to Invoice model</file>
  <file path="src/database/repositories/invoice.repository.ts">Add findByDeliveryStatus and incrementDeliveryRetryCount methods</file>
  <file path="src/database/dto/invoice.dto.ts">Add deliveryRetryCount to UpdateInvoiceDto</file>
  <file path="src/database/database.module.ts">Import InvoiceDeliveryService</file>
  <file path="src/app.module.ts">Import EmailModule and WhatsAppModule</file>
</files_to_modify>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- invoice-delivery.service.spec.ts</command>
  <command>npm test -- email.service.spec.ts</command>
  <command>npm test -- whatsapp.service.spec.ts</command>
</test_commands>

<reasoning_guidance>
## Recommended Reasoning Approach

1. **Start with Schema Changes** - Add deliveryRetryCount field first, run migration
2. **Update Repository** - Add new methods to InvoiceRepository
3. **Create Integration Services** - EmailService and WhatsAppService
4. **Create Core Service** - InvoiceDeliveryService
5. **Write Tests** - Integration tests with real database
6. **Verify** - Run linting and all tests

## Key Pitfalls to Avoid

1. **Repository method signatures**: findById takes 1 arg, NOT 2
2. **WhatsApp field**: Use parent.whatsapp, NOT parent.phone
3. **PreferredContact enum**: Maps to DeliveryMethod (EMAIL=EMAIL, WHATSAPP=WHATSAPP, BOTH=BOTH)
4. **Test data**: Use real database fixtures, NOT mock data
5. **Error handling**: Throw BusinessException with clear codes
6. **Audit logging**: Use AuditLogService.logAction for all attempts
</reasoning_guidance>

</task_spec>
