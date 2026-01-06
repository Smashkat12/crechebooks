/**
 * Statement Scheduler Processor
 * TASK-STMT-008: Scheduled Monthly Statement Generation
 *
 * Processes scheduled statement generation jobs for monthly account statements.
 * Features:
 * - Batch processing (10 parents at a time)
 * - Retry with exponential backoff
 * - Progress tracking
 * - Admin notifications
 * - Optional auto-finalize and auto-deliver
 *
 * CRITICAL: No fallbacks - fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import {
  QUEUE_NAMES,
  StatementGenerationJobData,
} from '../types/scheduler.types';
import { StatementGenerationService } from '../../database/services/statement-generation.service';
import { StatementDeliveryService } from '../../database/services/statement-delivery.service';
import { StatementRepository } from '../../database/repositories/statement.repository';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { PrismaService } from '../../database/prisma/prisma.service';

/** Batch size for processing parents */
const BATCH_SIZE = 10;

/** Statement generation result summary */
interface StatementGenerationResult {
  totalParents: number;
  generatedCount: number;
  finalizedCount: number;
  deliveredCount: number;
  skippedCount: number;
  errorCount: number;
  statementIds: string[];
  errors: Array<{ parentId: string; error: string }>;
  durationMs: number;
}

@Injectable()
@Processor(QUEUE_NAMES.STATEMENT_GENERATION)
export class StatementSchedulerProcessor extends BaseProcessor<StatementGenerationJobData> {
  protected readonly logger = new Logger(StatementSchedulerProcessor.name);

