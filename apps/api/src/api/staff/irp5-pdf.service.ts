/**
 * Irp5PdfService — Generate IRP5 tax certificate PDF for staff-portal
 *
 * Produces a clean, readable PDF for an employee's IRP5.
 * Uses PDFKit (same pattern as InvoicePdfService).
 *
 * SARS IRP5 source codes rendered:
 *   3615 — Total remuneration (gross salary sum from SimplePayPayslipImport)
 *   3696 — PAYE deducted
 *   3810 — UIF employee contributions
 *   Note: 3601/3602/3606 (basic/overtime/bonus) are NOT split because
 *   SimplePayPayslipImport.grossSalaryCents is an aggregate.  This is
 *   surfaced as a data gap on the PDF itself.
 *
 * This PDF is for staff self-service only.  It is NOT submitted to SARS.
 * SARS submission of tax certificates is via EMP501 reconciliation.
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { Irp5YearAggregate } from './irp5-portal.service';

interface StaffRecord {
  firstName: string;
  lastName: string;
  idNumber: string;
  taxNumber: string | null;
  employeeNumber: string | null;
  dateOfBirth: Date;
  tenant: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
  };
}

@Injectable()
export class Irp5PdfService {
  private readonly logger = new Logger(Irp5PdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate PDF buffer for an IRP5 certificate.
   *
   * @param agg     - Pre-aggregated year totals from Irp5PortalService
   * @returns Buffer — PDF bytes ready to stream
   */
  async generatePdf(agg: Irp5YearAggregate): Promise<Buffer> {
    this.logger.log(
      `Generating IRP5 PDF for staff ${agg.staffId} tax year ${agg.taxYear}`,
    );

    const staff = await this.prisma.staff.findUnique({
      where: { id: agg.staffId },
      include: { tenant: true },
    });

    if (!staff || staff.tenantId !== agg.tenantId) {
      throw new Error(
        `Staff record not found or tenant mismatch for ${agg.staffId}`,
      );
    }

    return this.buildPdf(agg, staff as StaffRecord);
  }

  // ---------------------------------------------------------------------------
  // PDF construction
  // ---------------------------------------------------------------------------

  private buildPdf(
    agg: Irp5YearAggregate,
    staff: StaffRecord,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.addHeader(doc, agg, staff);
        this.addEmployerSection(doc, staff);
        this.addEmployeeSection(doc, staff);
        this.addIncomeSection(doc, agg);
        this.addDeductionsSection(doc, agg);
        this.addSummarySection(doc, agg);
        this.addFooter(doc);

        doc.end();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  private addHeader(
    doc: typeof PDFDocument.prototype,
    agg: Irp5YearAggregate,
    staff: StaffRecord,
  ): void {
    const employerName = staff.tenant.tradingName ?? staff.tenant.name;

    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('IRP5 / IT3(a) TAX CERTIFICATE', { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Tax Year: ${agg.taxYearPeriod}  (1 March ${agg.taxYear - 1} – 28/29 February ${agg.taxYear})`,
        { align: 'center' },
      );
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(
        'This document is generated for staff self-service. It is NOT submitted to SARS. ' +
          'SARS submission occurs via the EMP501 reconciliation process.',
        { align: 'center', width: 480 },
      )
      .fillColor('#000000');

    doc.moveDown(0.5);

    // Reference line
    const refNum = `IRP5/${agg.taxYearPeriod.replace('/', '-')}/${staff.employeeNumber ?? agg.staffId.slice(0, 8).toUpperCase()}`;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(`Reference: ${refNum}`, { align: 'right' });
    doc.text(`Employer: ${employerName}`, { align: 'right' });

    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.8);
  }

  private addEmployerSection(
    doc: typeof PDFDocument.prototype,
    staff: StaffRecord,
  ): void {
    const labelX = 50;
    const valueX = 220;
    const employerName = staff.tenant.tradingName ?? staff.tenant.name;

    this.sectionTitle(doc, 'EMPLOYER DETAILS');

    this.labelValue(doc, 'Employer Name:', employerName, labelX, valueX);
    this.labelValue(
      doc,
      'PAYE Reference:',
      staff.tenant.registrationNumber ?? '(Not on file)',
      labelX,
      valueX,
    );
    this.labelValue(
      doc,
      'Registration Number:',
      staff.tenant.registrationNumber ?? '(Not on file)',
      labelX,
      valueX,
    );

    doc.moveDown(0.8);
  }

  private addEmployeeSection(
    doc: typeof PDFDocument.prototype,
    staff: StaffRecord,
  ): void {
    const labelX = 50;
    const valueX = 220;

    this.sectionTitle(doc, 'EMPLOYEE DETAILS');

    this.labelValue(
      doc,
      'Full Name:',
      `${staff.firstName} ${staff.lastName}`,
      labelX,
      valueX,
    );
    this.labelValue(
      doc,
      'Employee Number:',
      staff.employeeNumber ?? '(Not assigned)',
      labelX,
      valueX,
    );
    this.labelValue(
      doc,
      'ID Number:',
      staff.idNumber ?? '(Not on file)',
      labelX,
      valueX,
    );
    this.labelValue(
      doc,
      'SARS Tax Number:',
      staff.taxNumber ?? '(Not on file)',
      labelX,
      valueX,
    );
    this.labelValue(
      doc,
      'Date of Birth:',
      staff.dateOfBirth ? this.formatDate(staff.dateOfBirth) : '(Not on file)',
      labelX,
      valueX,
    );

    doc.moveDown(0.8);
  }

  private addIncomeSection(
    doc: typeof PDFDocument.prototype,
    agg: Irp5YearAggregate,
  ): void {
    this.sectionTitle(doc, 'INCOME (REMUNERATION)');

    const labelX = 50;
    const codeX = 320;
    const amountX = 400;

    // Column headers
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Description', labelX, doc.y);
    doc.text('Code', codeX, doc.y, { align: 'left' });
    doc.text('Amount (ZAR)', amountX, doc.y, { width: 140, align: 'right' });
    doc.moveDown(0.3);
    doc
      .moveTo(labelX, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#dddddd')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica');

    // 3615 — total remuneration
    this.incomeRow(
      doc,
      'Total Remuneration (Gross Salary)',
      '3615',
      agg.totalGrossCents,
      labelX,
      codeX,
      amountX,
    );

    // Earnings split gap notice
    doc.moveDown(0.5);
    doc
      .fontSize(7.5)
      .fillColor('#888888')
      .text(
        'Note: Earnings breakdown by type (3601 Basic / 3602 Overtime / 3606 Bonus) ' +
          'is not available — SimplePay imports provide gross totals only. ' +
          'Full breakdown is available on your monthly payslips.',
        labelX,
        undefined,
        { width: 490 },
      )
      .fillColor('#000000');

    doc.moveDown(0.8);
  }

  private addDeductionsSection(
    doc: typeof PDFDocument.prototype,
    agg: Irp5YearAggregate,
  ): void {
    this.sectionTitle(doc, 'DEDUCTIONS');

    const labelX = 50;
    const codeX = 320;
    const amountX = 400;

    // Column headers
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Description', labelX, doc.y);
    doc.text('Code', codeX, doc.y);
    doc.text('Amount (ZAR)', amountX, doc.y, { width: 140, align: 'right' });
    doc.moveDown(0.3);
    doc
      .moveTo(labelX, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#dddddd')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.3);

    doc.fontSize(9).font('Helvetica');

    // 3696 — PAYE
    this.incomeRow(
      doc,
      'PAYE (Pay As You Earn) Deducted',
      '3696',
      agg.totalPayeCents,
      labelX,
      codeX,
      amountX,
    );

    // 3810 — UIF employee
    this.incomeRow(
      doc,
      'UIF Contribution (Employee)',
      '3810',
      agg.totalUifEmployeeCents,
      labelX,
      codeX,
      amountX,
    );

    doc.moveDown(0.8);
  }

  private addSummarySection(
    doc: typeof PDFDocument.prototype,
    agg: Irp5YearAggregate,
  ): void {
    const boxX = 300;
    const boxW = 245;
    const startY = doc.y;

    this.sectionTitle(doc, 'SUMMARY');

    const summaryItems: Array<{ label: string; value: number }> = [
      { label: 'Total Gross (Code 3615)', value: agg.totalGrossCents },
      { label: 'PAYE Deducted (Code 3696)', value: agg.totalPayeCents },
      { label: 'UIF Employee (Code 3810)', value: agg.totalUifEmployeeCents },
      { label: 'Net Take-Home', value: agg.totalNetCents },
    ];

    doc.fontSize(9);
    for (const item of summaryItems) {
      const y = doc.y;
      doc.font('Helvetica').text(item.label, boxX, y, { width: 155 });
      doc
        .font('Helvetica-Bold')
        .text(`R ${this.formatCents(item.value)}`, boxX + 155, y, {
          width: boxW - 155,
          align: 'right',
        });
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);

    // Periods worked
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(
        `Pay periods included: ${agg.periodCount}  |  ` +
          `Tax year: ${agg.taxYearPeriod}  |  ` +
          `Period: ${this.formatDate(agg.startDate)} – ${this.formatDate(agg.endDate)}`,
        50,
        undefined,
        { width: 495 },
      )
      .fillColor('#000000');

    void startY; // prevent unused-variable lint

    doc.moveDown(0.8);

    // Completion status notice
    if (!agg.isComplete) {
      doc
        .fontSize(9)
        .fillColor('#b45309')
        .text(
          'IN PROGRESS — This tax year has not yet closed. ' +
            'A final certificate will be available after 28/29 February ' +
            agg.taxYear +
            '.',
          50,
          undefined,
          { width: 495 },
        )
        .fillColor('#000000');
    }
  }

  private addFooter(doc: typeof PDFDocument.prototype): void {
    const pageHeight = doc.page.height;

    doc
      .moveTo(50, pageHeight - 70)
      .lineTo(545, pageHeight - 70)
      .stroke();
    doc
      .fontSize(7.5)
      .fillColor('#888888')
      .text(
        'This IRP5/IT3(a) certificate is generated from payslip data imported from SimplePay. ' +
          'For queries contact your employer. For SARS queries use this certificate at efiling.sars.gov.za.',
        50,
        pageHeight - 60,
        { width: 495, align: 'center' },
      )
      .fillColor('#000000');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private sectionTitle(doc: typeof PDFDocument.prototype, title: string): void {
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text(title)
      .fillColor('#000000');
    doc
      .moveTo(50, doc.y + 2)
      .lineTo(545, doc.y + 2)
      .strokeColor('#1a365d')
      .stroke()
      .strokeColor('#000000');
    doc.moveDown(0.5);
  }

  private labelValue(
    doc: typeof PDFDocument.prototype,
    label: string,
    value: string,
    labelX: number,
    valueX: number,
  ): void {
    const y = doc.y;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(label, labelX, y, { width: valueX - labelX - 5 });
    doc.font('Helvetica').text(value, valueX, y, { width: 545 - valueX });
    doc.moveDown(0.4);
  }

  private incomeRow(
    doc: typeof PDFDocument.prototype,
    label: string,
    code: string,
    cents: number,
    labelX: number,
    codeX: number,
    amountX: number,
  ): void {
    const y = doc.y;
    doc.text(label, labelX, y, { width: codeX - labelX - 5 });
    doc.text(code, codeX, y, { width: 60 });
    doc
      .font('Helvetica-Bold')
      .text(`R ${this.formatCents(cents)}`, amountX, y, {
        width: 140,
        align: 'right',
      });
    doc.font('Helvetica');
    doc.moveDown(0.5);
  }

  private formatCents(cents: number): string {
    return (cents / 100).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatDate(date: Date): string {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${d.toString().padStart(2, '0')}/${m.toString().padStart(2, '0')}/${y}`;
  }
}
