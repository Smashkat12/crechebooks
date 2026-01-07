<task_spec id="TASK-BILL-037" version="1.0">

<metadata>
  <title>January Re-Registration Fee for Continuing Students</title>
  <status>complete</status>
  <started_date>2026-01-07</started_date>
  <completed_date>2026-01-07</completed_date>
  <layer>logic</layer>
  <sequence>175</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>EC-BILL-003</requirement_ref>
    <requirement_ref>REQ-BILL-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-012</task_ref>
    <task_ref>TASK-BILL-024</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <supersedes>TASK-BILL-024 (Corrects misunderstanding)</supersedes>
</metadata>

<context>
## IMPORTANT: Correction of Previous Misunderstanding

TASK-BILL-024 was implemented with an INCORRECT understanding:
- ❌ WRONG: Re-registration fee for students returning after WITHDRAWN/GRADUATED
- ✅ CORRECT: Re-registration fee for CONTINUING students at year start (January)

## Correct Business Requirement

At the start of each academic year (January in South Africa):
- **Continuing Students**: Children who were ACTIVE on December 31st and continue to be ACTIVE in January
- **Fee**: Charged R300 re-registration fee on their January invoice
- **Purpose**: Annual administrative fee for returning children

This is NOT about children who left and came back. It's about children who NEVER LEFT.

## Detection Logic

A child is eligible for re-registration fee if:
1. Billing month is January (YYYY-01)
2. Child had an ACTIVE enrollment on December 31st of the previous year
3. Child has an ACTIVE enrollment in the current January

Example:
- Child enrolled since 2024-03-01, still ACTIVE in 2026-01
- January 2026 invoice includes: R300 re-registration + R1,800 monthly fee

## Current State (INCORRECT)
- `isReturningStudent()` checks for WITHDRAWN/GRADUATED status (WRONG)
- This logic is applied during `createEnrollmentInvoice()` for new enrollments
- Should instead be applied during `generateMonthlyInvoices()` for January

## Required Changes
1. Rename `isReturningStudent()` to `wasEnrolledPreviousYear()` with corrected logic
2. Modify `generateMonthlyInvoices()` to add re-registration line for January
3. Remove incorrect logic from `createEnrollmentInvoice()`

## Project Context
- **Framework**: NestJS with Prisma ORM
- **Database**: PostgreSQL
- **South African School Year**: January - December
- **Invoice Generation**: 1st of each month at 06:00 SAST
</context>

<input_context_files>
  <file purpose="invoice_generation_service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="enrollment_repository">apps/api/src/database/repositories/enrollment.repository.ts</file>
  <file purpose="fee_structure_entity">apps/api/src/database/entities/fee-structure.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-012 completed (monthly invoice generation works)</check>
  <check>TASK-BILL-024 completed (reRegistrationFeeCents field exists)</check>
  <check>EnrollmentRepository can query by date</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `wasActiveOnDate()` method to EnrollmentService
    - Add `isEligibleForReRegistration()` method to check January eligibility
    - Modify `generateMonthlyInvoices()` to add re-registration line for January
    - Remove incorrect `isReturningStudent()` logic from `createEnrollmentInvoice()`
    - Add unit tests for re-registration logic
  </in_scope>
  <out_of_scope>
    - Changing the reRegistrationFeeCents field (already exists)
    - Year-end processing workflows
    - Off-boarding workflows
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      /**
       * Check if child had an ACTIVE enrollment on a specific date
       */
      async wasActiveOnDate(
        tenantId: string,
        childId: string,
        date: Date,
      ): Promise&lt;boolean&gt;
    </signature>
    <signature file="apps/api/src/database/services/invoice-generation.service.ts">
      /**
       * Check if child is eligible for re-registration fee in billing month
       * - Only applies to January
       * - Child must have been ACTIVE on Dec 31 of previous year
       */
      private async isEligibleForReRegistration(
        tenantId: string,
        childId: string,
        billingMonth: string,
      ): Promise&lt;boolean&gt;
    </signature>
  </signatures>

  <constraints>
    - Re-registration fee ONLY added for January invoices
    - ONLY for children who were ACTIVE on December 31st of previous year
    - Must NOT duplicate if already charged (idempotent)
    - Fee comes from FeeStructure.reRegistrationFeeCents (R300 = 30000 cents)
    - Line type: REGISTRATION (VAT exempt)
    - Description: "Annual Re-Registration Fee"
  </constraints>

  <verification>
    - TypeScript compiles without errors: npm run build
    - January invoice includes re-registration fee for continuing student
    - February invoice does NOT include re-registration fee
    - New enrollment in January does NOT get re-registration (no Dec 31 enrollment)
    - Student who withdrew in November and re-enrolled in January does NOT get re-registration
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Fix Enrollment Service

