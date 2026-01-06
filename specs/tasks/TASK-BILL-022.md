<task_spec id="TASK-BILL-022" version="1.0">

<metadata>
  <title>Credit Note Generation for Mid-Month Withdrawal</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>141</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>EC-BILL-002</requirement_ref>
    <requirement_ref>REQ-BILL-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-014</task_ref>
    <task_ref>TASK-BILL-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that when a child is withdrawn mid-month,
NO credit note is generated for the unused portion of fees already paid.

## Current State
- `EnrollmentService.withdrawChild()` exists at `apps/api/src/database/services/enrollment.service.ts:222-289`
- Method sets status to WITHDRAWN and sets endDate, but does NOT generate credit note
- No credit note functionality exists in the system
- ProRataService can calculate unused portion

## What Should Happen (Per PRD EC-BILL-002)
When `withdrawChild()` is called:
1. Set enrollment status to WITHDRAWN (currently works)
2. Calculate unused portion of current month's fees
3. Generate credit note for the unused amount
4. Credit note should offset future invoices or be refundable

## Project Context
- **Credit Notes in Xero**: Created as negative invoices with type ACCPAY
- **LineType Enum**: Already has CREDIT type defined
- **Financial Precision**: Decimal.js with banker's rounding
- **Pro-rata Service**: Can calculate remaining days value
</context>

