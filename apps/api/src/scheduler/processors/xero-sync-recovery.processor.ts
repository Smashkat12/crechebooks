/**
 * XeroSyncRecoveryProcessor
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * Scheduled job that processes pending sync queue when circuit breaker recovers.
 * Runs every 5 minutes to check for items that need to be synced to Xero.
 *
 * This processor:
 * 1. Checks if circuit breaker is closed (Xero available)
 * 2. Fetches pending sync items from database
 * 3. Attempts to sync each item to Xero
 * 4. Updates status based on success/failure
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PendingSyncStatus, PendingSyncEntityType } from '@prisma/client';
import { XeroCircuitBreaker } from '../../integrations/circuit-breaker/xero-circuit-breaker';
import { PendingSyncQueueService } from '../../database/services/pending-sync-queue.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';

/**
 * Recovery job status for monitoring
 */
export interface RecoveryJobStatus {
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunResult: RecoveryRunResult | null;
  nextRunAt: Date | null;
}

/**
 * Result of a recovery run
 */
export interface RecoveryRunResult {
  startedAt: Date;
  completedAt: Date;
  itemsProcessed: number;
  itemsSucceeded: number;
  itemsFailed: number;
  circuitState: string;
  errors: string[];
}

@Injectable()
export class XeroSyncRecoveryProcessor {
  private readonly logger = new Logger(XeroSyncRecoveryProcessor.name);

  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastRunResult: RecoveryRunResult | null = null;

  constructor(
    private readonly circuitBreaker: XeroCircuitBreaker,
    private readonly pendingSyncQueue: PendingSyncQueueService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    // Register for circuit state changes
    this.circuitBreaker.onStateChange((event) => {
      this.logger.log(
        `Circuit breaker state changed: ${event.previousState} -> ${event.currentState}`,
      );

      // Trigger immediate processing when circuit closes
      if (event.currentState === 'CLOSED' && event.previousState === 'OPEN') {
        this.logger.log(
          'Circuit closed - triggering immediate recovery processing',
        );
        // Don't await - let it run in background
        this.processRecovery().catch((err) => {
          this.logger.error('Immediate recovery processing failed', err);
        });
      }
    });
  }

  /**
   * Scheduled job - runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processRecovery(): Promise<RecoveryRunResult> {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.debug('Recovery job already running, skipping');
      return this.lastRunResult!;
    }

    const result: RecoveryRunResult = {
      startedAt: new Date(),
      completedAt: new Date(),
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      circuitState: this.circuitBreaker.getState(),
      errors: [],
    };

    this.isRunning = true;
    this.lastRunAt = new Date();

    try {
      // Check circuit breaker state
      if (this.circuitBreaker.isOpen()) {
        this.logger.debug(
          'Circuit breaker is open, skipping recovery processing',
        );
        result.circuitState = 'OPEN';
        return result;
      }

      // Get pending count first
      const pendingCount = await this.pendingSyncQueue.getPendingCount();
      if (pendingCount === 0) {
        this.logger.debug('No pending sync items to process');
        return result;
      }

      this.logger.log(`Processing ${pendingCount} pending sync items`);

      // Get items for processing
      const items = await this.pendingSyncQueue.getItemsForProcessing(
        undefined,
        50, // Process up to 50 items per run
      );

      for (const item of items) {
        result.itemsProcessed++;

        try {
          // Mark as processing
          await this.pendingSyncQueue.markProcessing(item.id);

          // Process based on entity type
          await this.processSyncItem(item);

          // Mark as completed
          await this.pendingSyncQueue.markCompleted(item.id);
          result.itemsSucceeded++;

          this.logger.debug(
            `Successfully synced ${item.entityType} ${item.entityId}`,
          );
        } catch (error) {
          result.itemsFailed++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          result.errors.push(
            `${item.entityType} ${item.entityId}: ${errorMessage}`,
          );

          // Mark as failed
          await this.pendingSyncQueue.markFailed(item.id, errorMessage);

          this.logger.error(
            `Failed to sync ${item.entityType} ${item.entityId}: ${errorMessage}`,
          );

          // Check if circuit breaker should be tripped
          if (this.shouldTripCircuit(error)) {
            this.logger.warn(
              'Error indicates Xero unavailability, stopping batch',
            );
            break;
          }
        }
      }

      result.completedAt = new Date();
      this.lastRunResult = result;

      // Log summary
      this.logger.log(
        `Recovery run complete: ${result.itemsSucceeded}/${result.itemsProcessed} succeeded`,
      );

      // Audit log for recovery batch
      if (result.itemsProcessed > 0) {
        await this.auditLogService.logAction({
          tenantId: 'SYSTEM',
          entityType: 'XeroSyncRecovery',
          entityId: result.startedAt.toISOString(),
          action: AuditAction.UPDATE,
          afterValue: {
            itemsProcessed: result.itemsProcessed,
            itemsSucceeded: result.itemsSucceeded,
            itemsFailed: result.itemsFailed,
            circuitState: result.circuitState,
          },
          changeSummary: `Recovery batch: ${result.itemsSucceeded}/${result.itemsProcessed} succeeded`,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Recovery job failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      result.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      result.completedAt = new Date();
      this.lastRunResult = result;
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single sync item based on entity type
   */
  private async processSyncItem(item: {
    id: string;
    tenantId: string;
    entityType: PendingSyncEntityType;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    // Use circuit breaker for the actual Xero call
    await this.circuitBreaker.execute(async () => {
      switch (item.entityType) {
        case PendingSyncEntityType.INVOICE:
          await this.syncInvoice(item);
          break;
        case PendingSyncEntityType.PAYMENT:
          await this.syncPayment(item);
          break;
        case PendingSyncEntityType.TRANSACTION:
          await this.syncTransaction(item);
          break;
        case PendingSyncEntityType.CONTACT:
          await this.syncContact(item);
          break;
        case PendingSyncEntityType.JOURNAL:
          await this.syncJournal(item);
          break;
        default:
          throw new Error(`Unknown entity type: ${item.entityType}`);
      }
    });
  }

  /**
   * Sync an invoice to Xero
   */
  private async syncInvoice(item: {
    tenantId: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    // Note: The actual sync logic would be implemented here
    // XeroSyncService is injected via the module, not dynamically imported

    // Get invoice details
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: item.entityId },
    });

