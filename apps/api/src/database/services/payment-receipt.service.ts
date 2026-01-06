/**
 * Payment Receipt Service
 * TASK-PAY-019: Payment Receipt PDF Generation
 *
 * @module database/services/payment-receipt
 * @description Service for generating payment receipt PDFs.
 * All amounts are in CENTS as integers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Payment } from '@prisma/client';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

export interface ReceiptData {
  receiptNumber: string;
  paymentId: string;
  paymentDate: Date;
  amountCents: number;
  reference: string | null;
  parentName: string;
  parentEmail: string | null;
  childName: string;
  invoiceNumber: string;
  tenantName: string;
  tenantAddress: string;
  tenantVatNumber: string | null;
  tenantPhone: string;
  tenantEmail: string;
}

export interface ReceiptResult {
  receiptNumber: string;
  filePath: string;
  downloadUrl: string;
}

@Injectable()
export class PaymentReceiptService {
  private readonly logger = new Logger(PaymentReceiptService.name);
  private readonly uploadDir = 'uploads/receipts';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate payment receipt PDF
   * @param tenantId - Tenant ID
   * @param paymentId - Payment ID to generate receipt for
   * @returns ReceiptResult with receipt number, file path, and download URL
   * @throws NotFoundException if payment not found
   * @throws BusinessException if required relations not found
   */
  async generateReceipt(
    tenantId: string,
    paymentId: string,
  ): Promise<ReceiptResult> {
    this.logger.log(`Generating receipt for payment ${paymentId}`);

    // 1. Get payment with relations
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: {
        invoice: {
          include: {
            parent: true,
            child: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment', paymentId);
    }

    if (!payment.invoice) {
      throw new BusinessException(
        'Payment has no associated invoice',
        'PAYMENT_NO_INVOICE',
        { paymentId },
      );
    }

    // 2. Build receipt data
    const receiptData = await this.buildReceiptData(tenantId, payment);

    // 3. Ensure upload directory exists
    const tenantDir = path.join(this.uploadDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    // 4. Generate receipt number
    const year = new Date(payment.paymentDate).getFullYear();
    const receiptNumber = await this.generateReceiptNumber(tenantId, year);
    receiptData.receiptNumber = receiptNumber;

    // 5. Create PDF
    const filePath = path.join(tenantDir, `${receiptNumber}.pdf`);
    await this.createPdfDocument(receiptData, filePath);

    this.logger.log(
      `Generated receipt ${receiptNumber} for payment ${paymentId}`,
    );

    return {
      receiptNumber,
      filePath,
      downloadUrl: `/api/payments/${paymentId}/receipt`,
    };
  }

  /**
   * Generate receipt number
   * Format: REC-{YYYY}-{sequential}
   * @param tenantId - Tenant ID
   * @param year - Year for receipt number
   * @returns Sequential receipt number
   */
  async generateReceiptNumber(tenantId: string, year: number): Promise<string> {
    // Find highest existing receipt number for this tenant and year
    // Receipts are stored in filesystem, so we track sequence separately
    const yearPrefix = `REC-${year}-`;

    // Count existing receipt files
    const tenantDir = path.join(this.uploadDir, tenantId);
    let sequential = 1;

    if (fs.existsSync(tenantDir)) {
      const files = fs.readdirSync(tenantDir);
      const yearReceipts = files.filter((f) => f.startsWith(yearPrefix));
      if (yearReceipts.length > 0) {
        // Extract highest number
        const numbers = yearReceipts.map((f) => {
          const match = f.match(new RegExp(`${yearPrefix}(\\d+)\\.pdf`));
          return match ? parseInt(match[1], 10) : 0;
        });
        sequential = Math.max(...numbers) + 1;
      }
    }

    return `${yearPrefix}${sequential.toString().padStart(5, '0')}`;
  }

  /**
   * Build receipt data from payment
   * @param tenantId - Tenant ID
   * @param payment - Payment with invoice, parent, and child relations
   * @returns ReceiptData for PDF generation
   */
  private async buildReceiptData(
    tenantId: string,
    payment: Payment & {
      invoice: {
        invoiceNumber: string;
        parent: { firstName: string; lastName: string; email: string | null };
        child: { firstName: string; lastName: string };
      };
    },
  ): Promise<ReceiptData> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    const tenantAddress = [
      tenant.addressLine1,
      tenant.addressLine2,
      tenant.city,
      tenant.province,
      tenant.postalCode,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      receiptNumber: '', // Will be set after generation
      paymentId: payment.id,
      paymentDate: payment.paymentDate,
      amountCents: payment.amountCents,
      reference: payment.reference,
      parentName: `${payment.invoice.parent.firstName} ${payment.invoice.parent.lastName}`,
      parentEmail: payment.invoice.parent.email,
      childName: `${payment.invoice.child.firstName} ${payment.invoice.child.lastName}`,
      invoiceNumber: payment.invoice.invoiceNumber,
      tenantName: tenant.tradingName || tenant.name,
      tenantAddress,
      tenantVatNumber: tenant.vatNumber,
      tenantPhone: tenant.phone,
      tenantEmail: tenant.email,
    };
  }

  /**
   * Create PDF document with receipt content
   * @param data - Receipt data to render
   * @param outputPath - Path to save the PDF
   * @returns Promise that resolves when PDF is written
   */
  private createPdfDocument(
    data: ReceiptData,
    outputPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Payment Receipt ${data.receiptNumber}`,
          Author: data.tenantName,
          Subject: 'Payment Receipt',
        },
      });
      const stream = fs.createWriteStream(outputPath);

      doc.pipe(stream);

      // Header - Tenant Info
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(data.tenantName, { align: 'center' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(data.tenantAddress, { align: 'center' });
      doc.text(`Tel: ${data.tenantPhone}`, { align: 'center' });
      doc.text(`Email: ${data.tenantEmail}`, { align: 'center' });
      if (data.tenantVatNumber) {
        doc.text(`VAT No: ${data.tenantVatNumber}`, { align: 'center' });
      }
      doc.moveDown(2);

      // Receipt title
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('PAYMENT RECEIPT', { align: 'center' });
      doc.moveDown();

      // Horizontal line
      doc
        .strokeColor('#000000')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown();

      // Receipt details in a box
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text(`Receipt Number:`, { continued: true });
      doc.font('Helvetica').text(` ${data.receiptNumber}`);

      doc.font('Helvetica-Bold').text(`Date:`, { continued: true });
      doc.font('Helvetica').text(` ${this.formatDate(data.paymentDate)}`);
      doc.moveDown();

      // Payment Details Section
      doc.fontSize(14).font('Helvetica-Bold').text('Payment Details');
      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown(0.5);

      doc.fontSize(11);
      this.addDetailRow(doc, 'Amount:', this.formatCurrency(data.amountCents));
      if (data.reference) {
        this.addDetailRow(doc, 'Reference:', data.reference);
      }
      doc.moveDown();

      // Parent/Child Details Section
      doc.fontSize(14).font('Helvetica-Bold').text('Paid By');
      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown(0.5);

      doc.fontSize(11);
      this.addDetailRow(doc, 'Parent:', data.parentName);
      if (data.parentEmail) {
        this.addDetailRow(doc, 'Email:', data.parentEmail);
      }
      this.addDetailRow(doc, 'Child:', data.childName);
      doc.moveDown();

      // Invoice Reference Section
      doc.fontSize(14).font('Helvetica-Bold').text('Applied To');
      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown(0.5);

      doc.fontSize(11);
      this.addDetailRow(doc, 'Invoice:', data.invoiceNumber);
      doc.moveDown(2);

      // Thank you message
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#228B22')
        .text('Thank you for your payment!', { align: 'center' });
      doc.fillColor('#000000');
      doc.moveDown(2);

      // Footer - horizontal line
      doc
        .strokeColor('#000000')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown();

      // Footer text
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          'This is a computer-generated receipt and is valid without a signature.',
          {
            align: 'center',
          },
        );
      doc.text(
        `Generated on ${this.formatDate(new Date())} at ${this.formatTime(new Date())}`,
        { align: 'center' },
      );

      doc.end();

      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  /**
   * Add a detail row with label and value
   * @param doc - PDFDocument instance
   * @param label - Field label
   * @param value - Field value
   */
  private addDetailRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    doc.font('Helvetica-Bold').text(label, { continued: true });
    doc.font('Helvetica').text(` ${value}`);
  }

  /**
   * Format date as South African format (DD/MM/YYYY)
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  /**
   * Format time as HH:MM
   * @param date - Date to extract time from
   * @returns Formatted time string
   */
  private formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Format amount in cents to ZAR currency (R X,XXX.XX)
   * @param amountCents - Amount in cents
   * @returns Formatted currency string
   */
  private formatCurrency(amountCents: number): string {
    return `R ${(amountCents / 100).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Get receipt file path for a payment
   * @param tenantId - Tenant ID
   * @param receiptNumber - Receipt number
   * @returns File path or null if not found
   */
  async getReceiptFilePath(
    tenantId: string,
    receiptNumber: string,
  ): Promise<string | null> {
    const filePath = path.join(
      this.uploadDir,
      tenantId,
      `${receiptNumber}.pdf`,
    );
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Find receipt by payment ID (checks filesystem for existing receipt)
   * @param tenantId - Tenant ID
   * @param paymentId - Payment ID
   * @returns Receipt info or null if not found
   */
  async findReceiptByPaymentId(
    tenantId: string,
    paymentId: string,
  ): Promise<ReceiptResult | null> {
    const tenantDir = path.join(this.uploadDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      return null;
    }

    // This is a simplified implementation - in production you'd want to
    // store receipt metadata in the database linked to payment ID
    // For now, regenerate the receipt if needed
    return null;
  }
}
