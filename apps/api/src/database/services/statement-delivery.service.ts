/**
 * Statement Delivery Service
 * TASK-STMT-007: Statement Delivery Service (Logic Layer)
 *
 * @module database/services/statement-delivery
 * @description Service for delivering statements to parents via email, WhatsApp, or SMS.
 * Uses the existing multi-channel notification infrastructure.
 *
 * CRITICAL: All delivery attempts are logged. Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../../notifications/notification.service';
import {
  NotificationPayload,
  DeliveryResult,
  NotificationDeliveryStatus,
  NotificationChannelType,
} from '../../notifications/types/notification.types';
import { StatementPdfService } from './statement-pdf.service';
import { StatementRepository } from '../repositories/statement.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { ConfigService } from '@nestjs/config';

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
    private readonly configService: ConfigService,
  ) {
    this.appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  /**
   * Deliver a single statement to its parent
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

    // 1. Get statement
    const statement = await this.statementRepository.findById(
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

    // 4. Generate PDF URL (using API endpoint)
    const pdfUrl = `${this.appUrl}/api/statements/${statementId}/pdf`;

    // 5. Build notification payload
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

    const closingBalance = (statement.closingBalanceCents / 100).toFixed(2);
    const formattedBalance = new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(statement.closingBalanceCents / 100);

    const payload: NotificationPayload = {
      recipientId: parent.id,
      subject: `Account Statement ${statement.statementNumber} - ${periodStart} to ${periodEnd}`,
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
      attachments: [
        {
          filename: `Statement_${statement.statementNumber}.pdf`,
          url: pdfUrl,
          contentType: 'application/pdf',
        },
      ],
    };

    // 6. Send notification
    try {
      let result: DeliveryResult;
      if (input.channel) {
        // Force specific channel
        result = await this.notificationService.send(tenantId, payload);
      } else {
        // Use fallback chain based on parent preferences
        result = await this.notificationService.sendWithFallback(
          tenantId,
          payload,
        );
      }

      // 7. Update statement status if delivered successfully
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
        inputs: { tenantId, statementId, parentId: parent.id },
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

Best regards,
CrecheBooks Team

---
This is an automated message. Please do not reply directly to this email.`;
  }
}
