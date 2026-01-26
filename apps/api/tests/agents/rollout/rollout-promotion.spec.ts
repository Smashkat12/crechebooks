/**
 * Rollout Promotion Service Tests
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * All tests mock Prisma and FeatureFlagService -- zero real database connections.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RolloutPromotionService } from '../../../src/agents/rollout/rollout-promotion.service';
import { FeatureFlagService } from '../../../src/agents/rollout/feature-flags.service';
import { ShadowComparisonAggregator } from '../../../src/agents/rollout/shadow-comparison-aggregator';
import type {
  ComparisonReport,
  PromotableAgentType,
} from '../../../src/agents/rollout/interfaces/comparison-report.interface';
import { DEFAULT_PROMOTION_CRITERIA } from '../../../src/agents/rollout/interfaces/comparison-report.interface';

describe('RolloutPromotionService', () => {
  let service: RolloutPromotionService;
  let featureFlagService: {
    getMode: jest.Mock;
    enablePrimary: jest.Mock;
    enableShadow: jest.Mock;
    disable: jest.Mock;
  };
  let aggregator: {
    generateReport: jest.Mock;
    generateAllReports: jest.Mock;
  };
  const TEST_TENANT = 'bdff4374-64d5-420c-b454-8e85e9df552a';

  function buildReport(
    overrides: Partial<ComparisonReport> = {},
  ): ComparisonReport {
    return {
      agentType: 'categorizer',
      tenantId: TEST_TENANT,
      period: {
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        daysIncluded: 7,
      },
      totalDecisions: 200,
      matchRate: 98,
      sdkBetter: 4,
      heuristicBetter: 0,
      identical: 196,
      avgLatencyDiffMs: 50,
      sdkAvgLatencyMs: 120,
      heuristicAvgLatencyMs: 70,
      sdkAvgConfidence: 90,
      heuristicAvgConfidence: 85,
      memoryUsageBytes: 0,
      meetsPromotionCriteria: true,
      promotionBlockers: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    featureFlagService = {
      getMode: jest.fn().mockResolvedValue('SHADOW'),
      enablePrimary: jest.fn().mockResolvedValue(undefined),
      enableShadow: jest.fn().mockResolvedValue(undefined),
      disable: jest.fn().mockResolvedValue(undefined),
    };

    aggregator = {
      generateReport: jest.fn().mockResolvedValue(buildReport()),
      generateAllReports: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolloutPromotionService,
        { provide: FeatureFlagService, useValue: featureFlagService },
        { provide: ShadowComparisonAggregator, useValue: aggregator },
      ],
    }).compile();

    service = module.get(RolloutPromotionService);
  });

  describe('promote', () => {
    it('should promote when criteria are met', async () => {
      const report = buildReport({
        meetsPromotionCriteria: true,
        promotionBlockers: [],
        matchRate: 98,
        totalDecisions: 200,
      });
      aggregator.generateReport.mockResolvedValue(report);

      const result = await service.promote('categorizer', TEST_TENANT);

      expect(result.success).toBe(true);
      expect(result.newMode).toBe('PRIMARY');
      expect(result.previousMode).toBe('SHADOW');
      expect(result.report).toBeDefined();
      expect(featureFlagService.enablePrimary).toHaveBeenCalledWith(
        TEST_TENANT,
        'sdk_categorizer',
        expect.objectContaining({
          promotedAt: expect.any(String),
          matchRate: 98,
          totalDecisions: 200,
        }),
      );
    });

    it('should block promotion when match rate too low', async () => {
      const report = buildReport({
        matchRate: 80,
        meetsPromotionCriteria: false,
        promotionBlockers: ['Match rate 80% < required 95%'],
      });
      aggregator.generateReport.mockResolvedValue(report);

      const result = await service.promote('categorizer', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.newMode).toBe('SHADOW');
      expect(result.reason).toContain('Match rate');
      expect(featureFlagService.enablePrimary).not.toHaveBeenCalled();
    });

    it('should block promotion when too few comparisons', async () => {
      const report = buildReport({
        totalDecisions: 50,
        meetsPromotionCriteria: false,
        promotionBlockers: ['Only 50 comparisons < required 100'],
      });
      aggregator.generateReport.mockResolvedValue(report);

      const result = await service.promote('categorizer', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('comparisons');
    });

    it('should block promotion when SDK latency too high', async () => {
      const report = buildReport({
        sdkAvgLatencyMs: 500,
        heuristicAvgLatencyMs: 100,
        meetsPromotionCriteria: false,
        promotionBlockers: ['SDK latency 5.0x > max 2.0x'],
      });
      aggregator.generateReport.mockResolvedValue(report);

      const result = await service.promote('matcher', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('SDK latency');
    });

    it('should return failure for unknown agent type', async () => {
      const result = await service.promote(
        'unknown' as PromotableAgentType,
        TEST_TENANT,
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Unknown agent type');
    });

    it('should handle database errors during promotion', async () => {
      const report = buildReport({
        meetsPromotionCriteria: true,
        promotionBlockers: [],
      });
      aggregator.generateReport.mockResolvedValue(report);
      featureFlagService.enablePrimary.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.promote('categorizer', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Database error');
    });

    it('should promote all 5 agent types when criteria met', async () => {
      const agents: PromotableAgentType[] = [
        'categorizer',
        'matcher',
        'sars',
        'validator',
        'orchestrator',
      ];

      for (const agent of agents) {
        const report = buildReport({
          agentType: agent,
          meetsPromotionCriteria: true,
          promotionBlockers: [],
        });
        aggregator.generateReport.mockResolvedValue(report);

        const result = await service.promote(agent, TEST_TENANT);
        expect(result.success).toBe(true);
        expect(result.agentType).toBe(agent);
      }
    });

    it('should use correct flag key for each agent type', async () => {
      const flagMap: Record<string, string> = {
        categorizer: 'sdk_categorizer',
        matcher: 'sdk_matcher',
        sars: 'sdk_sars',
        validator: 'sdk_validator',
        orchestrator: 'sdk_orchestrator',
      };

      for (const [agent, flag] of Object.entries(flagMap)) {
        const report = buildReport({
          agentType: agent as PromotableAgentType,
          meetsPromotionCriteria: true,
        });
        aggregator.generateReport.mockResolvedValue(report);

        await service.promote(agent as PromotableAgentType, TEST_TENANT);

        expect(featureFlagService.enablePrimary).toHaveBeenCalledWith(
          TEST_TENANT,
          flag,
          expect.any(Object),
        );
        featureFlagService.enablePrimary.mockClear();
      }
    });

    it('should pass custom promotion criteria to aggregator', async () => {
      const customCriteria = {
        ...DEFAULT_PROMOTION_CRITERIA,
        minMatchRate: 99,
        minComparisons: 500,
      };

      const report = buildReport({
        meetsPromotionCriteria: false,
        promotionBlockers: ['Only 200 comparisons < required 500'],
      });
      aggregator.generateReport.mockResolvedValue(report);

      const result = await service.promote(
        'categorizer',
        TEST_TENANT,
        customCriteria,
      );

      expect(result.success).toBe(false);
      expect(aggregator.generateReport).toHaveBeenCalledWith(
        'categorizer',
        TEST_TENANT,
        customCriteria.minPeriodDays,
        customCriteria,
      );
    });
  });

  describe('rollback', () => {
    it('should immediately set mode to DISABLED', async () => {
      featureFlagService.getMode.mockResolvedValue('PRIMARY');

      const result = await service.rollback('categorizer', TEST_TENANT);

      expect(result.newMode).toBe('DISABLED');
      expect(result.success).toBe(true);
      expect(result.previousMode).toBe('PRIMARY');
      expect(featureFlagService.disable).toHaveBeenCalledWith(
        TEST_TENANT,
        'sdk_categorizer',
      );
    });

    it('should rollback unconditionally (no criteria check)', async () => {
      const result = await service.rollback('categorizer', TEST_TENANT);

      expect(result.success).toBe(true);
      // Aggregator should NOT be called for rollback
      expect(aggregator.generateReport).not.toHaveBeenCalled();
    });

    it('should handle database errors during rollback', async () => {
      featureFlagService.disable.mockRejectedValue(
        new Error('Connection lost'),
      );

      const result = await service.rollback('categorizer', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Database error');
    });

    it('should return failure for unknown agent type', async () => {
      const result = await service.rollback(
        'unknown' as PromotableAgentType,
        TEST_TENANT,
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Unknown agent type');
    });

    it('should rollback from SHADOW mode', async () => {
      featureFlagService.getMode.mockResolvedValue('SHADOW');

      const result = await service.rollback('matcher', TEST_TENANT);

      expect(result.success).toBe(true);
      expect(result.previousMode).toBe('SHADOW');
      expect(result.newMode).toBe('DISABLED');
    });
  });

  describe('getStatus', () => {
    it('should return status for all 5 agents', async () => {
      featureFlagService.getMode.mockResolvedValue('SHADOW');

      const statuses = await service.getStatus(TEST_TENANT);

      expect(statuses).toHaveLength(5);
      expect(statuses.map((s) => s.agentType)).toEqual([
        'categorizer',
        'matcher',
        'sars',
        'validator',
        'orchestrator',
      ]);
    });

    it('should return correct mode for each agent', async () => {
      featureFlagService.getMode.mockImplementation(
        (_tenantId: string, flag: string) => {
          const modes: Record<string, string> = {
            sdk_categorizer: 'PRIMARY',
            sdk_matcher: 'SHADOW',
            sdk_sars: 'DISABLED',
            sdk_validator: 'SHADOW',
            sdk_orchestrator: 'DISABLED',
          };
          return Promise.resolve(modes[flag] ?? 'DISABLED');
        },
      );

      const statuses = await service.getStatus(TEST_TENANT);

      const statusMap = new Map(
        statuses.map((s) => [s.agentType, s.mode]),
      );
      expect(statusMap.get('categorizer')).toBe('PRIMARY');
      expect(statusMap.get('matcher')).toBe('SHADOW');
      expect(statusMap.get('sars')).toBe('DISABLED');
      expect(statusMap.get('validator')).toBe('SHADOW');
      expect(statusMap.get('orchestrator')).toBe('DISABLED');
    });
  });

  describe('graceful degradation without aggregator', () => {
    it('should return failure when aggregator unavailable', async () => {
      const noAggModule = await Test.createTestingModule({
        providers: [
          RolloutPromotionService,
          { provide: FeatureFlagService, useValue: featureFlagService },
        ],
      }).compile();

      const noAggService = noAggModule.get(RolloutPromotionService);

      const result = await noAggService.promote('categorizer', TEST_TENANT);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('ShadowComparisonAggregator unavailable');
    });

    it('should still allow rollback when aggregator unavailable', async () => {
      const noAggModule = await Test.createTestingModule({
        providers: [
          RolloutPromotionService,
          { provide: FeatureFlagService, useValue: featureFlagService },
        ],
      }).compile();

      const noAggService = noAggModule.get(RolloutPromotionService);

      const result = await noAggService.rollback('categorizer', TEST_TENANT);

      expect(result.success).toBe(true);
      expect(result.newMode).toBe('DISABLED');
    });
  });
});
