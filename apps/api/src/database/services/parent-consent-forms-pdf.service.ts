/**
 * Parent Consent Forms PDF Service
 * Generates all required consent forms for childcare enrollment
 *
 * South African childcare compliance (Children's Act, POPIA):
 * - POPIA consent for child's data processing
 * - Medical consent for emergency treatment
 * - Media consent for photos/videos
 * - Indemnity and liability waiver
 * - Terms and conditions acceptance
 */

import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../../shared/exceptions';

export interface ConsentFormsData {
  parentId: string;
  tenantId: string;
}

export interface ConsentFormsResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  fileSize: number;
}

@Injectable()
export class ParentConsentFormsPdfService {
  private readonly logger = new Logger(ParentConsentFormsPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate all consent forms PDF for a parent
   */
  async generateConsentForms(
    data: ConsentFormsData,
  ): Promise<ConsentFormsResult> {
    this.logger.log(`Generating consent forms for parent ${data.parentId}`);

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

    const buffer = await this.createConsentFormsPdf(
      parent,
      parent.tenant,
      parent.children,
    );

    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `Consent_Forms_${timestamp}.pdf`;
    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'parent-documents',
      data.tenantId,
      data.parentId,
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    this.logger.log(`Consent forms generated: ${filePath}`);

    return {
      buffer,
      fileName,
      filePath,
      fileSize: buffer.length,
    };
  }

  /**
   * Create the consent forms PDF document
   */
  private async createConsentFormsPdf(
    parent: {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      idNumber: string | null;
    },
    tenant: {
      name: string;
      tradingName: string | null;
      email: string | null;
      phone: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
    },
    children: Array<{
      firstName: string;
      lastName: string;
      dateOfBirth: Date | null;
    }>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `Consent Forms - ${parent.firstName} ${parent.lastName}`,
          Author: tenant.name,
          Subject: 'Childcare Consent Forms',
          Creator: 'CrecheBooks',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const crecheName = tenant.tradingName || tenant.name;

      // Header
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#1a365d')
        .text(crecheName, { align: 'center' });

      doc.moveDown(0.5);

      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('PARENTAL CONSENT FORMS', { align: 'center' });

      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#666666')
        .text('Required for Enrollment - Please Read Carefully', {
          align: 'center',
        });

      doc.moveDown(1);

      // Parent and Children Info
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(
        `Parent/Guardian: ${parent.firstName} ${parent.lastName}\n` +
          `ID Number: ${parent.idNumber || 'N/A'}\n` +
          `Children: ${children.map((c) => `${c.firstName} ${c.lastName}`).join(', ') || 'To be specified'}`,
      );

      doc.moveDown(1.5);

      // ============ SECTION 1: POPIA CONSENT ============
      this.renderSection(
        doc,
        'SECTION 1: POPIA CONSENT (Protection of Personal Information Act)',
      );

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I hereby consent to the collection, processing, and storage of personal information relating to myself and my child/children for the following purposes:\n\n' +
          '• Administration of enrollment and attendance records\n' +
          "• Communication regarding my child's care and development\n" +
          '• Emergency contact and medical treatment\n' +
          '• Statutory reporting to government departments\n' +
          '• Financial administration and billing\n' +
          '• Safety and security purposes\n\n' +
          'I understand that:\n' +
          '• I have the right to access and correct our personal information\n' +
          '• I may withdraw consent at any time (subject to contractual obligations)\n' +
          '• Personal information will be kept secure and confidential\n' +
          '• Information may be shared with relevant authorities as required by law',
      );

      doc.moveDown(1);

      // ============ SECTION 2: MEDICAL CONSENT ============
      this.renderSection(
        doc,
        'SECTION 2: MEDICAL CONSENT AND EMERGENCY TREATMENT',
      );

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'In the event of a medical emergency where I cannot be contacted, I hereby authorize the staff of ' +
          crecheName +
          ' to:\n\n' +
          '• Administer basic first aid as required\n' +
          '• Call emergency medical services (ambulance)\n' +
          '• Transport my child to the nearest medical facility\n' +
          '• Authorize emergency medical treatment if my life or health is at risk\n' +
          '• Administer prescribed medication as per written instructions\n\n' +
          'I confirm that I have provided complete and accurate medical history information, including:\n' +
          '• Allergies and medical conditions\n' +
          '• Current medications\n' +
          '• Medical aid details\n' +
          "• Doctor's contact information\n\n" +
          "I undertake to update the school of any changes to my child's medical status immediately.",
      );

      // New page
      doc.addPage();

