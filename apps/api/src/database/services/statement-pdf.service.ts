/**
 * Statement PDF Generation Service
 * TASK-STMT-005: Statement PDF Generation Service (Logic Layer)
 *
 * @module database/services/statement-pdf
 * @description Professional PDF generation for parent account statements.
 * Uses PDFKit for document creation with South African formatting.
 *
 * CRITICAL:
 * - All monetary values stored as CENTS (integers)
 * - Display format: R X XXX.XX (South African Rands)
 * - Date format: DD MMM YYYY (South African standard)
 * - No silent failures - throws errors with clear messages
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  Statement,
  StatementLine,
  Tenant,
  Parent,
  Child,
} from '@prisma/client';
import { TenantRepository } from '../repositories/tenant.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { StatementRepository } from '../repositories/statement.repository';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

/**
 * Options for PDF generation
 */
export interface StatementPdfOptions {
  /** Include payment instructions section */
  includePaymentInstructions?: boolean;
  /** Include remittance slip at bottom */
  includeRemittanceSlip?: boolean;
  /** Logo image buffer (PNG/JPEG) */
  logo?: Buffer;
  /** Primary brand color (hex) */
  primaryColor?: string;
}

/**
 * Internal type for statement with lines and parent data
 */
type StatementWithLines = Statement & { lines: StatementLine[] };

/**
 * Parent with children included
 */
type ParentWithChildren = Parent & { children: Child[] };

/**
 * PDF rendering constants
 */
const PDF_CONSTANTS = {
  // Page dimensions (A4)
  PAGE_WIDTH: 595.28,
  PAGE_HEIGHT: 841.89,
  MARGIN_LEFT: 50,
  MARGIN_RIGHT: 50,
  MARGIN_TOP: 50,
  MARGIN_BOTTOM: 50,

  // Colors
  DEFAULT_PRIMARY: '#2563eb',
  HEADER_BG: '#f8fafc',
  BORDER_COLOR: '#e2e8f0',
  TEXT_PRIMARY: '#1e293b',
  TEXT_SECONDARY: '#64748b',
  TEXT_MUTED: '#94a3b8',

  // Fonts
  FONT_SIZE_TITLE: 20,
  FONT_SIZE_HEADER: 14,
  FONT_SIZE_BODY: 10,
  FONT_SIZE_SMALL: 8,

  // Table
  TABLE_ROW_HEIGHT: 20,
  TABLE_HEADER_HEIGHT: 25,
} as const;

