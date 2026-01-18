/**
 * SimplePay Webhook Service
 * TASK-SPAY-009: SimplePay Webhook Handler
 *
 * @description Handles incoming webhooks from SimplePay for real-time event processing.
 * Implements signature verification, webhook logging, and event-specific handlers.
 *
 * CRITICAL: Verify webhook signatures before processing.
 * CRITICAL: Return 200 quickly to prevent webhook retries.
 * CRITICAL: Use idempotency checks based on delivery_id.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { SimplePayPayslipService } from './simplepay-payslip.service';
import { SimplePayEmployeeService } from './simplepay-employee.service';
import type {
  SimplePayWebhookPayload,
  PayRunCompletedData,
  PayslipCreatedData,
  EmployeeUpdatedData,
  EmployeeTerminatedData,
  IWebhookLog,
} from './dto/simplepay-webhook.dto';

/**
 * SimplePay Webhook Service
 * Processes incoming webhooks from SimplePay
 */
@Injectable()
export class SimplePayWebhookService {
  private readonly logger = new Logger(SimplePayWebhookService.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly payslipService: SimplePayPayslipService,
    private readonly employeeService: SimplePayEmployeeService,
  ) {
    this.webhookSecret = this.configService.get<string>(
      'SIMPLEPAY_WEBHOOK_SECRET',
    );
  }

  /**
   * Verify SimplePay webhook signature using HMAC-SHA256
   *
   * CRITICAL: NEVER skip verification - FAIL FAST if secret not configured
   *
   * @param rawBody - Raw request body as string
   * @param signature - x-simplepay-signature header
   * @returns true if signature is valid
   */
  verifySignature(rawBody: string, signature: string): boolean {
    // SECURITY: FAIL FAST - Never process webhooks without verification
    if (!this.webhookSecret) {
      this.logger.error(
        'SECURITY: SimplePay webhook secret (SIMPLEPAY_WEBHOOK_SECRET) not configured. ' +
          'Webhook signature verification is REQUIRED in ALL environments. ' +
          'Configure the webhook secret or disable SimplePay webhooks.',
      );
      throw new Error(
        'Webhook verification failed: SIMPLEPAY_WEBHOOK_SECRET not configured',
      );
    }

    if (!signature) {
      this.logger.warn('Missing signature header in SimplePay webhook request');
      return false;
    }

    try {
      // SimplePay uses HMAC-SHA256 for webhook signatures
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('SimplePay webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying SimplePay signature', error);
      return false;
    }
  }

  /**
   * Check if webhook has already been processed (idempotency)
   *
   * @param deliveryId - Unique delivery ID from SimplePay
   * @returns true if already processed
   */
  async isAlreadyProcessed(deliveryId: string): Promise<boolean> {
    const existing = await this.prisma.webhookLog.findUnique({
      where: {
        source_deliveryId: {
          source: 'simplepay',
          deliveryId,
        },
      },
    });

    return existing !== null;
  }

  /**
   * Log incoming webhook to database
   *
   * @param payload - Webhook payload
   * @param tenantId - Resolved tenant ID (optional)
   * @returns Created webhook log
   */
  async logWebhook(
    payload: SimplePayWebhookPayload,
    tenantId?: string,
  ): Promise<IWebhookLog> {
    const webhookLog = await this.prisma.webhookLog.create({
      data: {
        tenantId,
        source: 'simplepay',
        eventType: payload.event,
        deliveryId: payload.delivery_id,
        payload: payload as unknown as Prisma.InputJsonValue,
        processed: false,
      },
    });

    this.logger.debug(
      `Logged webhook: ${webhookLog.id} (event: ${payload.event}, delivery_id: ${payload.delivery_id})`,
    );

    return webhookLog as unknown as IWebhookLog;
  }

  /**
   * Resolve tenant ID from SimplePay client ID
   *
   * @param clientId - SimplePay client ID
   * @returns Tenant ID or null if not found
   */
  async resolveTenantId(clientId: string): Promise<string | null> {
    const connection = await this.prisma.simplePayConnection.findFirst({
      where: {
        clientId,
        isActive: true,
      },
      select: {
        tenantId: true,
      },
    });

    return connection?.tenantId ?? null;
  }

