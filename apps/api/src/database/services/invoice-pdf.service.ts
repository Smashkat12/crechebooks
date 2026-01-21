import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { NotFoundException } from '../../shared/exceptions';

interface InvoiceWithRelations {
  id: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
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
    // TASK-BILL-043: Bank details for invoice PDF
    bankName: string | null;
    bankAccountHolder: string | null;
    bankAccountNumber: string | null;
    bankBranchCode: string | null;
    bankAccountType: string | null;
    bankSwiftCode: string | null;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  child: {
    firstName: string;
    lastName: string;
  };
  lines: Array<{
    description: string;
    quantity: Prisma.Decimal;
    unitPriceCents: number;
    discountCents: number;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    sortOrder: number;
  }>;
}

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
  ) {}

  /**
   * Generate PDF for an invoice
   * @param tenantId - Tenant ID for isolation
   * @param invoiceId - Invoice ID
   * @returns Buffer containing PDF data
   * @throws NotFoundException if invoice not found or belongs to another tenant
   */
  async generatePdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    this.logger.log(
      `Generating PDF for invoice ${invoiceId} for tenant ${tenantId}`,
    );

    try {
      // Fetch invoice with all required relations
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          tenant: true,
          parent: true,
          child: true,
          lines: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!invoice) {
        this.logger.error(`Invoice ${invoiceId} not found`);
        throw new NotFoundException('Invoice', invoiceId);
      }

      // Verify tenant isolation
      if (invoice.tenantId !== tenantId) {
        this.logger.error(
          `Invoice ${invoiceId} belongs to tenant ${invoice.tenantId}, not ${tenantId}`,
        );
        throw new NotFoundException('Invoice', invoiceId);
      }

      this.logger.debug(
        `Generating PDF for invoice ${invoice.invoiceNumber} with ${invoice.lines.length} line items`,
      );

      // Generate PDF
      const pdfBuffer = await this.createPdfDocument(
        invoice as InvoiceWithRelations,
      );

      this.logger.log(
        `PDF generated successfully for invoice ${invoice.invoiceNumber}, size: ${pdfBuffer.length} bytes`,
      );

      return pdfBuffer;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to generate PDF for invoice ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Create PDF document from invoice data
   */
  private async createPdfDocument(
    invoice: InvoiceWithRelations,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        // Collect PDF data
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header - Company Letterhead
        this.addHeader(doc, invoice.tenant);

        // Invoice Title and Number
        doc.moveDown(1);
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('INVOICE', { align: 'center' });
        doc.moveDown(0.5);
        doc
          .fontSize(14)
          .font('Helvetica')
          .text(`Invoice Number: ${invoice.invoiceNumber}`, {
            align: 'center',
          });

        // Invoice Details and Bill To in two columns
        doc.moveDown(2);
        const invoiceDetailsY = doc.y;

        // Left column: Invoice Details
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Invoice Details:', 50, invoiceDetailsY);
        doc.fontSize(9).font('Helvetica');
        doc.text(`Issue Date: ${this.formatDate(invoice.issueDate)}`, 50);
        doc.text(`Due Date: ${this.formatDate(invoice.dueDate)}`, 50);
        doc.text(
          `Billing Period: ${this.formatDate(invoice.billingPeriodStart)} - ${this.formatDate(invoice.billingPeriodEnd)}`,
          50,
        );

        // Right column: Bill To
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text('Bill To:', 320, invoiceDetailsY);
        doc.fontSize(9).font('Helvetica');
        doc.text(`${invoice.parent.firstName} ${invoice.parent.lastName}`, 320);
        if (invoice.parent.address) {
          doc.text(invoice.parent.address, 320);
        }
        if (invoice.parent.email) {
          doc.text(invoice.parent.email, 320);
        }
        if (invoice.parent.phone) {
          doc.text(invoice.parent.phone, 320);
        }

        // Child name
        doc.moveDown(1);
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(
            `Child: ${invoice.child.firstName} ${invoice.child.lastName}`,
            50,
          );

        // Line Items Table
        doc.moveDown(1.5);
        this.addLineItemsTable(doc, invoice.lines);

        // Totals
        doc.moveDown(1);
        this.addTotals(doc, invoice);

        // Banking Details
        doc.moveDown(2);
        const childFullName = `${invoice.child.firstName} ${invoice.child.lastName}`;
        this.addBankingDetails(doc, invoice.tenant, childFullName);

        // Notes
        if (invoice.notes) {
          doc.moveDown(1.5);
          doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50);
          doc.fontSize(9).font('Helvetica').text(invoice.notes, 50, undefined, {
            width: 500,
          });
        }

        // Footer
        this.addFooter(doc, invoice.tenant);

        // Finalize PDF
        doc.end();
      } catch (error) {
        this.logger.error(
          `Error creating PDF document for invoice ${invoice.invoiceNumber}`,
          error instanceof Error ? error.stack : String(error),
        );
        reject(error);
      }
    });
  }

  /**
   * Add company header/letterhead
   */
  private addHeader(
    doc: typeof PDFDocument.prototype,
    tenant: InvoiceWithRelations['tenant'],
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
   * Add line items table
   */
  private addLineItemsTable(
    doc: typeof PDFDocument.prototype,
    lines: InvoiceWithRelations['lines'],
  ): void {
    const tableTop = doc.y;
    const colWidths = {
      description: 200,
      quantity: 60,
      unitPrice: 80,
      subtotal: 80,
      vat: 60,
      total: 80,
    };

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, tableTop);
    doc.text('Qty', 260, tableTop, {
      width: colWidths.quantity,
      align: 'right',
    });
    doc.text('Unit Price', 320, tableTop, {
      width: colWidths.unitPrice,
      align: 'right',
    });
    doc.text('Subtotal', 400, tableTop, {
      width: colWidths.subtotal,
      align: 'right',
    });
    doc.text('VAT', 480, tableTop, { width: colWidths.vat, align: 'right' });
    doc.text('Total', 540, tableTop, {
      width: colWidths.total - 35,
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
      // Convert Decimal to number for display
      const quantityNum =
        typeof line.quantity === 'number'
          ? line.quantity
          : line.quantity.toNumber();

      doc.text(String(quantityNum), 260, rowY, {
        width: colWidths.quantity,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.unitPriceCents)}`, 320, rowY, {
        width: colWidths.unitPrice,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.subtotalCents)}`, 400, rowY, {
        width: colWidths.subtotal,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.vatCents)}`, 480, rowY, {
        width: colWidths.vat,
        align: 'right',
      });
      doc.text(`R ${this.formatCurrency(line.totalCents)}`, 505, rowY, {
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
    invoice: InvoiceWithRelations,
  ): void {
    const x = 400;
    const labelX = x;
    const valueX = x + 100;

    doc.fontSize(10).font('Helvetica-Bold');

    // Subtotal
    doc.text('Subtotal:', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(invoice.subtotalCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });

    doc.moveDown(0.5);

    // VAT
    doc.text('VAT (15%):', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(invoice.vatCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });

    doc.moveDown(0.5);

    // Total
    doc.fontSize(12);
    doc.text('Total:', labelX, doc.y);
    doc.text(`R ${this.formatCurrency(invoice.totalCents)}`, valueX, doc.y, {
      align: 'right',
      width: 95,
    });

    // Amount Paid (if any)
    if (invoice.amountPaidCents > 0) {
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text('Amount Paid:', labelX, doc.y);
      doc.text(
        `R ${this.formatCurrency(invoice.amountPaidCents)}`,
        valueX,
        doc.y,
        {
          align: 'right',
          width: 95,
        },
      );

      doc.moveDown(0.5);
      doc.fontSize(12);
      const balanceDue = invoice.totalCents - invoice.amountPaidCents;
      doc.text('Balance Due:', labelX, doc.y);
      doc.text(`R ${this.formatCurrency(balanceDue)}`, valueX, doc.y, {
        align: 'right',
        width: 95,
      });
    }
  }

  /**
   * Add banking details for payment
   * TASK-BILL-043: Uses real bank details from tenant configuration
   */
  private addBankingDetails(
    doc: typeof PDFDocument.prototype,
    tenant: InvoiceWithRelations['tenant'],
    childFullName: string,
  ): void {
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Banking Details for Payment:', 50);
    doc.fontSize(9).font('Helvetica');

    // TASK-BILL-043: Use real bank details from tenant, with fallback messages if not configured
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
      `Reference: Please use "${childFullName}" as the payment reference.`,
      50,
    );
  }

  /**
   * Add footer
   */
  private addFooter(
    doc: typeof PDFDocument.prototype,
    tenant: InvoiceWithRelations['tenant'],
  ): void {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Thank you for your business!',
        50,
        pageHeight - bottomMargin - 20,
        { align: 'center' },
      );
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Format currency (cents to rands with 2 decimal places)
   */
  private formatCurrency(cents: number): string {
    const rands = cents / 100;
    return rands.toFixed(2);
  }
}
