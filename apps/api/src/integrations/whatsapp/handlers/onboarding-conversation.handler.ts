/**
 * Onboarding Conversation Handler
 * TASK-WA-012: WhatsApp Conversational Onboarding
 * TASK-WA-013: Advanced Features (multi-child, media validation, progress, edit flow)
 *
 * Manages a multi-step conversational flow for parents to register
 * their children at a creche via WhatsApp.
 *
 * Step flow:
 * WELCOME -> CONSENT -> PARENT_NAME -> PARENT_SURNAME -> PARENT_EMAIL ->
 * PARENT_ID_NUMBER -> CHILD_NAME -> CHILD_DOB -> CHILD_ALLERGIES ->
 * CHILD_ANOTHER (loop or continue) -> EMERGENCY_CONTACT_NAME ->
 * EMERGENCY_CONTACT_PHONE -> EMERGENCY_CONTACT_RELATION -> ID_DOCUMENT ->
 * FEE_AGREEMENT -> COMMUNICATION_PREFS -> CONFIRMATION -> COMPLETE
 *
 * IMPORTANT: All messages use tenant.tradingName for branding, NOT "CrecheBooks"
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnboardingStep, WaOnboardingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TwilioContentService } from '../services/twilio-content.service';
import {
  OnboardingCollectedData,
  ONBOARDING_TRIGGERS,
  validateSAID,
  validateEmail,
  validatePhone,
  validateDOB,
  validateName,
} from '../types/onboarding.types';

/**
 * Ordered list of onboarding steps for sequential progression
 */
const STEP_ORDER: OnboardingStep[] = [
  OnboardingStep.WELCOME,
  OnboardingStep.CONSENT,
  OnboardingStep.PARENT_NAME,
  OnboardingStep.PARENT_SURNAME,
  OnboardingStep.PARENT_EMAIL,
  OnboardingStep.PARENT_ID_NUMBER,
  OnboardingStep.CHILD_NAME,
  OnboardingStep.CHILD_DOB,
  OnboardingStep.CHILD_ALLERGIES,
  OnboardingStep.CHILD_ANOTHER,
  OnboardingStep.EMERGENCY_CONTACT_NAME,
  OnboardingStep.EMERGENCY_CONTACT_PHONE,
  OnboardingStep.EMERGENCY_CONTACT_RELATION,
  OnboardingStep.ID_DOCUMENT,
  OnboardingStep.FEE_AGREEMENT,
  OnboardingStep.COMMUNICATION_PREFS,
  OnboardingStep.CONFIRMATION,
  OnboardingStep.COMPLETE,
];

/**
 * Get the next step after the given step in the flow
 */
function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1];
}

/**
 * Conversational onboarding handler for WhatsApp
 *
 * Processes incoming messages through a multi-step flow that collects
 * parent, child, and emergency contact information. On confirmation,
 * creates Parent and Child records in the database.
 */
@Injectable()
export class OnboardingConversationHandler {
  private readonly logger = new Logger(OnboardingConversationHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: TwilioContentService,
  ) {}

  /**
   * Determine whether this handler should process the incoming message
   *
   * Returns true if:
   * - There is an active IN_PROGRESS session for this waId + tenantId, OR
   * - The message body contains a trigger keyword (enroll, register, sign up, signup, join)
   */
  async shouldHandle(
    waId: string,
    tenantId: string,
    body: string,
  ): Promise<boolean> {
    // Check for active session
    const session = await this.prisma.whatsAppOnboardingSession.findUnique({
      where: {
        tenantId_waId: { tenantId, waId },
      },
    });

    if (session && session.status === WaOnboardingStatus.IN_PROGRESS) {
      return true;
    }

    // Check for trigger keywords
    const lower = body.toLowerCase().trim();
    return ONBOARDING_TRIGGERS.some((trigger) => lower.includes(trigger));
  }

  /**
   * Process an incoming message for the onboarding flow
   *
   * Gets or creates a session, validates input, stores collected data,
   * and advances to the next step.
   */
  async handleMessage(
    waId: string,
    tenantId: string,
    body: string,
    mediaUrl?: string,
    mediaContentType?: string,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      this.logger.error(`Tenant not found: ${tenantId}`);
      return;
    }

