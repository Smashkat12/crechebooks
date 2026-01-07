/**
 * Welcome Pack PDF Service
 * TASK-STAFF-001: Generate Welcome Pack for new staff
 *
 * Responsibilities:
 * - Generate PDF welcome pack for new staff members
 * - Include onboarding checklist, company info, policies
 * - Track welcome pack generation and delivery
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOnboardingRepository } from '../repositories/staff-onboarding.repository';
import { NotFoundException } from '../../shared/exceptions';
import {
  WelcomePackOptions,
  WelcomePackResult,
} from '../dto/staff-onboarding.dto';

// Dynamic import for PDFKit (CommonJS module)
type PDFDocument = InstanceType<typeof import('pdfkit')>;

@Injectable()
export class WelcomePackPdfService {
  private readonly logger = new Logger(WelcomePackPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingRepo: StaffOnboardingRepository,
  ) {}

  /**
   * Generate a welcome pack PDF for a staff member
   */
  async generateWelcomePack(
    staffId: string,
    tenantId: string,
    options: WelcomePackOptions = {},
  ): Promise<Buffer> {
    this.logger.log(`Generating welcome pack for staff ${staffId}`);

    // Get staff with tenant details
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
      include: { tenant: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    // Get onboarding checklist items
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    let checklistItems: string[] = [];
    if (onboarding) {
      const items = await this.onboardingRepo.findChecklistItemsByOnboarding(
        onboarding.id,
      );
      checklistItems = items.map((item) => item.title);
    }

    // Dynamically import PDFKit
    const PDFDocumentConstructor = (await import('pdfkit')).default;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocumentConstructor({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'Welcome Pack',
          Author: staff.tenant.name,
          Subject: `Welcome Pack for ${staff.firstName} ${staff.lastName}`,
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      // Header with company logo placeholder
      this.addHeader(doc, staff.tenant.name);

      // Title
      doc.moveDown(2);
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('Welcome Pack', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(14)
        .font('Helvetica')
        .text(`Prepared for: ${staff.firstName} ${staff.lastName}`, {
          align: 'center',
        });
      doc.moveDown(2);

      // Welcome message
      this.addWelcomeMessage(doc, staff, options.customMessage);

      // Employee information section
      this.addEmployeeInfo(doc, staff);

      // Onboarding checklist
      this.addOnboardingChecklist(doc, checklistItems);

      // Important policies (if requested)
      if (options.includePolicies !== false) {
        this.addPoliciesSection(doc);
      }

      // Emergency contacts (if requested)
      if (options.includeEmergencyContacts !== false) {
        this.addEmergencyContacts(doc, staff.tenant);
      }

      // First day schedule (if requested)
      if (options.includeFirstDaySchedule) {
        this.addFirstDaySchedule(doc);
      }

      // Footer
      this.addFooter(doc);

      doc.end();
    });
  }

  /**
   * Add header with company name
   */
  private addHeader(doc: PDFDocument, companyName: string): void {
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#666666')
      .text(companyName, 50, 30, { align: 'left' });

    doc.text(new Date().toLocaleDateString('en-ZA'), 0, 30, { align: 'right' });

    // Line separator
    doc.moveTo(50, 50).lineTo(545, 50).strokeColor('#cccccc').stroke();

    doc.fillColor('#000000');
  }

  /**
   * Add welcome message
   */
  private addWelcomeMessage(
    doc: PDFDocument,
    staff: { firstName: string; lastName: string },
    customMessage?: string,
  ): void {
    doc.fontSize(12).font('Helvetica');

    if (customMessage) {
      doc.text(customMessage, { align: 'justify' });
    } else {
      doc.text(
        `Dear ${staff.firstName},\n\n` +
          `Welcome to our team! We are thrilled to have you join us. This welcome pack contains ` +
          `important information to help you get started in your new role.\n\n` +
          `Please review all the documents carefully and complete the onboarding checklist. ` +
          `If you have any questions, don't hesitate to reach out to your manager or the HR department.`,
        { align: 'justify' },
      );
    }

    doc.moveDown(2);
  }

  /**
   * Add employee information section
   */
  private addEmployeeInfo(
    doc: PDFDocument,
    staff: {
      firstName: string;
      lastName: string;
      employeeNumber: string | null;
      startDate: Date;
      employmentType: string;
    },
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Employee Information', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica');

    const infoItems = [
      ['Full Name:', `${staff.firstName} ${staff.lastName}`],
      ['Employee Number:', staff.employeeNumber || 'To be assigned'],
      ['Start Date:', staff.startDate.toLocaleDateString('en-ZA')],
      ['Employment Type:', this.formatEmploymentType(staff.employmentType)],
    ];

    infoItems.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, { continued: true });
      doc.font('Helvetica').text(` ${value}`);
    });

    doc.moveDown(1.5);
  }

  /**
   * Add onboarding checklist section
   */
  private addOnboardingChecklist(
    doc: PDFDocument,
    checklistItems: string[],
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Onboarding Checklist', { underline: true });
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(
        'Please complete the following items as part of your onboarding process:',
      );
    doc.moveDown(0.5);

    if (checklistItems.length > 0) {
      checklistItems.forEach((item) => {
        doc.text(`   [ ] ${item}`);
      });
    } else {
      // Default checklist if none exists
      const defaultItems = [
        'Complete personal information form',
        'Submit ID document copy',
        'Submit proof of address',
        'Submit tax number (if available)',
        'Complete banking details form',
        'Read and sign employment contract',
        'Complete POPIA consent form',
        'Acknowledge code of conduct',
        'Attend orientation session',
      ];
      defaultItems.forEach((item) => {
        doc.text(`   [ ] ${item}`);
      });
    }

    doc.moveDown(1.5);
  }

  /**
   * Add important policies section
   */
  private addPoliciesSection(doc: PDFDocument): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Important Policies', { underline: true });
    doc.moveDown(0.5);

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('Please familiarise yourself with the following company policies:');
    doc.moveDown(0.5);

    const policies = [
      'Code of Conduct - Standards of professional behaviour',
      'Leave Policy - Annual, sick, and family responsibility leave',
      'Data Protection (POPIA) - Handling of personal information',
      'Health and Safety - Workplace safety procedures',
      'Child Protection - Safeguarding of children in our care',
      'Dress Code - Professional attire expectations',
    ];

    policies.forEach((policy) => {
      doc.text(`   * ${policy}`);
    });

    doc.moveDown(1.5);
  }

  /**
   * Add emergency contacts section
   */
  private addEmergencyContacts(
    doc: PDFDocument,
    tenant: { name: string; email: string | null; phone: string | null },
  ): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Important Contacts', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica');

    const contacts = [
      ['HR Department:', tenant.email || 'hr@company.com'],
      ['Main Office:', tenant.phone || 'To be provided'],
      ['Emergency:', '10111 (SAPS) | 10177 (Ambulance)'],
    ];

    contacts.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, { continued: true });
      doc.font('Helvetica').text(` ${value}`);
    });

    doc.moveDown(1.5);
  }

  /**
   * Add first day schedule section
   */
  private addFirstDaySchedule(doc: PDFDocument): void {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Your First Day', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica');

    const schedule = [
      ['08:00 - 08:30', 'Welcome and facility tour'],
      ['08:30 - 09:30', 'Meet your team and manager'],
      ['09:30 - 10:30', 'HR paperwork and documentation'],
      ['10:30 - 11:00', 'Tea break'],
      ['11:00 - 12:00', 'IT setup and access credentials'],
      ['12:00 - 13:00', 'Lunch'],
      ['13:00 - 15:00', 'Role-specific training'],
      ['15:00 - 16:00', 'Questions and wrap-up'],
    ];

    schedule.forEach(([time, activity]) => {
      doc.font('Helvetica-Bold').text(time, { continued: true });
      doc.font('Helvetica').text(`  ${activity}`);
    });

    doc.moveDown(1.5);
  }

  /**
   * Add footer with page number
   */
  private addFooter(doc: PDFDocument): void {
    const pages = (
      doc as unknown as {
        bufferedPageRange: () => { start: number; count: number };
      }
    ).bufferedPageRange();

    // Only add footers if there are buffered pages
    if (pages.count === 0) return;

    for (let i = 0; i < pages.count; i++) {
      const pageIndex = pages.start + i;
      doc.switchToPage(pageIndex);

      // Footer line
      doc.moveTo(50, 780).lineTo(545, 780).strokeColor('#cccccc').stroke();

      // Page number
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`Page ${i + 1} of ${pages.count}`, 0, 790, { align: 'center' });

      // Confidential note
      doc
        .fontSize(8)
        .text(
          'This document is confidential and for the named recipient only.',
          50,
          800,
        );
    }
  }

  /**
   * Format employment type for display
   */
  private formatEmploymentType(type: string): string {
    const types: Record<string, string> = {
      FULL_TIME: 'Full-time',
      PART_TIME: 'Part-time',
      CONTRACT: 'Contract',
      CASUAL: 'Casual',
      INTERN: 'Internship',
    };
    return types[type] || type;
  }

  /**
   * Mark welcome pack as generated for an onboarding
   */
  async markWelcomePackGenerated(staffId: string): Promise<void> {
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (onboarding) {
      await this.onboardingRepo.updateOnboarding(onboarding.id, {
        welcomePackGeneratedAt: new Date(),
      });
    }
  }

  /**
   * Mark welcome pack as sent for an onboarding
   */
  async markWelcomePackSent(staffId: string): Promise<void> {
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (onboarding) {
      await this.onboardingRepo.updateOnboarding(onboarding.id, {
        welcomePackSentAt: new Date(),
      });
    }
  }

  /**
   * Generate and store welcome pack, returning metadata
   */
  async generateAndStoreWelcomePack(
    staffId: string,
    tenantId: string,
    options: WelcomePackOptions = {},
  ): Promise<WelcomePackResult> {
    const pdfBuffer = await this.generateWelcomePack(
      staffId,
      tenantId,
      options,
    );

    // Mark as generated
    await this.markWelcomePackGenerated(staffId);

    // In a real implementation, you would upload to cloud storage here
    // For now, we return a placeholder URL
    const timestamp = Date.now();
    const pdfUrl = `/api/staff/${staffId}/welcome-pack/${timestamp}.pdf`;

    return {
      pdfUrl,
      generatedAt: new Date(),
    };
  }
}
