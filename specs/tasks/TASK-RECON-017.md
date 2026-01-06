<task_spec id="TASK-RECON-017" version="1.0">

<metadata>
  <title>Income Statement PDF/Excel Export</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>149</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-FIN-008</requirement_ref>
    <requirement_ref>EC-RECON-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-032</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that the Income Statement export
methods throw NOT_IMPLEMENTED errors. Users cannot export financial reports.

## Current State
- File: `apps/api/src/database/services/financial-report.service.ts` (lines 461-491)
- `exportPDF()` throws: `BusinessException('PDF export not yet implemented', 'NOT_IMPLEMENTED')`
- `exportExcel()` throws: `BusinessException('Excel export not yet implemented', 'NOT_IMPLEMENTED')`
- Income Statement JSON data works correctly
- Controller at `reconciliation.controller.ts:458-461` returns placeholder URL for PDF/Excel

## What Should Happen (Per PRD REQ-FIN-008)
Income Statement export should:
1. Generate PDF with professional layout
2. Generate Excel with proper formatting
3. Include company branding (tenant name, logo placeholder)
4. Show income and expense breakdown by account
5. Display net profit calculation
6. Include period dates and generation timestamp

## Project Context
- **Financial Report Service**: `apps/api/src/database/services/financial-report.service.ts`
- **Balance Sheet Service**: Already has working `exportToPdf()` and `exportToExcel()` (can use as reference)
- **Libraries Available**: pdfkit, exceljs (already used in balance-sheet.service.ts)
- **Currency**: ZAR (R X,XXX.XX)
- **Date Format**: DD/MM/YYYY (South African)
</context>

<input_context_files>
  <file purpose="financial_report_service">apps/api/src/database/services/financial-report.service.ts</file>
  <file purpose="balance_sheet_service">apps/api/src/database/services/balance-sheet.service.ts</file>
  <file purpose="reconciliation_controller">apps/api/src/api/reconciliation/reconciliation.controller.ts</file>
  <file purpose="income_statement_dto">apps/api/src/database/dto/income-statement.dto.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-032 completed (Income Statement generation works)</check>
  <check>pdfkit and exceljs already installed</check>
  <check>Balance Sheet export can be used as reference</check>
</prerequisites>

<scope>
  <in_scope>
    - Implement exportPDF() for Income Statement
    - Implement exportExcel() for Income Statement
    - Professional layout with tenant branding
    - Income breakdown by account code
    - Expense breakdown by account code
    - Net profit/loss calculation
    - Period header with dates
    - Controller endpoint for direct download
    - Unit tests
  </in_scope>
  <out_of_scope>
    - Custom report templates
    - Comparative periods (prior year)
    - Budget vs actual comparison
    - Logo upload functionality
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/financial-report.service.ts">
      /**
       * Export Income Statement to PDF format
       * @param report - Income Statement data
       * @param tenantName - Name of tenant for branding
       * @returns PDF buffer
       */
      async exportPDF(
        report: IncomeStatement,
        tenantName: string,
      ): Promise&lt;Buffer&gt;;

      /**
       * Export Income Statement to Excel format
       * @param report - Income Statement data
       * @param tenantName - Name of tenant for branding
       * @returns Excel buffer
       */
      async exportExcel(
        report: IncomeStatement,
        tenantName: string,
      ): Promise&lt;Buffer&gt;;
    </signature>
  </signatures>

  <constraints>
    - Use pdfkit for PDF generation (already installed)
    - Use exceljs for Excel generation (already installed)
    - Follow same patterns as balance-sheet.service.ts
    - Currency formatted as R X,XXX.XX
    - Dates formatted as DD/MM/YYYY (South African)
    - PDF must be A4 size with proper margins
    - Excel must include formulas for totals
    - Must handle empty reports gracefully
  </constraints>

  <verification>
    - PDF exports successfully with all sections
    - Excel exports with proper formatting and formulas
    - Amounts formatted correctly
    - Period dates displayed correctly
    - Net profit calculated correctly
    - Empty reports don't crash
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
FinancialReportService export methods (apps/api/src/database/services/financial-report.service.ts):

