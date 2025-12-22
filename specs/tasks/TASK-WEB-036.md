<task_spec id="TASK-WEB-036" version="1.0">

<metadata>
  <title>Reconciliation Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>36</sequence>
  <implements>
    <requirement_ref>REQ-WEB-07</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-016</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the bank reconciliation page showing matched transactions and discrepancies.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="recon_components">apps/web/src/components/reconciliation/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-016 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Reconciliation page
    - Bank account selector
    - Period selector
    - Match/unmatch view
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/reconciliation/page.tsx">
      export default function ReconciliationPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/reconciliation/page.tsx">Reconciliation page</file>
  <file path="apps/web/src/app/(dashboard)/reconciliation/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Reconciliation summary displays</criterion>
  <criterion>Discrepancies are highlighted</criterion>
</validation_criteria>

</task_spec>
