/**
 * Employment Contract PDF Service
 * TASK-STAFF-001: Staff Onboarding - Auto-Generated Employment Contracts
 *
 * Generates BCEA Section 29 compliant employment contracts using PDFKit.
 * Contracts include:
 * - Employer and employee details
 * - Position, department, and start date
 * - Working hours and schedule
 * - Remuneration and pay frequency
 * - Leave entitlements
 * - Notice period
 * - Banking details for payment
 * - Signature acknowledgement section
 *
 * All monetary values in CENTS (integers)
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

export interface EmploymentContractData {
  staffId: string;
  tenantId: string;
}

export interface ContractGenerationResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  fileSize: number;
}

@Injectable()
export class EmploymentContractPdfService {
  private readonly logger = new Logger(EmploymentContractPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate employment contract PDF for a staff member
   */
  async generateContract(
    data: EmploymentContractData,
  ): Promise<ContractGenerationResult> {
    this.logger.log(`Generating employment contract for staff ${data.staffId}`);

    // Fetch staff with tenant
    const staff = await this.prisma.staff.findFirst({
      where: { id: data.staffId, tenantId: data.tenantId },
      include: { tenant: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', data.staffId);
    }

    // Validate required fields for contract
    if (!staff.startDate || !staff.basicSalaryCents) {
      throw new BusinessException(
        'Staff must have start date and salary set before generating contract',
        'MISSING_REQUIRED_FIELDS',
        { staffId: data.staffId },
      );
    }

    const buffer = await this.createContractPdf(staff, staff.tenant);

    // Generate file path
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `EMPLOYMENT_CONTRACT_${timestamp}.pdf`;
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

    this.logger.log(`Employment contract generated: ${filePath}`);

    return {
      buffer,
      fileName,
      filePath,
      fileSize: buffer.length,
    };
  }

  /**
   * Create the PDF document
   */
  private async createContractPdf(
    staff: {
      id: string;
      firstName: string;
      lastName: string;
      idNumber: string;
      email: string | null;
      phone: string | null;
      startDate: Date;
      endDate: Date | null;
      employmentType: string;
      payFrequency: string;
      basicSalaryCents: number;
      department: string | null;
      position: string | null;
      hoursPerWeek: number | null;
      workSchedule: string | null;
      address: string | null;
      suburb: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      bankName: string | null;
      bankAccount: string | null;
      bankBranchCode: string | null;
    },
    tenant: {
      name: string;
      tradingName: string | null;
      registrationNumber: string | null;
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
      email: string;
    },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Employment Contract - ${staff.firstName} ${staff.lastName}`,
          Author: tenant.name,
          Subject: 'Employment Contract',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      this.renderHeader(doc, tenant);

      // Title
      doc.moveDown(1);
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text('EMPLOYMENT CONTRACT', { align: 'center' });

      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text('(BCEA Section 29 Compliant)', { align: 'center' });

      doc.moveDown(1.5);

      // Preamble
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#000000')
        .text('This Employment Contract is entered into between:', {
          align: 'left',
        });

      doc.moveDown(1);

      // Employer Section
      this.renderSection(doc, '1. THE EMPLOYER');
      doc.fontSize(10).font('Helvetica');
      this.addField(doc, 'Company Name:', tenant.tradingName || tenant.name);
      if (tenant.registrationNumber) {
        this.addField(doc, 'Registration Number:', tenant.registrationNumber);
      }
      this.addField(
        doc,
        'Physical Address:',
        `${tenant.addressLine1}${tenant.addressLine2 ? ', ' + tenant.addressLine2 : ''}, ${tenant.city}, ${tenant.province}, ${tenant.postalCode}`,
      );
      this.addField(doc, 'Contact Number:', tenant.phone);
      this.addField(doc, 'Email:', tenant.email);

      doc.moveDown(1);

      // Employee Section
      this.renderSection(doc, '2. THE EMPLOYEE');
      this.addField(doc, 'Full Name:', `${staff.firstName} ${staff.lastName}`);
      this.addField(doc, 'ID Number:', this.formatIdNumber(staff.idNumber));
      if (staff.address) {
        const address = [
          staff.address,
          staff.suburb,
          staff.city,
          staff.province,
          staff.postalCode,
        ]
          .filter(Boolean)
          .join(', ');
        this.addField(doc, 'Residential Address:', address);
      }
      if (staff.phone) {
        this.addField(doc, 'Contact Number:', staff.phone);
      }
      if (staff.email) {
        this.addField(doc, 'Email:', staff.email);
      }

      doc.moveDown(1);

      // Employment Details
      this.renderSection(doc, '3. EMPLOYMENT DETAILS');
      this.addField(
        doc,
        'Job Title:',
        staff.position || 'As per job description',
      );
      if (staff.department) {
        this.addField(doc, 'Department:', staff.department);
      }
      this.addField(
        doc,
        'Employment Type:',
        this.formatEmploymentType(staff.employmentType),
      );
      this.addField(
        doc,
        'Commencement Date:',
        this.formatDate(staff.startDate),
      );
      if (staff.endDate) {
        this.addField(
          doc,
          'Contract End Date:',
          this.formatDate(staff.endDate),
        );
      }
      this.addField(
        doc,
        'Place of Work:',
        `${tenant.addressLine1}, ${tenant.city}`,
      );

      doc.moveDown(1);

      // Working Hours
      this.renderSection(doc, '4. WORKING HOURS');
      this.addField(
        doc,
        'Hours per Week:',
        staff.hoursPerWeek
          ? `${staff.hoursPerWeek} hours`
          : '45 hours (standard)',
      );
      this.addField(
        doc,
        'Work Schedule:',
        staff.workSchedule || 'Monday to Friday, 08:00 - 17:00',
      );
      doc
        .fontSize(9)
        .text(
          'Overtime may be required from time to time in accordance with the Basic Conditions of Employment Act.',
          { align: 'left' },
        );

      doc.moveDown(1);

      // Remuneration
      this.renderSection(doc, '5. REMUNERATION');
      this.addField(
        doc,
        'Basic Salary:',
        this.formatCurrency(staff.basicSalaryCents),
      );
      this.addField(
        doc,
        'Pay Frequency:',
        this.formatPayFrequency(staff.payFrequency),
      );
      this.addField(
        doc,
        'Payment Method:',
        staff.bankName ? 'Electronic Fund Transfer (EFT)' : 'As agreed',
      );

      if (staff.bankName && staff.bankAccount) {
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica-Bold').text('Banking Details:');
        doc.fontSize(9).font('Helvetica');
        this.addField(doc, '  Bank:', staff.bankName, 9);
        this.addField(
          doc,
          '  Account Number:',
          this.maskBankAccount(staff.bankAccount),
          9,
        );
        if (staff.bankBranchCode) {
          this.addField(doc, '  Branch Code:', staff.bankBranchCode, 9);
        }
      }

      doc.moveDown(1);

      // Deductions
      this.renderSection(doc, '6. STATUTORY DEDUCTIONS');
      doc
        .fontSize(9)
        .text(
          "The following statutory deductions will be made from the Employee's salary:\n" +
            '• Pay As You Earn (PAYE) as per SARS tax tables\n' +
            '• Unemployment Insurance Fund (UIF) contributions\n' +
            '• Skills Development Levy (SDL) where applicable\n' +
            "Other deductions may only be made with the Employee's written consent.",
          { align: 'left' },
        );

      doc.moveDown(1);

      // Check if we need a new page
      if (doc.y > 650) {
        doc.addPage();
      }

      // Leave Entitlement
      this.renderSection(doc, '7. LEAVE ENTITLEMENT');
      doc
        .fontSize(9)
        .text(
          'The Employee is entitled to the following leave in accordance with the BCEA:\n' +
            '• Annual Leave: 21 consecutive days (15 working days) per annual leave cycle\n' +
            '• Sick Leave: 30 days over a 3-year cycle (10 days per year)\n' +
            '• Family Responsibility Leave: 3 days per year\n' +
            '• Maternity Leave: 4 consecutive months (unpaid, as per BCEA)\n' +
            '• Public Holidays: As gazetted by the government',
          { align: 'left' },
        );

      doc.moveDown(1);

      // Notice Period
      this.renderSection(doc, '8. NOTICE PERIOD');
      const noticePeriod = this.calculateNoticePeriod(staff.employmentType);
      doc
        .fontSize(9)
        .text(
          `Either party may terminate this contract by giving ${noticePeriod} written notice, ` +
            'or payment in lieu thereof. The Employer may terminate employment without notice in ' +
            'cases of gross misconduct as defined by the Labour Relations Act.',
          { align: 'left' },
        );

      doc.moveDown(1);

      // Probation
      if (staff.employmentType === 'PERMANENT') {
        this.renderSection(doc, '9. PROBATION PERIOD');
        doc
          .fontSize(9)
          .text(
            'The first 3 (three) months of employment shall constitute a probationary period, ' +
              "during which the Employer may terminate the contract with one week's notice if " +
              "the Employee's performance is unsatisfactory.",
            { align: 'left' },
          );
        doc.moveDown(1);
      }

      // General Provisions
      this.renderSection(
        doc,
        staff.employmentType === 'PERMANENT'
          ? '10. GENERAL PROVISIONS'
          : '9. GENERAL PROVISIONS',
      );
      doc
        .fontSize(9)
        .text(
          '• The Employee agrees to abide by all company policies and procedures.\n' +
            '• The Employee shall not disclose confidential information during or after employment.\n' +
            '• This contract is governed by the laws of the Republic of South Africa.\n' +
            '• Any disputes shall be resolved in accordance with the Labour Relations Act.',
          { align: 'left' },
        );

      doc.moveDown(1);

      // POPIA Clause
      this.renderSection(
        doc,
        staff.employmentType === 'PERMANENT'
          ? '11. PROTECTION OF PERSONAL INFORMATION'
          : '10. PROTECTION OF PERSONAL INFORMATION',
      );
      doc
        .fontSize(9)
        .text(
          'The Employee consents to the Employer processing their personal information ' +
            'for employment purposes in compliance with the Protection of Personal Information Act (POPIA).',
          { align: 'left' },
        );

      // Signature Section - new page if needed
      if (doc.y > 550) {
        doc.addPage();
      }

      doc.moveDown(2);
      this.renderSection(doc, 'ACKNOWLEDGEMENT AND ACCEPTANCE');
      doc
        .fontSize(9)
        .text(
          'By signing below, both parties acknowledge that they have read and understood the terms ' +
            'of this Employment Contract and agree to be bound by its provisions.',
          { align: 'left' },
        );

      doc.moveDown(2);

      // Employer signature
      const sigY = doc.y;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('FOR THE EMPLOYER:', 50, sigY);
      doc.moveDown(2);
      doc.fontSize(9).font('Helvetica');
      doc.text('Signature: _________________________', 50);
      doc.moveDown(0.5);
      doc.text('Name: _________________________', 50);
      doc.moveDown(0.5);
      doc.text('Designation: _________________________', 50);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 50);

      // Employee signature
      doc.fontSize(10).font('Helvetica-Bold').text('THE EMPLOYEE:', 320, sigY);
      doc.y = sigY + 30;
      doc.fontSize(9).font('Helvetica');
      doc.text('Signature: _________________________', 320);
      doc.moveDown(0.5);
      doc.text(`Name: ${staff.firstName} ${staff.lastName}`, 320);
      doc.moveDown(0.5);
      doc.text(`ID Number: ${this.formatIdNumber(staff.idNumber)}`, 320);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 320);

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
   * Render document header with company info
   */
  private renderHeader(
    doc: PDFKit.PDFDocument,
    tenant: { name: string; tradingName: string | null },
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#1a365d')
      .text(tenant.tradingName || tenant.name, { align: 'center' });
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
   * Format currency (cents to Rands)
   */
  private formatCurrency(cents: number): string {
    return `R ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }

  /**
   * Format ID number with spaces
   */
  private formatIdNumber(idNumber: string): string {
    if (idNumber.length === 13) {
      return `${idNumber.slice(0, 6)} ${idNumber.slice(6, 10)} ${idNumber.slice(10, 11)} ${idNumber.slice(11)}`;
    }
    return idNumber;
  }

  /**
   * Mask bank account number
   */
  private maskBankAccount(accountNumber: string): string {
    if (accountNumber.length <= 4) {
      return accountNumber;
    }
    return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  }

  /**
   * Format employment type
   */
  private formatEmploymentType(type: string): string {
    const types: Record<string, string> = {
      PERMANENT: 'Permanent Employment',
      CONTRACT: 'Fixed-Term Contract',
      PART_TIME: 'Part-Time Employment',
      TEMPORARY: 'Temporary Employment',
      CASUAL: 'Casual Employment',
    };
    return types[type] || type;
  }

  /**
   * Format pay frequency
   */
  private formatPayFrequency(frequency: string): string {
    const frequencies: Record<string, string> = {
      MONTHLY: 'Monthly',
      WEEKLY: 'Weekly',
      FORTNIGHTLY: 'Fortnightly',
      DAILY: 'Daily',
      HOURLY: 'Hourly',
    };
    return frequencies[frequency] || frequency;
  }

  /**
   * Calculate notice period based on employment type
   */
  private calculateNoticePeriod(employmentType: string): string {
    switch (employmentType) {
      case 'PERMANENT':
        return "one (1) calendar month's";
      case 'CONTRACT':
        return "one (1) week's";
      case 'PART_TIME':
        return "one (1) week's";
      case 'TEMPORARY':
      case 'CASUAL':
        return "one (1) day's";
      default:
        return "one (1) month's";
    }
  }
}
