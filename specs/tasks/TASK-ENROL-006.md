<task_spec id="TASK-ENROL-006" version="1.0">

<metadata>
  <title>Parent Welcome Pack PDF Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>266</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ENROL-007</requirement_ref>
    <requirement_ref>REQ-PARENT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-021</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
    <task_ref status="complete">TASK-STAFF-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Parent Onboarding Infrastructure

  **Existing Enrollment Flow (enrollment.service.ts):**
  - `enrollChild()` creates enrollment + registration invoice
  - Pro-rated first month fee calculation
  - Multi-child enrollment support
  - Audit logging for all actions

  **Existing Staff Welcome Pack (welcome-pack-pdf.service.ts):**
  - PDF generation using PDFKit
  - Employee information section
  - Onboarding checklist
  - Policies section
  - Emergency contacts
  - First day schedule

  **Existing Email Infrastructure:**
  - Mailgun integration (email.service.ts)
  - HTML email templates (email-template.service.ts)
  - Invoice delivery with PDF attachments
  - Statement delivery with PDF attachments

  **Missing Components:**
  - Parent-specific welcome pack PDF
  - Parent welcome email template
  - Integration with enrollment flow
</project_state>

<context>
  ## Business Requirement

  When a child is enrolled at the crèche, parents should receive a comprehensive welcome pack via email containing:

  1. **Welcome Message**: Personalized greeting from the crèche
  2. **Child Information**: Enrollment details, start date, class assignment
  3. **Crèche Information**: Operating hours, contact details, location
  4. **Important Policies**: Attendance, illness, collection procedures
  5. **Fee Structure**: Monthly fees, payment methods, due dates
  6. **What to Bring**: First day checklist, ongoing daily requirements
  7. **Emergency Procedures**: Contact tree, evacuation procedures
  8. **Important Dates**: School terms, holidays, closure dates

  ## Delivery Method
  - Email with HTML body + PDF attachment (same pattern as invoice/statement delivery)
  - PDF should be professional, branded with tenant details
  - Welcome email sent immediately after successful enrollment

  ## Project Context
  - **Framework**: NestJS with Prisma ORM
  - **Database**: PostgreSQL
  - **PDF Library**: PDFKit (already in use)
  - **Email**: Mailgun API (already configured)
  - **Multi-tenant**: All operations scoped by tenantId
</context>

<input_context_files>
  <file purpose="staff_welcome_pack_reference">apps/api/src/database/services/welcome-pack-pdf.service.ts</file>
  <file purpose="invoice_pdf_reference">apps/api/src/database/services/invoice-pdf.service.ts</file>
  <file purpose="statement_pdf_reference">apps/api/src/database/services/statement-pdf.service.ts</file>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="email_template_service">apps/api/src/common/services/email-template/email-template.service.ts</file>
  <file purpose="tenant_entity">apps/api/src/database/entities/tenant.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-021 completed (enrollment creates invoice)</check>
  <check>TASK-BILL-013 completed (invoice delivery service exists)</check>
  <check>TASK-STAFF-001 completed (staff welcome pack PDF exists)</check>
  <check>PDFKit is available in the project</check>
  <check>Mailgun email service is configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create `ParentWelcomePackPdfService` class
    - Generate parent-focused welcome pack PDF
    - Include tenant branding (name, logo placeholder, colors)
    - Include child enrollment details
    - Include crèche policies and procedures
    - Include fee structure information
    - Include emergency contact information
    - Include "what to bring" checklist
    - Support customizable welcome message per tenant
    - Add `parentWelcomeMessage` field to Tenant entity (optional)
  </in_scope>
  <out_of_scope>
    - Email template (TASK-ENROL-007)
    - Delivery integration with enrollment flow (TASK-ENROL-008)
    - Tenant logo upload/storage
    - Downloadable templates for tenants
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add optional field to Tenant model for custom welcome message

