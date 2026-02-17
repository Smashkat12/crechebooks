/**
 * Parent Onboarding Service
 * Comprehensive onboarding workflow for parents including:
 * - Contact information collection
 * - Fee agreement generation and acceptance
 * - Consent forms (POPIA, medical, media, indemnity)
 * - Welcome pack delivery upon completion
 *
 * South African childcare compliance:
 * - POPIA consent
 * - Children's Act requirements
 * - Consumer Protection Act (fee agreements)
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ParentFeeAgreementPdfService } from './parent-fee-agreement-pdf.service';
import { ParentConsentFormsPdfService } from './parent-consent-forms-pdf.service';
import { WelcomePackDeliveryService } from './welcome-pack-delivery.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

export interface ParentOnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  completedCount: number;
  totalRequired: number;
  requiredActions: OnboardingAction[];
  documents: GeneratedDocument[];
}

export interface OnboardingAction {
  id: string;
  title: string;
  description: string;
  category: 'personal' | 'contact' | 'consents' | 'agreements';
  isRequired: boolean;
  isComplete: boolean;
}

export interface GeneratedDocument {
  id: string;
  documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS' | 'WELCOME_PACK';
  fileName: string;
  filePath: string;
  generatedAt: Date;
  signedAt: Date | null;
  acknowledged: boolean;
}

export interface SignDocumentDto {
  documentType: 'FEE_AGREEMENT' | 'CONSENT_FORMS';
  signedByName: string;
  signedByIp?: string;
  mediaConsent?: 'internal_only' | 'website' | 'social_media' | 'all' | 'none';
  authorizedCollectors?: Array<{
    name: string;
    idNumber: string;
    relationship: string;
  }>;
}

export interface FeeChildSummary {
  childName: string;
  feeType: string;
  feeStructureName: string;
  monthlyAmountCents: number;
  registrationFeeCents: number;
  siblingDiscountApplied: boolean;
  siblingDiscountPercent: number | null;
  vatInclusive: boolean;
}

export interface FeeSummary {
  schoolName: string;
  invoiceDayOfMonth: number;
  invoiceDueDays: number;
  children: FeeChildSummary[];
}

@Injectable()
export class ParentOnboardingService {
  private readonly logger = new Logger(ParentOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeAgreementService: ParentFeeAgreementPdfService,
    private readonly consentFormsService: ParentConsentFormsPdfService,
    private readonly welcomePackDelivery: WelcomePackDeliveryService,
  ) {}

  /**
   * Get comprehensive onboarding status for a parent
   */
  async getOnboardingStatus(
    parentId: string,
    tenantId: string,
  ): Promise<ParentOnboardingStatus> {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      include: {
        children: { where: { deletedAt: null } },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    // Check address completeness
    let addressComplete = false;
    if (parent.address) {
      try {
        const addr = JSON.parse(parent.address);
        addressComplete = !!(addr.street && addr.city);
      } catch {
        addressComplete = !!parent.address;
      }
    }

    // Get existing generated documents
    const documents = await this.getGeneratedDocuments(parentId, tenantId);
    const feeAgreement = documents.find(
      (d) => d.documentType === 'FEE_AGREEMENT',
    );
    const consentForms = documents.find(
      (d) => d.documentType === 'CONSENT_FORMS',
    );

    // Define all onboarding actions
    const requiredActions: OnboardingAction[] = [
      {
        id: 'contact_phone',
        title: 'Phone Number',
        description: 'Primary contact number for communication',
        category: 'contact',
        isRequired: true,
        isComplete: !!parent.phone,
      },
      {
        id: 'contact_address',
        title: 'Physical Address',
        description: 'Required for correspondence and emergencies',
        category: 'contact',
        isRequired: true,
        isComplete: addressComplete,
      },
      {
        id: 'contact_whatsapp',
        title: 'WhatsApp Number',
        description: 'Alternative contact for quick communication',
        category: 'contact',
        isRequired: false,
        isComplete: !!parent.whatsapp,
      },
      {
        id: 'fee_agreement',
        title: 'Fee Agreement',
        description: 'Review and accept the fee agreement and payment terms',
        category: 'agreements',
        isRequired: true,
        isComplete: feeAgreement?.acknowledged ?? false,
      },
      {
        id: 'consent_forms',
        title: 'Consent Forms',
        description:
          'POPIA consent, medical consent, media consent, and indemnity',
        category: 'consents',
        isRequired: true,
        isComplete: consentForms?.acknowledged ?? false,
      },
    ];

    // Calculate progress
    const requiredItems = requiredActions.filter((a) => a.isRequired);
    const completedRequired = requiredItems.filter((a) => a.isComplete).length;
    const completedAll = requiredActions.filter((a) => a.isComplete).length;
    const percentComplete = Math.round(
      (completedAll / requiredActions.length) * 100,
    );

    // Determine status
    let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'NOT_STARTED';
    if (completedRequired === requiredItems.length) {
      status = 'COMPLETED';
    } else if (completedAll > 0) {
      status = 'IN_PROGRESS';
    }

    return {
      status,
      percentComplete,
      completedCount: completedAll,
      totalRequired: requiredItems.length,
      requiredActions,
      documents,
    };
  }

  /**
   * Get fee summary for the parent's enrolled children
   */
  async getFeeSummary(
    parentId: string,
    tenantId: string,
  ): Promise<FeeSummary> {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      include: {
        children: {
          where: { deletedAt: null },
          include: {
            enrollments: {
              where: { status: { in: ['ACTIVE', 'PENDING'] } },
              include: { feeStructure: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        tradingName: true,
        invoiceDayOfMonth: true,
        invoiceDueDays: true,
      },
    });

    const children: FeeChildSummary[] = [];

    for (const child of parent.children) {
      const enrollment = (
        child as typeof child & {
          enrollments: Array<{
            customFeeOverrideCents: number | null;
            siblingDiscountApplied: boolean;
            feeStructure: {
              name: string;
              feeType: string;
              amountCents: number;
              registrationFeeCents: number;
              siblingDiscountPercent: unknown;
              vatInclusive: boolean;
            };
          }>;
        }
      ).enrollments?.[0];
      if (!enrollment) continue;

      const fs = enrollment.feeStructure;
      const monthlyAmountCents =
        enrollment.customFeeOverrideCents ?? fs.amountCents;

      children.push({
        childName: `${child.firstName} ${child.lastName}`,
        feeType: fs.feeType,
        feeStructureName: fs.name,
        monthlyAmountCents,
        registrationFeeCents: fs.registrationFeeCents,
        siblingDiscountApplied: enrollment.siblingDiscountApplied,
        siblingDiscountPercent: fs.siblingDiscountPercent
          ? Number(fs.siblingDiscountPercent)
          : null,
        vatInclusive: fs.vatInclusive,
      });
    }

    return {
      schoolName: tenant?.tradingName || tenant?.name || '',
      invoiceDayOfMonth: tenant?.invoiceDayOfMonth ?? 1,
      invoiceDueDays: tenant?.invoiceDueDays ?? 7,
      children,
    };
  }

  /**
   * Generate all onboarding documents for a parent
   */
  async generateDocuments(
    parentId: string,
    tenantId: string,
  ): Promise<GeneratedDocument[]> {
    this.logger.log(`Generating onboarding documents for parent ${parentId}`);

    const documents: GeneratedDocument[] = [];

    // Generate fee agreement
    const feeAgreement = await this.feeAgreementService.generateFeeAgreement({
      parentId,
      tenantId,
    });

    const feeDoc = await this.saveGeneratedDocument(
      parentId,
      tenantId,
      'FEE_AGREEMENT',
      feeAgreement.fileName,
      feeAgreement.filePath,
    );
    documents.push(feeDoc);

    // Generate consent forms
    const consentForms = await this.consentFormsService.generateConsentForms({
      parentId,
      tenantId,
    });

    const consentDoc = await this.saveGeneratedDocument(
      parentId,
      tenantId,
      'CONSENT_FORMS',
      consentForms.fileName,
      consentForms.filePath,
    );
    documents.push(consentDoc);

    this.logger.log(
      `Generated ${documents.length} documents for parent ${parentId}`,
    );

    return documents;
  }

  /**
   * Get all generated documents for a parent
   */
  async getGeneratedDocuments(
    parentId: string,
    tenantId: string,
  ): Promise<GeneratedDocument[]> {
    const docs = await this.prisma.parentGeneratedDocument.findMany({
      where: { parentId, tenantId },
      orderBy: { generatedAt: 'asc' },
    });

    return docs.map((d) => ({
      id: d.id,
      documentType: d.documentType as GeneratedDocument['documentType'],
      fileName: d.fileName,
      filePath: d.filePath,
      generatedAt: d.generatedAt,
      signedAt: d.signedAt,
      acknowledged: d.acknowledged,
    }));
  }

  /**
   * Sign/acknowledge a document
   */
  async signDocument(
    parentId: string,
    tenantId: string,
    dto: SignDocumentDto,
    clientIp?: string,
  ): Promise<GeneratedDocument> {
    this.logger.log(`Signing ${dto.documentType} for parent ${parentId}`);

    // Find the document
    const document = await this.prisma.parentGeneratedDocument.findFirst({
      where: {
        parentId,
        tenantId,
        documentType: dto.documentType,
      },
    });

    if (!document) {
      // Generate document if it doesn't exist
      await this.generateDocuments(parentId, tenantId);
      const newDoc = await this.prisma.parentGeneratedDocument.findFirst({
        where: {
          parentId,
          tenantId,
          documentType: dto.documentType,
        },
      });
      if (!newDoc) {
        throw new BusinessException(
          'Failed to generate document',
          'DOCUMENT_GENERATION_FAILED',
        );
      }
    }

    // Update document as signed
    const updated = await this.prisma.parentGeneratedDocument.update({
      where: { id: document?.id || '' },
      data: {
        acknowledged: true,
        signedAt: new Date(),
        signedByName: dto.signedByName,
        signedByIp: clientIp || dto.signedByIp || null,
        metadata:
          dto.mediaConsent || dto.authorizedCollectors
            ? JSON.stringify({
                mediaConsent: dto.mediaConsent,
                authorizedCollectors: dto.authorizedCollectors,
              })
            : null,
      },
    });

    this.logger.log(
      `Document ${dto.documentType} signed by ${dto.signedByName}`,
    );

    // Check if all documents are now signed
    await this.checkAndTriggerWelcomePack(parentId, tenantId);

    return {
      id: updated.id,
      documentType: updated.documentType as GeneratedDocument['documentType'],
      fileName: updated.fileName,
      filePath: updated.filePath,
      generatedAt: updated.generatedAt,
      signedAt: updated.signedAt,
      acknowledged: updated.acknowledged,
    };
  }

  /**
   * Update parent profile during onboarding
   */
  async updateProfile(
    parentId: string,
    tenantId: string,
    data: {
      phone?: string;
      whatsapp?: string;
      address?: {
        street: string;
        city: string;
        postalCode?: string;
      };
    },
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (data.phone) {
      updateData.phone = data.phone;
    }
    if (data.whatsapp) {
      updateData.whatsapp = data.whatsapp;
    }
    if (data.address) {
      updateData.address = JSON.stringify(data.address);
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.parent.update({
        where: { id: parentId },
        data: updateData,
      });
      this.logger.log(`Updated profile for parent ${parentId}`);
    }

    // Check if onboarding is now complete
    await this.checkAndTriggerWelcomePack(parentId, tenantId);
  }

  /**
   * Complete onboarding and trigger welcome pack
   */
  async completeOnboarding(
    parentId: string,
    tenantId: string,
  ): Promise<{ success: boolean; message: string }> {
    const status = await this.getOnboardingStatus(parentId, tenantId);

    if (status.status !== 'COMPLETED') {
      const incompleteItems = status.requiredActions
        .filter((a) => a.isRequired && !a.isComplete)
        .map((a) => a.title);

      return {
        success: false,
        message: `Onboarding incomplete. Missing: ${incompleteItems.join(', ')}`,
      };
    }

    // Trigger welcome pack delivery
    try {
      // Find enrollment for welcome pack
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          tenantId,
          child: { parentId },
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (enrollment && !enrollment.welcomePackSentAt) {
        await this.welcomePackDelivery.sendWelcomePack(tenantId, enrollment.id);
        this.logger.log(`Welcome pack sent for parent ${parentId}`);
      }

      return {
        success: true,
        message: 'Onboarding completed successfully. Welcome pack sent.',
      };
    } catch (error) {
      this.logger.error(`Failed to send welcome pack: ${error}`);
      return {
        success: true,
        message: 'Onboarding completed. Welcome pack delivery pending.',
      };
    }
  }

  /**
   * Download a generated document
   */
  async downloadDocument(
    documentId: string,
    parentId: string,
    tenantId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const document = await this.prisma.parentGeneratedDocument.findFirst({
      where: {
        id: documentId,
        parentId,
        tenantId,
      },
    });

    if (!document) {
      throw new NotFoundException('Document', documentId);
    }

    let buffer: Buffer;

    if (fs.existsSync(document.filePath)) {
      buffer = fs.readFileSync(document.filePath);
    } else {
      // File missing (e.g. after redeploy on ephemeral filesystem) — regenerate
      this.logger.warn(
        `File not found at ${document.filePath}, regenerating ${document.documentType}`,
      );

      if (document.documentType === 'FEE_AGREEMENT') {
        const result = await this.feeAgreementService.generateFeeAgreement({
          parentId,
          tenantId,
        });
        buffer = result.buffer;
        await this.prisma.parentGeneratedDocument.update({
          where: { id: document.id },
          data: { filePath: result.filePath, fileName: result.fileName },
        });
      } else if (document.documentType === 'CONSENT_FORMS') {
        const result = await this.consentFormsService.generateConsentForms({
          parentId,
          tenantId,
        });
        buffer = result.buffer;
        await this.prisma.parentGeneratedDocument.update({
          where: { id: document.id },
          data: { filePath: result.filePath, fileName: result.fileName },
        });
      } else {
        throw new BusinessException(
          'Document file not found and cannot be regenerated',
          'DOCUMENT_FILE_NOT_FOUND',
        );
      }
    }

    return {
      buffer,
      fileName: document.fileName,
      mimeType: 'application/pdf',
    };
  }

  /**
   * Save generated document record
   */
  private async saveGeneratedDocument(
    parentId: string,
    tenantId: string,
    documentType: string,
    fileName: string,
    filePath: string,
  ): Promise<GeneratedDocument> {
    // Check if document already exists
    const existing = await this.prisma.parentGeneratedDocument.findFirst({
      where: { parentId, tenantId, documentType },
    });

    if (existing) {
      // Update existing document
      const updated = await this.prisma.parentGeneratedDocument.update({
        where: { id: existing.id },
        data: {
          fileName,
          filePath,
          generatedAt: new Date(),
          // Don't reset signature status
        },
      });

      return {
        id: updated.id,
        documentType: updated.documentType as GeneratedDocument['documentType'],
        fileName: updated.fileName,
        filePath: updated.filePath,
        generatedAt: updated.generatedAt,
        signedAt: updated.signedAt,
        acknowledged: updated.acknowledged,
      };
    }

    // Create new document record
    const doc = await this.prisma.parentGeneratedDocument.create({
      data: {
        parentId,
        tenantId,
        documentType,
        fileName,
        filePath,
        mimeType: 'application/pdf',
      },
    });

    return {
      id: doc.id,
      documentType: doc.documentType as GeneratedDocument['documentType'],
      fileName: doc.fileName,
      filePath: doc.filePath,
      generatedAt: doc.generatedAt,
      signedAt: doc.signedAt,
      acknowledged: doc.acknowledged,
    };
  }

  /**
   * Check if onboarding complete and trigger welcome pack
   */
  private async checkAndTriggerWelcomePack(
    parentId: string,
    tenantId: string,
  ): Promise<void> {
    const status = await this.getOnboardingStatus(parentId, tenantId);

    if (status.status === 'COMPLETED') {
      // Find enrollment without welcome pack sent
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          tenantId,
          child: { parentId },
          status: { in: ['ACTIVE', 'PENDING'] },
          welcomePackSentAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (enrollment) {
        try {
          await this.welcomePackDelivery.sendWelcomePack(
            tenantId,
            enrollment.id,
          );
          this.logger.log(`Auto-triggered welcome pack for parent ${parentId}`);
        } catch (error) {
          this.logger.warn(`Failed to auto-send welcome pack: ${error}`);
        }
      }
    }
  }
}
