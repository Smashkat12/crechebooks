/**
 * POPIA Consent PDF Service
 * TASK-STAFF-001: Staff Onboarding - Auto-Generated Documents
 *
 * Generates Protection of Personal Information Act (POPIA) consent forms.
 * Required for South African employment compliance.
 *
 * Includes:
 * - Purpose of data collection
 * - Types of personal information processed
 * - Data retention policies
 * - Employee rights under POPIA
 * - Consent acknowledgement
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../../shared/exceptions';

export interface PopiaConsentData {
  staffId: string;
  tenantId: string;
}

export interface PopiaGenerationResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  fileSize: number;
}

@Injectable()
export class PopiaConsentPdfService {
  private readonly logger = new Logger(PopiaConsentPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate POPIA consent form PDF for a staff member
   */
  async generateConsentForm(
    data: PopiaConsentData,
  ): Promise<PopiaGenerationResult> {
    this.logger.log(`Generating POPIA consent form for staff ${data.staffId}`);

    // Fetch staff with tenant
    const staff = await this.prisma.staff.findFirst({
      where: { id: data.staffId, tenantId: data.tenantId },
      include: { tenant: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', data.staffId);
    }

    const buffer = await this.createConsentPdf(staff, staff.tenant);

    // Generate file path
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `POPIA_CONSENT_${timestamp}.pdf`;
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'staff-documents',
      data.tenantId,
      data.staffId,
    );

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);

    // Write file to disk for permanent storage
    fs.writeFileSync(filePath, buffer);

    this.logger.log(`POPIA consent form generated: ${filePath}`);

    return {
      buffer,
      fileName,
      filePath,
      fileSize: buffer.length,
    };
  }

  /**
   * Create the POPIA consent PDF document
   */
  private async createConsentPdf(
    staff: {
      id: string;
      firstName: string;
      lastName: string;
      idNumber: string;
      email: string | null;
      phone: string | null;
      position: string | null;
      department: string | null;
    },
    tenant: {
      name: string;
      tradingName: string | null;
      email: string;
      phone: string;
      addressLine1: string;
      city: string;
      province: string;
    },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `POPIA Consent - ${staff.firstName} ${staff.lastName}`,
          Author: tenant.name,
          Subject: 'POPIA Consent Form',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(tenant.tradingName || tenant.name, { align: 'center' });

      doc.moveDown(1);

      // Title
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('CONSENT FOR PROCESSING OF PERSONAL INFORMATION', {
          align: 'center',
        });

      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          'In terms of the Protection of Personal Information Act 4 of 2013 (POPIA)',
          {
            align: 'center',
          },
        );

      doc.moveDown(1.5);

      // Employee Details
      this.renderSection(doc, 'DATA SUBJECT (EMPLOYEE) DETAILS');
      this.addField(doc, 'Full Name:', `${staff.firstName} ${staff.lastName}`);
      this.addField(doc, 'ID Number:', this.formatIdNumber(staff.idNumber));
      if (staff.position) {
        this.addField(doc, 'Position:', staff.position);
      }
      if (staff.department) {
        this.addField(doc, 'Department:', staff.department);
      }

      doc.moveDown(1);

      // Responsible Party Details
      this.renderSection(doc, 'RESPONSIBLE PARTY (EMPLOYER) DETAILS');
      this.addField(doc, 'Company Name:', tenant.tradingName || tenant.name);
      this.addField(
        doc,
        'Address:',
        `${tenant.addressLine1}, ${tenant.city}, ${tenant.province}`,
      );
      this.addField(doc, 'Contact Email:', tenant.email);
      this.addField(doc, 'Contact Number:', tenant.phone);

      doc.moveDown(1);

      // Purpose of Processing
      this.renderSection(doc, '1. PURPOSE OF PROCESSING');
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(
        'I understand that my personal information will be processed for the following purposes:\n\n' +
          '• Administration of my employment contract and relationship\n' +
          '• Payroll processing, tax calculations, and statutory submissions (SARS, UIF)\n' +
          '• Performance management and human resources administration\n' +
          '• Communication regarding employment matters\n' +
          '• Compliance with legal and regulatory requirements\n' +
          '• Health and safety management in the workplace\n' +
          '• Benefits administration (medical aid, pension, etc.)\n' +
          '• Emergency contact purposes',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Types of Information
      this.renderSection(doc, '2. TYPES OF PERSONAL INFORMATION PROCESSED');
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'The following categories of personal information may be collected and processed:\n\n' +
          '• Identity information (name, ID number, date of birth)\n' +
          '• Contact details (address, phone number, email)\n' +
          '• Banking information (for salary payments)\n' +
          '• Tax information (tax number, tax status)\n' +
          '• Employment history and qualifications\n' +
          '• Next of kin and emergency contact information\n' +
          '• Medical information (where relevant to employment)\n' +
          '• Performance and disciplinary records\n' +
          '• Photographs and biometric data (where applicable)',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Check if we need a new page
      if (doc.y > 650) {
        doc.addPage();
      }

      // Recipients of Information
      this.renderSection(doc, '3. RECIPIENTS OF PERSONAL INFORMATION');
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'My personal information may be shared with the following parties:\n\n' +
          '• South African Revenue Service (SARS) for tax purposes\n' +
          '• Department of Labour (UIF declarations)\n' +
          '• Medical aid providers (where applicable)\n' +
          '• Pension fund administrators (where applicable)\n' +
          '• Banking institutions (for salary payments)\n' +
          '• External auditors and legal advisors (where required)\n' +
          '• Service providers processing data on behalf of the employer',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Data Retention
      this.renderSection(doc, '4. RETENTION OF PERSONAL INFORMATION');
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'Personal information will be retained for:\n\n' +
          '• The duration of employment\n' +
          '• 5 years after termination of employment (or as required by law)\n' +
          '• Tax records: 5 years after submission (SARS requirement)\n' +
          '• Pension records: As required by the fund rules\n\n' +
          'After the retention period, personal information will be securely destroyed.',
        { align: 'left' },
      );

      doc.moveDown(1);

      // Rights
      this.renderSection(doc, '5. MY RIGHTS UNDER POPIA');
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I understand that I have the following rights:\n\n' +
          '• The right to access my personal information held by the employer\n' +
          '• The right to request correction of inaccurate personal information\n' +
          '• The right to request deletion of personal information (where applicable)\n' +
          '• The right to object to the processing of my personal information\n' +
          '• The right to lodge a complaint with the Information Regulator\n' +
          '• The right to withdraw consent (where processing is based on consent)',
        { align: 'left' },
      );

      // Check if we need a new page for signatures
      if (doc.y > 550) {
        doc.addPage();
      }

      doc.moveDown(1.5);

      // Consent Declaration
      this.renderSection(doc, '6. CONSENT DECLARATION');
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'By signing below, I:\n\n' +
          '• Confirm that I have read and understood this consent form\n' +
          '• Acknowledge that my personal information will be processed as described\n' +
          '• Consent to the processing of my personal information for the stated purposes\n' +
          '• Confirm that the personal information provided by me is accurate and complete\n' +
          '• Undertake to inform the employer of any changes to my personal information',
        { align: 'left' },
      );

      doc.moveDown(2);

      // Signature Section
      const sigY = doc.y;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('EMPLOYEE SIGNATURE:', 50, sigY);
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 50);
      doc.moveDown(0.5);
      doc.text(`Full Name: ${staff.firstName} ${staff.lastName}`, 50);
      doc.moveDown(0.5);
      doc.text(`ID Number: ${this.formatIdNumber(staff.idNumber)}`, 50);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 50);

      // Witness signature
      doc.fontSize(10).font('Helvetica-Bold').text('WITNESS:', 320, sigY);
      doc.y = sigY + 30;
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Full Name: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 320);

      // Contact Information for queries
      doc.moveDown(3);
      doc.fontSize(9).fillColor('#666666');
      doc.text(
        'For any queries regarding this consent or your personal information, please contact:',
        {
          align: 'center',
        },
      );
      doc.text(`${tenant.email} | ${tenant.phone}`, { align: 'center' });

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor('#888888')
          .text(
            `Page ${i + 1} of ${pages.count} | Generated by CrecheBooks on ${this.formatDate(new Date())}`,
            50,
            780,
            { align: 'center', width: 495 },
          );
      }

      doc.end();
    });
  }

  /**
   * Render section heading
   */
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

  /**
   * Add a field row
   */
  private addField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    fontSize: number = 10,
  ): void {
    const y = doc.y;
    doc
      .fontSize(fontSize)
      .font('Helvetica-Bold')
      .text(label, 50, y, { continued: false });
    doc.fontSize(fontSize).font('Helvetica').text(value, 180, y);
    doc.y = Math.max(doc.y, y + fontSize + 4);
  }

  /**
   * Format date to South African format
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Format ID number with spaces
   */
  private formatIdNumber(idNumber: string): string {
    if (idNumber.length === 13) {
      return `${idNumber.slice(0, 6)} ${idNumber.slice(6, 10)} ${idNumber.slice(10, 1)} ${idNumber.slice(11)}`;
    }
    return idNumber;
  }
}
