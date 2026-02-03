/**
 * Quote PDF Service
 * TASK-QUOTE-001: Quote PDF Generation and Email Delivery
 *
 * @module database/services/quote-pdf
 * @description Generates professional PDF documents for quotes.
 * Follows the same pattern as invoice-pdf.service.ts.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Tenant isolation is enforced at query level.
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../../shared/exceptions';

interface QuoteWithRelations {
  id: string;
  quoteNumber: string;
  quoteDate: Date;
  expiryDate: Date;
  validityDays: number;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string | null;
  childName: string | null;
  expectedStartDate: Date | null;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  notes: string | null;
  tenant: {
    name: string;
    tradingName: string | null;
    vatNumber: string | null;
    registrationNumber: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    province: string;
    postalCode: string;
    phone: string;
    email: string;
    bankName: string | null;
    bankAccountHolder: string | null;
    bankAccountNumber: string | null;
    bankBranchCode: string | null;
    bankAccountType: string | null;
    bankSwiftCode: string | null;
  };
  lines: Array<{
    lineNumber: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    vatType: string;
  }>;
}

@Injectable()
export class QuotePdfService {
  private readonly logger = new Logger(QuotePdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate PDF for a quote
   * @param tenantId - Tenant ID for isolation
   * @param quoteId - Quote ID
   * @returns Buffer containing PDF data
   * @throws NotFoundException if quote not found or belongs to another tenant
   */
  async generatePdf(tenantId: string, quoteId: string): Promise<Buffer> {
    this.logger.log(
      `Generating PDF for quote ${quoteId} for tenant ${tenantId}`,
    );

    try {
      // Fetch quote with all required relations
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          tenant: true,
          lines: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!quote) {
        this.logger.error(`Quote ${quoteId} not found`);
        throw new NotFoundException('Quote', quoteId);
      }

      // Verify tenant isolation
      if (quote.tenantId !== tenantId) {
        this.logger.error(
          `Quote ${quoteId} belongs to tenant ${quote.tenantId}, not ${tenantId}`,
        );
        throw new NotFoundException('Quote', quoteId);
      }

      this.logger.debug(
        `Generating PDF for quote ${quote.quoteNumber} with ${quote.lines.length} line items`,
      );

      // Generate PDF
      const pdfBuffer = await this.createPdfDocument(
        quote as QuoteWithRelations,
      );

      this.logger.log(
        `PDF generated successfully for quote ${quote.quoteNumber}, size: ${pdfBuffer.length} bytes`,
      );

      return pdfBuffer;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to generate PDF for quote ${quoteId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Create PDF document from quote data
   */
  private async createPdfDocument(quote: QuoteWithRelations): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        // Collect PDF data
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header - Company Letterhead
        this.addHeader(doc, quote.tenant);

        // Quote Title and Number
        this.addQuoteTitle(doc, quote);

        // Quote Details and Recipient in two columns
        doc.moveDown(2);
        const detailsY = doc.y;

        // Left column: Quote Details
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Quote Details:', 50, detailsY);
        doc.fontSize(9).font('Helvetica');
        doc.text(`Quote Date: ${this.formatDate(quote.quoteDate)}`, 50);
        doc.text(`Valid Until: ${this.formatDate(quote.expiryDate)}`, 50);
        if (quote.expectedStartDate) {
          doc.text(
            `Expected Start: ${this.formatDate(quote.expectedStartDate)}`,
            50,
          );
        }

        // Right column: Recipient
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Prepared For:', 320, detailsY);
        doc.fontSize(9).font('Helvetica');
        doc.text(quote.recipientName, 320);
        doc.text(quote.recipientEmail, 320);
        if (quote.recipientPhone) {
          doc.text(quote.recipientPhone, 320);
        }

        // Child name if applicable
        if (quote.childName) {
          doc.moveDown(1);
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`Child: ${quote.childName}`, 50);
        }

        // Line Items Table
        doc.moveDown(1.5);
        this.addLineItemsTable(doc, quote.lines);

        // Totals
        doc.moveDown(1);
        this.addTotals(doc, quote);

        // Validity Notice
        this.addValidityNotice(doc, quote);

        // Banking Details (for deposit payments)
        doc.moveDown(2);
        const reference = quote.childName || quote.quoteNumber;
        this.addBankingDetails(doc, quote.tenant, reference);

        // Notes
        if (quote.notes) {
          doc.moveDown(1.5);
          doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50);
          doc.fontSize(9).font('Helvetica').text(quote.notes, 50, undefined, {
            width: 500,
          });
        }

        // Footer
        this.addFooter(doc, quote.tenant);

        // Finalize PDF
        doc.end();
      } catch (error) {
        this.logger.error(
          `Error creating PDF document for quote ${quote.quoteNumber}`,
          error instanceof Error ? error.stack : String(error),
        );
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Add company header/letterhead
   */
  private addHeader(
    doc: typeof PDFDocument.prototype,
    tenant: QuoteWithRelations['tenant'],
  ): void {
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(tenant.tradingName ?? tenant.name, {
        align: 'center',
      });

    doc.fontSize(9).font('Helvetica');
    doc.text(tenant.addressLine1, { align: 'center' });
    if (tenant.addressLine2) {
      doc.text(tenant.addressLine2, { align: 'center' });
    }
    doc.text(`${tenant.city}, ${tenant.province} ${tenant.postalCode}`, {
      align: 'center',
    });
    doc.text(`Tel: ${tenant.phone} | Email: ${tenant.email}`, {
      align: 'center',
    });

    if (tenant.vatNumber) {
      doc.text(`VAT Number: ${tenant.vatNumber}`, { align: 'center' });
    }
    if (tenant.registrationNumber) {
      doc.text(`Registration Number: ${tenant.registrationNumber}`, {
        align: 'center',
      });
    }

    // Horizontal line
    doc
      .moveTo(50, doc.y + 10)
      .lineTo(545, doc.y + 10)
      .stroke();
  }

  /**
   * Add quote title section
   */
  private addQuoteTitle(
    doc: typeof PDFDocument.prototype,
    quote: QuoteWithRelations,
  ): void {
    doc.moveDown(1);
    doc.fontSize(24).font('Helvetica-Bold').text('QUOTE', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .font('Helvetica')
      .text(`Quote Number: ${quote.quoteNumber}`, { align: 'center' });
    doc.fontSize(10).text(`Valid until: ${this.formatDate(quote.expiryDate)}`, {
      align: 'center',
    });
  }

  /**
   * Add line items table
   */
  private addLineItemsTable(
    doc: typeof PDFDocument.prototype,
    lines: QuoteWithRelations['lines'],
  ): void {
    const tableTop = doc.y;
    const colWidths = {
      description: 250,
      quantity: 60,
      unitPrice: 90,
      total: 90,
    };

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, tableTop);
    doc.text('Qty', 310, tableTop, {
      width: colWidths.quantity,
      align: 'right',
    });
    doc.text('Unit Price', 370, tableTop, {
      width: colWidths.unitPrice,
      align: 'right',
    });
    doc.text('Total', 460, tableTop, {
      width: colWidths.total,
      align: 'right',
    });

    // Header line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();

    doc.moveDown(0.5);

    // Table rows
    doc.font('Helvetica');
    for (const line of lines) {
      const rowY = doc.y;

      // Description (may wrap)
      doc.text(line.description, 50, rowY, { width: colWidths.description });

      // Numbers (aligned right, on same line as description start)
      doc.text(String(line.quantity), 310, rowY, {
        width: colWidths.quantity,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.unitPriceCents)}`, 370, rowY, {
        width: colWidths.unitPrice,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.lineTotalCents)}`, 460, rowY, {
        width: colWidths.total,
        align: 'right',
      });

      doc.moveDown(0.8);
    }

    // Bottom line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();
  }

  /**
   * Add totals section
   */
  private addTotals(
    doc: typeof PDFDocument.prototype,
    quote: QuoteWithRelations,
  ): void {
    const x = 400;
    const labelX = x;
    const valueX = x + 100;

    doc.fontSize(10).font('Helvetica-Bold');

    // Subtotal
    doc.text('Subtotal:', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(quote.subtotalCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });

    doc.moveDown(0.5);

    // VAT
    doc.text('VAT (15%):', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(quote.vatAmountCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });

    doc.moveDown(0.5);

    // Total
    doc.fontSize(12);
    doc.text('Total:', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(quote.totalCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });
  }

  /**
   * Add validity notice
   */
  private addValidityNotice(
    doc: typeof PDFDocument.prototype,
    quote: QuoteWithRelations,
  ): void {
    doc.moveDown(1.5);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(
        `This quote is valid for ${quote.validityDays} days from ${this.formatDate(quote.quoteDate)}.`,
        50,
      );
    doc
      .font('Helvetica')
      .text('Prices may be subject to change after the expiry date.', 50);
  }

  /**
   * Add banking details for deposit payments
   */
  private addBankingDetails(
    doc: typeof PDFDocument.prototype,
    tenant: QuoteWithRelations['tenant'],
    reference: string,
  ): void {
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Banking Details for Deposit Payment:', 50);
    doc.fontSize(9).font('Helvetica');

    const hasBankDetails = tenant.bankName && tenant.bankAccountNumber;

    if (hasBankDetails) {
      doc.text(`Bank: ${tenant.bankName}`, 50);
      doc.text(
        `Account Holder: ${tenant.bankAccountHolder ?? tenant.tradingName ?? tenant.name}`,
        50,
      );
      doc.text(`Account Number: ${tenant.bankAccountNumber}`, 50);
      if (tenant.bankBranchCode) {
        doc.text(`Branch Code: ${tenant.bankBranchCode}`, 50);
      }
      if (tenant.bankAccountType) {
        doc.text(`Account Type: ${tenant.bankAccountType}`, 50);
      }
      if (tenant.bankSwiftCode) {
        doc.text(`SWIFT Code: ${tenant.bankSwiftCode}`, 50);
      }
    } else {
      doc
        .font('Helvetica-Oblique')
        .text(
          'Banking details not configured - please contact us for payment information',
          50,
        );
      doc.font('Helvetica');
    }

    doc.text(
      `Reference: Please use "${reference}" as the payment reference.`,
      50,
    );
  }

  /**
   * Add footer
   */
  private addFooter(
    doc: typeof PDFDocument.prototype,
    _tenant: QuoteWithRelations['tenant'],
  ): void {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Thank you for considering our services!',
        50,
        pageHeight - bottomMargin - 20,
        { align: 'center' },
      );
  }

  /**
   * Format date as DD/MM/YYYY (South African format)
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Format currency (cents to rands with 2 decimal places)
   */
  private formatCurrency(cents: number): string {
    const rands = cents / 100;
    return rands.toFixed(2);
  }
}
