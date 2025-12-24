<task_spec id="TASK-WEB-043" version="1.0">

<metadata>
  <title>Reports PDF/CSV Export Implementation</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>122</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-WEB-05</requirement_ref>
    <critical_issue_ref>CRIT-013</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-005</task_ref>
    <task_ref status="PENDING">TASK-RECON-033</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use frontend integration and file download thinking.
This task involves:
1. Replace TODO stub with implementation
2. Create useExportReport hook
3. Support PDF and CSV formats
4. Handle large reports
5. Download to user device
</reasoning_mode>

<context>
CRITICAL BUG: Reports export button is a TODO stub.

File: `apps/web/src/app/(dashboard)/reports/page.tsx:23`

REQ-WEB-05 specifies: "Export financial reports."

This task implements the export functionality for all report types.
</context>

<current_state>
## Codebase State
- handleExport is TODO stub
- Report generation service exists
- No export endpoints exposed
- No frontend integration

## What's Missing
- useExportReport hook
- Export format selection
- File download handling
- Progress for large reports
</current_state>

<input_context_files>
  <file purpose="page_to_fix">apps/web/src/app/(dashboard)/reports/page.tsx</file>
  <file purpose="income_service">apps/api/src/database/services/income-statement.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Create useExportReport hook
    - Format selection (PDF/CSV)
    - Income Statement export
    - Balance Sheet export
    - VAT report export
    - Download progress indicator
    - File download trigger
  </in_scope>
  <out_of_scope>
    - Excel export (P2 enhancement)
    - Scheduled report delivery
    - Report customization
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/hooks/useExportReport.ts">
      export function useExportReport() {
        return useMutation<Blob, Error, ExportReportParams>({
          mutationFn: exportReport,
          onSuccess: (blob, variables) => {
            downloadFile(blob, variables.filename);
            toast.success('Report downloaded successfully');
          },
          onError: (error) => {
            toast.error(`Export failed: ${error.message}`);
          },
        });
      }

      interface ExportReportParams {
        reportType: 'income-statement' | 'balance-sheet' | 'vat-report';
        format: 'pdf' | 'csv';
        dateRange: { start: string; end: string };
        filename: string;
      }
    </signature>
    <signature file="apps/web/src/components/reports/ExportDialog.tsx">
      export function ExportDialog({
        reportType,
        isOpen,
        onClose,
        onExport,
        isExporting,
      }: ExportDialogProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/utils/download.ts">
      export function downloadFile(blob: Blob, filename: string): void;
      export function formatFilename(reportType: string, format: string, date: Date): string;
    </signature>
  </signatures>

  <constraints>
    - Use streaming for large reports
    - Show progress during export
    - Handle timeout gracefully
    - PDF includes CrecheBooks branding
    - CSV properly formatted for Excel
    - File naming: report-type_YYYYMMDD.ext
  </constraints>

  <verification>
    - Export button triggers download
    - PDF renders correctly
    - CSV opens in Excel
    - Progress shows for large reports
    - Error handling works
    - All report types work
    - E2E test passes
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/hooks/useExportReport.ts">Export hook</file>
  <file path="apps/web/src/components/reports/ExportDialog.tsx">Export dialog</file>
  <file path="apps/web/src/utils/download.ts">Download utility</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/reports/page.tsx">Use hook, remove TODO</file>
</files_to_modify>

<validation_criteria>
  <criterion>Export button works</criterion>
  <criterion>PDF downloads correctly</criterion>
  <criterion>CSV downloads correctly</criterion>
  <criterion>Progress indicator shows</criterion>
  <criterion>All report types work</criterion>
  <criterion>E2E test passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="export" --verbose</command>
  <command>npm run e2e --filter=web -- --grep="export report"</command>
</test_commands>

</task_spec>
