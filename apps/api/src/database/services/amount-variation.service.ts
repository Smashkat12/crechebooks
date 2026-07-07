/**
 * Amount Variation Service
 * TASK-EC-003: Recurring Amount Variation Threshold Configuration
 *
 * @module database/services/amount-variation
 * @description Analyze recurring transaction amount variations with
 * compile-time thresholds and statistical analysis (mean, stdDev, z-score).
 *
 * Threshold configuration surface was removed 2026-07: it cached in-memory
 * only, no controller or UI ever wrote to it, so callers of
 * setThresholdConfig would silently lose values across restarts. If
 * per-tenant configurability becomes a real requirement, back this with a
 * Prisma model + endpoint rather than an in-memory cache.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { TransactionRepository } from '../repositories/transaction.repository';

/**
 * Payee statistics for amount analysis
 */
export interface Statistics {
  tenantId: string;
  payee: string;
  transactionCount: number;
  meanAmountCents: number;
  stdDevAmountCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  lastUpdated: Date;
}

/**
 * Amount variation analysis result
 */
export interface VariationAnalysis {
  currentAmount: Decimal;
  historicalMean: Decimal;
  historicalStdDev: Decimal;
  percentageVariation: number; // e.g., 45.5 for 45.5%
  absoluteVariation: Decimal;
  zScore: number;
  exceedsThreshold: boolean;
  thresholdType: 'percentage';
  thresholdValue: number;
  recommendedAction: 'auto_categorize' | 'flag_review' | 'block';
}

/**
 * Compile-time thresholds. Intentionally not tenant-configurable — see
 * module docstring.
 */
const PERCENTAGE_THRESHOLD = 30; // 30% deviation from mean = flag
const MIN_TRANSACTIONS_FOR_STATS = 3; // Minimum 3 historical transactions

@Injectable()
export class AmountVariationService {
  private readonly logger = new Logger(AmountVariationService.name);

  constructor(private readonly transactionRepo: TransactionRepository) {}

  /**
   * Analyze amount variation for a transaction
   * Calculates mean, stdDev, z-score, and checks against threshold constant.
   *
   * @param tenantId - Tenant ID for isolation
   * @param payee - Payee name
   * @param amount - Current transaction amount
   * @returns VariationAnalysis with statistical metrics and recommended action
   */
  async analyzeVariation(
    tenantId: string,
    payee: string,
    amount: Decimal,
  ): Promise<VariationAnalysis | null> {
    this.logger.debug(
      `Analyzing amount variation for payee: ${payee}, amount: ${amount}`,
    );

    // Get historical transactions for payee (last 12 months)
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - 12);

    const result = await this.transactionRepo.findByTenant(tenantId, {
      search: payee,
      dateFrom,
    });

    // Filter to exact payee matches (case-insensitive)
    const transactions = result.data.filter(
      (t) =>
        t.payeeName &&
        this.normalizePayeeName(t.payeeName) === this.normalizePayeeName(payee),
    );

    if (transactions.length < MIN_TRANSACTIONS_FOR_STATS) {
      this.logger.debug(
        `Not enough historical data (${transactions.length}) for statistics`,
      );
      return null; // Need minimum 3 transactions
    }

    // Calculate statistics
    const amounts = transactions.map((t) => t.amountCents);
    const meanAmountCents =
      amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const variance =
      amounts.reduce(
        (sum, val) => sum + Math.pow(val - meanAmountCents, 2),
        0,
      ) / amounts.length;
    const stdDevAmountCents = Math.sqrt(variance);

    // Convert amount to number for calculations
    const currentAmountCents =
      typeof amount === 'object' && 'toNumber' in amount
        ? amount.toNumber()
        : Number(amount);

    // Calculate variations
    const absoluteVariationCents = Math.abs(
      currentAmountCents - meanAmountCents,
    );
    const percentageVariation =
      meanAmountCents !== 0
        ? (absoluteVariationCents / Math.abs(meanAmountCents)) * 100
        : 0;
    const zScore =
      stdDevAmountCents !== 0
        ? (currentAmountCents - meanAmountCents) / stdDevAmountCents
        : 0;

    // Check threshold (percentage)
    const exceedsThreshold = percentageVariation > PERCENTAGE_THRESHOLD;

    // Determine recommended action based on severity
    let recommendedAction: 'auto_categorize' | 'flag_review' | 'block';
    if (!exceedsThreshold) {
      recommendedAction = 'auto_categorize';
    } else if (percentageVariation >= 100 || Math.abs(zScore) > 3) {
      // 100%+ variation or >3 std devs = block
      recommendedAction = 'block';
    } else {
      // Exceeds threshold but not extreme = flag for review
      recommendedAction = 'flag_review';
    }

    const analysis: VariationAnalysis = {
      currentAmount: new Decimal(currentAmountCents),
      historicalMean: new Decimal(meanAmountCents),
      historicalStdDev: new Decimal(stdDevAmountCents),
      percentageVariation: Math.round(percentageVariation * 100) / 100,
      absoluteVariation: new Decimal(absoluteVariationCents),
      zScore: Math.round(zScore * 100) / 100,
      exceedsThreshold,
      thresholdType: 'percentage',
      thresholdValue: PERCENTAGE_THRESHOLD,
      recommendedAction,
    };

    this.logger.log(
      `Amount variation analysis: ${payee} - ${percentageVariation.toFixed(1)}% variation, ` +
        `z-score: ${zScore.toFixed(2)}, action: ${recommendedAction}`,
    );

    return analysis;
  }

  /**
   * Get payee statistics for amount analysis
   *
   * @param tenantId - Tenant ID
   * @param payee - Payee name
   * @returns Statistics with mean, stdDev, min, max
   */
  async getPayeeStatistics(
    tenantId: string,
    payee: string,
  ): Promise<Statistics | null> {
    this.logger.debug(`Getting statistics for payee: ${payee}`);

    // Get historical transactions for payee (last 12 months)
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - 12);

    const result = await this.transactionRepo.findByTenant(tenantId, {
      search: payee,
      dateFrom,
    });

    // Filter to exact payee matches (case-insensitive)
    const transactions = result.data.filter(
      (t) =>
        t.payeeName &&
        this.normalizePayeeName(t.payeeName) === this.normalizePayeeName(payee),
    );

    if (transactions.length < MIN_TRANSACTIONS_FOR_STATS) {
      this.logger.debug(
        `Not enough historical data (${transactions.length}) for statistics`,
      );
      return null;
    }

    // Calculate statistics
    const amounts = transactions.map((t) => t.amountCents);
    const meanAmountCents =
      amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const variance =
      amounts.reduce(
        (sum, val) => sum + Math.pow(val - meanAmountCents, 2),
        0,
      ) / amounts.length;
    const stdDevAmountCents = Math.sqrt(variance);
    const minAmountCents = Math.min(...amounts);
    const maxAmountCents = Math.max(...amounts);

    return {
      tenantId,
      payee,
      transactionCount: transactions.length,
      meanAmountCents: Math.round(meanAmountCents),
      stdDevAmountCents: Math.round(stdDevAmountCents),
      minAmountCents,
      maxAmountCents,
      lastUpdated: new Date(),
    };
  }

  /**
   * Normalize payee name for consistent matching
   * @param payee - Payee name to normalize
   * @returns Normalized payee name (uppercase, trimmed)
   */
  private normalizePayeeName(payee: string): string {
    return payee.toUpperCase().trim();
  }
}
