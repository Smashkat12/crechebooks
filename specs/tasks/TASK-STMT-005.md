# TASK-STMT-005: Statement PDF Generation Service

## Metadata
- **Task ID**: TASK-STMT-005
- **Phase**: 12 - Account Statements
- **Layer**: logic
- **Priority**: P2-HIGH
- **Dependencies**: TASK-STMT-003
- **Estimated Effort**: 5 hours

## Objective
Create a professional PDF generation service for parent account statements with creche branding, complete transaction history, and proper South African formatting.

## Business Context
Parents expect professional statements similar to bank statements showing:
- Creche logo and contact details
- Statement period and date
- Parent contact information
- Detailed transaction history
- Clear balance summary
- Payment instructions

## Technical Requirements

### 1. Statement PDF Service (`apps/api/src/database/services/statement-pdf.service.ts`)

```typescript
import PDFDocument from 'pdfkit';
import { Decimal } from 'decimal.js';

export interface StatementPdfOptions {
  includePaymentInstructions?: boolean;
  includeRemittanceSlip?: boolean;
  logo?: Buffer;
  primaryColor?: string;
}

@Injectable()
export class StatementPdfService {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly statementRepo: StatementRepository,
  ) {}

  /**
   * Generate PDF for a statement
   */
  async generatePdf(
    tenantId: string,
    statementId: string,
    options?: StatementPdfOptions
  ): Promise<Buffer> {
    const statement = await this.statementRepo.findById(statementId);
    const tenant = await this.tenantRepo.findById(tenantId);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Statement ${statement.statementNumber}`,
        Author: tenant.name,
        Subject: 'Account Statement',
      },
    });

    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));

    // Header with logo
    this.renderHeader(doc, tenant, statement);

    // Parent details
    this.renderParentDetails(doc, statement);

    // Statement summary
    this.renderSummary(doc, statement);

    // Transaction table
    this.renderTransactionTable(doc, statement.lines);

    // Balance summary
    this.renderBalanceSummary(doc, statement);

    // Payment instructions (optional)
    if (options?.includePaymentInstructions) {
      this.renderPaymentInstructions(doc, tenant);
    }

    // Footer
    this.renderFooter(doc, tenant);

    doc.end();

    return Buffer.concat(buffers);
  }

  private renderHeader(doc: PDFKit.PDFDocument, tenant: Tenant, statement: Statement): void {
    // Logo (left side)
    if (tenant.logoUrl) {
      doc.image(tenant.logoUrl, 50, 45, { width: 80 });
    }

    // Company details (right side)
    doc.fontSize(18).font('Helvetica-Bold')
      .text(tenant.name, 200, 50, { align: 'right' });

    doc.fontSize(10).font('Helvetica')
      .text(tenant.address || '', 200, 75, { align: 'right' })
      .text(`Tel: ${tenant.phone || ''}`, 200, 90, { align: 'right' })
      .text(`Email: ${tenant.email || ''}`, 200, 105, { align: 'right' });

    // Statement title
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold')
      .text('ACCOUNT STATEMENT', { align: 'center' });

    doc.fontSize(10).font('Helvetica')
      .text(`Statement No: ${statement.statementNumber}`, { align: 'center' })
      .text(`Period: ${this.formatDate(statement.periodStart)} - ${this.formatDate(statement.periodEnd)}`, { align: 'center' })
      .text(`Date: ${this.formatDate(statement.generatedAt)}`, { align: 'center' });

    doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).stroke();
  }

  private renderTransactionTable(doc: PDFKit.PDFDocument, lines: StatementLine[]): void {
    const tableTop = doc.y + 20;
    const tableHeaders = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
    const columnWidths = [70, 170, 80, 70, 70, 75];
    let yPosition = tableTop;

    // Header row
    doc.font('Helvetica-Bold').fontSize(9);
    let xPosition = 50;
    tableHeaders.forEach((header, i) => {
      doc.text(header, xPosition, yPosition, { width: columnWidths[i], align: i >= 3 ? 'right' : 'left' });
      xPosition += columnWidths[i];
    });

    yPosition += 15;
    doc.moveTo(50, yPosition).lineTo(545, yPosition).stroke();
    yPosition += 5;

    // Data rows
    doc.font('Helvetica').fontSize(8);
    for (const line of lines) {
      // Check for page break
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      xPosition = 50;
      doc.text(this.formatDate(line.date), xPosition, yPosition, { width: columnWidths[0] });
      xPosition += columnWidths[0];

      doc.text(line.description, xPosition, yPosition, { width: columnWidths[1] });
      xPosition += columnWidths[1];

      doc.text(line.referenceNumber || '', xPosition, yPosition, { width: columnWidths[2] });
      xPosition += columnWidths[2];

      doc.text(line.debitCents > 0 ? this.formatCurrency(line.debitCents) : '', xPosition, yPosition, { width: columnWidths[3], align: 'right' });
      xPosition += columnWidths[3];

      doc.text(line.creditCents > 0 ? this.formatCurrency(line.creditCents) : '', xPosition, yPosition, { width: columnWidths[4], align: 'right' });
      xPosition += columnWidths[4];

      doc.text(this.formatCurrency(line.balanceCents), xPosition, yPosition, { width: columnWidths[5], align: 'right' });

      yPosition += 15;
    }
  }

  private renderBalanceSummary(doc: PDFKit.PDFDocument, statement: Statement): void {
    const boxTop = doc.y + 20;

    // Summary box
    doc.rect(350, boxTop, 195, 80).fillAndStroke('#f5f5f5', '#ccc');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
    doc.text('ACCOUNT SUMMARY', 360, boxTop + 10);

    doc.font('Helvetica').fontSize(9);
    doc.text('Opening Balance:', 360, boxTop + 28);
    doc.text(this.formatCurrency(statement.openingBalanceCents), 480, boxTop + 28, { align: 'right', width: 60 });

    doc.text('Total Charges:', 360, boxTop + 42);
    doc.text(this.formatCurrency(statement.totalChargesCents), 480, boxTop + 42, { align: 'right', width: 60 });

    doc.text('Total Payments:', 360, boxTop + 56);
    doc.text(`(${this.formatCurrency(statement.totalPaymentsCents)})`, 480, boxTop + 56, { align: 'right', width: 60 });

    doc.font('Helvetica-Bold');
    doc.text('Amount Due:', 360, boxTop + 72);

    const amountDue = statement.closingBalanceCents;
    const amountColor = amountDue > 0 ? '#dc2626' : '#16a34a';
    doc.fillColor(amountColor).text(this.formatCurrency(Math.abs(amountDue)), 480, boxTop + 72, { align: 'right', width: 60 });

    if (amountDue < 0) {
      doc.fillColor('#16a34a').fontSize(8).text('(Credit Balance)', 360, boxTop + 84);
    }
  }

  private renderPaymentInstructions(doc: PDFKit.PDFDocument, tenant: Tenant): void {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000')
      .text('Payment Instructions', 50, 50);

    doc.font('Helvetica').fontSize(10);
    doc.text('Please use the following details for EFT payments:', 50, 75);

    const bankDetails = [
      ['Bank:', tenant.bankName || 'FNB'],
      ['Account Name:', tenant.name],
      ['Account Number:', tenant.bankAccountNumber || ''],
      ['Branch Code:', tenant.bankBranchCode || ''],
      ['Reference:', 'Your statement number'],
    ];

    let y = 100;
    bankDetails.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, 50, y, { continued: true });
      doc.font('Helvetica').text(` ${value}`);
      y += 18;
    });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  }

  private formatCurrency(cents: number): string {
    const amount = new Decimal(cents).dividedBy(100);
    return `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/database/services/statement-pdf.service.ts` | CREATE | PDF generation service |
| `apps/api/src/database/services/statement-pdf.service.spec.ts` | CREATE | Service tests |
| `apps/api/package.json` | MODIFY | Ensure pdfkit dependency |
| `apps/api/src/database/database.module.ts` | MODIFY | Register PDF service |

## Acceptance Criteria

- [ ] Professional A4 PDF layout
- [ ] Creche logo and branding
- [ ] Complete transaction history table
- [ ] Running balance column
- [ ] Balance summary box
- [ ] South African date format (DD MMM YYYY)
- [ ] South African currency format (R X XXX.XX)
- [ ] Automatic page breaks for long statements
- [ ] Optional payment instructions page
- [ ] PDF metadata (title, author, subject)
- [ ] Handle missing logo gracefully
- [ ] Unit tests with PDF content validation

## Test Cases

1. Generate PDF with all line types
2. Multi-page statement (many transactions)
3. Statement with credit balance
4. Statement with large balance
5. Missing tenant logo
6. Payment instructions included
7. PDF opens in standard viewers
8. Currency formatting edge cases
9. Date formatting edge cases
