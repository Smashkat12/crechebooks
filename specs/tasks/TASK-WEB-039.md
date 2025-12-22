<task_spec id="TASK-WEB-039" version="1.0">

<metadata>
  <title>Reports Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>39</sequence>
  <implements>
    <requirement_ref>REQ-WEB-08</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-020</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the financial reports page with report selection and export functionality.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="report_components">apps/web/src/components/reports/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-020 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Reports page with type selector
    - Date range selection
    - Report rendering
    - Export to PDF/CSV
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/reports/page.tsx">
      export default function ReportsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/reports/page.tsx">Reports page</file>
  <file path="apps/web/src/app/(dashboard)/reports/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Report selector works</criterion>
  <criterion>Reports render with data</criterion>
  <criterion>Export downloads file</criterion>
</validation_criteria>

</task_spec>
