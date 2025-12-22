<task_spec id="TASK-WEB-018" version="1.0">

<metadata>
  <title>Parent and Child Management Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>18</sequence>
  <implements>
    <requirement_ref>REQ-WEB-10</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
    <task_ref>TASK-WEB-008</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create parent and child enrollment management components including forms, lists, and enrollment status management.
</context>

<input_context_files>
  <file purpose="form_components">apps/web/src/components/forms/</file>
  <file purpose="billing_types">packages/types/src/billing.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
  <check>TASK-WEB-008 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Parent list and search
    - Parent form (add/edit)
    - Child list under parent
    - Child form with fee structure selection
    - Enrollment status management
    - Pro-rata calculation display
  </in_scope>
  <out_of_scope>
    - Parents page layout (TASK-WEB-037)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/parents/parent-form.tsx">
      export function ParentForm({ parent, onSave }: ParentFormProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/parents/child-form.tsx">
      export function ChildForm({ child, onSave }: ChildFormProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must validate SA phone numbers
    - Must show pro-rata calculation for mid-month enrollments
    - Must track communication preference
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/parents/parent-table.tsx">Parent list</file>
  <file path="apps/web/src/components/parents/parent-form.tsx">Parent form</file>
  <file path="apps/web/src/components/parents/parent-detail.tsx">Parent detail view</file>
  <file path="apps/web/src/components/parents/children-list.tsx">Children under parent</file>
  <file path="apps/web/src/components/parents/child-form.tsx">Child form</file>
  <file path="apps/web/src/components/parents/fee-structure-select.tsx">Fee structure selector</file>
  <file path="apps/web/src/components/parents/enrollment-status.tsx">Status badge/actions</file>
  <file path="apps/web/src/components/parents/prorata-display.tsx">Pro-rata calculation</file>
  <file path="apps/web/src/components/parents/index.ts">Parent exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Parent form saves correctly</criterion>
  <criterion>Child form calculates fees</criterion>
  <criterion>Enrollment status updates</criterion>
</validation_criteria>

</task_spec>
