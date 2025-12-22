<task_spec id="TASK-WEB-032" version="1.0">

<metadata>
  <title>Transactions Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>32</sequence>
  <implements>
    <requirement_ref>REQ-WEB-03</requirement_ref>
    <requirement_ref>REQ-WEB-04</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the transactions page with list view, filtering, and categorization functionality.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="transaction_components">apps/web/src/components/transactions/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-011 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Transactions page route
    - Transaction list with filters
    - Categorization dialog integration
    - URL query params for filters
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/transactions/page.tsx">
      export default function TransactionsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/transactions/page.tsx">Transactions page</file>
  <file path="apps/web/src/app/(dashboard)/transactions/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Transaction list renders</criterion>
  <criterion>Filters update URL and table</criterion>
  <criterion>Categorization dialog opens</criterion>
</validation_criteria>

</task_spec>
