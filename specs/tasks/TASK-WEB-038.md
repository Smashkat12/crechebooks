<task_spec id="TASK-WEB-038" version="1.0">

<metadata>
  <title>Staff and Payroll Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>38</sequence>
  <implements>
    <requirement_ref>REQ-WEB-11</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-019</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create staff management and payroll processing pages.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="staff_components">apps/web/src/components/staff/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-019 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Staff list page
    - Staff detail/edit page
    - Payroll processing page
    - Payroll history
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/staff/page.tsx">
      export default function StaffPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/staff/page.tsx">Staff list page</file>
  <file path="apps/web/src/app/(dashboard)/staff/[id]/page.tsx">Staff detail page</file>
  <file path="apps/web/src/app/(dashboard)/staff/new/page.tsx">Add staff page</file>
  <file path="apps/web/src/app/(dashboard)/payroll/page.tsx">Payroll processing page</file>
  <file path="apps/web/src/app/(dashboard)/staff/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Staff list renders</criterion>
  <criterion>Payroll wizard calculates correctly</criterion>
</validation_criteria>

</task_spec>
