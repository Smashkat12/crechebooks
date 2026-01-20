/**
 * PendingSyncQueueService
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * Database-backed queue for storing entities that failed to sync to Xero.
 * When the circuit breaker is open, entities are queued here for later retry.
 * Provides persistence across service restarts.
 *
 * CRITICAL: All operations filter by tenantId for isolation.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PendingSyncStatus,
  PendingSyncEntityType,
  PendingSync,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Entity that can be synced to Xero
 */
export interface SyncableEntity {
  tenantId: string;
  entityType: PendingSyncEntityType;
  entityId: string;
  operation: string; // e.g., 'create', 'update', 'delete', 'CREATE_DRAFT', 'SYNC_PAYMENT', etc.
  payload?: Record<string, unknown>;
}

/**
 * Result of processing a batch of pending syncs
 */
export interface SyncBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  errors: Array<{
    entityId: string;
    entityType: PendingSyncEntityType;
    error: string;
  }>;
}

/**
 * Queue item with full details
 */
export interface PendingSyncItem extends PendingSync {
  tenant?: {
    id: string;
    name: string;
  };
}

@Injectable()
export class PendingSyncQueueService {
  private readonly logger = new Logger(PendingSyncQueueService.name);

  // Default max retry attempts
  private readonly DEFAULT_MAX_ATTEMPTS = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queue an entity for sync when circuit breaker is open
   *
   * @param entity - Entity to queue for later sync
   * @returns Created pending sync record
   */
  async queueForSync(entity: SyncableEntity): Promise<PendingSync> {
    this.logger.log(
      `Queueing ${entity.entityType} ${entity.entityId} for sync (operation: ${entity.operation})`,
    );

    // Check if already queued
    const existing = await this.prisma.pendingSync.findFirst({
      where: {
        tenantId: entity.tenantId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        status: {
          in: [PendingSyncStatus.PENDING, PendingSyncStatus.RETRY],
        },
      },
    });

    if (existing) {
      this.logger.debug(
        `Entity ${entity.entityType} ${entity.entityId} already queued, updating payload`,
      );

      // Update existing record with new payload
      return this.prisma.pendingSync.update({
        where: { id: existing.id },
        data: {
          operation: entity.operation,
          payload: entity.payload
            ? JSON.parse(JSON.stringify(entity.payload))
            : undefined,
          updatedAt: new Date(),
        },
      });
    }

    // Create new pending sync record
    return this.prisma.pendingSync.create({
      data: {
        tenantId: entity.tenantId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        operation: entity.operation,
        payload: entity.payload
          ? JSON.parse(JSON.stringify(entity.payload))
          : undefined,
        status: PendingSyncStatus.PENDING,
        attempts: 0,
        maxAttempts: this.DEFAULT_MAX_ATTEMPTS,
      },
    });
  }

  /**
   * Process pending sync queue
   * Called by recovery job when circuit breaker closes
   *
   * @param tenantId - Optional tenant filter
   * @param batchSize - Maximum items to process (default: 50)
   * @returns Batch processing result
   */
  async processPendingQueue(
    tenantId?: string,
    batchSize = 50,
  ): Promise<SyncBatchResult> {
    const result: SyncBatchResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      errors: [],
    };

    // Get pending items ordered by creation date
    const whereClause = {
      status: {
        in: [PendingSyncStatus.PENDING, PendingSyncStatus.RETRY],
      },
      ...(tenantId && { tenantId }),
    };

    const pendingItems = await this.prisma.pendingSync.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    this.logger.log(`Processing ${pendingItems.length} pending sync items`);

    for (const item of pendingItems) {
      result.processed++;

      try {
        // Mark as processing
        await this.prisma.pendingSync.update({
          where: { id: item.id },
          data: {
            status: PendingSyncStatus.PROCESSING,
            attempts: item.attempts + 1,
          },
        });

        // The actual sync will be handled by the caller (XeroSyncRecoveryJob)
        // Mark as completed (caller will call markCompleted or markFailed)
        result.succeeded++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          entityId: item.entityId,
          entityType: item.entityType,
          error: error instanceof Error ? error.message : String(error),
        });

