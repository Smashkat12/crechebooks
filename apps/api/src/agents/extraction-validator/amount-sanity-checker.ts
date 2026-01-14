/**
 * Amount Sanity Checker
 * TASK-AGENT-006
 *
 * Validates that extracted amounts are within reasonable ranges
 * for a South African creche bank account
 */
import { Injectable, Logger } from '@nestjs/common';
import { SanityResult, ValidationFlag } from './interfaces/validator.interface';

// Reasonable limits for a creche business account in cents
const LIMITS = {
  // Transaction limits
  MAX_TRANSACTION_CENTS: 100_000_000,     // R 1,000,000 - max single transaction
  SUSPICIOUS_TRANSACTION_CENTS: 10_000_000, // R 100,000 - flag for review
  MIN_TRANSACTION_CENTS: 1,               // R 0.01 - minimum transaction

  // Balance limits
  MAX_BALANCE_CENTS: 1_000_000_000,       // R 10,000,000 - max account balance
  SUSPICIOUS_BALANCE_CENTS: 50_000_000,   // R 500,000 - large balance for creche

  // Typical ranges for common creche transactions
  TYPICAL_SCHOOL_FEE_MIN: 100_000,        // R 1,000
  TYPICAL_SCHOOL_FEE_MAX: 1_000_000,      // R 10,000
  TYPICAL_SALARY_MIN: 500_000,            // R 5,000
  TYPICAL_SALARY_MAX: 5_000_000,          // R 50,000
};

@Injectable()
export class AmountSanityChecker {
  private readonly logger = new Logger(AmountSanityChecker.name);

  /**
   * Check if an amount is within reasonable bounds
   */
  checkAmount(amountCents: number, type: 'TRANSACTION' | 'BALANCE'): SanityResult {
    const maxAllowed = type === 'TRANSACTION'
      ? LIMITS.MAX_TRANSACTION_CENTS
      : LIMITS.MAX_BALANCE_CENTS;

    const suspiciousThreshold = type === 'TRANSACTION'
      ? LIMITS.SUSPICIOUS_TRANSACTION_CENTS
      : LIMITS.SUSPICIOUS_BALANCE_CENTS;

    // Check for negative amounts (invalid)
    if (amountCents < 0 && type === 'TRANSACTION') {
      return {
        valid: false,
        flag: 'NEGATIVE_AMOUNT',
        message: `Negative transaction amount R ${(amountCents / 100).toFixed(2)} is invalid`,
      };
    }

    // Check for zero amounts (suspicious for transactions)
    if (amountCents === 0 && type === 'TRANSACTION') {
      return {
        valid: false,
        flag: 'ZERO_AMOUNT',
        message: 'Zero transaction amount is invalid',
      };
    }

    // Check for amounts exceeding maximum
    if (Math.abs(amountCents) > maxAllowed) {
      return {
        valid: false,
        flag: 'AMOUNT_EXCEEDS_MAX',
        message: `Amount R ${(amountCents / 100).toFixed(2)} exceeds maximum R ${(maxAllowed / 100).toFixed(2)} for ${type.toLowerCase()}`,
        suggestedCorrection: this.suggestCorrection(amountCents, maxAllowed),
      };
    }

    // Check for suspicious amounts (valid but flagged)
    if (Math.abs(amountCents) > suspiciousThreshold) {
      return {
        valid: true,
        flag: 'AMOUNT_SUSPICIOUS',
        message: `Large amount R ${(amountCents / 100).toFixed(2)} may need verification`,
      };
    }

    // Amount is valid and not suspicious
    return { valid: true };
  }

  /**
   * Suggest a correction for an invalid amount
   * Tries dividing by powers of 10 to find a reasonable value
   */
  suggestCorrection(amountCents: number, maxAllowed: number): number | null {
    const absAmount = Math.abs(amountCents);

    // Try dividing by powers of 10 to find reasonable amount
    for (const divisor of [100, 1000, 10000, 10]) {
      const corrected = Math.round(absAmount / divisor);

      // Check if corrected amount is reasonable
      if (
        corrected >= LIMITS.MIN_TRANSACTION_CENTS &&
        corrected <= maxAllowed
      ) {
        this.logger.debug(
          `Suggested correction: ${amountCents} → ${corrected} (divided by ${divisor})`
        );
        return corrected;
      }
    }

    return null;
  }

  /**
   * Check all amounts in a statement and generate flags
   */
  checkStatement(
    openingBalance: number,
    closingBalance: number,
    transactions: Array<{ amountCents: number; description: string }>,
  ): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    // Check opening balance
    const openingResult = this.checkAmount(openingBalance, 'BALANCE');
    if (!openingResult.valid || openingResult.flag) {
      flags.push({
        severity: openingResult.valid ? 'WARNING' : 'ERROR',
        code: openingResult.flag || 'BALANCE_CHECK_FAILED',
        message: openingResult.message || 'Opening balance check failed',
        affectedField: 'openingBalance',
        suggestedValue: openingResult.suggestedCorrection ?? undefined,
      });
    }

    // Check closing balance
    const closingResult = this.checkAmount(closingBalance, 'BALANCE');
    if (!closingResult.valid || closingResult.flag) {
      flags.push({
        severity: closingResult.valid ? 'WARNING' : 'ERROR',
        code: closingResult.flag || 'BALANCE_CHECK_FAILED',
        message: closingResult.message || 'Closing balance check failed',
        affectedField: 'closingBalance',
        suggestedValue: closingResult.suggestedCorrection ?? undefined,
      });
    }

    // Check each transaction
    transactions.forEach((tx, index) => {
      const result = this.checkAmount(tx.amountCents, 'TRANSACTION');
      if (!result.valid || result.flag) {
        flags.push({
          severity: result.valid ? 'WARNING' : 'ERROR',
          code: result.flag || 'AMOUNT_CHECK_FAILED',
          message: `${result.message || 'Amount check failed'} - "${tx.description}"`,
          affectedField: `transactions[${index}].amount`,
          lineNumber: index,
          suggestedValue: result.suggestedCorrection ?? undefined,
        });
      }
    });

    return flags;
  }

  /**
   * Calculate a sanity score based on amount distribution
   * Returns 0-20 points based on how reasonable the amounts look
   */
  calculateSanityScore(
    openingBalance: number,
    closingBalance: number,
    transactions: Array<{ amountCents: number }>,
  ): number {
    let score = 20;

    // Deduct points for invalid amounts
    const openingCheck = this.checkAmount(openingBalance, 'BALANCE');
    if (!openingCheck.valid) score -= 5;

    const closingCheck = this.checkAmount(closingBalance, 'BALANCE');
    if (!closingCheck.valid) score -= 5;

    // Count invalid transactions
    let invalidTransactions = 0;
    for (const tx of transactions) {
      const check = this.checkAmount(tx.amountCents, 'TRANSACTION');
      if (!check.valid) invalidTransactions++;
    }

    // Deduct based on percentage of invalid transactions
    if (transactions.length > 0) {
      const invalidPercent = (invalidTransactions / transactions.length) * 100;
      if (invalidPercent > 50) score -= 10;
      else if (invalidPercent > 20) score -= 5;
      else if (invalidPercent > 0) score -= 2;
    }

    return Math.max(0, score);
  }
}
