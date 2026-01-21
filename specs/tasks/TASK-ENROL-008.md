<task_spec id="TASK-ENROL-008" version="1.0">

<metadata>
  <title>Parent Welcome Pack Delivery Integration</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>268</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ENROL-007</requirement_ref>
    <requirement_ref>REQ-PARENT-001</requirement_ref>
    <requirement_ref>REQ-NOTIF-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ENROL-006</task_ref>
    <task_ref status="ready">TASK-ENROL-007</task_ref>
    <task_ref status="complete">TASK-BILL-021</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Enrollment Flow (enrollment.service.ts)

  **enrollChild() method:**
  1. Validates child and fee structure
  2. Creates enrollment with ACTIVE status
  3. Generates registration fee invoice (if applicable)
  4. Generates pro-rated first month invoice
  5. Returns { enrollment, invoice, invoiceError }

  **Missing Step:**
  - NO welcome pack email sent to parent after enrollment

  ## Existing Delivery Patterns

  **Invoice Delivery (invoice-delivery.service.ts):**
  - `deliverInvoice()` - sends invoice via email with PDF
  - Uses EmailService.sendEmailWithOptions()
  - Attaches PDF, tracks opens/clicks
  - Includes custom variables for webhook tracking

  **Statement Delivery (statement-delivery.service.ts):**
  - `deliverStatement()` - sends statement via email with PDF
  - Same pattern as invoice delivery
  - HTML email body + PDF attachment

  ## Email Service Capabilities
  - `sendEmailWithOptions()` supports:
    - HTML body
    - Plain text fallback
    - PDF attachments
    - Mailgun tags for tracking
    - Custom variables for webhook correlation
</project_state>

<context>
  ## Business Requirement

  When `enrollChild()` is called successfully:
  1. Enrollment is created
  2. Invoice(s) are generated
  3. **NEW**: Welcome pack email is sent to parent

  The welcome pack delivery should:
  - Generate welcome pack PDF (TASK-ENROL-006)
  - Render welcome email (TASK-ENROL-007)
  - Send email with PDF attachment via Mailgun
  - Track delivery status via webhooks
  - Log welcome pack sent in audit trail
  - Be optionally callable separately (manual resend)

  ## Integration Points
  - Called from `EnrollmentService.enrollChild()` after successful enrollment
  - Uses `ParentWelcomePackPdfService` for PDF generation
  - Uses `EmailTemplateService` for email rendering
  - Uses `EmailService` for delivery
  - Updates audit log with welcome pack sent

  ## Delivery Options
  - Automatic: Sent immediately after enrollment
  - Manual: API endpoint to resend welcome pack
  - Configurable: Tenant can disable auto-send (future)
</context>

