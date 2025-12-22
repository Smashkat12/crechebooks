<task_spec id="TASK-WEB-011" version="1.0">

<metadata>
  <title>Transaction List and Categorization Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>11</sequence>
  <implements>
    <requirement_ref>REQ-WEB-03</requirement_ref>
    <requirement_ref>REQ-WEB-04</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create the transaction list view with DataTable, filtering, and the categorization dialog that shows AI suggestions with confidence scores. Users can approve or override AI categorization.
</context>

<input_context_files>
  <file purpose="data_table">apps/web/src/components/tables/data-table.tsx</file>
  <file purpose="transaction_hooks">apps/web/src/hooks/use-transactions.ts</file>
  <file purpose="transaction_types">packages/types/src/transactions.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Transaction list with columns and table
    - Transaction filter toolbar (date, status, category)
    - Categorization dialog with AI suggestions
    - Category selector with Chart of Accounts
    - Confidence score display
    - Bulk categorization actions
  </in_scope>
  <out_of_scope>
    - Transaction page layout (TASK-WEB-031)
    - Bank import functionality
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/transactions/transaction-table.tsx">
      export function TransactionTable({ data, isLoading, onCategorize }: TransactionTableProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/transactions/categorization-dialog.tsx">
      export function CategorizationDialog({ transaction, onSave, onClose }: CategorizationDialogProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must show confidence score with color coding (green ≥80%, yellow 50-79%, red <50%)
    - Must highlight "Needs Review" transactions
    - Must support keyboard navigation
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/transactions/transaction-table.tsx">Transaction DataTable</file>
  <file path="apps/web/src/components/transactions/transaction-columns.tsx">Column definitions</file>
  <file path="apps/web/src/components/transactions/transaction-filters.tsx">Filter toolbar</file>
  <file path="apps/web/src/components/transactions/categorization-dialog.tsx">AI categorization dialog</file>
  <file path="apps/web/src/components/transactions/category-select.tsx">Category dropdown</file>
  <file path="apps/web/src/components/transactions/confidence-badge.tsx">Confidence score badge</file>
  <file path="apps/web/src/components/transactions/index.ts">Transaction component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Transaction table renders with data</criterion>
  <criterion>Filters update table results</criterion>
  <criterion>Categorization dialog shows AI suggestion</criterion>
  <criterion>Category can be changed and saved</criterion>
</validation_criteria>

</task_spec>
