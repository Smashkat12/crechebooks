<task_spec id="TASK-RECON-018" version="1.0">

<metadata>
  <title>Trial Balance PDF/Excel Export</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>logic</layer>
  <sequence>150</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-FIN-009</requirement_ref>
    <requirement_ref>EC-RECON-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-017</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
While Balance Sheet export works, the Trial Balance report export uses the same
NOT_IMPLEMENTED methods in FinancialReportService. Trial Balance is essential
for accountants to verify that debits equal credits.

## Current State
- File: `apps/api/src/database/services/financial-report.service.ts`
- `generateTrialBalance()` works and returns JSON data
- `exportPDF()` and `exportExcel()` throw NOT_IMPLEMENTED for TrialBalance type
- Balance Sheet has separate working export in `balance-sheet.service.ts`

## What Should Happen (Per PRD REQ-FIN-009)
Trial Balance export should:
1. List all accounts with debit and credit columns
2. Show account codes and names
3. Display running totals
4. Verify debits equal credits
5. Support PDF and Excel formats

## Project Context
- **Financial Report Service**: `apps/api/src/database/services/financial-report.service.ts`
- **Trial Balance DTO**: `apps/api/src/database/dto/trial-balance.dto.ts`
- **Libraries**: pdfkit, exceljs (already installed)
- **Reference**: Balance Sheet export in `balance-sheet.service.ts`

## Note on Balance Sheet
Balance Sheet already has working exportToPdf() and exportToExcel() methods in
`balance-sheet.service.ts`. This task focuses on Trial Balance export, which
is handled by the FinancialReportService.
</context>

<input_context_files>
  <file purpose="financial_report_service">apps/api/src/database/services/financial-report.service.ts</file>
  <file purpose="balance_sheet_service">apps/api/src/database/services/balance-sheet.service.ts</file>
  <file purpose="trial_balance_dto">apps/api/src/database/dto/trial-balance.dto.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-017 completed (Income Statement export pattern established)</check>
  <check>Trial Balance generation works</check>
  <check>pdfkit and exceljs already installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Export Trial Balance to PDF format
    - Export Trial Balance to Excel format
    - Two-column format (Debit/Credit)
    - Account code and name columns
    - Running totals
    - Balance verification (debits = credits)
    - Controller endpoint for download
    - Unit tests
  </in_scope>
  <out_of_scope>
    - Opening/Closing Trial Balance comparison
    - Adjusting entries
    - Multi-period comparison
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/financial-report.service.ts">
      /**
       * Export Trial Balance to PDF format
       * @param report - Trial Balance data
       * @param tenantName - Name of tenant for branding
       * @returns PDF buffer
       */
      async exportTrialBalancePDF(
        report: TrialBalance,
        tenantName: string,
      ): Promise&lt;Buffer&gt;;

      /**
       * Export Trial Balance to Excel format
       * @param report - Trial Balance data
       * @param tenantName - Name of tenant for branding
       * @returns Excel buffer
       */
      async exportTrialBalanceExcel(
        report: TrialBalance,
        tenantName: string,
      ): Promise&lt;Buffer&gt;;
    </signature>
  </signatures>

  <constraints>
    - Use pdfkit for PDF generation
    - Use exceljs for Excel generation
    - Debit and Credit columns must be separate
    - Totals must balance (debits = credits)
    - Currency formatted as R X,XXX.XX
    - Date formatted as DD/MM/YYYY
    - Clear indication if out of balance
  </constraints>

  <verification>
    - PDF exports with all accounts listed
    - Excel exports with formulas for totals
    - Debit and Credit columns properly aligned
    - Totals row shows sum of each column
    - Out-of-balance warning displayed if applicable
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
FinancialReportService Trial Balance export (apps/api/src/database/services/financial-report.service.ts):

/**
 * Export Trial Balance to PDF format
 */
