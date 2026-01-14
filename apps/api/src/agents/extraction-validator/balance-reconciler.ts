/**
 * Balance Reconciler
 * TASK-AGENT-006
 *
 * Validates that opening balance + transactions = closing balance
 * This is the PRIMARY check for OCR extraction quality
 */
import { Injectable, Logger } from '@nestjs/common';
import { ParsedBankStatement } from '../../database/entities/bank-statement-match.entity';
import { ReconciliationResult, ValidationFlag, Correction } from './interfaces/validator.interface';

@Injectable()
export class BalanceReconciler {
  private readonly logger = new Logger(BalanceReconciler.name);

  /**
   * Reconcile statement: opening + transactions should equal closing
   */
  reconcile(statement: ParsedBankStatement): ReconciliationResult {
    const { openingBalanceCents, closingBalanceCents, transactions } = statement;

    // Sum credits (positive) and debits (negative to balance)
    let credits = 0;
    let debits = 0;

    for (const tx of transactions) {
      if (tx.isCredit) {
        credits += tx.amountCents;
      } else {
        debits += tx.amountCents;
      }
    }

    // Calculate expected closing balance
    // opening + credits - debits = closing
    const calculatedBalance = openingBalanceCents + credits - debits;
    const difference = Math.abs(calculatedBalance - closingBalanceCents);

    // Calculate percentage difference (avoid divide by zero)
    let percentDifference = 0;
    if (closingBalanceCents !== 0) {
      percentDifference = (difference / Math.abs(closingBalanceCents)) * 100;
    } else if (difference !== 0) {
      percentDifference = 100;
    }

    const reconciled = difference === 0;

    this.logger.log(
      `Balance reconciliation: opening=${openingBalanceCents}c, credits=${credits}c, debits=${debits}c, ` +
      `calculated=${calculatedBalance}c, expected=${closingBalanceCents}c, diff=${difference}c (${percentDifference.toFixed(2)}%), reconciled=${reconciled}`
    );

    return {
      reconciled,
      calculatedBalance,
      expectedBalance: closingBalanceCents,
      difference,
      percentDifference,
      credits,
      debits,
    };
  }

  /**
   * Try to find corrections that would make the balance reconcile
   */
  suggestCorrections(
    statement: ParsedBankStatement,
    reconciliation: ReconciliationResult,
  ): Correction[] {
    const corrections: Correction[] = [];

    if (reconciliation.reconciled) {
      return corrections;
    }

    const { openingBalanceCents, closingBalanceCents, transactions } = statement;
    const diff = reconciliation.calculatedBalance - reconciliation.expectedBalance;

    // Strategy 1: Check if opening/closing balance has decimal point error
    // Common OCR error: 100.00 → 10000 (missing decimal) or 100.00 → 10000.00
    for (const divisor of [100, 1000, 10]) {
      // Try correcting opening balance
      const correctedOpening = Math.round(openingBalanceCents / divisor);
      const newCalcWithCorrectedOpening = correctedOpening + reconciliation.credits - reconciliation.debits;
      if (newCalcWithCorrectedOpening === closingBalanceCents) {
        corrections.push({
          type: 'BALANCE',
          field: 'openingBalance',
          original: openingBalanceCents,
          corrected: correctedOpening,
          confidence: 85,
          reason: `Dividing opening balance by ${divisor} reconciles the statement (likely OCR decimal error)`,
        });
        break;
      }

      // Try correcting closing balance
      const correctedClosing = Math.round(closingBalanceCents / divisor);
      if (reconciliation.calculatedBalance === correctedClosing) {
        corrections.push({
          type: 'BALANCE',
          field: 'closingBalance',
          original: closingBalanceCents,
          corrected: correctedClosing,
          confidence: 85,
          reason: `Dividing closing balance by ${divisor} reconciles the statement (likely OCR decimal error)`,
        });
        break;
      }
    }

    // Strategy 2: Check if a single transaction has the exact error amount
    // This catches cases where one transaction was misread
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      // Try correcting this transaction's amount
      for (const divisor of [100, 1000, 10]) {
        const correctedAmount = Math.round(tx.amountCents / divisor);
        const amountDiff = tx.amountCents - correctedAmount;

        // Check if this correction fixes the balance
        const impactOnBalance = tx.isCredit ? -amountDiff : amountDiff;
        const newCalc = reconciliation.calculatedBalance + impactOnBalance;

        if (newCalc === reconciliation.expectedBalance && correctedAmount > 0) {
          corrections.push({
            type: 'AMOUNT',
            field: `transactions[${i}].amount`,
            original: tx.amountCents,
            corrected: correctedAmount,
            confidence: 80,
            reason: `Dividing transaction amount by ${divisor} reconciles the statement. Description: "${tx.description}"`,
          });
        }
      }
    }

    // Strategy 3: If difference is exactly a multiple of a transaction amount,
    // the transaction might be missing or duplicated
    const absDiff = Math.abs(diff);
    for (const tx of transactions) {
      if (tx.amountCents === absDiff) {
        corrections.push({
          type: 'AMOUNT',
          field: 'possibleDuplicateOrMissing',
          original: tx.amountCents,
          corrected: 0,
          confidence: 60,
          reason: `Difference exactly matches transaction "${tx.description}" - may be duplicate or missing`,
        });
        break;
      }
    }

    // Sort by confidence (highest first)
    corrections.sort((a, b) => b.confidence - a.confidence);

    return corrections;
  }

  /**
   * Generate validation flags based on reconciliation result
   */
  generateFlags(reconciliation: ReconciliationResult): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    if (!reconciliation.reconciled) {
      flags.push({
        severity: 'ERROR',
        code: 'BALANCE_MISMATCH',
        message: `Balance off by R ${(reconciliation.difference / 100).toFixed(2)} (${reconciliation.percentDifference.toFixed(1)}%)`,
        affectedField: 'balance',
      });

      // Add severity-based warning
      if (reconciliation.percentDifference > 50) {
        flags.push({
          severity: 'ERROR',
          code: 'SEVERE_BALANCE_MISMATCH',
          message: `Balance difference exceeds 50% - likely OCR extraction failure`,
        });
      } else if (reconciliation.percentDifference > 10) {
        flags.push({
          severity: 'WARNING',
          code: 'SIGNIFICANT_BALANCE_MISMATCH',
          message: `Balance difference exceeds 10% - review extracted amounts`,
        });
      }
    }

    return flags;
  }
}