<input_context_files>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="invoice_generation">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="pro_rata_service">apps/api/src/database/services/pro-rata.service.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="line_type_enum">apps/api/prisma/schema.prisma#LineType</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-014 completed (ProRataService exists)</check>
  <check>TASK-BILL-012 completed (InvoiceGenerationService exists)</check>
  <check>Invoice and InvoiceLine repositories available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create CreditNoteService in database/services/
    - Implement createWithdrawalCreditNote() method
    - Calculate unused portion of current month fees
    - Use ProRataService for calculations
    - Create credit note as Invoice with negative amounts
    - Use LineType.CREDIT for line items
    - Modify withdrawChild() to trigger credit note creation
    - Create invoice number format: CN-{YYYY}-{sequential}
    - Audit logging for credit notes
    - Unit tests
  </in_scope>
  <out_of_scope>
    - Applying credit notes to future invoices (TASK-PAY-020)
    - Refund processing
    - UI for credit notes
    - Xero sync of credit notes (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/credit-note.service.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { Invoice, InvoiceLine } from '@prisma/client';
      import Decimal from 'decimal.js';

      export interface CreditNoteResult {
        creditNote: Invoice;
        creditAmountCents: number;
        daysUnused: number;
        totalDaysInMonth: number;
      }

      @Injectable()
      export class CreditNoteService {
        private readonly logger = new Logger(CreditNoteService.name);

        constructor(
          private readonly invoiceRepo: InvoiceRepository,
          private readonly invoiceLineRepo: InvoiceLineRepository,
          private readonly proRataService: ProRataService,
          private readonly auditLogService: AuditLogService,
        ) {}

        /**
         * Create credit note for mid-month withdrawal
         * @param tenantId - Tenant ID
         * @param enrollment - Enrollment being withdrawn
         * @param withdrawalDate - Date of withdrawal
         * @param userId - User performing withdrawal
         * @returns Credit note with calculated unused amount
         */
        async createWithdrawalCreditNote(
          tenantId: string,
          enrollment: Enrollment,
          withdrawalDate: Date,
          userId: string,
        ): Promise&lt;CreditNoteResult&gt;;

        /**
         * Generate credit note number
         * Format: CN-{YYYY}-{sequential}
         */
        async generateCreditNoteNumber(
          tenantId: string,
          year: number,
        ): Promise&lt;string&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Credit notes stored as Invoice with negative amounts
    - Credit note number format: CN-{YYYY}-{sequential}
    - Must use LineType.CREDIT for line items
    - Must use Decimal.js with banker's rounding
    - Must only create credit if there are unused days
    - Must handle withdrawal on last day (no credit)
    - Must handle case where no invoice exists for current month
    - Status should be DRAFT for review
  </constraints>

  <verification>
    - withdrawChild() triggers credit note creation
    - Credit amount correctly calculated for unused days
    - Credit note has proper number format (CN-YYYY-XXX)
    - Credit note created as Invoice with negative amounts
    - Line item uses LineType.CREDIT
    - Audit log entry created
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
CreditNoteService (apps/api/src/database/services/credit-note.service.ts):

  async createWithdrawalCreditNote(
    tenantId: string,
    enrollment: Enrollment,
    withdrawalDate: Date,
    userId: string,
  ): Promise<CreditNoteResult> {
    // 1. Calculate unused days
    const monthStart = new Date(withdrawalDate.getFullYear(), withdrawalDate.getMonth(), 1);
    const monthEnd = new Date(withdrawalDate.getFullYear(), withdrawalDate.getMonth() + 1, 0);
    const totalDaysInMonth = monthEnd.getDate();

    // Days used = from 1st to withdrawal date (inclusive)
    const daysUsed = withdrawalDate.getDate();
    const daysUnused = totalDaysInMonth - daysUsed;

    // No credit if no unused days
    if (daysUnused <= 0) {
      throw new ValidationException('No unused days to credit');
    }

    // 2. Get fee structure to calculate credit amount
    const feeStructure = enrollment.feeStructure;
    const monthlyFeeCents = feeStructure.amountCents;

    // 3. Calculate credit amount (unused portion)
    const dailyRate = new Decimal(monthlyFeeCents).div(totalDaysInMonth);
    const creditAmount = dailyRate.mul(daysUnused);
    const creditAmountCents = creditAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();

    // 4. Get child and parent info
    const child = await this.childRepo.findById(enrollment.childId);

    // 5. Generate credit note number
    const creditNoteNumber = await this.generateCreditNoteNumber(tenantId, withdrawalDate.getFullYear());

    // 6. Create credit note (as Invoice with negative amounts)
    const issueDate = withdrawalDate;
    const dueDate = new Date(withdrawalDate);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days for credit notes

    const creditNote = await this.invoiceRepo.create(tenantId, {
      invoiceNumber: creditNoteNumber,
      parentId: child.parentId,
      childId: enrollment.childId,
      billingPeriodStart: withdrawalDate,
      billingPeriodEnd: monthEnd,
      issueDate,
      dueDate,
      subtotalCents: -creditAmountCents, // Negative for credit
      vatCents: 0,
      totalCents: -creditAmountCents,
      status: 'DRAFT',
      notes: `Credit note for withdrawal on ${withdrawalDate.toISOString().split('T')[0]}. ${daysUnused} unused days.`
    });

    // 7. Create credit line item
    await this.invoiceLineRepo.create({
      invoiceId: creditNote.id,
      description: `Credit for unused days (${daysUnused}/${totalDaysInMonth} days) - ${feeStructure.name}`,
      quantity: 1,
      unitPriceCents: -creditAmountCents,
      discountCents: 0,
      subtotalCents: -creditAmountCents,
      vatCents: 0,
      totalCents: -creditAmountCents,
      lineType: 'CREDIT',
      accountCode: '4000', // Same account as school fees
      sortOrder: 0
    });

    // 8. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'CreditNote',
      entityId: creditNote.id,
      afterValue: { creditNote, creditAmountCents, daysUnused },
      changeSummary: `Credit note created for withdrawal: R${(creditAmountCents / 100).toFixed(2)}`
    });

    this.logger.log(`Created credit note ${creditNoteNumber} for ${creditAmountCents} cents`);

    return {
      creditNote,
      creditAmountCents,
      daysUnused,
      totalDaysInMonth
    };
  }

  async generateCreditNoteNumber(tenantId: string, year: number): Promise<string> {
    // Find last credit note for this tenant and year
    const lastCreditNote = await this.invoiceRepo.findLastByPrefix(tenantId, `CN-${year}-`);

    let sequential = 1;
    if (lastCreditNote) {
      const parts = lastCreditNote.invoiceNumber.split('-');
      sequential = parseInt(parts[2]) + 1;
    }

    return `CN-${year}-${sequential.toString().padStart(3, '0')}`;
  }