import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';

/**
 * Export Income Statement to PDF format
 */
async exportPDF(report: IncomeStatement, tenantName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text(tenantName, { align: 'center' });
    doc.fontSize(16).text('Income Statement (Profit & Loss)', { align: 'center' });
    doc.fontSize(12).text(
      `Period: ${report.period.start.toLocaleDateString('en-ZA')} - ${report.period.end.toLocaleDateString('en-ZA')}`,
      { align: 'center' }
    );
    doc.moveDown(2);

    // Helper for currency formatting
    const formatAmount = (cents: number) => {
      const rands = cents / 100;
      return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    };

    // INCOME Section
    doc.fontSize(14).text('INCOME', { underline: true });
    doc.moveDown(0.5);

    for (const item of report.income.breakdown) {
      doc.fontSize(10)
        .text(`${item.accountCode} - ${item.accountName}`, { continued: true, width: 350 })
        .text(formatAmount(item.amountCents), { align: 'right' });
    }

    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('green')
      .text('Total Income', { continued: true, width: 350 })
      .text(formatAmount(report.income.totalCents), { align: 'right' });
    doc.fillColor('black').moveDown();

    // EXPENSES Section
    doc.fontSize(14).text('EXPENSES', { underline: true });
    doc.moveDown(0.5);

    for (const item of report.expenses.breakdown) {
      doc.fontSize(10)
        .text(`${item.accountCode} - ${item.accountName}`, { continued: true, width: 350 })
        .text(formatAmount(item.amountCents), { align: 'right' });
    }

    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('red')
      .text('Total Expenses', { continued: true, width: 350 })
      .text(formatAmount(report.expenses.totalCents), { align: 'right' });
    doc.fillColor('black').moveDown(2);

    // NET PROFIT/LOSS
    const netProfitLabel = report.netProfitCents >= 0 ? 'Net Profit' : 'Net Loss';
    const netProfitColor = report.netProfitCents >= 0 ? 'green' : 'red';

    doc.fontSize(14).fillColor(netProfitColor)
      .text(netProfitLabel, { continued: true, width: 350 })
      .text(formatAmount(Math.abs(report.netProfitCents)), { align: 'right' });

    doc.fillColor('black').moveDown(2);

    // Footer
    doc.fontSize(8).text(
      `Generated: ${report.generatedAt.toLocaleString('en-ZA')}`,
      { align: 'center' }
    );

    doc.end();
  });
}

/**
 * Export Income Statement to Excel format
 */
