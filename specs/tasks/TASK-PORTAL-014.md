<task_spec id="TASK-PORTAL-014" version="1.0">

<metadata>
  <title>Parent Portal Statements Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>303</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-04</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-011</task_ref>
    <task_ref>TASK-BILL-035</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the parent portal statements page where parents can view and download their account statements. Statements provide a consolidated view of all transactions (invoices, payments, credits) over a period.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(parent-portal)/layout.tsx</file>
  <file purpose="statement_controller">apps/api/src/api/billing/statement.controller.ts</file>
  <file purpose="statement_service">apps/api/src/database/services/statement.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-011 completed (parent auth and layout)</check>
  <check>TASK-BILL-035 completed (statement service)</check>
</prerequisites>

<scope>
  <in_scope>
    - Statements list page
    - Month selector for statement period
    - Statement preview display
    - PDF download functionality
    - Transaction breakdown (invoices, payments, credits)
    - Running balance display
    - Opening/closing balance
    - Statement generation on-demand
    - Email statement to self
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/statements/page.tsx">
      export default function ParentStatementsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/statements/page.tsx">Statements page</file>
  <file path="apps/web/src/components/parent-portal/statement-list.tsx">Statement list component</file>
  <file path="apps/web/src/components/parent-portal/statement-preview.tsx">Statement preview</file>
  <file path="apps/web/src/components/parent-portal/transaction-table.tsx">Transaction breakdown</file>
  <file path="apps/web/src/components/parent-portal/month-picker.tsx">Month selector</file>
  <file path="apps/web/src/hooks/parent-portal/use-parent-statements.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/parent-portal/statements">
    <description>Get statements for authenticated parent</description>
    <query_params>year (optional, defaults to current)</query_params>
    <response>List of available statements by month</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/statements/:year/:month">
    <description>Get specific statement with transactions</description>
    <response>Statement with opening/closing balance and transactions</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/statements/:year/:month/pdf">
    <description>Download statement PDF</description>
    <response>PDF file stream</response>
  </endpoint>
  <endpoint method="POST" path="/api/parent-portal/statements/:year/:month/email">
    <description>Email statement to parent</description>
    <response>Success confirmation</response>
  </endpoint>
</api_endpoints>

<validation_criteria>
  <criterion>Statement list shows available months</criterion>
  <criterion>Statement preview shows transactions</criterion>
  <criterion>Opening/closing balance calculated correctly</criterion>
  <criterion>PDF download works</criterion>
  <criterion>Email statement sends successfully</criterion>
  <criterion>Current month generates on-demand</criterion>
</validation_criteria>

</task_spec>