1. Add `wasActiveOnDate()` method to `enrollment.service.ts`:
   ```typescript
   /**
    * Check if child had an ACTIVE enrollment on a specific date
    * TASK-BILL-037: Corrected re-registration logic
    */
   async wasActiveOnDate(
     tenantId: string,
     childId: string,
     date: Date,
   ): Promise<boolean> {
     const enrollments = await this.enrollmentRepo.findByChild(tenantId, childId);

     return enrollments.some((e) => {
       if (e.status !== EnrollmentStatus.ACTIVE &&
           e.status !== EnrollmentStatus.GRADUATED &&
           e.status !== EnrollmentStatus.WITHDRAWN) {
         // Only consider completed/active enrollments
         return false;
       }

       const startDate = new Date(e.startDate);
       startDate.setHours(0, 0, 0, 0);

       const targetDate = new Date(date);
       targetDate.setHours(0, 0, 0, 0);

       // If enrollment started after target date, not active on that date
       if (startDate > targetDate) {
         return false;
       }

       // If enrollment has ended, check if end date is after target date
       if (e.endDate) {
         const endDate = new Date(e.endDate);
         endDate.setHours(23, 59, 59, 999);
         if (endDate < targetDate) {
           return false;
         }
       }

       // For ACTIVE enrollments, status must be ACTIVE
       // For historical check, GRADUATED/WITHDRAWN enrollments count if date was within range
       return true;
     });
   }
   ```

2. Remove or deprecate incorrect `isReturningStudent()` method:
   - Add @deprecated comment
   - Remove usage from createEnrollmentInvoice()

## Phase 2: Update Invoice Generation

3. Add `isEligibleForReRegistration()` to `invoice-generation.service.ts`:
   ```typescript
   /**
    * TASK-BILL-037: Check if child is eligible for January re-registration fee
    */
   private async isEligibleForReRegistration(
     tenantId: string,
     childId: string,
     billingMonth: string,
   ): Promise<boolean> {
     // Only applies to January
     if (!billingMonth.endsWith('-01')) {
       return false;
     }

     // Get previous year's December 31st
     const year = parseInt(billingMonth.substring(0, 4));
     const previousDecember31 = new Date(year - 1, 11, 31);

     // Check if child was active on that date
     return this.enrollmentService.wasActiveOnDate(
       tenantId,
       childId,
       previousDecember31,
     );
   }
   ```

4. Update `generateMonthlyInvoices()` to add re-registration line:
   - After building monthly fee line items
   - Before applying sibling discount
   - Check `isEligibleForReRegistration()`
   - Add line item if eligible:
     ```typescript
     {
       description: 'Annual Re-Registration Fee',
       quantity: new Decimal(1),
       unitPriceCents: feeStructure.reRegistrationFeeCents,
       discountCents: 0,
       lineType: LineType.REGISTRATION,
       accountCode: '4010', // Registration income
     }
     ```

## Phase 3: Fix Enrollment Invoice

5. Update `createEnrollmentInvoice()` in `enrollment.service.ts`:
   - Remove the `isReturningStudent()` call
   - Always use `registrationFeeCents` for new enrollments
   - Comment: "Re-registration is handled in monthly invoice generation for January"

## Phase 4: Verification

