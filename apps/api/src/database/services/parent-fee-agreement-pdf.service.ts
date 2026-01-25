/**
 * Parent Fee Agreement PDF Service
 * Generates legally binding fee agreement between parent and creche/school
 *
 * South African childcare compliance:
 * - Clear fee structure and payment terms
 * - Late payment penalties
 * - Cancellation policy
 * - Deposit and registration fee terms
 * - Annual fee increase clause
 * - Dispute resolution
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../../shared/exceptions';

export interface FeeAgreementData {
  parentId: string;
  tenantId: string;
  childId?: string;
}

export interface FeeAgreementResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  fileSize: number;
}

@Injectable()
export class ParentFeeAgreementPdfService {
  private readonly logger = new Logger(ParentFeeAgreementPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate fee agreement PDF for a parent
   */
  async generateFeeAgreement(
    data: FeeAgreementData,
  ): Promise<FeeAgreementResult> {
    this.logger.log(`Generating fee agreement for parent ${data.parentId}`);

    // Fetch parent with tenant and children
    const parent = await this.prisma.parent.findFirst({
      where: { id: data.parentId, tenantId: data.tenantId },
      include: {
        tenant: true,
        children: {
          where: { deletedAt: null },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent', data.parentId);
    }

    // Get tenant fee structure
    const feeStructure = await this.prisma.feeStructure.findFirst({
      where: { tenantId: data.tenantId, isActive: true },
    });

    const buffer = await this.createFeeAgreementPdf(
      parent,
      parent.tenant,
      parent.children,
      feeStructure,
    );

    // Generate file path
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `Fee_Agreement_${timestamp}.pdf`;
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'parent-documents',
      data.tenantId,
      data.parentId,
    );

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    this.logger.log(`Fee agreement generated: ${filePath}`);

    return {
      buffer,
      fileName,
      filePath,
      fileSize: buffer.length,
    };
  }

  /**
   * Create the fee agreement PDF document
   */
  private async createFeeAgreementPdf(
    parent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      idNumber: string | null;
      address: string | null;
    },
    tenant: {
      name: string;
      tradingName: string | null;
      email: string | null;
      phone: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      registrationNumber: string | null;
    },
    children: Array<{
      firstName: string;
      lastName: string;
      dateOfBirth: Date | null;
    }>,
    feeStructure: {
      name: string;
      amountCents: number;
      registrationFeeCents: number;
      reRegistrationFeeCents: number;
      siblingDiscountPercent: { toNumber: () => number } | null;
    } | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Fee Agreement - ${parent.firstName} ${parent.lastName}`,
          Author: tenant.name,
          Subject: 'Childcare Fee Agreement',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Convert cents to rands
      const monthlyFee = (feeStructure?.amountCents || 0) / 100;
      const registrationFee = (feeStructure?.registrationFeeCents || 0) / 100;
      const reRegistrationFee = (feeStructure?.reRegistrationFeeCents || 0) / 100;
      const siblingDiscount = feeStructure?.siblingDiscountPercent
        ? feeStructure.siblingDiscountPercent.toNumber()
        : 0;
      const lateFee = 5; // Default late fee percentage
      const crecheName = tenant.tradingName || tenant.name;

      // Header
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(crecheName, { align: 'center' });

      doc.moveDown(0.5);

      // Title
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('FEE AGREEMENT AND PAYMENT CONTRACT', { align: 'center' });

      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text('Childcare Services Agreement', { align: 'center' });

      doc.moveDown(1.5);

      // Parties
      this.renderSection(doc, 'PARTIES TO THIS AGREEMENT');

      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(
        'This Fee Agreement is entered into between:\n\n' +
          `The Service Provider: ${crecheName}\n` +
          `Registration Number: ${tenant.registrationNumber || 'N/A'}\n` +
          `Address: ${tenant.addressLine1 || 'N/A'}, ${tenant.city || ''}, ${tenant.province || ''}\n` +
          `Contact: ${tenant.email || 'N/A'} | ${tenant.phone || 'N/A'}\n\n` +
          'AND\n\n' +
          `The Parent/Guardian: ${parent.firstName} ${parent.lastName}\n` +
          `ID Number: ${parent.idNumber || 'N/A'}\n` +
          `Email: ${parent.email}\n` +
          `Phone: ${parent.phone || 'N/A'}`,
        { align: 'left' },
      );

      doc.moveDown(1);

      // Children covered
      this.renderSection(doc, 'CHILDREN COVERED BY THIS AGREEMENT');

      let childrenText = '';
      children.forEach((child, index) => {
        const dob = child.dateOfBirth
          ? this.formatDate(child.dateOfBirth)
          : 'N/A';
        childrenText += `${index + 1}. ${child.firstName} ${child.lastName} (DOB: ${dob})\n`;
      });
      doc.fontSize(10).font('Helvetica').text(childrenText || 'To be specified');

      doc.moveDown(1);

      // Fee Structure
      this.renderSection(doc, '1. FEE STRUCTURE');

      doc.fontSize(10).font('Helvetica');
      let feeText =
        `The following fees apply to this agreement:\n\n` +
        `• Monthly Tuition Fee: R ${this.formatCurrency(monthlyFee)} per child per month\n` +
        `• Registration Fee (new enrollments): R ${this.formatCurrency(registrationFee)}\n` +
        `• Re-registration Fee (annual): R ${this.formatCurrency(reRegistrationFee)}\n`;

      if (siblingDiscount > 0) {
        feeText += `• Sibling Discount: ${siblingDiscount}% off for additional children\n`;
      }

      feeText +=
        `\nFees are subject to annual review and may be increased with one calendar month's written notice.`;

      doc.text(feeText, { align: 'left' });

      doc.moveDown(1);

      // Payment Terms
      this.renderSection(doc, '2. PAYMENT TERMS');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'Payment Conditions:\n\n' +
          '• Fees are payable in advance on or before the 1st of each month\n' +
          '• Payment must be made via EFT or debit order\n' +
          '• A full month\'s fee is payable regardless of school holidays, sick days, or public holidays\n' +
          '• No pro-rata fees apply for late enrollment or early withdrawal within a month\n' +
          '• Fees must be paid for the notice period even if the child does not attend',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Late Payment
      this.renderSection(doc, '3. LATE PAYMENT PENALTIES');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'The following penalties apply for late payments:\n\n' +
          `• A late fee of ${lateFee}% will be charged on unpaid balances after the 7th of each month\n` +
          '• Accounts in arrears for more than 30 days may result in suspension of services\n' +
          '• Accounts in arrears for more than 60 days may be handed over to debt collectors\n' +
          '• All collection costs will be borne by the Parent/Guardian\n' +
          '• Interest at the prime lending rate plus 2% may be charged on overdue accounts',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Check for new page
      if (doc.y > 600) {
        doc.addPage();
      }

      // Cancellation Policy
      this.renderSection(doc, '4. CANCELLATION AND WITHDRAWAL');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'Notice Requirements:\n\n' +
          '• One (1) calendar month written notice is required to withdraw your child\n' +
          '• Notice must be given in writing (email to the school office is acceptable)\n' +
          '• Fees are payable for the full notice period\n' +
          '• Any deposit held will be refunded within 30 days after the last day, less any outstanding fees\n' +
          '• The registration fee is non-refundable\n\n' +
          'The Service Provider reserves the right to terminate this agreement with 30 days notice if:\n' +
          '• Fees remain unpaid for more than 60 days\n' +
          '• The Parent/Guardian breaches the terms of this agreement\n' +
          '• The child\'s behavior poses a risk to other children or staff',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Deposit Terms
      this.renderSection(doc, '5. DEPOSIT TERMS');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'The deposit is held as security and will be:\n\n' +
          '• Used to offset the final month\'s fees (with approval)\n' +
          '• Refunded within 30 days of the child\'s last day, after deducting:\n' +
          '  - Any outstanding fees or charges\n' +
          '  - Damages to property (beyond normal wear and tear)\n' +
          '• Forfeited if proper notice is not given',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Fee Increases
      this.renderSection(doc, '6. ANNUAL FEE INCREASES');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'Annual Fee Adjustments:\n\n' +
          '• Fees may be reviewed and adjusted annually, typically in January\n' +
          '• The Service Provider will provide at least one month\'s written notice of any increase\n' +
          '• Fee increases are based on operational costs, inflation, and regulatory requirements\n' +
          '• Acceptance of the new fees is assumed unless written objection is received',
        { align: 'left' },
      );

      // New page for signatures
      doc.addPage();

      // Dispute Resolution
      this.renderSection(doc, '7. DISPUTE RESOLUTION');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'In the event of a dispute:\n\n' +
          '• Parties agree to attempt good-faith negotiation first\n' +
          '• If unresolved, mediation through an agreed mediator may be sought\n' +
          '• This agreement is governed by the laws of South Africa\n' +
          '• The Magistrate\'s Court shall have jurisdiction for disputes',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Acknowledgements
      this.renderSection(doc, '8. PARENT/GUARDIAN ACKNOWLEDGEMENTS');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'By signing this agreement, I acknowledge that:\n\n' +
          '• I have read and understand all terms and conditions\n' +
          '• I agree to pay all fees as outlined in this agreement\n' +
          '• I understand the late payment penalties\n' +
          '• I understand the cancellation and notice requirements\n' +
          '• I am legally authorized to enter into this agreement\n' +
          '• This agreement is binding and enforceable',
        { align: 'left' },
      );

      doc.moveDown(2);

      // Signature Section
      const sigY = doc.y;

      // Parent signature
      doc.fontSize(10).font('Helvetica-Bold').text('PARENT/GUARDIAN:', 50, sigY);
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 50);
      doc.moveDown(0.5);
      doc.text(`Full Name: ${parent.firstName} ${parent.lastName}`, 50);
      doc.moveDown(0.5);
      doc.text(`ID Number: ${parent.idNumber || '_________________________'}`, 50);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 50);

      // Service provider signature
      doc.fontSize(10).font('Helvetica-Bold').text('SERVICE PROVIDER:', 320, sigY);
      doc.y = sigY + 30;
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Full Name: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Position: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 320);

      // Witness
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica-Bold').text('WITNESS:', 50);
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 50);
      doc.moveDown(0.5);
      doc.text('Full Name: _________________________', 50);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 50);

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor('#888888')
          .text(
            `Page ${i + 1} of ${pages.count} | Fee Agreement | Generated on ${this.formatDate(new Date())}`,
            50,
            780,
            { align: 'center', width: 495 },
          );
      }

      doc.end();
    });
  }

  private renderSection(doc: PDFKit.PDFDocument, title: string): void {
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#2c5282').text(title);
    doc.moveDown(0.3);
    doc
      .strokeColor('#e2e8f0')
      .lineWidth(0.5)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
    doc.fillColor('#000000');
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number): string {
    return amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