  constructor(
    private readonly statementGenerationService: StatementGenerationService,
    private readonly statementDeliveryService: StatementDeliveryService,
    private readonly statementRepository: StatementRepository,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {
    super(QUEUE_NAMES.STATEMENT_GENERATION);
  }

  @Process()
  async processJob(job: Job<StatementGenerationJobData>): Promise<void> {
    const {
      tenantId,
      statementMonth,
      parentIds,
      onlyWithActivity,
      onlyWithBalance,
      dryRun,
      autoFinalize,
      autoDeliver,
      triggeredBy,
    } = job.data;

    this.logger.log({
      message: 'Starting statement generation job',
      jobId: job.id,
      tenantId,
      statementMonth,
      parentIdsCount: parentIds?.length || 'all',
      triggeredBy,
      dryRun,
      autoFinalize,
      autoDeliver,
      timestamp: new Date().toISOString(),
    });

    try {
      // Generate statements in batches
      const result = await this.generateInBatches(
        tenantId,
        statementMonth,
        {
          parentIds,
          onlyWithActivity,
          onlyWithBalance,
          dryRun,
          autoFinalize,
          autoDeliver,
        },
        job,
      );

      // Log completion
      this.logger.log({
        message: 'Statement generation completed',
        jobId: job.id,
        tenantId,
        statementMonth,
        result: {
          totalParents: result.totalParents,
          generatedCount: result.generatedCount,
          finalizedCount: result.finalizedCount,
          deliveredCount: result.deliveredCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          durationMs: result.durationMs,
        },
        timestamp: new Date().toISOString(),
      });

      // Record audit log
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'StatementGeneration',
        entityId: `batch-${statementMonth}`,
        action: AuditAction.CREATE,
        afterValue: {
          statementMonth,
          triggeredBy,
          dryRun,
          autoFinalize,
          autoDeliver,
          totalParents: result.totalParents,
          generatedCount: result.generatedCount,
          finalizedCount: result.finalizedCount,
          deliveredCount: result.deliveredCount,
          skippedCount: result.skippedCount,
          errorCount: result.errorCount,
          statementIds: result.statementIds,
          durationMs: result.durationMs,
        },
        changeSummary: `Generated ${result.generatedCount} statements for ${statementMonth} (${result.errorCount} errors, ${result.skippedCount} skipped)`,
      });

      // Send admin notification
      await this.sendAdminNotification(tenantId, statementMonth, result);

      // Mark job as complete
      await job.progress(100);
    } catch (error) {
      await this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          file: 'statement-scheduler.processor.ts',
          function: 'processJob',
          inputs: { tenantId, statementMonth, triggeredBy },
          job,
        },
      );
    }
  }

  /**
   * Generate statements in batches to prevent timeout
   */
  private async generateInBatches(
    tenantId: string,
    statementMonth: string,
    options: {
      parentIds?: string[];
      onlyWithActivity?: boolean;
      onlyWithBalance?: boolean;
      dryRun?: boolean;
      autoFinalize?: boolean;
      autoDeliver?: boolean;
    },
    job: Job<StatementGenerationJobData>,
  ): Promise<StatementGenerationResult> {
    const startTime = Date.now();

    // Parse the statement month to get period dates
    const [year, month] = statementMonth.split('-').map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of the month

    // Get parents to process
    let parentIdsToProcess: string[];

    if (options.parentIds && options.parentIds.length > 0) {
      parentIdsToProcess = options.parentIds;
    } else {
      // Get all parents with active enrollments
      const activeParents = await this.prisma.parent.findMany({
        where: {
          tenantId,
          children: {
            some: {
              enrollments: {
                some: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
        select: { id: true },
      });
      parentIdsToProcess = activeParents.map((p) => p.id);
    }

    const totalParents = parentIdsToProcess.length;
    const result: StatementGenerationResult = {
      totalParents,
      generatedCount: 0,
      finalizedCount: 0,
      deliveredCount: 0,
      skippedCount: 0,
      errorCount: 0,
      statementIds: [],
      errors: [],
      durationMs: 0,
    };

    if (totalParents === 0) {
      this.logger.log(
        `No parents found for statement generation in tenant ${tenantId}`,
      );
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Process in batches
    for (let i = 0; i < parentIdsToProcess.length; i += BATCH_SIZE) {
      const batchParentIds = parentIdsToProcess.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(parentIdsToProcess.length / BATCH_SIZE);

      this.logger.debug(
        `Processing batch ${batchNumber}/${totalBatches} (${batchParentIds.length} parents)`,
      );

      // Process each parent in the batch
      for (const parentId of batchParentIds) {
        try {
          if (options.dryRun) {
            // In dry run mode, just count without creating
            result.skippedCount++;
            continue;
          }

          // Check filtering conditions
          if (options.onlyWithActivity || options.onlyWithBalance) {
            const shouldProcess = await this.shouldProcessParent(
              tenantId,
              parentId,
              periodStart,
              periodEnd,
              options.onlyWithActivity,
              options.onlyWithBalance,
            );

            if (!shouldProcess) {
              result.skippedCount++;
              continue;
            }
          }

          // Generate statement
          const statement =
            await this.statementGenerationService.generateStatement({
              tenantId,
              parentId,
              periodStart,
              periodEnd,
              userId: 'system', // Generated by scheduler
            });

          result.statementIds.push(statement.id);
          result.generatedCount++;

          // Auto-finalize if enabled
          if (options.autoFinalize) {
            await this.statementRepository.updateStatus(
              statement.id,
              tenantId,
              'FINAL',
              'system',
            );
            result.finalizedCount++;

            // Auto-deliver if enabled (only finalized statements can be delivered)
            if (options.autoDeliver) {
              try {
                const deliveryResult =
                  await this.statementDeliveryService.deliverStatement({
                    tenantId,
                    statementId: statement.id,
                    userId: 'system',
                  });

                if (deliveryResult.success) {
                  result.deliveredCount++;
                }
              } catch (deliveryError) {
                // Log delivery error but don't fail the whole job
                this.logger.warn({
                  message: 'Statement delivery failed',
                  statementId: statement.id,
                  parentId,
                  error:
                    deliveryError instanceof Error
                      ? deliveryError.message
                      : String(deliveryError),
                });
              }
            }
          }
        } catch (error) {
          // Log parent error but continue with next parent
          this.logger.error({
            error: {
              message: error instanceof Error ? error.message : String(error),
              name: error instanceof Error ? error.name : 'UnknownError',
              stack: error instanceof Error ? error.stack : undefined,
            },
            file: 'statement-scheduler.processor.ts',
            function: 'generateInBatches',
            parentId,
            timestamp: new Date().toISOString(),
          });

          result.errorCount++;
          result.errors.push({
            parentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update job progress
      const progress = Math.round(
        ((i + batchParentIds.length) / parentIdsToProcess.length) * 90,
      );
      await job.progress(progress);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Check if a parent should be processed based on filtering conditions
   */
  private async shouldProcessParent(
    tenantId: string,
    parentId: string,
    periodStart: Date,
    periodEnd: Date,
    onlyWithActivity?: boolean,
    onlyWithBalance?: boolean,
  ): Promise<boolean> {
    // Check activity in period
    if (onlyWithActivity) {
      // Check for invoices or payments in the period
      const hasActivity = await this.prisma.$transaction(async (tx) => {
        const invoiceCount = await tx.invoice.count({
          where: {
            tenantId,
            child: { parentId },
            issueDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        });

        if (invoiceCount > 0) return true;

        // Check payments through invoice relationship
        const paymentCount = await tx.payment.count({
          where: {
            tenantId,
            invoice: { parentId },
            paymentDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        });

        return paymentCount > 0;
      });

      if (!hasActivity) {
        return false;
      }
    }

    // Check balance
    if (onlyWithBalance) {
      // Get sum of outstanding amounts (totalCents - amountPaidCents)
      // Outstanding statuses are SENT, VIEWED, PARTIALLY_PAID, OVERDUE
      const invoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          child: { parentId },
          status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        select: {
          totalCents: true,
          amountPaidCents: true,
        },
      });

      const outstandingBalance = invoices.reduce(
        (sum, inv) => sum + (inv.totalCents - inv.amountPaidCents),
        0,
      );

      if (outstandingBalance === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send admin notification about generation results
   */
  private async sendAdminNotification(
    tenantId: string,
    statementMonth: string,
    result: StatementGenerationResult,
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

    const hasErrors = result.errorCount > 0;
    const subject = hasErrors
      ? `Statement Generation Completed with Errors - ${statementMonth}`
      : `Statement Generation Completed - ${statementMonth}`;

    const body = `
Statement Generation Summary for ${tenant.name}
Statement Period: ${statementMonth}

Total Parents: ${result.totalParents}
Statements Generated: ${result.generatedCount}
Statements Finalized: ${result.finalizedCount}
Statements Delivered: ${result.deliveredCount}
Skipped (no activity/balance): ${result.skippedCount}
Errors: ${result.errorCount}
Duration: ${(result.durationMs / 1000).toFixed(1)}s

${
  hasErrors
    ? `
Errors:
${result.errors
  .slice(0, 10)
  .map((e) => `- Parent ${e.parentId}: ${e.error}`)
  .join('\n')}
${result.errors.length > 10 ? `... and ${result.errors.length - 10} more errors` : ''}
`
    : ''
}
---
This is an automated notification from CrecheBooks.
    `.trim();

    // Log notification (integrates with notification system if needed)
    this.logger.log({
      message: 'Admin notification prepared',
      tenantId,
      recipientEmail: tenant.email,
      subject,
      bodyPreview: body.substring(0, 200) + '...',
    });
  }
}