6. Build and test:
   ```bash
   npm run build
   npm run test -- invoice-generation
   npm run test -- enrollment
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/src/database/services/enrollment.service.ts">Add wasActiveOnDate(), deprecate isReturningStudent()</file>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">Add isEligibleForReRegistration() and update generateMonthlyInvoices()</file>
</files_to_modify>

<validation_criteria>
  <criterion>wasActiveOnDate() correctly detects enrollment status on a given date</criterion>
  <criterion>January invoice for continuing student includes re-registration fee</criterion>
  <criterion>January invoice for new student does NOT include re-registration fee</criterion>
  <criterion>February invoice never includes re-registration fee</criterion>
  <criterion>createEnrollmentInvoice() always uses registrationFeeCents</criterion>
  <criterion>TypeScript compiles without errors</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- invoice-generation</command>
  <command>npm run test -- enrollment</command>
</test_commands>

<test_scenarios>
## Scenario 1: Continuing Student (Should Get Re-Registration)
- Child enrolled 2024-03-01, still ACTIVE
- January 2026 invoice generated
- EXPECTED: Invoice includes "Annual Re-Registration Fee" R300 + Monthly Fee

## Scenario 2: New January Enrollment (No Re-Registration)
- Child enrolled 2026-01-15 (first enrollment ever)
- January 2026 invoice generated
- EXPECTED: Invoice includes Registration Fee R500 + Pro-rated Monthly Fee (NOT re-registration)

## Scenario 3: February Invoice (No Re-Registration)
- Child enrolled since 2024, continuing in 2026
- February 2026 invoice generated
- EXPECTED: Invoice includes Monthly Fee ONLY (no re-registration)

## Scenario 4: Student Withdrew and Re-Enrolled (Edge Case)
- Child enrolled 2024-03-01, WITHDRAWN 2025-11-30
- Child re-enrolled 2026-01-10
- January 2026 invoice generated
- EXPECTED: New enrollment invoice with Registration Fee R500 (NOT re-registration)
  - Child was NOT active on 2025-12-31 (was WITHDRAWN)
</test_scenarios>

<implementation_notes>
## Implementation Summary (2026-01-07)

### CRITICAL: Corrects TASK-BILL-024 Misunderstanding

The original TASK-BILL-024 implementation was based on an **incorrect understanding**:
- ❌ WRONG: Re-registration fee for students returning after WITHDRAWN/GRADUATED
- ✅ CORRECT: Re-registration fee for CONTINUING students at year start (January)

### Changes Made:

1. **EnrollmentService** (`apps/api/src/database/services/enrollment.service.ts`):
   - Added `wasActiveOnDate(tenantId, childId, date)` method
   - Checks if child had an active enrollment on a specific date
   - Used to verify child was enrolled on December 31st of previous year
   - Deprecated `isReturningStudent()` with warning (kept for backwards compatibility)

2. **InvoiceGenerationService** (`apps/api/src/database/services/invoice-generation.service.ts`):
   - Added private `isEligibleForReRegistration(tenantId, childId, billingMonth)` method
   - Only returns true for January invoices AND child active on Dec 31 previous year
   - Updated `generateMonthlyInvoices()` to add re-registration line item for eligible children
   - Updated `getActiveEnrollmentsWithRelations()` query to include `reRegistrationFeeCents`

3. **Invoice Generation DTO** (`apps/api/src/database/dto/invoice-generation.dto.ts`):
   - Added `reRegistrationFeeCents` to `EnrollmentWithRelations.feeStructure` interface

### Business Logic Implemented:

**Re-Registration Fee Eligibility:**
1. Billing month must be January (ends with `-01`)
2. Child must have been ACTIVE on December 31st of previous year
3. Fee amount comes from `FeeStructure.reRegistrationFeeCents` (R300 = 30000 cents)

**Invoice Line Item:**
- Description: "Annual Re-Registration Fee"
- Line Type: REGISTRATION (VAT exempt)
- Account Code: 4010 (Registration income)

### What DOES NOT Get Re-Registration Fee:
- New enrollments in January (no Dec 31 enrollment)
- Children who were WITHDRAWN or GRADUATED before Dec 31
- Any month other than January

### Re-Enrollment After Leaving:
Children who were WITHDRAWN or GRADUATED and re-enroll are treated as NEW enrollments:
- They pay the full Registration Fee (R500) via `createEnrollmentInvoice()`
- NOT the re-registration fee

### Verification:
- ✅ TypeScript build passes without errors
- ✅ January invoice generation includes re-registration check
- ✅ Only continuing students (active Dec 31) get the fee
- ✅ Deprecated method warns developers of incorrect usage
</implementation_notes>

</task_spec>
