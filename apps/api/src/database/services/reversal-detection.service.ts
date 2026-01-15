/**
 * TASK-TRANS-022: Reversal Transaction Detection Service
 * Edge Case: EC-TRANS-006 - Transaction reversal/refund detection
 *
 * Detects when a transaction is a reversal or refund of an earlier transaction.
 * Uses multiple signals: negative amount, date proximity, payee similarity, and keywords.
 */

import { Injectable } from '@nestjs/common';
import { TransactionRepository } from '../repositories/transaction.repository';
import { AuditLogService } from './audit-log.service';
import { ITransaction } from '../entities/transaction.entity';

export interface ReversalMatch {
  originalTransactionId: string;
  confidence: number; // 0-100
  matchReason: string;
  suggestedCategory: string;
}

const REVERSAL_KEYWORDS = ['REV', 'REVERSAL', 'REFUND', 'R/D'];
const DATE_WINDOW_DAYS = 7;
const PAYEE_SIMILARITY_THRESHOLD = 80; // Percentage
const AUTO_LINK_THRESHOLD = 90;
const FLAG_FOR_REVIEW_THRESHOLD = 55; // Lower threshold to catch more potential reversals

@Injectable()
export class ReversalDetectionService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Detect if a transaction is a reversal of an earlier transaction
   * @returns ReversalMatch if reversal detected, null otherwise
   */
  async detectReversal(
    tenantId: string,
    transaction: Partial<ITransaction>,
  ): Promise<ReversalMatch | null> {
    // Only check negative amounts (potential reversals)
    if (!transaction.amountCents || transaction.amountCents >= 0) {
      return null;
    }

    const potentialOriginals = await this.findPotentialOriginals(
      tenantId,
      transaction.amountCents,
      transaction.date!,
      transaction.payeeName || '',
    );

    if (potentialOriginals.length === 0) {
      return null;
    }

    // Score each potential original
    const matches = potentialOriginals.map((original) => {
      const confidence = this.calculateConfidence(transaction, original);
      const matchReason = this.buildMatchReason(
        transaction,
        original,
        confidence,
      );

      return {
        originalTransactionId: original.id,
        confidence,
        matchReason,
        suggestedCategory: 'Transaction Reversal',
      } as ReversalMatch;
    });

    // Return highest confidence match if above threshold
    const bestMatch = matches.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );

    return bestMatch.confidence >= FLAG_FOR_REVIEW_THRESHOLD ? bestMatch : null;
  }

  /**
   * Find transactions that could be the original of a reversal
   */
  async findPotentialOriginals(
    tenantId: string,
    negativeAmount: number,
    reversalDate: Date,
    payeeName: string,
  ): Promise<ITransaction[]> {
    const positiveAmount = Math.abs(negativeAmount);

    // Search 7 days before and after reversal date
    const startDate = new Date(reversalDate);
    startDate.setDate(startDate.getDate() - DATE_WINDOW_DAYS);

    const endDate = new Date(reversalDate);
    endDate.setDate(endDate.getDate() + DATE_WINDOW_DAYS);

    // Use findByTenant with filter (isDeleted is handled by repository default)
    const result = await this.transactionRepository.findByTenant(tenantId, {
      dateFrom: startDate,
      dateTo: endDate,
      isReconciled: false,
    });

    // Filter for exact amount matches
    return result.data.filter(
      (txn) => txn.amountCents === positiveAmount,
    ) as ITransaction[];
  }

  /**
   * Calculate confidence score (0-100) that a transaction is a reversal
   */
  private calculateConfidence(
    reversal: Partial<ITransaction>,
    original: ITransaction,
  ): number {
    let confidence = 0;

    // Base score for exact negative amount
    confidence += 40;

    // Payee matching
    const payeeScore = this.calculatePayeeScore(
      reversal.payeeName || '',
      original.payeeName || '',
    );
    confidence += payeeScore;

    // Date proximity (same day = 10 points, decreasing)
    const dateScore = this.calculateDateScore(reversal.date!, original.date);
    confidence += dateScore;

    return Math.min(confidence, 100);
  }

  /**
   * Calculate payee similarity score (0-50 points)
   */
  private calculatePayeeScore(
    reversalPayee: string,
    originalPayee: string,
  ): number {
    if (!reversalPayee || !originalPayee) {
      return 0;
    }

    const reversalPayeeUpper = reversalPayee.toUpperCase();
    const originalPayeeUpper = originalPayee.toUpperCase();

    // Check for exact match
    if (reversalPayeeUpper === originalPayeeUpper) {
      return 50;
    }

    // Check for reversal keywords in reversal payee
    const hasReversalKeyword = REVERSAL_KEYWORDS.some((keyword) =>
      reversalPayeeUpper.includes(keyword),
    );

    // Calculate similarity using Levenshtein distance
    const similarity = this.calculateSimilarity(
      reversalPayeeUpper,
      originalPayeeUpper,
    );

    // Strip reversal keywords for comparison if present
    let strippedReversalPayee = reversalPayeeUpper;
    for (const keyword of REVERSAL_KEYWORDS) {
      strippedReversalPayee = strippedReversalPayee.replace(keyword, '').trim();
    }
    strippedReversalPayee = strippedReversalPayee
      .replace(/^[\s-]+|[\s-]+$/g, '')
      .trim();
    const strippedSimilarity = strippedReversalPayee
      ? this.calculateSimilarity(strippedReversalPayee, originalPayeeUpper)
      : 0;

    if (similarity >= PAYEE_SIMILARITY_THRESHOLD) {
      return hasReversalKeyword ? 40 : 30;
    }

    // If has reversal keyword and stripped payee is similar
    if (hasReversalKeyword && strippedSimilarity >= 50) {
      return 30;
    }

    if (hasReversalKeyword && similarity >= 60) {
      return 20;
    }

    // Partial match with reversal keywords (give lower score for flagging)
    if (hasReversalKeyword && strippedSimilarity >= 40) {
      return 15;
    }

    return 0;
  }

  /**
   * Calculate date proximity score (0-10 points)
   */
  private calculateDateScore(reversalDate: Date, originalDate: Date): number {
    const daysDiff = Math.abs(
      Math.floor(
        (reversalDate.getTime() - originalDate.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    if (daysDiff === 0) return 10; // Same day
    if (daysDiff === 1) return 8;
    if (daysDiff <= 3) return 5;
    if (daysDiff <= 7) return 2;
    return 0;
  }

  /**
   * Calculate string similarity percentage using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) return 100;

    const similarity = ((maxLength - distance) / maxLength) * 100;
    return Math.round(similarity);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Build human-readable match reason
   */
  private buildMatchReason(
    reversal: Partial<ITransaction>,
    original: ITransaction,
    confidence: number,
  ): string {
    const reasons: string[] = [];

    const payeeSimilarity = this.calculateSimilarity(
      reversal.payeeName?.toUpperCase() || '',
      original.payeeName?.toUpperCase() || '',
    );

    if (payeeSimilarity === 100) {
      reasons.push('same payee');
    } else if (payeeSimilarity >= PAYEE_SIMILARITY_THRESHOLD) {
      reasons.push('similar payee');
    }

    const hasReversalKeyword = REVERSAL_KEYWORDS.some((keyword) =>
      reversal.payeeName?.toUpperCase().includes(keyword),
    );

    if (hasReversalKeyword) {
      reasons.push('reversal keywords');
    }

    const daysDiff = Math.abs(
      Math.floor(
        (reversal.date!.getTime() - original.date.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    if (daysDiff === 0) {
      reasons.push('same date');
    } else if (daysDiff <= 3) {
      reasons.push(`${daysDiff} days apart`);
    }

    const prefix =
      reasons.length > 0
        ? 'Exact negative amount with '
        : 'Exact negative amount';
    return `${prefix}${reasons.join(', ')}`;
  }

  /**
   * Link a reversal transaction to its original
   */
  linkReversal(_reversalId: string, _originalId: string): never {
    // Need to get tenantId first - we'll fetch from reversal
    // Since we don't know the tenant, we need to search
    // For now, we'll require tenantId as a parameter
    throw new Error('Not implemented - requires tenantId parameter');
  }

  /**
   * Link a reversal transaction to its original (with tenantId)
   */
  async linkReversalWithTenant(
    tenantId: string,
    reversalId: string,
    originalId: string,
  ): Promise<void> {
    // Validate both transactions exist
    const reversal = await this.transactionRepository.findById(
      tenantId,
      reversalId,
    );
    if (!reversal) {
      throw new Error('Reversal transaction not found');
    }

    const original = await this.transactionRepository.findById(
      tenantId,
      originalId,
    );
    if (!original) {
      throw new Error('Original transaction not found');
    }

    // Update reversal transaction (using Prisma client directly as DTO doesn't support reversal fields yet)
    // TODO: Add reversal fields to UpdateTransactionDto
    await this.transactionRepository['prisma'].transaction.update({
      where: { id: reversalId },
      data: {
        reversesTransactionId: originalId,
        isReversal: true,
      },
    });

    // Create audit log
    await this.auditLogService.logAction({
      tenantId: reversal.tenantId,
      entityType: 'Transaction',
      entityId: reversalId,
      action: 'MATCH' as any, // MATCH exists in enum but type needs updating
      afterValue: {
        reversesTransactionId: originalId,
        isReversal: true,
      },
      changeSummary: `Linked reversal to original transaction ${originalId}`,
    });
  }

  /**
   * Get all reversals for a transaction
   */
  async getReversalsFor(
    tenantId: string,
    transactionId: string,
  ): Promise<ITransaction[]> {
    const original = await this.transactionRepository.findById(
      tenantId,
      transactionId,
    );
    if (!original) {
      return [];
    }

    // Find all transactions with wide date range that reference this as original
    const startDate = new Date(original.date);
    startDate.setDate(startDate.getDate() - 30);

    const endDate = new Date(original.date);
    endDate.setDate(endDate.getDate() + 30);

    const result = await this.transactionRepository.findByTenant(tenantId, {
      dateFrom: startDate,
      dateTo: endDate,
    });

    // Filter for reversals that link to this transaction
    return result.data.filter(
      (txn) => txn.reversesTransactionId === transactionId,
    ) as ITransaction[];
  }
}
