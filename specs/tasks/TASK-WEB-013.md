<task_spec id="TASK-WEB-013" version="1.0">

<metadata>
  <title>Payment Matching and Allocation Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>13</sequence>
  <implements>
    <requirement_ref>REQ-WEB-07</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create payment management components including unmatched payment list, AI-suggested matches with confidence, manual matching interface, and allocation tracking.
</context>

<input_context_files>
  <file purpose="data_table">apps/web/src/components/tables/data-table.tsx</file>
  <file purpose="payment_hooks">apps/web/src/hooks/use-payments.ts</file>
  <file purpose="payment_types">packages/types/src/payments.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Unmatched payments list
    - AI match suggestions with confidence
    - Manual invoice search and selection
    - Payment allocation dialog
    - Partial payment handling
    - Match history display
  </in_scope>
  <out_of_scope>
    - Payment page layout (TASK-WEB-033)
    - Bank import
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/payments/payment-table.tsx">
      export function PaymentTable({ data, isLoading, onMatch }: PaymentTableProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/payments/match-payment-dialog.tsx">
      export function MatchPaymentDialog({ payment, suggestions, onMatch }: MatchPaymentDialogProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must show match confidence with reasoning
    - Must support partial allocation
    - Must warn on overpayment
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/payments/payment-table.tsx">Payment DataTable</file>
  <file path="apps/web/src/components/payments/payment-columns.tsx">Column definitions</file>
  <file path="apps/web/src/components/payments/payment-filters.tsx">Filter toolbar</file>
  <file path="apps/web/src/components/payments/match-payment-dialog.tsx">Match dialog</file>
  <file path="apps/web/src/components/payments/invoice-search.tsx">Invoice search</file>
  <file path="apps/web/src/components/payments/allocation-form.tsx">Allocation form</file>
  <file path="apps/web/src/components/payments/match-suggestions.tsx">AI suggestions list</file>
  <file path="apps/web/src/components/payments/index.ts">Payment component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Payment table shows unmatched payments</criterion>
  <criterion>Match dialog shows AI suggestions</criterion>
  <criterion>Manual search finds invoices</criterion>
  <criterion>Allocation updates payment status</criterion>
</validation_criteria>

</task_spec>