    const tenantName = tenant.tradingName || tenant.name;

    // Get or create session
    let session = await this.prisma.whatsAppOnboardingSession.findUnique({
      where: {
        tenantId_waId: { tenantId, waId },
      },
    });

    if (!session) {
      session = await this.prisma.whatsAppOnboardingSession.create({
        data: {
          tenantId,
          waId,
          currentStep: OnboardingStep.WELCOME,
          status: WaOnboardingStatus.IN_PROGRESS,
          collectedData: {},
        },
      });
      this.logger.log(`New onboarding session created for ${waId}`);
    }

    // If session was previously abandoned/expired/completed, restart
    if (session.status !== WaOnboardingStatus.IN_PROGRESS) {
      const lower = body.toLowerCase().trim();
      if (ONBOARDING_TRIGGERS.some((trigger) => lower.includes(trigger))) {
        session = await this.prisma.whatsAppOnboardingSession.update({
          where: { id: session.id },
          data: {
            currentStep: OnboardingStep.WELCOME,
            status: WaOnboardingStatus.IN_PROGRESS,
            collectedData: {},
            lastMessageAt: new Date(),
            completedAt: null,
          },
        });
      } else {
        return;
      }
    }

    // Update lastMessageAt
    await this.prisma.whatsAppOnboardingSession.update({
      where: { id: session.id },
      data: { lastMessageAt: new Date() },
    });

    const data = (session.collectedData as OnboardingCollectedData) || {};
    const lower = body.toLowerCase().trim();