  /**
   * Process webhook asynchronously
   * Called after logging to process event-specific logic
   *
   * @param webhookLogId - ID of the logged webhook
   * @param payload - Webhook payload
   * @param tenantId - Resolved tenant ID
   */
  async processWebhook(
    webhookLogId: string,
    payload: SimplePayWebhookPayload,
    tenantId: string | null,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log(
        `Processing SimplePay webhook: ${payload.event} (delivery_id: ${payload.delivery_id})`,
      );

      // Skip processing if no tenant mapped
      if (!tenantId) {
        this.logger.warn(
          `No tenant found for SimplePay client ${payload.client_id}. Webhook logged but not processed.`,
        );
        await this.markWebhookProcessed(webhookLogId, null);
        return;
      }

      // Route to event-specific handler
      switch (payload.event) {
        case 'payrun.completed':
          await this.handlePayRunCompleted(
            tenantId,
            payload.data as unknown as PayRunCompletedData,
          );
          break;

        case 'payslip.created':
          await this.handlePayslipCreated(
            tenantId,
            payload.data as unknown as PayslipCreatedData,
          );
          break;

        case 'employee.updated':
          await this.handleEmployeeUpdated(
            tenantId,
            payload.data as unknown as EmployeeUpdatedData,
          );
          break;

        case 'employee.terminated':
          await this.handleEmployeeTerminated(
            tenantId,
            payload.data as unknown as EmployeeTerminatedData,
          );
          break;

        default:
          this.logger.warn(`Unknown SimplePay webhook event: ${payload.event}`);
      }

      // Mark as processed
      await this.markWebhookProcessed(webhookLogId, null);

      const duration = Date.now() - startTime;
      this.logger.log(
        `SimplePay webhook processed successfully: ${payload.event} (${duration}ms)`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Error processing SimplePay webhook ${payload.event}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Mark as processed with error
      await this.markWebhookProcessed(webhookLogId, errorMessage);
    }
  }

  /**
   * Mark webhook as processed
   *
   * @param webhookLogId - Webhook log ID
   * @param error - Error message if processing failed
   */
  private async markWebhookProcessed(
    webhookLogId: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.webhookLog.update({
      where: { id: webhookLogId },
      data: {
        processed: true,
        processedAt: new Date(),
        error,
      },
    });
  }

  /**
   * Handle payrun.completed event
   * Imports payslips for all employees in the completed pay run
   *
   * @param tenantId - Tenant ID
   * @param data - Pay run completed event data
   */
  private async handlePayRunCompleted(
    tenantId: string,
    data: PayRunCompletedData,
  ): Promise<void> {
    this.logger.log(
      `Handling payrun.completed: payrun_id=${data.payrun_id}, wave=${data.wave_name}`,
    );

    // Import payslips for the pay period
    const periodStart = new Date(data.period_start);
    const periodEnd = new Date(data.period_end);

    const result = await this.payslipService.importAllPayslips(
      tenantId,
      periodStart,
      periodEnd,
    );

    this.logger.log(
      `Pay run import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`,
    );
  }

  /**
   * Handle payslip.created event
   * Imports a single payslip
   *
   * @param tenantId - Tenant ID
   * @param data - Payslip created event data
   */
  private async handlePayslipCreated(
    tenantId: string,
    data: PayslipCreatedData,
  ): Promise<void> {
    this.logger.log(
      `Handling payslip.created: payslip_id=${data.payslip_id}, employee_id=${data.employee_id}`,
    );

    // Find the staff member by SimplePay employee ID
    const mapping =
      await this.simplePayRepo.findEmployeeMappingBySimplePayIdOnly(
        data.employee_id,
      );

    if (!mapping) {
      this.logger.warn(
        `No staff mapping found for SimplePay employee ${data.employee_id}`,
      );
      return;
    }

    // Import payslips for this employee
    const periodStart = new Date(data.period_start);
    const periodEnd = new Date(data.period_end);

    await this.payslipService.importPayslips(
      tenantId,
      mapping.staffId,
      periodStart,
      periodEnd,
    );

    this.logger.log(`Payslip imported for staff ${mapping.staffId}`);
  }

