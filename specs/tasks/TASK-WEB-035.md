<task_spec id="TASK-WEB-035" version="1.0">

<metadata>
  <title>SARS Compliance Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>35</sequence>
  <implements>
    <requirement_ref>REQ-WEB-09</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the SARS compliance page for VAT201 and EMP201 preparation and export.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="sars_components">apps/web/src/components/sars/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-015 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - SARS page with tabs (VAT201, EMP201)
    - Period selection
    - Preview and export
    - Submission history
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/sars/page.tsx">
      export default function SarsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/sars/page.tsx">SARS page</file>
  <file path="apps/web/src/app/(dashboard)/sars/vat201/page.tsx">VAT201 page</file>
  <file path="apps/web/src/app/(dashboard)/sars/emp201/page.tsx">EMP201 page</file>
  <file path="apps/web/src/app/(dashboard)/sars/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>VAT201 preview shows values</criterion>
  <criterion>EMP201 shows payroll data</criterion>
  <criterion>Export downloads file</criterion>
</validation_criteria>

</task_spec>
