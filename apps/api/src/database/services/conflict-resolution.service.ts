/**
 * ConflictResolutionService
 * TASK-XERO-001
 *
 * Resolves sync conflicts using various strategies.
 * Supports auto-resolution and manual resolution workflows.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from '../entities/audit-log.entity';
import {
  ConflictStatus,
  ResolutionStrategy,
  ConflictResolutionResult,
} from '../entities/sync-conflict.entity';
import { BusinessException, NotFoundException } from '../../shared/exceptions';

@Injectable()
export class ConflictResolutionService {
  private readonly logger = new Logger(ConflictResolutionService.name);
  private readonly CONFLICT_AGE_LIMIT_DAYS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Resolve a conflict using the specified strategy
   * Updates the conflict record and returns the winning data
   */
  async resolveConflict(
    conflictId: string,
    strategy: ResolutionStrategy,
    resolvedBy: string,
  ): Promise<ConflictResolutionResult> {
    this.logger.log(`Resolving conflict ${conflictId} with strategy: ${strategy}`);

    // Load conflict
    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new NotFoundException('SyncConflict', conflictId);
    }

    if (conflict.status !== 'PENDING') {
      throw new BusinessException(
        `Conflict ${conflictId} has already been resolved`,
        'CONFLICT_ALREADY_RESOLVED',
      );
    }

    // Check conflict age
    const ageInDays = this.getConflictAgeInDays(conflict.createdAt);
    if (ageInDays > this.CONFLICT_AGE_LIMIT_DAYS) {
      this.logger.warn(
        `Conflict ${conflictId} is ${ageInDays} days old (limit: ${this.CONFLICT_AGE_LIMIT_DAYS})`,
      );
    }

    // Apply resolution strategy
    const result = this.applyStrategy(
      strategy,
      conflict.localData as Record<string, unknown>,
      conflict.xeroData as Record<string, unknown>,
      conflict.localModifiedAt,
      conflict.xeroModifiedAt,
    );

    // Update conflict record
    await this.prisma.syncConflict.update({
      where: { id: conflictId },
      data: {
        status:
          strategy === 'manual'
            ? ConflictStatus.MANUALLY_RESOLVED
            : ConflictStatus.AUTO_RESOLVED,
        resolvedBy,
        resolution: strategy,
        resolvedAt: new Date(),
      },
    });

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId: conflict.tenantId,
      entityType: 'SyncConflict',
      entityId: conflictId,
      action: AuditAction.UPDATE,
      beforeValue: {
        status: conflict.status,
      },
      afterValue: {
        status: strategy === 'manual' ? 'MANUALLY_RESOLVED' : 'AUTO_RESOLVED',
        resolvedBy,
        resolution: strategy,
        resolvedAt: new Date().toISOString(),
      },
      changeSummary: `Resolved sync conflict using ${strategy} strategy`,
    });

    this.logger.log(
      `Conflict ${conflictId} resolved successfully using ${strategy}`,
    );

    return result;
  }

  /**
   * Attempt to auto-resolve a conflict using default strategy
   * Returns true if auto-resolved, false if manual resolution needed
   */
  async autoResolve(
    conflictId: string,
    defaultStrategy: ResolutionStrategy = 'last_modified_wins',
  ): Promise<boolean> {
    this.logger.debug(
      `Attempting auto-resolution for conflict ${conflictId} with strategy: ${defaultStrategy}`,
    );

    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new NotFoundException('SyncConflict', conflictId);
    }

    // Auto-resolve only if safe (non-destructive)
    const canAutoResolve =
      defaultStrategy === 'last_modified_wins' ||
      defaultStrategy === 'local_wins' ||
      defaultStrategy === 'xero_wins';

    if (!canAutoResolve) {
      this.logger.debug(
        `Cannot auto-resolve with strategy: ${defaultStrategy} - queuing for manual resolution`,
      );
      return false;
    }

    try {
      // Use system user for auto-resolution
      await this.resolveConflict(conflictId, defaultStrategy, 'system');
      return true;
    } catch (error) {
      this.logger.error(
        `Auto-resolution failed for conflict ${conflictId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * Queue conflict for manual resolution
   * Ensures it stays in PENDING status for user review
   */
  async queueForManualResolution(conflictId: string): Promise<void> {
    this.logger.log(`Queueing conflict ${conflictId} for manual resolution`);

    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new NotFoundException('SyncConflict', conflictId);
    }

    // Already pending - nothing to do
    if (conflict.status === 'PENDING') {
      return;
    }

    // Reset to pending if it was previously resolved
    await this.prisma.syncConflict.update({
      where: { id: conflictId },
      data: {
        status: ConflictStatus.PENDING,
        resolvedBy: null,
        resolution: null,
        resolvedAt: null,
      },
    });
  }

  /**
   * Get all pending conflicts for a tenant
   * Sorted by age (oldest first)
   */
  async getPendingConflicts(tenantId: string): Promise<
    Array<{
      id: string;
      entityType: string;
      entityId: string;
      conflictType: string;
      createdAt: Date;
      ageInDays: number;
    }>
  > {
    const conflicts = await this.prisma.syncConflict.findMany({
      where: {
        tenantId,
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        conflictType: true,
        createdAt: true,
      },
    });

    return conflicts.map((c) => ({
      ...c,
      ageInDays: this.getConflictAgeInDays(c.createdAt),
    }));
  }

  /**
   * Apply resolution and update entity with winning data
   * This would be called by XeroSyncService after resolveConflict
   */
  async applyResolution(
    conflictId: string,
    winnerData: Record<string, unknown>,
  ): Promise<void> {
    const conflict = await this.prisma.syncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new NotFoundException('SyncConflict', conflictId);
    }

    if (conflict.status === 'PENDING') {
      throw new BusinessException(
        'Cannot apply resolution - conflict not yet resolved',
        'CONFLICT_NOT_RESOLVED',
      );
    }

    this.logger.log(
      `Applying resolution for ${conflict.entityType} ${conflict.entityId}`,
    );

    // The actual update would be handled by XeroSyncService
    // This method is primarily for audit/logging purposes
    await this.auditLogService.logAction({
      tenantId: conflict.tenantId,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      action: AuditAction.UPDATE,
      afterValue: winnerData as any,
      changeSummary: `Applied conflict resolution: ${conflict.resolution}`,
    });
  }

  /**
   * Apply resolution strategy to determine winner
   */
  private applyStrategy(
    strategy: ResolutionStrategy,
    localData: Record<string, unknown>,
    xeroData: Record<string, unknown>,
    localModifiedAt: Date,
    xeroModifiedAt: Date,
  ): ConflictResolutionResult {
    let winnerData: Record<string, unknown>;
    let message: string;

    switch (strategy) {
      case 'local_wins':
        winnerData = localData;
        message = 'Local version selected (local_wins strategy)';
        break;

      case 'xero_wins':
        winnerData = xeroData;
        message = 'Xero version selected (xero_wins strategy)';
        break;

      case 'last_modified_wins':
        if (localModifiedAt >= xeroModifiedAt) {
          winnerData = localData;
          message = `Local version selected (modified at ${localModifiedAt.toISOString()})`;
        } else {
          winnerData = xeroData;
          message = `Xero version selected (modified at ${xeroModifiedAt.toISOString()})`;
        }
        break;

      case 'manual':
        // For manual resolution, we'd need user input
        // This is a placeholder - in reality, the UI would provide the merged data
        winnerData = localData; // Default to local for safety
        message = 'Manual resolution required - defaulting to local version';
        break;

      default:
        throw new BusinessException(
          `Unknown resolution strategy: ${strategy}`,
          'INVALID_STRATEGY',
        );
    }

    return {
      success: true,
      winnerData,
      appliedStrategy: strategy,
      message,
    };
  }

  /**
   * Calculate conflict age in days
   */
  private getConflictAgeInDays(createdAt: Date): number {
    const now = new Date();
    const ageInMs = now.getTime() - createdAt.getTime();
    return Math.floor(ageInMs / (1000 * 60 * 60 * 24));
  }
}
