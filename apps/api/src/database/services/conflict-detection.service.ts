/**
 * ConflictDetectionService
 * TASK-XERO-001
 *
 * Detects sync conflicts between local data and Xero data.
 * Compares modification timestamps and data changes to identify conflicts.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictType,
  ConflictDetectionResult,
} from '../entities/sync-conflict.entity';

@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Detect conflicts between local and Xero data
   * Checks if both sides have been modified since last sync
   */
  async detectConflicts(
    tenantId: string,
    entityType: string,
    entityId: string,
    localData: Record<string, unknown>,
    xeroData: Record<string, unknown>,
    lastSyncedAt?: Date,
  ): Promise<ConflictDetectionResult> {
    this.logger.debug(
      `Detecting conflicts for ${entityType} ${entityId} (tenant: ${tenantId})`,
    );

    // Extract modification timestamps
    const localModifiedAt = this.extractTimestamp(
      localData,
      'updatedAt',
      'modifiedAt',
    );
    const xeroModifiedAt = this.extractTimestamp(
      xeroData,
      'UpdatedDateUTC',
      'DateTimeUTC',
    );

    if (!localModifiedAt || !xeroModifiedAt) {
      this.logger.warn(
        `Missing timestamps for ${entityType} ${entityId} - cannot detect conflicts`,
      );
      return {
        hasConflict: false,
        message: 'Missing modification timestamps',
      };
    }

    // If no last sync, treat as first sync (no conflict)
    if (!lastSyncedAt) {
      return {
        hasConflict: false,
        message: 'First sync - no conflict possible',
      };
    }

    // Check if both modified since last sync (UPDATE_UPDATE conflict)
    const localModifiedSinceSync = localModifiedAt > lastSyncedAt;
    const xeroModifiedSinceSync = xeroModifiedAt > lastSyncedAt;

    if (localModifiedSinceSync && xeroModifiedSinceSync) {
      const conflictingFields = await this.getConflictingFields(
        localData,
        xeroData,
      );

      return {
        hasConflict: true,
        conflictType: ConflictType.UPDATE_UPDATE,
        conflictingFields,
        message: `Both local and Xero versions modified since last sync (${lastSyncedAt.toISOString()})`,
      };
    }

    // Check for DELETE_UPDATE conflicts
    const isDeletedLocally = localData.isDeleted === true;
    const isDeletedInXero =
      xeroData.Status === 'DELETED' || xeroData.Status === 'VOIDED';

    if (isDeletedLocally && xeroModifiedSinceSync && !isDeletedInXero) {
      return {
        hasConflict: true,
        conflictType: ConflictType.DELETE_UPDATE,
        message: 'Deleted locally but updated in Xero',
      };
    }

    if (isDeletedInXero && localModifiedSinceSync && !isDeletedLocally) {
      return {
        hasConflict: true,
        conflictType: ConflictType.DELETE_UPDATE,
        message: 'Deleted in Xero but updated locally',
      };
    }

    // No conflict detected
    return {
      hasConflict: false,
      message: 'No conflict - only one side modified',
    };
  }

  /**
   * Check if entity has been modified since last sync
   */
  async hasModifications(
    entityData: Record<string, unknown>,
    lastSyncedAt?: Date,
  ): Promise<boolean> {
    if (!lastSyncedAt) {
      return true; // No previous sync, treat as modified
    }

    const modifiedAt = this.extractTimestamp(
      entityData,
      'updatedAt',
      'modifiedAt',
      'UpdatedDateUTC',
    );

    if (!modifiedAt) {
      this.logger.warn(
        'Cannot determine modification status - missing timestamp',
      );
      return false;
    }

    return modifiedAt > lastSyncedAt;
  }

  /**
   * Get list of fields that differ between local and Xero data
   */
  async getConflictingFields(
    localData: Record<string, unknown>,
    xeroData: Record<string, unknown>,
  ): Promise<string[]> {
    const conflictingFields: string[] = [];

    // Field mapping: local field -> Xero field
    const fieldMappings: Record<string, string> = {
      description: 'Description',
      amountCents: 'Total',
      accountCode: 'AccountCode',
      status: 'Status',
      dueDate: 'DueDate',
      invoiceNumber: 'InvoiceNumber',
      reference: 'Reference',
    };

    for (const [localField, xeroField] of Object.entries(fieldMappings)) {
      const localValue = localData[localField];
      const xeroValue = xeroData[xeroField];

      // Special handling for amount (local is in cents, Xero is in dollars)
      if (localField === 'amountCents' && typeof localValue === 'number') {
        const localDollars = localValue / 100;
        if (Math.abs(localDollars - (xeroValue as number)) > 0.01) {
          conflictingFields.push(localField);
        }
        continue;
      }

      // Special handling for dates
      if (
        localField.includes('Date') &&
        localValue instanceof Date &&
        typeof xeroValue === 'string'
      ) {
        const xeroDate = new Date(xeroValue);
        if (localValue.getTime() !== xeroDate.getTime()) {
          conflictingFields.push(localField);
        }
        continue;
      }

      // General comparison
      if (localValue !== xeroValue) {
        conflictingFields.push(localField);
      }
    }

    return conflictingFields;
  }

  /**
   * Create conflict record in database
   */
  async createConflictRecord(
    tenantId: string,
    entityType: string,
    entityId: string,
    conflictType: ConflictType,
    localData: Record<string, unknown>,
    xeroData: Record<string, unknown>,
    localModifiedAt: Date,
    xeroModifiedAt: Date,
  ): Promise<string> {
    const conflict = await this.prisma.syncConflict.create({
      data: {
        tenantId,
        entityType,
        entityId,
        conflictType,
        localData: localData as any,
        xeroData: xeroData as any,
        localModifiedAt,
        xeroModifiedAt,
      },
    });

    this.logger.log(
      `Created conflict record ${conflict.id} for ${entityType} ${entityId}`,
    );

    return conflict.id;
  }

  /**
   * Extract timestamp from entity data
   * Tries multiple field names to find a valid timestamp
   */
  private extractTimestamp(
    data: Record<string, unknown>,
    ...fieldNames: string[]
  ): Date | null {
    for (const fieldName of fieldNames) {
      const value = data[fieldName];

      if (value instanceof Date) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    return null;
  }
}