```prisma
model Tenant {
  // ... existing fields ...

  // Parent onboarding customization
  parentWelcomeMessage  String?   @map("parent_welcome_message") @db.Text
  operatingHours        String?   @map("operating_hours") @db.VarChar(200)

  // @@map("tenants")
}
```

Note: Migration needed to add these optional fields.
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/database/services/parent-welcome-pack-pdf.service.ts

```typescript
/**
 * Parent Welcome Pack PDF Service
 * TASK-ENROL-006: Generate Welcome Pack for new parent enrollments
 *
 * Responsibilities:
 * - Generate PDF welcome pack for parents when child is enrolled
 * - Include crèche information, policies, fee structure
 * - Include child-specific enrollment details
 * - Support tenant branding and customization
 */

@Injectable()
export class ParentWelcomePackPdfService {
  private readonly logger = new Logger(ParentWelcomePackPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRepository: TenantRepository,
    private readonly childRepository: ChildRepository,
    private readonly feeStructureRepository: FeeStructureRepository,
  ) {}

  /**
   * Generate welcome pack PDF for a parent enrollment
   *
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @param childId - Child ID (for specific child enrollment details)
   * @param options - Generation options
   * @returns PDF buffer
   */
  async generateWelcomePack(
    tenantId: string,
    parentId: string,
    childId: string,
    options?: WelcomePackOptions,
  ): Promise<Buffer>

  /**
   * Add header with crèche branding
   */
  private addHeader(doc: PDFDocument, tenant: Tenant): void

  /**
   * Add welcome message section
   */
  private addWelcomeMessage(
    doc: PDFDocument,
    parent: Parent,
    child: Child,
    tenant: Tenant,
  ): void

  /**
   * Add enrollment details section
   */
  private addEnrollmentDetails(
    doc: PDFDocument,
    child: Child,
    enrollment: Enrollment,
  ): void

  /**
   * Add crèche information section
   */
  private addCrecheInformation(doc: PDFDocument, tenant: Tenant): void

  /**
   * Add fee structure section
   */
  private addFeeStructure(
    doc: PDFDocument,
    feeStructure: FeeStructure,
    tenant: Tenant,
  ): void

  /**
   * Add policies section
   */
  private addPoliciesSection(doc: PDFDocument): void

  /**
   * Add what to bring checklist
   */
  private addWhatToBring(doc: PDFDocument): void

  /**
   * Add emergency procedures section
   */
  private addEmergencyProcedures(doc: PDFDocument, tenant: Tenant): void

  /**
   * Add footer with page numbers
   */
  private addFooter(doc: PDFDocument): void
}
```

## src/database/dto/parent-welcome-pack.dto.ts

```typescript
/**
 * Parent Welcome Pack DTOs
 * TASK-ENROL-006
 */

export interface WelcomePackOptions {
  /** Custom welcome message (overrides tenant default) */
  customMessage?: string;
  /** Include fee structure details */
  includeFeeStructure?: boolean;
  /** Include policies section */
  includePolicies?: boolean;
  /** Include what to bring checklist */
  includeWhatToBring?: boolean;
  /** Include emergency procedures */
  includeEmergencyProcedures?: boolean;
}

export interface WelcomePackResult {
  /** PDF buffer */
  pdfBuffer: Buffer;
  /** PDF size in bytes */
  sizeBytes: number;
  /** Generated timestamp */
  generatedAt: Date;
  /** Filename for the PDF */
  filename: string;
}
```
</service_files>

