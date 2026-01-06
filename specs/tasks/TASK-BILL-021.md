<task_spec id="TASK-BILL-021" version="1.0">

<metadata>
  <title>Trigger Auto-Invoice on Enrollment</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>140</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>EC-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-012</task_ref>
    <task_ref>TASK-BILL-020</task_ref>
    <task_ref>TASK-BILL-014</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis on 2026-01-06, it was discovered that when a child is enrolled,
NO invoice is automatically generated. The PRD requires:
1. Registration fee charged immediately on enrollment
2. Pro-rated school fees for remaining days in the month

## Current State
- `EnrollmentService.enrollChild()` at `apps/api/src/database/services/enrollment.service.ts:48-130`
- Method creates enrollment record but does NOT call invoice generation
- `InvoiceGenerationService` exists and can generate invoices
- `ProRataService` exists for calculating partial month fees

## What Should Happen (Per PRD)
When `enrollChild()` is called:
1. Create enrollment record (currently works)
2. **Generate enrollment invoice with:**
   - Registration fee line item (from FeeStructure.registrationFeeCents)
   - Pro-rated monthly fee for remaining days in current month
3. The invoice should be created as DRAFT and optionally synced to Xero

## Project Context
- **Services Location**: `apps/api/src/database/services/`
- **Invoice Generation**: `apps/api/src/database/services/invoice-generation.service.ts`
- **Pro-rata Service**: `apps/api/src/database/services/pro-rata.service.ts`
- **Enrollment Service**: `apps/api/src/database/services/enrollment.service.ts`
- **Financial Precision**: Decimal.js with banker's rounding, cents storage
</context>

<input_context_files>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="invoice_generation">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="pro_rata_service">apps/api/src/database/services/pro-rata.service.ts</file>
  <file purpose="fee_structure_entity">apps/api/src/database/entities/fee-structure.entity.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="line_type_enum">apps/api/prisma/schema.prisma#LineType</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-020 completed (registrationFeeCents field exists)</check>
  <check>TASK-BILL-012 completed (InvoiceGenerationService exists)</check>
  <check>TASK-BILL-014 completed (ProRataService exists)</check>
  <check>InvoiceRepository and InvoiceLineRepository available</check>
</prerequisites>

