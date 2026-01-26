/**
 * Rollout Promotion Service
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * @module agents/rollout/rollout-promotion.service
 * @description Feature flag SHADOW-to-PRIMARY promotion with safety checks,
 * and emergency rollback to DISABLED.
 *
 * CRITICAL RULES:
 * - promote() MUST check go/no-go criteria before updating
 * - rollback() is UNCONDITIONAL (emergency operation)
 * - All operations are per-tenant (tenant isolation)
 * - Delegates to FeatureFlagService for DB writes (avoids field name coupling)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { FeatureFlagService } from './feature-flags.service';
import { ShadowComparisonAggregator } from './shadow-comparison-aggregator';
import type {
  PromotableAgentType,
  RolloutMode,
  PromotionResult,
  PromotionCriteria,
} from './interfaces/comparison-report.interface';
import { DEFAULT_PROMOTION_CRITERIA } from './interfaces/comparison-report.interface';

/** Maps agent type to feature flag key */
const AGENT_FLAG_MAP: Record<PromotableAgentType, string> = {
  categorizer: 'sdk_categorizer',
  matcher: 'sdk_matcher',
  sars: 'sdk_sars',
  validator: 'sdk_validator',
  orchestrator: 'sdk_orchestrator',
};

@Injectable()
export class RolloutPromotionService {
  private readonly logger = new Logger(RolloutPromotionService.name);

  constructor(
    private readonly featureFlagService: FeatureFlagService,
    @Optional()
    @Inject(ShadowComparisonAggregator)
    private readonly aggregator?: ShadowComparisonAggregator,
  ) {}

  /**
   * Promote an agent from SHADOW to PRIMARY mode.
   * Performs safety checks using comparison report before promoting.
   *
   * @param agentType - Agent type to promote
   * @param tenantId - Tenant ID (per-tenant promotion)
   * @param criteria - Promotion criteria (defaults to standard go/no-go)
   * @returns Promotion result with success/failure and report
   */
  async promote(
    agentType: PromotableAgentType,
    tenantId: string,
    criteria: PromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
  ): Promise<PromotionResult> {
    const flagKey = AGENT_FLAG_MAP[agentType];
    if (!flagKey) {
      return {
        agentType,
        tenantId,
        previousMode: 'SHADOW',
        newMode: 'SHADOW',
        success: false,
        reason: `Unknown agent type: ${agentType}`,
        timestamp: new Date().toISOString(),
      };
    }

    if (!this.aggregator) {
      return {
        agentType,
        tenantId,
        previousMode: 'SHADOW',
        newMode: 'SHADOW',
        success: false,
        reason: 'ShadowComparisonAggregator unavailable',
        timestamp: new Date().toISOString(),
      };
    }

    // Get current mode
    const currentMode = await this.featureFlagService.getMode(
      tenantId,
      flagKey,
    );
    const previousMode = currentMode as RolloutMode;

    // Generate comparison report
    const report = await this.aggregator.generateReport(
      agentType,
      tenantId,
      criteria.minPeriodDays,
      criteria,
    );

    // Check if promotion criteria are met
    if (!report.meetsPromotionCriteria) {
      this.logger.warn(
        `Promotion blocked for ${agentType} (tenant ${tenantId.substring(0, 8)}): ` +
          report.promotionBlockers.join('; '),
      );

      return {
        agentType,
        tenantId,
        previousMode,
        newMode: previousMode,
        success: false,
        reason: `Promotion criteria not met: ${report.promotionBlockers.join('; ')}`,
        report,
        timestamp: new Date().toISOString(),
      };
    }

    // Perform promotion via FeatureFlagService
    try {
      await this.featureFlagService.enablePrimary(tenantId, flagKey, {
        promotedAt: new Date().toISOString(),
        promotedFrom: previousMode,
        matchRate: report.matchRate,
        totalDecisions: report.totalDecisions,
        sdkAvgLatencyMs: report.sdkAvgLatencyMs,
      });

      this.logger.log(
        `PROMOTED ${agentType} from ${previousMode} to PRIMARY ` +
          `for tenant ${tenantId.substring(0, 8)} ` +
          `(matchRate=${report.matchRate}%, decisions=${report.totalDecisions})`,
      );

      return {
        agentType,
        tenantId,
        previousMode,
        newMode: 'PRIMARY',
        success: true,
        report,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Promotion failed for ${agentType}: ${msg}`);

      return {
        agentType,
        tenantId,
        previousMode,
        newMode: previousMode,
        success: false,
        reason: `Database error: ${msg}`,
        report,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Emergency rollback: immediately set agent to DISABLED mode.
   * NO conditions are checked -- this is an emergency operation.
   *
   * @param agentType - Agent type to rollback
   * @param tenantId - Tenant ID
   * @returns Rollback result
   */
  async rollback(
    agentType: PromotableAgentType,
    tenantId: string,
  ): Promise<PromotionResult> {
    const flagKey = AGENT_FLAG_MAP[agentType];
    if (!flagKey) {
      return {
        agentType,
        tenantId,
        previousMode: 'PRIMARY',
        newMode: 'PRIMARY',
        success: false,
        reason: `Unknown agent type: ${agentType}`,
        timestamp: new Date().toISOString(),
      };
    }

    // Get current mode for logging
    const currentMode = await this.featureFlagService.getMode(
      tenantId,
      flagKey,
    );
    const previousMode = currentMode as RolloutMode;

    try {
      await this.featureFlagService.disable(tenantId, flagKey);

      this.logger.warn(
        `ROLLBACK ${agentType} from ${previousMode} to DISABLED ` +
          `for tenant ${tenantId.substring(0, 8)} (emergency)`,
      );

      return {
        agentType,
        tenantId,
        previousMode,
        newMode: 'DISABLED',
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Rollback failed for ${agentType}: ${msg}`);

      return {
        agentType,
        tenantId,
        previousMode,
        newMode: previousMode,
        success: false,
        reason: `Database error: ${msg}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current rollout status for all agents for a tenant.
   */
  async getStatus(
    tenantId: string,
  ): Promise<Array<{ agentType: PromotableAgentType; mode: RolloutMode }>> {
    const agentTypes: PromotableAgentType[] = [
      'categorizer',
      'matcher',
      'sars',
      'validator',
      'orchestrator',
    ];

    const statuses: Array<{
      agentType: PromotableAgentType;
      mode: RolloutMode;
    }> = [];

    for (const agentType of agentTypes) {
      const flagKey = AGENT_FLAG_MAP[agentType];
      const mode = await this.featureFlagService.getMode(tenantId, flagKey);
      statuses.push({
        agentType,
        mode: mode as RolloutMode,
      });
    }

    return statuses;
  }
}
