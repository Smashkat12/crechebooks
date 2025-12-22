<task_spec id="TASK-WEB-019" version="1.0">

<metadata>
  <title>Staff and Payroll Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>19</sequence>
  <implements>
    <requirement_ref>REQ-WEB-11</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
    <task_ref>TASK-WEB-008</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create staff management and payroll processing components including staff list, payroll calculations, and approval workflow.
</context>

<input_context_files>
  <file purpose="form_components">apps/web/src/components/forms/</file>
  <file purpose="sars_types">packages/types/src/sars.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
  <check>TASK-WEB-008 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Staff list and management
    - Staff form (add/edit)
    - Payroll processing wizard
    - Payroll breakdown (PAYE, UIF, net)
    - Payroll approval workflow
    - Payslip preview
  </in_scope>
  <out_of_scope>
    - Staff page layout (TASK-WEB-038)
    - IRP5 generation
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/staff/staff-form.tsx">
      export function StaffForm({ staff, onSave }: StaffFormProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/staff/payroll-wizard.tsx">
      export function PayrollWizard({ month, onComplete }: PayrollWizardProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must validate SA ID numbers
    - Must use current SARS tax tables
    - Must show UIF caps
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/staff/staff-table.tsx">Staff list</file>
  <file path="apps/web/src/components/staff/staff-form.tsx">Staff form</file>
  <file path="apps/web/src/components/staff/payroll-wizard.tsx">Payroll processing</file>
  <file path="apps/web/src/components/staff/payroll-breakdown.tsx">Deduction breakdown</file>
  <file path="apps/web/src/components/staff/payslip-preview.tsx">Payslip preview</file>
  <file path="apps/web/src/components/staff/payroll-approval.tsx">Approval actions</file>
  <file path="apps/web/src/components/staff/index.ts">Staff exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Staff form validates ID numbers</criterion>
  <criterion>Payroll calculates PAYE correctly</criterion>
  <criterion>UIF respects max contribution</criterion>
</validation_criteria>

</task_spec>
