<task_spec id="TASK-WEB-034" version="1.0">

<metadata>
  <title>Payments and Arrears Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>34</sequence>
  <implements>
    <requirement_ref>REQ-WEB-07</requirement_ref>
    <requirement_ref>REQ-WEB-08</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-013</task_ref>
    <task_ref>TASK-WEB-014</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the payments page for matching and the arrears page for tracking outstanding balances.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="payment_components">apps/web/src/components/payments/</file>
  <file purpose="arrears_components">apps/web/src/components/arrears/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-013 completed</check>
  <check>TASK-WEB-014 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Payments page with unmatched list
    - Payment matching interface
    - Arrears page with aging
    - Parent detail sheet
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/payments/page.tsx">
      export default function PaymentsPage()
    </signature>
    <signature file="apps/web/src/app/(dashboard)/arrears/page.tsx">
      export default function ArrearsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/payments/page.tsx">Payments page</file>
  <file path="apps/web/src/app/(dashboard)/payments/loading.tsx">Loading skeleton</file>
  <file path="apps/web/src/app/(dashboard)/arrears/page.tsx">Arrears page</file>
  <file path="apps/web/src/app/(dashboard)/arrears/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Payments list shows unmatched</criterion>
  <criterion>Match dialog works</criterion>
  <criterion>Arrears shows aging bands</criterion>
</validation_criteria>

</task_spec>
