/**
 * Shadow Comparison Aggregator Tests
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * All tests mock Prisma -- zero real database connections.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ShadowComparisonAggregator } from '../../../src/agents/rollout/shadow-comparison-aggregator';
import { PrismaService } from '../../../src/database/prisma/prisma.service';

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

      const report = await aggregator.generateReport(
        'matcher',
        TEST_TENANT,
        7,
      );

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

    it('should identify promotion blockers for high latency', async () => {
      // Create 200 comparisons with 100% match but 3x SDK latency
      const comparisons = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        tenantId: TEST_TENANT,
        agentType: 'sars',
        sdkResult: {},
        heuristicResult: {},
        resultsMatch: true,
        sdkConfidence: 90,
        heuristicConfidence: 85,
        sdkDurationMs: 300, // 3x heuristic
        heuristicDurationMs: 100,
        matchDetails: null,
        createdAt: new Date(),
      }));

      prisma.shadowComparison.findMany.mockResolvedValue(comparisons);

      const report = await aggregator.generateReport(
        'sars',
        TEST_TENANT,
        7,
      );

      expect(report.meetsPromotionCriteria).toBe(false);
      expect(
        report.promotionBlockers.some((b) => b.includes('SDK latency')),
      ).toBe(true);
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
      expect(
        report.promotionBlockers.some((b) => b.includes('Period')),
      ).toBe(true);
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

      const report = await aggregator.generateReport(
        'matcher',
        TEST_TENANT,
        7,
      );

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

      const noPrismaAggregator = noPrismaModule.get(
        ShadowComparisonAggregator,
      );

      const report = await noPrismaAggregator.generateReport(
        'categorizer',
        TEST_TENANT,
        7,
      );

      expect(report.totalDecisions).toBe(0);
      expect(report.meetsPromotionCriteria).toBe(false);
    });
  });
});
