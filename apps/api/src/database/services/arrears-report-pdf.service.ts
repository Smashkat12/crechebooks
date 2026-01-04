/**
 * Arrears Report PDF Service
 * TASK-PAY-017: Arrears Report PDF Export
 *
 * @module database/services/arrears-report-pdf
 * @description Generates professional PDF reports for arrears data including
 * aging analysis charts, detailed debtor tables, and summary statistics.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: Maximum 50 pages with automatic pagination.
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { ArrearsService } from './arrears.service';
import { TenantRepository } from '../repositories/tenant.repository';
import {
  ArrearsFiltersDto,
  ArrearsReport,
  ArrearsReportSummary,
  DebtorSummary,
  ArrearsInvoice,
  AgingBuckets,
} from '../dto/arrears.dto';
import { NotFoundException, DatabaseException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Options for PDF generation
 */
export interface ArrearsReportOptions extends ArrearsFiltersDto {
  /** Include detailed invoice breakdown */
  includeDetailedInvoices?: boolean;

  /** Include top debtors section */
  includeTopDebtors?: boolean;

  /** Number of top debtors to display (default: 10) */
  topDebtorsLimit?: number;
}

/**
 * Tenant information for PDF header
 */
interface TenantInfo {
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
}

@Injectable()
export class ArrearsReportPdfService {
  private readonly logger = new Logger(ArrearsReportPdfService.name);
  private readonly MAX_PAGES = 50;
  private readonly ITEMS_PER_PAGE = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly arrearsService: ArrearsService,
    private readonly tenantRepo: TenantRepository,
  ) {}

  /**
   * Generate PDF for arrears report
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param options - Report options and filters
   * @returns Buffer containing PDF data
   *
   * @throws NotFoundException if tenant doesn't exist
   * @throws DatabaseException for database errors
   */
  async generatePdf(
    tenantId: string,
    options: ArrearsReportOptions = {},
  ): Promise<Buffer> {
    this.logger.log(`Generating arrears PDF for tenant ${tenantId}`);

    try {
      // Verify tenant exists
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new NotFoundException('Tenant', tenantId);
      }

      // Fetch arrears report data
      const report = await this.arrearsService.getArrearsReport(
        tenantId,
        options,
      );

      this.logger.debug(
        `Generating PDF for ${report.summary.totalInvoices} invoices, R${(report.summary.totalOutstandingCents / 100).toFixed(2)} outstanding`,
      );

      // Generate PDF
      const pdfBuffer = await this.createPdfDocument(
        tenant as TenantInfo,
        report,
        options,
      );

      this.logger.log(
        `Arrears PDF generated successfully, size: ${pdfBuffer.length} bytes`,
      );

      return pdfBuffer;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to generate arrears PDF for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new DatabaseException(
        'generatePdf',
        'Failed to generate arrears PDF',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create PDF document from arrears data
   */
  private async createPdfDocument(
    tenant: TenantInfo,
    report: ArrearsReport,
    options: ArrearsReportOptions,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        // Collect PDF data
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let pageCount = 1;

        // Header - Company letterhead
        this.buildHeader(doc, tenant);

        // Report Title
        doc.moveDown(1);
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('ARREARS REPORT', { align: 'center' });

        // Generation timestamp
        doc.moveDown(0.5);
        doc
          .fontSize(10)
          .font('Helvetica')
          .text(`Generated: ${this.formatDateTime(report.generatedAt)}`, {
            align: 'center',
          });

        // Summary Section
        doc.moveDown(2);
        this.buildSummary(doc, report.summary);

        // Aging Chart
        doc.moveDown(1.5);
        this.buildAgingChart(doc, report.summary.aging);

        // Top Debtors Section
        if (
          options.includeTopDebtors !== false &&
          report.topDebtors.length > 0
        ) {
          doc.addPage();
          pageCount++;
          this.buildTopDebtorsTable(
            doc,
            report.topDebtors.slice(0, options.topDebtorsLimit || 10),
          );
        }

        // Detailed Invoice Table
        if (
          options.includeDetailedInvoices !== false &&
          report.invoices.length > 0
        ) {
          // Check page limit
          const estimatedPages = Math.ceil(
            report.invoices.length / this.ITEMS_PER_PAGE,
          );

          if (pageCount + estimatedPages > this.MAX_PAGES) {
            this.logger.warn(
              `Report would exceed ${this.MAX_PAGES} pages. Truncating invoice details.`,
            );
          }

          doc.addPage();
          pageCount++;

          const maxInvoices = Math.min(
            report.invoices.length,
            (this.MAX_PAGES - pageCount) * this.ITEMS_PER_PAGE,
          );

          this.buildDetailTable(doc, report.invoices.slice(0, maxInvoices));

          if (maxInvoices < report.invoices.length) {
            doc.moveDown(1);
            doc
              .fontSize(9)
              .font('Helvetica-Oblique')
              .text(
                `Note: Showing ${maxInvoices} of ${report.invoices.length} invoices due to page limit.`,
                { align: 'center' },
              );
          }
        }

        // Footer on last page
        this.buildFooter(doc, report.generatedAt);

        // Finalize PDF
        doc.end();
      } catch (error) {
        this.logger.error(
          'Error creating arrears PDF document',
          error instanceof Error ? error.stack : String(error),
        );
        reject(error);
      }
    });
  }

  /**
   * Build PDF header with tenant information
   */
  buildHeader(doc: typeof PDFDocument.prototype, tenant: TenantInfo): void {
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(tenant.tradingName ?? tenant.name, { align: 'center' });

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
   * Build summary statistics section
   */
  buildSummary(
    doc: typeof PDFDocument.prototype,
    summary: ArrearsReportSummary,
  ): void {
    doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics', 50);

    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');

    const summaryY = doc.y;
    const col1X = 70;
    const col2X = 320;

    // Left column
    doc.text(`Total Outstanding Amount:`, col1X, summaryY);
    doc
      .font('Helvetica-Bold')
      .text(
        `R ${this.formatCurrency(summary.totalOutstandingCents)}`,
        col1X,
        summaryY + 20,
      );

    // Right column
    doc.font('Helvetica').text(`Total Overdue Invoices:`, col2X, summaryY);
    doc
      .font('Helvetica-Bold')
      .text(`${summary.totalInvoices}`, col2X, summaryY + 20);

    doc.moveDown(3);

    // Horizontal line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();
  }

  /**
   * Build aging analysis chart (visual representation)
   */
  buildAgingChart(
    doc: typeof PDFDocument.prototype,
    aging: AgingBuckets,
  ): void {
    doc.fontSize(14).font('Helvetica-Bold').text('Aging Analysis', 50);

    doc.moveDown(1);

    const chartY = doc.y;
    const barHeight = 30;
    const barSpacing = 15;
    const maxBarWidth = 300;

    // Calculate total for percentage
    const total =
      aging.currentCents +
      aging.days30Cents +
      aging.days60Cents +
      aging.days90PlusCents;

    const buckets = [
      { label: '0-7 days', amount: aging.currentCents, color: '#90EE90' },
      { label: '8-30 days', amount: aging.days30Cents, color: '#FFD700' },
      { label: '31-60 days', amount: aging.days60Cents, color: '#FFA500' },
      { label: '61+ days', amount: aging.days90PlusCents, color: '#FF6347' },
    ];

    let currentY = chartY;

    for (const bucket of buckets) {
      // Label
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(bucket.label, 50, currentY + 8);

      // Bar
      const barWidth = total > 0 ? (bucket.amount / total) * maxBarWidth : 0;
      doc
        .rect(150, currentY, Math.max(barWidth, 1), barHeight)
        .fillAndStroke(bucket.color, '#000000');

      // Amount and percentage
      const percentage = total > 0 ? (bucket.amount / total) * 100 : 0;
      doc
        .fontSize(9)
        .fillColor('#000000')
        .font('Helvetica')
        .text(
          `R ${this.formatCurrency(bucket.amount)} (${percentage.toFixed(1)}%)`,
          460,
          currentY + 8,
        );

      currentY += barHeight + barSpacing;
    }

    doc.moveDown(2);
  }

  /**
   * Build top debtors table
   */
  private buildTopDebtorsTable(
    doc: typeof PDFDocument.prototype,
    debtors: DebtorSummary[],
  ): void {
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Top Debtors by Outstanding Amount', 50);

    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('#', 50, tableTop, { width: 20 });
    doc.text('Parent Name', 75, tableTop, { width: 150 });
    doc.text('Contact', 230, tableTop, { width: 120 });
    doc.text('Invoices', 355, tableTop, { width: 50, align: 'right' });
    doc.text('Days', 410, tableTop, { width: 40, align: 'right' });
    doc.text('Outstanding', 455, tableTop, { width: 90, align: 'right' });

    // Header line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();

    doc.moveDown(0.5);

    // Table rows
    doc.font('Helvetica');
    debtors.forEach((debtor, index) => {
      const rowY = doc.y;

      doc.text(`${index + 1}`, 50, rowY, { width: 20 });
      doc.text(debtor.parentName, 75, rowY, { width: 150 });
      doc.text(debtor.parentEmail || debtor.parentPhone || 'N/A', 230, rowY, {
        width: 120,
      });
      doc.text(`${debtor.invoiceCount}`, 355, rowY, {
        width: 50,
        align: 'right',
      });
      doc.text(`${debtor.maxDaysOverdue}`, 410, rowY, {
        width: 40,
        align: 'right',
      });
      doc.text(
        `R ${this.formatCurrency(debtor.totalOutstandingCents)}`,
        455,
        rowY,
        {
          width: 90,
          align: 'right',
        },
      );

      doc.moveDown(0.8);

      // Add page break if needed
      if (doc.y > 700 && index < debtors.length - 1) {
        doc.addPage();
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Top Debtors (continued)', 50);
        doc.moveDown(1);
      }
    });

    // Bottom line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();
  }

  /**
   * Build detailed invoice table
   */
  buildDetailTable(
    doc: typeof PDFDocument.prototype,
    arrears: ArrearsInvoice[],
  ): void {
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Detailed Invoice Breakdown', 50);

    doc.moveDown(1);

    // Table header
    const renderTableHeader = () => {
      const tableTop = doc.y;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Invoice', 50, tableTop, { width: 60 });
      doc.text('Parent', 115, tableTop, { width: 80 });
      doc.text('Child', 200, tableTop, { width: 70 });
      doc.text('Due Date', 275, tableTop, { width: 60 });
      doc.text('Days', 340, tableTop, { width: 35, align: 'right' });
      doc.text('Total', 380, tableTop, { width: 55, align: 'right' });
      doc.text('Paid', 440, tableTop, { width: 50, align: 'right' });
      doc.text('Balance', 495, tableTop, { width: 50, align: 'right' });

      // Header line
      doc
        .moveTo(50, doc.y + 5)
        .lineTo(545, doc.y + 5)
        .stroke();

      doc.moveDown(0.5);
    };

    renderTableHeader();

    // Table rows
    doc.font('Helvetica');
    arrears.forEach((invoice, index) => {
      const rowY = doc.y;

      doc.fontSize(8);
      doc.text(invoice.invoiceNumber, 50, rowY, { width: 60 });
      doc.text(invoice.parentName, 115, rowY, { width: 80 });
      doc.text(invoice.childName, 200, rowY, { width: 70 });
      doc.text(this.formatDate(invoice.dueDate), 275, rowY, { width: 60 });
      doc.text(`${invoice.daysOverdue}`, 340, rowY, {
        width: 35,
        align: 'right',
      });
      doc.text(`${this.formatCurrency(invoice.totalCents)}`, 380, rowY, {
        width: 55,
        align: 'right',
      });
      doc.text(`${this.formatCurrency(invoice.amountPaidCents)}`, 440, rowY, {
        width: 50,
        align: 'right',
      });
      doc.text(`${this.formatCurrency(invoice.outstandingCents)}`, 495, rowY, {
        width: 50,
        align: 'right',
      });

      doc.moveDown(0.6);

      // Add page break if needed
      if (doc.y > 720 && index < arrears.length - 1) {
        doc.addPage();
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .text('Detailed Invoice Breakdown (continued)', 50);
        doc.moveDown(1);
        renderTableHeader();
      }
    });

    // Bottom line
    doc
      .moveTo(50, doc.y + 5)
      .lineTo(545, doc.y + 5)
      .stroke();
  }

  /**
   * Build PDF footer
   */
  private buildFooter(
    doc: typeof PDFDocument.prototype,
    generatedAt: Date,
  ): void {
    const bottomMargin = 50;
    const pageHeight = doc.page.height;

    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        `This report was generated on ${this.formatDateTime(generatedAt)}`,
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
   * Format date and time as YYYY-MM-DD HH:MM
   */
  private formatDateTime(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * Format currency (cents to ZAR with thousands separator)
   */
  private formatCurrency(cents: number): string {
    const rands = cents / 100;
    return rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