<input_context_files>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="invoice_delivery_reference">apps/api/src/database/services/invoice-delivery.service.ts</file>
  <file purpose="statement_delivery_reference">apps/api/src/database/services/statement-delivery.service.ts</file>
  <file purpose="email_service">apps/api/src/integrations/email/email.service.ts</file>
  <file purpose="email_template_service">apps/api/src/common/services/email-template/email-template.service.ts</file>
  <file purpose="audit_log_service">apps/api/src/database/services/audit-log.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-ENROL-006 implemented (ParentWelcomePackPdfService)</check>
  <check>TASK-ENROL-007 implemented (renderWelcomePackEmail)</check>
  <check>TASK-BILL-021 completed (enrollChild creates invoices)</check>
  <check>EmailService.sendEmailWithOptions() available</check>
  <check>Mailgun webhook tracking configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create `WelcomePackDeliveryService` class
    - Implement `deliverWelcomePack()` method
    - Integrate into `EnrollmentService.enrollChild()` flow
    - Add `POST /enrollments/:id/welcome-pack/resend` endpoint
    - Track delivery via Mailgun custom variables
    - Log welcome pack delivery in audit trail
    - Handle delivery failures gracefully (don't fail enrollment)
    - Add `welcomePackSentAt` field to Enrollment entity
  </in_scope>
  <out_of_scope>
    - WhatsApp welcome notification (future TASK-WA-* task)
    - Bulk welcome pack sending
    - Welcome pack preview endpoint
    - Tenant-level auto-send toggle (future enhancement)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add tracking field to Enrollment model

```prisma
model Enrollment {
  // ... existing fields ...

  // Welcome pack tracking
  welcomePackSentAt     DateTime?   @map("welcome_pack_sent_at")

  // @@map("enrollments")
}
```

Note: Migration needed to add this optional field.
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/database/services/welcome-pack-delivery.service.ts

```typescript
/**
 * Welcome Pack Delivery Service
 * TASK-ENROL-008: Deliver welcome pack to parents on enrollment
 *
 * Responsibilities:
 * - Generate and send welcome pack email with PDF attachment
 * - Track delivery via Mailgun webhooks
 * - Log delivery in audit trail
 * - Support manual resend
 */

@Injectable()
export class WelcomePackDeliveryService {
  private readonly logger = new Logger(WelcomePackDeliveryService.name);

  constructor(
    private readonly welcomePackPdfService: ParentWelcomePackPdfService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly emailService: EmailService,
    private readonly enrollmentRepository: EnrollmentRepository,
    private readonly parentRepository: ParentRepository,
    private readonly childRepository: ChildRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly feeStructureRepository: FeeStructureRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Deliver welcome pack to parent for a specific enrollment
   *
   * @param tenantId - Tenant ID
   * @param enrollmentId - Enrollment ID
   * @param userId - User initiating the delivery (for audit)
   * @returns Delivery result with messageId and status
   */
  async deliverWelcomePack(
    tenantId: string,
    enrollmentId: string,
    userId: string,
  ): Promise<WelcomePackDeliveryResult>

  /**
   * Internal method to send the welcome pack email
   */
  private async sendWelcomePackEmail(
    parent: Parent,
    child: Child,
    enrollment: Enrollment,
    tenant: Tenant,
    feeStructure: FeeStructure,
    pdfBuffer: Buffer,
  ): Promise<EmailSendResult>

  /**
   * Update enrollment with welcome pack sent timestamp
   */
  private async markWelcomePackSent(
    enrollmentId: string,
    tenantId: string,
  ): Promise<void>

  /**
   * Log welcome pack delivery in audit trail
   */
  private async logDelivery(
    tenantId: string,
    enrollmentId: string,
    parentId: string,
    userId: string,
    success: boolean,
    messageId?: string,
    error?: string,
  ): Promise<void>
}

## WelcomePackDeliveryResult interface

export interface WelcomePackDeliveryResult {
  success: boolean;
  enrollmentId: string;
  parentId: string;
  childId: string;
  messageId?: string;
  sentAt?: Date;
  error?: string;
}
```

## Integration into EnrollmentService

```typescript
// In enrollment.service.ts - modify enrollChild() method

async enrollChild(
  tenantId: string,
  childId: string,
  feeStructureId: string,
  startDate: Date,
  userId: string,
  allowHistoricDates = false,
): Promise<EnrollChildResult> {
  // ... existing enrollment logic ...

  // After successful enrollment and invoice creation:

  // NEW: Send welcome pack (non-blocking, don't fail enrollment on error)
  let welcomePackResult: WelcomePackDeliveryResult | undefined;
  try {
    welcomePackResult = await this.welcomePackDeliveryService.deliverWelcomePack(
      tenantId,
      enrollment.id,
      userId,
    );
    this.logger.log(
      `Welcome pack sent for enrollment ${enrollment.id}: ${welcomePackResult.success}`,
    );
  } catch (error) {
    this.logger.error(
      `Failed to send welcome pack for enrollment ${enrollment.id}: ${error.message}`,
    );
    // Don't throw - enrollment succeeded, welcome pack is secondary
  }

  return {
    enrollment,
    invoice: enrollmentInvoice,
    invoiceError,
    welcomePackSent: welcomePackResult?.success ?? false,
  };
}
```
</service_files>

<!-- ============================================ -->
<!-- API ENDPOINTS                                -->
<!-- ============================================ -->

<api_endpoints>
## Add to enrollment.controller.ts

```typescript
/**
 * Resend welcome pack for an enrollment
 * POST /enrollments/:id/welcome-pack/resend
 */
@Post(':id/welcome-pack/resend')
async resendWelcomePack(
  @CurrentUser() user: IUser,
  @Param('id') enrollmentId: string,
): Promise<{ success: boolean; data: WelcomePackDeliveryResult }>

/**
 * Get welcome pack delivery status
 * GET /enrollments/:id/welcome-pack/status
 */
@Get(':id/welcome-pack/status')
async getWelcomePackStatus(
  @CurrentUser() user: IUser,
  @Param('id') enrollmentId: string,
): Promise<{ sent: boolean; sentAt?: Date }>
```
</api_endpoints>

<!-- ============================================ -->
<!-- DEFINITION OF DONE                           -->
<!-- ============================================ -->

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/welcome-pack-delivery.service.ts">
      interface WelcomePackDeliveryResult {
        success: boolean;
        enrollmentId: string;
        parentId: string;
        childId: string;
        messageId?: string;
        sentAt?: Date;
        error?: string;
      }

      async deliverWelcomePack(
        tenantId: string,
        enrollmentId: string,
        userId: string,
      ): Promise&lt;WelcomePackDeliveryResult&gt;
    </signature>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      // EnrollChildResult extended
      interface EnrollChildResult {
        enrollment: IEnrollment;
        invoice: IInvoice | null;
        invoiceError?: string;
        welcomePackSent: boolean;  // NEW
      }
    </signature>
    <signature file="apps/api/src/api/billing/enrollment.controller.ts">
      @Post(':id/welcome-pack/resend')
      async resendWelcomePack(
        @CurrentUser() user: IUser,
        @Param('id') enrollmentId: string,
      ): Promise&lt;{ success: boolean; data: WelcomePackDeliveryResult }&gt;
    </signature>
  </signatures>

  <constraints>
    - Welcome pack delivery MUST NOT fail the enrollment (catch errors)
    - Email must include PDF attachment
    - Mailgun custom variables must include enrollmentId for webhook tracking
    - Audit log must capture delivery attempt and result
    - welcomePackSentAt must be updated on successful delivery
    - Resend endpoint must validate enrollment exists and belongs to tenant
    - Parent must have email address for delivery
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - enrollChild() sends welcome pack automatically
    - enrollChild() succeeds even if welcome pack fails
    - Resend endpoint works correctly
    - PDF attachment included in email
    - Mailgun webhook can correlate delivery status
    - Audit log captures delivery events
    - welcomePackSentAt updated on success
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Schema Update

1. Add `welcomePackSentAt` field to Enrollment model in Prisma schema

2. Create migration:
   ```bash
   npx prisma migrate dev --name add_enrollment_welcome_pack_sent
   ```

3. Update `IEnrollment` interface in enrollment entity

## Phase 2: Service Implementation

4. Create `apps/api/src/database/dto/welcome-pack-delivery.dto.ts`:
   - WelcomePackDeliveryResult interface

5. Create `apps/api/src/database/services/welcome-pack-delivery.service.ts`:
   - Inject all required services
   - Implement `deliverWelcomePack()` method
   - Follow invoice-delivery.service.ts patterns
   - Include webhook tracking custom variables

6. Register service in `apps/api/src/database/database.module.ts`

## Phase 3: Enrollment Integration

7. Modify `enrollment.service.ts`:
   - Inject WelcomePackDeliveryService
   - Call `deliverWelcomePack()` after successful enrollment
   - Extend EnrollChildResult with `welcomePackSent` field
   - Handle errors gracefully (don't fail enrollment)

## Phase 4: API Endpoints

8. Add endpoints to `enrollment.controller.ts`:
   - POST /:id/welcome-pack/resend
   - GET /:id/welcome-pack/status

## Phase 5: Testing

9. Create unit tests:
   - `welcome-pack-delivery.service.spec.ts`
   - Integration test for enrollment flow

## Phase 6: Verification

10. Build and verify:
    ```bash
    pnpm run build
    pnpm run lint
    pnpm test -- welcome-pack-delivery
    pnpm test -- enrollment.service
    ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add welcomePackSentAt to Enrollment</file>
  <file path="apps/api/src/database/entities/enrollment.entity.ts">Add welcomePackSentAt to IEnrollment</file>
  <file path="apps/api/src/database/services/enrollment.service.ts">Integrate welcome pack delivery</file>
  <file path="apps/api/src/api/billing/enrollment.controller.ts">Add resend endpoint</file>
  <file path="apps/api/src/database/database.module.ts">Register WelcomePackDeliveryService</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/dto/welcome-pack-delivery.dto.ts">Delivery DTOs</file>
  <file path="apps/api/src/database/services/welcome-pack-delivery.service.ts">Delivery service</file>
  <file path="apps/api/tests/database/services/welcome-pack-delivery.service.spec.ts">Unit tests</file>
  <file path="apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_enrollment_welcome_pack_sent/">Migration files</file>
</files_to_create>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>enrollChild() automatically sends welcome pack</criterion>
  <criterion>Enrollment succeeds even if welcome pack delivery fails</criterion>
  <criterion>Welcome pack email includes PDF attachment</criterion>
  <criterion>Mailgun custom variables include enrollmentId</criterion>
  <criterion>welcomePackSentAt updated on successful delivery</criterion>
  <criterion>Audit log captures WELCOME_PACK_SENT event</criterion>
  <criterion>Resend endpoint returns correct response</criterion>
  <criterion>Parent without email address returns appropriate error</criterion>
</validation_criteria>

<test_commands>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm test -- welcome-pack-delivery</command>
  <command>pnpm test -- enrollment.service</command>
</test_commands>

<test_scenarios>
## Scenario 1: Successful Enrollment with Welcome Pack
- Parent has valid email
- Enrollment creates successfully
- Welcome pack email sent
- EXPECTED:
  - enrollChild() returns { welcomePackSent: true }
  - welcomePackSentAt is set
  - Audit log shows WELCOME_PACK_SENT

## Scenario 2: Enrollment Success, Welcome Pack Fails
- Parent has valid email
- Enrollment creates successfully
- Email service fails (network error)
- EXPECTED:
  - enrollChild() returns { enrollment, invoice } (SUCCESS)
  - welcomePackSent: false
  - Error logged but not thrown
  - welcomePackSentAt is null

## Scenario 3: Parent Without Email
- Parent has no email address
- Enrollment creates successfully
- EXPECTED:
  - enrollChild() succeeds
  - welcomePackSent: false
  - Appropriate log message

## Scenario 4: Resend Welcome Pack
- Enrollment exists with welcomePackSentAt set
- Call resend endpoint
- EXPECTED:
  - New email sent
  - welcomePackSentAt updated to new timestamp
  - New audit log entry

## Scenario 5: Resend for Invalid Enrollment
- Enrollment ID doesn't exist
- Call resend endpoint
- EXPECTED:
  - 404 Not Found response
</test_scenarios>

</task_spec>