  /**
   * Handle employee.updated event
   * Syncs employee data changes from SimplePay
   *
   * @param tenantId - Tenant ID
   * @param data - Employee updated event data
   */
  private async handleEmployeeUpdated(
    tenantId: string,
    data: EmployeeUpdatedData,
  ): Promise<void> {
    this.logger.log(
      `Handling employee.updated: employee_id=${data.employee_id}, fields=${data.fields_changed.join(', ')}`,
    );

    // Find the staff member by SimplePay employee ID
    const mapping =
      await this.simplePayRepo.findEmployeeMappingBySimplePayIdOnly(
        data.employee_id,
      );

    if (!mapping) {
      this.logger.warn(
        `No staff mapping found for SimplePay employee ${data.employee_id}`,
      );
      return;
    }

    // Mark as out of sync - manual sync required
    await this.simplePayRepo.updateEmployeeMappingSyncStatus(
      mapping.staffId,
      'OUT_OF_SYNC',
      `Employee updated in SimplePay: ${data.fields_changed.join(', ')}`,
    );

    this.logger.log(
      `Staff ${mapping.staffId} marked as out of sync (SimplePay employee updated)`,
    );
  }

  /**
   * Handle employee.terminated event
   * Marks employee as terminated and handles final pay
   *
   * @param tenantId - Tenant ID
   * @param data - Employee terminated event data
   */
  private async handleEmployeeTerminated(
    tenantId: string,
    data: EmployeeTerminatedData,
  ): Promise<void> {
    this.logger.log(
      `Handling employee.terminated: employee_id=${data.employee_id}, date=${data.termination_date}`,
    );

    // Find the staff member by SimplePay employee ID
    const mapping =
      await this.simplePayRepo.findEmployeeMappingBySimplePayIdOnly(
        data.employee_id,
      );

    if (!mapping) {
      this.logger.warn(
        `No staff mapping found for SimplePay employee ${data.employee_id}`,
      );
      return;
    }

    // Update staff end date
    await this.prisma.staff.update({
      where: { id: mapping.staffId },
      data: {
        endDate: new Date(data.termination_date),
        isActive: false,
      },
    });

    // Import final payslip if provided
    if (data.final_payslip_id) {
      this.logger.log(
        `Importing final payslip ${data.final_payslip_id} for terminated employee`,
      );

      // The payslip will be imported via the normal payslip import process
      // or can be triggered separately
    }

    // Mark sync status
    await this.simplePayRepo.updateEmployeeMappingSyncStatus(
      mapping.staffId,
      'SYNCED',
      null,
    );

    this.logger.log(
      `Staff ${mapping.staffId} marked as terminated (from SimplePay)`,
    );
  }

  /**
   * Get pending webhooks for processing (for background job)
   *
   * @param limit - Maximum number of webhooks to return
   * @returns List of unprocessed webhooks
   */
  async getPendingWebhooks(limit = 100): Promise<IWebhookLog[]> {
    const webhooks = await this.prisma.webhookLog.findMany({
      where: {
        source: 'simplepay',
        processed: false,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return webhooks as unknown as IWebhookLog[];
  }

  /**
   * Retry failed webhooks
   *
   * @param olderThan - Only retry webhooks older than this date
   * @param limit - Maximum number of webhooks to retry
   */
  async retryFailedWebhooks(olderThan: Date, limit = 50): Promise<void> {
    const failedWebhooks = await this.prisma.webhookLog.findMany({
      where: {
        source: 'simplepay',
        processed: true,
        error: { not: null },
        createdAt: { lt: olderThan },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    for (const webhook of failedWebhooks) {
      const tenantId = await this.resolveTenantId(
        (webhook.payload as Record<string, string>).client_id,
      );

      // Reset processed flag and retry
      await this.prisma.webhookLog.update({
        where: { id: webhook.id },
        data: {
          processed: false,
          processedAt: null,
          error: null,
        },
      });

      await this.processWebhook(
        webhook.id,
        webhook.payload as unknown as SimplePayWebhookPayload,
        tenantId,
      );
    }
  }
}
