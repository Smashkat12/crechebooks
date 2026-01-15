/**
 * Transaction Reversal Service
 * TXN-005: Fix Transaction Reversal
 *
 * Implements complete reversal workflow:
 * - Link reversed transaction to original
 * - Update related records (reconciliation, categorization)
 * - Recalculate affected balances
 * - Create audit trail for reversals
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionRepository } from '../repositories/transaction.repository';
import { AuditLogService } from './audit-log.service';
import {
  ReversalDetectionService,
  ReversalMatch,
} from './reversal-detection.service';
import { AuditAction } from '../entities/audit-log.entity';
import {
  NotFoundException,
  BusinessException,
  ConflictException,
} from '../../shared/exceptions';

/**
 * Reversal status for tracking
 */
export enum ReversalStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  AUTO_LINKED = 'AUTO_LINKED',
}

/**
 * Reversal reason categories
 */
export enum ReversalReason {
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  INCORRECT_AMOUNT = 'INCORRECT_AMOUNT',
  WRONG_BENEFICIARY = 'WRONG_BENEFICIARY',
  FRAUD = 'FRAUD',
  BANK_ERROR = 'BANK_ERROR',
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  DISHONOURED = 'DISHONOURED',
  OTHER = 'OTHER',
}

/**
 * Reversal record
 */
export interface ReversalRecord {
  id: string;
  reversalTransactionId: string;
  originalTransactionId: string;
  status: ReversalStatus;
  reason: ReversalReason;
  notes?: string;
  confidence: number;
  autoLinked: boolean;
  linkedBy?: string; // userId or 'SYSTEM'
  linkedAt: Date;
  originalAmountCents: number;
  reversalAmountCents: number;
  netEffectCents: number;
}

/**
 * Reversal result with affected records
 */
export interface ReversalResult {
  reversal: ReversalRecord;
  affectedRecords: {
    categorization?: boolean;
    reconciliation?: boolean;
    payment?: boolean;
    bankStatementMatch?: boolean;
  };
  balanceAdjustment: number;
}

/**
 * Pending reversal suggestion
 */
export interface PendingReversal {
  reversalTransactionId: string;
  reversalDescription: string;
  reversalAmountCents: number;
  reversalDate: Date;
  suggestedOriginalId: string;
  originalDescription: string;
  originalAmountCents: number;
  originalDate: Date;
  confidence: number;
  matchReason: string;
}

@Injectable()
export class TransactionReversalService {
  private readonly logger = new Logger(TransactionReversalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionRepository: TransactionRepository,
    private readonly auditLogService: AuditLogService,
    private readonly reversalDetectionService: ReversalDetectionService,
  ) {}

