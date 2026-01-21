/**
 * Welcome Pack Delivery Service
 * TASK-ENROL-008: Welcome Pack Delivery Integration
 * TASK-WA-007: WhatsApp Welcome Message via Twilio
 *
 * Responsibilities:
 * - Generate welcome pack PDF using ParentWelcomePackPdfService
 * - Send email with PDF attachment to parent
 * - Send WhatsApp welcome message to opted-in parents
 * - Update enrollment.welcomePackSentAt on success
 *
 * CRITICAL: Non-blocking email delivery - don't fail enrollment if email fails
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ParentWelcomePackPdfService } from './parent-welcome-pack-pdf.service';
import {
  EmailTemplateService,
  WelcomePackEmailData,
} from '../../common/services/email-template/email-template.service';
import { EmailService } from '../../integrations/email/email.service';
import { TwilioWhatsAppService } from '../../integrations/whatsapp/services/twilio-whatsapp.service';
import { EnrollmentRepository } from '../repositories/enrollment.repository';
import { ChildRepository } from '../repositories/child.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { NotFoundException } from '../../shared/exceptions';

/**
 * Result of welcome pack delivery attempt
 */
export interface WelcomePackDeliveryResult {
  /** Whether the email was sent successfully */
  success: boolean;
  /** Timestamp when the email was sent */
  sentAt?: Date;
  /** Recipient email address */
  recipientEmail?: string;
  /** Error message if delivery failed */
  error?: string;
  /** Whether WhatsApp welcome message was sent */
  whatsAppSent?: boolean;
  /** Recipient WhatsApp number */
  recipientWhatsApp?: string;
}

@Injectable()
export class WelcomePackDeliveryService {
  private readonly logger = new Logger(WelcomePackDeliveryService.name);

  constructor(
    private readonly parentWelcomePackPdfService: ParentWelcomePackPdfService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly emailService: EmailService,
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly tenantRepo: TenantRepository,
    // TASK-WA-007: Optional WhatsApp service for welcome messages
    @Optional() private readonly twilioWhatsAppService?: TwilioWhatsAppService,
  ) {}

