<task_spec id="TASK-BILL-036" version="1.0">

<metadata>
  <title>Auto Pro-rata Integration in Invoice Generation</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>141</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-BILL-003</requirement_ref>
    <gap_ref>GAP-002</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-012</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-014</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use calculation-focused thinking with enrollment awareness.
This task involves:
1. Detecting mid-month enrollment starts
2. Detecting mid-month withdrawals
3. Auto-applying ProRataService during invoice generation
4. Line item description clarity for pro-rata charges
</reasoning_mode>

<context>
GAP-002: ProRataService exists (TASK-BILL-014) but InvoiceGenerationService uses full monthly fees without checking for mid-month enrollment/withdrawal dates.

REQ-BILL-003 specifies: "Pro-rata calculation for mid-month enrollment changes."

This task integrates ProRataService into InvoiceGenerationService so pro-rata is automatically applied when:
- Child enrolled after the 1st of the billing month
- Child withdraws before the last day of the billing month
</context>

<current_state>
## Codebase State
- ProRataService exists: `apps/api/src/database/services/pro-rata.service.ts`
- InvoiceGenerationService exists: `apps/api/src/database/services/invoice-generation.service.ts`
- Full monthly fee used at line 209-224 of invoice-generation.service.ts
- No automatic pro-rata detection

## What Exists
- calculateProRata() method in ProRataService
- handleMidMonthEnrollment() and handleMidMonthWithdrawal()
- Enrollment entity with startDate and endDate

## What's Missing
- Integration of ProRataService into invoice generation
- Auto-detection of mid-month scenarios
- Pro-rata line item descriptions
</current_state>

<input_context_files>
  <file purpose="invoice_service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="pro_rata_service">apps/api/src/database/services/pro-rata.service.ts</file>
  <file purpose="enrollment_entity">apps/api/src/database/entities/enrollment.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Inject ProRataService into InvoiceGenerationService
    - Detect mid-month enrollment start dates
    - Detect mid-month withdrawal dates
    - Apply pro-rata calculation to monthly fee line
    - Update line item description to show pro-rata details
  </in_scope>
  <out_of_scope>
    - Changing ProRataService calculation logic
    - UI changes for pro-rata display
    - Retroactive pro-rata adjustments
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/invoice-generation.service.ts">
      // Add to constructor
      private readonly proRataService: ProRataService,

      // New private method
      private async calculateMonthlyFeeWithProRata(
        enrollment: EnrollmentWithRelations,
        billingPeriodStart: Date,
        billingPeriodEnd: Date,
        tenantId: string,
      ): Promise&lt;{ amountCents: number; description: string; isProRata: boolean }&gt;;
    </signature>
  </signatures>

  <constraints>
    - Only apply pro-rata for enrollment start/end within billing period
    - Use Decimal.js for all calculations (banker's rounding)
    - Description must show dates: "Monthly Fee (Pro-rata: 15 Jan - 31 Jan)"
    - Preserve existing sibling discount logic
    - Maintain Xero sync compatibility
  </constraints>

  <verification>
    - Mid-month enrollments auto-calculate pro-rata
    - Mid-month withdrawals auto-calculate pro-rata
    - Full-month enrollments unchanged (no pro-rata)
    - Line item descriptions show pro-rata period
    - Sibling discounts still apply correctly
    - Tests pass
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">Integrate ProRataService</file>
  <file path="apps/api/src/database/services/__tests__/invoice-generation.service.spec.ts">Add pro-rata tests</file>
</files_to_modify>

<validation_criteria>
  <criterion>ProRataService injected into InvoiceGenerationService</criterion>
  <criterion>Mid-month enrollment start triggers pro-rata</criterion>
  <criterion>Mid-month withdrawal triggers pro-rata</criterion>
  <criterion>Line descriptions include pro-rata period</criterion>
  <criterion>Existing tests still pass</criterion>
  <criterion>New pro-rata integration tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="invoice-generation" --verbose</command>
</test_commands>

</task_spec>
