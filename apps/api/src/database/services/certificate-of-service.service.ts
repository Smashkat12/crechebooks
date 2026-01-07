/**
 * Certificate of Service Generator Service
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * Generates Certificate of Service as required by BCEA Section 42
 * Must be issued on termination of employment
 *
 * All monetary values in CENTS (integers)
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOffboardingRepository } from '../repositories/staff-offboarding.repository';
import { OffboardingReason } from '../entities/staff-offboarding.entity';
import { NotFoundException } from '../../shared/exceptions';

// Certificate Data Interface
interface CertificateData {
  employer: {
    name: string;
    tradingName: string | null;
    registrationNumber: string | null;
    address: string;
    phone: string;
    email: string;
  };
  employee: {
    fullName: string;
    idNumber: string;
    position: string;
    department: string;
  };
  employment: {
    startDate: Date;
    endDate: Date;
    tenureYears: number;
    tenureMonths: number;
    tenureDays: number;
    reason: string;
    reasonDescription: string;
  };
  remuneration: {
    finalSalaryCents: number;
    payFrequency: string;
  };
  issueDate: Date;
  certificateNumber: string;
}

@Injectable()
export class CertificateOfServiceService {
  private readonly logger = new Logger(CertificateOfServiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingRepo: StaffOffboardingRepository,
  ) {}

  /**
   * Get human-readable reason description
   *
   * @param reason - Offboarding reason enum
   * @returns Human-readable description
   */
  getReasonDescription(reason: OffboardingReason): string {
    const descriptions: Record<OffboardingReason, string> = {
      [OffboardingReason.RESIGNATION]: 'Voluntary resignation',
      [OffboardingReason.TERMINATION]: 'Employment terminated by employer',
      [OffboardingReason.RETIREMENT]: 'Retirement',
      [OffboardingReason.DEATH]: 'Death of employee',
      [OffboardingReason.CONTRACT_END]: 'Fixed-term contract expired',
      [OffboardingReason.MUTUAL_AGREEMENT]: 'Mutual agreement between parties',
      [OffboardingReason.RETRENCHMENT]:
        'Retrenchment (operational requirements)',
      [OffboardingReason.DISMISSAL]: 'Dismissal',
      [OffboardingReason.ABSCONDED]: 'Employee absconded',
    };

    return descriptions[reason];
  }

  /**
   * Calculate tenure between two dates
   */
  calculateTenure(
    startDate: Date,
    endDate: Date,
  ): { years: number; months: number; days: number } {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      const lastDayOfPrevMonth = new Date(
        end.getFullYear(),
        end.getMonth(),
        0,
      ).getDate();
      days += lastDayOfPrevMonth;
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }

  /**
   * Generate unique certificate number
   *
   * @param tenantId - Tenant ID
   * @param staffId - Staff ID
   * @returns Unique certificate number
   */
  generateCertificateNumber(tenantId: string, staffId: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const tenantShort = tenantId.substring(0, 4).toUpperCase();
    const staffShort = staffId.substring(0, 6).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();

    return `COS-${year}${month}-${tenantShort}-${staffShort}-${timestamp}`;
  }

  /**
   * Gather all data required for certificate generation
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns Complete certificate data
   */
  async gatherCertificateData(
    staffId: string,
    offboardingId: string,
  ): Promise<CertificateData> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      include: { tenant: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    const tenure = this.calculateTenure(
      staff.startDate,
      offboarding.lastWorkingDay,
    );
    const reason = offboarding.reason as OffboardingReason;

    return {
      employer: {
        name: staff.tenant.name,
        tradingName: staff.tenant.tradingName,
        registrationNumber: staff.tenant.registrationNumber,
        address: `${staff.tenant.addressLine1}${staff.tenant.addressLine2 ? ', ' + staff.tenant.addressLine2 : ''}, ${staff.tenant.city}, ${staff.tenant.province}, ${staff.tenant.postalCode}`,
        phone: staff.tenant.phone,
        email: staff.tenant.email,
      },
      employee: {
        fullName: `${staff.firstName} ${staff.lastName}`,
        idNumber: staff.idNumber,
        position: 'Staff Member', // Would come from job title if stored
        department: 'General', // Would come from department if stored
      },
      employment: {
        startDate: staff.startDate,
        endDate: offboarding.lastWorkingDay,
        tenureYears: tenure.years,
        tenureMonths: tenure.months,
        tenureDays: tenure.days,
        reason: reason,
        reasonDescription: this.getReasonDescription(reason),
      },
      remuneration: {
        finalSalaryCents: staff.basicSalaryCents,
        payFrequency: staff.payFrequency,
      },
      issueDate: new Date(),
      certificateNumber: this.generateCertificateNumber(
        staff.tenantId,
        staffId,
      ),
    };
  }

  /**
   * Generate Certificate of Service PDF
   * As required by BCEA Section 42
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns PDF buffer
   */
  async generateCertificate(
    staffId: string,
    offboardingId: string,
  ): Promise<Buffer> {
    this.logger.log(`Generating Certificate of Service for staff ${staffId}`);

    const data = await this.gatherCertificateData(staffId, offboardingId);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 60,
        size: 'A4',
        info: {
          Title: `Certificate of Service - ${data.employee.fullName}`,
          Author: data.employer.name,
          Subject: 'Certificate of Service (BCEA Section 42)',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Decorative border
      doc.strokeColor('#1a365d').lineWidth(2).rect(40, 40, 515, 752).stroke();

      doc.strokeColor('#2c5282').lineWidth(1).rect(45, 45, 505, 742).stroke();

      // Header with employer name
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(data.employer.tradingName || data.employer.name, 60, 80, {
          align: 'center',
        });

      if (
        data.employer.tradingName &&
        data.employer.tradingName !== data.employer.name
      ) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`Trading as ${data.employer.tradingName}`, { align: 'center' });
      }

      doc.moveDown(0.5);

      // Title
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#2c5282')
        .text('CERTIFICATE OF SERVICE', { align: 'center' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(
          '(Issued in terms of Section 42 of the Basic Conditions of Employment Act, 1997)',
          {
            align: 'center',
          },
        );

      doc.moveDown(1);

      // Certificate number
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#888888')
        .text(`Certificate No: ${data.certificateNumber}`, { align: 'right' });

      doc.moveDown(1);

      // Horizontal line
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .stroke();

      doc.moveDown(1);

      // Main content
      doc.fillColor('#000000').fontSize(11).font('Helvetica');

      doc.text('This is to certify that:', { align: 'left' });
      doc.moveDown(1);

      // Employee details section
      doc.font('Helvetica-Bold').text('EMPLOYEE DETAILS', 80);
      doc.moveDown(0.5);

      doc.font('Helvetica');
      this.addCertificateField(doc, 'Full Name:', data.employee.fullName);
      this.addCertificateField(
        doc,
        'ID Number:',
        this.formatIdNumber(data.employee.idNumber),
      );
      this.addCertificateField(doc, 'Position:', data.employee.position);

      doc.moveDown(1);

      // Employment details section
      doc.font('Helvetica-Bold').text('EMPLOYMENT DETAILS', 80);
      doc.moveDown(0.5);

      doc.font('Helvetica');
      this.addCertificateField(
        doc,
        'Date of Commencement:',
        this.formatDate(data.employment.startDate),
      );
      this.addCertificateField(
        doc,
        'Date of Termination:',
        this.formatDate(data.employment.endDate),
      );
      this.addCertificateField(
        doc,
        'Period of Service:',
        this.formatTenure(
          data.employment.tenureYears,
          data.employment.tenureMonths,
          data.employment.tenureDays,
        ),
      );
      this.addCertificateField(
        doc,
        'Reason for Termination:',
        data.employment.reasonDescription,
      );

      doc.moveDown(1);

      // Remuneration section
      doc.font('Helvetica-Bold').text('REMUNERATION', 80);
      doc.moveDown(0.5);

      doc.font('Helvetica');
      this.addCertificateField(
        doc,
        'Final Monthly Salary:',
        this.formatCurrency(data.remuneration.finalSalaryCents),
      );
      this.addCertificateField(
        doc,
        'Pay Frequency:',
        data.remuneration.payFrequency,
      );

      doc.moveDown(2);

      // Employer declaration
      doc.font('Helvetica-Bold').text('EMPLOYER DECLARATION', 80);
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(10);
      doc.text(
        `I, the undersigned, being duly authorized to act on behalf of ${data.employer.name}, ` +
          `hereby certify that the above information is true and correct to the best of my knowledge.`,
        80,
        doc.y,
        { width: 435, align: 'justify' },
      );

      doc.moveDown(2);

      // Signature section
      const sigY = doc.y;

      // Left signature block
      doc.text('_________________________________', 80, sigY);
      doc.text('Authorized Signatory', 80, sigY + 15);
      doc.text('Name: _________________________', 80, sigY + 35);
      doc.text('Designation: ___________________', 80, sigY + 50);

      // Right signature block
      doc.text('_________________________________', 340, sigY);
      doc.text('Date', 340, sigY + 15);
      doc.text(this.formatDate(data.issueDate), 340, sigY + 35);

      doc.moveDown(6);

      // Company stamp placeholder
      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .rect(400, doc.y, 120, 60)
        .stroke();

      doc
        .fontSize(8)
        .fillColor('#888888')
        .text('Company Stamp', 430, doc.y + 25);

      // Footer
      doc.y = 720;

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(60, doc.y)
        .lineTo(535, doc.y)
        .stroke();

      doc.moveDown(0.5);

      doc.fontSize(8).fillColor('#666666');
      doc.text(data.employer.address, { align: 'center' });
      doc.text(
        `Tel: ${data.employer.phone}  |  Email: ${data.employer.email}`,
        {
          align: 'center',
        },
      );

      if (data.employer.registrationNumber) {
        doc.text(`Reg No: ${data.employer.registrationNumber}`, {
          align: 'center',
        });
      }

      doc.moveDown(0.5);
      doc.fontSize(7).fillColor('#888888');
      doc.text(`Generated on ${this.formatDate(new Date())} by CrecheBooks`, {
        align: 'center',
      });

      doc.end();
    });
  }

  /**
   * Mark certificate as generated in the offboarding record
   *
   * @param offboardingId - Offboarding ID
   */
  async markGenerated(offboardingId: string): Promise<void> {
    await this.offboardingRepo.recordDocumentGenerated(
      offboardingId,
      'certificate',
    );
    this.logger.log(
      `Marked Certificate of Service as generated for offboarding ${offboardingId}`,
    );
  }

  /**
   * Generate certificate and mark as generated
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns PDF buffer
   */
  async generateAndMark(
    staffId: string,
    offboardingId: string,
  ): Promise<Buffer> {
    const pdf = await this.generateCertificate(staffId, offboardingId);
    await this.markGenerated(offboardingId);
    return pdf;
  }

  // Helper methods

  private addCertificateField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(label, 100, y, { continued: false });
    doc.font('Helvetica').text(value, 250, y);
    doc.y = y + 18;
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatCurrency(cents: number): string {
    return `R ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }

  private formatIdNumber(idNumber: string): string {
    if (idNumber.length === 13) {
      return `${idNumber.slice(0, 6)} ${idNumber.slice(6, 10)} ${idNumber.slice(10, 11)} ${idNumber.slice(11)}`;
    }
    return idNumber;
  }

  private formatTenure(years: number, months: number, days: number): string {
    const parts: string[] = [];

    if (years > 0) {
      parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    }
    if (months > 0) {
      parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    }
    if (days > 0 || parts.length === 0) {
      parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    }

    return parts.join(', ');
  }
}