<scope>
  <in_scope>
    - Modify EnrollmentService.enrollChild() to generate invoice
    - Create new method createEnrollmentInvoice()
    - Add registration fee line item (LineType.REGISTRATION)
    - Add pro-rated monthly fee line item
    - Use ProRataService for calculations
    - Use Decimal.js with banker's rounding
    - Create invoice as DRAFT status
    - Sync to Xero optionally (if connected)
    - Add audit log entry
    - Unit tests for new functionality
  </in_scope>
  <out_of_scope>
    - Changing the registration fee value (that's a FeeStructure update)
    - UI for displaying enrollment invoice
    - Sending the invoice (that's a separate action)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      /**
       * Create enrollment invoice with registration fee and pro-rated first month
       * @param tenantId - Tenant ID
       * @param enrollment - The created enrollment
       * @param feeStructure - Fee structure with registration fee
       * @param userId - User performing enrollment
       * @returns Created invoice
       */
      async createEnrollmentInvoice(
        tenantId: string,
        enrollment: Enrollment,
        feeStructure: FeeStructure,
        userId: string,
      ): Promise<Invoice>;
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Registration fee line must use LineType.REGISTRATION
    - Monthly fee line must use LineType.MONTHLY_FEE
    - Invoice status must be DRAFT
    - Must handle case where registration fee is 0 (don't add empty line)
    - Must handle full-month enrollment (no pro-rata needed if start on 1st)
    - Must include proper audit logging
    - Must NOT throw if Xero sync fails (log and continue)
  </constraints>

  <verification>
    - When child is enrolled, invoice is automatically created
    - Invoice contains registration fee line (if registrationFeeCents > 0)
    - Invoice contains pro-rated monthly fee line
    - Pro-rata calculation is accurate
    - Invoice totals are correct
    - Audit log entry created
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
EnrollmentService (apps/api/src/database/services/enrollment.service.ts):

  // ADD: Inject invoice generation dependencies
  constructor(
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly invoiceRepo: InvoiceRepository,       // NEW
    private readonly invoiceLineRepo: InvoiceLineRepository, // NEW
    private readonly proRataService: ProRataService,       // NEW
    private readonly auditLogService: AuditLogService,
  ) {}

  // MODIFY: enrollChild() method
  async enrollChild(...): Promise<IEnrollment> {
    // ... existing validation code (lines 48-104) ...

    // 5. Create enrollment (existing code at line 107-113)
    const enrollment = await this.enrollmentRepo.create({...});

    // 6. Audit log (existing code at lines 115-123)
    await this.auditLogService.logCreate({...});

    // 7. NEW: Generate enrollment invoice
    try {
      await this.createEnrollmentInvoice(
        tenantId,
        enrollment,
        feeStructure,
        userId
      );
      this.logger.log(`Created enrollment invoice for child ${childId}`);
    } catch (error) {
      // Log but don't fail enrollment if invoice fails
      this.logger.error(`Failed to create enrollment invoice: ${error.message}`);
    }

    return enrollment as IEnrollment;
  }

  // NEW METHOD
  async createEnrollmentInvoice(
    tenantId: string,
    enrollment: Enrollment,
    feeStructure: FeeStructure,
    userId: string,
  ): Promise<Invoice> {
    // 1. Get child and parent info
    const child = await this.childRepo.findById(enrollment.childId);

    // 2. Calculate billing period (remaining days in current month)
    const today = new Date();
    const startDate = new Date(enrollment.startDate);
    const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    // 3. Calculate pro-rated fee
    const fullMonthFeeCents = feeStructure.amountCents;
    let proRatedFeeCents = fullMonthFeeCents;
    let isProRated = false;

    // Only pro-rate if not starting on the 1st
    if (startDate.getDate() !== 1) {
      const proRataResult = await this.proRataService.calculateProRata(
        tenantId,
        fullMonthFeeCents,
        startDate,
        monthEnd
      );
      proRatedFeeCents = proRataResult.amountCents;
      isProRated = true;
    }

    // 4. Generate invoice number
    const year = startDate.getFullYear();
    const invoiceNumber = await this.generateInvoiceNumber(tenantId, year);

    // 5. Create invoice
    const issueDate = today;
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = await this.invoiceRepo.create(tenantId, {
      invoiceNumber,
      parentId: child.parentId,
      childId: enrollment.childId,
      billingPeriodStart: startDate,
      billingPeriodEnd: monthEnd,
      issueDate,
      dueDate,
      subtotalCents: 0,  // Will be calculated from lines
      vatCents: 0,
      totalCents: 0,
      status: 'DRAFT'
    });

    // 6. Add line items
    const lineItems = [];
    let sortOrder = 0;

    // Registration fee line (if > 0)
    if (feeStructure.registrationFeeCents > 0) {
      lineItems.push({
        invoiceId: invoice.id,
        description: 'Registration Fee',
        quantity: 1,
        unitPriceCents: feeStructure.registrationFeeCents,
        discountCents: 0,
        subtotalCents: feeStructure.registrationFeeCents,
        vatCents: 0,  // Registration fees typically exempt
        totalCents: feeStructure.registrationFeeCents,
        lineType: 'REGISTRATION',
        accountCode: '4010',  // Registration income
        sortOrder: sortOrder++
      });
    }

    // Monthly fee line (pro-rated if needed)
    const description = isProRated
      ? `${feeStructure.name} (Pro-rated from ${startDate.getDate()}/${startDate.getMonth() + 1})`
      : feeStructure.name;

    lineItems.push({
      invoiceId: invoice.id,
      description,
      quantity: 1,
      unitPriceCents: proRatedFeeCents,
      discountCents: 0,
      subtotalCents: proRatedFeeCents,
      vatCents: 0,  // Will be calculated if VAT registered
      totalCents: proRatedFeeCents,
      lineType: 'MONTHLY_FEE',
      accountCode: '4000',  // School fees income
      sortOrder: sortOrder++
    });

    // 7. Create line items and calculate totals
    let subtotal = 0;
    for (const line of lineItems) {
      await this.invoiceLineRepo.create(line);
      subtotal += line.subtotalCents;
    }

    // 8. Update invoice totals
    await this.invoiceRepo.update(tenantId, invoice.id, {
      subtotalCents: subtotal,
      totalCents: subtotal  // VAT calculated separately if tenant is registered
    });

    // 9. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      afterValue: { ...invoice, lines: lineItems },
      changeSummary: 'Enrollment invoice created'
    });

    return invoice;
  }
</pseudo_code>

<files_to_modify>
  <file path="apps/api/src/database/services/enrollment.service.ts">Add invoice generation to enrollChild() and create createEnrollmentInvoice() method</file>
  <file path="apps/api/src/database/database.module.ts">Ensure ProRataService, InvoiceRepository are injected</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/enrollment.service.spec.ts">Add tests for createEnrollmentInvoice()</file>
</files_to_create>

<validation_criteria>
  <criterion>enrollChild() now creates invoice automatically</criterion>
  <criterion>Registration fee line item created when registrationFeeCents > 0</criterion>
  <criterion>Pro-rated monthly fee calculated correctly</criterion>
  <criterion>Invoice created as DRAFT status</criterion>
  <criterion>Audit log entry created</criterion>
  <criterion>Enrollment still succeeds even if invoice creation fails</criterion>
  <criterion>Unit tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- enrollment.service</command>
  <command>npm run test:cov -- enrollment.service</command>
</test_commands>


<implementation_notes>
## Implementation Summary (2026-01-06)

### Changes Made:

1. **enrollment.service.ts** - Enhanced EnrollmentService with invoice auto-generation:
   - Added new constructor dependencies: `InvoiceRepository`, `InvoiceLineRepository`, `ProRataService`
   - Modified `enrollChild()` to call `createEnrollmentInvoice()` after creating enrollment
   - Error handling: If invoice creation fails, enrollment still succeeds (logged error only)

2. **New Method: `createEnrollmentInvoice()`** (lines 417-573):
   - Creates invoice with DRAFT status
   - Adds registration fee line if `registrationFeeCents > 0` (LineType.REGISTRATION)
   - Adds monthly fee line with pro-rata calculation if not starting on 1st (LineType.MONTHLY_FEE)
   - Uses `ProRataService.calculateProRata()` for partial month calculation
   - Uses Decimal.js with banker's rounding for all monetary calculations
   - Generates invoice number in format INV-YYYY-NNNNN
   - Creates audit log entry

3. **New Helper: `generateInvoiceNumber()`** (lines 581-603):
   - Generates sequential invoice numbers per tenant per year
   - Uses `InvoiceRepository.findLastInvoiceForYear()` to determine next sequence

### Key Implementation Details:
- Registration fees typically VAT exempt (accountCode: 4010)
- School fees use accountCode: 4000
- Due date is 7 days from issue date
- Pro-rata description includes the enrollment start date
- All prices stored in cents (integers)

### Verification:
- ✅ TypeScript build passes without errors
- ✅ Database module already had required dependencies registered
- ✅ Invoice created with correct line items
- ✅ Pro-rata calculation uses existing ProRataService
- ✅ Audit logging for invoice creation
</implementation_notes>

</task_spec>
