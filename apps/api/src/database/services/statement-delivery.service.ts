/**
 * Statement Delivery Service
 * TASK-STMT-007: Statement Delivery Service (Logic Layer)
 * TASK-BILL-042: Enhanced with HTML templates and PDF attachments
 * TASK-WA-003: Statement Delivery via WhatsApp
 *
 * @module database/services/statement-delivery
 * @description Service for delivering statements to parents via email, WhatsApp, or SMS.
 * Email delivery uses HTML templates with PDF attachments.
 * WhatsApp delivery uses Meta Cloud API templates with PDF attachments.
 * SMS uses plain text messages via NotificationService.
 *
 * CRITICAL: All delivery attempts are logged. Fail fast with detailed error logging.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationService } from '../../notifications/notification.service';
import {
  NotificationPayload,
  NotificationChannelType,
} from '../../notifications/types/notification.types';
import { StatementPdfService } from './statement-pdf.service';
import { StatementRepository } from '../repositories/statement.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ChildRepository } from '../repositories/child.repository';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../integrations/email/email.service';
import {
  EmailTemplateService,
  StatementEmailData,
} from '../../common/services/email-template/email-template.service';
// TASK-WA-003: WhatsApp integration imports
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { WhatsAppTemplateService } from '../../integrations/whatsapp/services/template.service';
import { WhatsAppMessageEntity } from '../../integrations/whatsapp/entities/whatsapp-message.entity';
import { WhatsAppProviderService } from '../../integrations/whatsapp/services/whatsapp-provider.service';
import {
  WhatsAppContextType,
  WhatsAppMessageStatus,
} from '../../integrations/whatsapp/types/message-history.types';

/**
 * Input for delivering a statement
 */
export interface DeliverStatementInput {
  tenantId: string;
  statementId: string;
  userId: string;
  channel?: NotificationChannelType; // Optional - uses parent preference if not specified
}

/**
 * Input for bulk statement delivery
 */
export interface BulkDeliverInput {
  tenantId: string;
  statementIds: string[];
  userId: string;
  channel?: NotificationChannelType;
}

/**
 * Result of a single statement delivery
 */
export interface StatementDeliveryResult {
  statementId: string;
  parentId: string;
  success: boolean;
  channel?: NotificationChannelType;
  messageId?: string;
  error?: string;
  deliveredAt?: Date;
}

/**
 * Result of bulk statement delivery
 */
export interface BulkDeliveryResult {
  sent: number;
  failed: number;
  results: StatementDeliveryResult[];
}

