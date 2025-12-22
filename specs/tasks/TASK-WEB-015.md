<task_spec id="TASK-WEB-015" version="1.0">

<metadata>
  <title>SARS Submission Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>15</sequence>
  <implements>
    <requirement_ref>REQ-WEB-09</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create SARS compliance components for VAT201 and EMP201 preparation, review, and export. Shows calculated values with detailed breakdowns for verification before submission.
</context>

<input_context_files>
  <file purpose="sars_hooks">apps/web/src/hooks/use-sars.ts</file>
  <file purpose="sars_types">packages/types/src/sars.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - VAT201 preview with field breakdown
    - EMP201 preview with employee list
    - Period selector
    - Validation warnings
    - Export to file functionality
    - Submission history
  </in_scope>
  <out_of_scope>
    - SARS page layout (TASK-WEB-035)
    - Direct eFiling integration
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/sars/vat201-preview.tsx">
      export function VAT201Preview({ data, period }: VAT201PreviewProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/sars/emp201-preview.tsx">
      export function EMP201Preview({ data, period }: EMP201PreviewProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must match official SARS form layouts
    - Must show validation warnings
    - Must require human approval before export
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/sars/vat201-preview.tsx">VAT201 form preview</file>
  <file path="apps/web/src/components/sars/emp201-preview.tsx">EMP201 form preview</file>
  <file path="apps/web/src/components/sars/period-selector.tsx">Tax period selector</file>
  <file path="apps/web/src/components/sars/submission-history.tsx">Past submissions</file>
  <file path="apps/web/src/components/sars/validation-warnings.tsx">Validation warnings</file>
  <file path="apps/web/src/components/sars/export-dialog.tsx">Export confirmation</file>
  <file path="apps/web/src/components/sars/breakdown-table.tsx">Value breakdown table</file>
  <file path="apps/web/src/components/sars/index.ts">SARS component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>VAT201 shows calculated values</criterion>
  <criterion>EMP201 shows employee deductions</criterion>
  <criterion>Period selector loads correct data</criterion>
  <criterion>Export generates downloadable file</criterion>
</validation_criteria>

</task_spec>
