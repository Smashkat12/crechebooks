/**
 * Parent Welcome Pack PDF Service
 * TASK-ENROL-006: Generate Welcome Pack PDF for newly enrolled children's parents
 *
 * Responsibilities:
 * - Generate PDF welcome pack for parents of newly enrolled children
 * - Include enrollment details, creche info, policies, and what to bring
 * - Format currency in ZAR and dates in SA format
 * - Professional visual design with colored sections and modern styling
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../../shared/exceptions';
import {
  ParentWelcomePackOptions,
  ParentWelcomePackResult,
  WelcomePackEnrollmentData,
  WelcomePackTenantInfo,
} from '../dto/parent-welcome-pack.dto';

// Dynamic import for PDFKit (CommonJS module)
type PDFDocument = InstanceType<typeof import('pdfkit')>;

// Brand colors for the PDF design
const COLORS = {
  primary: '#2563EB', // Blue
  primaryDark: '#1E40AF',
  primaryLight: '#DBEAFE',
  secondary: '#059669', // Green
  secondaryLight: '#D1FAE5',
  accent: '#F59E0B', // Amber
  accentLight: '#FEF3C7',
  purple: '#7C3AED',
  purpleLight: '#EDE9FE',
  text: '#1F2937',
  textLight: '#6B7280',
  border: '#E5E7EB',
  background: '#F9FAFB',
  white: '#FFFFFF',
};

@Injectable()
export class ParentWelcomePackPdfService {
  private readonly logger = new Logger(ParentWelcomePackPdfService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a welcome pack PDF for a parent based on enrollment
   */
  async generateWelcomePack(
    enrollmentId: string,
    tenantId: string,
    options: ParentWelcomePackOptions = {},
  ): Promise<ParentWelcomePackResult> {
    this.logger.log(
      `Generating parent welcome pack for enrollment ${enrollmentId}`,
    );

    // Get enrollment with child, parent, fee structure, and tenant details
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      include: {
        child: {
          include: {
            parent: true,
          },
        },
        feeStructure: true,
        tenant: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Prepare enrollment data
    const enrollmentData: WelcomePackEnrollmentData = {
      enrollmentId: enrollment.id,
      childFirstName: enrollment.child.firstName,
      childLastName: enrollment.child.lastName,
      parentFirstName: enrollment.child.parent.firstName,
      parentLastName: enrollment.child.parent.lastName,
      parentEmail: enrollment.child.parent.email,
      startDate: enrollment.startDate,
      feeTierName: enrollment.feeStructure.name,
      monthlyFeeCents:
        enrollment.customFeeOverrideCents ??
        enrollment.feeStructure.amountCents,
      registrationFeeCents: enrollment.feeStructure.registrationFeeCents,
      vatInclusive: enrollment.feeStructure.vatInclusive,
      siblingDiscountApplied: enrollment.siblingDiscountApplied,
      siblingDiscountPercent: enrollment.feeStructure.siblingDiscountPercent
        ? Number(enrollment.feeStructure.siblingDiscountPercent)
        : null,
    };

    // Prepare tenant info
    const tenantInfo: WelcomePackTenantInfo = {
      name: enrollment.tenant.name,
      tradingName: enrollment.tenant.tradingName,
      addressLine1: enrollment.tenant.addressLine1,
      addressLine2: enrollment.tenant.addressLine2,
      city: enrollment.tenant.city,
      province: enrollment.tenant.province,
      postalCode: enrollment.tenant.postalCode,
      phone: enrollment.tenant.phone,
      email: enrollment.tenant.email,
      parentWelcomeMessage:
        (enrollment.tenant as any).parentWelcomeMessage ?? null,
      operatingHours: (enrollment.tenant as any).operatingHours ?? null,
      bankName: (enrollment.tenant as any).bankName ?? null,
      bankAccountHolder: (enrollment.tenant as any).bankAccountHolder ?? null,
      bankAccountNumber: (enrollment.tenant as any).bankAccountNumber ?? null,
      bankBranchCode: (enrollment.tenant as any).bankBranchCode ?? null,
    };

    // Generate PDF
    const pdfBuffer = await this.createPdfDocument(
      enrollmentData,
      tenantInfo,
      options,
    );

    return {
      pdfBuffer,
      generatedAt: new Date(),
    };
  }

  /**
   * Create the PDF document
   */
  private async createPdfDocument(
    enrollmentData: WelcomePackEnrollmentData,
    tenantInfo: WelcomePackTenantInfo,
    options: ParentWelcomePackOptions,
  ): Promise<Buffer> {
    // Dynamically import PDFKit
    const PDFDocumentConstructor = (await import('pdfkit')).default;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocumentConstructor({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'Parent Welcome Pack',
          Author: tenantInfo.name,
          Subject: `Welcome Pack for ${enrollmentData.childFirstName} ${enrollmentData.childLastName}`,
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      // 1. Header with creche name and logo placeholder
      this.addHeader(doc, tenantInfo);

      // 2. Title section with welcome banner
      this.addTitleSection(doc, enrollmentData);
      doc.moveDown(1.5);

      // 3. Welcome message
      this.addWelcomeMessage(
        doc,
        enrollmentData,
        tenantInfo,
        options.customMessage,
      );

      // 4. Enrollment details
      this.addEnrollmentDetails(doc, enrollmentData);

      // 5. Creche information
      this.addCrecheInfo(doc, tenantInfo);

      // 6. Fee structure summary
      if (options.includeFeeBreakdown !== false) {
        this.addFeeStructure(doc, enrollmentData);
      }

      // 7. Key policies summary
      this.addKeyPolicies(doc);

      // 8. What to bring list
      if (options.includeWhatToBring !== false) {
        this.addWhatToBring(doc);
      }

      // 9. Emergency procedures (optional)
      if (options.includeEmergencyProcedures !== false) {
        this.addEmergencyProcedures(doc);
      }

      // 10. Closing section
      this.addClosingSection(doc, tenantInfo);

      // Footer
      this.addFooter(doc);

      doc.end();
    });
  }

  /**
   * Add visually appealing header with colored banner
   */
  private addHeader(doc: PDFDocument, tenantInfo: WelcomePackTenantInfo): void {
    const displayName = tenantInfo.tradingName || tenantInfo.name;
    const pageWidth = 595; // A4 width in points

    // Draw header banner background
    doc.rect(0, 0, pageWidth, 100).fill(COLORS.primary);

    // Add decorative circle pattern (subtle design element)
    doc.opacity(0.1);
    doc.circle(pageWidth - 50, 50, 80).fill(COLORS.white);
    doc.circle(pageWidth - 100, 20, 40).fill(COLORS.white);
    doc.opacity(1);

    // Creche name in header
    doc
      .fontSize(24)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text(displayName, 50, 35, { width: pageWidth - 150 });

    // Date badge
    doc.roundedRect(pageWidth - 140, 30, 100, 25, 3).fill(COLORS.primaryDark);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.white)
      .text(this.formatDateSA(new Date()), pageWidth - 135, 38, {
        width: 90,
        align: 'center',
      });

    // Tagline
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor(COLORS.primaryLight)
      .text('Early Learning Centre', 50, 65);

    doc.fillColor(COLORS.text);
    doc.y = 120; // Reset position after header
  }

  /**
   * Add title section with welcome banner
   */
  private addTitleSection(
    doc: PDFDocument,
    enrollmentData: WelcomePackEnrollmentData,
  ): void {
    const pageWidth = 495; // Content width (A4 - margins)
    const startX = 50;

    // Welcome Pack title with icon
    doc
      .fontSize(28)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text('Welcome Pack', startX, doc.y, { align: 'center' });

    doc.moveDown(0.3);

    // Subtitle with child's name highlighted
    doc
      .fontSize(14)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text('Prepared for the family of', { align: 'center' });

    doc.moveDown(0.2);
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor(COLORS.primary)
      .text(
        `${enrollmentData.childFirstName} ${enrollmentData.childLastName}`,
        { align: 'center' },
      );

    // Decorative line
    doc.moveDown(0.8);
    const lineY = doc.y;
    doc
      .moveTo(startX + 150, lineY)
      .lineTo(startX + pageWidth - 150, lineY)
      .strokeColor(COLORS.border)
      .lineWidth(2)
      .stroke();
    doc.lineWidth(1);

    doc.fillColor(COLORS.text);
  }

  /**
   * Add a styled section header with colored background
   */
  private addSectionHeader(
    doc: PDFDocument,
    title: string,
    color: string,
    iconSymbol?: string,
  ): void {
    const startX = 50;
    const headerWidth = 495;
    const headerHeight = 28;

    // Background rectangle with rounded corners
    doc.roundedRect(startX, doc.y, headerWidth, headerHeight, 4).fill(color);

    // Icon circle (if provided)
    if (iconSymbol) {
      doc
        .circle(startX + 18, doc.y - headerHeight / 2 + 14, 10)
        .fill(COLORS.white);
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor(color)
        .text(iconSymbol, startX + 12, doc.y - headerHeight / 2 + 8, {
          width: 12,
          align: 'center',
        });
    }

    // Title text
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text(title, startX + (iconSymbol ? 35 : 15), doc.y - headerHeight + 8, {
        width: headerWidth - 50,
      });

    doc.y = doc.y + 10;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add welcome message section
   */
  private addWelcomeMessage(
    doc: PDFDocument,
    enrollmentData: WelcomePackEnrollmentData,
    tenantInfo: WelcomePackTenantInfo,
    customMessage?: string,
  ): void {
    doc.fontSize(12).font('Helvetica');

    const message =
      customMessage ||
      tenantInfo.parentWelcomeMessage ||
      this.getDefaultWelcomeMessage(enrollmentData, tenantInfo);

    doc.text(message, { align: 'justify' });
    doc.moveDown(2);
  }

  /**
   * Get default welcome message
   */
  private getDefaultWelcomeMessage(
    enrollmentData: WelcomePackEnrollmentData,
    tenantInfo: WelcomePackTenantInfo,
  ): string {
    const displayName = tenantInfo.tradingName || tenantInfo.name;
    return (
      `Dear ${enrollmentData.parentFirstName},\n\n` +
      `Welcome to ${displayName}! We are delighted that you have chosen us to be part of ` +
      `${enrollmentData.childFirstName}'s early learning journey. This welcome pack contains ` +
      `important information about our creche, including operating hours, fees, policies, ` +
      `and what to bring on your child's first day.\n\n` +
      `Please read through this document carefully. If you have any questions, don't hesitate ` +
      `to contact us. We look forward to welcoming ${enrollmentData.childFirstName} on ` +
      `${this.formatDateSA(enrollmentData.startDate)}!`
    );
  }

  /**
   * Add enrollment details section with card layout
   */
  private addEnrollmentDetails(
    doc: PDFDocument,
    enrollmentData: WelcomePackEnrollmentData,
  ): void {
    this.addSectionHeader(doc, 'Enrollment Details', COLORS.primary);
    doc.moveDown(0.5);

    const startX = 50;
    const cardWidth = 495;
    const cardStartY = doc.y;

    // Draw card background
    doc
      .roundedRect(startX, cardStartY, cardWidth, 80, 6)
      .fillAndStroke(COLORS.primaryLight, COLORS.border);

    // Three column layout for enrollment info
    const colWidth = cardWidth / 3;
    const cardPadding = 15;

    // Column 1: Child's Name
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text("Child's Name", startX + cardPadding, cardStartY + cardPadding);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text(
        `${enrollmentData.childFirstName} ${enrollmentData.childLastName}`,
        startX + cardPadding,
        cardStartY + cardPadding + 15,
        { width: colWidth - cardPadding * 2 },
      );

    // Column 2: Start Date
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text(
        'Start Date',
        startX + colWidth + cardPadding,
        cardStartY + cardPadding,
      );
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text(
        this.formatDateSA(enrollmentData.startDate),
        startX + colWidth + cardPadding,
        cardStartY + cardPadding + 15,
      );

    // Column 3: Fee Tier
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text(
        'Fee Tier',
        startX + colWidth * 2 + cardPadding,
        cardStartY + cardPadding,
      );
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text(
        enrollmentData.feeTierName,
        startX + colWidth * 2 + cardPadding,
        cardStartY + cardPadding + 15,
      );

    // Add sibling discount badge if applicable
    if (
      enrollmentData.siblingDiscountApplied &&
      enrollmentData.siblingDiscountPercent
    ) {
      doc
        .roundedRect(startX + cardPadding, cardStartY + 50, 130, 20, 3)
        .fill(COLORS.secondary);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(COLORS.white)
        .text(
          `${enrollmentData.siblingDiscountPercent}% Sibling Discount`,
          startX + cardPadding + 10,
          cardStartY + 55,
        );
    }

    doc.y = cardStartY + 95;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add creche information section with styled cards
   */
  private addCrecheInfo(
    doc: PDFDocument,
    tenantInfo: WelcomePackTenantInfo,
  ): void {
    this.addSectionHeader(doc, 'Contact Information', COLORS.secondary);
    doc.moveDown(0.5);

    const startX = 50;
    const cardWidth = 240;
    const cardHeight = 75;
    const cardGap = 15;
    const cardStartY = doc.y;

    // Card 1: Address
    doc
      .roundedRect(startX, cardStartY, cardWidth, cardHeight, 6)
      .fillAndStroke(COLORS.secondaryLight, COLORS.border);

    // Address icon (location pin shape)
    doc.circle(startX + 20, cardStartY + 20, 12).fill(COLORS.secondary);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('A', startX + 15, cardStartY + 14);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text('Address', startX + 40, cardStartY + 12);

    const addressParts = [tenantInfo.addressLine1];
    if (tenantInfo.addressLine2) addressParts.push(tenantInfo.addressLine2);
    addressParts.push(`${tenantInfo.city}, ${tenantInfo.province}`);
    addressParts.push(tenantInfo.postalCode || '');

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.text)
      .text(
        addressParts.filter(Boolean).join('\n'),
        startX + 40,
        cardStartY + 25,
        {
          width: cardWidth - 55,
          lineGap: 2,
        },
      );

    // Card 2: Contact Details
    doc
      .roundedRect(
        startX + cardWidth + cardGap,
        cardStartY,
        cardWidth,
        cardHeight,
        6,
      )
      .fillAndStroke(COLORS.secondaryLight, COLORS.border);

    // Phone icon
    doc
      .circle(startX + cardWidth + cardGap + 20, cardStartY + 20, 12)
      .fill(COLORS.secondary);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('C', startX + cardWidth + cardGap + 15, cardStartY + 14);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text('Contact', startX + cardWidth + cardGap + 40, cardStartY + 12);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.text)
      .text(
        `Phone: ${tenantInfo.phone}`,
        startX + cardWidth + cardGap + 40,
        cardStartY + 25,
      );
    doc
      .fontSize(10)
      .text(
        `Email: ${tenantInfo.email}`,
        startX + cardWidth + cardGap + 40,
        cardStartY + 40,
        {
          width: cardWidth - 55,
        },
      );

    // Operating hours badge below cards
    doc.y = cardStartY + cardHeight + 10;
    const hoursText =
      tenantInfo.operatingHours || 'Monday - Friday: 7:00 AM - 6:00 PM';
    doc
      .roundedRect(startX, doc.y, cardWidth * 2 + cardGap, 30, 4)
      .fill(COLORS.accent);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text(`Operating Hours: ${hoursText}`, startX + 15, doc.y - 20, {
        width: cardWidth * 2 + cardGap - 30,
      });

    doc.y = doc.y + 20;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add fee structure section with styled layout
   */
  private addFeeStructure(
    doc: PDFDocument,
    enrollmentData: WelcomePackEnrollmentData,
  ): void {
    this.addSectionHeader(doc, 'Fee Structure', COLORS.purple);
    doc.moveDown(0.5);

    const startX = 50;
    const contentWidth = 495;

    // Monthly fee calculation
    let monthlyFee = enrollmentData.monthlyFeeCents;
    if (
      enrollmentData.siblingDiscountApplied &&
      enrollmentData.siblingDiscountPercent
    ) {
      const discountAmount = Math.round(
        monthlyFee * (enrollmentData.siblingDiscountPercent / 100),
      );
      monthlyFee -= discountAmount;
    }

    // Fee cards - two column layout
    const feeCardWidth = 235;
    const feeCardHeight = 60;
    const feeCardY = doc.y;

    // Monthly Fee Card
    doc
      .roundedRect(startX, feeCardY, feeCardWidth, feeCardHeight, 6)
      .fillAndStroke(COLORS.purpleLight, COLORS.border);

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text('Monthly Fee', startX + 15, feeCardY + 12);

    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor(COLORS.purple)
      .text(this.formatCurrencyZAR(monthlyFee), startX + 15, feeCardY + 28);

    // Registration Fee Card (if applicable)
    if (enrollmentData.registrationFeeCents > 0) {
      doc
        .roundedRect(
          startX + feeCardWidth + 25,
          feeCardY,
          feeCardWidth,
          feeCardHeight,
          6,
        )
        .fillAndStroke(COLORS.accentLight, COLORS.border);

      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(COLORS.textLight)
        .text(
          'Registration Fee (once-off)',
          startX + feeCardWidth + 40,
          feeCardY + 12,
        );

      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .fillColor(COLORS.accent)
        .text(
          this.formatCurrencyZAR(enrollmentData.registrationFeeCents),
          startX + feeCardWidth + 40,
          feeCardY + 28,
        );
    }

    doc.y = feeCardY + feeCardHeight + 15;

    // VAT note
    doc.fontSize(9).font('Helvetica').fillColor(COLORS.textLight);
    if (enrollmentData.vatInclusive) {
      doc.text('* All fees include VAT where applicable', startX);
    } else {
      doc.text(
        '* Fees exclude VAT - VAT will be added where applicable',
        startX,
      );
    }

    doc.moveDown(1);

    // What's Included section
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text("What's Included:", startX);
    doc.moveDown(0.3);

    const inclusions = [
      { icon: '✓', text: 'Full-day care and supervision' },
      { icon: '✓', text: 'Age-appropriate educational activities' },
      { icon: '✓', text: 'Nutritious meals and snacks' },
      { icon: '✓', text: 'Indoor and outdoor play activities' },
      { icon: '✓', text: 'Regular developmental assessments' },
    ];

    inclusions.forEach((item) => {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(COLORS.secondary)
        .text(item.icon, startX + 10, doc.y, { continued: true });
      doc.font('Helvetica').fillColor(COLORS.text).text(`  ${item.text}`);
    });

    doc.moveDown(1);
    doc.fillColor(COLORS.text);
  }

  /**
   * Add key policies section with styled list
   */
  private addKeyPolicies(doc: PDFDocument): void {
    // Check if we need a new page
    if (doc.y > 550) {
      doc.addPage();
      doc.y = 50;
    }

    this.addSectionHeader(doc, 'Key Policies', COLORS.primaryDark);
    doc.moveDown(0.5);

    const startX = 50;
    const contentWidth = 495;

    const policies = [
      {
        title: 'Drop-off & Pick-up',
        description:
          'Children must be signed in and out daily. Only authorized persons may collect your child.',
        color: COLORS.primary,
      },
      {
        title: 'Sick Child Policy',
        description:
          'Children with fever, vomiting, or contagious illnesses must stay home. We will contact you if your child becomes ill.',
        color: COLORS.secondary,
      },
      {
        title: 'Payment Terms',
        description:
          'Fees are due by the 7th of each month. A late payment fee may apply after this date.',
        color: COLORS.accent,
      },
      {
        title: 'Absence Notification',
        description:
          'Please notify us by 8:00 AM if your child will be absent for the day.',
        color: COLORS.purple,
      },
      {
        title: 'Notice Period',
        description:
          'One calendar month written notice is required for withdrawal from the programme.',
        color: COLORS.primaryDark,
      },
    ];

    policies.forEach((policy, index) => {
      const policyY = doc.y;

      // Colored left border
      doc.rect(startX, policyY, 4, 35).fill(policy.color);

      // Policy title
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(COLORS.text)
        .text(policy.title, startX + 15, policyY + 3);

      // Policy description
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(COLORS.textLight)
        .text(policy.description, startX + 15, policyY + 18, {
          width: contentWidth - 20,
        });

      doc.y = policyY + 42;
    });

    doc.fillColor(COLORS.text);
  }

  /**
   * Add what to bring section with styled checklist in card layout
   */
  private addWhatToBring(doc: PDFDocument): void {
    // Check if we need a new page
    if (doc.y > 450) {
      doc.addPage();
      doc.y = 50;
    }

    this.addSectionHeader(doc, 'What to Bring', COLORS.secondary);
    doc.moveDown(0.5);

    const startX = 50;
    const contentWidth = 495;

    // Main container card
    const containerY = doc.y;
    const containerHeight = 200;
    doc
      .roundedRect(startX, containerY, contentWidth, containerHeight, 8)
      .fillAndStroke(COLORS.secondaryLight, COLORS.border);

    // Intro text inside card
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.text)
      .text(
        'Please ensure your child has the following items (all clearly labeled):',
        startX + 15,
        containerY + 15,
        { width: contentWidth - 30 },
      );

    const items = [
      {
        text: 'Spare change of clothes (2-3 sets)',
        essential: true,
        icon: '👕',
      },
      { text: 'Nappies/diapers (if applicable)', essential: false, icon: '🧒' },
      { text: 'Wet wipes and nappy cream', essential: false, icon: '🧴' },
      { text: 'Comfort item (blanket/soft toy)', essential: true, icon: '🧸' },
      { text: 'Hat for outdoor play', essential: true, icon: '🎩' },
      { text: 'Sunscreen (SPF 30+)', essential: true, icon: '☀️' },
      { text: 'Water bottle (labeled)', essential: true, icon: '🥤' },
      {
        text: 'Prescribed medication + instructions',
        essential: false,
        icon: '💊',
      },
    ];

    // Two column layout inside card
    const colWidth = (contentWidth - 50) / 2;
    const itemsPerCol = Math.ceil(items.length / 2);
    const itemHeight = 32;
    const listStartY = containerY + 40;

    items.forEach((item, index) => {
      const col = index < itemsPerCol ? 0 : 1;
      const row = index < itemsPerCol ? index : index - itemsPerCol;
      const itemX = startX + 20 + col * (colWidth + 10);
      const itemY = listStartY + row * itemHeight;

      // Item background (alternating subtle colors)
      const bgColor = item.essential ? COLORS.white : '#F0FDF4';
      doc
        .roundedRect(itemX, itemY, colWidth - 5, itemHeight - 4, 4)
        .fill(bgColor);

      // Checkbox with checkmark style
      const checkX = itemX + 8;
      const checkY = itemY + 8;
      doc
        .circle(checkX + 7, checkY + 7, 8)
        .fill(item.essential ? COLORS.secondary : COLORS.border);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(COLORS.white)
        .text('✓', checkX + 3, checkY + 2);

      // Item text
      doc
        .fontSize(9)
        .font(item.essential ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(COLORS.text)
        .text(item.text, itemX + 30, itemY + 10, {
          width: colWidth - 45,
        });

      // Essential indicator
      if (item.essential) {
        doc
          .fontSize(6)
          .font('Helvetica')
          .fillColor(COLORS.secondary)
          .text('Required', itemX + colWidth - 45, itemY + 12);
      }
    });

    doc.y = containerY + containerHeight + 10;

    // Important note banner below the card
    const noteY = doc.y;
    doc.roundedRect(startX, noteY, contentWidth, 40, 6).fill(COLORS.accent);

    // Warning icon circle
    doc.circle(startX + 25, noteY + 20, 12).fill(COLORS.white);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(COLORS.accent)
      .text('!', startX + 21, noteY + 13);

    // Note text
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('Important Reminder', startX + 45, noteY + 8);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.white)
      .text(
        "Please label ALL items with your child's full name to prevent mix-ups and lost items.",
        startX + 45,
        noteY + 22,
        { width: contentWidth - 60 },
      );

    doc.y = noteY + 50;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add emergency procedures section with styled card layout
   */
  private addEmergencyProcedures(doc: PDFDocument): void {
    // Check if we need a new page
    if (doc.y > 400) {
      doc.addPage();
      doc.y = 50;
    }

    // Red alert-style section header
    const alertRed = '#DC2626';
    const alertRedLight = '#FEF2F2';
    const alertRedDark = '#991B1B';

    this.addSectionHeader(doc, 'Emergency Procedures', alertRed);
    doc.moveDown(0.5);

    const startX = 50;
    const contentWidth = 495;

    // Main container card with red theme
    const containerY = doc.y;
    const containerHeight = 180;
    doc
      .roundedRect(startX, containerY, contentWidth, containerHeight, 8)
      .fillAndStroke(alertRedLight, '#FECACA');

    // Alert banner at top of card
    doc
      .roundedRect(startX + 10, containerY + 10, contentWidth - 20, 35, 4)
      .fill(alertRed);

    // Alert icon
    doc.circle(startX + 32, containerY + 27, 10).fill(COLORS.white);
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(alertRed)
      .text('!', startX + 28, containerY + 21);

    // Alert text
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('Safety First', startX + 50, containerY + 15);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.white)
      .text(
        'All staff are first aid certified. We follow strict emergency protocols.',
        startX + 50,
        containerY + 28,
        { width: contentWidth - 80 },
      );

    // Procedures list
    const procedures = [
      'Emergency contacts kept on file and updated regularly',
      'Parents contacted immediately for any injury or illness',
      'Monthly fire drills and evacuation practice',
      'Emergency plans posted throughout the facility',
    ];

    const listStartY = containerY + 55;
    const itemHeight = 28;

    procedures.forEach((procedure, index) => {
      const itemY = listStartY + index * itemHeight;

      // Numbered badge
      doc.circle(startX + 25, itemY + 10, 10).fill(alertRed);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(COLORS.white)
        .text(String(index + 1), startX + 21, itemY + 5);

      // Procedure text with background
      doc
        .roundedRect(startX + 42, itemY, contentWidth - 60, itemHeight - 4, 4)
        .fill(COLORS.white);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(COLORS.text)
        .text(procedure, startX + 52, itemY + 8, {
          width: contentWidth - 80,
        });
    });

    doc.y = containerY + containerHeight + 15;

    // Emergency numbers section
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(COLORS.text)
      .text('Emergency Contact Numbers', startX);
    doc.moveDown(0.3);

    const numbersY = doc.y;
    const cardHeight = 60;
    const cardWidth = (contentWidth - 20) / 3;

    // Card 1: SAPS
    doc.roundedRect(startX, numbersY, cardWidth, cardHeight, 6).fill(alertRed);
    doc.circle(startX + 20, numbersY + 18, 12).fill(COLORS.white);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(alertRed)
      .text('P', startX + 15, numbersY + 12);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#FECACA')
      .text('Police (SAPS)', startX + 38, numbersY + 10);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('10111', startX + 38, numbersY + 22);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#FECACA')
      .text('24 hours', startX + 38, numbersY + 42);

    // Card 2: Ambulance
    doc
      .roundedRect(startX + cardWidth + 10, numbersY, cardWidth, cardHeight, 6)
      .fill(COLORS.secondary);
    doc.circle(startX + cardWidth + 30, numbersY + 18, 12).fill(COLORS.white);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(COLORS.secondary)
      .text('+', startX + cardWidth + 25, numbersY + 12);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(COLORS.secondaryLight)
      .text('Ambulance', startX + cardWidth + 48, numbersY + 10);
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('10177', startX + cardWidth + 48, numbersY + 22);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(COLORS.secondaryLight)
      .text('Medical emergencies', startX + cardWidth + 48, numbersY + 42);

    // Card 3: Poison Control
    doc
      .roundedRect(
        startX + (cardWidth + 10) * 2,
        numbersY,
        cardWidth,
        cardHeight,
        6,
      )
      .fill(COLORS.accent);
    doc
      .circle(startX + (cardWidth + 10) * 2 + 20, numbersY + 18, 12)
      .fill(COLORS.white);
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(COLORS.accent)
      .text('Rx', startX + (cardWidth + 10) * 2 + 13, numbersY + 12);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(COLORS.accentLight)
      .text(
        'Poison Control',
        startX + (cardWidth + 10) * 2 + 38,
        numbersY + 10,
      );
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor(COLORS.white)
      .text('0861 555 777', startX + (cardWidth + 10) * 2 + 38, numbersY + 23);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(COLORS.accentLight)
      .text(
        '24-hour helpline',
        startX + (cardWidth + 10) * 2 + 38,
        numbersY + 42,
      );

    doc.y = numbersY + cardHeight + 20;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add closing section with thank you message
   */
  private addClosingSection(
    doc: PDFDocument,
    tenantInfo: WelcomePackTenantInfo,
  ): void {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
      doc.y = 50;
    }

    const startX = 50;
    const contentWidth = 495;
    const displayName = tenantInfo.tradingName || tenantInfo.name;

    // Closing card with gradient-like effect
    const cardY = doc.y;
    const cardHeight = 100;

    // Background with subtle gradient effect (layered rectangles)
    doc
      .roundedRect(startX, cardY, contentWidth, cardHeight, 8)
      .fill(COLORS.primaryLight);
    doc
      .roundedRect(startX + 5, cardY + 5, contentWidth - 10, cardHeight - 10, 6)
      .fill(COLORS.white);

    // Thank you message
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor(COLORS.primary)
      .text('Thank You for Choosing Us!', startX + 20, cardY + 20, {
        width: contentWidth - 40,
        align: 'center',
      });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(COLORS.text)
      .text(
        `We are honored to have your family join the ${displayName} community. ` +
          "We look forward to being part of your child's early learning journey and creating wonderful memories together.",
        startX + 20,
        cardY + 42,
        { width: contentWidth - 40, align: 'center', lineGap: 2 },
      );

    // Contact reminder at bottom of card
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(COLORS.textLight)
      .text(
        `Questions? Contact us at ${tenantInfo.phone} or ${tenantInfo.email}`,
        startX + 20,
        cardY + 78,
        { width: contentWidth - 40, align: 'center' },
      );

    doc.y = cardY + cardHeight + 20;
    doc.fillColor(COLORS.text);
  }

  /**
   * Add styled footer with page numbers and branding
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

      // Footer background bar
      doc.rect(0, 770, 595, 72).fill(COLORS.primary);

      // Decorative accent strip
      doc.rect(0, 770, 595, 3).fill(COLORS.accent);

      // Left side: Document info
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(COLORS.primaryLight)
        .text('Welcome Pack - Enrollment Documentation', 50, 782);

      // Center: Page number in pill
      const pageText = `${i + 1} / ${pages.count}`;
      const pillWidth = 50;
      const pillX = (595 - pillWidth) / 2;
      doc.roundedRect(pillX, 778, pillWidth, 18, 9).fill(COLORS.white);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(COLORS.primary)
        .text(pageText, pillX, 782, { width: pillWidth, align: 'center' });

      // Right side: Keep for records note
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(COLORS.primaryLight)
        .text('Please keep for your records', 350, 782, {
          width: 195,
          align: 'right',
        });

      // Bottom tagline
      doc
        .fontSize(7)
        .fillColor(COLORS.white)
        .text('Nurturing little minds, big futures', 0, 800, {
          width: 595,
          align: 'center',
        });
    }
  }

  /**
   * Format date in South African format (DD/MM/YYYY)
   */
  private formatDateSA(date: Date): string {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Format currency in ZAR (R 1,234.00)
   */
  private formatCurrencyZAR(cents: number): string {
    const rands = cents / 100;
    return `R ${rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
