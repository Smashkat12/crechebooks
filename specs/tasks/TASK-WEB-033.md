<task_spec id="TASK-WEB-033" version="1.0">

<metadata>
  <title>Invoices Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>33</sequence>
  <implements>
    <requirement_ref>REQ-WEB-05</requirement_ref>
    <requirement_ref>REQ-WEB-06</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the invoices page with list view, generation wizard, and send functionality.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="invoice_components">apps/web/src/components/invoices/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-012 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Invoices page route
    - Invoice list with status filters
    - Generate invoices action
    - Invoice detail view
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/invoices/page.tsx">
      export default function InvoicesPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/invoices/page.tsx">Invoices list page</file>
  <file path="apps/web/src/app/(dashboard)/invoices/[id]/page.tsx">Invoice detail page</file>
  <file path="apps/web/src/app/(dashboard)/invoices/generate/page.tsx">Generate invoices page</file>
  <file path="apps/web/src/app/(dashboard)/invoices/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Invoice list renders with status badges</criterion>
  <criterion>Generate wizard works</criterion>
  <criterion>Invoice detail shows line items</criterion>
</validation_criteria>

</task_spec>
