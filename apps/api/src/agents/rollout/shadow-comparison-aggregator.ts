/**
 * Shadow Comparison Aggregator
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * @module agents/rollout/shadow-comparison-aggregator
 * @description Aggregates SHADOW comparison data from the shadow_comparisons table.
 * Produces comparison reports, Prometheus-compatible metrics, and dashboard summaries.
 * Gracefully degrades when Prisma is unavailable (returns empty reports).
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import type {
  ComparisonReport,
  PromotableAgentType,
  PromotionCriteria,
  AgentMetric,
} from './interfaces/comparison-report.interface';
import { DEFAULT_PROMOTION_CRITERIA } from './interfaces/comparison-report.interface';

/** Shape of a ShadowComparison row returned from Prisma */
interface ShadowComparisonRow {
  id: string;
  tenantId: string;
  agentType: string;
  sdkResult: unknown;
  sdkConfidence: number;
  sdkDurationMs: number;
  heuristicResult: unknown;
  heuristicConfidence: number;
  heuristicDurationMs: number;
  resultsMatch: boolean;
  matchDetails: unknown;
  createdAt: Date;
}

@Injectable()
export class ShadowComparisonAggregator {
  private readonly logger = new Logger(ShadowComparisonAggregator.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
  ) {}

  /**
   * Generate a comparison report for a specific agent type and tenant.
   * Aggregates data from the shadow_comparisons table.
   *
   * @param agentType - Agent type to report on
   * @param tenantId - Tenant ID
   * @param periodDays - Number of days to include (default: 7)
   * @param criteria - Promotion criteria to evaluate against
   * @returns Aggregated comparison report
   */
  async generateReport(
    agentType: PromotableAgentType,
    tenantId: string,
    periodDays: number = 7,
    criteria: PromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
  ): Promise<ComparisonReport> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const emptyReport = this.buildEmptyReport(
      agentType,
      tenantId,
      startDate,
      endDate,
      periodDays,
      criteria,
    );

    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — returning empty report');
      return emptyReport;
    }

    try {
      const comparisons: ShadowComparisonRow[] =
        await this.prisma.shadowComparison.findMany({
          where: {
            agentType,
            tenantId,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { createdAt: 'desc' },
        });

      return this.aggregateComparisons(
        comparisons,
        agentType,
        tenantId,
        startDate,
        endDate,
        periodDays,
        criteria,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to generate report for ${agentType}: ${msg}`);
      return emptyReport;
    }
  }

  /**
   * Generate reports for ALL agent types for a given tenant.
   */
  async generateAllReports(
    tenantId: string,
    periodDays: number = 7,
  ): Promise<ComparisonReport[]> {
    const agentTypes: PromotableAgentType[] = [
      'categorizer',
      'matcher',
      'sars',
      'validator',
      'orchestrator',
    ];

    return Promise.all(
      agentTypes.map((type) =>
        this.generateReport(type, tenantId, periodDays),
      ),
    );
  }

  /**
   * Get Prometheus-compatible metrics for all agents.
   * Returns metrics suitable for /metrics endpoint or monitoring.
   */
  async getMetrics(tenantId: string): Promise<AgentMetric[]> {
    const reports = await this.generateAllReports(tenantId, 1); // Last 24h
    const metrics: AgentMetric[] = [];

    for (const report of reports) {
      const tenantLabel = tenantId.substring(0, 8);
      metrics.push(
        {
          name: 'crechebooks_agent_decision_count',
          labels: { agent: report.agentType, tenant: tenantLabel },
          value: report.totalDecisions,
          type: 'counter',
        },
        {
          name: 'crechebooks_agent_match_rate',
          labels: { agent: report.agentType, tenant: tenantLabel },
          value: report.matchRate,
          type: 'gauge',
        },
        {
          name: 'crechebooks_agent_sdk_latency_ms',
          labels: { agent: report.agentType, tenant: tenantLabel },
          value: report.sdkAvgLatencyMs,
          type: 'gauge',
        },
        {
          name: 'crechebooks_agent_heuristic_latency_ms',
          labels: { agent: report.agentType, tenant: tenantLabel },
          value: report.heuristicAvgLatencyMs,
          type: 'gauge',
        },
        {
          name: 'crechebooks_agent_sdk_confidence',
          labels: { agent: report.agentType, tenant: tenantLabel },
          value: report.sdkAvgConfidence,
          type: 'gauge',
        },
      );
    }

    return metrics;
  }

  /**
   * Dashboard query: aggregate match rates across agents.
   * Used for quick operational overview.
   */
  async getDashboardSummary(
    tenantId: string,
    periodDays: number = 7,
  ): Promise<
    Array<{
      agentType: string;
      totalDecisions: number;
      matchRate: number;
      meetsPromotionCriteria: boolean;
    }>
  > {
    const reports = await this.generateAllReports(tenantId, periodDays);
    return reports.map((r) => ({
      agentType: r.agentType,
      totalDecisions: r.totalDecisions,
      matchRate: r.matchRate,
      meetsPromotionCriteria: r.meetsPromotionCriteria,
    }));
  }

  /**
   * Aggregate raw comparison rows into a ComparisonReport.
   */
  private aggregateComparisons(
    comparisons: ShadowComparisonRow[],
    agentType: PromotableAgentType,
    tenantId: string,
    startDate: Date,
    endDate: Date,
    periodDays: number,
    criteria: PromotionCriteria,
  ): ComparisonReport {
    const totalDecisions = comparisons.length;

    if (totalDecisions === 0) {
      return this.buildEmptyReport(
        agentType,
        tenantId,
        startDate,
        endDate,
        periodDays,
        criteria,
      );
    }

    const matches = comparisons.filter((c) => c.resultsMatch);
    const matchRate = Math.round((matches.length / totalDecisions) * 100);

    let sdkBetter = 0;
    let heuristicBetter = 0;
    let identical = 0;
    let totalLatencyDiff = 0;
    let totalSdkLatency = 0;
    let totalHeuristicLatency = 0;
    let totalSdkConfidence = 0;
    let totalHeuristicConfidence = 0;

    for (const comp of comparisons) {
      if (comp.resultsMatch) {
        identical++;
      } else if (comp.sdkConfidence > comp.heuristicConfidence) {
        sdkBetter++;
      } else {
        heuristicBetter++;
      }

      totalLatencyDiff += comp.sdkDurationMs - comp.heuristicDurationMs;
      totalSdkLatency += comp.sdkDurationMs;
      totalHeuristicLatency += comp.heuristicDurationMs;
      totalSdkConfidence += comp.sdkConfidence;
      totalHeuristicConfidence += comp.heuristicConfidence;
    }

    const avgLatencyDiffMs = Math.round(totalLatencyDiff / totalDecisions);
    const sdkAvgLatencyMs = Math.round(totalSdkLatency / totalDecisions);
    const heuristicAvgLatencyMs = Math.round(
      totalHeuristicLatency / totalDecisions,
    );
    const sdkAvgConfidence = Math.round(totalSdkConfidence / totalDecisions);
    const heuristicAvgConfidence = Math.round(
      totalHeuristicConfidence / totalDecisions,
    );

    // Evaluate promotion criteria
    const promotionBlockers: string[] = [];
    const latencyMultiplier =
      heuristicAvgLatencyMs > 0
        ? sdkAvgLatencyMs / heuristicAvgLatencyMs
        : 1;

    if (matchRate < criteria.minMatchRate) {
      promotionBlockers.push(
        `Match rate ${matchRate}% < required ${criteria.minMatchRate}%`,
      );
    }
    if (latencyMultiplier > criteria.maxLatencyMultiplier) {
      promotionBlockers.push(
        `SDK latency ${latencyMultiplier.toFixed(1)}x > max ${criteria.maxLatencyMultiplier}x`,
      );
    }
    if (totalDecisions < criteria.minComparisons) {
      promotionBlockers.push(
        `Only ${totalDecisions} comparisons < required ${criteria.minComparisons}`,
      );
    }
    if (periodDays < criteria.minPeriodDays) {
      promotionBlockers.push(
        `Period ${periodDays} days < required ${criteria.minPeriodDays} days`,
      );
    }

    return {
      agentType,
      tenantId,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysIncluded: periodDays,
      },
      totalDecisions,
      matchRate,
      sdkBetter,
      heuristicBetter,
      identical,
      avgLatencyDiffMs,
      sdkAvgLatencyMs,
      heuristicAvgLatencyMs,
      sdkAvgConfidence,
      heuristicAvgConfidence,
      memoryUsageBytes: 0, // Populated by health check
      meetsPromotionCriteria: promotionBlockers.length === 0,
      promotionBlockers,
    };
  }

  /**
   * Build an empty report (used when no data exists or Prisma unavailable).
   */
  private buildEmptyReport(
    agentType: PromotableAgentType,
    tenantId: string,
    startDate: Date,
    endDate: Date,
    periodDays: number,
    criteria: PromotionCriteria,
  ): ComparisonReport {
    const promotionBlockers: string[] = [
      `Only 0 comparisons < required ${criteria.minComparisons}`,
    ];
    if (periodDays < criteria.minPeriodDays) {
      promotionBlockers.push(
        `Period ${periodDays} days < required ${criteria.minPeriodDays} days`,
      );
    }

    return {
      agentType,
      tenantId,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysIncluded: periodDays,
      },
      totalDecisions: 0,
      matchRate: 0,
      sdkBetter: 0,
      heuristicBetter: 0,
      identical: 0,
      avgLatencyDiffMs: 0,
      sdkAvgLatencyMs: 0,
      heuristicAvgLatencyMs: 0,
      sdkAvgConfidence: 0,
      heuristicAvgConfidence: 0,
      memoryUsageBytes: 0,
      meetsPromotionCriteria: false,
      promotionBlockers,
    };
  }
}
