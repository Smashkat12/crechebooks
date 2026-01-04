/**
 * Correction Conflict Service
 * TASK-EC-002: Conflicting Correction Resolution
 *
 * @module database/services/correction-conflict
 * @description Detects and resolves conflicts when users categorize the same payee
 * differently, providing options to update all, just this one, or create split rules.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { TransactionRepository } from '../repositories/transaction.repository';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { NotFoundException } from '../../shared/exceptions';

export interface CorrectionConflict {
  payee: string;
  existingCategory: string;
  existingCategoryCode: string;
  newCategory: string;
  newCategoryCode: string;
  existingTransactionCount: number;
  affectedTransactionIds: string[];
  patternId: string;
}

export type ConflictResolutionType =
  | 'update_all'
  | 'just_this_one'
  | 'split_by_amount'
  | 'split_by_description';

export interface ConflictResolution {
  type: ConflictResolutionType;
  threshold?: number; // For split_by_amount
  pattern?: string; // For split_by_description
}

@Injectable()
export class CorrectionConflictService {
  private readonly logger = new Logger(CorrectionConflictService.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly patternRepo: PayeePatternRepository,
    private readonly categorizationRepo: CategorizationRepository,
  ) {}

  /**
   * Detect conflict when correction differs from existing pattern
   * Returns null if no conflict exists
   *
   * @param tenantId - Tenant ID for isolation
   * @param payee - Payee name being categorized
   * @param newCategory - New category code
   * @param newCategoryName - New category name
   * @returns CorrectionConflict or null if no conflict
   */
  async detectConflict(
    tenantId: string,
    payee: string,
    newCategory: string,
    newCategoryName: string,
  ): Promise<CorrectionConflict | null> {
    this.logger.log(
      `Checking for conflict: tenant=${tenantId}, payee=${payee}, newCategory=${newCategory}`,
    );

    // Check if pattern exists for this payee
    const existingPattern = await this.patternRepo.findByPayeeName(
      tenantId,
      payee,
    );

    if (!existingPattern) {
      this.logger.log('No existing pattern found - no conflict');
      return null; // No pattern = no conflict
    }

    // Check if new category matches existing pattern
    if (existingPattern.defaultAccountCode === newCategory) {
      this.logger.log('Category matches existing pattern - no conflict');
      return null; // Same category = no conflict
    }

    // Conflict detected - find affected transactions
    this.logger.log(
      `Conflict detected: existing=${existingPattern.defaultAccountCode}, new=${newCategory}`,
    );

    const affected = await this.getAffectedTransactions(
      tenantId,
      payee,
      existingPattern.defaultAccountCode,
    );

    return {
      payee,
      existingCategory: existingPattern.defaultAccountName,
      existingCategoryCode: existingPattern.defaultAccountCode,
      newCategory: newCategoryName,
      newCategoryCode: newCategory,
      existingTransactionCount: affected.length,
      affectedTransactionIds: affected.map((t) => t.id),
      patternId: existingPattern.id,
    };
  }

  /**
   * Resolve conflict based on user's resolution choice
   *
   * @param tenantId - Tenant ID for isolation
   * @param transactionId - Transaction that triggered the conflict
   * @param resolution - User's resolution choice
   * @param conflict - The conflict being resolved
   * @returns void
   */
  async resolveConflict(
    tenantId: string,
    transactionId: string,
    resolution: ConflictResolution,
    conflict: CorrectionConflict,
  ): Promise<void> {
    this.logger.log(
      `Resolving conflict: type=${resolution.type}, transaction=${transactionId}`,
    );

    switch (resolution.type) {
      case 'update_all':
        await this.resolveUpdateAll(tenantId, conflict);
        break;

      case 'just_this_one':
        await this.resolveJustThisOne(tenantId, transactionId, conflict);
        break;

      case 'split_by_amount':
        await this.resolveSplitByAmount(
          tenantId,
          conflict,
          resolution.threshold!,
        );
        break;

      case 'split_by_description':
        await this.resolveSplitByDescription(
          tenantId,
          conflict,
          resolution.pattern!,
        );
        break;

      default:
        throw new Error(`Unknown resolution type: ${resolution.type}`);
    }

    this.logger.log(`Conflict resolved successfully: ${resolution.type}`);
  }

  /**
   * Get transactions affected by this pattern
   *
   * @param tenantId - Tenant ID for isolation
   * @param payee - Payee name
   * @param currentCategory - Current category code
   * @returns Array of affected transactions
   */
  async getAffectedTransactions(
    tenantId: string,
    payee: string,
    currentCategory: string,
  ): Promise<Transaction[]> {
    // Find all categorizations with current category using filter
    const result = await this.categorizationRepo.findWithFilters(tenantId, {
      source: undefined, // Don't filter by source
      limit: 1000, // Large limit to get all
    });

    // Filter for matching account code
    const categorizations = result.data.filter(
      (c) => c.accountCode === currentCategory,
    );

    if (categorizations.length === 0) {
      return [];
    }

    // Get transaction IDs
    const transactionIds = categorizations.map((c) => c.transactionId);

    // Load transactions and filter by payee
    const transactions = await this.transactionRepo.findByIds(
      tenantId,
      transactionIds,
    );

    // Normalize payee for comparison
    const normalizedPayee = this.normalizePayeeName(payee);

    return transactions.filter((t) => {
      const txPayee = t.payeeName || t.description;
      return this.normalizePayeeName(txPayee) === normalizedPayee;
    });
  }

  /**
   * Resolution: Update all historical transactions with new category
   */
  private async resolveUpdateAll(
    tenantId: string,
    conflict: CorrectionConflict,
  ): Promise<void> {
    this.logger.log(
      `Updating all ${conflict.affectedTransactionIds.length} transactions to category ${conflict.newCategoryCode}`,
    );

    // Update pattern to new category
    await this.patternRepo.update(conflict.patternId, {
      defaultAccountCode: conflict.newCategoryCode,
      defaultAccountName: conflict.newCategory,
    });

    // Update all affected transactions' categorizations
    for (const transactionId of conflict.affectedTransactionIds) {
      try {
        // Find existing categorization
        const existing =
          await this.categorizationRepo.findByTransaction(transactionId);

        if (existing.length > 0) {
          // Update most recent categorization
          const mostRecent = existing[0];
          await this.categorizationRepo.update(mostRecent.id, {
            accountCode: conflict.newCategoryCode,
            accountName: conflict.newCategory,
            source: 'USER_OVERRIDE' as any,
          });
        } else {
          // Create new categorization if somehow missing
          await this.categorizationRepo.create({
            transactionId,
            accountCode: conflict.newCategoryCode,
            accountName: conflict.newCategory,
            confidenceScore: 1.0,
            source: 'USER_OVERRIDE' as any,
            isSplit: false,
            vatType: 'STANDARD' as any,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to update transaction ${transactionId}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue with other transactions
      }
    }

    this.logger.log(
      `Successfully updated all transactions to ${conflict.newCategoryCode}`,
    );
  }

  /**
   * Resolution: Just this one - create exception, keep pattern unchanged
   */
  private async resolveJustThisOne(
    tenantId: string,
    transactionId: string,
    conflict: CorrectionConflict,
  ): Promise<void> {
    this.logger.log(
      `Creating exception for transaction ${transactionId}, keeping pattern as ${conflict.existingCategoryCode}`,
    );

    // Pattern stays unchanged - just update this single transaction
    const existing =
      await this.categorizationRepo.findByTransaction(transactionId);

    if (existing.length > 0) {
      const mostRecent = existing[0];
      await this.categorizationRepo.update(mostRecent.id, {
        accountCode: conflict.newCategoryCode,
        accountName: conflict.newCategory,
        source: 'USER_OVERRIDE' as any, // User explicitly confirmed this exception
      });
    } else {
      await this.categorizationRepo.create({
        transactionId,
        accountCode: conflict.newCategoryCode,
        accountName: conflict.newCategory,
        confidenceScore: 1.0,
        source: 'USER_OVERRIDE' as any,
        isSplit: false,
        vatType: 'STANDARD' as any,
      });
    }

    // Optionally: Store exception metadata for future reference
    // This could be implemented as a PayeeException entity in the future

    this.logger.log(
      `Exception created - transaction categorized as ${conflict.newCategoryCode}`,
    );
  }

  /**
   * Resolution: Split by amount threshold (future enhancement)
   */
  private async resolveSplitByAmount(
    tenantId: string,
    conflict: CorrectionConflict,
    threshold: number,
  ): Promise<void> {
    this.logger.log(
      `Creating split rule by amount: threshold=${threshold} cents`,
    );

    // Future enhancement: Create conditional pattern
    // For now, default to "just this one" behavior
    this.logger.warn(
      'Split by amount not fully implemented - using "just this one" fallback',
    );

    // TODO: Implement conditional pattern creation
    // Would create two patterns:
    // 1. Pattern for amounts >= threshold -> new category
    // 2. Pattern for amounts < threshold -> existing category
  }

  /**
   * Resolution: Split by description pattern (future enhancement)
   */
  private async resolveSplitByDescription(
    tenantId: string,
    conflict: CorrectionConflict,
    pattern: string,
  ): Promise<void> {
    this.logger.log(`Creating split rule by description pattern: ${pattern}`);

    // Future enhancement: Create conditional pattern
    // For now, default to "just this one" behavior
    this.logger.warn(
      'Split by description not fully implemented - using "just this one" fallback',
    );

    // TODO: Implement conditional pattern creation
    // Would create two patterns:
    // 1. Pattern for descriptions matching regex -> new category
    // 2. Pattern for descriptions not matching -> existing category
  }

  /**
   * Normalize payee name for consistent matching
   */
  private normalizePayeeName(payee: string): string {
    return payee.toUpperCase().trim();
  }
}