/**
 * South African month abbreviations
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

@Injectable()
export class StatementPdfService {
  private readonly logger = new Logger(StatementPdfService.name);

  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly parentRepo: ParentRepository,
    private readonly statementRepo: StatementRepository,
  ) {}

  /**
   * Generate PDF for a statement
   *
   * @param tenantId - Tenant ID for isolation
   * @param statementId - Statement ID to generate PDF for
   * @param options - PDF generation options
   * @returns PDF buffer
   * @throws NotFoundException if statement or tenant not found
   * @throws BusinessException for invalid data
   */
  async generatePdf(
    tenantId: string,
    statementId: string,
    options: StatementPdfOptions = {},
  ): Promise<Buffer> {
    this.logger.log(`Generating PDF for statement ${statementId}`);

    // 1. Load statement with lines
    const statement = await this.statementRepo.findByIdWithLines(
      statementId,
      tenantId,
    );
    if (!statement) {
      throw new NotFoundException('Statement', statementId);
    }

    // 2. Load tenant info
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // 3. Load parent data with children
    const parent = await this.parentRepo.findById(statement.parentId, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent', statement.parentId);
    }

    // 4. Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: PDF_CONSTANTS.MARGIN_TOP,
        bottom: PDF_CONSTANTS.MARGIN_BOTTOM,
        left: PDF_CONSTANTS.MARGIN_LEFT,
        right: PDF_CONSTANTS.MARGIN_RIGHT,
      },
      info: {
        Title: `Statement ${statement.statementNumber}`,
        Author: tenant.name,
        Subject: 'Account Statement',
        Creator: 'CrecheBooks',
      },
    });

    // Collect PDF chunks
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Wait for PDF to finish
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const primaryColor = options.primaryColor || PDF_CONSTANTS.DEFAULT_PRIMARY;

    // 5. Render PDF sections
    let yPosition: number = PDF_CONSTANTS.MARGIN_TOP;

    // Header with logo and tenant info
    yPosition = this.renderHeader(
      doc,
      tenant,
      statement,
      options.logo,
      primaryColor,
      yPosition,
    );

    // Parent details section
    yPosition = this.renderParentDetails(
      doc,
      parent as ParentWithChildren,
      yPosition,
    );

    // Statement summary
    yPosition = this.renderSummary(doc, statement, primaryColor, yPosition);

    // Transaction table
    yPosition = this.renderTransactionTable(
      doc,
      statement.lines,
      primaryColor,
      yPosition,
    );

    // Balance summary box
    yPosition = this.renderBalanceSummary(
      doc,
      statement,
      primaryColor,
      yPosition,
    );

    // Optional: Payment instructions
    if (options.includePaymentInstructions) {
      yPosition = this.renderPaymentInstructions(
        doc,
        tenant,
        primaryColor,
        yPosition,
      );
    }

    // Footer
    this.renderFooter(doc, tenant);

    // Finalize PDF
    doc.end();

    const pdfBuffer = await pdfPromise;
    this.logger.log(
      `Generated PDF for statement ${statement.statementNumber}: ${pdfBuffer.length} bytes`,
    );

    return pdfBuffer;
  }

  /**
   * Render header section with logo and tenant info
   */
  private renderHeader(
    doc: PDFKit.PDFDocument,
    tenant: Tenant,
    statement: Statement,
    logo: Buffer | undefined,
    primaryColor: string,
    startY: number,
  ): number {
    let y = startY;
    const contentWidth =
      PDF_CONSTANTS.PAGE_WIDTH -
      PDF_CONSTANTS.MARGIN_LEFT -
      PDF_CONSTANTS.MARGIN_RIGHT;

    // Logo (left side)
    if (logo) {
      try {
        doc.image(logo, PDF_CONSTANTS.MARGIN_LEFT, y, {
          width: 80,
          height: 60,
        });
      } catch (error) {
        this.logger.warn('Failed to render logo, skipping');
      }
    }

    // Tenant info (right aligned)
    const rightX = PDF_CONSTANTS.PAGE_WIDTH - PDF_CONSTANTS.MARGIN_RIGHT;

    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_HEADER)
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY)
      .text(tenant.tradingName || tenant.name, PDF_CONSTANTS.MARGIN_LEFT, y, {
        align: 'right',
        width: contentWidth,
      });

    y += 18;

    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL)
      .fillColor(PDF_CONSTANTS.TEXT_SECONDARY);

    // Address
    const addressParts = [
      tenant.addressLine1,
      tenant.addressLine2,
      `${tenant.city}, ${tenant.province} ${tenant.postalCode}`,
    ].filter(Boolean);

    for (const line of addressParts) {
      if (line) {
        doc.text(line, PDF_CONSTANTS.MARGIN_LEFT, y, {
          align: 'right',
          width: contentWidth,
        });
        y += 12;
      }
    }

    // Contact
    doc.text(`Tel: ${tenant.phone}`, PDF_CONSTANTS.MARGIN_LEFT, y, {
      align: 'right',
      width: contentWidth,
    });
    y += 12;
    doc.text(`Email: ${tenant.email}`, PDF_CONSTANTS.MARGIN_LEFT, y, {
      align: 'right',
      width: contentWidth,
    });
    y += 12;

    // VAT number if registered
    if (tenant.taxStatus === 'VAT_REGISTERED' && tenant.vatNumber) {
      doc.text(`VAT No: ${tenant.vatNumber}`, PDF_CONSTANTS.MARGIN_LEFT, y, {
        align: 'right',
        width: contentWidth,
      });
      y += 12;
    }

    y += 10;

    // Divider line
    doc
      .strokeColor(PDF_CONSTANTS.BORDER_COLOR)
      .lineWidth(1)
      .moveTo(PDF_CONSTANTS.MARGIN_LEFT, y)
      .lineTo(rightX, y)
      .stroke();

    y += 20;

    // Statement title
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_TITLE)
      .fillColor(primaryColor)
      .text('ACCOUNT STATEMENT', PDF_CONSTANTS.MARGIN_LEFT, y, {
        align: 'center',
        width: contentWidth,
      });

    y += 30;

    // Statement details
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY);

    const detailsX = PDF_CONSTANTS.MARGIN_LEFT + contentWidth / 2 - 80;

    doc.text(`Statement No: ${statement.statementNumber}`, detailsX, y);
    y += 14;
    doc.text(
      `Period: ${this.formatDate(statement.periodStart)} - ${this.formatDate(statement.periodEnd)}`,
      detailsX,
      y,
    );
    y += 14;
    doc.text(`Date: ${this.formatDate(statement.createdAt)}`, detailsX, y);
    y += 25;

    return y;
  }

  /**
   * Render parent details section
   */
  private renderParentDetails(
    doc: PDFKit.PDFDocument,
    parent: ParentWithChildren,
    startY: number,
  ): number {
    let y = startY;

    // "TO:" label
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(PDF_CONSTANTS.TEXT_SECONDARY)
      .text('TO:', PDF_CONSTANTS.MARGIN_LEFT, y);
    y += 14;

    // Parent name
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY)
      .font('Helvetica-Bold')
      .text(
        `${parent.firstName} ${parent.lastName}`,
        PDF_CONSTANTS.MARGIN_LEFT,
        y,
      );
    y += 14;

    doc.font('Helvetica');

    // Email
    if (parent.email) {
      doc
        .fillColor(PDF_CONSTANTS.TEXT_SECONDARY)
        .text(parent.email, PDF_CONSTANTS.MARGIN_LEFT, y);
      y += 12;
    }

    // Phone
    if (parent.phone) {
      doc.text(`Tel: ${parent.phone}`, PDF_CONSTANTS.MARGIN_LEFT, y);
      y += 12;
    }

    // Children
    if (parent.children && parent.children.length > 0) {
      const childNames = parent.children.map((c) => c.firstName).join(', ');
      doc.text(`Children: ${childNames}`, PDF_CONSTANTS.MARGIN_LEFT, y);
      y += 12;
    }

    y += 15;

    return y;
  }

  /**
   * Render statement summary section
   */
  private renderSummary(
    doc: PDFKit.PDFDocument,
    statement: Statement,
    primaryColor: string,
    startY: number,
  ): number {
    // This section is minimal - the main summary is in the balance box
    return startY;
  }

  /**
   * Render transaction table with running balance
   */
  private renderTransactionTable(
    doc: PDFKit.PDFDocument,
    lines: StatementLine[],
    primaryColor: string,
    startY: number,
  ): number {
    let y = startY;
    const contentWidth =
      PDF_CONSTANTS.PAGE_WIDTH -
      PDF_CONSTANTS.MARGIN_LEFT -
      PDF_CONSTANTS.MARGIN_RIGHT;

    // Table column widths
    const cols = {
      date: 70,
      description: 180,
      reference: 80,
      debit: 70,
      credit: 70,
      balance: 75,
    };

    const startX = PDF_CONSTANTS.MARGIN_LEFT;

    // Table header background
    doc
      .rect(startX, y, contentWidth, PDF_CONSTANTS.TABLE_HEADER_HEIGHT)
      .fill(PDF_CONSTANTS.HEADER_BG);

    // Table header text
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL)
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY)
      .font('Helvetica-Bold');

    const headerY = y + 8;
    let colX = startX + 5;

    doc.text('Date', colX, headerY, { width: cols.date - 5 });
    colX += cols.date;
    doc.text('Description', colX, headerY, { width: cols.description - 5 });
    colX += cols.description;
    doc.text('Reference', colX, headerY, { width: cols.reference - 5 });
    colX += cols.reference;
    doc.text('Debit (R)', colX, headerY, {
      width: cols.debit - 5,
      align: 'right',
    });
    colX += cols.debit;
    doc.text('Credit (R)', colX, headerY, {
      width: cols.credit - 5,
      align: 'right',
    });
    colX += cols.credit;
    doc.text('Balance (R)', colX, headerY, {
      width: cols.balance - 10,
      align: 'right',
    });

    y += PDF_CONSTANTS.TABLE_HEADER_HEIGHT;

    // Table border
    doc.strokeColor(PDF_CONSTANTS.BORDER_COLOR).lineWidth(0.5);

    // Table rows
    doc.font('Helvetica').fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we need a new page
      if (
        y + PDF_CONSTANTS.TABLE_ROW_HEIGHT >
        PDF_CONSTANTS.PAGE_HEIGHT - PDF_CONSTANTS.MARGIN_BOTTOM - 150
      ) {
        doc.addPage();
        y = PDF_CONSTANTS.MARGIN_TOP;

        // Re-render header on new page
        doc
          .rect(startX, y, contentWidth, PDF_CONSTANTS.TABLE_HEADER_HEIGHT)
          .fill(PDF_CONSTANTS.HEADER_BG);

        doc
          .fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL)
          .fillColor(PDF_CONSTANTS.TEXT_PRIMARY)
          .font('Helvetica-Bold');

        const newHeaderY = y + 8;
        let newColX = startX + 5;

        doc.text('Date', newColX, newHeaderY, { width: cols.date - 5 });
        newColX += cols.date;
        doc.text('Description', newColX, newHeaderY, {
          width: cols.description - 5,
        });
        newColX += cols.description;
        doc.text('Reference', newColX, newHeaderY, {
          width: cols.reference - 5,
        });
        newColX += cols.reference;
        doc.text('Debit (R)', newColX, newHeaderY, {
          width: cols.debit - 5,
          align: 'right',
        });
        newColX += cols.debit;
        doc.text('Credit (R)', newColX, newHeaderY, {
          width: cols.credit - 5,
          align: 'right',
        });
        newColX += cols.credit;
        doc.text('Balance (R)', newColX, newHeaderY, {
          width: cols.balance - 10,
          align: 'right',
        });

        y += PDF_CONSTANTS.TABLE_HEADER_HEIGHT;
        doc.font('Helvetica');
      }

      // Alternating row background
      if (i % 2 === 1) {
        doc
          .rect(startX, y, contentWidth, PDF_CONSTANTS.TABLE_ROW_HEIGHT)
          .fill('#fafafa');
      }

      // Row content
      doc.fillColor(PDF_CONSTANTS.TEXT_PRIMARY);
      const rowY = y + 6;
      colX = startX + 5;

      // Date
      doc.text(this.formatDate(line.date), colX, rowY, {
        width: cols.date - 5,
      });
      colX += cols.date;

      // Description (truncate if too long)
      const description =
        line.description.length > 35
          ? line.description.substring(0, 32) + '...'
          : line.description;
      doc.text(description, colX, rowY, { width: cols.description - 5 });
      colX += cols.description;

      // Reference
      doc.text(line.referenceNumber || '', colX, rowY, {
        width: cols.reference - 5,
      });
      colX += cols.reference;

      // Debit
      const debitText =
        line.debitCents > 0 ? this.formatCurrencyValue(line.debitCents) : '';
      doc.text(debitText, colX, rowY, {
        width: cols.debit - 5,
        align: 'right',
      });
      colX += cols.debit;

      // Credit
      const creditText =
        line.creditCents > 0 ? this.formatCurrencyValue(line.creditCents) : '';
      doc.text(creditText, colX, rowY, {
        width: cols.credit - 5,
        align: 'right',
      });
      colX += cols.credit;

      // Balance (with color for negative)
      const balanceColor =
        line.balanceCents < 0 ? '#dc2626' : PDF_CONSTANTS.TEXT_PRIMARY;
      doc
        .fillColor(balanceColor)
        .text(this.formatCurrencyValue(line.balanceCents), colX, rowY, {
          width: cols.balance - 10,
          align: 'right',
        });

      y += PDF_CONSTANTS.TABLE_ROW_HEIGHT;

      // Draw row bottom border
      doc
        .strokeColor(PDF_CONSTANTS.BORDER_COLOR)
        .moveTo(startX, y)
        .lineTo(startX + contentWidth, y)
        .stroke();
    }

    y += 10;

    return y;
  }

  /**
   * Render balance summary box
   */
  private renderBalanceSummary(
    doc: PDFKit.PDFDocument,
    statement: Statement,
    primaryColor: string,
    startY: number,
  ): number {
    let y = startY;
    const contentWidth =
      PDF_CONSTANTS.PAGE_WIDTH -
      PDF_CONSTANTS.MARGIN_LEFT -
      PDF_CONSTANTS.MARGIN_RIGHT;

    // Summary box
    const boxWidth = 280;
    const boxX =
      PDF_CONSTANTS.PAGE_WIDTH - PDF_CONSTANTS.MARGIN_RIGHT - boxWidth;
    const boxHeight = 130;

    // Check if we need a new page
    if (
      y + boxHeight >
      PDF_CONSTANTS.PAGE_HEIGHT - PDF_CONSTANTS.MARGIN_BOTTOM - 80
    ) {
      doc.addPage();
      y = PDF_CONSTANTS.MARGIN_TOP;
    }

    // Box background
    doc.rect(boxX, y, boxWidth, boxHeight).fill(PDF_CONSTANTS.HEADER_BG);

    // Box border
    doc
      .strokeColor(primaryColor)
      .lineWidth(2)
      .rect(boxX, y, boxWidth, boxHeight)
      .stroke();

    // Box title
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text('ACCOUNT SUMMARY', boxX + 15, y + 12);

    y += 35;
    doc
      .font('Helvetica')
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY);

    const labelX = boxX + 15;
    const valueX = boxX + boxWidth - 15;
    const labelWidth = 150;
    const valueWidth = 100;

    // Opening Balance
    doc.text('Opening Balance:', labelX, y, { width: labelWidth });
    doc.text(
      this.formatCurrency(statement.openingBalanceCents),
      valueX - valueWidth,
      y,
      {
        width: valueWidth,
        align: 'right',
      },
    );
    y += 16;

    // Total Charges
    doc.text('Total Charges:', labelX, y, { width: labelWidth });
    doc.text(
      this.formatCurrency(statement.totalChargesCents),
      valueX - valueWidth,
      y,
      {
        width: valueWidth,
        align: 'right',
      },
    );
    y += 16;

    // Total Payments
    doc.text('Total Payments:', labelX, y, { width: labelWidth });
    doc.text(
      `(${this.formatCurrency(statement.totalPaymentsCents)})`,
      valueX - valueWidth,
      y,
      {
        width: valueWidth,
        align: 'right',
      },
    );
    y += 16;

    // Total Credits (if any)
    if (statement.totalCreditsCents && statement.totalCreditsCents > 0) {
      doc.text('Total Credits:', labelX, y, { width: labelWidth });
      doc.text(
        `(${this.formatCurrency(statement.totalCreditsCents)})`,
        valueX - valueWidth,
        y,
        {
          width: valueWidth,
          align: 'right',
        },
      );
      y += 16;
    }

    // Divider
    doc
      .strokeColor(PDF_CONSTANTS.BORDER_COLOR)
      .lineWidth(1)
      .moveTo(labelX, y)
      .lineTo(valueX, y)
      .stroke();

    y += 8;

    // Amount Due
    const amountDueColor =
      statement.closingBalanceCents > 0 ? '#dc2626' : '#16a34a';
    doc
      .font('Helvetica-Bold')
      .fillColor(amountDueColor)
      .text('Amount Due:', labelX, y, { width: labelWidth });
    doc.text(
      this.formatCurrency(statement.closingBalanceCents),
      valueX - valueWidth,
      y,
      {
        width: valueWidth,
        align: 'right',
      },
    );

    y = startY + boxHeight + 20;

    return y;
  }

  /**
   * Render payment instructions section
   */
  private renderPaymentInstructions(
    doc: PDFKit.PDFDocument,
    tenant: Tenant,
    primaryColor: string,
    startY: number,
  ): number {
    let y = startY;
    const contentWidth =
      PDF_CONSTANTS.PAGE_WIDTH -
      PDF_CONSTANTS.MARGIN_LEFT -
      PDF_CONSTANTS.MARGIN_RIGHT;

    // Check if we need a new page
    if (
      y + 100 >
      PDF_CONSTANTS.PAGE_HEIGHT - PDF_CONSTANTS.MARGIN_BOTTOM - 50
    ) {
      doc.addPage();
      y = PDF_CONSTANTS.MARGIN_TOP;
    }

    // Section title
    doc
      .fontSize(PDF_CONSTANTS.FONT_SIZE_BODY)
      .fillColor(primaryColor)
      .font('Helvetica-Bold')
      .text('PAYMENT INSTRUCTIONS', PDF_CONSTANTS.MARGIN_LEFT, y);

    y += 18;

    doc
      .font('Helvetica')
      .fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL)
      .fillColor(PDF_CONSTANTS.TEXT_SECONDARY);

    // Generic payment instructions
    doc.text(
      'Please use your statement number as the payment reference.',
      PDF_CONSTANTS.MARGIN_LEFT,
      y,
    );
    y += 12;
    doc.text(
      'For EFT payments, please email proof of payment to:',
      PDF_CONSTANTS.MARGIN_LEFT,
      y,
    );
    y += 12;
    doc
      .fillColor(PDF_CONSTANTS.TEXT_PRIMARY)
      .text(tenant.email, PDF_CONSTANTS.MARGIN_LEFT, y);
    y += 20;

    return y;
  }

  /**
   * Render footer on each page
   */
  private renderFooter(doc: PDFKit.PDFDocument, tenant: Tenant): void {
    const footerY =
      PDF_CONSTANTS.PAGE_HEIGHT - PDF_CONSTANTS.MARGIN_BOTTOM + 10;
    const contentWidth =
      PDF_CONSTANTS.PAGE_WIDTH -
      PDF_CONSTANTS.MARGIN_LEFT -
      PDF_CONSTANTS.MARGIN_RIGHT;

    // Add footer to each page
    const pages = (
      doc as unknown as {
        bufferedPageRange: () => { start: number; count: number };
      }
    ).bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Divider line
      doc
        .strokeColor(PDF_CONSTANTS.BORDER_COLOR)
        .lineWidth(0.5)
        .moveTo(PDF_CONSTANTS.MARGIN_LEFT, footerY - 5)
        .lineTo(
          PDF_CONSTANTS.PAGE_WIDTH - PDF_CONSTANTS.MARGIN_RIGHT,
          footerY - 5,
        )
        .stroke();

      // Footer text
      doc
        .fontSize(PDF_CONSTANTS.FONT_SIZE_SMALL)
        .fillColor(PDF_CONSTANTS.TEXT_MUTED)
        .text(
          `Generated by CrecheBooks | Page ${i + 1} of ${pages.count}`,
          PDF_CONSTANTS.MARGIN_LEFT,
          footerY,
          { align: 'center', width: contentWidth },
        );
    }
  }

  /**
   * Format date to South African format: DD MMM YYYY
   *
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }

  /**
   * Format cents to South African currency: R X XXX.XX
   *
   * @param cents - Amount in cents (integer)
   * @returns Formatted currency string with R prefix
   */
  private formatCurrency(cents: number): string {
    const rands = cents / 100;
    const absRands = Math.abs(rands);
    const formatted = absRands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (cents < 0) {
      return `(R ${formatted})`;
    }
    return `R ${formatted}`;
  }

  /**
   * Format cents to value only (no R prefix) for table columns
   *
   * @param cents - Amount in cents (integer)
   * @returns Formatted value string
   */
  private formatCurrencyValue(cents: number): string {
    const rands = Math.abs(cents) / 100;
    const formatted = rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (cents < 0) {
      return `(${formatted})`;
    }
    return formatted;
  }
}