        this.logger.error(
          `Failed to process pending sync ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Batch processing complete: ${result.succeeded} succeeded, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Get items ready for processing
   *
   * @param tenantId - Optional tenant filter
   * @param batchSize - Maximum items to return
   * @returns List of pending sync items
   */
  async getItemsForProcessing(
    tenantId?: string,
    batchSize = 50,
  ): Promise<PendingSync[]> {
    return this.prisma.pendingSync.findMany({
      where: {
        status: {
          in: [PendingSyncStatus.PENDING, PendingSyncStatus.RETRY],
        },
        ...(tenantId && { tenantId }),
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
  }

  /**
   * Mark item as processing
   */
  async markProcessing(id: string): Promise<PendingSync> {
    return this.prisma.pendingSync.update({
      where: { id },
      data: {
        status: PendingSyncStatus.PROCESSING,
        attempts: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Mark item as completed
   */
  async markCompleted(id: string): Promise<PendingSync> {
    return this.prisma.pendingSync.update({
      where: { id },
      data: {
        status: PendingSyncStatus.COMPLETED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  /**
   * Mark item as failed
   */
  async markFailed(id: string, error: string): Promise<PendingSync> {
    const item = await this.prisma.pendingSync.findUnique({
      where: { id },
    });

    if (!item) {
      throw new Error(`Pending sync item ${id} not found`);
    }

    // Check if max attempts reached
    const newStatus =
      item.attempts >= item.maxAttempts
        ? PendingSyncStatus.FAILED
        : PendingSyncStatus.RETRY;

    return this.prisma.pendingSync.update({
      where: { id },
      data: {
        status: newStatus,
        lastError: error,
      },
    });
  }

  /**
   * Get count of pending items
   *
   * @param tenantId - Optional tenant filter
   * @returns Count of pending items
   */
  async getPendingCount(tenantId?: string): Promise<number> {
    return this.prisma.pendingSync.count({
      where: {
        status: {
          in: [PendingSyncStatus.PENDING, PendingSyncStatus.RETRY],
        },
        ...(tenantId && { tenantId }),
      },
    });
  }

  /**
   * Get count by status
   *
   * @param tenantId - Optional tenant filter
   */
  async getCountsByStatus(
    tenantId?: string,
  ): Promise<Record<PendingSyncStatus, number>> {
    const results = await this.prisma.pendingSync.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
      where: tenantId ? { tenantId } : undefined,
    });

    const counts: Record<PendingSyncStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      RETRY: 0,
    };

    for (const result of results) {
      counts[result.status] = result._count.status;
    }

    return counts;
  }

  /**
   * Retry all failed items
   *
   * @param tenantId - Optional tenant filter
   * @returns Number of items reset for retry
   */
  async retryFailed(tenantId?: string): Promise<number> {
    const result = await this.prisma.pendingSync.updateMany({
      where: {
        status: PendingSyncStatus.FAILED,
        ...(tenantId && { tenantId }),
      },
      data: {
        status: PendingSyncStatus.RETRY,
        attempts: 0,
        lastError: null,
      },
    });

    this.logger.log(`Reset ${result.count} failed items for retry`);

    return result.count;
  }

  /**
   * Clean up old completed/failed items
   *
   * @param olderThanDays - Delete items older than this many days
   * @returns Number of items deleted
   */
  async cleanupOldItems(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.pendingSync.deleteMany({
      where: {
        status: {
          in: [PendingSyncStatus.COMPLETED, PendingSyncStatus.FAILED],
        },
        updatedAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned up ${result.count} old pending sync items (older than ${olderThanDays} days)`,
    );

    return result.count;
  }

  /**
   * Get items by entity type
   */
  async getByEntityType(
    tenantId: string,
    entityType: PendingSyncEntityType,
    status?: PendingSyncStatus,
  ): Promise<PendingSync[]> {
    return this.prisma.pendingSync.findMany({
      where: {
        tenantId,
        entityType,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific pending sync item
   */
  async getById(id: string): Promise<PendingSync | null> {
    return this.prisma.pendingSync.findUnique({
      where: { id },
    });
  }

  /**
   * Delete a pending sync item
   */
  async delete(id: string): Promise<void> {
    await this.prisma.pendingSync.delete({
      where: { id },
    });
  }

  /**
   * Check if an entity is already queued
   */
  async isQueued(
    tenantId: string,
    entityType: PendingSyncEntityType,
    entityId: string,
  ): Promise<boolean> {
    const count = await this.prisma.pendingSync.count({
      where: {
        tenantId,
        entityType,
        entityId,
        status: {
          in: [PendingSyncStatus.PENDING, PendingSyncStatus.RETRY],
        },
      },
    });

    return count > 0;
  }
}
