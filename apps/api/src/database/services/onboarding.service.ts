import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import {
  OnboardingStepId,
  OnboardingStepInfo,
  OnboardingProgressResponse,
  OnboardingDashboardCta,
} from '../dto/onboarding.dto';
import { OnboardingProgress } from '@prisma/client';

/**
 * Onboarding Service
 * TASK-ACCT-014: Tenant Onboarding Wizard
 *
 * Provides guided setup for new tenants with:
 * - Progress tracking across 8 setup steps
 * - Auto-detection of already-completed steps
 * - Skip functionality for optional steps
 * - Dashboard CTA for incomplete onboarding
 */

// Step definitions with metadata
const STEP_DEFINITIONS: Array<{
  id: OnboardingStepId;
  title: string;
  description: string;
  isSkippable: boolean;
  helpText?: string;
  fieldName: keyof OnboardingProgress;
}> = [
  {
    id: OnboardingStepId.LOGO,
    title: 'Upload Your Logo',
    description: 'Add your creche logo to appear on invoices and statements',
    isSkippable: true,
    helpText: 'PNG or JPG, max 2MB',
    fieldName: 'logoUploaded',
  },
  {
    id: OnboardingStepId.ADDRESS,
    title: 'Physical Address',
    description: 'Required for legal invoices and parent communication',
    isSkippable: false,
    fieldName: 'addressSet',
  },
  {
    id: OnboardingStepId.BANK_DETAILS,
    title: 'Bank Details',
    description: 'Display on invoices so parents know where to pay',
    isSkippable: false,
    helpText: 'Parents will see these details on invoices',
    fieldName: 'bankDetailsSet',
  },
  {
    id: OnboardingStepId.VAT_CONFIG,
    title: 'VAT Settings',
    description:
      'Configure VAT if your creche is VAT registered (optional for most)',
    isSkippable: true,
    helpText: 'Most creche fees are VAT exempt under Section 12(h)',
    fieldName: 'vatConfigured',
  },
  {
    id: OnboardingStepId.FEE_STRUCTURE,
    title: 'Fee Structure',
    description: 'Set up your monthly fees, registration fees, and extras',
    isSkippable: false,
    fieldName: 'feeStructureCreated',
  },
  {
    id: OnboardingStepId.ENROL_CHILD,
    title: 'Enrol First Child',
    description: 'Add your first child and parent to start billing',
    isSkippable: true,
    fieldName: 'childEnrolled',
  },
  {
    id: OnboardingStepId.FIRST_INVOICE,
    title: 'Send First Invoice',
    description: 'Generate and send your first invoice to a parent',
    isSkippable: true,
    fieldName: 'firstInvoiceSent',
  },
  {
    id: OnboardingStepId.BANK_CONNECT,
    title: 'Connect Bank Account',
    description: 'Enable automatic bank reconciliation (optional)',
    isSkippable: true,
    helpText: 'Match payments to invoices automatically',
    fieldName: 'bankConnected',
  },
];

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Get onboarding progress for a tenant
   * Creates initial progress record if it doesn't exist
   */
  async getProgress(tenantId: string): Promise<OnboardingProgressResponse> {
    let progress = await this.prisma.onboardingProgress.findUnique({
      where: { tenantId },
    });

    if (!progress) {
      progress = await this.prisma.onboardingProgress.create({
        data: { tenantId },
      });

      await this.auditLog.logCreate({
        tenantId,
        entityType: 'OnboardingProgress',
        entityId: progress.id,
        afterValue: { action: 'onboarding_started' },
      });
    }

    return this.formatProgressResponse(progress);
  }

  /**
   * Mark a step as complete
   */
  async markStepComplete(
    tenantId: string,
    stepId: OnboardingStepId,
    userId: string,
  ): Promise<OnboardingProgressResponse> {
    const stepDef = STEP_DEFINITIONS.find((s) => s.id === stepId);
    if (!stepDef) {
      throw new Error(`Invalid step ID: ${stepId}`);
    }

    const progress = await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: {
        [stepDef.fieldName]: true,
        lastActiveStep: stepId,
        updatedAt: new Date(),
      },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'OnboardingProgress',
      entityId: progress.id,
      beforeValue: { [stepDef.fieldName]: false },
      afterValue: { [stepDef.fieldName]: true, stepId },
    });

    // Check if all required steps are complete
    await this.checkCompletion(tenantId, userId);

    return this.formatProgressResponse(progress);
  }

  /**
   * Skip a step (only allowed for skippable steps)
   */
  async skipStep(
    tenantId: string,
    stepId: OnboardingStepId,
    userId: string,
  ): Promise<OnboardingProgressResponse> {
    const stepDef = STEP_DEFINITIONS.find((s) => s.id === stepId);
    if (!stepDef) {
      throw new Error(`Invalid step ID: ${stepId}`);
    }

    if (!stepDef.isSkippable) {
      throw new Error(`Step ${stepId} cannot be skipped`);
    }

    const currentProgress = await this.prisma.onboardingProgress.findUnique({
      where: { tenantId },
    });

    const skippedSteps = currentProgress?.skippedSteps || [];
    if (!skippedSteps.includes(stepId)) {
      skippedSteps.push(stepId);
    }

    const progress = await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: {
        skippedSteps,
        lastActiveStep: stepId,
        updatedAt: new Date(),
      },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'OnboardingProgress',
      entityId: progress.id,
      beforeValue: { skippedSteps: currentProgress?.skippedSteps || [] },
      afterValue: { skippedSteps, stepId, action: 'step_skipped' },
    });

    // Check if all required steps are complete
    await this.checkCompletion(tenantId, userId);

    return this.formatProgressResponse(progress);
  }

  /**
   * Set the current active step (for UI state)
   */
  async setActiveStep(
    tenantId: string,
    stepId: OnboardingStepId | null,
  ): Promise<OnboardingProgressResponse> {
    const progress = await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: { lastActiveStep: stepId },
    });

    return this.formatProgressResponse(progress);
  }

  /**
   * Auto-detect completed steps based on tenant data
   * Useful when tenant has set up data before onboarding
   */
  async autoDetectProgress(
    tenantId: string,
  ): Promise<OnboardingProgressResponse> {
    // Get tenant basic info
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Query related data separately to properly check existence
    const [
      feeStructureCount,
      childCount,
      sentInvoiceCount,
      activeBankConnectionCount,
    ] = await Promise.all([
      this.prisma.feeStructure.count({ where: { tenantId } }),
      this.prisma.child.count({ where: { tenantId } }),
      this.prisma.invoice.count({
        where: { tenantId, deliveredAt: { not: null } },
      }),
      this.prisma.bankConnection.count({
        where: { tenantId, status: 'ACTIVE' },
      }),
    ]);

    const updates: Partial<OnboardingProgress> = {};

    // Check address (required field, so if tenant exists it's set)
    if (tenant.addressLine1) {
      updates.addressSet = true;
    }

    // Check bank details
    if (tenant.bankAccountNumber) {
      updates.bankDetailsSet = true;
    }

    // Check VAT configuration
    if (tenant.vatNumber) {
      updates.vatConfigured = true;
    }

    // Check fee structure
    if (feeStructureCount > 0) {
      updates.feeStructureCreated = true;
    }

    // Check child enrollment
    if (childCount > 0) {
      updates.childEnrolled = true;
    }

    // Check first invoice sent
    if (sentInvoiceCount > 0) {
      updates.firstInvoiceSent = true;
    }

    // Check bank connection
    if (activeBankConnectionCount > 0) {
      updates.bankConnected = true;
    }

    if (Object.keys(updates).length > 0) {
      const progress = await this.prisma.onboardingProgress.upsert({
        where: { tenantId },
        create: { tenantId, ...updates },
        update: updates,
      });

      await this.auditLog.logUpdate({
        tenantId,
        entityType: 'OnboardingProgress',
        entityId: progress.id,
        beforeValue: {},
        afterValue: { action: 'auto_detected_progress', updates },
      });
    }

    return this.getProgress(tenantId);
  }

  /**
   * Get dashboard CTA info for incomplete onboarding
   */
  async getDashboardCta(tenantId: string): Promise<OnboardingDashboardCta> {
    const progress = await this.getProgress(tenantId);

    if (progress.isComplete) {
      return {
        showOnboarding: false,
        progressPercent: 100,
        nextStep: null,
        message: 'Setup complete!',
      };
    }

    // Find the first incomplete, non-skipped step
    const nextStep = progress.steps.find((s) => !s.isComplete && !s.isSkipped);

    const messages: Record<number, string> = {
      0: "Let's get started setting up your creche!",
      1: "Great start! Let's keep going.",
      2: "You're making progress!",
      3: 'Halfway there!',
      4: 'Almost done!',
      5: 'Just a few more steps!',
      6: 'Nearly complete!',
      7: 'One more step to go!',
    };

    return {
      showOnboarding: true,
      progressPercent: progress.progressPercent,
      nextStep: nextStep || null,
      message: messages[progress.completedCount] || 'Continue setup',
    };
  }

  /**
   * Reset onboarding progress (for testing or re-onboarding)
   */
  async resetProgress(tenantId: string, userId: string): Promise<void> {
    const current = await this.prisma.onboardingProgress.findUnique({
      where: { tenantId },
    });

    if (!current) return;

    await this.prisma.onboardingProgress.update({
      where: { tenantId },
      data: {
        logoUploaded: false,
        addressSet: false,
        bankDetailsSet: false,
        vatConfigured: false,
        feeStructureCreated: false,
        childEnrolled: false,
        firstInvoiceSent: false,
        bankConnected: false,
        skippedSteps: [],
        completedAt: null,
        lastActiveStep: null,
      },
    });

    await this.auditLog.logUpdate({
      tenantId,
      userId,
      entityType: 'OnboardingProgress',
      entityId: current.id,
      beforeValue: { completedAt: current.completedAt },
      afterValue: { action: 'reset', completedAt: null },
    });
  }

  /**
   * Check if all required steps are complete and mark onboarding as done
   */
  private async checkCompletion(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const progress = await this.prisma.onboardingProgress.findUnique({
      where: { tenantId },
    });

    if (!progress || progress.completedAt) return;

    // Required steps: address, bankDetails, feeStructure
    const requiredComplete =
      progress.addressSet &&
      progress.bankDetailsSet &&
      progress.feeStructureCreated;

    if (requiredComplete) {
      await this.prisma.onboardingProgress.update({
        where: { tenantId },
        data: { completedAt: new Date() },
      });

      await this.auditLog.logUpdate({
        tenantId,
        userId,
        entityType: 'OnboardingProgress',
        entityId: progress.id,
        beforeValue: { completedAt: null },
        afterValue: { completedAt: new Date(), action: 'onboarding_completed' },
      });
    }
  }

  /**
   * Format progress record to response with computed fields
   */
  private formatProgressResponse(
    progress: OnboardingProgress,
  ): OnboardingProgressResponse {
    const steps: OnboardingStepInfo[] = STEP_DEFINITIONS.map((def) => ({
      id: def.id,
      title: def.title,
      description: def.description,
      isComplete: Boolean(progress[def.fieldName]),
      isSkipped: progress.skippedSteps.includes(def.id),
      isSkippable: def.isSkippable,
      helpText: def.helpText,
    }));

    const completedCount = steps.filter(
      (s) => s.isComplete || s.isSkipped,
    ).length;
    const totalSteps = steps.length;
    const progressPercent = Math.round((completedCount / totalSteps) * 100);

    return {
      id: progress.id,
      tenantId: progress.tenantId,
      logoUploaded: progress.logoUploaded,
      addressSet: progress.addressSet,
      bankDetailsSet: progress.bankDetailsSet,
      vatConfigured: progress.vatConfigured,
      feeStructureCreated: progress.feeStructureCreated,
      childEnrolled: progress.childEnrolled,
      firstInvoiceSent: progress.firstInvoiceSent,
      bankConnected: progress.bankConnected,
      skippedSteps: progress.skippedSteps,
      lastActiveStep: progress.lastActiveStep,
      completedAt: progress.completedAt,
      completedCount,
      totalSteps,
      progressPercent,
      isComplete: progress.completedAt !== null,
      steps,
    };
  }
}
