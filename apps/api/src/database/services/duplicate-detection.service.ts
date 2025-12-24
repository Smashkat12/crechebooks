/**
 * Duplicate Detection Service
 * TASK-RECON-015: Reconciliation Duplicate Detection Service
 */

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  TransactionInput,
  Transaction,
  DuplicateCheckResult,
  DuplicateResolution,
  PotentialDuplicate,
  DuplicateStatus,
} from '../types/duplicate.types';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../entities/audit-log.entity';

@Injectable()
export class DuplicateDetectionService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate SHA256 hash for a transaction
   * Hash: SHA256(date + amount + reference + accountId)
   */
  generateHash(transaction: TransactionInput): string {
    const dateStr = transaction.date.toISOString().split('T')[0]; // YYYY-MM-DD
    const amount = transaction.amountCents.toString();
    const reference = transaction.reference || '';
    const account = transaction.bankAccount;

    const hashInput = `${dateStr}|${amount}|${reference}|${account}`;

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Check for duplicates in a batch of transactions
   * Detects exact hash matches and similar field matches
   */
  async checkForDuplicates(
    tenantId: string,
    transactions: TransactionInput[],
  ): Promise<DuplicateCheckResult> {
    const clean: TransactionInput[] = [];
    const potentialDuplicates: Array<{
      transaction: TransactionInput;
      existingMatch: Transaction;
      confidence: number;
    }> = [];

    for (const transaction of transactions) {
      const hash = this.generateHash(transaction);

      // Check for exact hash match
      const exactMatch = await this.prisma.transaction.findFirst({
        where: {
          tenantId,
          transactionHash: hash,
          isDeleted: false,
        },
      });

      if (exactMatch) {
        potentialDuplicates.push({
          transaction,
          existingMatch: exactMatch as unknown as Transaction,
          confidence: 100, // Exact hash match = 100% confidence
        });
        continue;
      }

      // Check for similar transactions (same date + amount)
      const dateStart = new Date(transaction.date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(transaction.date);
      dateEnd.setHours(23, 59, 59, 999);

      const similarMatches = await this.prisma.transaction.findMany({
        where: {
          tenantId,
          bankAccount: transaction.bankAccount,
          date: {
            gte: dateStart,
            lte: dateEnd,
          },
          amountCents: transaction.amountCents,
          isCredit: transaction.isCredit,
          isDeleted: false,
        },
        take: 1,
      });

      if (similarMatches.length > 0) {
        const match = similarMatches[0];
        let confidence = 60; // Base confidence for date + amount match

        // Increase confidence based on additional field matches
        if (match.reference && transaction.reference && match.reference === transaction.reference) {
          confidence += 20;
        }
        if (match.payeeName && transaction.payeeName && match.payeeName === transaction.payeeName) {
          confidence += 10;
        }
        if (match.description && transaction.description && match.description === transaction.description) {
          confidence += 10;
        }

        potentialDuplicates.push({
          transaction,
          existingMatch: match as unknown as Transaction,
          confidence,
        });
        continue;
      }

      // No duplicates found - transaction is clean
      clean.push(transaction);
    }

    return { clean, potentialDuplicates };
  }

  /**
   * Flag a transaction as a potential duplicate
   * Does NOT auto-reject - user must explicitly resolve
   */
  async flagAsPotentialDuplicate(
    transactionId: string,
    existingId: string,
  ): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const existing = await this.prisma.transaction.findUnique({
      where: { id: existingId },
    });

    if (!existing) {
      throw new Error(`Existing transaction ${existingId} not found`);
    }

    // Update the transaction to flag it as a duplicate
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        duplicateOfId: existingId,
        duplicateStatus: 'FLAGGED' as DuplicateStatus,
      },
    });

    // Create audit log
    await this.auditLogService.logAction({
      tenantId: transaction.tenantId,
      entityType: 'Transaction',
      entityId: transactionId,
      action: AuditAction.UPDATE,
      beforeValue: {
        duplicateStatus: transaction.duplicateStatus,
        duplicateOfId: transaction.duplicateOfId,
      },
      afterValue: {
        duplicateStatus: 'FLAGGED',
        duplicateOfId: existingId,
      },
      changeSummary: `Flagged as potential duplicate of transaction ${existingId}`,
    });
  }

  /**
   * Resolve a duplicate with user's chosen resolution
   * Resolution logged in audit trail
   */
  async resolveDuplicate(
    transactionId: string,
    resolution: DuplicateResolution,
  ): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        duplicateOf: true,
      },
    });

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.duplicateStatus !== 'FLAGGED') {
      throw new Error(
        `Transaction ${transactionId} is not flagged as a duplicate`,
      );
    }

    switch (resolution) {
      case DuplicateResolution.KEEP_BOTH:
        // Mark as resolved, keep both transactions
        await this.prisma.transaction.update({
          where: { id: transactionId },
          data: {
            duplicateStatus: 'RESOLVED' as DuplicateStatus,
            duplicateOfId: null,
          },
        });
        break;

      case DuplicateResolution.REJECT_NEW:
        // Mark new transaction as deleted
        await this.prisma.transaction.update({
          where: { id: transactionId },
          data: {
            duplicateStatus: 'RESOLVED' as DuplicateStatus,
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        break;

      case DuplicateResolution.REJECT_EXISTING:
        // Mark existing transaction as deleted
        if (!transaction.duplicateOfId) {
          throw new Error('No duplicate reference found');
        }
        await this.prisma.transaction.update({
          where: { id: transaction.duplicateOfId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        await this.prisma.transaction.update({
          where: { id: transactionId },
          data: {
            duplicateStatus: 'RESOLVED' as DuplicateStatus,
            duplicateOfId: null,
          },
        });
        break;

      case DuplicateResolution.MERGE:
        // For merge, we'll keep the existing one and mark the new one as deleted
        // In a real implementation, you might want to merge categorizations, etc.
        if (!transaction.duplicateOfId) {
          throw new Error('No duplicate reference found');
        }
        await this.prisma.transaction.update({
          where: { id: transactionId },
          data: {
            duplicateStatus: 'RESOLVED' as DuplicateStatus,
            isDeleted: true,
            deletedAt: new Date(),
          },
        });
        break;

      default:
        throw new Error(`Unknown resolution type: ${resolution}`);
    }

    // Create audit log
    await this.auditLogService.logAction({
      tenantId: transaction.tenantId,
      entityType: 'Transaction',
      entityId: transactionId,
      action: AuditAction.UPDATE,
      beforeValue: {
        duplicateStatus: 'FLAGGED',
        duplicateOfId: transaction.duplicateOfId,
      },
      afterValue: {
        duplicateStatus: 'RESOLVED',
        resolution,
      },
      changeSummary: `Duplicate resolved with resolution: ${resolution}`,
    });
  }

  /**
   * Get all pending duplicates for a tenant
   * Returns transactions flagged but not yet resolved
   */
  async getPendingDuplicates(
    tenantId: string,
  ): Promise<PotentialDuplicate[]> {
    const flaggedTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        duplicateStatus: 'FLAGGED' as DuplicateStatus,
        isDeleted: false,
      },
      include: {
        duplicateOf: true,
      },
    });

    return flaggedTransactions.map((transaction) => ({
      id: transaction.id,
      newTransaction: transaction as unknown as Transaction,
      existingTransaction: transaction.duplicateOf as unknown as Transaction,
      flaggedAt: transaction.updatedAt,
      resolvedAt: undefined,
      resolution: undefined,
    }));
  }
}
