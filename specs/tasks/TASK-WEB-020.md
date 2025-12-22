<task_spec id="TASK-WEB-020" version="1.0">

<metadata>
  <title>Financial Reports Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>20</sequence>
  <implements>
    <requirement_ref>REQ-WEB-08</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
    <task_ref>TASK-WEB-009</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create financial reporting components for income statements, aged receivables, and other management reports with export functionality.
</context>

<input_context_files>
  <file purpose="recon_hooks">apps/web/src/hooks/use-reconciliation.ts</file>
  <file purpose="recon_types">packages/types/src/reconciliation.ts</file>
  <file purpose="chart_components">apps/web/src/components/charts/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
  <check>TASK-WEB-009 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Report type selector
    - Income statement view
    - Aged receivables report
    - VAT report view
    - Export to PDF/CSV
    - Date range picker
  </in_scope>
  <out_of_scope>
    - Reports page layout (TASK-WEB-039)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/reports/income-statement.tsx">
      export function IncomeStatement({ data, period }: IncomeStatementProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/reports/aged-receivables.tsx">
      export function AgedReceivables({ data }: AgedReceivablesProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must format all values as ZAR
    - Must group by account codes
    - Export must include date generated
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/reports/report-selector.tsx">Report type selector</file>
  <file path="apps/web/src/components/reports/income-statement.tsx">Income statement</file>
  <file path="apps/web/src/components/reports/aged-receivables.tsx">Aged receivables</file>
  <file path="apps/web/src/components/reports/vat-report.tsx">VAT report</file>
  <file path="apps/web/src/components/reports/report-header.tsx">Report header</file>
  <file path="apps/web/src/components/reports/export-buttons.tsx">Export actions</file>
  <file path="apps/web/src/components/reports/date-range-picker.tsx">Date range</file>
  <file path="apps/web/src/components/reports/index.ts">Report exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Reports render with correct data</criterion>
  <criterion>Account codes are grouped</criterion>
  <criterion>Export downloads file</criterion>
</validation_criteria>

</task_spec>
