/**
 * Invoice Scheduler Processor
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 * FEAT-BILLING-AUTOSEND: Post-generation auto-send step
 *
 * Processes scheduled invoice generation jobs.
 * Features:
 * - Batch processing (10 enrollments at a time)
 * - Retry with exponential backoff
 * - Progress tracking
 * - Post-generation auto-send (with staging-safety gate)
 * - Admin notifications
 *
 * Staging-safety contract (two-layer guard):
 *   1. CommsGuardService.isDisabled() — COMMS_DISABLED env var.
 *      When true, email/WA adapters return mocked success; no external call.
 *   2. APP_ENV === 'staging' belt-and-suspenders — if COMMS_DISABLED is not
 *      set AND we are in the staging environment, delivery is suppressed and
 *      invoices are marked SENT in DB without calling InvoiceDeliveryService.
 * In either suppressed case the audit log records the reason explicitly.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import {
  QUEUE_NAMES,
  InvoiceGenerationJobData,
} from '../types/scheduler.types';
import { InvoiceGenerationService } from '../../database/services/invoice-generation.service';
import { InvoiceDeliveryService } from '../../database/services/invoice-delivery.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
import {
  DeliveryStatus,
  InvoiceStatus,
} from '../../database/entities/invoice.entity';
import { CommsGuardService } from '../../common/services/comms-guard/comms-guard.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { InvoiceBatchCompletedEvent } from '../../database/events/domain-events';

/** Batch size for processing enrollments */
const BATCH_SIZE = 10;

/** Generation result summary */
interface GenerationResult {
  totalEnrollments: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  invoiceIds: string[];
  errors: Array<{ enrollmentId: string; error: string }>;
  durationMs: number;
}

@Injectable()
@Processor(QUEUE_NAMES.INVOICE_GENERATION)
export class InvoiceSchedulerProcessor extends BaseProcessor<InvoiceGenerationJobData> {
  protected readonly logger = new Logger(InvoiceSchedulerProcessor.name);

  constructor(
    private readonly invoiceGenerationService: InvoiceGenerationService,
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly commsGuard: CommsGuardService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(QUEUE_NAMES.INVOICE_GENERATION);
  }

  @Process()
  async processJob(job: Job<InvoiceGenerationJobData>): Promise<void> {
    const { tenantId, billingMonth, dryRun, triggeredBy } = job.data;

    this.logger.log({
      message: 'Starting invoice generation job',
      jobId: job.id,
      tenantId,
      billingMonth,
      triggeredBy,
      dryRun,
      timestamp: new Date().toISOString(),
    });

    try {
      // Generate invoices in batches
      const result = await this.generateInBatches(
        tenantId,
        billingMonth,
        dryRun,
        job,
      );

      // Log completion
      this.logger.log({
        message: 'Invoice generation completed',
        jobId: job.id,
        tenantId,
        billingMonth,
        result: {
          totalEnrollments: result.totalEnrollments,
          successCount: result.successCount,
          errorCount: result.errorCount,
          skippedCount: result.skippedCount,
          durationMs: result.durationMs,
        },
        timestamp: new Date().toISOString(),
      });

      // Record audit log
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'InvoiceGeneration',
        entityId: `batch-${billingMonth}`,
        action: AuditAction.CREATE,
        afterValue: {
          billingMonth,
          triggeredBy,
          dryRun,
          totalEnrollments: result.totalEnrollments,
          successCount: result.successCount,
          errorCount: result.errorCount,
          skippedCount: result.skippedCount,
          invoiceIds: result.invoiceIds,
          durationMs: result.durationMs,
        },
        changeSummary: `Generated ${result.successCount} invoices for ${billingMonth} (${result.errorCount} errors, ${result.skippedCount} skipped)`,
      });

      // Auto-send step: deliver generated invoices to parents
      // Skipped in dry-run and skipped when no invoices were produced.
      if (!dryRun && result.invoiceIds.length > 0) {
        await this.sendGeneratedInvoices(
          tenantId,
          billingMonth,
          result.invoiceIds,
        );
      }

      // Send admin notification
      await this.sendAdminNotification(tenantId, billingMonth, result);