    // Check for re-engagement responses
    if (lower === 'onboard_resume') {
      await this.sendStepPrompt(
        session.currentStep,
        data,
        waId,
        tenantId,
        tenantName,
      );
      return;
    }
    if (lower === 'onboard_restart') {
      session = await this.prisma.whatsAppOnboardingSession.update({
        where: { id: session.id },
        data: {
          currentStep: OnboardingStep.WELCOME,
          collectedData: {},
          lastMessageAt: new Date(),
        },
      });
      await this.processStep(
        OnboardingStep.WELCOME,
        '',
        waId,
        tenantId,
        tenantName,
        session.id,
        {},
      );
      return;
    }
    if (lower === 'onboard_cancel') {
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: session.id },
        data: {
          status: WaOnboardingStatus.ABANDONED,
          lastMessageAt: new Date(),
        },
      });
      await this.contentService.sendSessionMessage(
        waId,
        `Your registration has been cancelled. You can restart anytime by typing "register". Thank you! - ${tenantName}`,
        tenantId,
      );
      return;
    }

    // Process the current step
    await this.processStep(
      session.currentStep,
      body,
      waId,
      tenantId,
      tenantName,
      session.id,
      data,
      mediaUrl,
      mediaContentType,
    );
  }

  /**
   * Process input for the current step, validate, store data, and advance
   */
  private async processStep(
    step: OnboardingStep,
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
    mediaUrl?: string,
    mediaContentType?: string,
  ): Promise<void> {
    switch (step) {
      case OnboardingStep.WELCOME:
        await this.handleWelcome(waId, tenantId, tenantName, sessionId, data);
        break;
      case OnboardingStep.CONSENT:
        await this.handleConsent(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.PARENT_NAME:
        await this.handleParentName(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.PARENT_SURNAME:
        await this.handleParentSurname(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.PARENT_EMAIL:
        await this.handleParentEmail(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.PARENT_ID_NUMBER:
        await this.handleParentIdNumber(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.CHILD_NAME:
        await this.handleChildName(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.CHILD_DOB:
        await this.handleChildDob(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.CHILD_ALLERGIES:
        await this.handleChildAllergies(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.CHILD_ANOTHER: {
        // TASK-WA-013: Multi-child registration loop
        const lower = body.toLowerCase().trim();
        if (lower === 'add another' || lower === 'child_add_another') {
          // Initialize a new child entry
          if (!data.children) data.children = [];
          data.children.push({});
          await this.advanceToStep(
            OnboardingStep.CHILD_NAME,
            data,
            waId,
            tenantId,
            tenantName,
            sessionId,
          );
        } else if (lower === 'continue' || lower === 'child_continue') {
          await this.advanceToStep(
            OnboardingStep.EMERGENCY_CONTACT_NAME,
            data,
            waId,
            tenantId,
            tenantName,
            sessionId,
          );
        } else {
          // Re-prompt
          await this.contentService.sendSessionQuickReply(
            waId,
            'Would you like to register another child?',
            [
              { title: 'Add Another', id: 'child_add_another' },
              { title: 'Continue', id: 'child_continue' },
            ],
            tenantId,
          );
        }
        break;
      }
      case OnboardingStep.EMERGENCY_CONTACT_NAME:
        await this.handleEmergencyContactName(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.EMERGENCY_CONTACT_PHONE:
        await this.handleEmergencyContactPhone(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.EMERGENCY_CONTACT_RELATION:
        await this.handleEmergencyContactRelation(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.ID_DOCUMENT:
        await this.handleIdDocument(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
          mediaUrl,
          mediaContentType,
        );
        break;
      case OnboardingStep.FEE_AGREEMENT:
        await this.handleFeeAgreement(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.COMMUNICATION_PREFS:
        await this.handleCommunicationPrefs(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      case OnboardingStep.CONFIRMATION: {
        // TASK-WA-013: Edit flow from confirmation - handle edit section selections
        const editLower = body.toLowerCase().trim();
        if (editLower === 'edit_parent') {
          await this.advanceToStep(
            OnboardingStep.PARENT_NAME,
            data,
            waId,
            tenantId,
            tenantName,
            sessionId,
          );
          break;
        }
        if (editLower === 'edit_child') {
          await this.advanceToStep(
            OnboardingStep.CHILD_NAME,
            data,
            waId,
            tenantId,
            tenantName,
            sessionId,
          );
          break;
        }
        if (editLower === 'edit_emergency') {
          await this.advanceToStep(
            OnboardingStep.EMERGENCY_CONTACT_NAME,
            data,
            waId,
            tenantId,
            tenantName,
            sessionId,
          );
          break;
        }
        await this.handleConfirmation(
          body,
          waId,
          tenantId,
          tenantName,
          sessionId,
          data,
        );
        break;
      }
      default:
        this.logger.warn(`Unexpected step: ${step}`);
    }
  }

  // ==========================================================================
  // Step Handlers
  // ==========================================================================

  /**
   * WELCOME - Send greeting with POPIA notice, auto-advance to CONSENT
   */
  private async handleWelcome(
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    await this.contentService.sendSessionMessage(
      waId,
      `Welcome to ${tenantName}!\n\n` +
        `I'll help you register your child. This will take about 5 minutes.\n\n` +
        `In terms of the Protection of Personal Information Act (POPIA), ` +
        `we need your consent to collect and process your personal information ` +
        `for the purpose of enrolling your child.`,
      tenantId,
    );

    // Auto-advance to CONSENT
    await this.advanceToStep(
      OnboardingStep.CONSENT,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * CONSENT - Quick reply: Accept/Decline POPIA consent
   */
  private async handleConsent(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();

    if (lower === 'accept' || lower === 'consent_accept') {
      data.popiaConsent = true;
      data.popiaConsentAt = new Date().toISOString();
      await this.advanceToStep(
        OnboardingStep.PARENT_NAME,
        data,
        waId,
        tenantId,
        tenantName,
        sessionId,
      );
    } else if (lower === 'decline' || lower === 'consent_decline') {
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: sessionId },
        data: {
          status: WaOnboardingStatus.ABANDONED,
          collectedData: data as unknown as Prisma.InputJsonValue,
        },
      });
      await this.contentService.sendSessionMessage(
        waId,
        `We understand. Without consent, we're unable to proceed with registration. ` +
          `You can restart anytime by typing "register". Thank you! - ${tenantName}`,
        tenantId,
      );
    } else {
      // Invalid response, re-prompt
      await this.sendStepPrompt(
        OnboardingStep.CONSENT,
        data,
        waId,
        tenantId,
        tenantName,
      );
    }
  }

  /**
   * PARENT_NAME - Collect parent's first name
   */
  private async handleParentName(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateName(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.parent) data.parent = {};
    data.parent.firstName = result.normalized;
    data.parent.phone = waId;
    await this.advanceToStep(
      OnboardingStep.PARENT_SURNAME,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * PARENT_SURNAME - Collect parent's surname
   */
  private async handleParentSurname(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateName(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.parent) data.parent = {};
    data.parent.surname = result.normalized;
    await this.advanceToStep(
      OnboardingStep.PARENT_EMAIL,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * PARENT_EMAIL - Collect parent's email address (validated)
   */
  private async handleParentEmail(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateEmail(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.parent) data.parent = {};
    data.parent.email = result.normalized;
    await this.advanceToStep(
      OnboardingStep.PARENT_ID_NUMBER,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * PARENT_ID_NUMBER - Collect SA ID number (Luhn validated, optional with "skip")
   */
  private async handleParentIdNumber(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateSAID(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.parent) data.parent = {};
    if (result.normalized !== 'skip') {
      data.parent.idNumber = result.normalized;
    }
    await this.advanceToStep(
      OnboardingStep.CHILD_NAME,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * CHILD_NAME - Collect child's first name
   * TASK-WA-013: Multi-child support - if last child already has firstName, push a new entry
   */
  private async handleChildName(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateName(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.children) data.children = [];
    // If last child already has firstName, push a new entry (multi-child mode)
    const lastChild = data.children[data.children.length - 1];
    if (!lastChild || lastChild.firstName) {
      data.children.push({ firstName: result.normalized });
    } else {
      lastChild.firstName = result.normalized;
    }
    await this.advanceToStep(
      OnboardingStep.CHILD_DOB,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * CHILD_DOB - Collect child's date of birth (DD/MM/YYYY)
   */
  private async handleChildDob(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateDOB(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.children || data.children.length === 0) {
      data.children = [{ dateOfBirth: result.normalized }];
    } else {
      data.children[data.children.length - 1].dateOfBirth = result.normalized;
    }
    await this.advanceToStep(
      OnboardingStep.CHILD_ALLERGIES,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * CHILD_ALLERGIES - Collect allergies/medical conditions (or "None")
   */
  private async handleChildAllergies(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const trimmed = body.trim();
    if (!data.children || data.children.length === 0) {
      data.children = [{}];
    }
    const child = data.children[data.children.length - 1];
    child.allergies = trimmed.toLowerCase() === 'none' ? undefined : trimmed;

    // In WA-012, CHILD_ANOTHER auto-advances to EMERGENCY_CONTACT_NAME
    await this.advanceToStep(
      OnboardingStep.CHILD_ANOTHER,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * EMERGENCY_CONTACT_NAME - Collect emergency contact full name
   */
  private async handleEmergencyContactName(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validateName(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.emergencyContact) data.emergencyContact = {};
    data.emergencyContact.name = result.normalized;
    await this.advanceToStep(
      OnboardingStep.EMERGENCY_CONTACT_PHONE,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * EMERGENCY_CONTACT_PHONE - Collect emergency contact phone (SA validated)
   */
  private async handleEmergencyContactPhone(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const result = validatePhone(body);
    if (!result.valid) {
      await this.contentService.sendSessionMessage(
        waId,
        result.error!,
        tenantId,
      );
      return;
    }
    if (!data.emergencyContact) data.emergencyContact = {};
    data.emergencyContact.phone = result.normalized;
    await this.advanceToStep(
      OnboardingStep.EMERGENCY_CONTACT_RELATION,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * EMERGENCY_CONTACT_RELATION - Quick reply: Parent/Grandparent/Sibling/Other
   */
  private async handleEmergencyContactRelation(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();
    const valid = [
      'parent',
      'grandparent',
      'sibling',
      'other',
      'relation_parent',
      'relation_grandparent',
      'relation_sibling',
      'relation_other',
    ];
    if (!valid.includes(lower)) {
      await this.sendStepPrompt(
        OnboardingStep.EMERGENCY_CONTACT_RELATION,
        data,
        waId,
        tenantId,
        tenantName,
      );
      return;
    }
    if (!data.emergencyContact) data.emergencyContact = {};
    // Strip button ID prefix if present
    data.emergencyContact.relationship = lower.replace('relation_', '');
    await this.advanceToStep(
      OnboardingStep.ID_DOCUMENT,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * ID_DOCUMENT - Request photo of SA ID (or "skip")
   * TASK-WA-013: Enhanced media content type validation
   */
  private async handleIdDocument(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
    mediaUrl?: string,
    mediaContentType?: string,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();
    if (lower === 'skip') {
      // Skip ID document upload
      await this.advanceToStep(
        OnboardingStep.FEE_AGREEMENT,
        data,
        waId,
        tenantId,
        tenantName,
        sessionId,
      );
      return;
    }
    if (mediaUrl) {
      // Validate image content type if provided
      if (mediaContentType && !mediaContentType.startsWith('image/')) {
        await this.contentService.sendSessionMessage(
          waId,
          'Please send a photo (image) of your ID document, or type "Skip" to continue without it.',
          tenantId,
        );
        return;
      }
      data.idDocumentMediaUrl = mediaUrl;
      await this.contentService.sendSessionMessage(
        waId,
        'ID document received. The creche will verify it during registration review.',
        tenantId,
      );
      await this.advanceToStep(
        OnboardingStep.FEE_AGREEMENT,
        data,
        waId,
        tenantId,
        tenantName,
        sessionId,
      );
      return;
    }
    // No media and not "skip" - re-prompt
    await this.contentService.sendSessionMessage(
      waId,
      'Please send a photo of your SA ID document, or type "Skip" to continue without it.',
      tenantId,
    );
  }

  /**
   * FEE_AGREEMENT - Show fee info, quick reply: Agree/Decline
   */
  private async handleFeeAgreement(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();
    if (lower === 'agree' || lower === 'fee_agree') {
      data.feeAcknowledged = true;
      await this.advanceToStep(
        OnboardingStep.COMMUNICATION_PREFS,
        data,
        waId,
        tenantId,
        tenantName,
        sessionId,
      );
    } else if (lower === 'decline' || lower === 'fee_decline') {
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: sessionId },
        data: {
          status: WaOnboardingStatus.ABANDONED,
          collectedData: data as unknown as Prisma.InputJsonValue,
        },
      });
      await this.contentService.sendSessionMessage(
        waId,
        `We understand. Without fee agreement, we're unable to complete registration. ` +
          `Please contact ${tenantName} directly for more information. ` +
          `You can restart anytime by typing "register".`,
        tenantId,
      );
    } else {
      await this.sendStepPrompt(
        OnboardingStep.FEE_AGREEMENT,
        data,
        waId,
        tenantId,
        tenantName,
      );
    }
  }

  /**
   * COMMUNICATION_PREFS - Quick reply: WhatsApp Only/Email Only/Both
   */
  private async handleCommunicationPrefs(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();

    if (lower === 'whatsapp only' || lower === 'comms_whatsapp') {
      data.communicationPrefs = { whatsapp: true, email: false };
    } else if (lower === 'email only' || lower === 'comms_email') {
      data.communicationPrefs = { whatsapp: false, email: true };
    } else if (lower === 'both' || lower === 'comms_both') {
      data.communicationPrefs = { whatsapp: true, email: true };
    } else {
      await this.sendStepPrompt(
        OnboardingStep.COMMUNICATION_PREFS,
        data,
        waId,
        tenantId,
        tenantName,
      );
      return;
    }

    await this.advanceToStep(
      OnboardingStep.CONFIRMATION,
      data,
      waId,
      tenantId,
      tenantName,
      sessionId,
    );
  }

  /**
   * CONFIRMATION - Show summary, quick reply: Confirm/Edit/Cancel
   */
  private async handleConfirmation(
    body: string,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
    data: OnboardingCollectedData,
  ): Promise<void> {
    const lower = body.toLowerCase().trim();

    if (lower === 'confirm' || lower === 'confirm_yes') {
      await this.completeOnboarding(
        sessionId,
        data,
        tenantId,
        waId,
        tenantName,
      );
    } else if (lower === 'edit' || lower === 'confirm_edit') {
      // TASK-WA-013: Edit flow - show list picker to choose section to edit
      await this.contentService.sendListPicker(
        waId,
        'What would you like to edit?',
        'Select Section',
        [
          {
            item: 'Parent Details',
            id: 'edit_parent',
            description: 'Name, email, ID',
          },
          {
            item: 'Child Details',
            id: 'edit_child',
            description: 'Name, DOB, allergies',
          },
          {
            item: 'Emergency Contact',
            id: 'edit_emergency',
            description: 'Contact info',
          },
        ],
        tenantId,
      );
    } else if (lower === 'cancel' || lower === 'confirm_cancel') {
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: sessionId },
        data: {
          status: WaOnboardingStatus.ABANDONED,
          collectedData: data as unknown as Prisma.InputJsonValue,
        },
      });
      await this.contentService.sendSessionMessage(
        waId,
        `Registration cancelled. You can restart anytime by typing "register". Thank you! - ${tenantName}`,
        tenantId,
      );
    } else {
      await this.sendStepPrompt(
        OnboardingStep.CONFIRMATION,
        data,
        waId,
        tenantId,
        tenantName,
      );
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Advance the session to the next step and send the prompt
   */
  private async advanceToStep(
    nextStep: OnboardingStep,
    data: OnboardingCollectedData,
    waId: string,
    tenantId: string,
    tenantName: string,
    sessionId: string,
  ): Promise<void> {
    await this.prisma.whatsAppOnboardingSession.update({
      where: { id: sessionId },
      data: {
        currentStep: nextStep,
        collectedData: data as unknown as Prisma.InputJsonValue,
      },
    });

    // TASK-WA-013: For CHILD_ANOTHER, send quick reply instead of auto-advancing
    if (nextStep === OnboardingStep.CHILD_ANOTHER) {
      await this.contentService.sendSessionQuickReply(
        waId,
        'Would you like to register another child?',
        [
          { title: 'Add Another', id: 'child_add_another' },
          { title: 'Continue', id: 'child_continue' },
        ],
        tenantId,
      );
      return;
    }

    await this.sendStepPrompt(nextStep, data, waId, tenantId, tenantName);
  }

  /**
   * Send the appropriate prompt for a given step
   */
  private async sendStepPrompt(
    step: OnboardingStep,
    data: OnboardingCollectedData,
    waId: string,
    tenantId: string,
    tenantName: string,
  ): Promise<void> {
    // TASK-WA-013: Progress indicators at key milestones
    const progress: Partial<Record<OnboardingStep, string>> = {
      [OnboardingStep.CHILD_NAME]: 'Step 2 of 5: Child Details',
      [OnboardingStep.EMERGENCY_CONTACT_NAME]: 'Step 3 of 5: Emergency Contact',
      [OnboardingStep.ID_DOCUMENT]: 'Step 4 of 5: Verification',
      [OnboardingStep.FEE_AGREEMENT]: 'Step 5 of 5: Fee Agreement',
    };
    if (progress[step]) {
      await this.contentService.sendSessionMessage(
        waId,
        progress[step],
        tenantId,
      );
    }

    switch (step) {
      case OnboardingStep.CONSENT:
        await this.contentService.sendSessionQuickReply(
          waId,
          `Do you consent to ${tenantName} collecting your personal information for enrollment purposes?`,
          [
            { title: 'Accept', id: 'consent_accept' },
            { title: 'Decline', id: 'consent_decline' },
          ],
          tenantId,
        );
        break;

      case OnboardingStep.PARENT_NAME:
        await this.contentService.sendSessionMessage(
          waId,
          'What is your first name?',
          tenantId,
        );
        break;

      case OnboardingStep.PARENT_SURNAME:
        await this.contentService.sendSessionMessage(
          waId,
          'What is your surname?',
          tenantId,
        );
        break;

      case OnboardingStep.PARENT_EMAIL:
        await this.contentService.sendSessionMessage(
          waId,
          'What is your email address?',
          tenantId,
        );
        break;

      case OnboardingStep.PARENT_ID_NUMBER:
        await this.contentService.sendSessionMessage(
          waId,
          'What is your SA ID number? (or type Skip)',
          tenantId,
        );
        break;

      case OnboardingStep.CHILD_NAME:
        await this.contentService.sendSessionMessage(
          waId,
          "What is your child's first name?",
          tenantId,
        );
        break;

      case OnboardingStep.CHILD_DOB: {
        const childName =
          data.children?.[data.children.length - 1]?.firstName || 'your child';
        await this.contentService.sendSessionMessage(
          waId,
          `What is ${childName}'s date of birth? (DD/MM/YYYY)`,
          tenantId,
        );
        break;
      }

      case OnboardingStep.CHILD_ALLERGIES: {
        const childNameAllergy =
          data.children?.[data.children.length - 1]?.firstName || 'your child';
        await this.contentService.sendSessionMessage(
          waId,
          `Does ${childNameAllergy} have any allergies or medical conditions? (or type None)`,
          tenantId,
        );
        break;
      }

      case OnboardingStep.EMERGENCY_CONTACT_NAME:
        await this.contentService.sendSessionMessage(
          waId,
          'Emergency contact full name?',
          tenantId,
        );
        break;

      case OnboardingStep.EMERGENCY_CONTACT_PHONE:
        await this.contentService.sendSessionMessage(
          waId,
          'Emergency contact phone number?',
          tenantId,
        );
        break;

      case OnboardingStep.EMERGENCY_CONTACT_RELATION:
        await this.contentService.sendSessionQuickReply(
          waId,
          "What is the emergency contact's relationship to the child?",
          [
            { title: 'Parent', id: 'relation_parent' },
            { title: 'Grandparent', id: 'relation_grandparent' },
            { title: 'Other', id: 'relation_other' },
          ],
          tenantId,
        );
        break;

      case OnboardingStep.ID_DOCUMENT:
        await this.contentService.sendSessionMessage(
          waId,
          'Please send a photo of your SA ID document (or type Skip).',
          tenantId,
        );
        break;

      case OnboardingStep.FEE_AGREEMENT:
        await this.contentService.sendSessionQuickReply(
          waId,
          `${tenantName} requires acknowledgement of their fee structure. ` +
            `Monthly fees will be invoiced and payable by the due date. ` +
            `Do you agree to the fee terms?`,
          [
            { title: 'Agree', id: 'fee_agree' },
            { title: 'Decline', id: 'fee_decline' },
          ],
          tenantId,
        );
        break;

      case OnboardingStep.COMMUNICATION_PREFS:
        await this.contentService.sendSessionQuickReply(
          waId,
          'How would you like to receive invoices and reminders?',
          [
            { title: 'WhatsApp Only', id: 'comms_whatsapp' },
            { title: 'Email Only', id: 'comms_email' },
            { title: 'Both', id: 'comms_both' },
          ],
          tenantId,
        );
        break;

      case OnboardingStep.CONFIRMATION: {
        const summary = this.buildSummary(data);
        await this.contentService.sendSessionMessage(
          waId,
          `Please confirm your registration details:\n\n${summary}`,
          tenantId,
        );
        await this.contentService.sendSessionQuickReply(
          waId,
          'Is everything correct?',
          [
            { title: 'Confirm', id: 'confirm_yes' },
            { title: 'Edit', id: 'confirm_edit' },
            { title: 'Cancel', id: 'confirm_cancel' },
          ],
          tenantId,
        );
        break;
      }

      default:
        this.logger.warn(`No prompt configured for step: ${step}`);
    }
  }

  /**
   * Build a human-readable summary of collected data
   */
  private buildSummary(data: OnboardingCollectedData): string {
    const lines: string[] = [];

    if (data.parent) {
      lines.push('*Parent*');
      if (data.parent.firstName)
        lines.push(
          `Name: ${data.parent.firstName} ${data.parent.surname || ''}`,
        );
      if (data.parent.email) lines.push(`Email: ${data.parent.email}`);
      if (data.parent.idNumber) lines.push(`ID: ${data.parent.idNumber}`);
      if (data.parent.phone) lines.push(`Phone: ${data.parent.phone}`);
      lines.push('');
    }

    if (data.children && data.children.length > 0) {
      for (let i = 0; i < data.children.length; i++) {
        const child = data.children[i];
        lines.push(`*Child ${i + 1}*`);
        if (child.firstName) lines.push(`Name: ${child.firstName}`);
        if (child.dateOfBirth) lines.push(`DOB: ${child.dateOfBirth}`);
        if (child.allergies) lines.push(`Allergies: ${child.allergies}`);
        lines.push('');
      }
    }

    if (data.emergencyContact) {
      lines.push('*Emergency Contact*');
      if (data.emergencyContact.name)
        lines.push(`Name: ${data.emergencyContact.name}`);
      if (data.emergencyContact.phone)
        lines.push(`Phone: ${data.emergencyContact.phone}`);
      if (data.emergencyContact.relationship)
        lines.push(`Relationship: ${data.emergencyContact.relationship}`);
      lines.push('');
    }

    if (data.communicationPrefs) {
      const prefs: string[] = [];
      if (data.communicationPrefs.whatsapp) prefs.push('WhatsApp');
      if (data.communicationPrefs.email) prefs.push('Email');
      lines.push(`*Communication:* ${prefs.join(' & ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Complete the onboarding process - create Parent and Child records
   */
  async completeOnboarding(
    sessionId: string,
    data: OnboardingCollectedData,
    tenantId: string,
    waId: string,
    tenantName: string,
  ): Promise<void> {
    try {
      // Determine communication preferences
      const preferredContact =
        data.communicationPrefs?.whatsapp && data.communicationPrefs?.email
          ? ('BOTH' as const)
          : data.communicationPrefs?.whatsapp
            ? ('WHATSAPP' as const)
            : ('EMAIL' as const);

      // Create Parent record
      const parent = await this.prisma.parent.create({
        data: {
          tenantId,
          firstName: data.parent?.firstName || '',
          lastName: data.parent?.surname || '',
          email: data.parent?.email,
          phone: waId,
          whatsapp: waId,
          idNumber: data.parent?.idNumber,
          whatsappOptIn: true,
          preferredContact,
        },
      });

      this.logger.log(`Parent created: ${parent.id} for tenant ${tenantId}`);

      // Create Child record(s)
      const children = data.children || [];
      for (const childData of children) {
        const child = await this.prisma.child.create({
          data: {
            tenantId,
            parentId: parent.id,
            firstName: childData.firstName || '',
            lastName: data.parent?.surname || '',
            dateOfBirth: childData.dateOfBirth
              ? new Date(childData.dateOfBirth)
              : new Date(),
            medicalNotes: childData.allergies,
            emergencyContact: data.emergencyContact?.name,
            emergencyPhone: data.emergencyContact?.phone,
          },
        });
        this.logger.log(`Child created: ${child.id} for parent ${parent.id}`);
      }

      // Mark session as COMPLETED
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: sessionId },
        data: {
          status: WaOnboardingStatus.COMPLETED,
          parentId: parent.id,
          completedAt: new Date(),
          collectedData: data as unknown as Prisma.InputJsonValue,
          currentStep: OnboardingStep.COMPLETE,
        },
      });

      // Send confirmation message
      const childNames = children
        .map((c) => c.firstName)
        .filter(Boolean)
        .join(', ');

      await this.contentService.sendSessionMessage(
        waId,
        `Registration complete! Welcome to ${tenantName}!\n\n` +
          `${data.parent?.firstName}, we've registered ${childNames || 'your child'} successfully.\n\n` +
          `${tenantName} will be in touch with next steps. Thank you!`,
        tenantId,
      );

      // TASK-WA-014: Notify admin users of completed onboarding
      try {
        const admins = await this.prisma.user.findMany({
          where: {
            tenantId,
            role: { in: ['ADMIN', 'OWNER'] },
            isActive: true,
          },
          select: { email: true, name: true },
        });

        this.logger.log(
          `New WhatsApp onboarding complete: ${data.parent?.firstName} ${data.parent?.surname}, ` +
            `${children.length} child(ren). Notifying ${admins.length} admin(s).`,
        );
        // Note: Email notification would be added here when NotificationService is available
      } catch (adminError) {
        this.logger.warn(
          `Failed to notify admins: ${adminError instanceof Error ? adminError.message : String(adminError)}`,
        );
      }

      this.logger.log(`Onboarding completed for session ${sessionId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to complete onboarding: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.contentService.sendSessionMessage(
        waId,
        `We're sorry, something went wrong while completing your registration. ` +
          `Please try again or contact ${tenantName} directly for assistance.`,
        tenantId,
      );
    }
  }
}
