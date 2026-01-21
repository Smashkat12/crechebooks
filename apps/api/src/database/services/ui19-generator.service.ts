/**
 * UI-19 Form Generator Service
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * Generates South African UIF declaration form (UI-19)
 * Required to be submitted within 14 days of termination
 *
 * All monetary values in CENTS (integers)
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOffboardingRepository } from '../repositories/staff-offboarding.repository';
import { OffboardingReason } from '../entities/staff-offboarding.entity';
import { NotFoundException } from '../../shared/exceptions';

// UI-19 Reason Code Mapping
interface Ui19ReasonCode {
  code: string;
  description: string;
}

// UI-19 Earnings Record
interface Ui19EarningsRecord {
  week: number;
  periodStart: Date;
  periodEnd: Date;
  earningsCents: number;
}

// UI-19 Document Data
interface Ui19DocumentData {
  employer: {
    name: string;
    registrationNumber: string | null;
    uifReferenceNumber: string | null;
    address: string;
    phone: string;
    email: string;
  };
  employee: {
    fullName: string;
    idNumber: string;
    taxNumber: string | null;
    dateOfBirth: Date;
    address: string | null;
    phone: string | null;
  };
  employment: {
    startDate: Date;
    lastWorkingDay: Date;
    reasonCode: Ui19ReasonCode;
    position: string;
    monthlyRemuneration: number;
  };
  earnings: Ui19EarningsRecord[];
  totals: {
    totalEarningsCents: number;
    averageWeeklyEarningsCents: number;
    periodsWorked: number;
  };
}

@Injectable()
export class Ui19GeneratorService {
  private readonly logger = new Logger(Ui19GeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingRepo: StaffOffboardingRepository,
  ) {}

  /**
   * Map offboarding reason to UI-19 reason code
   * Based on UIF Act Schedule 4
   *
   * @param reason - Offboarding reason enum
   * @returns UI-19 reason code and description
   */
  mapReasonCode(reason: OffboardingReason): Ui19ReasonCode {
    const mapping: Record<OffboardingReason, Ui19ReasonCode> = {
      [OffboardingReason.RESIGNATION]: {
        code: '1',
        description: 'Resignation',
      },
      [OffboardingReason.TERMINATION]: {
        code: '2',
        description: 'Termination by employer',
      },
      [OffboardingReason.RETIREMENT]: {
        code: '3',
        description: 'Retirement',
      },
      [OffboardingReason.DEATH]: {
        code: '4',
        description: 'Death',
      },
      [OffboardingReason.CONTRACT_END]: {
        code: '5',
        description: 'Contract expired',
      },
      [OffboardingReason.MUTUAL_AGREEMENT]: {
        code: '6',
        description: 'Mutual agreement',
      },
      [OffboardingReason.RETRENCHMENT]: {
        code: '7',
        description: 'Retrenchment',
      },
      [OffboardingReason.DISMISSAL]: {
        code: '8',
        description: 'Dismissal',
      },
      [OffboardingReason.ABSCONDED]: {
        code: '9',
        description: 'Absconded',
      },
    };

    return mapping[reason];
  }

  /**
   * Get last 13 weeks of earnings for UI-19
   * UI-19 requires the last 13 weeks of remuneration
   *
   * @param staffId - Staff ID
   * @param endDate - Last working day
   * @returns Array of weekly earnings records
   */
  async getEarningsHistory(
    staffId: string,
    endDate: Date,
  ): Promise<Ui19EarningsRecord[]> {
    // Get payroll records for last 13 weeks (91 days)
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 91);

    const payrolls = await this.prisma.payroll.findMany({
      where: {
        staffId,
        payPeriodEnd: { gte: startDate, lte: endDate },
        status: 'PAID',
      },
      orderBy: { payPeriodEnd: 'desc' },
      take: 13,
    });

    // Convert monthly payrolls to weekly estimates
    // Each month has approximately 4.33 weeks
    const weeklyEarnings: Ui19EarningsRecord[] = [];
    let weekNumber = 1;

    for (const payroll of payrolls) {
      // Convert monthly to weekly (divide by ~4.33)
      const weeklyAmount = Math.round(payroll.grossSalaryCents / 4.33);

      // Generate ~4 weeks per monthly payroll
      const weeksInPeriod = Math.min(4, 13 - weeklyEarnings.length);

      for (let w = 0; w < weeksInPeriod; w++) {
        const weekStart = new Date(payroll.payPeriodStart);
        weekStart.setDate(weekStart.getDate() + w * 7);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        weeklyEarnings.push({
          week: weekNumber++,
          periodStart: weekStart,
          periodEnd: weekEnd,
          earningsCents: weeklyAmount,
        });

        if (weeklyEarnings.length >= 13) break;
      }

      if (weeklyEarnings.length >= 13) break;
    }

    // If we have less than 13 weeks, use the staff's basic salary
    if (weeklyEarnings.length < 13 && weeklyEarnings.length > 0) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: staffId },
      });

      if (staff) {
        const weeklyBasic = Math.round(staff.basicSalaryCents / 4.33);
        while (weeklyEarnings.length < 13) {
          const lastWeek = weeklyEarnings[weeklyEarnings.length - 1];
          const weekStart = new Date(lastWeek.periodEnd);
          weekStart.setDate(weekStart.getDate() + 1);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);

          weeklyEarnings.push({
            week: weekNumber++,
            periodStart: weekStart,
            periodEnd: weekEnd,
            earningsCents: weeklyBasic,
          });
        }
      }
    }

    return weeklyEarnings.slice(0, 13);
  }

  /**
   * Gather all data required for UI-19 generation
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns Complete UI-19 document data
   */
  async gatherUi19Data(
    staffId: string,
    offboardingId: string,
  ): Promise<Ui19DocumentData> {
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

    const reasonInfo = this.mapReasonCode(
      offboarding.reason as OffboardingReason,
    );
    const earningsHistory = await this.getEarningsHistory(
      staffId,
      offboarding.lastWorkingDay,
    );

    const totalEarningsCents = earningsHistory.reduce(
      (sum, e) => sum + e.earningsCents,
      0,
    );
    const averageWeeklyEarningsCents =
      earningsHistory.length > 0
        ? Math.round(totalEarningsCents / earningsHistory.length)
        : 0;

    return {
      employer: {
        name: staff.tenant.tradingName || staff.tenant.name,
        registrationNumber: staff.tenant.registrationNumber,
        uifReferenceNumber: staff.tenant.registrationNumber, // Usually same or separate UIF number
        address: `${staff.tenant.addressLine1}, ${staff.tenant.city}, ${staff.tenant.postalCode}`,
        phone: staff.tenant.phone,
        email: staff.tenant.email,
      },
      employee: {
        fullName: `${staff.firstName} ${staff.lastName}`,
        idNumber: staff.idNumber,
        taxNumber: staff.taxNumber,
        dateOfBirth: staff.dateOfBirth,
        address: null, // Would come from staff address if stored
        phone: staff.phone,
      },
      employment: {
        startDate: staff.startDate,
        lastWorkingDay: offboarding.lastWorkingDay,
        reasonCode: reasonInfo,
        position: 'Staff Member', // Would come from job title if stored
        monthlyRemuneration: staff.basicSalaryCents,
      },
      earnings: earningsHistory,
      totals: {
        totalEarningsCents,
        averageWeeklyEarningsCents,
        periodsWorked: earningsHistory.length,
      },
    };
  }

  /**
   * Generate UI-19 form PDF
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns PDF buffer
   */
  async generateUi19(staffId: string, offboardingId: string): Promise<Buffer> {
    this.logger.log(`Generating UI-19 for staff ${staffId}`);

    const data = await this.gatherUi19Data(staffId, offboardingId);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `UI-19 - ${data.employee.fullName}`,
          Author: data.employer.name,
          Subject: 'UIF Declaration Form',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('UI-19', { align: 'center' });

      doc
        .fontSize(14)
        .font('Helvetica')
        .text('Unemployment Insurance Fund Declaration', { align: 'center' });

      doc
        .fontSize(10)
        .fillColor('#666666')
        .text('(As required by the Unemployment Insurance Act, 2001)', {
          align: 'center',
        });

      doc.moveDown(2);

      // Reset color
      doc.fillColor('#000000');

      // Section 1: Employer Details
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('SECTION A: EMPLOYER DETAILS');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      this.addField(doc, 'Employer Name:', data.employer.name);
      this.addField(
        doc,
        'UIF Reference Number:',
        data.employer.uifReferenceNumber || 'N/A',
      );
      this.addField(
        doc,
        'Registration Number:',
        data.employer.registrationNumber || 'N/A',
      );
      this.addField(doc, 'Address:', data.employer.address);
      this.addField(doc, 'Telephone:', data.employer.phone);
      this.addField(doc, 'Email:', data.employer.email);

      doc.moveDown(1);

      // Section 2: Employee Details
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('SECTION B: EMPLOYEE DETAILS');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      this.addField(doc, 'Full Name:', data.employee.fullName);
      this.addField(
        doc,
        'ID Number:',
        this.formatIdNumber(data.employee.idNumber),
      );
      this.addField(doc, 'Tax Number:', data.employee.taxNumber || 'N/A');
      this.addField(
        doc,
        'Date of Birth:',
        this.formatDate(data.employee.dateOfBirth),
      );
      this.addField(doc, 'Contact Number:', data.employee.phone || 'N/A');

      doc.moveDown(1);

      // Section 3: Employment Details
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('SECTION C: EMPLOYMENT DETAILS');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      this.addField(
        doc,
        'Date Employment Commenced:',
        this.formatDate(data.employment.startDate),
      );
      this.addField(
        doc,
        'Last Day Worked:',
        this.formatDate(data.employment.lastWorkingDay),
      );
      this.addField(
        doc,
        'Reason for Termination:',
        `${data.employment.reasonCode.code} - ${data.employment.reasonCode.description}`,
      );
      this.addField(
        doc,
        'Monthly Remuneration:',
        this.formatCurrency(data.employment.monthlyRemuneration),
      );

      doc.moveDown(1);

      // Section 4: Earnings (Last 13 Weeks)
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('SECTION D: EARNINGS (LAST 13 WEEKS)');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      const col1 = 50;
      const col2 = 100;
      const col3 = 200;
      const col4 = 350;
      const col5 = 450;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Week', col1, tableTop);
      doc.text('Period Start', col2, tableTop);
      doc.text('Period End', col3, tableTop);
      doc.text('Earnings', col4, tableTop);

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      // Table rows
      doc.font('Helvetica').fontSize(9);
      for (const record of data.earnings) {
        const y = doc.y;
        doc.text(record.week.toString(), col1, y);
        doc.text(this.formatDate(record.periodStart), col2, y);
        doc.text(this.formatDate(record.periodEnd), col3, y);
        doc.text(this.formatCurrency(record.earningsCents), col4, y);
        doc.moveDown(0.4);
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      // Totals
      doc.font('Helvetica-Bold');
      this.addField(
        doc,
        'Total Earnings (13 weeks):',
        this.formatCurrency(data.totals.totalEarningsCents),
      );
      this.addField(
        doc,
        'Average Weekly Earnings:',
        this.formatCurrency(data.totals.averageWeeklyEarningsCents),
      );

      doc.moveDown(2);

      // Declaration
      doc.fontSize(12).font('Helvetica-Bold').text('DECLARATION');
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(9).font('Helvetica');
      doc.text(
        'I hereby certify that the above information is true and correct. ' +
          'I understand that furnishing false information is an offence in terms of ' +
          'the Unemployment Insurance Act, 2001.',
        { align: 'justify' },
      );

      doc.moveDown(2);

      // Signature lines
      doc.text(
        '_______________________________          _______________________________',
      );
      doc.moveDown(0.5);
      doc.text('Employer Signature                                      Date');

      doc.moveDown(1.5);

      doc.text(
        '_______________________________          _______________________________',
      );
      doc.moveDown(0.5);
      doc.text('Employee Signature                                      Date');

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#666666');
      doc.text(
        'This form must be submitted to the Department of Labour within 14 days of termination.',
        { align: 'center' },
      );
      doc.text(`Generated on ${new Date().toLocaleDateString('en-ZA')}`, {
        align: 'center',
      });

      doc.end();
    });
  }

  /**
   * Mark UI-19 as generated in the offboarding record
   *
   * @param offboardingId - Offboarding ID
   */
  async markGenerated(offboardingId: string): Promise<void> {
    await this.offboardingRepo.recordDocumentGenerated(offboardingId, 'ui19');
    this.logger.log(
      `Marked UI-19 as generated for offboarding ${offboardingId}`,
    );
  }

  /**
   * Generate UI-19 and mark as generated
   *
   * @param staffId - Staff ID
   * @param offboardingId - Offboarding ID
   * @returns PDF buffer
   */
  async generateAndMark(
    staffId: string,
    offboardingId: string,
  ): Promise<Buffer> {
    const pdf = await this.generateUi19(staffId, offboardingId);
    await this.markGenerated(offboardingId);
    return pdf;
  }

  // Helper methods

  private addField(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
  ): void {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(label, 50, y, { continued: false });
    doc.font('Helvetica').text(value, 200, y);
    doc.y = y + 15;
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  private formatCurrency(cents: number): string {
    return `R ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
  }

  private formatIdNumber(idNumber: string): string {
    // Format SA ID number with spaces for readability
    if (idNumber.length === 13) {
      return `${idNumber.slice(0, 6)} ${idNumber.slice(6, 10)} ${idNumber.slice(10, 11)} ${idNumber.slice(11)}`;
    }
    return idNumber;
  }
}