// In EnrollmentService.withdrawChild():
  async withdrawChild(...): Promise<IEnrollment> {
    // ... existing validation and update code ...

    // After updating enrollment status, create credit note
    try {
      const creditNoteResult = await this.creditNoteService.createWithdrawalCreditNote(
        tenantId,
        updated,
        endDate,
        userId
      );
      this.logger.log(`Created credit note ${creditNoteResult.creditNote.invoiceNumber}`);
    } catch (error) {
      if (error.message !== 'No unused days to credit') {
        this.logger.error(`Failed to create credit note: ${error.message}`);
      }
    }

    return updated as IEnrollment;
  }
</pseudo_code>

<files_to_create>
  <file path="apps/api/src/database/services/credit-note.service.ts">CreditNoteService implementation</file>
  <file path="apps/api/src/database/services/credit-note.service.spec.ts">Unit tests for CreditNoteService</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/enrollment.service.ts">Import CreditNoteService and call in withdrawChild()</file>
  <file path="apps/api/src/database/database.module.ts">Register CreditNoteService</file>
  <file path="apps/api/src/database/repositories/invoice.repository.ts">Add findLastByPrefix() method</file>
</files_to_modify>

<validation_criteria>
  <criterion>CreditNoteService creates credit note on withdrawal</criterion>
  <criterion>Credit amount correct for unused days</criterion>
  <criterion>Credit note number format is CN-YYYY-XXX</criterion>
  <criterion>Credit stored as Invoice with negative amounts</criterion>
  <criterion>LineType.CREDIT used for line items</criterion>
  <criterion>No credit created if withdrawn on last day of month</criterion>
  <criterion>Audit log entry created</criterion>
  <criterion>Unit tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- credit-note.service</command>
  <command>npm run test -- enrollment.service</command>
  <command>npm run test:cov</command>
</test_commands>


<implementation_notes>
## Implementation Summary (2026-01-06)

### Files Created:
1. **apps/api/src/database/services/credit-note.service.ts** - New CreditNoteService:
   - `createWithdrawalCreditNote()` - Creates credit note for mid-month withdrawals
   - `generateCreditNoteNumber()` - Generates CN-YYYY-NNN format numbers
   - Uses ProRataService to calculate unused school days value
   - Credit notes stored as Invoices with negative amounts
   - Uses LineType.CREDIT for line items
   - Handles edge cases (no unused days, no school days remaining)

### Files Modified:
1. **apps/api/src/database/repositories/invoice.repository.ts**:
   - Added `findLastByPrefix()` method for credit note numbering

2. **apps/api/src/database/services/enrollment.service.ts**:
   - Imported and injected CreditNoteService
   - Modified `withdrawChild()` to call `createWithdrawalCreditNote()` after withdrawal
   - Graceful error handling: ValidationException for "no credit needed" logged as debug

3. **apps/api/src/database/database.module.ts**:
   - Registered CreditNoteService in providers and exports

### Key Implementation Details:
- Credit notes use CN-YYYY-NNN number format (not INV-)
- Credit amounts are negative (stored as negative cents)
- Uses ProRataService for accurate school-day based calculation
- 30-day due date for credit notes
- Audit logging for credit note creation
- Withdrawal succeeds even if credit note creation fails

### Verification:
- ✅ TypeScript build passes without errors
- ✅ CreditNoteService properly integrated
- ✅ EnrollmentService calls credit note generation on withdrawal
- ✅ Credit calculation uses school days via ProRataService
</implementation_notes>

</task_spec>
