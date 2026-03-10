/**
 * Discrepancy Service
 * TASK-RECON-012: Discrepancy Detection and Classification
 *
 * @module database/services/discrepancy
 * @description Service for detecting and classifying reconciliation discrepancies.
 * All amounts are in CENTS as integers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  DiscrepancyType,
  DiscrepancySeverity,
  Discrepancy,
  DiscrepancyReport,
  ResolutionSuggestion,
  DiscrepancyClassification,
} from '../dto/discrepancy.dto';
import { NotFoundException } from '../../shared/exceptions';

@Injectable()
export class DiscrepancyService {
  private readonly logger = new Logger(DiscrepancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationRepo: ReconciliationRepository,
  ) {}

  /**
   * Detect discrepancies in a reconciliation
   * Identifies transactions in bank but not Xero, in Xero but not bank,
   * amount mismatches, and date mismatches
   *
   * @param tenantId - Tenant ID for isolation
   * @param reconId - Reconciliation ID
   * @returns DiscrepancyReport with all detected discrepancies
   * @throws NotFoundException if reconciliation not found
   */
  async detectDiscrepancies(
    tenantId: string,
    reconId: string,
  ): Promise<DiscrepancyReport> {
    this.logger.log(
      `Detecting discrepancies for tenant ${tenantId}, reconciliation ${reconId}`,
    );

    // Get reconciliation with tenant validation
    const recon = await this.reconciliationRepo.findById(reconId, tenantId);
    if (!recon) {
      throw new NotFoundException('Reconciliation', reconId);
    }

    // Use bank_statement_matches as the source of truth (populated by reconciliation service)
    const matches = await this.prisma.bankStatementMatch.findMany({
      where: {
        tenantId,
        reconciliationId: reconId,
      },
      orderBy: { bankDate: 'asc' },
    });

    const discrepancies: Discrepancy[] = [];

    for (const m of matches) {
      if (
        m.status === 'MATCHED' ||
        m.status === 'FEE_ADJUSTED_MATCH'
      ) {
        continue; // Successfully matched — not a discrepancy
      }

      if (m.status === 'IN_BANK_ONLY') {
        discrepancies.push({
          type: DiscrepancyType.IN_BANK_NOT_XERO,
          transactionId: m.id,
          description: `Transaction in bank but not in Xero: ${m.bankDescription}`,
          amountCents: m.bankAmountCents,
          date: m.bankDate,
          severity: this.calculateSeverity(m.bankAmountCents),
        });
      } else if (m.status === 'IN_XERO_ONLY') {
        discrepancies.push({
          type: DiscrepancyType.IN_XERO_NOT_BANK,
          transactionId: m.transactionId ?? m.id,
          xeroTransactionId: m.transactionId ?? undefined,
          description: `Transaction in Xero but not in bank: ${m.xeroDescription ?? m.bankDescription}`,
          amountCents: m.xeroAmountCents ?? m.bankAmountCents,
          date: m.xeroDate ?? m.bankDate,
          severity: this.calculateSeverity(m.xeroAmountCents ?? m.bankAmountCents),
        });
      } else if (m.status === 'AMOUNT_MISMATCH') {
        discrepancies.push({
          type: DiscrepancyType.AMOUNT_MISMATCH,
          transactionId: m.transactionId ?? m.id,
          description: `Amount mismatch: Bank ${m.bankAmountCents}c vs Xero ${m.xeroAmountCents ?? 0}c for ${m.bankDescription}`,
          amountCents: Math.abs(m.bankAmountCents - (m.xeroAmountCents ?? 0)),
          expectedAmountCents: m.xeroAmountCents ?? undefined,
          actualAmountCents: m.bankAmountCents,
          date: m.bankDate,
          severity: this.calculateSeverity(
            Math.abs(m.bankAmountCents - (m.xeroAmountCents ?? 0)),
          ),
        });
      } else if (m.status === 'DATE_MISMATCH') {
        discrepancies.push({
          type: DiscrepancyType.DATE_MISMATCH,
          transactionId: m.transactionId ?? m.id,
          description: `Date mismatch for ${m.bankDescription}`,
          amountCents: m.bankAmountCents,
          date: m.bankDate,
          severity: this.calculateSeverity(m.bankAmountCents),
        });
      }
    }

    // Calculate summary
    const summary = {
      inBankNotXero: discrepancies.filter(
        (d) => d.type === DiscrepancyType.IN_BANK_NOT_XERO,
      ).length,
      inXeroNotBank: discrepancies.filter(
        (d) => d.type === DiscrepancyType.IN_XERO_NOT_BANK,
      ).length,
      amountMismatches: discrepancies.filter(
        (d) => d.type === DiscrepancyType.AMOUNT_MISMATCH,
      ).length,
      dateMismatches: discrepancies.filter(
        (d) => d.type === DiscrepancyType.DATE_MISMATCH,
      ).length,
    };

    const totalDiscrepancyCents = discrepancies.reduce(
      (sum, d) => sum + Math.abs(d.amountCents),
      0,
    );

    this.logger.log(
      `Found ${discrepancies.length} discrepancies, total: ${totalDiscrepancyCents}c`,
    );

    return {
      reconciliationId: reconId,
      tenantId,
      totalDiscrepancyCents,
      discrepancyCount: discrepancies.length,
      discrepancies,
      summary,
      generatedAt: new Date(),
    };
  }

  /**
   * Classify a discrepancy between bank and Xero transactions
   *
   * @param bankTx - Bank transaction
   * @param xeroTx - Xero transaction
   * @returns DiscrepancyClassification with type and severity
   */
  classifyDiscrepancy(
    bankTx: Transaction,
    xeroTx: Transaction,
  ): DiscrepancyClassification {
    // Check for amount mismatch
    if (bankTx.amountCents !== xeroTx.amountCents) {
      const diff = Math.abs(bankTx.amountCents - xeroTx.amountCents);
      return {
        type: DiscrepancyType.AMOUNT_MISMATCH,
        severity: this.calculateSeverity(diff),
      };
    }

    // Check for date mismatch
    if (!this.isSameDate(bankTx.date, xeroTx.date)) {
      return {
        type: DiscrepancyType.DATE_MISMATCH,
        severity: this.calculateSeverity(bankTx.amountCents),
      };
    }

    // No discrepancy
    return {
      type: null,
      severity: 'LOW',
    };
  }

  /**
   * Suggest a resolution for a discrepancy
   *
   * @param discrepancy - Discrepancy to resolve
   * @returns ResolutionSuggestion with action and details
   */
  suggestResolution(discrepancy: Discrepancy): ResolutionSuggestion {
    switch (discrepancy.type) {
      case DiscrepancyType.IN_BANK_NOT_XERO:
        return {
          action: 'CREATE_XERO_TRANSACTION',
          description: `Create matching transaction in Xero for ${discrepancy.description}`,
          automatable: true,
          estimatedImpactCents: discrepancy.amountCents,
        };

      case DiscrepancyType.IN_XERO_NOT_BANK:
        return {
          action: 'VERIFY_BANK_TRANSACTION',
          description: `Verify bank transaction exists or mark Xero transaction as error`,
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };

      case DiscrepancyType.AMOUNT_MISMATCH:
        return {
          action: 'CORRECT_AMOUNT',
          description: `Correct amount discrepancy: expected ${discrepancy.expectedAmountCents}c, actual ${discrepancy.actualAmountCents}c`,
          automatable: false,
          estimatedImpactCents: Math.abs(
            (discrepancy.expectedAmountCents ?? 0) -
              (discrepancy.actualAmountCents ?? 0),
          ),
        };

      case DiscrepancyType.DATE_MISMATCH:
        return {
          action: 'CORRECT_DATE',
          description: `Correct transaction date mismatch for ${discrepancy.description}`,
          automatable: false,
          estimatedImpactCents: 0,
        };

      default:
        return {
          action: 'MANUAL_REVIEW',
          description: 'Manual review required for this discrepancy',
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };
    }
  }

  /**
   * Report a discrepancy (store in audit log)
   *
   * @param discrepancy - Discrepancy to report
   * @param tenantId - Tenant ID for isolation
   */
  async reportDiscrepancy(
    discrepancy: Discrepancy,
    tenantId: string,
  ): Promise<void> {
    this.logger.warn(
      `Discrepancy reported for tenant ${tenantId}: ${discrepancy.type} - ${discrepancy.description}`,
    );

    // Store in audit log for tracking using RECONCILE action
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        action: 'RECONCILE',
        entityType: 'Transaction',
        entityId: discrepancy.transactionId ?? 'UNKNOWN',
        changeSummary: `Discrepancy detected: ${discrepancy.type} - ${discrepancy.description}`,
        afterValue: {
          discrepancyType: discrepancy.type,
          description: discrepancy.description,
          amountCents: discrepancy.amountCents,
          severity: discrepancy.severity,
          xeroTransactionId: discrepancy.xeroTransactionId,
          expectedAmountCents: discrepancy.expectedAmountCents,
          actualAmountCents: discrepancy.actualAmountCents,
          date: discrepancy.date,
        },
      },
    });
  }

  /**
   * Calculate severity based on amount in cents
   * LOW: <= R10 (1000c)
   * MEDIUM: R10-R100 (1000-10000c)
   * HIGH: > R100 (>10000c)
   *
   * @param amountCents - Amount in cents
   * @returns DiscrepancySeverity
   */
  private calculateSeverity(amountCents: number): DiscrepancySeverity {
    const abs = Math.abs(amountCents);
    if (abs <= 1000) return 'LOW'; // <= R10
    if (abs <= 10000) return 'MEDIUM'; // R10-R100
    return 'HIGH'; // > R100
  }

  /**
   * Check if two dates are the same day (ignoring time)
   *
   * @param date1 - First date
   * @param date2 - Second date
   * @returns true if same day
   */
  private isSameDate(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  /**
   * Create a discrepancy object from matched transactions
   *
   * @param bankTx - Bank transaction
   * @param xeroTx - Xero transaction
   * @param classification - Discrepancy classification
   * @returns Discrepancy object
   */
  private createDiscrepancy(
    bankTx: Transaction,
    xeroTx: Transaction,
    classification: DiscrepancyClassification,
  ): Discrepancy {
    if (!classification.type) {
      throw new Error('Cannot create discrepancy without a type');
    }

    const base: Discrepancy = {
      type: classification.type,
      transactionId: bankTx.id,
      xeroTransactionId: xeroTx.xeroTransactionId ?? undefined,
      description: '',
      amountCents: 0,
      severity: classification.severity,
    };

    if (classification.type === DiscrepancyType.AMOUNT_MISMATCH) {
      return {
        ...base,
        description: `Amount mismatch: Bank ${bankTx.amountCents}c vs Xero ${xeroTx.amountCents}c for ${bankTx.description}`,
        amountCents: Math.abs(bankTx.amountCents - xeroTx.amountCents),
        expectedAmountCents: xeroTx.amountCents,
        actualAmountCents: bankTx.amountCents,
        date: bankTx.date,
      };
    }

    if (classification.type === DiscrepancyType.DATE_MISMATCH) {
      return {
        ...base,
        description: `Date mismatch: Bank ${bankTx.date.toISOString().split('T')[0]} vs Xero ${xeroTx.date.toISOString().split('T')[0]} for ${bankTx.description}`,
        amountCents: bankTx.amountCents,
        date: bankTx.date,
      };
    }

    return base;
  }
}