<!-- ============================================ -->
<!-- DEFINITION OF DONE                           -->
<!-- ============================================ -->

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/parent-welcome-pack-pdf.service.ts">
      interface WelcomePackOptions {
        customMessage?: string;
        includeFeeStructure?: boolean;
        includePolicies?: boolean;
        includeWhatToBring?: boolean;
        includeEmergencyProcedures?: boolean;
      }

      async generateWelcomePack(
        tenantId: string,
        parentId: string,
        childId: string,
        options?: WelcomePackOptions,
      ): Promise&lt;Buffer&gt;
    </signature>
  </signatures>

  <constraints>
    - PDF must be A4 format, professional appearance
    - PDF must include tenant name and contact details in header
    - PDF must include child's name and enrollment start date
    - PDF must include fee structure with amounts in ZAR
    - PDF must include bank details if available on tenant
    - All sections must be configurable via options
    - Must handle missing optional data gracefully
    - PDF size should be reasonable (< 500KB for text-only)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - PDF generates correctly with all sections
    - PDF includes tenant branding
    - PDF includes child enrollment details
    - Fee structure displays correctly
    - Bank details included if available
    - PDF opens correctly in PDF viewers
    - Unit tests pass
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Schema Update

1. Add optional fields to Tenant model:
   - `parentWelcomeMessage` (Text, optional)
   - `operatingHours` (VarChar(200), optional)

2. Create migration:
   ```bash
   npx prisma migrate dev --name add_tenant_parent_welcome_fields
   ```

## Phase 2: Service Implementation

3. Create `apps/api/src/database/dto/parent-welcome-pack.dto.ts`:
   - WelcomePackOptions interface
   - WelcomePackResult interface

4. Create `apps/api/src/database/services/parent-welcome-pack-pdf.service.ts`:
   - Reference `welcome-pack-pdf.service.ts` for PDF generation patterns
   - Reference `statement-pdf.service.ts` for financial formatting
   - Implement all sections as private methods
   - Support tenant customization

5. Register service in `apps/api/src/database/database.module.ts`

## Phase 3: Testing

6. Create unit tests in `apps/api/tests/database/services/parent-welcome-pack-pdf.service.spec.ts`

## Phase 4: Verification

7. Build and verify:
   ```bash
   pnpm run build
   pnpm run lint
   pnpm test -- parent-welcome-pack
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add parentWelcomeMessage and operatingHours to Tenant</file>
  <file path="apps/api/src/database/database.module.ts">Register ParentWelcomePackPdfService</file>
  <file path="apps/api/src/database/entities/tenant.entity.ts">Add optional fields to ITenant interface</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/dto/parent-welcome-pack.dto.ts">Welcome pack DTOs</file>
  <file path="apps/api/src/database/services/parent-welcome-pack-pdf.service.ts">PDF generation service</file>
  <file path="apps/api/tests/database/services/parent-welcome-pack-pdf.service.spec.ts">Unit tests</file>
  <file path="apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_tenant_parent_welcome_fields/">Migration files</file>
</files_to_create>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>PDF generates with correct A4 dimensions</criterion>
  <criterion>Tenant name appears in header</criterion>
  <criterion>Child name and enrollment date appear in enrollment section</criterion>
  <criterion>Fee structure displays monthly amount and payment reference</criterion>
  <criterion>Bank details appear if tenant has bankAccountNumber</criterion>
  <criterion>Policies section lists key policies</criterion>
  <criterion>What to bring checklist is readable</criterion>
  <criterion>Emergency contacts include tenant phone and email</criterion>
  <criterion>PDF opens without errors in Adobe Reader and Preview</criterion>
</validation_criteria>

<test_commands>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm test -- parent-welcome-pack</command>
</test_commands>

<test_scenarios>
## Scenario 1: Full Welcome Pack
- Tenant: Little Stars Daycare with bank details
- Child: Emma Johnson starting Feb 1, 2026
- Fee: R2500/month
- EXPECTED: PDF with all sections, bank details, fee amount R2,500.00

## Scenario 2: Minimal Welcome Pack
- Tenant: No bank details, no custom welcome message
- Child: Basic enrollment
- EXPECTED: PDF without bank section, default welcome message

## Scenario 3: Custom Welcome Message
- Tenant: Custom parentWelcomeMessage set
- EXPECTED: PDF shows custom message instead of default

## Scenario 4: Selective Sections
- Options: includePolicies=false, includeWhatToBring=false
- EXPECTED: PDF generated without those sections
</test_scenarios>

</task_spec>
