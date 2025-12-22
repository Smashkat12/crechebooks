<task_spec id="TASK-WEB-037" version="1.0">

<metadata>
  <title>Parents and Enrollment Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>REQ-WEB-10</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-018</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create parent management pages for enrollment tracking and family management.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="parent_components">apps/web/src/components/parents/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-018 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Parents list page
    - Parent detail page with children
    - Add/edit parent forms
    - Enrollment management
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/parents/page.tsx">
      export default function ParentsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/parents/page.tsx">Parents list page</file>
  <file path="apps/web/src/app/(dashboard)/parents/[id]/page.tsx">Parent detail page</file>
  <file path="apps/web/src/app/(dashboard)/parents/new/page.tsx">Add parent page</file>
  <file path="apps/web/src/app/(dashboard)/parents/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Parent list renders</criterion>
  <criterion>Parent form saves</criterion>
  <criterion>Children are displayed</criterion>
</validation_criteria>

</task_spec>