  /**
   * Send welcome pack email with PDF attachment for an enrollment
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to send welcome pack for
   * @returns Result with success status, timestamp, and any error
   */
  async sendWelcomePack(
    tenantId: string,
    enrollmentId: string,
  ): Promise<WelcomePackDeliveryResult> {
    this.logger.log(
      `Sending welcome pack for enrollment ${enrollmentId} in tenant ${tenantId}`,
    );

    try {
      // 1. Fetch enrollment and validate
      const enrollment = await this.enrollmentRepo.findById(
        enrollmentId,
        tenantId,
      );
      if (!enrollment) {
        this.logger.error(
          `Enrollment not found: ${enrollmentId} for tenant ${tenantId}`,
        );
        return {
          success: false,
          error: `Enrollment not found: ${enrollmentId}`,
        };
      }

      // 2. Fetch child
      const child = await this.childRepo.findById(enrollment.childId, tenantId);
      if (!child) {
        this.logger.error(`Child not found: ${enrollment.childId}`);
        return {
          success: false,
          error: `Child not found for enrollment`,
        };
      }

      // 3. Fetch parent
      const parent = await this.parentRepo.findById(child.parentId, tenantId);
      if (!parent) {
        this.logger.error(`Parent not found: ${child.parentId}`);
        return {
          success: false,
          error: `Parent not found for child`,
        };
      }

      // 4. Check parent has email
      if (!parent.email) {
        this.logger.warn(
          `Parent ${parent.id} has no email address, cannot send welcome pack`,
        );
        return {
          success: false,
          error: 'Parent has no email address configured',
        };
      }

      // 5. Fetch fee structure
      const feeStructure = await this.feeStructureRepo.findById(
        enrollment.feeStructureId,
        tenantId,
      );
      if (!feeStructure) {
        this.logger.error(
          `Fee structure not found: ${enrollment.feeStructureId}`,
        );
        return {
          success: false,
          error: `Fee structure not found for enrollment`,
        };
      }

      // 6. Fetch tenant for branding
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        this.logger.error(`Tenant not found: ${tenantId}`);
        return {
          success: false,
          error: `Tenant not found`,
        };
      }

      // 7. Generate PDF
      this.logger.debug(
        `Generating welcome pack PDF for enrollment ${enrollmentId}`,
      );
      const pdfResult =
        await this.parentWelcomePackPdfService.generateWelcomePack(
          enrollmentId,
          tenantId,
        );

      // 8. Prepare email template data
      const childName = `${child.firstName} ${child.lastName}`.trim();
      const monthlyFeeCents =
        enrollment.customFeeOverrideCents ?? feeStructure.amountCents;

      const emailData: WelcomePackEmailData = {
        tenantName: tenant.tradingName || tenant.name,
        recipientName: `${parent.firstName} ${parent.lastName}`.trim(),
        childName,
        startDate: enrollment.startDate,
        feeTierName: feeStructure.name,
        monthlyFeeCents,
        operatingHours: (tenant as any).operatingHours ?? undefined,
        welcomeMessage: (tenant as any).parentWelcomeMessage ?? undefined,
        supportEmail: tenant.email,
        supportPhone: tenant.phone,
      };

      // 9. Render email
      const renderedEmail =
        this.emailTemplateService.renderWelcomePackEmail(emailData);

      // 10. Send email with PDF attachment
      this.logger.debug(`Sending welcome pack email to ${parent.email}`);
      await this.emailService.sendEmailWithOptions({
        to: parent.email,
        subject: renderedEmail.subject,
        body: renderedEmail.text,
        html: renderedEmail.html,
        attachments: [
          {
            filename: `Welcome_Pack_${childName.replace(/\s+/g, '_')}.pdf`,
            content: pdfResult.pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
        tags: ['welcome-pack', 'enrollment'],
        customVariables: {
          enrollmentId,
          childId: child.id,
          parentId: parent.id,
        },
      });

      // 11. Update enrollment with sentAt timestamp
      const sentAt = new Date();
      await this.enrollmentRepo.update(enrollmentId, tenantId, {
        welcomePackSentAt: sentAt,
      });

      this.logger.log(
        `Welcome pack sent successfully to ${parent.email} for enrollment ${enrollmentId}`,
      );

      // 12. TASK-WA-007: Send WhatsApp welcome message if opted in
      let whatsAppSent = false;
      let recipientWhatsApp: string | undefined;

      if (
        this.twilioWhatsAppService?.isConfigured() &&
        (parent.whatsapp || parent.phone) &&
        parent.whatsappOptIn
      ) {
        // Type assertion safe: we already check (parent.whatsapp || parent.phone) is truthy above
        const whatsAppNumber = (parent.whatsapp || parent.phone) as string;
        try {
          const whatsAppResult =
            await this.twilioWhatsAppService.sendWelcomeMessage(
              tenantId,
              whatsAppNumber,
              `${parent.firstName} ${parent.lastName}`.trim(),
              childName,
              tenant.tradingName || tenant.name,
            );

          if (whatsAppResult.success) {
            whatsAppSent = true;
            recipientWhatsApp = whatsAppNumber;
            this.logger.log(
              `TASK-WA-007: WhatsApp welcome message sent to ${whatsAppNumber} for enrollment ${enrollmentId}`,
            );
          } else {
            this.logger.warn(
              `TASK-WA-007: WhatsApp welcome message failed: ${whatsAppResult.error}`,
            );
          }
        } catch (whatsAppError) {
          // Non-blocking - don't fail enrollment if WhatsApp fails
          this.logger.warn(
            `TASK-WA-007: WhatsApp welcome message error: ${whatsAppError instanceof Error ? whatsAppError.message : String(whatsAppError)}`,
          );
        }
      }

      return {
        success: true,
        sentAt,
        recipientEmail: parent.email,
        whatsAppSent,
        recipientWhatsApp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send welcome pack for enrollment ${enrollmentId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