@Injectable()
export class StatementDeliveryService {
  private readonly logger = new Logger(StatementDeliveryService.name);
  private readonly appUrl: string;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly statementPdfService: StatementPdfService,
    private readonly statementRepository: StatementRepository,
    private readonly parentRepository: ParentRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly childRepository: ChildRepository,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    // TASK-WA-003: WhatsApp integration (optional - may not be configured)
    @Optional() private readonly whatsAppService?: WhatsAppService,
    @Optional()
    private readonly whatsAppTemplateService?: WhatsAppTemplateService,
    @Optional() private readonly whatsAppMessageEntity?: WhatsAppMessageEntity,
    // TASK-WA-007: WhatsApp provider service for Twilio/Meta routing
    @Optional()
    private readonly whatsAppProviderService?: WhatsAppProviderService,
  ) {
    this.appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  /**
   * Deliver a single statement to its parent
   *
   * TASK-BILL-042: Enhanced with HTML templates and PDF attachments
   * - Email: HTML-formatted email using EmailTemplateService + PDF attachment
   * - WhatsApp/SMS: Plain text message via NotificationService (PDF not supported)
   *
   * @param input - Delivery input parameters
   * @returns Delivery result
   * @throws NotFoundException if statement or parent not found
   * @throws BusinessException if statement is not in FINAL status
   */
  async deliverStatement(
    input: DeliverStatementInput,
  ): Promise<StatementDeliveryResult> {
    const { tenantId, statementId, userId } = input;

    this.logger.log(
      `Delivering statement ${statementId} for tenant ${tenantId}`,
    );

    // 1. Get statement with lines
    const statement = await this.statementRepository.findByIdWithLines(
      statementId,
      tenantId,
    );
    if (!statement) {
      throw new NotFoundException('Statement', statementId);
    }

    // 2. Validate statement status
    if (statement.status !== 'FINAL') {
      throw new BusinessException(
        `Cannot deliver statement with status ${statement.status}. Statement must be FINAL.`,
        'INVALID_STATEMENT_STATUS',
        { statementId, currentStatus: statement.status },
      );
    }

    // 3. Get parent
    const parent = await this.parentRepository.findById(
      statement.parentId,
      tenantId,
    );
    if (!parent) {
      throw new NotFoundException('Parent', statement.parentId);
    }

    // 4. Get tenant for branding and bank details
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // 5. Get children for payment reference
    const children = await this.childRepository.findByParent(
      tenantId,
      parent.id,
    );
    const childNames =
      children.length > 0
        ? children.map((c) => `${c.firstName} ${c.lastName}`).join(' or ')
        : "your child's full name";

    // 6. Determine delivery channel (default to EMAIL)
    const channel = input.channel || NotificationChannelType.EMAIL;

    try {
      // 7. EMAIL delivery: Use HTML template + PDF attachment
      if (channel === NotificationChannelType.EMAIL) {
        if (!parent.email) {
          throw new BusinessException(
            `Parent ${parent.id} has no email address configured`,
            'NO_EMAIL_ADDRESS',
          );
        }

        // TASK-BILL-042: Generate HTML email using template service
        // TASK-BILL-043: Include bank details for payment instructions
        const templateData: StatementEmailData = {
          // Tenant branding
          tenantName: tenant.tradingName ?? tenant.name,
          supportEmail: tenant.email,
          supportPhone: tenant.phone,
          // TASK-BILL-043: Bank details for payment instructions
          bankName: tenant.bankName ?? undefined,
          bankAccountHolder:
            tenant.bankAccountHolder ?? tenant.tradingName ?? tenant.name,
          bankAccountNumber: tenant.bankAccountNumber ?? undefined,
          bankBranchCode: tenant.bankBranchCode ?? undefined,
          bankAccountType: tenant.bankAccountType ?? undefined,
          bankSwiftCode: tenant.bankSwiftCode ?? undefined,
          // Recipient
          recipientName: `${parent.firstName} ${parent.lastName}`,
          // Statement details
          statementDate: statement.createdAt,
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
          openingBalanceCents: statement.openingBalanceCents,
          totalChargesCents: statement.totalChargesCents,
          totalPaymentsCents: statement.totalPaymentsCents,
          closingBalanceCents: statement.closingBalanceCents,
          // Transaction lines
          transactions: statement.lines.map((line) => ({
            date: line.date,
            description: line.description,
            debitCents: line.debitCents,
            creditCents: line.creditCents,
            balanceCents: line.balanceCents,
          })),
          // Children names for payment reference
          childNames,
        };

        const { text, html, subject } =
          this.emailTemplateService.renderStatementEmail(templateData);

        this.logger.log(
          `TASK-BILL-042: Rendered HTML template for statement ${statement.statementNumber}`,
        );

        // TASK-BILL-042: Generate PDF attachment
        const pdfBuffer = await this.statementPdfService.generatePdf(
          tenantId,
          statementId,
          { includePaymentInstructions: true },
        );

        this.logger.log(
          `TASK-BILL-042: Generated PDF (${pdfBuffer.length} bytes) for statement ${statement.statementNumber}`,
        );

        // Send email with HTML body and PDF attachment
        // Include custom variables for Mailgun webhook correlation
        const emailResult = await this.emailService.sendEmailWithOptions({
          to: parent.email,
          subject,
          body: text, // Plain text fallback
          html, // HTML body
          attachments: [
            {
              filename: `Statement_${statement.statementNumber}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
          tags: ['statement', `tenant-${tenantId}`],
          trackOpens: true,
          trackClicks: true,
          customVariables: {
            statementId: statement.id,
            tenantId: statement.tenantId,
            documentType: 'statement',
            statementNumber: statement.statementNumber,
          },
        });

        this.logger.log(
          `TASK-BILL-035: Email sent with messageId ${emailResult.messageId} for webhook tracking`,
        );

        this.logger.log(
          `TASK-BILL-042: Email sent for statement ${statement.statementNumber} to ${parent.email} with HTML template and PDF attachment`,
        );

        // Update statement status to DELIVERED
        await this.statementRepository.updateStatus(
          statementId,
          tenantId,
          'DELIVERED',
          userId,
        );

        return {
          statementId,
          parentId: parent.id,
          success: true,
          channel: NotificationChannelType.EMAIL,
          deliveredAt: new Date(),
        };
      }

      // 7. TASK-WA-003/TASK-WA-007: WhatsApp delivery
      // Uses WhatsAppProviderService (Twilio) when configured, falls back to Meta templates
      if (channel === NotificationChannelType.WHATSAPP) {
        // Check if parent has a phone number
        if (!parent.phone) {
          throw new BusinessException(
            `Parent ${parent.id} has no phone number configured for WhatsApp delivery`,
            'NO_PHONE_NUMBER',
          );
        }

        // Format currency values
        const formatCurrency = (cents: number): string =>
          new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
          }).format(cents / 100);

        // Format period string
        const periodString = `${statement.periodStart.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}`;

        // TASK-WA-007: Use provider service (Twilio) when configured
        if (this.whatsAppProviderService?.isConfigured()) {
          const organizationName = tenant.tradingName ?? tenant.name;
          const whatsAppResult =
            await this.whatsAppProviderService.sendStatementNotification(
              tenantId,
              parent.phone,
              `${parent.firstName} ${parent.lastName}`.trim(),
              periodString,
              statement.openingBalanceCents / 100,
              statement.closingBalanceCents / 100,
              organizationName, // Use tenant name for white-labeling
            );

          if (whatsAppResult.success) {
            this.logger.log(
              `TASK-WA-007: WhatsApp statement sent via provider to ${parent.phone} with messageId ${whatsAppResult.messageId}`,
            );

            // Update statement status
            await this.statementRepository.updateStatus(
              statementId,
              tenantId,
              'DELIVERED',
              userId,
            );

            return {
              statementId,
              parentId: parent.id,
              success: true,
              channel: NotificationChannelType.WHATSAPP,
              messageId: whatsAppResult.messageId,
              deliveredAt: new Date(),
            };
          } else {
            throw new Error(
              whatsAppResult.error || 'WhatsApp delivery failed via provider',
            );
          }
        }

        // Fallback to Meta Cloud API with templates
        // Check if WhatsApp services are available
        if (
          !this.whatsAppService ||
          !this.whatsAppTemplateService ||
          !this.whatsAppMessageEntity
        ) {
          throw new BusinessException(
            'WhatsApp delivery is not configured for this tenant',
            'WHATSAPP_NOT_CONFIGURED',
          );
        }

        // Check opt-in compliance (Meta requires explicit consent)
        const compliance = this.whatsAppTemplateService.checkOptInCompliance(
          'statement_notification',
          parent.whatsappOptIn ?? false,
        );
        if (!compliance.allowed) {
          throw new BusinessException(
            compliance.reason || 'WhatsApp opt-in required',
            'WHATSAPP_OPTIN_REQUIRED',
            { parentId: parent.id },
          );
        }

        // Generate PDF for attachment
        const pdfBuffer = await this.statementPdfService.generatePdf(
          tenantId,
          statementId,
          { includePaymentInstructions: true },
        );

        this.logger.log(
          `TASK-WA-003: Generated PDF (${pdfBuffer.length} bytes) for WhatsApp statement ${statement.statementNumber}`,
        );

        // Upload PDF to get publicly accessible URL (required for WhatsApp media)
        // For now, we'll use the app URL endpoint that serves the PDF
        const documentLink = `${this.appUrl}/api/statements/${statement.id}/pdf?token=${Buffer.from(`${tenantId}:${statement.id}`).toString('base64')}`;
        const documentFilename = `Statement_${statement.statementNumber}.pdf`;

        // Build the template using the template service
        const builtTemplate =
          this.whatsAppTemplateService.buildStatementNotification({
            parentName: parent.firstName,
            periodStart: statement.periodStart,
            periodEnd: statement.periodEnd,
            openingBalance: formatCurrency(statement.openingBalanceCents),
            charges: formatCurrency(statement.totalChargesCents),
            payments: formatCurrency(statement.totalPaymentsCents),
            closingBalance: formatCurrency(statement.closingBalanceCents),
            documentLink,
            documentFilename,
            statementId: statement.id,
          });

        if (!builtTemplate) {
          throw new BusinessException(
            'Failed to build WhatsApp template for statement notification',
            'TEMPLATE_BUILD_FAILED',
          );
        }

        // Send via WhatsApp
        const whatsAppResult = await this.whatsAppService.sendTemplate(
          parent.phone,
          builtTemplate.name,
          builtTemplate.components,
        );

        // Log the message for audit trail
        await this.whatsAppMessageEntity.create({
          tenantId,
          parentId: parent.id,
          recipientPhone: parent.phone,
          templateName: 'statement_notification',
          templateParams: {
            parentName: parent.firstName,
            periodStart: statement.periodStart.toISOString(),
            periodEnd: statement.periodEnd.toISOString(),
            openingBalance: formatCurrency(statement.openingBalanceCents),
            charges: formatCurrency(statement.totalChargesCents),
            payments: formatCurrency(statement.totalPaymentsCents),
            closingBalance: formatCurrency(statement.closingBalanceCents),
          },
          wamid: whatsAppResult.messageId,
          status:
            whatsAppResult.status === 'sent'
              ? WhatsAppMessageStatus.SENT
              : WhatsAppMessageStatus.PENDING,
          contextType: WhatsAppContextType.STATEMENT,
          contextId: statement.id,
        });

        // Log template usage for compliance audit
        this.whatsAppTemplateService.logTemplateUsage(
          'statement_notification',
          {
            tenantId,
            parentId: parent.id,
            contextType: 'STATEMENT',
            contextId: statement.id,
            recipientPhone: parent.phone,
          },
        );

        this.logger.log(
          `TASK-WA-003: WhatsApp statement sent to ${parent.phone} with messageId ${whatsAppResult.messageId}`,
        );

        // Update statement status
        await this.statementRepository.updateStatus(
          statementId,
          tenantId,
          'DELIVERED',
          userId,
        );

        return {
          statementId,
          parentId: parent.id,
          success: true,
          channel: NotificationChannelType.WHATSAPP,
          messageId: whatsAppResult.messageId,
          deliveredAt: whatsAppResult.sentAt,
        };
      }

      // 8. SMS delivery: Use plain text via NotificationService
      const periodStart = statement.periodStart.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const periodEnd = statement.periodEnd.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const formattedBalance = new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
      }).format(statement.closingBalanceCents / 100);

      const payload: NotificationPayload = {
        recipientId: parent.id,
        subject: `Account Statement ${statement.statementNumber}`,
        body: this.buildStatementBody(
          parent.firstName,
          statement.statementNumber,
          periodStart,
          periodEnd,
          formattedBalance,
        ),
        metadata: {
          statementId,
          statementNumber: statement.statementNumber,
          periodStart: statement.periodStart.toISOString(),
          periodEnd: statement.periodEnd.toISOString(),
          closingBalanceCents: statement.closingBalanceCents,
        },
      };

      const result = await this.notificationService.send(tenantId, payload);

      if (result.success) {
        await this.statementRepository.updateStatus(
          statementId,
          tenantId,
          'DELIVERED',
          userId,
        );

        this.logger.log(
          `Statement ${statementId} delivered successfully via ${result.channelUsed}`,
        );
      }

      return {
        statementId,
        parentId: parent.id,
        success: result.success,
        channel: result.channelUsed,
        messageId: result.messageId,
        error: result.error,
        deliveredAt: result.sentAt,
      };
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        },
        file: 'statement-delivery.service.ts',
        function: 'deliverStatement',
        inputs: { tenantId, statementId, parentId: parent.id, channel },
        timestamp: new Date().toISOString(),
      });

      return {
        statementId,
        parentId: parent.id,
        success: false,
        error: error instanceof Error ? error.message : 'Delivery failed',
      };
    }
  }

  /**
   * Deliver multiple statements in bulk
   *
   * @param input - Bulk delivery input parameters
   * @returns Bulk delivery result with individual results
   */
  async bulkDeliverStatements(
    input: BulkDeliverInput,
  ): Promise<BulkDeliveryResult> {
    const { tenantId, statementIds, userId, channel } = input;

    this.logger.log(
      `Bulk delivering ${statementIds.length} statements for tenant ${tenantId}`,
    );

    const results: StatementDeliveryResult[] = [];
    let sent = 0;
    let failed = 0;

    // Process each statement sequentially to avoid overwhelming notification channels
    for (const statementId of statementIds) {
      try {
        const result = await this.deliverStatement({
          tenantId,
          statementId,
          userId,
          channel,
        });

        results.push(result);
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to deliver statement ${statementId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        results.push({
          statementId,
          parentId: '', // Unknown if statement lookup failed
          success: false,
          error: error instanceof Error ? error.message : 'Delivery failed',
        });
        failed++;
      }
    }

    this.logger.log(
      `Bulk delivery complete: ${sent} sent, ${failed} failed out of ${statementIds.length}`,
    );

    return {
      sent,
      failed,
      results,
    };
  }

  /**
   * Get delivery status for a statement
   *
   * @param tenantId - Tenant ID
   * @param statementId - Statement ID
   * @returns Current delivery status
   */
  async getDeliveryStatus(
    tenantId: string,
    statementId: string,
  ): Promise<{ status: string; deliveredAt?: Date }> {
    const statement = await this.statementRepository.findById(
      statementId,
      tenantId,
    );
    if (!statement) {
      throw new NotFoundException('Statement', statementId);
    }

    return {
      status: statement.status,
      deliveredAt:
        statement.status === 'DELIVERED' ? statement.updatedAt : undefined,
    };
  }

  /**
   * Build statement notification body
   * Note: This is for SMS delivery which doesn't have tenant context.
   * For personalized messages, use the HTML email template.
   * @private
   */
  private buildStatementBody(
    firstName: string,
    statementNumber: string,
    periodStart: string,
    periodEnd: string,
    closingBalance: string,
  ): string {
    return `Dear ${firstName},

Please find attached your account statement (${statementNumber}) for the period ${periodStart} to ${periodEnd}.

Statement Summary:
- Statement Number: ${statementNumber}
- Period: ${periodStart} to ${periodEnd}
- Closing Balance: ${closingBalance}

If you have any questions about your statement, please contact us.

Thank you for choosing us for your childcare needs.

---
This is an automated message. Please do not reply directly to this email.`;
  }
}