async exportTrialBalancePDF(report: TrialBalance, tenantName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text(tenantName, { align: 'center' });
    doc.fontSize(16).text('Trial Balance', { align: 'center' });
    doc.fontSize(12).text(
      `As at ${report.asAtDate.toLocaleDateString('en-ZA')}`,
      { align: 'center' }
    );
    doc.moveDown(2);

    const formatAmount = (cents: number) => {
      if (cents === 0) return '-';
      const rands = cents / 100;
      return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    };

    // Table header
    const startX = 50;
    const colWidths = [80, 200, 100, 100]; // Code, Name, Debit, Credit
    let y = doc.y;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Code', startX, y, { width: colWidths[0] });
    doc.text('Account Name', startX + colWidths[0], y, { width: colWidths[1] });
    doc.text('Debit (R)', startX + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
    doc.text('Credit (R)', startX + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
    doc.moveDown(0.5);

    // Draw line under header
    y = doc.y;
    doc.moveTo(startX, y).lineTo(startX + 480, y).stroke();
    doc.moveDown(0.5);

    // Table rows
    doc.font('Helvetica');
    for (const account of report.accounts) {
      y = doc.y;
      doc.text(account.accountCode, startX, y, { width: colWidths[0] });
      doc.text(account.accountName, startX + colWidths[0], y, { width: colWidths[1] });
      doc.text(formatAmount(account.debitsCents), startX + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
      doc.text(formatAmount(account.creditsCents), startX + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });
      doc.moveDown(0.3);
    }

    // Totals line
    doc.moveDown(0.5);
    y = doc.y;
    doc.moveTo(startX, y).lineTo(startX + 480, y).stroke();
    doc.moveDown(0.5);

    // Totals row
    doc.font('Helvetica-Bold');
    y = doc.y;
    doc.text('TOTALS', startX, y, { width: colWidths[0] + colWidths[1] });
    doc.text(formatAmount(report.totals.debitsRands * 100), startX + colWidths[0] + colWidths[1], y, { width: colWidths[2], align: 'right' });
    doc.text(formatAmount(report.totals.creditsRands * 100), startX + colWidths[0] + colWidths[1] + colWidths[2], y, { width: colWidths[3], align: 'right' });

    // Balance check
    doc.moveDown(2);
    if (report.isBalanced) {
      doc.fillColor('green').text('Trial Balance is IN BALANCE', { align: 'center' });
    } else {
      doc.fillColor('red').text('WARNING: Trial Balance is OUT OF BALANCE', { align: 'center' });
    }

    doc.fillColor('black').moveDown(2);
    doc.fontSize(8).text(`Generated: ${report.generatedAt.toLocaleString('en-ZA')}`, { align: 'center' });

    doc.end();
  });
}

/**
 * Export Trial Balance to Excel format
 */
