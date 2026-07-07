/**
 * Shadow Comparison Aggregator Tests
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * All tests mock Prisma -- zero real database connections.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ShadowComparisonAggregator } from '../../../src/agents/rollout/shadow-comparison-aggregator';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  DEFAULT_PROMOTION_CRITERIA,
  PROMOTION_CRITERIA_BY_AGENT,
  resolvePromotionCriteria,
} from '../../../src/agents/rollout/interfaces/comparison-report.interface';
import type { PromotableAgentType } from '../../../src/agents/rollout/interfaces/comparison-report.interface';

describe('ShadowComparisonAggregator', () => {
  let aggregator: ShadowComparisonAggregator;
  let prisma: {
    shadowComparison: {
      findMany: jest.Mock;
    };
  };
  const TEST_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

  beforeEach(async () => {
    prisma = {
      shadowComparison: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
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
        {
          id: 'c-1',
          tenantId: TEST_TENANT,
          agentType: 'categorizer',
          sdkResult: { code: '5200' },
          heuristicResult: { code: '5200' },
          resultsMatch: true,
          sdkConfidence: 90,
          heuristicConfidence: 85,
          sdkDurationMs: 120,
          heuristicDurationMs: 50,
          matchDetails: null,
          createdAt: new Date(),
        },
        {
          id: 'c-2',
          tenantId: TEST_TENANT,
          agentType: 'categorizer',
          sdkResult: { code: '5200' },
          heuristicResult: { code: '5200' },
          resultsMatch: true,
          sdkConfidence: 88,
          heuristicConfidence: 82,
          sdkDurationMs: 110,
          heuristicDurationMs: 45,
          matchDetails: null,
          createdAt: new Date(),
        },
        {
          id: 'c-3',
          tenantId: TEST_TENANT,
          agentType: 'categorizer',
          sdkResult: { code: '4100' },
          heuristicResult: { code: '8100' },
          resultsMatch: false,
          sdkConfidence: 92,
          heuristicConfidence: 70,
          sdkDurationMs: 130,
          heuristicDurationMs: 55,
          matchDetails: { reason: 'code mismatch' },
          createdAt: new Date(),
        },
      ]);

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.totalDecisions).toBe(3);
      expect(report.matchRate).toBe(67); // 2/3 = 66.7 rounds to 67
      expect(report.identical).toBe(2);
      expect(report.sdkBetter).toBe(1); // SDK confidence 92 > heuristic 70
      expect(report.heuristicBetter).toBe(0);
      expect(report.agentType).toBe('categorizer');
      expect(report.tenantId).toBe(TEST_TENANT);
    });

    it('should calculate average latencies correctly', async () => {
      prisma.shadowComparison.findMany.mockResolvedValue([
        {
          id: 'c-1',
          tenantId: TEST_TENANT,
          agentType: 'matcher',
          sdkResult: {},
          heuristicResult: {},
          resultsMatch: true,
          sdkConfidence: 80,
          heuristicConfidence: 80,
          sdkDurationMs: 200,
          heuristicDurationMs: 100,
          matchDetails: null,
          createdAt: new Date(),
        },
        {
          id: 'c-2',
          tenantId: TEST_TENANT,
          agentType: 'matcher',
          sdkResult: {},
          heuristicResult: {},
          resultsMatch: true,
          sdkConfidence: 80,
          heuristicConfidence: 80,
          sdkDurationMs: 300,
          heuristicDurationMs: 100,
          matchDetails: null,
          createdAt: new Date(),
        },
      ]);

      const report = await aggregator.generateReport('matcher', TEST_TENANT, 7);

      expect(report.sdkAvgLatencyMs).toBe(250); // (200+300)/2
      expect(report.heuristicAvgLatencyMs).toBe(100); // (100+100)/2
      expect(report.avgLatencyDiffMs).toBe(150); // 250 - 100
    });

    it('should identify promotion blockers for low match rate', async () => {
      prisma.shadowComparison.findMany.mockResolvedValue([
        {
          id: 'c-1',
          tenantId: TEST_TENANT,
          agentType: 'categorizer',
          sdkResult: {},
          heuristicResult: {},
          resultsMatch: false,
          sdkConfidence: 50,
          heuristicConfidence: 90,
          sdkDurationMs: 500,
          heuristicDurationMs: 50,
          matchDetails: null,
          createdAt: new Date(),
        },
      ]);

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.meetsPromotionCriteria).toBe(false);
      expect(report.promotionBlockers.length).toBeGreaterThan(0);
      expect(
        report.promotionBlockers.some((b) => b.includes('Match rate')),
      ).toBe(true);
    });

    it('should identify promotion blockers for egregious latency (>10x)', async () => {
      // Create 200 comparisons with 100% match but 12x SDK latency.
      // 12x exceeds the raised default 10x ceiling — should still block.
      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'sars',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 1200, // 12x heuristic
        heuristicDurationMs: 100,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const report = await aggregator.generateReport('sars', TEST_TENANT, 7);

      expect(report.meetsPromotionCriteria).toBe(false);
      expect(
        report.promotionBlockers.some((b) => b.includes('SDK latency')),
      ).toBe(true);
    });

    it('tolerates typical LLM overhead (5x) under the raised default ceiling', async () => {
      // 5x SDK latency should PASS under the new 10x default — SHADOW-gated
      // agents are background, so LLM overhead is acceptable when accuracy
      // matches the heuristic.
      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'categorizer',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 500, // 5x heuristic — below the 10x ceiling
        heuristicDurationMs: 100,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.meetsPromotionCriteria).toBe(true);
      expect(
        report.promotionBlockers.some((b) => b.includes('SDK latency')),
      ).toBe(false);
    });

    it('should identify promotion blockers for too few comparisons', async () => {
      // Only 50 comparisons (below 100 minimum)
      const comparisons = Array.from({ length: 50 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'validator',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 100,
        heuristicDurationMs: 80,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const report = await aggregator.generateReport(
        'validator',
        TEST_TENANT,
        7,
      );

      expect(report.meetsPromotionCriteria).toBe(false);
      expect(
        report.promotionBlockers.some((b) => b.includes('comparisons')),
      ).toBe(true);
    });

    it('should identify promotion blockers for short period', async () => {
      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'orchestrator',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 100,
        heuristicDurationMs: 80,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      // Only 3 days (below 7 minimum)
      const report = await aggregator.generateReport(
        'orchestrator',
        TEST_TENANT,
        3,
      );

      expect(report.meetsPromotionCriteria).toBe(false);
      expect(report.promotionBlockers.some((b) => b.includes('Period'))).toBe(
        true,
      );
    });

    it('should pass promotion criteria when all requirements met', async () => {
      const comparisons = Array.from({ length: 150 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'categorizer',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 120,
        heuristicDurationMs: 80,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.meetsPromotionCriteria).toBe(true);
      expect(report.promotionBlockers).toEqual([]);
      expect(report.matchRate).toBe(100);
      expect(report.totalDecisions).toBe(150);
    });

    it('should handle empty comparison data', async () => {
      prisma.shadowComparison.findMany.mockResolvedValue([]);

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.totalDecisions).toBe(0);
      expect(report.matchRate).toBe(0);
      expect(report.sdkBetter).toBe(0);
      expect(report.heuristicBetter).toBe(0);
      expect(report.identical).toBe(0);
      expect(report.meetsPromotionCriteria).toBe(false);
      expect(report.promotionBlockers.length).toBeGreaterThan(0);
    });

    it('should handle Prisma errors gracefully', async () => {
      prisma.shadowComparison.findMany.mockRejectedValue(
        new Error('Connection refused'),
      );

      const report = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.totalDecisions).toBe(0);
      expect(report.meetsPromotionCriteria).toBe(false);
    });

    it('should count heuristicBetter when heuristic confidence is higher', async () => {
      prisma.shadowComparison.findMany.mockResolvedValue([
        {
          id: 'c-1',
          tenantId: TEST_TENANT,
          agentType: 'matcher',
          sdkResult: {},
          heuristicResult: {},
          resultsMatch: false,
          sdkConfidence: 60,
          heuristicConfidence: 85,
          sdkDurationMs: 100,
          heuristicDurationMs: 50,
          matchDetails: null,
          createdAt: new Date(),
        },
      ]);

      const report = await aggregator.generateReport('matcher', TEST_TENANT, 7);

      expect(report.heuristicBetter).toBe(1);
      expect(report.sdkBetter).toBe(0);
      expect(report.identical).toBe(0);
    });
  });

  describe('generateAllReports', () => {
    it('should return reports for all 5 agent types', async () => {
      const reports = await aggregator.generateAllReports(TEST_TENANT, 7);

      expect(reports).toHaveLength(5);
      const agentTypes = reports.map((r) => r.agentType);
      expect(agentTypes).toContain('categorizer');
      expect(agentTypes).toContain('matcher');
      expect(agentTypes).toContain('sars');
      expect(agentTypes).toContain('validator');
      expect(agentTypes).toContain('orchestrator');
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus-compatible metrics', async () => {
      prisma.shadowComparison.findMany.mockResolvedValue([]);

      const metrics = await aggregator.getMetrics(TEST_TENANT);

      expect(metrics.length).toBeGreaterThan(0);
      // 5 agents * 5 metrics = 25
      expect(metrics).toHaveLength(25);

      for (const metric of metrics) {
        expect(metric.name).toMatch(/^crechebooks_agent_/);
        expect(metric.type).toMatch(/^(counter|gauge|histogram)$/);
        expect(typeof metric.value).toBe('number');
        expect(metric.labels.agent).toBeDefined();
        expect(metric.labels.tenant).toBeDefined();
      }
    });

    it('should include all metric types', async () => {
      const metrics = await aggregator.getMetrics(TEST_TENANT);

      const metricNames = new Set(metrics.map((m) => m.name));
      expect(metricNames.has('crechebooks_agent_decision_count')).toBe(true);
      expect(metricNames.has('crechebooks_agent_match_rate')).toBe(true);
      expect(metricNames.has('crechebooks_agent_sdk_latency_ms')).toBe(true);
      expect(metricNames.has('crechebooks_agent_heuristic_latency_ms')).toBe(
        true,
      );
      expect(metricNames.has('crechebooks_agent_sdk_confidence')).toBe(true);
    });
  });

  describe('getDashboardSummary', () => {
    it('should return summary for all 5 agents', async () => {
      const summary = await aggregator.getDashboardSummary(TEST_TENANT, 7);

      expect(summary).toHaveLength(5);
      for (const entry of summary) {
        expect(entry.agentType).toBeDefined();
        expect(typeof entry.totalDecisions).toBe('number');
        expect(typeof entry.matchRate).toBe('number');
        expect(typeof entry.meetsPromotionCriteria).toBe('boolean');
      }
    });
  });

  describe('graceful degradation without Prisma', () => {
    it('should return empty report when Prisma unavailable', async () => {
      const noPrismaModule = await Test.createTestingModule({
        providers: [ShadowComparisonAggregator],
      }).compile();

      const noPrismaAggregator = noPrismaModule.get(ShadowComparisonAggregator);

      const report = await noPrismaAggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.totalDecisions).toBe(0);
      expect(report.meetsPromotionCriteria).toBe(false);
    });
  });

  describe('per-agent promotion criteria overrides', () => {
    // These tests mutate PROMOTION_CRITERIA_BY_AGENT — snapshot & restore per
    // test so the empty-by-default extension point stays clean for downstream.
    let snapshot: Partial<
      Record<PromotableAgentType, Partial<typeof DEFAULT_PROMOTION_CRITERIA>>
    >;

    beforeEach(() => {
      snapshot = { ...PROMOTION_CRITERIA_BY_AGENT };
    });
    afterEach(() => {
      for (const k of Object.keys(PROMOTION_CRITERIA_BY_AGENT)) {
        delete PROMOTION_CRITERIA_BY_AGENT[k as PromotableAgentType];
      }
      Object.assign(PROMOTION_CRITERIA_BY_AGENT, snapshot);
    });

    it('default map is empty (extension point only)', () => {
      expect(Object.keys(snapshot)).toHaveLength(0);
    });

    it('resolvePromotionCriteria returns defaults when no override', () => {
      expect(resolvePromotionCriteria('categorizer')).toEqual(
        DEFAULT_PROMOTION_CRITERIA,
      );
    });

    it('per-agent override is shallow-merged over the default', () => {
      PROMOTION_CRITERIA_BY_AGENT.sars = { maxLatencyMultiplier: 3.0 };
      const resolved = resolvePromotionCriteria('sars');
      expect(resolved.maxLatencyMultiplier).toBe(3.0);
      // Non-overridden fields fall through
      expect(resolved.minMatchRate).toBe(
        DEFAULT_PROMOTION_CRITERIA.minMatchRate,
      );
      expect(resolved.minComparisons).toBe(
        DEFAULT_PROMOTION_CRITERIA.minComparisons,
      );
      // Other agents unaffected
      expect(resolvePromotionCriteria('categorizer').maxLatencyMultiplier).toBe(
        DEFAULT_PROMOTION_CRITERIA.maxLatencyMultiplier,
      );
    });

    it('generateReport picks up per-agent override when criteria omitted', async () => {
      // Sars gets a tighter 3x latency ceiling via the per-agent map.
      PROMOTION_CRITERIA_BY_AGENT.sars = { maxLatencyMultiplier: 3.0 };

      // 5x SDK latency: passes default 10x, but fails sars-specific 3x.
      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'sars',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 500,
        heuristicDurationMs: 100,
        matchDetails: null,
        createdAt: new Date(),
      }));
      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const sarsReport = await aggregator.generateReport(
        'sars',
        TEST_TENANT,
        7,
      );
      expect(sarsReport.meetsPromotionCriteria).toBe(false);
      expect(
        sarsReport.promotionBlockers.some((b) => b.includes('SDK latency')),
      ).toBe(true);

      // Same latency profile for categorizer (no override) — should PASS.
      const catComparisons = comparisons.map((c) => ({
        ...c,
        agentType: 'categorizer',
      }));
      prisma.shadowComparison.findMany.mockResolvedValue(catComparisons);
      const catReport = await aggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );
      expect(catReport.meetsPromotionCriteria).toBe(true);
    });

    it('explicit criteria argument still bypasses the per-agent map', async () => {
      // Even though sars has an override, an explicit criteria object wins.
      PROMOTION_CRITERIA_BY_AGENT.sars = { maxLatencyMultiplier: 3.0 };

      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'sars',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 500, // 5x — passes 10x, fails per-agent 3x
        heuristicDurationMs: 100,
        matchDetails: null,
        createdAt: new Date(),
      }));
      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      // Caller passes explicit criteria with 10x ceiling — should PASS,
      // ignoring the per-agent 3x override.
      const explicit = {
        ...DEFAULT_PROMOTION_CRITERIA,
        maxLatencyMultiplier: 10.0,
      };
      const report = await aggregator.generateReport(
        'sars',
        TEST_TENANT,
        7,
        explicit,
      );
      expect(report.meetsPromotionCriteria).toBe(true);
    });
  });

  describe('DEFAULT_PROMOTION_CRITERIA', () => {
    it('permits typical LLM latency overhead on background agents', () => {
      // Sanity check on the load-bearing constant.
      expect(DEFAULT_PROMOTION_CRITERIA.maxLatencyMultiplier).toBe(10.0);
      expect(DEFAULT_PROMOTION_CRITERIA.minMatchRate).toBe(95);
      expect(DEFAULT_PROMOTION_CRITERIA.minComparisons).toBe(100);
    });
  });
});
