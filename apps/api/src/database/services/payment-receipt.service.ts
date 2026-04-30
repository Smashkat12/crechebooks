/**
 * Payment Receipt Service
 * TASK-PAY-019: Payment Receipt PDF Generation
 * AUDIT-PAY-04: Persist receipts to S3 with DB pointer
 *
 * @module database/services/payment-receipt
 * @description Service for generating payment receipt PDFs and persisting them
 * to S3. On re-request the S3-backed copy is served without regeneration.
 * All amounts are in CENTS as integers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Payment } from '@prisma/client';
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from '../entities/audit-log.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { formatFullName } from '../../common/utils/name-formatter';

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
  /** S3 key — stored in payment_receipts.s3_key */
  s3Key: string;
  /** Signed S3 URL valid for 5 minutes */
  downloadUrl: string;
  /** True when the PDF was generated fresh; false when retrieved from cache */
  cached: boolean;
}

@Injectable()
export class PaymentReceiptService {
  private readonly logger = new Logger(PaymentReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Return a signed download URL for the receipt.
   * Generates and persists to S3 on first call; serves from S3 on subsequent
   * calls without regenerating the PDF.
   *
   * @param tenantId  Tenant scope
   * @param paymentId Payment to receipt
   * @param userId    Acting user (for audit trail)
   * @returns ReceiptResult with signed URL, receipt number, and cache flag
   * @throws NotFoundException when payment is not found
   * @throws BusinessException when payment has no associated invoice
   */
  async getOrGenerateReceipt(
    tenantId: string,
    paymentId: string,
    userId?: string,
  ): Promise<ReceiptResult> {
    // 1. Check DB pointer for an existing receipt
    const existing = await this.prisma.paymentReceipt.findUnique({
      where: { paymentId },
    });

    if (existing && existing.tenantId === tenantId) {
      this.logger.log(
        `Receipt cache hit for payment ${paymentId}, key=${existing.s3Key}`,
      );

      const downloadUrl = await this.storage.createPresignedDownloadUrl(
        tenantId,
        StorageKind.PaymentReceipt,
        existing.s3Key,
      );

      // Derive receipt number from key: …/<receiptNumber>.pdf
      const receiptNumber = this.receiptNumberFromKey(existing.s3Key);

      await this.auditLog.logAction({
        tenantId,
        userId,
        entityType: 'PaymentReceipt',
        entityId: paymentId,
        action: AuditAction.UPDATE,
        beforeValue: undefined,
        afterValue: { s3Key: existing.s3Key, cached: true },
        changeSummary: `Receipt downloaded (cached) for payment ${paymentId}`,
      });

      return {
        receiptNumber,
        s3Key: existing.s3Key,
        downloadUrl,
        cached: true,
      };
    }

    // 2. Generate fresh receipt
    return this.generateReceipt(tenantId, paymentId, userId);
  }

  /**
   * Force-generate a receipt, upload to S3, upsert DB pointer, return signed URL.
   * Called by `getOrGenerateReceipt` on cache miss; also available for the
   * dedicated POST /payments/:id/generate-receipt endpoint.
   */
  async generateReceipt(
    tenantId: string,
    paymentId: string,
    userId?: string,
  ): Promise<ReceiptResult> {
    this.logger.log(`Generating receipt for payment ${paymentId}`);

    // 1. Load payment with relations
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

    // 3. Generate receipt number (DB-backed — sequential per tenant/year)
    const year = new Date(payment.paymentDate).getFullYear();
    const receiptNumber = await this.allocateReceiptNumber(tenantId, year);
    receiptData.receiptNumber = receiptNumber;

    // 4. Generate PDF buffer in memory — no fs writes
    const pdfBuffer = await this.createPdfBuffer(receiptData);

    // 5. Build S3 key and upload
    const s3Key = this.storage.buildKey(
      tenantId,
      StorageKind.PaymentReceipt,
      `${receiptNumber}.pdf`,
    );

    await this.storage.putObject(
      tenantId,
      StorageKind.PaymentReceipt,
      s3Key,
      pdfBuffer,
      'application/pdf',
    );

    // 6. Upsert DB pointer (safe on race — UNIQUE on payment_id)
    await this.prisma.paymentReceipt.upsert({
      where: { paymentId },
      create: {
        paymentId,
        tenantId,
        s3Key,
      },
      update: {
        s3Key,
      },
    });

    this.logger.log(
      `Receipt ${receiptNumber} uploaded to S3 key=${s3Key} for payment ${paymentId}`,
    );

    // 7. Audit log
    await this.auditLog.logAction({
      tenantId,
      userId,
      entityType: 'PaymentReceipt',
      entityId: paymentId,
      action: AuditAction.CREATE,
      beforeValue: undefined,
      afterValue: { receiptNumber, s3Key },
      changeSummary: `Receipt generated and stored for payment ${paymentId}`,
    });

    // 8. Return signed URL
    const downloadUrl = await this.storage.createPresignedDownloadUrl(
      tenantId,
      StorageKind.PaymentReceipt,
      s3Key,
    );

    return { receiptNumber, s3Key, downloadUrl, cached: false };
  }

  /**
   * Stream receipt from S3 for a given S3 key.
   * Used by the download endpoint to pipe the object directly into the response.
   */
  async streamReceipt(tenantId: string, s3Key: string): Promise<Readable> {
    return this.storage.getObjectStream(
      tenantId,
      StorageKind.PaymentReceipt,
      s3Key,
    );
  }

  /**
   * Look up an existing DB pointer for a payment.
   * Returns null when no persisted receipt exists yet.
   */
  async findReceiptByPaymentId(
    tenantId: string,
    paymentId: string,
  ): Promise<{ s3Key: string; receiptNumber: string } | null> {
    const row = await this.prisma.paymentReceipt.findUnique({
      where: { paymentId },
    });

    if (!row || row.tenantId !== tenantId) {
      return null;
    }

    return {
      s3Key: row.s3Key,
      receiptNumber: this.receiptNumberFromKey(row.s3Key),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Allocate a sequential receipt number for tenant + year.
   * Uses the payment_receipts table count as the sequence source.
   * Format: REC-{YYYY}-{00001}
   */
  private async allocateReceiptNumber(
    tenantId: string,
    year: number,
  ): Promise<string> {
    const yearPrefix = `REC-${year}-`;
    const count = await this.prisma.paymentReceipt.count({
      where: { tenantId },
    });
    const sequential = (count + 1).toString().padStart(5, '0');
    return `${yearPrefix}${sequential}`;
  }

  /** Extract the receipt number from an S3 key like …/REC-2025-00001.pdf */
  private receiptNumberFromKey(s3Key: string): string {
    const filename = s3Key.split('/').pop() ?? s3Key;
    return filename.replace(/\.pdf$/, '');
  }

  /**
   * Build ReceiptData from a payment with loaded invoice/parent/child.
   */
  private async buildReceiptData(
    tenantId: string,
    payment: Payment & {
      invoice: {
        invoiceNumber: string;
        parent: {
          firstName: string;
          middleName?: string | null;
          lastName: string;
          email: string | null;
        };
        child: {
          firstName: string;
          middleName?: string | null;
          lastName: string;
        };
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
      receiptNumber: '', // Set after allocateReceiptNumber
      paymentId: payment.id,
      paymentDate: payment.paymentDate,
      amountCents: payment.amountCents,
      reference: payment.reference,
      parentName: formatFullName(payment.invoice.parent),
      parentEmail: payment.invoice.parent.email,
      childName: formatFullName(payment.invoice.child),
      invoiceNumber: payment.invoice.invoiceNumber,
      tenantName: tenant.tradingName || tenant.name,
      tenantAddress,
      tenantVatNumber: tenant.vatNumber,
      tenantPhone: tenant.phone,
      tenantEmail: tenant.email,
    };
  }

  /**
   * Render the PDF into an in-memory Buffer.
   * No filesystem access — returns bytes directly for S3 upload.
   */
  private createPdfBuffer(data: ReceiptData): Promise<Buffer> {
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

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

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

      // Receipt details
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

      // Footer
      doc
        .strokeColor('#000000')
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .stroke();
      doc.moveDown();

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          'This is a computer-generated receipt and is valid without a signature.',
          { align: 'center' },
        );
      doc.text(
        `Generated on ${this.formatDate(new Date())} at ${this.formatTime(new Date())}`,
        { align: 'center' },
      );

      doc.end();
    });
  }

  private addDetailRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    doc.font('Helvetica-Bold').text(label, { continued: true });
    doc.font('Helvetica').text(` ${value}`);
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatCurrency(amountCents: number): string {
    return `R ${(amountCents / 100).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