async exportTrialBalanceExcel(report: TrialBalance, tenantName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CrecheBooks';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Trial Balance');

  // Set column widths
  sheet.columns = [
    { header: 'Account Code', key: 'code', width: 15 },
    { header: 'Account Name', key: 'name', width: 40 },
    { header: 'Debit (R)', key: 'debit', width: 15 },
    { header: 'Credit (R)', key: 'credit', width: 15 },
  ];

  // Header rows
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = tenantName;
  sheet.getCell('A1').font = { size: 16, bold: true };
  sheet.getCell('A1').alignment = { horizontal: 'center' };

  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = 'Trial Balance';
  sheet.getCell('A2').font = { size: 14, bold: true };
  sheet.getCell('A2').alignment = { horizontal: 'center' };

  sheet.mergeCells('A3:D3');
  sheet.getCell('A3').value = `As at ${report.asAtDate.toLocaleDateString('en-ZA')}`;
  sheet.getCell('A3').alignment = { horizontal: 'center' };

  // Column headers
  let rowNum = 5;
  sheet.getRow(rowNum).values = ['Account Code', 'Account Name', 'Debit (R)', 'Credit (R)'];
  sheet.getRow(rowNum).font = { bold: true };
  sheet.getRow(rowNum).alignment = { horizontal: 'center' };
  rowNum++;

  const dataStartRow = rowNum;

  // Data rows
  for (const account of report.accounts) {
    sheet.getCell(`A${rowNum}`).value = account.accountCode;
    sheet.getCell(`B${rowNum}`).value = account.accountName;
    sheet.getCell(`C${rowNum}`).value = account.debitsCents > 0 ? account.debitsCents / 100 : null;
    sheet.getCell(`D${rowNum}`).value = account.creditsCents > 0 ? account.creditsCents / 100 : null;
    sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
    sheet.getCell(`D${rowNum}`).numFmt = 'R #,##0.00';
    rowNum++;
  }
  const dataEndRow = rowNum - 1;

  // Totals row with formulas
  rowNum++;
  sheet.getCell(`B${rowNum}`).value = 'TOTALS';
  sheet.getCell(`B${rowNum}`).font = { bold: true };
  sheet.getCell(`C${rowNum}`).value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})` };
  sheet.getCell(`D${rowNum}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})` };
  sheet.getCell(`C${rowNum}`).numFmt = 'R #,##0.00';
  sheet.getCell(`D${rowNum}`).numFmt = 'R #,##0.00';
  sheet.getCell(`C${rowNum}`).font = { bold: true };
  sheet.getCell(`D${rowNum}`).font = { bold: true };

  // Balance check
  rowNum += 2;
  sheet.mergeCells(`A${rowNum}:D${rowNum}`);
  sheet.getCell(`A${rowNum}`).value = report.isBalanced
    ? 'Trial Balance is IN BALANCE'
    : 'WARNING: Trial Balance is OUT OF BALANCE';
  sheet.getCell(`A${rowNum}`).font = {
    bold: true,
    color: { argb: report.isBalanced ? '00008000' : '00FF0000' }
  };
  sheet.getCell(`A${rowNum}`).alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Add controller endpoint in reconciliation.controller.ts:

@Get('trial-balance/export')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({ summary: 'Export Trial Balance as PDF or Excel' })
async exportTrialBalance(
  @Query('as_at_date') asAtDate: string,
  @Query('format') format: 'pdf' | 'xlsx',
  @CurrentUser() user: IUser,
  @Res() res: Response,
): Promise<void> {
  const report = await this.financialReportService.generateTrialBalance(
    user.tenantId,
    new Date(asAtDate),
  );

  const tenant = await this.tenantRepo.findById(user.tenantId);
  const tenantName = tenant?.name || 'CrecheBooks';

  let buffer: Buffer;
  let mimeType: string;
  let filename: string;

  if (format === 'pdf') {
    buffer = await this.financialReportService.exportTrialBalancePDF(report, tenantName);
    mimeType = 'application/pdf';
    filename = `trial-balance-${asAtDate}.pdf`;
  } else {
    buffer = await this.financialReportService.exportTrialBalanceExcel(report, tenantName);
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `trial-balance-${asAtDate}.xlsx`;
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
}
</pseudo_code>

<files_to_modify>
  <file path="apps/api/src/database/services/financial-report.service.ts">Add exportTrialBalancePDF() and exportTrialBalanceExcel()</file>
  <file path="apps/api/src/api/reconciliation/reconciliation.controller.ts">Add /trial-balance/export endpoint</file>
</files_to_modify>

<validation_criteria>
  <criterion>Trial Balance PDF exports correctly</criterion>
  <criterion>Trial Balance Excel exports with formulas</criterion>
  <criterion>Debit and Credit columns properly separated</criterion>
  <criterion>Totals calculated correctly</criterion>
  <criterion>Balance status clearly indicated</criterion>
  <criterion>Out-of-balance warning shown when applicable</criterion>
  <criterion>Download endpoint works</criterion>
  <criterion>Unit tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- financial-report.service</command>
</test_commands>

</task_spec>