async exportExcel(report: IncomeStatement, tenantName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CrecheBooks';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Income Statement');

  // Set column widths
  sheet.columns = [
    { header: 'Account Code', key: 'code', width: 15 },
    { header: 'Account Name', key: 'name', width: 40 },
    { header: 'Amount (ZAR)', key: 'amount', width: 20 },
  ];

  // Header rows
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = tenantName;
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:C2');
  sheet.getCell('A2').value = 'Income Statement (Profit & Loss)';
  sheet.getCell('A2').font = { size: 14, bold: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('A3:C3');
  sheet.getCell('A3').value = `Period: ${report.period.start.toLocaleDateString('en-ZA')} - ${report.period.end.toLocaleDateString('en-ZA')}`;
  sheet.getCell('A3').alignment = { horizontal: 'center' };

  let rowNum = 5;

  // INCOME Section
  sheet.getCell(`A${rowNum}`).value = 'INCOME';
  sheet.getCell(`A${rowNum}`).font = { bold: true, underline: true };
  rowNum++;

  const incomeStartRow = rowNum;
  for (const item of report.income.breakdown) {
    sheet.getCell(`A${rowNum}`).value = item.accountCode;
    sheet.getCell(`B${rowNum}`).value = item.accountName;
    sheet.getCell(`C${rowNum}`).value = item.amountCents / 100;
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    rowNum++;
  }
  const incomeEndRow = rowNum - 1;

  // Total Income with formula
  sheet.getCell(`B${rowNum}`).value = 'Total Income';
  sheet.getCell(`B${rowNum}`).font = { bold: true };
  sheet.getCell(`C${rowNum}`).value = { formula: `SUM(C${incomeStartRow}:C${incomeEndRow})` };
  sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
  sheet.getCell(`C${rowNum}`).font = { bold: true, color: { argb: '00008000' } };
  rowNum += 2;

  // EXPENSES Section
  sheet.getCell(`A${rowNum}`).value = 'EXPENSES';
  sheet.getCell(`A${rowNum}`).font = { bold: true, underline: true };
  rowNum++;

  const expenseStartRow = rowNum;
  for (const item of report.expenses.breakdown) {
    sheet.getCell(`A${rowNum}`).value = item.accountCode;
    sheet.getCell(`B${rowNum}`).value = item.accountName;
    sheet.getCell(`C${rowNum}`).value = item.amountCents / 100;
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    rowNum++;
  }
  const expenseEndRow = rowNum - 1;

  // Total Expenses with formula
  sheet.getCell(`B${rowNum}`).value = 'Total Expenses';
  sheet.getCell(`B${rowNum}`).font = { bold: true };
  sheet.getCell(`C${rowNum}`).value = { formula: `SUM(C${expenseStartRow}:C${expenseEndRow})` };
  sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
  sheet.getCell(`C${rowNum}`).font = { bold: true, color: { argb: '00FF0000' } };
  rowNum += 2;

  // Net Profit/Loss
  const netProfitLabel = report.netProfitCents >= 0 ? 'Net Profit' : 'Net Loss';
  sheet.getCell(`B${rowNum}`).value = netProfitLabel;
  sheet.getCell(`B${rowNum}`).font = { bold: true, size: 12 };
  sheet.getCell(`C${rowNum}`).value = Math.abs(report.netProfitCents) / 100;
  sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
  sheet.getCell(`C${rowNum}`).font = {
    bold: true,
    size: 12,
    color: { argb: report.netProfitCents >= 0 ? '00008000' : '00FF0000' }
  };

  // Return as buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Update reconciliation.controller.ts:

@Get('income-statement/export')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({ summary: 'Export Income Statement as PDF or Excel' })
async exportIncomeStatement(
  @Query('period_start') periodStart: string,
  @Query('period_end') periodEnd: string,
  @Query('format') format: 'pdf' | 'xlsx',
  @CurrentUser() user: IUser,
  @Res() res: Response,
): Promise<void> {
  const report = await this.financialReportService.generateIncomeStatement(
    user.tenantId,
    new Date(periodStart),
    new Date(periodEnd),
  );

  const tenant = await this.tenantRepo.findById(user.tenantId);
  const tenantName = tenant?.name || 'CrecheBooks';

  let buffer: Buffer;
  let mimeType: string;
  let filename: string;

  if (format === 'pdf') {
    buffer = await this.financialReportService.exportPDF(report, tenantName);
    mimeType = 'application/pdf';
    filename = `income-statement-${periodStart}-${periodEnd}.pdf`;
  } else {
    buffer = await this.financialReportService.exportExcel(report, tenantName);
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `income-statement-${periodStart}-${periodEnd}.xlsx`;
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}
</pseudo_code>

<files_to_modify>
  <file path="apps/api/src/database/services/financial-report.service.ts">Implement exportPDF() and exportExcel()</file>
  <file path="apps/api/src/api/reconciliation/reconciliation.controller.ts">Add /income-statement/export endpoint</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/financial-report.service.spec.ts">Additional tests for export methods</file>
</files_to_create>

<validation_criteria>
  <criterion>PDF generates with proper layout</criterion>
  <criterion>Excel generates with formulas and formatting</criterion>
  <criterion>Currency formatted as R X,XXX.XX</criterion>
  <criterion>Dates formatted as DD/MM/YYYY</criterion>
  <criterion>Net profit/loss displayed correctly</criterion>
  <criterion>Download endpoint works</criterion>
  <criterion>Empty reports handled gracefully</criterion>
  <criterion>Unit tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- financial-report.service</command>
</test_commands>

</task_spec>