      // Emit invoice.batch.completed domain event (non-blocking)
      try {
        this.eventEmitter.emit('invoice.batch.completed', {
          tenantId,
          billingMonth,
          successCount: result.successCount,
          errorCount: result.errorCount,
          skippedCount: result.skippedCount,
          totalEnrollments: result.totalEnrollments,
        } satisfies InvoiceBatchCompletedEvent);
      } catch (eventError) {
        this.logger.warn(
          `Failed to emit invoice.batch.completed event: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
        );
      }

      // Mark job as complete
      await job.progress(100);
    } catch (error) {
      this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          file: 'invoice-scheduler.processor.ts',
          function: 'processJob',
          inputs: { tenantId, billingMonth, triggeredBy },
          job,
        },
      );
    }
  }

  /**
   * Send all generated DRAFT invoices to parents.
   *
   * Two-layer staging-safety gate (evaluated in order):
   *   1. APP_ENV === 'staging' AND COMMS_DISABLED is not explicitly true:
   *      Delivery is suppressed — invoices are marked SENT in DB (matching
   *      what DATA-01 did manually) without calling any delivery adapter.
   *      Audit note: "delivery suppressed (staging env / COMMS_DISABLED not set)".
   *   2. COMMS_DISABLED=true: The email/WA adapters will return mocked success
   *      without hitting external APIs. InvoiceDeliveryService handles the DB
   *      update normally. Audit note: "delivery suppressed via COMMS_DISABLED".
   *   3. Neither suppression is active: Normal delivery via InvoiceDeliveryService.
   *
   * Failed individual deliveries are logged but do NOT fail the whole job;
   * those invoices remain in DRAFT for operator retry.
   */
  private async sendGeneratedInvoices(
    tenantId: string,
    billingMonth: string,
    invoiceIds: string[],
  ): Promise<void> {
    const isCommsDisabled = this.commsGuard.isDisabled();
    const isStagingEnv = process.env.APP_ENV === 'staging';

    // Layer 1: staging env without COMMS_DISABLED set — hard suppress
    if (isStagingEnv && !isCommsDisabled) {
      this.logger.warn(
        `[STAGING-SAFETY] Delivery suppressed for ${invoiceIds.length} invoices ` +
          `(APP_ENV=staging, COMMS_DISABLED not set). ` +
          `Marking invoices SENT in DB without contacting any delivery adapter. ` +
          `Set COMMS_DISABLED=true in Railway staging to route through the comms guard instead.`,
      );

      // Mark all as SENT in DB (matches DATA-01 manual fix pattern)
      const now = new Date();
      await this.prisma.invoice.updateMany({
        where: {
          id: { in: invoiceIds },
          tenantId,
          status: InvoiceStatus.DRAFT,
        },
        data: {
          status: InvoiceStatus.SENT,
          deliveryStatus: DeliveryStatus.SENT,
          deliveredAt: now,
        },
      });

      await this.auditLogService.logAction({
        tenantId,
        entityType: 'InvoiceGeneration',
        entityId: `batch-${billingMonth}-send`,
        action: AuditAction.UPDATE,
        afterValue: {
          billingMonth,
          invoiceIds,
          suppressedReason: 'staging env / COMMS_DISABLED not set',
          markedSentAt: now.toISOString(),
        },
        changeSummary: `Auto-send suppressed (staging env): ${invoiceIds.length} invoices marked SENT in DB without delivery`,
      });

      return;
    }

    // Layer 2: COMMS_DISABLED=true — adapters mock the send, log the note
    if (isCommsDisabled) {
      this.logger.warn(
        `[COMMS_DISABLED] Auto-send for ${invoiceIds.length} invoices will be mocked ` +
          `by the comms adapters — no emails or WhatsApp messages will be sent.`,
      );
    }

    // Normal path (or COMMS_DISABLED path — adapters handle suppression internally)
    this.logger.log(
      `Auto-send: delivering ${invoiceIds.length} invoices for tenant ${tenantId} (${billingMonth})`,
    );

    const deliveryResult = await this.invoiceDeliveryService.sendInvoices({
      tenantId,
      invoiceIds,
    });

    this.logger.log(
      `Auto-send complete: ${deliveryResult.sent} sent, ${deliveryResult.failed} failed`,
    );

    if (deliveryResult.failed > 0) {
      this.logger.warn(
        `Auto-send: ${deliveryResult.failed} invoice(s) failed delivery — left in DRAFT for operator retry`,
      );
      for (const failure of deliveryResult.failures) {
        this.logger.error(
          `Delivery failed for invoice ${failure.invoiceId}: [${failure.code}] ${failure.reason}`,
        );
      }
    }

    await this.auditLogService.logAction({
      tenantId,
      entityType: 'InvoiceGeneration',
      entityId: `batch-${billingMonth}-send`,
      action: AuditAction.UPDATE,
      afterValue: {
        billingMonth,
        invoiceIds,
        sent: deliveryResult.sent,
        failed: deliveryResult.failed,
        // Serialise via intermediate to satisfy Prisma.InputJsonValue constraint
        failures: deliveryResult.failures.map((f) => ({
          invoiceId: f.invoiceId,
          reason: f.reason,
          code: f.code,
        })),
        commsDisabled: isCommsDisabled,
      },
      changeSummary: `Auto-send: ${deliveryResult.sent} delivered, ${deliveryResult.failed} failed for ${billingMonth}`,
    });
  }

  /**
   * Generate invoices in batches to prevent timeout
   */
  private async generateInBatches(
    tenantId: string,
    billingMonth: string,
    dryRun: boolean = false,
    job: Job<InvoiceGenerationJobData>,
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    // Get all active enrollments for this tenant
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        id: true,
        childId: true,
      },
    });

    const totalEnrollments = activeEnrollments.length;
    const result: GenerationResult = {
      totalEnrollments,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      invoiceIds: [],
      errors: [],
      durationMs: 0,
    };

    if (totalEnrollments === 0) {
      this.logger.log(`No active enrollments found for tenant ${tenantId}`);
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Extract child IDs
    const childIds = activeEnrollments.map((e) => e.childId);

    // Process in batches
    for (let i = 0; i < childIds.length; i += BATCH_SIZE) {
      const batchChildIds = childIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(childIds.length / BATCH_SIZE);

      this.logger.debug(
        `Processing batch ${batchNumber}/${totalBatches} (${batchChildIds.length} children)`,
      );

      try {
        if (dryRun) {
          // In dry run mode, just count without creating
          result.skippedCount += batchChildIds.length;
        } else {
          // Generate invoices for this batch
          const batchResult =
            await this.invoiceGenerationService.generateMonthlyInvoices(
              tenantId,
              billingMonth,
              'system', // Generated by scheduler
              batchChildIds,
            );

          // Map InvoiceGenerationResult to our GenerationResult
          result.successCount += batchResult.invoicesCreated;

          // Count skipped as DUPLICATE_INVOICE errors
          const skippedErrors = batchResult.errors.filter(
            (e) => e.code === 'DUPLICATE_INVOICE',
          );
          result.skippedCount += skippedErrors.length;

          // Collect invoice IDs from created invoices
          result.invoiceIds.push(...batchResult.invoices.map((inv) => inv.id));

          // Count real errors (not skipped duplicates)
          const realErrors = batchResult.errors.filter(
            (e) => e.code !== 'DUPLICATE_INVOICE',
          );
          if (realErrors.length > 0) {
            result.errorCount += realErrors.length;
            result.errors.push(
              ...realErrors.map((e) => ({
                enrollmentId: e.childId || 'unknown',
                error: e.error,
              })),
            );
          }
        }
      } catch (error) {
        // Log batch error but continue with next batch
        this.logger.error({
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'UnknownError',
          },
          file: 'invoice-scheduler.processor.ts',
          function: 'generateInBatches',
          batch: batchNumber,
          childIds: batchChildIds,
          timestamp: new Date().toISOString(),
        });

        result.errorCount += batchChildIds.length;
        for (const childId of batchChildIds) {
          result.errors.push({
            enrollmentId: childId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update job progress
      const progress = Math.round(
        ((i + batchChildIds.length) / childIds.length) * 90,
      );
      await job.progress(progress);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Send admin notification about generation results
   */
  private async sendAdminNotification(
    tenantId: string,
    billingMonth: string,
    result: GenerationResult,
  ): Promise<void> {
    // Get tenant details for notification
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true },
    });

    if (!tenant) {
      this.logger.warn(`Tenant ${tenantId} not found for notification`);
      return;
    }

    const subject =
      result.errorCount > 0
        ? `Invoice Generation Completed with Errors - ${billingMonth}`
        : `Invoice Generation Completed - ${billingMonth}`;

    const body = `
Invoice Generation Summary for ${tenant.name}
Billing Period: ${billingMonth}

Total Enrollments: ${result.totalEnrollments}
Successfully Generated: ${result.successCount}
Skipped (existing): ${result.skippedCount}
Errors: ${result.errorCount}
Duration: ${(result.durationMs / 1000).toFixed(1)}s

${
  result.errorCount > 0
    ? `
Errors:
${result.errors
  .slice(0, 10)
  .map((e) => `- ${e.enrollmentId}: ${e.error}`)
  .join('\n')}
${result.errors.length > 10 ? `... and ${result.errors.length - 10} more errors` : ''}
`
    : ''
}
---
This is an automated notification.
    `.trim();

    // Log notification (would integrate with email service)
    this.logger.log({
      message: 'Admin notification prepared',
      tenantId,
      recipientEmail: tenant.email,
      subject,
      bodyPreview: body.substring(0, 200) + '...',
    });

    // TODO: Integrate with email service when available
  }
}