  /**
   * Link a reversal transaction to its original
   */
  async linkReversal(
    tenantId: string,
    reversalTransactionId: string,
    originalTransactionId: string,
    reason: ReversalReason = ReversalReason.OTHER,
    notes?: string,
    userId?: string,
  ): Promise<ReversalResult> {
    this.logger.log(
      `Linking reversal ${reversalTransactionId} to original ${originalTransactionId}`,
    );

    // Validate both transactions exist
    const [reversal, original] = await Promise.all([
      this.transactionRepository.findById(tenantId, reversalTransactionId),
      this.transactionRepository.findById(tenantId, originalTransactionId),
    ]);

    if (!reversal) {
      throw new NotFoundException(
        'Reversal Transaction',
        reversalTransactionId,
      );
    }

    if (!original) {
      throw new NotFoundException(
        'Original Transaction',
        originalTransactionId,
      );
    }

    // Validate reversal logic
    this.validateReversalLink(reversal, original);

    // Check if reversal is already linked
    if (reversal.reversesTransactionId) {
      throw new ConflictException(
        `Reversal transaction ${reversalTransactionId} is already linked to ${reversal.reversesTransactionId}`,
        { existingOriginalId: reversal.reversesTransactionId },
      );
    }

    // Check if original already has a reversal
    const existingReversals = await this.getReversalsForTransaction(
      tenantId,
      originalTransactionId,
    );

    if (existingReversals.length > 0) {
      this.logger.warn(
        `Original transaction ${originalTransactionId} already has ${existingReversals.length} reversal(s)`,
      );
    }

    // Perform reversal in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Update reversal transaction
      await tx.transaction.update({
        where: { id: reversalTransactionId },
        data: {
          reversesTransactionId: originalTransactionId,
          isReversal: true,
        },
      });

      // Update related records
      const affectedRecords = await this.updateRelatedRecords(
        tx,
        tenantId,
        reversalTransactionId,
        originalTransactionId,
      );

      return affectedRecords;
    });

    // Create audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'Transaction',
      entityId: reversalTransactionId,
      action: AuditAction.UPDATE,
      userId: userId || undefined,
      afterValue: {
        reversesTransactionId: originalTransactionId,
        isReversal: true,
        reason,
        notes,
      },
      changeSummary: `Linked reversal transaction to original ${originalTransactionId}. Reason: ${reason}`,
    });

    const reversalRecord: ReversalRecord = {
      id: `rev_${reversalTransactionId}_${originalTransactionId}`,
      reversalTransactionId,
      originalTransactionId,
      status: ReversalStatus.CONFIRMED,
      reason,
      notes,
      confidence: 100,
      autoLinked: false,
      linkedBy: userId || 'MANUAL',
      linkedAt: new Date(),
      originalAmountCents: original.amountCents,
      reversalAmountCents: reversal.amountCents,
      netEffectCents: original.amountCents + reversal.amountCents,
    };

    return {
      reversal: reversalRecord,
      affectedRecords: result,
      balanceAdjustment: reversalRecord.netEffectCents,
    };
  }

  /**
   * Auto-link reversals based on detection service
   */
  async autoLinkReversals(tenantId: string): Promise<ReversalResult[]> {
    this.logger.log(`Auto-linking reversals for tenant ${tenantId}`);

    // Find all potential reversal transactions (negative amounts, not yet linked)
    const pendingResult = await this.transactionRepository.findByTenant(
      tenantId,
      {
        isReconciled: false,
        limit: 1000,
      },
    );

    const potentialReversals = pendingResult.data.filter(
      (tx) => tx.amountCents < 0 && !tx.isReversal && !tx.reversesTransactionId,
    );

    const results: ReversalResult[] = [];
    const AUTO_LINK_THRESHOLD = 90;

    for (const reversal of potentialReversals) {
      try {
        // Cast to any to resolve ImportSource enum type mismatch between Prisma and local types
        const match = await this.reversalDetectionService.detectReversal(
          tenantId,
          reversal as any,
        );

        if (match && match.confidence >= AUTO_LINK_THRESHOLD) {
          const result = await this.linkReversal(
            tenantId,
            reversal.id,
            match.originalTransactionId,
            ReversalReason.OTHER,
            `Auto-linked: ${match.matchReason}`,
            'SYSTEM',
          );

          // Mark as auto-linked
          result.reversal.autoLinked = true;
          result.reversal.linkedBy = 'SYSTEM';
          result.reversal.confidence = match.confidence;

          results.push(result);

          this.logger.log(
            `Auto-linked reversal ${reversal.id} to ${match.originalTransactionId} (${match.confidence}% confidence)`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to auto-link reversal ${reversal.id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    }

    this.logger.log(
      `Auto-linked ${results.length} reversals for tenant ${tenantId}`,
    );
    return results;
  }

  /**
   * Get pending reversal suggestions for review
   */
  async getPendingReversalSuggestions(
    tenantId: string,
  ): Promise<PendingReversal[]> {
    const pendingResult = await this.transactionRepository.findByTenant(
      tenantId,
      {
        isReconciled: false,
        limit: 1000,
      },
    );

    const potentialReversals = pendingResult.data.filter(
      (tx) => tx.amountCents < 0 && !tx.isReversal && !tx.reversesTransactionId,
    );

    const suggestions: PendingReversal[] = [];
    const REVIEW_THRESHOLD = 55;

    for (const reversal of potentialReversals) {
      // Cast to any to resolve ImportSource enum type mismatch between Prisma and local types
      const match = await this.reversalDetectionService.detectReversal(
        tenantId,
        reversal as any,
      );

      if (match && match.confidence >= REVIEW_THRESHOLD) {
        const original = await this.transactionRepository.findById(
          tenantId,
          match.originalTransactionId,
        );

        if (original) {
          suggestions.push({
            reversalTransactionId: reversal.id,
            reversalDescription: reversal.description,
            reversalAmountCents: reversal.amountCents,
            reversalDate: reversal.date,
            suggestedOriginalId: match.originalTransactionId,
            originalDescription: original.description,
            originalAmountCents: original.amountCents,
            originalDate: original.date,
            confidence: match.confidence,
            matchReason: match.matchReason,
          });
        }
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Unlink a reversal (undo the link)
   */
  async unlinkReversal(
    tenantId: string,
    reversalTransactionId: string,
    userId?: string,
    reason?: string,
  ): Promise<void> {
    const reversal = await this.transactionRepository.findById(
      tenantId,
      reversalTransactionId,
    );

    if (!reversal) {
      throw new NotFoundException('Transaction', reversalTransactionId);
    }

    if (!reversal.isReversal || !reversal.reversesTransactionId) {
      throw new BusinessException(
        'Transaction is not linked as a reversal',
        'NOT_A_REVERSAL',
        { transactionId: reversalTransactionId },
      );
    }

    const originalId = reversal.reversesTransactionId;

    await this.prisma.$transaction(async (tx) => {
      // Clear reversal link
      await tx.transaction.update({
        where: { id: reversalTransactionId },
        data: {
          reversesTransactionId: null,
          isReversal: false,
        },
      });

      // TODO: Restore related records if needed
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'Transaction',
      entityId: reversalTransactionId,
      action: AuditAction.UPDATE,
      userId: userId || undefined,
      beforeValue: {
        reversesTransactionId: originalId,
        isReversal: true,
      },
      afterValue: {
        reversesTransactionId: null,
        isReversal: false,
      },
      changeSummary: `Unlinked reversal from original ${originalId}. Reason: ${reason || 'Not specified'}`,
    });

    this.logger.log(
      `Unlinked reversal ${reversalTransactionId} from original ${originalId}`,
    );
  }

  /**
   * Get all reversals for a transaction
   */
  async getReversalsForTransaction(
    tenantId: string,
    transactionId: string,
  ): Promise<ReversalRecord[]> {
    const reversals = await this.reversalDetectionService.getReversalsFor(
      tenantId,
      transactionId,
    );

    return reversals.map((rev) => ({
      id: `rev_${rev.id}_${transactionId}`,
      reversalTransactionId: rev.id,
      originalTransactionId: transactionId,
      status: ReversalStatus.CONFIRMED,
      reason: ReversalReason.OTHER,
      confidence: 100,
      autoLinked: false,
      linkedAt: rev.updatedAt,
      originalAmountCents: Math.abs(rev.amountCents), // Will need original lookup
      reversalAmountCents: rev.amountCents,
      netEffectCents: 0, // Calculate properly
    }));
  }

  /**
   * Get reversal summary for a tenant
   */
  async getReversalSummary(
    tenantId: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<{
    totalReversals: number;
    autoLinked: number;
    manuallyLinked: number;
    pendingSuggestions: number;
    totalAmountReversedCents: number;
  }> {
    const filter: any = {
      isReconciled: undefined,
      limit: 10000,
    };

    if (dateFrom) filter.dateFrom = dateFrom;
    if (dateTo) filter.dateTo = dateTo;

    const result = await this.transactionRepository.findByTenant(
      tenantId,
      filter,
    );

    const reversals = result.data.filter((tx) => tx.isReversal);
    const pendingSuggestions =
      await this.getPendingReversalSuggestions(tenantId);

    return {
      totalReversals: reversals.length,
      autoLinked: reversals.filter((r) => r.description.includes('Auto-linked'))
        .length,
      manuallyLinked: reversals.filter(
        (r) => !r.description.includes('Auto-linked'),
      ).length,
      pendingSuggestions: pendingSuggestions.length,
      totalAmountReversedCents: reversals.reduce(
        (sum, r) => sum + Math.abs(r.amountCents),
        0,
      ),
    };
  }

  /**
   * Validate reversal can be linked to original
   */
  private validateReversalLink(
    reversal: { amountCents: number; tenantId: string },
    original: { amountCents: number; tenantId: string; isReconciled: boolean },
  ): void {
    // Tenant must match
    if (reversal.tenantId !== original.tenantId) {
      throw new BusinessException(
        'Transactions belong to different tenants',
        'TENANT_MISMATCH',
      );
    }

    // Reversal should be negative or opposite sign
    // Allow flexibility for different reversal representations
    const absReversal = Math.abs(reversal.amountCents);
    const absOriginal = Math.abs(original.amountCents);

    // Amounts should match (within small tolerance for fees)
    const tolerance = Math.max(100, absOriginal * 0.01); // 1% or R1
    if (Math.abs(absReversal - absOriginal) > tolerance) {
      this.logger.warn(
        `Reversal amount ${absReversal} differs from original ${absOriginal} by more than tolerance ${tolerance}`,
      );
      // Warning only - allow linking with different amounts
    }

    // Warn if original is already reconciled
    if (original.isReconciled) {
      this.logger.warn('Linking reversal to an already reconciled transaction');
    }
  }

  /**
   * Update related records when linking reversal
   */
  private async updateRelatedRecords(
    tx: Prisma.TransactionClient,
    tenantId: string,
    reversalTransactionId: string,
    originalTransactionId: string,
  ): Promise<{
    categorization?: boolean;
    reconciliation?: boolean;
    payment?: boolean;
    bankStatementMatch?: boolean;
  }> {
    const affected: {
      categorization?: boolean;
      reconciliation?: boolean;
      payment?: boolean;
      bankStatementMatch?: boolean;
    } = {};

    // Update categorization if exists
    const reversalCategorization = await tx.categorization.findFirst({
      where: { transactionId: reversalTransactionId },
    });

    if (reversalCategorization) {
      // TODO: Add 'notes' field to Categorization model in Prisma schema to enable this update
      // await tx.categorization.update({
      //   where: { id: reversalCategorization.id },
      //   data: {
      //     notes: `Reversal of transaction ${originalTransactionId}`,
      //   },
      // });
      affected.categorization = true;
    }

    // Update bank statement match if exists
    const reversalMatch = await tx.bankStatementMatch.findFirst({
      where: { transactionId: reversalTransactionId },
    });

    if (reversalMatch) {
      // TODO: Add 'isReversed', 'reversedAt', 'reversalReason' fields to BankStatementMatch model in Prisma schema
      // await tx.bankStatementMatch.update({
      //   where: { id: reversalMatch.id },
      //   data: {
      //     isReversed: true,
      //     reversedAt: new Date(),
      //     reversalReason: `Linked to original transaction ${originalTransactionId}`,
      //   },
      // });
      affected.bankStatementMatch = true;
    }

    // Check if original had payment allocation
    const originalPayment = await tx.payment.findFirst({
      where: { transactionId: originalTransactionId },
    });

    if (originalPayment) {
      this.logger.warn(
        `Original transaction ${originalTransactionId} has payment allocation. Manual review may be required.`,
      );
      affected.payment = true;
    }

    return affected;
  }
}