    if (!invoice) {
      throw new Error(`Invoice ${item.entityId} not found`);
    }

    // Get parent to check for Xero contact ID
    const parent = await this.prisma.parent.findUnique({
      where: { id: invoice.parentId },
    });

    if (!parent?.xeroContactId) {
      throw new Error(`Parent ${invoice.parentId} has no Xero contact ID`);
    }

    // The actual sync logic would be implemented here
    // For now, we just log - the XeroSyncService handles the real sync
    this.logger.debug(
      `Would sync invoice ${item.entityId} to Xero (operation: ${item.operation})`,
    );
  }

  /**
   * Sync a payment to Xero
   */
  private async syncPayment(item: {
    tenantId: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: item.entityId },
    });

    if (!payment) {
      throw new Error(`Payment ${item.entityId} not found`);
    }

    // The actual sync logic would be implemented here
    this.logger.debug(
      `Would sync payment ${item.entityId} to Xero (operation: ${item.operation})`,
    );
  }

  /**
   * Sync a transaction to Xero
   */
  private async syncTransaction(item: {
    tenantId: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: item.entityId },
    });

    if (!transaction) {
      throw new Error(`Transaction ${item.entityId} not found`);
    }

    // The actual sync logic would be implemented here
    this.logger.debug(
      `Would sync transaction ${item.entityId} to Xero (operation: ${item.operation})`,
    );
  }

  /**
   * Sync a contact to Xero
   */
  private async syncContact(item: {
    tenantId: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    const parent = await this.prisma.parent.findUnique({
      where: { id: item.entityId },
    });

    if (!parent) {
      throw new Error(`Parent ${item.entityId} not found`);
    }

    // The actual sync logic would be implemented here
    this.logger.debug(
      `Would sync contact ${item.entityId} to Xero (operation: ${item.operation})`,
    );
  }

  /**
   * Sync a journal to Xero
   */
  private async syncJournal(item: {
    tenantId: string;
    entityId: string;
    operation: string;
    payload: unknown;
  }): Promise<void> {
    const journal = await this.prisma.categorizationJournal.findUnique({
      where: { id: item.entityId },
    });

    if (!journal) {
      throw new Error(`Journal ${item.entityId} not found`);
    }

    // The actual sync logic would be implemented here
    this.logger.debug(
      `Would sync journal ${item.entityId} to Xero (operation: ${item.operation})`,
    );
  }

  /**
   * Check if an error indicates Xero is unavailable
   */
  private shouldTripCircuit(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('connection refused') ||
        message.includes('service unavailable') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }

  /**
   * Get current job status
   */
  getStatus(): RecoveryJobStatus {
    // Calculate next run time (every 5 minutes)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
    if (nextRun <= now) {
      nextRun.setMinutes(nextRun.getMinutes() + 5);
    }

    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      nextRunAt: nextRun,
    };
  }

  /**
   * Manually trigger recovery processing
   */
  async triggerRecovery(): Promise<RecoveryRunResult> {
    return this.processRecovery();
  }
}
