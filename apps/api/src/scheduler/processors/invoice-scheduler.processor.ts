/**
 * Invoice Scheduler Processor
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 *
 * Processes scheduled invoice generation jobs.
 * Features:
 * - Batch processing (10 enrollments at a time)
 * - Retry with exponential backoff
 * - Progress tracking
 * - Admin notifications
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
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';

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
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
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

      // Send admin notification
      await this.sendAdminNotification(tenantId, billingMonth, result);

      // Mark job as complete
      await job.progress(100);
    } catch (error) {
      await this.handleError(
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