      // ============ SECTION 3: MEDIA CONSENT ============
      this.renderSection(doc, 'SECTION 3: MEDIA AND PHOTOGRAPHY CONSENT');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I consent to photographs and/or videos being taken of my child for the following purposes:\n\n' +
          '☐ Internal use only (developmental records, portfolio)\n' +
          '☐ School website and promotional materials\n' +
          '☐ Social media platforms (Facebook, Instagram, etc.)\n' +
          '☐ Local media/newspapers (with prior notification)\n' +
          '☐ I DO NOT consent to any photographs or videos being taken\n\n' +
          'I understand that:\n' +
          '• I can change my consent at any time by notifying the school in writing\n' +
          '• Individual photos will not be identified by name on public platforms\n' +
          '• I may request copies of photographs taken of my child\n' +
          '• The school will not sell or share photographs with third parties for commercial purposes\n\n' +
          'Please tick the applicable boxes above.',
      );

      doc.moveDown(1);

      // ============ SECTION 4: AUTHORIZED COLLECTORS ============
      this.renderSection(doc, 'SECTION 4: AUTHORIZED COLLECTORS');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'In addition to myself, the following persons are authorized to collect my child from the school:\n\n' +
          '1. Name: _________________________ ID: _________________________ Relationship: _____________\n\n' +
          '2. Name: _________________________ ID: _________________________ Relationship: _____________\n\n' +
          '3. Name: _________________________ ID: _________________________ Relationship: _____________\n\n' +
          'I understand that:\n' +
          '• Authorized collectors must present valid ID when collecting my child\n' +
          '• I must notify the school in advance if someone else will collect my child\n' +
          '• The school will not release my child to unauthorized persons\n' +
          '• I must update this list immediately if authorization changes',
      );

      doc.moveDown(1);

      // ============ SECTION 5: INDEMNITY ============
      this.renderSection(doc, 'SECTION 5: INDEMNITY AND LIABILITY WAIVER');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I, the undersigned parent/guardian, hereby:\n\n' +
          '• Indemnify and hold harmless ' +
          crecheName +
          ', its staff, and representatives from any claims, damages, or losses arising from:\n' +
          '  - Accidents or injuries occurring during normal activities (unless due to negligence)\n' +
          '  - Loss or damage to personal property brought to the school\n' +
          '  - Illness contracted at the school\n\n' +
          '• Acknowledge that children may participate in age-appropriate activities including outdoor play, arts and crafts, and excursions\n\n' +
          '• Understand that the school maintains appropriate insurance coverage\n\n' +
          "• Agree to be responsible for any damages caused by my child to school property or other children's belongings",
      );

      // New page for signatures
      doc.addPage();

      // ============ SECTION 6: TERMS AND CONDITIONS ============
      this.renderSection(doc, 'SECTION 6: GENERAL TERMS AND CONDITIONS');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'By signing below, I agree to the following terms:\n\n' +
          '• I will abide by all school policies and procedures\n' +
          '• I will collect my child by the specified closing time (late fees may apply)\n' +
          '• I will provide all required documentation and keep it up to date\n' +
          '• I will communicate any concerns or issues to the school management\n' +
          '• I will not bring my child to school if they are ill (communicable diseases)\n' +
          "• I will label all my child's belongings clearly\n" +
          '• I will inform the school of any changes to contact details immediately\n' +
          '• I have read and understood all sections of this consent form',
      );

      doc.moveDown(2);

      // Declaration
      this.renderSection(doc, 'DECLARATION');

      doc.fontSize(10).font('Helvetica');
      doc.text(
        'I, the undersigned, declare that:\n\n' +
          '• I am the legal parent/guardian of the child/children named in this document\n' +
          '• All information provided is true and accurate\n' +
          '• I have read, understood, and agree to all sections of this consent form\n' +
          '• I have received a copy of the school policies and procedures',
      );

      doc.moveDown(2);

      // Signature Section
      const sigY = doc.y;

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('PARENT/GUARDIAN SIGNATURE:', 50, sigY);
      doc.moveDown(2);
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 50);
      doc.moveDown(0.5);
      doc.text(`Full Name: ${parent.firstName} ${parent.lastName}`, 50);
      doc.moveDown(0.5);
      doc.text(
        `ID Number: ${parent.idNumber || '_________________________'}`,
        50,
      );
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 50);

      // Witness
      doc.fontSize(10).font('Helvetica-Bold').text('WITNESS:', 320, sigY);
      doc.y = sigY + 30;
      doc.fontSize(10).font('Helvetica');
      doc.text('Signature: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Full Name: _________________________', 320);
      doc.moveDown(0.5);
      doc.text('Date: _________________________', 320);

      // School Acknowledgement
      doc.moveDown(3);
      doc.fontSize(10).font('Helvetica-Bold').text('FOR OFFICE USE:', 50);
      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica');
      doc.text(
        'Received by: _________________________ Date: _________________________',
        50,
      );
      doc.moveDown(0.5);
      doc.text('All documents verified: ☐ Yes ☐ No', 50);

      // Contact Info
      doc.moveDown(2);
      doc.fontSize(9).fillColor('#666666');
      doc.text('For queries, please contact:', { align: 'center' });
      doc.text(`${tenant.email || ''} | ${tenant.phone || ''}`, {
        align: 'center',
      });

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .fillColor('#888888')
          .text(
            `Page ${i + 1} of ${pages.count} | Consent Forms | Generated on ${this.formatDate(new Date())}`,
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
}
