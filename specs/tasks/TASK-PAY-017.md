<task_spec id="TASK-PAY-017" version="1.0">

<metadata>
  <title>Arrears Report PDF Export</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>109</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-PAY-012</requirement_ref>
    <critical_issue_ref>HIGH-005</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use reporting and document generation thinking.
This task involves:
1. PDF generation for arrears reports
2. Aging analysis chart inclusion
3. Professional formatting with branding
4. Email attachment ready format
5. Summary statistics display
</reasoning_mode>

<context>
ISSUE: Arrears report only exports to CSV. Staff cannot generate professional PDF reports for management or parent communications.

REQ-PAY-012 specifies: "Export arrears report to PDF and Excel."

This task adds PDF generation capability using PDFKit.
</context>

<current_state>
## Codebase State
- ArrearsCalculationService exists (TASK-PAY-013)
- CSV export works
- No PDF generation

## What's Missing
- PDFKit integration
- Professional PDF template
- Aging chart generation
- Branding elements
</current_state>

<input_context_files>
  <file purpose="arrears_service">apps/api/src/database/services/arrears-calculation.service.ts</file>
  <file purpose="arrears_controller">apps/api/src/modules/payments/arrears.controller.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Install and configure PDFKit
    - Create ArrearsReportPdfService
    - Generate aging analysis chart (bar chart)
    - Include summary statistics
    - Professional header with logo
    - Email attachment compatible
  </in_scope>
  <out_of_scope>
    - Excel export (separate task)
    - Custom branding upload
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/arrears-report-pdf.service.ts">
      @Injectable()
      export class ArrearsReportPdfService {
        async generatePdf(tenantId: string, options: ArrearsReportOptions): Promise<Buffer>;
        private buildHeader(doc: PDFKit.PDFDocument, tenant: Tenant): void;
        private buildAgingChart(doc: PDFKit.PDFDocument, data: AgingData): void;
        private buildDetailTable(doc: PDFKit.PDFDocument, arrears: ParentArrears[]): void;
        private buildSummary(doc: PDFKit.PDFDocument, summary: ArrearsSummary): void;
      }
    </signature>
  </signatures>

  <constraints>
    - PDF max 50 pages (paginate if needed)
    - All amounts use Decimal.js for accuracy
    - Include generation timestamp
    - A4 paper size
    - Professional fonts (Helvetica)
  </constraints>

  <verification>
    - PDF generates successfully
    - Aging chart renders correctly
    - Summary statistics accurate
    - All amounts formatted as ZAR
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/arrears-report-pdf.service.ts">PDF generation service</file>
  <file path="apps/api/src/database/services/__tests__/arrears-report-pdf.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/modules/payments/arrears.controller.ts">Add PDF export endpoint</file>
</files_to_modify>

<validation_criteria>
  <criterion>PDF generates without errors</criterion>
  <criterion>Aging chart renders correctly</criterion>
  <criterion>All data formatted properly</criterion>
  <criterion>File size reasonable (&lt; 5MB)</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="arrears-report-pdf" --verbose</command>
</test_commands>

</task_spec>
