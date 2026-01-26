<task_spec id="TASK-STUB-012" version="2.0">

<metadata>
  <title>E2E Validation and Shadow Comparison Dashboard</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>validation</layer>
  <sequence>812</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-STUB-E2E-VALIDATION</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
    <task_ref status="ready">TASK-STUB-002</task_ref>
    <task_ref status="ready">TASK-STUB-003</task_ref>
    <task_ref status="ready">TASK-STUB-004</task_ref>
    <task_ref status="ready">TASK-STUB-005</task_ref>
    <task_ref status="ready">TASK-STUB-006</task_ref>
    <task_ref status="ready">TASK-STUB-007</task_ref>
    <task_ref status="ready">TASK-STUB-008</task_ref>
    <task_ref status="ready">TASK-STUB-009</task_ref>
    <task_ref status="ready">TASK-STUB-010</task_ref>
    <task_ref status="ready">TASK-STUB-011</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>14 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  After all stubs are replaced with real ruvector/agentic-flow integrations
  (TASK-STUB-001 through 011), the system needs comprehensive validation before
  any agent can transition from SHADOW mode to PRIMARY mode. Three critical
  validation requirements exist:

  1. **No regressions**: All 559 existing SDK tests must continue passing. Every real
     implementation must match or exceed the behavior of the stub it replaces.
  2. **SHADOW comparison data**: ShadowRunner is wired into all 5 agents and has been
     collecting comparison data in SHADOW mode. This data must be aggregated and analyzed
     to prove that real implementations meet production quality standards.
  3. **Safe rollout**: Feature flags must be promoted from SHADOW to PRIMARY with safety
     checks, and rollback must be immediate (PRIMARY to DISABLED) for emergencies.

  **Gap Analysis:**
  - No end-to-end validation test suite that exercises all 7 replaced stubs with
    realistic CrecheBooks data
  - ShadowRunner currently logs comparison results but does not persist them to a
    queryable database table
  - No aggregation service to summarize SHADOW comparison data (match rate, latency
    difference, confidence comparison per agent type)
  - No go/no-go criteria defined for SHADOW-to-PRIMARY promotion
  - No promotion script that safely transitions a specific agent for a specific tenant
  - No rollback script for emergency reversion
  - No Prisma model for `ShadowComparison` (comparison results are logged, not stored)
  - No Prometheus-compatible metrics for agent decision quality
  - No E2E test fixtures with realistic CrecheBooks data (transactions, payments,
    SARS calculations, extractions)

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL at trolley.proxy.rlwy.net:12401)
  - Package Manager: pnpm (NEVER npm)
  - Testing: Jest 30
  - Feature flags: `feature_flags` table (sdk_categorizer, sdk_matcher, sdk_sars,
    sdk_validator, sdk_orchestrator -- all SHADOW mode)
  - ShadowRunner: `apps/api/src/agents/rollout/shadow-runner.ts`
  - Tenant: `bdff4374-64d5-420c-b454-8e85e9df552a` ("Think M8 ECD (PTY) Ltd")
  - Railway: api.elleelephant.co.za

  **Existing Rollout Infrastructure:**
  ```
  apps/api/src/agents/rollout/
  ├── shadow-runner.ts           # Executes both SDK and heuristic, compares results
  ├── rollout.module.ts          # NestJS module for rollout services
  ├── feature-flag.service.ts    # Reads/writes feature_flags table
  └── interfaces/
      └── rollout.interface.ts   # Rollout-related types
  ```

  **Files to Create:**
  - `apps/api/src/agents/rollout/shadow-comparison-aggregator.ts` -- Aggregates
    SHADOW comparison data from audit logs
  - `apps/api/src/agents/rollout/rollout-promotion.service.ts` -- Feature flag
    SHADOW-to-PRIMARY promotion with safety checks
  - `apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts` --
    TypeScript types for comparison reports
  - `apps/api/scripts/promote-agent.ts` -- CLI script for manual agent promotion
  - `apps/api/scripts/rollback-agent.ts` -- CLI script for emergency rollback
  - `apps/api/tests/agents/rollout/shadow-comparison-aggregator.spec.ts`
  - `apps/api/tests/agents/rollout/rollout-promotion.spec.ts`
  - `apps/api/tests/e2e/stub-replacement-validation.spec.ts` -- E2E validation suite

  **Files to Modify:**
  - `apps/api/src/agents/rollout/shadow-runner.ts` -- Store comparison results in
    Prisma (currently logs only)
  - `apps/api/src/agents/rollout/rollout.module.ts` -- Register new services
  - `apps/api/prisma/schema.prisma` -- Add `ShadowComparison` model
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS -- Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  pnpm exec prisma migrate dev                 # Run Prisma migration
  pnpm exec prisma generate                    # Generate Prisma client
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. ShadowComparison Prisma Model
  Add to `apps/api/prisma/schema.prisma`:
  ```prisma
  model ShadowComparison {
    id                  String   @id @default(uuid())
    tenantId            String   @map("tenant_id")
    agentType           String   @map("agent_type")

    // SDK (real) result
    sdkResult           Json     @map("sdk_result")
    sdkConfidence       Int      @map("sdk_confidence")       // 0-100
    sdkDurationMs       Int      @map("sdk_duration_ms")

    // Heuristic (stub) result
    heuristicResult     Json     @map("heuristic_result")
    heuristicConfidence Int      @map("heuristic_confidence")  // 0-100
    heuristicDurationMs Int      @map("heuristic_duration_ms")

    // Comparison
    resultsMatch        Boolean  @map("results_match")
    matchDetails        Json?    @map("match_details")         // Field-level comparison

    createdAt           DateTime @default(now()) @map("created_at")

    @@map("shadow_comparisons")
    @@index([tenantId, agentType, createdAt])
    @@index([agentType, createdAt])
    @@index([resultsMatch, agentType])
  }
  ```

  ### 3. Comparison Report Interfaces
  ```typescript
  // apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts

  /**
   * Agent types that can be promoted from SHADOW to PRIMARY.
   */
  export type PromotableAgentType =
    | 'categorizer'
    | 'matcher'
    | 'sars'
    | 'validator'
    | 'orchestrator';

  /**
   * Feature flag modes for agent rollout.
   */
  export type RolloutMode = 'DISABLED' | 'SHADOW' | 'PRIMARY';

  /**
   * Aggregated comparison report for a specific agent type and tenant.
   */
  export interface ComparisonReport {
    /** Agent type (categorizer, matcher, sars, validator, orchestrator) */
    agentType: PromotableAgentType;
    /** Tenant ID */
    tenantId: string;
    /** Report period */
    period: {
      startDate: string;
      endDate: string;
      daysIncluded: number;
    };
    /** Total number of shadow comparisons in the period */
    totalDecisions: number;
    /** Percentage of decisions where SDK and heuristic agreed (0-100) */
    matchRate: number;
    /** Number of decisions where SDK result was better (higher confidence, correct) */
    sdkBetter: number;
    /** Number of decisions where heuristic result was better */
    heuristicBetter: number;
    /** Number of decisions where results were identical */
    identical: number;
    /** Average latency difference (sdkMs - heuristicMs) */
    avgLatencyDiffMs: number;
    /** SDK average latency in milliseconds */
    sdkAvgLatencyMs: number;
    /** Heuristic average latency in milliseconds */
    heuristicAvgLatencyMs: number;
    /** SDK average confidence (0-100) */
    sdkAvgConfidence: number;
    /** Heuristic average confidence (0-100) */
    heuristicAvgConfidence: number;
    /** Memory usage estimate for SDK components */
    memoryUsageBytes: number;
    /** Whether this agent meets go/no-go criteria */
    meetsPromotionCriteria: boolean;
    /** Reasons why promotion criteria are not met (empty if met) */
    promotionBlockers: string[];
  }

  /**
   * Go/No-Go criteria for SHADOW to PRIMARY promotion.
   */
  export interface PromotionCriteria {
    /** Minimum match rate between SDK and heuristic (default: 95%) */
    minMatchRate: number;
    /** Maximum SDK latency multiplier vs heuristic (default: 2.0x) */
    maxLatencyMultiplier: number;
    /** Minimum number of comparisons before promotion (default: 100) */
    minComparisons: number;
    /** Maximum error rate in SDK path (default: 1%) */
    maxErrorRate: number;
    /** Minimum report period in days (default: 7) */
    minPeriodDays: number;
  }

  /** Default promotion criteria */
  export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
    minMatchRate: 95,
    maxLatencyMultiplier: 2.0,
    minComparisons: 100,
    maxErrorRate: 1,
    minPeriodDays: 7,
  };

  /**
   * Result of a promotion or rollback operation.
   */
  export interface PromotionResult {
    /** Agent type that was promoted/rolled back */
    agentType: PromotableAgentType;
    /** Tenant ID */
    tenantId: string;
    /** Previous mode */
    previousMode: RolloutMode;
    /** New mode */
    newMode: RolloutMode;
    /** Whether the operation succeeded */
    success: boolean;
    /** Reason for failure (if not successful) */
    reason?: string;
    /** Comparison report used for the decision (promotion only) */
    report?: ComparisonReport;
    /** Timestamp of the operation */
    timestamp: string;
  }

  /**
   * Prometheus-compatible metric for agent decision quality.
   */
  export interface AgentMetric {
    name: string;
    labels: Record<string, string>;
    value: number;
    type: 'counter' | 'gauge' | 'histogram';
  }
  ```

  ### 4. Shadow Comparison Aggregator
  ```typescript
  // apps/api/src/agents/rollout/shadow-comparison-aggregator.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../../database/prisma.service';
  import type {
    ComparisonReport,
    PromotableAgentType,
    PromotionCriteria,
    AgentMetric,
    DEFAULT_PROMOTION_CRITERIA,
  } from './interfaces/comparison-report.interface';

  @Injectable()
  export class ShadowComparisonAggregator {
    private readonly logger = new Logger(ShadowComparisonAggregator.name);

    constructor(private readonly prisma: PrismaService) {}

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

      // Fetch all comparisons for this agent + tenant in the period
      const comparisons = await this.prisma.shadowComparison.findMany({
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

      const totalDecisions = comparisons.length;
      const matches = comparisons.filter((c) => c.resultsMatch);
      const matchRate = totalDecisions > 0
        ? Math.round((matches.length / totalDecisions) * 100)
        : 0;

      // Calculate SDK vs heuristic quality comparison
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

      const avgLatencyDiffMs = totalDecisions > 0
        ? Math.round(totalLatencyDiff / totalDecisions)
        : 0;
      const sdkAvgLatencyMs = totalDecisions > 0
        ? Math.round(totalSdkLatency / totalDecisions)
        : 0;
      const heuristicAvgLatencyMs = totalDecisions > 0
        ? Math.round(totalHeuristicLatency / totalDecisions)
        : 0;
      const sdkAvgConfidence = totalDecisions > 0
        ? Math.round(totalSdkConfidence / totalDecisions)
        : 0;
      const heuristicAvgConfidence = totalDecisions > 0
        ? Math.round(totalHeuristicConfidence / totalDecisions)
        : 0;

      // Evaluate promotion criteria
      const promotionBlockers: string[] = [];
      const latencyMultiplier = heuristicAvgLatencyMs > 0
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
        agentTypes.map((type) => this.generateReport(type, tenantId, periodDays)),
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
        metrics.push(
          {
            name: 'crechebooks_agent_decision_count',
            labels: { agent: report.agentType, tenant: tenantId.substring(0, 8) },
            value: report.totalDecisions,
            type: 'counter',
          },
          {
            name: 'crechebooks_agent_match_rate',
            labels: { agent: report.agentType, tenant: tenantId.substring(0, 8) },
            value: report.matchRate,
            type: 'gauge',
          },
          {
            name: 'crechebooks_agent_sdk_latency_ms',
            labels: { agent: report.agentType, tenant: tenantId.substring(0, 8) },
            value: report.sdkAvgLatencyMs,
            type: 'gauge',
          },
          {
            name: 'crechebooks_agent_heuristic_latency_ms',
            labels: { agent: report.agentType, tenant: tenantId.substring(0, 8) },
            value: report.heuristicAvgLatencyMs,
            type: 'gauge',
          },
          {
            name: 'crechebooks_agent_sdk_confidence',
            labels: { agent: report.agentType, tenant: tenantId.substring(0, 8) },
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
    ): Promise<Array<{
      agentType: string;
      totalDecisions: number;
      matchRate: number;
      meetsPromotionCriteria: boolean;
    }>> {
      const reports = await this.generateAllReports(tenantId, periodDays);
      return reports.map((r) => ({
        agentType: r.agentType,
        totalDecisions: r.totalDecisions,
        matchRate: r.matchRate,
        meetsPromotionCriteria: r.meetsPromotionCriteria,
      }));
    }
  }
  ```

  ### 5. Rollout Promotion Service
  ```typescript
  // apps/api/src/agents/rollout/rollout-promotion.service.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../../database/prisma.service';
  import { ShadowComparisonAggregator } from './shadow-comparison-aggregator';
  import type {
    PromotableAgentType,
    RolloutMode,
    PromotionResult,
    PromotionCriteria,
    DEFAULT_PROMOTION_CRITERIA,
  } from './interfaces/comparison-report.interface';

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
      private readonly prisma: PrismaService,
      private readonly aggregator: ShadowComparisonAggregator,
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
          previousMode: 'SHADOW',
          newMode: 'SHADOW',
          success: false,
          reason: `Promotion criteria not met: ${report.promotionBlockers.join('; ')}`,
          report,
          timestamp: new Date().toISOString(),
        };
      }

      // Get current mode
      const currentFlag = await this.prisma.featureFlag.findFirst({
        where: { key: flagKey, tenantId },
      });
      const previousMode = (currentFlag?.mode ?? 'DISABLED') as RolloutMode;

      // Perform promotion
      try {
        await this.prisma.featureFlag.upsert({
          where: {
            key_tenantId: { key: flagKey, tenantId },
          },
          create: {
            key: flagKey,
            tenantId,
            mode: 'PRIMARY',
            metadata: {
              promotedAt: new Date().toISOString(),
              promotedFrom: previousMode,
              matchRate: report.matchRate,
              totalDecisions: report.totalDecisions,
              sdkAvgLatencyMs: report.sdkAvgLatencyMs,
            },
          },
          update: {
            mode: 'PRIMARY',
            metadata: {
              promotedAt: new Date().toISOString(),
              promotedFrom: previousMode,
              matchRate: report.matchRate,
              totalDecisions: report.totalDecisions,
              sdkAvgLatencyMs: report.sdkAvgLatencyMs,
            },
          },
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
      const currentFlag = await this.prisma.featureFlag.findFirst({
        where: { key: flagKey, tenantId },
      });
      const previousMode = (currentFlag?.mode ?? 'DISABLED') as RolloutMode;

      try {
        await this.prisma.featureFlag.upsert({
          where: {
            key_tenantId: { key: flagKey, tenantId },
          },
          create: {
            key: flagKey,
            tenantId,
            mode: 'DISABLED',
            metadata: {
              rolledBackAt: new Date().toISOString(),
              rolledBackFrom: previousMode,
              reason: 'Emergency rollback',
            },
          },
          update: {
            mode: 'DISABLED',
            metadata: {
              rolledBackAt: new Date().toISOString(),
              rolledBackFrom: previousMode,
              reason: 'Emergency rollback',
            },
          },
        });

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
        'categorizer', 'matcher', 'sars', 'validator', 'orchestrator',
      ];

      const statuses: Array<{ agentType: PromotableAgentType; mode: RolloutMode }> = [];

      for (const agentType of agentTypes) {
        const flagKey = AGENT_FLAG_MAP[agentType];
        const flag = await this.prisma.featureFlag.findFirst({
          where: { key: flagKey, tenantId },
        });
        statuses.push({
          agentType,
          mode: (flag?.mode ?? 'DISABLED') as RolloutMode,
        });
      }

      return statuses;
    }
  }
  ```

  ### 6. ShadowRunner Enhancement (Persist Comparisons)
  ```typescript
  // Modification to apps/api/src/agents/rollout/shadow-runner.ts
  // ADD: Persist comparison results to Prisma after logging

  // ADD import:
  import { PrismaService } from '../../database/prisma.service';

  // ADD to constructor:
  constructor(
    // ... existing dependencies ...
    private readonly prisma: PrismaService,  // NEW
  ) {}

  // ADD method to persist comparison:
  private async persistComparison(
    tenantId: string,
    agentType: string,
    sdkResult: Record<string, unknown>,
    heuristicResult: Record<string, unknown>,
    sdkConfidence: number,
    heuristicConfidence: number,
    sdkDurationMs: number,
    heuristicDurationMs: number,
    resultsMatch: boolean,
    matchDetails?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.shadowComparison.create({
        data: {
          tenantId,
          agentType,
          sdkResult,
          sdkConfidence,
          sdkDurationMs,
          heuristicResult,
          heuristicConfidence,
          heuristicDurationMs,
          resultsMatch,
          matchDetails: matchDetails ?? null,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to persist shadow comparison: ${msg}`);
      // Non-fatal: log comparison even if persistence fails
    }
  }

  // CALL persistComparison in the existing compare method after logging
  ```

  ### 7. CLI Promotion Script
  ```typescript
  // apps/api/scripts/promote-agent.ts
  // Usage: pnpm exec tsx scripts/promote-agent.ts --agent categorizer --tenant bdff4374-64d5-420c-b454-8e85e9df552a --mode PRIMARY

  import { NestFactory } from '@nestjs/core';
  import { AppModule } from '../src/app.module';
  import { RolloutPromotionService } from '../src/agents/rollout/rollout-promotion.service';
  import { ShadowComparisonAggregator } from '../src/agents/rollout/shadow-comparison-aggregator';
  import type { PromotableAgentType } from '../src/agents/rollout/interfaces/comparison-report.interface';

  function parseArgs(): { agent: PromotableAgentType; tenant: string; mode: string } {
    const args = process.argv.slice(2);
    const agentIdx = args.indexOf('--agent');
    const tenantIdx = args.indexOf('--tenant');
    const modeIdx = args.indexOf('--mode');

    if (agentIdx === -1 || tenantIdx === -1 || modeIdx === -1) {
      console.error('Usage: pnpm exec tsx scripts/promote-agent.ts --agent <type> --tenant <uuid> --mode <PRIMARY|SHADOW>');
      console.error('Agent types: categorizer, matcher, sars, validator, orchestrator');
      process.exit(1);
    }

    return {
      agent: args[agentIdx + 1] as PromotableAgentType,
      tenant: args[tenantIdx + 1],
      mode: args[modeIdx + 1],
    };
  }

  async function main(): Promise<void> {
    const { agent, tenant, mode } = parseArgs();

    console.log('=== CrecheBooks Agent Promotion Script ===');
    console.log(`Agent:  ${agent}`);
    console.log(`Tenant: ${tenant}`);
    console.log(`Mode:   ${mode}`);

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'warn', 'error'],
    });

    try {
      const promotionService = app.get(RolloutPromotionService);
      const aggregator = app.get(ShadowComparisonAggregator);

      // Generate report first
      console.log('\n--- Generating Comparison Report ---');
      const report = await aggregator.generateReport(agent, tenant, 7);
      console.log(`Total decisions:    ${report.totalDecisions}`);
      console.log(`Match rate:         ${report.matchRate}%`);
      console.log(`SDK better:         ${report.sdkBetter}`);
      console.log(`Heuristic better:   ${report.heuristicBetter}`);
      console.log(`Identical:          ${report.identical}`);
      console.log(`SDK avg latency:    ${report.sdkAvgLatencyMs}ms`);
      console.log(`Heuristic avg lat:  ${report.heuristicAvgLatencyMs}ms`);
      console.log(`SDK avg confidence: ${report.sdkAvgConfidence}`);
      console.log(`Meets criteria:     ${report.meetsPromotionCriteria}`);
      if (report.promotionBlockers.length > 0) {
        console.log(`Blockers:           ${report.promotionBlockers.join(', ')}`);
      }

      if (mode === 'PRIMARY') {
        console.log('\n--- Promoting to PRIMARY ---');
        const result = await promotionService.promote(agent, tenant);
        console.log(`Success:  ${result.success}`);
        console.log(`Previous: ${result.previousMode}`);
        console.log(`New:      ${result.newMode}`);
        if (result.reason) {
          console.log(`Reason:   ${result.reason}`);
        }
      }

    } finally {
      await app.close();
    }

    process.exit(0);
  }

  main().catch((error) => {
    console.error('Promotion script failed:', error);
    process.exit(1);
  });
  ```

  ### 8. CLI Rollback Script
  ```typescript
  // apps/api/scripts/rollback-agent.ts
  // Usage: pnpm exec tsx scripts/rollback-agent.ts --agent categorizer --tenant bdff4374-64d5-420c-b454-8e85e9df552a

  import { NestFactory } from '@nestjs/core';
  import { AppModule } from '../src/app.module';
  import { RolloutPromotionService } from '../src/agents/rollout/rollout-promotion.service';
  import type { PromotableAgentType } from '../src/agents/rollout/interfaces/comparison-report.interface';

  function parseArgs(): { agent: PromotableAgentType; tenant: string } {
    const args = process.argv.slice(2);
    const agentIdx = args.indexOf('--agent');
    const tenantIdx = args.indexOf('--tenant');

    if (agentIdx === -1 || tenantIdx === -1) {
      console.error('Usage: pnpm exec tsx scripts/rollback-agent.ts --agent <type> --tenant <uuid>');
      console.error('Agent types: categorizer, matcher, sars, validator, orchestrator');
      process.exit(1);
    }

    return {
      agent: args[agentIdx + 1] as PromotableAgentType,
      tenant: args[tenantIdx + 1],
    };
  }

  async function main(): Promise<void> {
    const { agent, tenant } = parseArgs();

    console.log('=== CrecheBooks EMERGENCY ROLLBACK Script ===');
    console.log(`Agent:  ${agent}`);
    console.log(`Tenant: ${tenant}`);
    console.log('WARNING: This immediately disables the SDK agent.');

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['log', 'warn', 'error'],
    });

    try {
      const promotionService = app.get(RolloutPromotionService);

      console.log('\n--- Rolling back to DISABLED ---');
      const result = await promotionService.rollback(agent, tenant);

      console.log(`Success:  ${result.success}`);
      console.log(`Previous: ${result.previousMode}`);
      console.log(`New:      ${result.newMode}`);
      if (result.reason) {
        console.log(`Reason:   ${result.reason}`);
      }
    } finally {
      await app.close();
    }

    process.exit(0);
  }

  main().catch((error) => {
    console.error('Rollback script failed:', error);
    process.exit(1);
  });
  ```

  ### 9. E2E Validation Test Suite
  ```typescript
  // apps/api/tests/e2e/stub-replacement-validation.spec.ts
  // This E2E test validates that all 7 replaced stubs work correctly
  // with realistic CrecheBooks data.

  describe('Stub Replacement E2E Validation', () => {
    const TEST_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

    // ── Fixture Data ─────────────────────────────────────────────────────
    const FIXTURE_TRANSACTIONS = [
      { id: 'tx-001', payeeName: 'Woolworths', description: 'Groceries for meals', amountCents: 250000, isCredit: false, transactionDate: '2026-01-15' },
      { id: 'tx-002', payeeName: 'FNB', description: 'Monthly bank charges', amountCents: 5000, isCredit: false, transactionDate: '2026-01-15' },
      { id: 'tx-003', payeeName: 'Parent: J Smith', description: 'January tuition fee', amountCents: 450000, isCredit: true, transactionDate: '2026-01-05' },
      { id: 'tx-004', payeeName: 'Telkom', description: 'Internet & telephone', amountCents: 89900, isCredit: false, transactionDate: '2026-01-10' },
      { id: 'tx-005', payeeName: 'Eskom', description: 'Electricity prepaid', amountCents: 150000, isCredit: false, transactionDate: '2026-01-12' },
      { id: 'tx-006', payeeName: 'Unknown Vendor XYZ', description: 'Office supplies delivery', amountCents: 35000, isCredit: false, transactionDate: '2026-01-14' },
      { id: 'tx-007', payeeName: 'Parent: A Nkosi', description: 'Registration fee 2026', amountCents: 150000, isCredit: true, transactionDate: '2026-01-02' },
      { id: 'tx-008', payeeName: 'Makro', description: 'Cleaning supplies bulk', amountCents: 320000, isCredit: false, transactionDate: '2026-01-08' },
      { id: 'tx-009', payeeName: 'Capitec', description: 'EFT transfer ref: Teacher salary Jan', amountCents: 1200000, isCredit: false, transactionDate: '2026-01-25' },
      { id: 'tx-010', payeeName: 'Parent: B Dlamini', description: 'Feb fees paid in advance', amountCents: 450000, isCredit: true, transactionDate: '2026-01-28' },
    ];

    const FIXTURE_PAYMENTS = [
      { id: 'pay-001', parentName: 'J Smith', amountCents: 450000, reference: 'Jan tuition', date: '2026-01-05' },
      { id: 'pay-002', parentName: 'A Nkosi', amountCents: 150000, reference: 'Reg 2026', date: '2026-01-02' },
      { id: 'pay-003', parentName: 'B Dlamini', amountCents: 450000, reference: 'Feb advance', date: '2026-01-28' },
      { id: 'pay-004', parentName: 'C Govender', amountCents: 450000, reference: 'Jan fees', date: '2026-01-07' },
      { id: 'pay-005', parentName: 'D van Wyk', amountCents: 500000, reference: 'Jan + aftercare', date: '2026-01-06' },
    ];

    const FIXTURE_SARS_CALCS = [
      { period: '2026-01', totalIncomeCents: 4500000, totalExpenseCents: 3200000, vatExemptCents: 3000000 },
      { period: '2025-12', totalIncomeCents: 4200000, totalExpenseCents: 2900000, vatExemptCents: 2800000 },
      { period: '2025-11', totalIncomeCents: 4350000, totalExpenseCents: 3100000, vatExemptCents: 2950000 },
    ];

    const FIXTURE_EXTRACTIONS = [
      { id: 'ext-001', documentType: 'invoice', fields: { total: 250000, vendor: 'Woolworths', date: '2026-01-15' } },
      { id: 'ext-002', documentType: 'receipt', fields: { total: 5000, vendor: 'FNB', date: '2026-01-15' } },
    ];

    describe('TransactionCategorizer (sdk_categorizer)', () => {
      it('should categorize known food vendor (Woolworths)', async () => {
        // Expected: accountCode 5200, vatType STANDARD
      });

      it('should categorize bank charges (FNB)', async () => {
        // Expected: accountCode 6600, vatType NO_VAT
      });

      it('should categorize tuition income (parent payment)', async () => {
        // Expected: accountCode 4000, vatType EXEMPT (Section 12(h))
      });

      it('should categorize utilities (Telkom, Eskom)', async () => {
        // Expected: accountCode 6100 or 6500, vatType STANDARD
      });

      it('should handle novel vendor with LLM fallback', async () => {
        // Unknown Vendor XYZ: should not return 9999, should reason about "office supplies"
      });

      it('should categorize salary payments to 5000 range', async () => {
        // Expected: accountCode 5000, not 6000 range
      });
    });

    describe('PaymentMatcher (sdk_matcher)', () => {
      it('should match payment to outstanding invoice by amount + name', async () => {
        // pay-001 (J Smith, R4,500) -> matching invoice
      });

      it('should match partial reference match', async () => {
        // pay-002 (A Nkosi, "Reg 2026") -> registration invoice
      });

      it('should handle unmatched payment gracefully', async () => {
        // pay-004 (C Govender) -> no matching invoice -> flag for review
      });
    });

    describe('SARSAgent (sdk_sars)', () => {
      it('should calculate VAT-exempt education income correctly', async () => {
        // Tuition fees -> Section 12(h) exempt, NOT in VAT output calculation
      });

      it('should flag SARS results for L2 review (always)', async () => {
        // Every SARS result must have flagForReview = true, regardless of confidence
      });

      it('should handle multi-period comparison', async () => {
        // 3 months of SARS data should produce trend analysis
      });
    });

    describe('ExtractionValidator (sdk_validator)', () => {
      it('should validate extracted invoice fields against source', async () => {
        // ext-001: validate total, vendor, date match source document
      });

      it('should detect mismatched extraction', async () => {
        // Provide extraction with wrong total -> should flag mismatch
      });
    });

    describe('Orchestrator (sdk_orchestrator)', () => {
      it('should coordinate categorize + match workflow', async () => {
        // Full flow: categorize tx-003 -> match to invoice -> reconcile
      });

      it('should handle partial failure in workflow', async () => {
        // Categorization succeeds, matching fails -> partial result returned
      });
    });

    describe('Cross-cutting Validation', () => {
      it('should maintain consistent decision logging across all agents', async () => {
        // All agents log decisions with source field (LLM, PATTERN, etc.)
      });

      it('should enforce tenant isolation across all operations', async () => {
        // Operations with wrong tenantId should never return other tenant data
      });

      it('should handle SDK unavailability gracefully across all agents', async () => {
        // When SDK is disabled, all agents fall back to heuristic without error
      });

      it('should report consistent metrics across all agents', async () => {
        // All agents produce comparable metrics (decision_count, latency, confidence)
      });
    });
  });
  ```

  ### 10. Module Registration
  ```typescript
  // In apps/api/src/agents/rollout/rollout.module.ts
  // ADD to providers and exports:
  import { ShadowComparisonAggregator } from './shadow-comparison-aggregator';
  import { RolloutPromotionService } from './rollout-promotion.service';

  @Module({
    imports: [DatabaseModule],
    providers: [
      // ... existing providers ...
      ShadowComparisonAggregator,  // NEW
      RolloutPromotionService,     // NEW
    ],
    exports: [
      // ... existing exports ...
      ShadowComparisonAggregator,  // NEW
      RolloutPromotionService,     // NEW
    ],
  })
  export class RolloutModule {}
  ```

  ### 11. Testing Pattern
  ```typescript
  // apps/api/tests/agents/rollout/shadow-comparison-aggregator.spec.ts
  describe('ShadowComparisonAggregator', () => {
    let aggregator: ShadowComparisonAggregator;
    let prisma: DeepMockProxy<PrismaService>;
    const TEST_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

    beforeEach(async () => {
      prisma = mockDeep<PrismaService>();
      const module = await Test.createTestingModule({
        providers: [
          ShadowComparisonAggregator,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();

      aggregator = module.get(ShadowComparisonAggregator);
    });

    describe('generateReport', () => {
      it('should calculate match rate correctly', async () => {
        prisma.shadowComparison.findMany.mockResolvedValue([
          { resultsMatch: true, sdkConfidence: 90, heuristicConfidence: 85, sdkDurationMs: 120, heuristicDurationMs: 50 },
          { resultsMatch: true, sdkConfidence: 88, heuristicConfidence: 82, sdkDurationMs: 110, heuristicDurationMs: 45 },
          { resultsMatch: false, sdkConfidence: 92, heuristicConfidence: 70, sdkDurationMs: 130, heuristicDurationMs: 55 },
        ] as any);

        const report = await aggregator.generateReport('categorizer', TEST_TENANT, 7);

        expect(report.totalDecisions).toBe(3);
        expect(report.matchRate).toBe(67); // 2/3 = 66.7 rounds to 67
        expect(report.identical).toBe(2);
        expect(report.sdkBetter).toBe(1); // SDK confidence 92 > heuristic 70
      });

      it('should identify promotion blockers', async () => {
        prisma.shadowComparison.findMany.mockResolvedValue([
          { resultsMatch: false, sdkConfidence: 50, heuristicConfidence: 90, sdkDurationMs: 500, heuristicDurationMs: 50 },
        ] as any);

        const report = await aggregator.generateReport('categorizer', TEST_TENANT, 7);

        expect(report.meetsPromotionCriteria).toBe(false);
        expect(report.promotionBlockers.length).toBeGreaterThan(0);
        expect(report.promotionBlockers.some((b) => b.includes('Match rate'))).toBe(true);
      });

      it('should handle empty comparison data', async () => {
        prisma.shadowComparison.findMany.mockResolvedValue([]);

        const report = await aggregator.generateReport('categorizer', TEST_TENANT, 7);

        expect(report.totalDecisions).toBe(0);
        expect(report.matchRate).toBe(0);
        expect(report.meetsPromotionCriteria).toBe(false);
      });
    });

    describe('getMetrics', () => {
      it('should return Prometheus-compatible metrics', async () => {
        prisma.shadowComparison.findMany.mockResolvedValue([]);

        const metrics = await aggregator.getMetrics(TEST_TENANT);

        expect(metrics.length).toBeGreaterThan(0);
        for (const metric of metrics) {
          expect(metric.name).toMatch(/^crechebooks_agent_/);
          expect(metric.type).toMatch(/^(counter|gauge|histogram)$/);
          expect(typeof metric.value).toBe('number');
        }
      });
    });
  });

  // apps/api/tests/agents/rollout/rollout-promotion.spec.ts
  describe('RolloutPromotionService', () => {
    let service: RolloutPromotionService;
    let prisma: DeepMockProxy<PrismaService>;
    let aggregator: ShadowComparisonAggregator;
    const TEST_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

    beforeEach(async () => {
      prisma = mockDeep<PrismaService>();
      // ... setup with mocked aggregator ...
    });

    describe('promote', () => {
      it('should promote when criteria are met', async () => {
        // Mock aggregator to return report that meets criteria
        // Assert: feature flag updated to PRIMARY
      });

      it('should block promotion when match rate too low', async () => {
        // Mock aggregator to return matchRate=80 (below 95%)
        // Assert: promotion blocked, flag unchanged
      });

      it('should block promotion when too few comparisons', async () => {
        // Mock aggregator to return totalDecisions=50 (below 100)
        // Assert: promotion blocked
      });

      it('should block promotion when SDK latency too high', async () => {
        // Mock aggregator to return sdkAvgLatency=3x heuristic
        // Assert: promotion blocked due to latency multiplier
      });
    });

    describe('rollback', () => {
      it('should immediately set mode to DISABLED', async () => {
        const result = await service.rollback('categorizer', TEST_TENANT);
        expect(result.newMode).toBe('DISABLED');
        expect(result.success).toBe(true);
      });

      it('should rollback unconditionally (no criteria check)', async () => {
        // No comparison report is generated for rollback
        // It is an emergency operation
      });
    });

    describe('getStatus', () => {
      it('should return status for all 5 agents', async () => {
        const statuses = await service.getStatus(TEST_TENANT);
        expect(statuses).toHaveLength(5);
        expect(statuses.map((s) => s.agentType)).toEqual([
          'categorizer', 'matcher', 'sars', 'validator', 'orchestrator',
        ]);
      });
    });
  });
  ```

  ### 12. Monetary Values
  ALL monetary values MUST be integers (cents). Never use floating-point:
  ```typescript
  // CORRECT
  amountCents: 150000  // R1,500.00

  // WRONG
  // amount: 1500.00    // NEVER use floating-point for money
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  This is the FINAL validation task in the stub-replacement sequence. It validates that:

  1. All real ruvector/agentic-flow integrations match or exceed stub behavior
  2. SHADOW mode comparison data proves production readiness
  3. Feature flags can be safely transitioned from SHADOW to PRIMARY
  4. All existing tests still pass (zero regressions)
  5. Performance, memory, and accuracy meet requirements

  **Why This Task is P0-CRITICAL:**
  - Without validation, promoting any agent to PRIMARY is blind deployment
  - SHADOW data is the only objective measure of real vs stub quality
  - Rollback capability is mandatory for production safety
  - CrecheBooks handles real financial data -- incorrect categorization, matching,
    or SARS compliance can have legal consequences

  ## SA Compliance Notes
  - All monetary values in cents (integers) -- R1,500.00 = 150000
  - SARS agent results ALWAYS require L2 human review, even after promotion to PRIMARY
  - Tenant isolation must be validated in E2E tests (POPI Act)
  - Education services are VAT EXEMPT under Section 12(h) -- E2E tests must verify this

  ## Go/No-Go Criteria
  The following criteria MUST be met before any agent is promoted to PRIMARY:
  1. **Match rate >= 95%**: SDK and heuristic must agree on 95%+ of decisions
  2. **SDK latency < 2x heuristic**: SDK path must not be more than 2x slower
  3. **Minimum 100 comparisons**: Sufficient sample size for statistical confidence
  4. **No error spikes**: SDK error rate must be below 1%
  5. **Minimum 7-day period**: Data must span at least one week of operations

  ## Architectural Decisions
  - **Per-tenant promotion**: Each agent is promoted independently per tenant. This
    allows rolling out to one tenant (Think M8 ECD) while keeping others on SHADOW.
  - **Immediate rollback**: Rollback sets mode to DISABLED (not SHADOW). This completely
    disables the SDK path, reverting to pure heuristic behavior instantly.
  - **ShadowComparison table**: Comparison results are persisted to Prisma for SQL-based
    aggregation. This enables complex queries (e.g., match rate by day, latency percentiles).
  - **CLI scripts**: Promotion and rollback are manual operations via CLI scripts.
    Automated promotion is explicitly out of scope -- human approval required.
  - **E2E fixtures**: Use realistic CrecheBooks data (10 transactions, 5 payments,
    3 SARS periods, 2 extractions) that cover the common case distribution.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `ShadowComparison` Prisma model with tenant, agent, results, latency fields
    - Run Prisma migration to create `shadow_comparisons` table
    - Create `ShadowComparisonAggregator` with `generateReport()`, `generateAllReports()`,
      `getMetrics()`, and `getDashboardSummary()` methods
    - Create `RolloutPromotionService` with `promote()`, `rollback()`, and `getStatus()`
    - Implement go/no-go criteria evaluation: matchRate>=95%, latency<2x, minComparisons>=100,
      errorRate<1%, minPeriodDays>=7
    - Create comparison report interfaces: `ComparisonReport`, `PromotionCriteria`,
      `PromotionResult`, `AgentMetric`, `PromotableAgentType`, `RolloutMode`
    - Modify `ShadowRunner` to persist comparisons to Prisma (dual write: log + DB)
    - Create CLI script `promote-agent.ts` for manual SHADOW-to-PRIMARY promotion
    - Create CLI script `rollback-agent.ts` for emergency rollback to DISABLED
    - Create E2E validation test suite with realistic CrecheBooks fixture data
    - E2E fixtures: 10 transactions, 5 payments, 3 SARS calculations, 2 extractions
    - Register new services in `RolloutModule`
    - Prometheus-compatible metrics: decision_count, match_rate, sdk_latency, heuristic_latency, sdk_confidence
    - Unit tests for `ShadowComparisonAggregator`: report generation, metric calculation,
      blocker identification, empty data handling
    - Unit tests for `RolloutPromotionService`: promotion (success and blocked), rollback,
      status reporting
    - E2E tests for all 5 agent types with fixture data
    - E2E tests for cross-cutting concerns (logging, tenant isolation, fallback)
    - All tests mock Prisma -- no real database connections
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing 559 SDK tests still pass
    - All existing tests still pass (zero regressions)
  </in_scope>

  <out_of_scope>
    - Web UI dashboard (API-only aggregation and CLI scripts)
    - Automated promotion (manual CLI approval required)
    - Multi-tenant promotion in a single operation (per-tenant only)
    - Real-time streaming of comparison results (batch aggregation only)
    - Cost tracking for SDK API calls (future task)
    - Load testing / performance benchmarking (separate task)
    - Alerting integration (Prometheus metrics are available but alerting rules are separate)
    - Historical data backfill (only new comparisons from ShadowRunner go to Prisma)
    - ShadowRunner refactoring (only add persistence, keep existing logic)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/rollout/shadow-comparison-aggregator.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/rollout/rollout-promotion.service.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/scripts/promote-agent.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/scripts/rollback-agent.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/agents/rollout/shadow-comparison-aggregator.spec.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/agents/rollout/rollout-promotion.spec.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/e2e/stub-replacement-validation.spec.ts

# 2. Verify Prisma schema has ShadowComparison model
grep "ShadowComparison" apps/api/prisma/schema.prisma
grep "shadow_comparisons" apps/api/prisma/schema.prisma

# 3. Generate Prisma client
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm exec prisma generate

# 4. Verify build succeeds
pnpm run build

# 5. Run rollout-specific tests
pnpm test -- --testPathPattern="rollout" --runInBand

# 6. Run E2E validation tests
pnpm test -- --testPathPattern="stub-replacement-validation" --runInBand

# 7. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 8. Run ALL SDK tests to confirm no regressions (559 tests)
pnpm test -- --testPathPattern="agents/sdk\|agents/transaction-categorizer\|agents/payment-matcher\|agents/sars-agent\|agents/extraction-validator\|agents/orchestrator" --runInBand

# 9. Lint check
pnpm run lint

# 10. Verify ShadowRunner persists comparisons
grep "persistComparison\|shadowComparison.create" apps/api/src/agents/rollout/shadow-runner.ts

# 11. Verify promotion service registered
grep "RolloutPromotionService" apps/api/src/agents/rollout/rollout.module.ts
grep "ShadowComparisonAggregator" apps/api/src/agents/rollout/rollout.module.ts

# 12. Verify go/no-go criteria constants
grep "minMatchRate" apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts
grep "maxLatencyMultiplier" apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts

# 13. Verify CLI scripts are valid TypeScript
grep "NestFactory" apps/api/scripts/promote-agent.ts
grep "NestFactory" apps/api/scripts/rollback-agent.ts

# 14. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/rollout/shadow-comparison-aggregator.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/rollout/rollout-promotion.service.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/rollout/interfaces/comparison-report.interface.ts && echo "FAIL" || echo "PASS"

# 15. Verify 5 agent types in promotion service
grep -c "categorizer\|matcher\|sars\|validator\|orchestrator" apps/api/src/agents/rollout/rollout-promotion.service.ts

# 16. Verify Prometheus metric format
grep "crechebooks_agent_" apps/api/src/agents/rollout/shadow-comparison-aggregator.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `ShadowComparison` Prisma model created with all required fields
        (tenantId, agentType, sdkResult, heuristicResult, resultsMatch, confidence,
        duration, matchDetails)
  - [ ] Prisma migration generated and applied for `shadow_comparisons` table
  - [ ] Indexes created: (tenantId, agentType, createdAt), (agentType, createdAt),
        (resultsMatch, agentType)
  - [ ] `ShadowComparisonAggregator.generateReport()` aggregates comparisons by
        agent type, tenant, and time period
  - [ ] `generateReport()` calculates: matchRate, sdkBetter, heuristicBetter,
        identical, avgLatencyDiffMs, sdkAvgLatencyMs, heuristicAvgLatencyMs,
        sdkAvgConfidence, heuristicAvgConfidence
  - [ ] `generateReport()` evaluates go/no-go criteria and populates `promotionBlockers`
  - [ ] Default promotion criteria: matchRate>=95%, latency<2x, minComparisons>=100,
        maxErrorRate<1%, minPeriodDays>=7
  - [ ] `generateAllReports()` produces reports for all 5 agent types
  - [ ] `getMetrics()` returns Prometheus-compatible metrics: crechebooks_agent_decision_count,
        crechebooks_agent_match_rate, crechebooks_agent_sdk_latency_ms,
        crechebooks_agent_heuristic_latency_ms, crechebooks_agent_sdk_confidence
  - [ ] `getDashboardSummary()` returns condensed overview per agent type
  - [ ] `RolloutPromotionService.promote()` checks comparison report against criteria
        before updating feature flag
  - [ ] `promote()` blocks when criteria not met (returns success=false with blockers)
  - [ ] `promote()` updates feature_flags to PRIMARY with metadata (promotedAt, matchRate, etc.)
  - [ ] `RolloutPromotionService.rollback()` immediately sets mode to DISABLED
  - [ ] `rollback()` is unconditional -- no criteria check (emergency operation)
  - [ ] `rollback()` records metadata (rolledBackAt, rolledBackFrom, reason)
  - [ ] `getStatus()` returns current mode for all 5 agents for a tenant
  - [ ] Feature flag keys map correctly: sdk_categorizer, sdk_matcher, sdk_sars,
        sdk_validator, sdk_orchestrator
  - [ ] `ShadowRunner` modified to persist comparisons to Prisma after existing logging
  - [ ] Persistence failure is non-fatal (log warning, do not break shadow execution)
  - [ ] TypeScript interfaces created: `ComparisonReport`, `PromotionCriteria`,
        `PromotionResult`, `AgentMetric`, `PromotableAgentType`, `RolloutMode`
  - [ ] `DEFAULT_PROMOTION_CRITERIA` constant exported with standard go/no-go values
  - [ ] CLI script `promote-agent.ts`: --agent, --tenant, --mode arguments
  - [ ] CLI script `rollback-agent.ts`: --agent, --tenant arguments
  - [ ] CLI scripts print comparison report before promotion
  - [ ] E2E test suite with 10 transactions, 5 payments, 3 SARS periods, 2 extractions
  - [ ] E2E tests cover all 5 agent types (categorizer, matcher, sars, validator, orchestrator)
  - [ ] E2E tests verify SA-specific rules (Section 12(h), bank charges=NO_VAT, salary=5000 range)
  - [ ] E2E tests verify SARS results always flagged for L2 review
  - [ ] E2E tests verify tenant isolation
  - [ ] E2E tests verify SDK fallback behavior
  - [ ] `ShadowComparisonAggregator` and `RolloutPromotionService` registered in `RolloutModule`
  - [ ] Unit tests for aggregator: match rate calculation, blocker identification,
        empty data, multi-agent reporting
  - [ ] Unit tests for promotion: success with criteria met, blocked with criteria not met,
        rollback unconditional, status reporting
  - [ ] All tests mock Prisma -- zero real database connections
  - [ ] Test coverage >= 90% for all new files
  - [ ] Zero `any` types in all new/modified files
  - [ ] All existing 559 SDK tests still pass
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (zero regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER promote without checking go/no-go criteria** -- blind promotion is
    dangerous for financial data. The `promote()` method MUST evaluate the comparison
    report before updating the feature flag.
  - **NEVER automate promotion** -- promotion requires manual human approval via
    CLI script. Automated promotion is explicitly out of scope.
  - **NEVER add conditions to rollback** -- rollback is an emergency operation.
    It MUST be immediate and unconditional. Never check criteria before rolling back.
  - **NEVER delete ShadowComparison records** -- these are audit data required for
    compliance. Only append, never delete or update comparison records.
  - **NEVER return cross-tenant comparison data** -- aggregation queries MUST filter
    by tenantId. A comparison report for tenant A must never include data from tenant B.
  - **NEVER skip the Prisma migration** -- the `shadow_comparisons` table must be
    created via proper migration, not raw SQL.
  - **NEVER use `any` type** -- use proper TypeScript interfaces from
    `comparison-report.interface.ts`
  - **NEVER use `npm`** -- all commands must use `pnpm`
  - **NEVER break ShadowRunner's existing behavior** -- only ADD persistence.
    The existing logging and comparison logic must remain unchanged.
  - **NEVER make real API calls in tests** -- mock all Prisma queries and external services.
  - **NEVER promote SARS agent without noting L2 review requirement** -- even in PRIMARY
    mode, SARS results always require human review. Promotion does not change this.
  - **NEVER use floating-point for monetary values** -- all amounts in cents (integers).
    Fixture data and comparison results must use integer cents.
  - **NEVER promote multiple tenants in one CLI command** -- per-tenant promotion only.
    Each tenant must be promoted individually for safety.
  - **NEVER ignore promotion blockers in CLI output** -- the promotion script MUST
    display the full comparison report, including blockers, before any promotion action.
  - **NEVER remove the minimum period requirement** -- 7 days of SHADOW data is the
    minimum for statistical confidence. Do not reduce this to rush promotion.
</anti_patterns>

</task_spec>
