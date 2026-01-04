/**
 * Amount Variation Service
 * TASK-EC-003: Recurring Amount Variation Threshold Configuration
 *
 * @module database/services/amount-variation
 * @description Analyze recurring transaction amount variations with configurable thresholds
 * and statistical analysis (mean, stdDev, z-score).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { TransactionRepository } from '../repositories/transaction.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Amount threshold configuration
 * Can be set per-tenant or per-payee (payee overrides tenant)
 */
export interface AmountThresholdConfig {
  tenantId: string;
  payee?: string | null;
  thresholdType: 'percentage' | 'absolute' | 'z_score';
  percentageThreshold?: number; // e.g., 30 for 30%
  absoluteThresholdCents?: number; // e.g., 10000 for R100
  zScoreThreshold?: number; // e.g., 2.5 for statistical anomaly
  createdAt: Date;
  updatedAt: Date;
}

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
  thresholdType: 'percentage' | 'absolute' | 'z_score';
  thresholdValue: number;
  recommendedAction: 'auto_categorize' | 'flag_review' | 'block';
}

/**
 * Default thresholds
 */
const DEFAULT_PERCENTAGE_THRESHOLD = 30; // 30%
const DEFAULT_Z_SCORE_THRESHOLD = 2.5; // 2.5 standard deviations
const MIN_TRANSACTIONS_FOR_STATS = 3; // Minimum 3 historical transactions

@Injectable()
export class AmountVariationService {
  private readonly logger = new Logger(AmountVariationService.name);

  // In-memory cache for threshold configs (keyed by tenantId:payee)
  private thresholdCache = new Map<string, AmountThresholdConfig>();

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Analyze amount variation for a transaction
   * Calculates mean, stdDev, z-score, and checks against configured threshold
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

    // Get threshold configuration (per-payee or tenant default)
    const config = await this.getThresholdConfig(tenantId, payee);

    // Check if threshold exceeded
    let exceedsThreshold = false;
    let thresholdValue = 0;

    switch (config.thresholdType) {
      case 'percentage':
        thresholdValue =
          config.percentageThreshold || DEFAULT_PERCENTAGE_THRESHOLD;
        exceedsThreshold = percentageVariation > thresholdValue;
        break;
      case 'absolute':
        thresholdValue = config.absoluteThresholdCents || 0;
        exceedsThreshold = absoluteVariationCents > thresholdValue;
        break;
      case 'z_score':
        thresholdValue = config.zScoreThreshold || DEFAULT_Z_SCORE_THRESHOLD;
        exceedsThreshold = Math.abs(zScore) > thresholdValue;
        break;
    }

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
      thresholdType: config.thresholdType,
      thresholdValue,
      recommendedAction,
    };

    this.logger.log(
      `Amount variation analysis: ${payee} - ${percentageVariation.toFixed(1)}% variation, ` +
        `z-score: ${zScore.toFixed(2)}, action: ${recommendedAction}`,
    );

    return analysis;
  }

  /**
   * Get threshold configuration for a tenant/payee
   * Per-payee config overrides tenant default
   *
   * @param tenantId - Tenant ID
   * @param payee - Optional payee name for per-payee config
   * @returns AmountThresholdConfig
   */
  async getThresholdConfig(
    tenantId: string,
    payee?: string,
  ): Promise<AmountThresholdConfig> {
    // Try per-payee config first (if payee provided)
    if (payee) {
      const payeeCacheKey = `${tenantId}:${this.normalizePayeeName(payee)}`;
      if (this.thresholdCache.has(payeeCacheKey)) {
        return this.thresholdCache.get(payeeCacheKey)!;
      }
    }

    // Fall back to tenant default
    const defaultCacheKey = `${tenantId}:default`;
    if (this.thresholdCache.has(defaultCacheKey)) {
      return this.thresholdCache.get(defaultCacheKey)!;
    }

    const cacheKey = payee
      ? `${tenantId}:${this.normalizePayeeName(payee)}`
      : `${tenantId}:default`;

    // Try to load from storage (future enhancement - for now, return default)
    // In a full implementation, this would query a AmountThresholdConfig table

    // Return default configuration
    const defaultConfig: AmountThresholdConfig = {
      tenantId,
      payee: payee || null,
      thresholdType: 'percentage',
      percentageThreshold: DEFAULT_PERCENTAGE_THRESHOLD,
      zScoreThreshold: DEFAULT_Z_SCORE_THRESHOLD,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Cache it
    this.thresholdCache.set(cacheKey, defaultConfig);

    return defaultConfig;
  }

  /**
   * Set threshold configuration for a tenant/payee
   * Creates audit log entry for the change
   *
   * @param tenantId - Tenant ID
   * @param config - Threshold configuration
   * @param payee - Optional payee name for per-payee config
   * @returns Updated AmountThresholdConfig
   */
  async setThresholdConfig(
    tenantId: string,
    config: Partial<AmountThresholdConfig>,
    payee?: string,
  ): Promise<AmountThresholdConfig> {
    const cacheKey = payee
      ? `${tenantId}:${this.normalizePayeeName(payee)}`
      : `${tenantId}:default`;

    // Validate configuration BEFORE merging with defaults
    if (
      config.thresholdType === 'percentage' &&
      config.percentageThreshold === undefined &&
      !this.thresholdCache.has(cacheKey)
    ) {
      throw new Error(
        'percentageThreshold required for percentage threshold type',
      );
    }
    if (
      config.thresholdType === 'absolute' &&
      config.absoluteThresholdCents === undefined &&
      !this.thresholdCache.has(cacheKey)
    ) {
      throw new Error(
        'absoluteThresholdCents required for absolute threshold type',
      );
    }
    if (
      config.thresholdType === 'z_score' &&
      config.zScoreThreshold === undefined &&
      !this.thresholdCache.has(cacheKey)
    ) {
      throw new Error('zScoreThreshold required for z_score threshold type');
    }

    // Get existing config
    const existing = await this.getThresholdConfig(tenantId, payee);

    // Merge with new config
    const updated: AmountThresholdConfig = {
      ...existing,
      ...config,
      tenantId,
      payee: payee || null,
      updatedAt: new Date(),
    };

    // Store in cache
    this.thresholdCache.set(cacheKey, updated);

    // TODO: Persist to database (future enhancement)
    // await this.prisma.amountThresholdConfig.upsert(...)

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'AmountThresholdConfig',
        entityId: cacheKey,
        action: 'UPDATE',
        beforeValue: existing as any,
        afterValue: updated as any,
        changeSummary: `Updated amount threshold config for ${payee || 'tenant default'}`,
      },
    });

    this.logger.log(
      `Threshold config updated for ${payee || 'tenant default'}: ` +
        `${updated.thresholdType} = ${updated.percentageThreshold || updated.absoluteThresholdCents || updated.zScoreThreshold}`,
    );

    return updated;
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

  /**
   * Clear threshold cache (useful for testing)
   */
  clearCache(): void {
    this.thresholdCache.clear();
    this.logger.debug('Threshold cache cleared');
  }
}
