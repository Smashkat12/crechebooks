<task_spec id="TASK-BILL-017" version="1.0">

<metadata>
  <title>Ad-Hoc Charges in Monthly Invoice Generation</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>108</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-BILL-011</requirement_ref>
    <critical_issue_ref>HIGH-004</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-012</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use billing logic and integration thinking.
This task involves:
1. Including pending ad-hoc charges in monthly generation
2. Marking ad-hoc charges as invoiced
3. Supporting partial month charges
4. Preventing double-billing
5. Audit trail for ad-hoc inclusion
</reasoning_mode>

<context>
ISSUE: Ad-hoc charges (field trips, late fees, materials) are not included when monthly invoices are automatically generated. Staff must manually add them after generation.

REQ-BILL-011 specifies: "Ad-hoc charges can be added and included in invoices."

This task ensures ad-hoc charges are automatically included during monthly generation.
</context>

<current_state>
## Codebase State
- InvoiceGenerationService exists (TASK-BILL-012)
- AdHocCharge entity exists in schema
- generateMonthlyInvoices() does NOT query ad-hoc charges

## What's Missing
- Query for pending ad-hoc charges
- Include as invoice line items
- Mark as invoiced to prevent duplication
</current_state>

<input_context_files>
  <file purpose="invoice_service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<scope>
  <in_scope>
    - Query pending ad-hoc charges for child during generation
    - Add as InvoiceLine items with type AD_HOC
    - Mark AdHocCharge as invoiced with invoice reference
    - Support charges for partial months
    - Prevent double-billing with invoicedAt check
  </in_scope>
  <out_of_scope>
    - Ad-hoc charge creation UI (exists)
    - Ad-hoc charge types management
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/invoice-generation.service.ts">
      // Add to existing service
      private async getAdHocCharges(tenantId: string, childId: string, billingMonth: string): Promise<AdHocCharge[]>;
      private async markChargesInvoiced(chargeIds: string[], invoiceId: string): Promise<void>;
    </signature>
  </signatures>

  <constraints>
    - Only uninvoiced charges included
    - Charges dated within billing month
    - Each charge linked to resulting invoice
    - No charges lost if generation fails
  </constraints>

  <verification>
    - Ad-hoc charges appear on monthly invoice
    - Charges marked as invoiced
    - No duplicate charges possible
    - Partial month charges work
    - Tests pass
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">Add ad-hoc charge inclusion</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/__tests__/invoice-adhoc.service.spec.ts">Tests for ad-hoc inclusion</file>
</files_to_create>

<validation_criteria>
  <criterion>Ad-hoc charges included in monthly invoice</criterion>
  <criterion>Charges marked as invoiced</criterion>
  <criterion>No double-billing possible</criterion>
  <criterion>Partial month charges work</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="invoice-adhoc" --verbose</command>
</test_commands>

</task_spec>
