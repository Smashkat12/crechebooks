/**
 * Staff Onboarding Service
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Responsibilities:
 * - Initialize onboarding for new staff
 * - Manage checklist progress
 * - Track document uploads and verification
 * - Calculate onboarding progress
 * - Dashboard statistics
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOnboardingRepository } from '../repositories/staff-onboarding.repository';
import { AuditLogService } from './audit-log.service';
import { EmploymentContractPdfService } from './employment-contract-pdf.service';
import { PopiaConsentPdfService } from './popia-consent-pdf.service';
import {
  OnboardingStatus,
  ChecklistItemStatus,
} from '../entities/staff-onboarding.entity';
import {
  InitiateOnboardingDto,
  CompleteOnboardingDto,
  OnboardingProgressResponse,
  OnboardingDashboardResponse,
  OnboardingProgress,
  UpdateStepDto,
  OnboardingStep,
  GeneratedDocumentType,
  GeneratedDocumentResponse,
  GeneratedDocumentsListResponse,
  SignDocumentDto,
} from '../dto/staff-onboarding.dto';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';

@Injectable()
export class StaffOnboardingService {
  private readonly logger = new Logger(StaffOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingRepo: StaffOnboardingRepository,
    private readonly auditLogService: AuditLogService,
    private readonly employmentContractService: EmploymentContractPdfService,
    private readonly popiaConsentService: PopiaConsentPdfService,
  ) {}

  /**
   * Initialize onboarding for a new staff member
   * Creates onboarding record with default checklist items
   */
  async initiateOnboarding(
    tenantId: string,
    dto: InitiateOnboardingDto,
    userId: string,
  ): Promise<OnboardingProgressResponse> {
    this.logger.log(`Initiating onboarding for staff ${dto.staffId}`);

    // Check if staff exists
    const staff = await this.prisma.staff.findFirst({
      where: { id: dto.staffId, tenantId },
    });
    if (!staff) {
      throw new NotFoundException('Staff', dto.staffId);
    }

    // Check if onboarding already exists
    const existing = await this.onboardingRepo.findOnboardingByStaffId(
      dto.staffId,
    );
    if (existing) {
      throw new ConflictException(
        'Onboarding already exists for this staff member',
        { staffId: dto.staffId },
      );
    }

    // Create onboarding record (repository handles default checklist creation)
    const onboarding = await this.onboardingRepo.createOnboarding(
      tenantId,
      dto,
    );

    // Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'StaffOnboarding',
      entityId: onboarding.id,
      afterValue: { staffId: dto.staffId, status: 'IN_PROGRESS' },
    });

    return this.getOnboardingProgress(onboarding.id);
  }

  /**
   * Get onboarding progress with checklist and documents
   */
  async getOnboardingProgress(
    onboardingId: string,
  ): Promise<OnboardingProgressResponse> {
    const onboarding =
      await this.onboardingRepo.findOnboardingById(onboardingId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', onboardingId);
    }

    const checklistItems =
      await this.onboardingRepo.findChecklistItemsByOnboarding(onboardingId);
    const documents = await this.onboardingRepo.findDocumentsByStaff(
      onboarding.staffId,
    );
    const progress = await this.onboardingRepo.calculateProgress(onboardingId);

    return {
      onboarding,
      checklistItems,
      documents,
      progress,
    };
  }

  /**
   * Get onboarding by staff ID
   */
  async getOnboardingByStaffId(
    staffId: string,
  ): Promise<OnboardingProgressResponse | null> {
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) return null;
    return this.getOnboardingProgress(onboarding.id);
  }

  /**
   * Step order for onboarding wizard
   */
  private readonly stepOrder: OnboardingStep[] = [
    'PERSONAL_INFO',
    'EMPLOYMENT',
    'TAX_INFO',
    'BANKING',
    'DOCUMENTS',
    'CHECKLIST',
    'COMPLETE',
  ];

  /**
   * Map wizard steps to checklist item categories
   */
  private readonly stepToCategoryMap: Record<OnboardingStep, string> = {
    PERSONAL_INFO: 'personal_info',
    EMPLOYMENT: 'employment',
    TAX_INFO: 'tax_info',
    BANKING: 'banking',
    DOCUMENTS: 'documents',
    CHECKLIST: 'dsd_compliance',
    COMPLETE: 'complete',
  };

  /**
   * Update onboarding step with form data
   * This saves step data to staff record and advances the wizard
   */
  async updateOnboardingStep(
    staffId: string,
    dto: UpdateStepDto,
    userId: string,
    tenantId: string,
  ): Promise<OnboardingProgressResponse> {
    this.logger.log(`Updating step ${dto.step} for staff ${staffId}`);

    // Find the onboarding
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', staffId);
    }

    // Update staff record with form data based on step
    if (dto.data) {
      await this.saveStepData(staffId, dto.step, dto.data, tenantId);
    }

    // Mark checklist items for this category as complete
    await this.completeStepChecklistItems(onboarding.id, dto.step, userId);

    // Determine next step
    const currentIndex = this.stepOrder.indexOf(dto.step);
    const nextStep =
      currentIndex < this.stepOrder.length - 1
        ? this.stepOrder[currentIndex + 1]
        : 'COMPLETE';

    // Update onboarding current step
    await this.onboardingRepo.updateOnboarding(onboarding.id, {
      currentStep: nextStep,
    });

    // Return updated progress
    return this.getOnboardingProgress(onboarding.id);
  }

  /**
   * Save step data to the staff record
   */
  private async saveStepData(
    staffId: string,
    step: OnboardingStep,
    data: Record<string, unknown>,
    _tenantId: string,
  ): Promise<void> {
    switch (step) {
      case 'PERSONAL_INFO': {
        const personalData: Record<string, unknown> = {};
        if (data.firstName) personalData.firstName = data.firstName as string;
        if (data.lastName) personalData.lastName = data.lastName as string;
        if (data.idNumber) personalData.idNumber = data.idNumber as string;
        if (data.dateOfBirth)
          personalData.dateOfBirth = new Date(data.dateOfBirth as string);
        if (data.email) personalData.email = data.email as string;
        if (data.phone) personalData.phone = data.phone as string;
        // Emergency contact
        if (data.emergencyContactName)
          personalData.emergencyContactName =
            data.emergencyContactName as string;
        if (data.emergencyContactPhone)
          personalData.emergencyContactPhone =
            data.emergencyContactPhone as string;
        if (data.emergencyContactRelation)
          personalData.emergencyContactRelation =
            data.emergencyContactRelation as string;
        // Address
        if (data.address) personalData.address = data.address as string;
        if (data.suburb) personalData.suburb = data.suburb as string;
        if (data.city) personalData.city = data.city as string;
        if (data.province) personalData.province = data.province as string;
        if (data.postalCode)
          personalData.postalCode = data.postalCode as string;

        if (Object.keys(personalData).length > 0) {
          await this.prisma.staff.update({
            where: { id: staffId },
            data: personalData,
          });
        }
        break;
      }

      case 'EMPLOYMENT': {
        const employmentData: Record<string, unknown> = {};
        if (data.employeeNumber)
          employmentData.employeeNumber = data.employeeNumber as string;
        if (data.startDate)
          employmentData.startDate = new Date(data.startDate as string);
        if (data.employmentType)
          employmentData.employmentType = data.employmentType as
            | 'FULL_TIME'
            | 'PART_TIME'
            | 'CONTRACT'
            | 'TEMPORARY';
        if (data.department)
          employmentData.department = data.department as string;
        if (data.position) employmentData.position = data.position as string;
        if (data.workSchedule)
          employmentData.workSchedule = data.workSchedule as string;
        if (data.hoursPerWeek)
          employmentData.hoursPerWeek = data.hoursPerWeek as number;
        if (data.reportingTo)
          employmentData.reportingTo = data.reportingTo as string;

        if (Object.keys(employmentData).length > 0) {
          await this.prisma.staff.update({
            where: { id: staffId },
            data: employmentData,
          });
        }
        break;
      }

      case 'TAX_INFO': {
        const taxData: Record<string, unknown> = {};
        if (data.taxNumber) taxData.taxNumber = data.taxNumber as string;
        if (data.taxStatus) taxData.taxStatus = data.taxStatus as string;
        if (data.paymentMethod)
          taxData.paymentMethod = data.paymentMethod as string;

        if (Object.keys(taxData).length > 0) {
          await this.prisma.staff.update({
            where: { id: staffId },
            data: taxData,
          });
        }
        break;
      }

      case 'BANKING': {
        const bankingData: Record<string, unknown> = {};
        if (data.bankName) bankingData.bankName = data.bankName as string;
        if (data.bankAccount)
          bankingData.bankAccount = data.bankAccount as string;
        if (data.bankBranchCode)
          bankingData.bankBranchCode = data.bankBranchCode as string;
        if (data.bankAccountType)
          bankingData.bankAccountType = data.bankAccountType as string;

        if (Object.keys(bankingData).length > 0) {
          await this.prisma.staff.update({
            where: { id: staffId },
            data: bankingData,
          });
        }
        break;
      }

      case 'DOCUMENTS':
      case 'CHECKLIST':
      case 'COMPLETE':
        // These steps don't update staff data directly
        break;
    }

    this.logger.debug(`Saved ${step} data for staff ${staffId}`);
  }

  /**
   * Complete all checklist items for a step category
   */
  private async completeStepChecklistItems(
    onboardingId: string,
    step: OnboardingStep,
    userId: string,
  ): Promise<void> {
    const category = this.stepToCategoryMap[step];
    if (!category) return;

    const items =
      await this.onboardingRepo.findChecklistItemsByOnboarding(onboardingId);
    const categoryItems = items.filter(
      (item) => item.category === category && item.status !== 'COMPLETED',
    );

    for (const item of categoryItems) {
      // Use the repository's completeChecklistItem method
      await this.onboardingRepo.completeChecklistItem(
        item.id,
        userId,
        `Completed via wizard step: ${step}`,
      );
    }

    this.logger.debug(
      `Completed ${categoryItems.length} checklist items for step ${step}`,
    );
  }

  /**
   * Update checklist item status
   */
  async updateChecklistItem(
    itemId: string,
    status: ChecklistItemStatus,
    userId: string,
    notes?: string,
  ): Promise<void> {
    const item = await this.prisma.onboardingChecklistItem.findUnique({
      where: { id: itemId },
      include: { onboarding: true },
    });
    if (!item) {
      throw new NotFoundException('ChecklistItem', itemId);
    }

    await this.onboardingRepo.updateChecklistItem(itemId, {
      status,
      notes,
    });

    // Check if all required items are complete
    await this.checkAndUpdateOnboardingStatus(item.onboardingId);
  }

  /**
   * Complete checklist item
   */
  async completeChecklistItem(
    itemId: string,
    userId: string,
    notes?: string,
  ): Promise<void> {
    await this.updateChecklistItem(
      itemId,
      ChecklistItemStatus.COMPLETED,
      userId,
      notes,
    );
  }

  /**
   * Skip a checklist item (only non-required items)
   */
  async skipChecklistItem(
    itemId: string,
    userId: string,
    notes?: string,
  ): Promise<void> {
    const item = await this.prisma.onboardingChecklistItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('ChecklistItem', itemId);
    }

    if (item.isRequired) {
      throw new ValidationException('Cannot skip a required checklist item', [
        {
          field: 'itemId',
          message: 'Required items cannot be skipped',
        },
      ]);
    }

    await this.updateChecklistItem(
      itemId,
      ChecklistItemStatus.SKIPPED,
      userId,
      notes,
    );
  }

  /**
   * Check if all required items complete and update onboarding status
   */
  private async checkAndUpdateOnboardingStatus(
    onboardingId: string,
  ): Promise<void> {
    const progress = await this.onboardingRepo.calculateProgress(onboardingId);

    // Check if all required items are complete
    const items =
      await this.onboardingRepo.findChecklistItemsByOnboarding(onboardingId);
    const allRequiredComplete = items
      .filter((i) => i.isRequired)
      .every((i) => i.status === 'COMPLETED' || i.status === 'SKIPPED');

    if (allRequiredComplete && progress.requiredPercentComplete === 100) {
      await this.onboardingRepo.updateOnboarding(onboardingId, {
        status: 'VERIFICATION_PENDING',
      });
    }
  }

  /**
   * Complete onboarding workflow
   */
  async completeOnboarding(
    onboardingId: string,
    dto: CompleteOnboardingDto,
    tenantId: string,
  ): Promise<void> {
    const onboarding =
      await this.onboardingRepo.findOnboardingById(onboardingId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', onboardingId);
    }

    // Validate all required items are complete
    const items =
      await this.onboardingRepo.findChecklistItemsByOnboarding(onboardingId);
    const incompleteRequired = items.filter(
      (i) => i.isRequired && i.status !== 'COMPLETED' && i.status !== 'SKIPPED',
    );
    if (incompleteRequired.length > 0) {
      throw new ValidationException(
        'Cannot complete onboarding with incomplete required items',
        incompleteRequired.map((i) => ({
          field: i.itemKey,
          message: `${i.title} is not complete`,
        })),
      );
    }

    await this.onboardingRepo.updateOnboarding(onboardingId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedBy: dto.completedBy,
      notes: dto.notes,
    });

    await this.auditLogService.logUpdate({
      tenantId,
      userId: dto.completedBy,
      entityType: 'StaffOnboarding',
      entityId: onboardingId,
      beforeValue: { status: onboarding.status },
      afterValue: { status: 'COMPLETED' },
    });
  }

  /**
   * Cancel onboarding
   */
  async cancelOnboarding(
    onboardingId: string,
    tenantId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const onboarding =
      await this.onboardingRepo.findOnboardingById(onboardingId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', onboardingId);
    }

    if (onboarding.status === 'COMPLETED') {
      throw new ValidationException('Cannot cancel a completed onboarding', [
        {
          field: 'status',
          message: 'Onboarding is already completed',
        },
      ]);
    }

    await this.onboardingRepo.updateOnboarding(onboardingId, {
      status: 'CANCELLED',
      notes: reason,
    });

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffOnboarding',
      entityId: onboardingId,
      beforeValue: { status: onboarding.status },
      afterValue: { status: 'CANCELLED', reason },
    });
  }

  /**
   * Get dashboard stats
   */
  async getDashboardStats(
    tenantId: string,
  ): Promise<OnboardingDashboardResponse> {
    const stats = await this.onboardingRepo.getOnboardingStats(tenantId);
    const recentOnboardings = await this.onboardingRepo.getRecentOnboardings(
      tenantId,
      5,
    );
    const pendingDocuments =
      await this.onboardingRepo.findPendingDocuments(tenantId);

    // Enrich recent onboardings with progress
    const enrichedOnboardings = await Promise.all(
      recentOnboardings.map(async (onboarding) => {
        const progress = await this.onboardingRepo.calculateProgress(
          onboarding.id,
        );
        return {
          ...onboarding,
          staffName: `${onboarding.staff.firstName} ${onboarding.staff.lastName}`,
          progress: progress.percentComplete,
        };
      }),
    );

    // Get pending documents with staff names
    const pendingDocumentsWithNames = await Promise.all(
      pendingDocuments.slice(0, 10).map(async (doc) => {
        const staff = await this.prisma.staff.findUnique({
          where: { id: doc.staffId },
          select: { firstName: true, lastName: true },
        });
        return {
          documentId: doc.id,
          staffId: doc.staffId,
          staffName: staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown',
          documentType: doc.documentType,
          uploadedAt: doc.uploadedAt,
        };
      }),
    );

    return {
      totalStaff: stats.total,
      notStarted: stats.notStarted,
      inProgress: stats.inProgress,
      documentsPending: stats.documentsPending,
      verificationPending: stats.verificationPending,
      completed: stats.completed,
      cancelled: stats.cancelled,
      averageCompletionDays: null, // TODO: Calculate from completed onboardings
      recentOnboardings: enrichedOnboardings,
      pendingDocuments: pendingDocumentsWithNames,
    };
  }

  /**
   * Get all onboardings for tenant with optional status filter
   */
  async getOnboardingsByTenant(tenantId: string, status?: OnboardingStatus) {
    return this.onboardingRepo.findOnboardingsByTenant(tenantId, { status });
  }

  /**
   * Calculate progress for an onboarding (helper method that uses repository)
   */
  async calculateProgress(onboardingId: string): Promise<OnboardingProgress> {
    return this.onboardingRepo.calculateProgress(onboardingId);
  }

  /**
   * Auto-complete checklist item when document is uploaded and verified
   * This links document uploads to checklist progress
   */
  async linkDocumentToChecklistItem(
    staffId: string,
    documentType: string,
    userId: string,
  ): Promise<void> {
    // Map document types to checklist item keys
    const documentToChecklistMap: Record<string, string> = {
      ID_DOCUMENT: 'ID_DOCUMENT',
      PROOF_OF_ADDRESS: 'PROOF_OF_ADDRESS',
      TAX_CERTIFICATE: 'TAX_NUMBER',
      QUALIFICATIONS: 'QUALIFICATIONS',
      POLICE_CLEARANCE: 'POLICE_CLEARANCE',
      MEDICAL_CERTIFICATE: 'MEDICAL_CERTIFICATE',
      FIRST_AID_CERTIFICATE: 'FIRST_AID',
      EMPLOYMENT_CONTRACT: 'CONTRACT_SIGNED',
      BANK_CONFIRMATION: 'BANK_DETAILS',
      POPIA_CONSENT: 'POPIA_CONSENT',
      OTHER: '',
    };

    const checklistKey = documentToChecklistMap[documentType];
    if (!checklistKey) {
      this.logger.debug(
        `No checklist mapping for document type: ${documentType}`,
      );
      return;
    }

    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      this.logger.debug(`No onboarding found for staff ${staffId}`);
      return;
    }

    // Find the checklist item matching this document type
    const items = await this.onboardingRepo.findChecklistItemsByOnboarding(
      onboarding.id,
    );
    const matchingItem = items.find((item) => item.itemKey === checklistKey);

    if (matchingItem && matchingItem.status !== 'COMPLETED') {
      await this.updateChecklistItem(
        matchingItem.id,
        ChecklistItemStatus.COMPLETED,
        userId,
        `Automatically completed: Document uploaded`,
      );
      this.logger.log(
        `Auto-completed checklist item ${checklistKey} for staff ${staffId}`,
      );
    }
  }

  /**
   * Get checklist items by category
   */
  async getChecklistItemsByCategory(
    onboardingId: string,
  ): Promise<Record<string, OnboardingProgress['byCategory'][string]>> {
    const progress = await this.onboardingRepo.calculateProgress(onboardingId);
    return progress.byCategory;
  }

  /**
   * Get DSD compliance status for a staff member
   * Returns which DSD-required items are complete
   */
  async getDsdComplianceStatus(staffId: string): Promise<{
    isCompliant: boolean;
    completedItems: string[];
    missingItems: string[];
    expiringDocuments: Array<{ type: string; expiryDate: Date }>;
  }> {
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      return {
        isCompliant: false,
        completedItems: [],
        missingItems: [
          'POLICE_CLEARANCE',
          'MEDICAL_CERTIFICATE',
          'FIRST_AID',
          'ID_DOCUMENT',
          'QUALIFICATIONS',
        ],
        expiringDocuments: [],
      };
    }

    const items = await this.onboardingRepo.findChecklistItemsByOnboarding(
      onboarding.id,
    );
    const dsdItems = items.filter((i) => i.category === 'dsd_compliance');

    const completedItems = dsdItems
      .filter((i) => i.status === 'COMPLETED')
      .map((i) => i.itemKey);
    const missingItems = dsdItems
      .filter((i) => i.status !== 'COMPLETED' && i.isRequired)
      .map((i) => i.itemKey);

    // Check for expiring documents
    const documents = await this.onboardingRepo.findDocumentsByStaff(staffId);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringDocuments = documents
      .filter(
        (d) =>
          d.expiryDate &&
          d.expiryDate <= thirtyDaysFromNow &&
          d.expiryDate >= new Date(),
      )
      .map((d) => ({
        type: d.documentType,
        expiryDate: d.expiryDate!,
      }));

    return {
      isCompliant: missingItems.length === 0,
      completedItems,
      missingItems,
      expiringDocuments,
    };
  }

  // ============================================
  // Generated Documents Methods
  // ============================================

  /**
   * Generate employment contract PDF for a staff member
   */
  async generateEmploymentContract(
    staffId: string,
    tenantId: string,
  ): Promise<GeneratedDocumentResponse> {
    this.logger.log(`Generating employment contract for staff ${staffId}`);

    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', staffId);
    }

    // Check if contract already exists
    const existing = await this.prisma.staffGeneratedDocument.findFirst({
      where: {
        onboardingId: onboarding.id,
        documentType: 'EMPLOYMENT_CONTRACT',
      },
    });

    if (existing) {
      this.logger.log(
        `Employment contract already exists for staff ${staffId}`,
      );
      return this.mapToGeneratedDocumentResponse(existing);
    }

    // Generate the contract
    const result = await this.employmentContractService.generateContract({
      staffId,
      tenantId,
    });

    // Save to database
    const document = await this.prisma.staffGeneratedDocument.create({
      data: {
        onboardingId: onboarding.id,
        documentType: 'EMPLOYMENT_CONTRACT',
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        mimeType: 'application/pdf',
      },
    });

    this.logger.log(`Employment contract saved: ${document.id}`);
    return this.mapToGeneratedDocumentResponse(document);
  }

  /**
   * Generate POPIA consent form PDF for a staff member
   */
  async generatePopiaConsent(
    staffId: string,
    tenantId: string,
  ): Promise<GeneratedDocumentResponse> {
    this.logger.log(`Generating POPIA consent form for staff ${staffId}`);

    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      throw new NotFoundException('Onboarding', staffId);
    }

    // Check if POPIA consent already exists
    const existing = await this.prisma.staffGeneratedDocument.findFirst({
      where: {
        onboardingId: onboarding.id,
        documentType: 'POPIA_CONSENT',
      },
    });

    if (existing) {
      this.logger.log(`POPIA consent form already exists for staff ${staffId}`);
      return this.mapToGeneratedDocumentResponse(existing);
    }

    // Generate the consent form
    const result = await this.popiaConsentService.generateConsentForm({
      staffId,
      tenantId,
    });

    // Save to database
    const document = await this.prisma.staffGeneratedDocument.create({
      data: {
        onboardingId: onboarding.id,
        documentType: 'POPIA_CONSENT',
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        mimeType: 'application/pdf',
      },
    });

    this.logger.log(`POPIA consent form saved: ${document.id}`);
    return this.mapToGeneratedDocumentResponse(document);
  }

  /**
   * Generate all required documents for a staff member
   */
  async generateAllDocuments(
    staffId: string,
    tenantId: string,
  ): Promise<GeneratedDocumentsListResponse> {
    this.logger.log(`Generating all documents for staff ${staffId}`);

    // Generate both documents in parallel
    const [contract, popia] = await Promise.all([
      this.generateEmploymentContract(staffId, tenantId),
      this.generatePopiaConsent(staffId, tenantId),
    ]);

    const documents = [contract, popia];
    const allDocumentsSigned = documents.every((d) => d.acknowledged);
    const pendingSignatures = documents
      .filter((d) => !d.acknowledged)
      .map((d) => d.documentType);

    return {
      documents,
      allDocumentsGenerated: true,
      allDocumentsSigned,
      pendingSignatures,
    };
  }

  /**
   * Get all generated documents for a staff member
   */
  async getGeneratedDocuments(
    staffId: string,
  ): Promise<GeneratedDocumentsListResponse> {
    const onboarding =
      await this.onboardingRepo.findOnboardingByStaffId(staffId);
    if (!onboarding) {
      return {
        documents: [],
        allDocumentsGenerated: false,
        allDocumentsSigned: false,
        pendingSignatures: [
          GeneratedDocumentType.EMPLOYMENT_CONTRACT,
          GeneratedDocumentType.POPIA_CONSENT,
        ],
      };
    }

    const documents = await this.prisma.staffGeneratedDocument.findMany({
      where: { onboardingId: onboarding.id },
      orderBy: { generatedAt: 'asc' },
    });

    const mappedDocs = documents.map((d) =>
      this.mapToGeneratedDocumentResponse(d),
    );

    // Check which documents exist
    const hasContract = mappedDocs.some(
      (d) => d.documentType === GeneratedDocumentType.EMPLOYMENT_CONTRACT,
    );
    const hasPopia = mappedDocs.some(
      (d) => d.documentType === GeneratedDocumentType.POPIA_CONSENT,
    );

    const allDocumentsGenerated = hasContract && hasPopia;
    const allDocumentsSigned = mappedDocs.every((d) => d.acknowledged);

    const pendingSignatures: GeneratedDocumentType[] = [];
    if (!hasContract) {
      pendingSignatures.push(GeneratedDocumentType.EMPLOYMENT_CONTRACT);
    } else if (
      !mappedDocs.find(
        (d) => d.documentType === GeneratedDocumentType.EMPLOYMENT_CONTRACT,
      )?.acknowledged
    ) {
      pendingSignatures.push(GeneratedDocumentType.EMPLOYMENT_CONTRACT);
    }
    if (!hasPopia) {
      pendingSignatures.push(GeneratedDocumentType.POPIA_CONSENT);
    } else if (
      !mappedDocs.find(
        (d) => d.documentType === GeneratedDocumentType.POPIA_CONSENT,
      )?.acknowledged
    ) {
      pendingSignatures.push(GeneratedDocumentType.POPIA_CONSENT);
    }

    return {
      documents: mappedDocs,
      allDocumentsGenerated,
      allDocumentsSigned,
      pendingSignatures,
    };
  }

  /**
   * Sign/acknowledge a generated document
   */
  async signDocument(
    dto: SignDocumentDto,
    clientIp?: string,
  ): Promise<GeneratedDocumentResponse> {
    const documentId = dto.documentId;
    if (!documentId) {
      throw new BusinessException(
        'Document ID is required',
        'DOCUMENT_ID_REQUIRED',
      );
    }
    this.logger.log(`Signing document ${documentId}`);

    const document = await this.prisma.staffGeneratedDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('GeneratedDocument', documentId);
    }

    if (document.acknowledged) {
      throw new BusinessException(
        'Document has already been signed',
        'DOCUMENT_ALREADY_SIGNED',
        { documentId },
      );
    }

    const updated = await this.prisma.staffGeneratedDocument.update({
      where: { id: documentId },
      data: {
        acknowledged: true,
        signedAt: new Date(),
        signedByName: dto.signedByName,
        signedByIp: clientIp || dto.signedByIp || null,
      },
    });

    this.logger.log(`Document ${dto.documentId} signed by ${dto.signedByName}`);
    return this.mapToGeneratedDocumentResponse(updated);
  }

  /**
   * Get generated document by ID
   */
  async getGeneratedDocumentById(
    documentId: string,
  ): Promise<GeneratedDocumentResponse> {
    const document = await this.prisma.staffGeneratedDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('GeneratedDocument', documentId);
    }

    return this.mapToGeneratedDocumentResponse(document);
  }

  /**
   * Map Prisma model to DTO
   */
  private mapToGeneratedDocumentResponse(document: {
    id: string;
    onboardingId: string;
    documentType: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
    generatedAt: Date;
    signedAt: Date | null;
    signedByName: string | null;
    acknowledged: boolean;
  }): GeneratedDocumentResponse {
    return {
      id: document.id,
      onboardingId: document.onboardingId,
      documentType: document.documentType as GeneratedDocumentType,
      fileName: document.fileName,
      filePath: document.filePath,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      generatedAt: document.generatedAt,
      signedAt: document.signedAt,
      signedByName: document.signedByName,
      acknowledged: document.acknowledged,
    };
  }

  // ============ Helper Methods for Welcome Pack Bundle/Email ============

  /**
   * Get staff by ID with tenant verification
   */
  async getStaffById(
    staffId: string,
    tenantId: string,
  ): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    employeeNumber: string | null;
  }> {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeNumber: true,
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    return staff;
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    return tenant;
  }
}
