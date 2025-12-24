/**
 * Accuracy Metrics Service
 * TASK-TRANS-017: Transaction Categorization Accuracy Tracking
 *
 * Tracks and reports on AI categorization accuracy.
 * Measures accuracy as: (totalCategorized - totalCorrected) / totalCategorized * 100
 */

import { Injectable, Logger } from '@nestjs/common';
import { MetricEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccuracyOptions,
  AccuracyReport,
  AccuracyTrend,
  ThresholdCheckResult,
  RecordCategorizationInput,
  RecordCorrectionInput,
  ACCURACY_CONSTANTS,
} from '../dto/accuracy.dto';

@Injectable()
export class AccuracyMetricsService {
  private readonly logger = new Logger(AccuracyMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a categorization event
   * Called after each auto or manual categorization
   *
   * @param tenantId - Tenant ID
   * @param input - Categorization details
   */
  async recordCategorization(
    tenantId: string,
    input: RecordCategorizationInput,
  ): Promise<void> {
    this.logger.debug(
      `Recording categorization for transaction ${input.transactionId}`,
    );

    await this.prisma.categorizationMetric.create({
      data: {
        tenantId,
        transactionId: input.transactionId,
        eventType: MetricEventType.CATEGORIZED,
        confidence: input.confidence,
        isAutoApplied: input.isAutoApplied,
        originalAccountCode: input.accountCode,
      },
    });
  }

  /**
   * Record a correction event
   * Called when user overrides an existing categorization
   *
   * @param tenantId - Tenant ID
   * @param input - Correction details
   */
  async recordCorrection(
    tenantId: string,
    input: RecordCorrectionInput,
  ): Promise<void> {
    this.logger.debug(
      `Recording correction for transaction ${input.transactionId}`,
    );

    await this.prisma.categorizationMetric.create({
      data: {
        tenantId,
        transactionId: input.transactionId,
        eventType: MetricEventType.CORRECTED,
        confidence: 0, // Corrections have 0 confidence (user override)
        isAutoApplied: false,
        originalAccountCode: input.originalAccountCode,
        correctedAccountCode: input.correctedAccountCode,
      },
    });
  }

  /**
   * Get accuracy report for a tenant
   *
   * @param tenantId - Tenant ID
   * @param options - Optional date range and rolling window
   * @returns Accuracy report
   */
  async getAccuracy(
    tenantId: string,
    options?: AccuracyOptions,
  ): Promise<AccuracyReport> {
    const rollingDays =
      options?.rollingDays ?? ACCURACY_CONSTANTS.DEFAULT_ROLLING_DAYS;
    const toDate = options?.toDate ?? new Date();
    const fromDate =
      options?.fromDate ?? this.getDateDaysAgo(toDate, rollingDays);

    // Get metrics for period
    const metrics = await this.prisma.categorizationMetric.findMany({
      where: {
        tenantId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
    });

    // Calculate statistics
    const categorized = metrics.filter(
      (m) => m.eventType === MetricEventType.CATEGORIZED,
    );
    const corrected = metrics.filter(
      (m) => m.eventType === MetricEventType.CORRECTED,
    );

    const totalCategorized = categorized.length;
    const totalCorrected = corrected.length;

    // Accuracy = (correct) / total * 100
    // Correct = categorized - corrected (assuming each correction is for a categorized tx)
    const correctCount = Math.max(0, totalCategorized - totalCorrected);
    const accuracyPercentage =
      totalCategorized > 0
        ? Math.round((correctCount / totalCategorized) * 10000) / 100
        : 100;

    // Average confidence
    const totalConfidence = categorized.reduce(
      (sum, m) => sum + Number(m.confidence),
      0,
    );
    const averageConfidence =
      totalCategorized > 0
        ? Math.round((totalConfidence / totalCategorized) * 100) / 100
        : 0;

    // Auto-apply rate
    const autoApplied = categorized.filter((m) => m.isAutoApplied).length;
    const autoApplyRate =
      totalCategorized > 0
        ? Math.round((autoApplied / totalCategorized) * 10000) / 100
        : 0;

    return {
      tenantId,
      periodStart: fromDate,
      periodEnd: toDate,
      totalCategorized,
      totalCorrected,
      accuracyPercentage,
      averageConfidence,
      autoApplyRate,
    };
  }

  /**
   * Get accuracy trend over time
   *
   * @param tenantId - Tenant ID
   * @param periodDays - Number of days to analyze
   * @returns Array of accuracy data points by week
   */
  async getTrend(
    tenantId: string,
    periodDays: number,
  ): Promise<AccuracyTrend[]> {
    const toDate = new Date();
    const fromDate = this.getDateDaysAgo(toDate, periodDays);

    // Get all metrics in period
    const metrics = await this.prisma.categorizationMetric.findMany({
      where: {
        tenantId,
        date: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    // Group by week
    const weeklyData = new Map<
      string,
      { categorized: number; corrected: number; total: number }
    >();

    for (const metric of metrics) {
      const weekKey = this.getWeekKey(metric.date);

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, { categorized: 0, corrected: 0, total: 0 });
      }

      const data = weeklyData.get(weekKey)!;

      if (metric.eventType === MetricEventType.CATEGORIZED) {
        data.categorized++;
      } else {
        data.corrected++;
      }
      data.total++;
    }

    // Calculate accuracy for each week
    const trends: AccuracyTrend[] = [];

    for (const [period, data] of weeklyData.entries()) {
      const correctCount = Math.max(0, data.categorized - data.corrected);
      const accuracyPercentage =
        data.categorized > 0
          ? Math.round((correctCount / data.categorized) * 10000) / 100
          : 100;

      trends.push({
        period,
        accuracyPercentage,
        totalTransactions: data.categorized,
      });
    }

    // Sort by period
    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Check if accuracy is above threshold
   *
   * @param tenantId - Tenant ID
   * @returns Threshold check result with alert level
   */
  async checkThreshold(tenantId: string): Promise<ThresholdCheckResult> {
    const report = await this.getAccuracy(tenantId);
    const accuracy = report.accuracyPercentage;

    if (accuracy >= ACCURACY_CONSTANTS.TARGET_ACCURACY) {
      return {
        isAboveThreshold: true,
        currentAccuracy: accuracy,
        threshold: ACCURACY_CONSTANTS.TARGET_ACCURACY,
        message: `Accuracy at ${accuracy}% - meeting target of ${ACCURACY_CONSTANTS.TARGET_ACCURACY}%`,
      };
    }

    if (accuracy >= ACCURACY_CONSTANTS.WARNING_THRESHOLD) {
      return {
        isAboveThreshold: true,
        currentAccuracy: accuracy,
        threshold: ACCURACY_CONSTANTS.WARNING_THRESHOLD,
        alertLevel: 'WARNING',
        message: `Accuracy at ${accuracy}% - below target of ${ACCURACY_CONSTANTS.TARGET_ACCURACY}%`,
      };
    }

    if (accuracy >= ACCURACY_CONSTANTS.CRITICAL_THRESHOLD) {
      return {
        isAboveThreshold: true,
        currentAccuracy: accuracy,
        threshold: ACCURACY_CONSTANTS.CRITICAL_THRESHOLD,
        alertLevel: 'WARNING',
        message: `Accuracy at ${accuracy}% - approaching critical threshold of ${ACCURACY_CONSTANTS.CRITICAL_THRESHOLD}%`,
      };
    }

    return {
      isAboveThreshold: false,
      currentAccuracy: accuracy,
      threshold: ACCURACY_CONSTANTS.CRITICAL_THRESHOLD,
      alertLevel: 'CRITICAL',
      message: `CRITICAL: Accuracy at ${accuracy}% - below critical threshold of ${ACCURACY_CONSTANTS.CRITICAL_THRESHOLD}%`,
    };
  }

  /**
   * Get statistics summary for dashboard
   *
   * @param tenantId - Tenant ID
   * @returns Summary statistics
   */
  async getSummaryStats(tenantId: string): Promise<{
    accuracy30Day: number;
    accuracy7Day: number;
    totalCategorizationsToday: number;
    correctionsToday: number;
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  }> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const [report30Day, report7Day, todayMetrics] = await Promise.all([
      this.getAccuracy(tenantId, { rollingDays: 30 }),
      this.getAccuracy(tenantId, { rollingDays: 7 }),
      this.prisma.categorizationMetric.findMany({
        where: {
          tenantId,
          date: { gte: startOfDay },
        },
      }),
    ]);

    const todayCategorizations = todayMetrics.filter(
      (m) => m.eventType === MetricEventType.CATEGORIZED,
    ).length;
    const todayCorrections = todayMetrics.filter(
      (m) => m.eventType === MetricEventType.CORRECTED,
    ).length;

    // Determine trend
    let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
    const diff = report7Day.accuracyPercentage - report30Day.accuracyPercentage;

    if (diff > 2) {
      trend = 'IMPROVING';
    } else if (diff < -2) {
      trend = 'DECLINING';
    }

    return {
      accuracy30Day: report30Day.accuracyPercentage,
      accuracy7Day: report7Day.accuracyPercentage,
      totalCategorizationsToday: todayCategorizations,
      correctionsToday: todayCorrections,
      trend,
    };
  }

  /**
   * Get date N days ago
   */
  private getDateDaysAgo(fromDate: Date, days: number): Date {
    const date = new Date(fromDate);
    date.setDate(date.getDate() - days);
    return date;
  }

  /**
   * Get week key for grouping (YYYY-Www format)
   */
  private getWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Set to Thursday of current week to get correct ISO week
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = Math.ceil(
      ((d.getTime() - week1.getTime()) / 86400000 + week1.getDay() + 1) / 7,
    );
    return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
  }
}
