<task_spec id="TASK-REPORTS-003" version="2.0">

<metadata>
  <title>Enhanced PDF Generation with AI Insights</title>
  <status>ready</status>
  <phase>reports-enhancement</phase>
  <layer>logic</layer>
  <sequence>803</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-REPORTS-AI-PDF</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-REPORTS-001</task_ref>
    <task_ref>TASK-REPORTS-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-29</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The existing PDF export generates static financial data without any AI analysis.
  Users must interpret raw numbers themselves. The infrastructure for PDF generation
  exists (pdfkit, exceljs) but needs enhancement to include AI insights section.

  **Gap Analysis:**
  - No AI insights section in PDFs
  - No executive summary in exports
  - No trend visualization in PDFs
  - No anomaly alerts in exports
  - No recommendations section

  **Files to Create:**
  - `apps/api/src/modules/reports/pdf-generator.service.ts`
  - `apps/api/tests/modules/reports/pdf-generator.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/modules/reports/reports.service.ts` — USE PdfGeneratorService
  - `apps/api/src/modules/reports/reports.module.ts` — ADD PdfGeneratorService
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. PDF Generator Service
  ```typescript
  @Injectable()
  export class PdfGeneratorService {
    private readonly logger = new Logger(PdfGeneratorService.name);

    async generateReportPdf(
      reportData: ReportDataResponse,
      aiInsights: AIInsights | null,
      tenantName: string,
    ): Promise<Buffer> {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header
        this.renderHeader(doc, reportData, tenantName);

        // Financial Data Section
        this.renderFinancialData(doc, reportData);

        // AI Insights Section (if available)
        if (aiInsights) {
          this.renderAIInsights(doc, aiInsights);
        }

        // Footer
        this.renderFooter(doc, tenantName);

        doc.end();
      });
    }

    private renderAIInsights(doc: PDFKit.PDFDocument, insights: AIInsights): void {
      // New page for AI section
      doc.addPage();

      // Section header with AI badge
      doc.fontSize(16).fillColor('#1a365d')
         .text('AI-Generated Insights', { underline: true });
      doc.moveDown(0.5);

      // Confidence indicator
      doc.fontSize(9).fillColor('#718096')
         .text(`Analysis confidence: ${insights.confidenceScore}% | Source: ${insights.source}`);
      doc.moveDown(1);

      // Executive Summary
      doc.fontSize(12).fillColor('#2d3748').text('Executive Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#4a5568').text(insights.executiveSummary, {
        align: 'justify',
        lineGap: 2,
      });
      doc.moveDown(1);

      // Key Findings
      if (insights.keyFindings.length > 0) {
        this.renderKeyFindings(doc, insights.keyFindings);
      }

      // Trends
      if (insights.trends.length > 0) {
        this.renderTrends(doc, insights.trends);
      }

      // Anomalies (with warning styling)
      if (insights.anomalies.length > 0) {
        this.renderAnomalies(doc, insights.anomalies);
      }

      // Recommendations
      if (insights.recommendations.length > 0) {
        this.renderRecommendations(doc, insights.recommendations);
      }
    }

    private renderKeyFindings(doc: PDFKit.PDFDocument, findings: KeyFinding[]): void {
      doc.fontSize(12).fillColor('#2d3748').text('Key Findings', { underline: true });
      doc.moveDown(0.5);

      for (const finding of findings) {
        const icon = finding.impact === 'positive' ? '✓' :
                     finding.impact === 'negative' ? '⚠' : '•';
        const color = finding.impact === 'positive' ? '#38a169' :
                      finding.impact === 'negative' ? '#e53e3e' : '#718096';

        doc.fontSize(10).fillColor(color)
           .text(`${icon} [${finding.category.toUpperCase()}] ${finding.finding}`);
        doc.moveDown(0.3);
      }
      doc.moveDown(0.5);
    }

    private renderRecommendations(doc: PDFKit.PDFDocument, recommendations: Recommendation[]): void {
      doc.fontSize(12).fillColor('#2d3748').text('Recommendations', { underline: true });
      doc.moveDown(0.5);

      const sorted = [...recommendations].sort((a, b) => {
        const priority = { high: 0, medium: 1, low: 2 };
        return priority[a.priority] - priority[b.priority];
      });

      for (let i = 0; i < sorted.length; i++) {
        const rec = sorted[i];
        const priorityColor = rec.priority === 'high' ? '#e53e3e' :
                              rec.priority === 'medium' ? '#dd6b20' : '#718096';

        doc.fontSize(10).fillColor(priorityColor)
           .text(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
        doc.fontSize(9).fillColor('#718096')
           .text(`   Expected impact: ${rec.expectedImpact} | Timeline: ${rec.timeline}`);
        doc.moveDown(0.3);
      }
    }
  }
  ```

  ### 2. PDF Layout Structure
  ```
  ┌─────────────────────────────────────────┐
  │  [TENANT NAME]                          │
  │  Income Statement                       │
  │  Period: 01/01/2026 - 31/01/2026       │
  ├─────────────────────────────────────────┤
  │                                         │
  │  INCOME                                 │
  │  4000 - School Fees      R 125,000.00  │
  │  4100 - Registration     R   5,000.00  │
  │  ─────────────────────────────────────  │
  │  Total Income            R 130,000.00  │
  │                                         │
  │  EXPENSES                               │
  │  5000 - Salaries         R  65,000.00  │
  │  5100 - Utilities        R   8,500.00  │
  │  ─────────────────────────────────────  │
  │  Total Expenses          R  73,500.00  │
  │                                         │
  │  NET PROFIT              R  56,500.00  │
  │                                         │
  ├─────────────────────────────────────────┤
  │  🤖 AI-GENERATED INSIGHTS               │
  │  Confidence: 87% | Source: Claude       │
  ├─────────────────────────────────────────┤
  │  Executive Summary                      │
  │  [2-3 paragraph AI analysis...]         │
  ├─────────────────────────────────────────┤
  │  Key Findings                           │
  │  ✓ [REVENUE] Strong fee collection...   │
  │  ⚠ [EXPENSE] Utility costs increased... │
  ├─────────────────────────────────────────┤
  │  Trends Detected                        │
  │  ↗ Revenue: +15.3% MoM                  │
  │  ↘ Expenses: -3.2% MoM                  │
  ├─────────────────────────────────────────┤
  │  ⚠ Anomalies                            │
  │  • Unusual spike in utility costs...    │
  ├─────────────────────────────────────────┤
  │  💡 Recommendations                     │
  │  1. [HIGH] Review utility provider...   │
  │  2. [MEDIUM] Consider fee adjustment... │
  ├─────────────────────────────────────────┤
  │  Generated: 29/01/2026 21:45           │
  │  CrecheBooks - Financial Report         │
  └─────────────────────────────────────────┘
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create PdfGeneratorService
    - Implement AI insights section rendering
    - Executive summary formatting
    - Key findings with visual indicators
    - Trend arrows and percentages
    - Anomaly alerts with warning styling
    - Prioritized recommendations list
    - Consistent ZAR currency formatting
    - SA date formatting (dd/MM/yyyy)
    - Unit tests with mock data
  </in_scope>

  <out_of_scope>
    - Excel export enhancement (Excel is data-only, no AI narrative)
    - Chart images in PDF (future enhancement)
    - Multi-language support
    - Custom branding per tenant
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `PdfGeneratorService` created with `generateReportPdf()` method
  - [ ] AI insights section rendered in PDF
  - [ ] Executive summary properly formatted
  - [ ] Key findings with color-coded impact indicators
  - [ ] Trends with direction arrows and percentages
  - [ ] Anomalies with warning styling
  - [ ] Recommendations sorted by priority
  - [ ] Confidence score and source displayed
  - [ ] Currency formatting in ZAR (R X,XXX.XX)
  - [ ] Date formatting in SA format (dd/MM/yyyy)
  - [ ] Unit tests for PDF generation
  - [ ] Integration with ReportsService
  - [ ] Build and lint pass
</definition_of_done>

</task_spec>
