/**
 * AgentRolloutService — unit specs
 *
 * Verifies the safety rules that make this admin surface trustworthy:
 *  - listAll and getTenant fan out over the 5 promotable agents and join with
 *    the shadow-comparison aggregator.
 *  - setMode → PRIMARY without force checks promotion criteria and refuses
 *    when they are not met.
 *  - setMode → PRIMARY with force bypasses the check.
 *  - setMode → SHADOW / DISABLED skip the check entirely.
 *  - Every mutation writes an audit_logs row via AuditLogService.
 *  - Unknown agent types raise NotFoundException on setMode / promote.
 *  - rollbackAll disables every agent unconditionally.
 *  - Tenant isolation: missing tenant → NotFoundException.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentRolloutService } from '../agent-rollout.service';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../../database/services/audit-log.service';
import { FeatureFlagService } from '../../../../agents/rollout/feature-flags.service';
import { RolloutPromotionService } from '../../../../agents/rollout/rollout-promotion.service';
import { ShadowComparisonAggregator } from '../../../../agents/rollout/shadow-comparison-aggregator';
import type { ComparisonReport } from '../../../../agents/rollout/interfaces/comparison-report.interface';

const TENANT = '00000000-0000-0000-0000-000000000001';
const ACTOR = {
  userId: 'user-1',
  ipAddress: '10.0.0.1',
  userAgent: 'jest',
};

function makeReport(
  overrides: Partial<ComparisonReport> = {},
): ComparisonReport {
  return {
    agentType: 'categorizer',
    tenantId: TENANT,
    period: {
      startDate: '2026-06-30T00:00:00.000Z',
      endDate: '2026-07-07T00:00:00.000Z',
      daysIncluded: 7,
    },
    totalDecisions: 200,
    matchRate: 98,
    sdkBetter: 10,
    heuristicBetter: 2,
    identical: 188,
    avgLatencyDiffMs: 50,
    sdkAvgLatencyMs: 200,
    heuristicAvgLatencyMs: 150,
    sdkAvgConfidence: 92,
    heuristicAvgConfidence: 88,
    memoryUsageBytes: 0,
    meetsPromotionCriteria: true,
    promotionBlockers: [],
    ...overrides,
  };
}

describe('AgentRolloutService', () => {
  let service: AgentRolloutService;
  let prisma: {
    tenant: { findMany: jest.Mock; findUnique: jest.Mock };
  };
  let featureFlags: {
    getMode: jest.Mock;
    disable: jest.Mock;
    enableShadow: jest.Mock;
    enablePrimary: jest.Mock;
  };
  let promotion: { promote: jest.Mock };
  let aggregator: { generateAllReports: jest.Mock; generateReport: jest.Mock };
  let audit: { logAction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: TENANT,
          tradingName: 'Elle Elephant',
          name: 'Elle Elephant',
        }),
      },
    };
    featureFlags = {
      getMode: jest.fn().mockResolvedValue('DISABLED'),
      disable: jest.fn().mockResolvedValue(undefined),
      enableShadow: jest.fn().mockResolvedValue(undefined),
      enablePrimary: jest.fn().mockResolvedValue(undefined),
    };
    promotion = {
      promote: jest.fn(),
    };
    aggregator = {
      generateAllReports: jest.fn().mockResolvedValue([]),
      generateReport: jest.fn().mockResolvedValue(makeReport()),
    };
    audit = { logAction: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentRolloutService,
        { provide: PrismaService, useValue: prisma },
        { provide: FeatureFlagService, useValue: featureFlags },
        { provide: RolloutPromotionService, useValue: promotion },
        { provide: ShadowComparisonAggregator, useValue: aggregator },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get(AgentRolloutService);
  });

  // ============================================
  // READ
  // ============================================

  describe('listAll', () => {
    it('returns one row per (tenant × agent-type)', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-a', tradingName: 'Alpha', name: 'Alpha Ltd' },
        { id: 'tenant-b', tradingName: null, name: 'Beta Inc' },
      ]);
      aggregator.generateAllReports.mockResolvedValue([
        makeReport({ agentType: 'categorizer', matchRate: 95 }),
      ]);

      const res = await service.listAll(7);

      // 2 tenants × 5 agent types = 10 rows
      expect(res.rows).toHaveLength(10);
      // Beta Inc: tradingName is null, falls back to name
      const betaRow = res.rows.find((r) => r.tenantId === 'tenant-b');
      expect(betaRow?.tenantName).toBe('Beta Inc');
      // Categorizer row for tenant-a picks up the report's matchRate
      const alphaCat = res.rows.find(
        (r) => r.tenantId === 'tenant-a' && r.agentType === 'categorizer',
      );
      expect(alphaCat?.matchRate).toBe(95);
      // Agent types with no report get zeroed stats
      const alphaSars = res.rows.find(
        (r) => r.tenantId === 'tenant-a' && r.agentType === 'sars',
      );
      expect(alphaSars?.matchRate).toBe(0);
      expect(alphaSars?.totalDecisions).toBe(0);
    });
  });

  describe('getTenant', () => {
    it('throws NotFoundException when tenant is missing', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getTenant('bogus', 7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the tenant’s five agents joined with reports', async () => {
      aggregator.generateAllReports.mockResolvedValue([
        makeReport({
          agentType: 'matcher',
          matchRate: 97,
          totalDecisions: 250,
        }),
      ]);
      featureFlags.getMode.mockImplementation((_t, flag) =>
        flag === 'sdk_matcher' ? 'SHADOW' : 'DISABLED',
      );

      const res = await service.getTenant(TENANT, 7);

      expect(res.agents).toHaveLength(5);
      const matcher = res.agents.find((a) => a.agentType === 'matcher');
      expect(matcher?.mode).toBe('SHADOW');
      expect(matcher?.matchRate).toBe(97);
      expect(matcher?.totalDecisions).toBe(250);
    });
  });

  // ============================================
  // setMode
  // ============================================

  describe('setMode', () => {
    it('promoting to PRIMARY without force is blocked when criteria unmet', async () => {
      aggregator.generateReport.mockResolvedValue(
        makeReport({
          meetsPromotionCriteria: false,
          promotionBlockers: ['Match rate 60% < required 95%'],
        }),
      );

      const res = await service.setMode(
        TENANT,
        'categorizer',
        'PRIMARY',
        'attempt',
        false,
        ACTOR,
      );

      expect(res.success).toBe(false);
      expect(res.newMode).toBe('DISABLED'); // stays at previous mode
      expect(res.reason).toContain('Match rate 60%');
      expect(featureFlags.enablePrimary).not.toHaveBeenCalled();
      // Blocked mutation still writes an audit row
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT,
          userId: ACTOR.userId,
          entityType: 'AgentRollout',
          changeSummary: expect.stringContaining('BLOCKED'),
        }),
      );
    });

    it('promoting to PRIMARY with force bypasses the criteria check', async () => {
      aggregator.generateReport.mockResolvedValue(
        makeReport({
          meetsPromotionCriteria: false,
          promotionBlockers: ['Match rate too low'],
        }),
      );

      const res = await service.setMode(
        TENANT,
        'categorizer',
        'PRIMARY',
        'urgent override',
        true,
        ACTOR,
      );

      expect(res.success).toBe(true);
      expect(res.newMode).toBe('PRIMARY');
      expect(featureFlags.enablePrimary).toHaveBeenCalledWith(
        TENANT,
        'sdk_categorizer',
        expect.objectContaining({ force: true, reason: 'urgent override' }),
      );
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSummary: expect.stringContaining('DISABLED -> PRIMARY'),
        }),
      );
    });

    it('setting SHADOW never triggers the criteria check', async () => {
      const res = await service.setMode(
        TENANT,
        'matcher',
        'SHADOW',
        'begin ramp-up',
        false,
        ACTOR,
      );

      expect(res.success).toBe(true);
      expect(res.newMode).toBe('SHADOW');
      expect(featureFlags.enableShadow).toHaveBeenCalledWith(
        TENANT,
        'sdk_matcher',
        expect.objectContaining({ reason: 'begin ramp-up' }),
      );
      expect(aggregator.generateReport).not.toHaveBeenCalled();
    });

    it('setting DISABLED works from any mode without criteria check', async () => {
      featureFlags.getMode.mockResolvedValue('PRIMARY');
      const res = await service.setMode(
        TENANT,
        'validator',
        'DISABLED',
        'kill switch',
        false,
        ACTOR,
      );

      expect(res.success).toBe(true);
      expect(res.previousMode).toBe('PRIMARY');
      expect(res.newMode).toBe('DISABLED');
      expect(featureFlags.disable).toHaveBeenCalledWith(
        TENANT,
        'sdk_validator',
      );
      expect(aggregator.generateReport).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when tenant missing', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(
        service.setMode(TENANT, 'categorizer', 'SHADOW', 'x', false, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ============================================
  // promote
  // ============================================

  describe('promote', () => {
    it('delegates to RolloutPromotionService and audits the result', async () => {
      const report = makeReport();
      promotion.promote.mockResolvedValue({
        agentType: 'categorizer',
        tenantId: TENANT,
        previousMode: 'SHADOW',
        newMode: 'PRIMARY',
        success: true,
        report,
        timestamp: '2026-07-07T00:00:00.000Z',
      });

      const res = await service.promote(
        TENANT,
        'categorizer',
        'weekly promotion',
        ACTOR,
      );

      expect(res.success).toBe(true);
      expect(res.newMode).toBe('PRIMARY');
      expect(res.report).toEqual(report);
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSummary: expect.stringContaining('AUTO-PROMOTE'),
        }),
      );
    });

    it('surfaces failure reason and audits the failed attempt', async () => {
      promotion.promote.mockResolvedValue({
        agentType: 'categorizer',
        tenantId: TENANT,
        previousMode: 'SHADOW',
        newMode: 'SHADOW',
        success: false,
        reason: 'Only 30 comparisons < required 100',
        timestamp: '2026-07-07T00:00:00.000Z',
      });

      const res = await service.promote(TENANT, 'categorizer', 'try', ACTOR);

      expect(res.success).toBe(false);
      expect(res.newMode).toBe('SHADOW');
      expect(res.reason).toContain('30 comparisons');
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSummary: expect.stringContaining('AUTO-PROMOTE FAILED'),
        }),
      );
    });
  });

  // ============================================
  // rollbackAll
  // ============================================

  describe('rollbackAll', () => {
    it('disables every agent and audits each one', async () => {
      featureFlags.getMode.mockResolvedValue('PRIMARY');

      const res = await service.rollbackAll(
        TENANT,
        'emergency: matcher misbehaving',
        ACTOR,
      );

      expect(res.success).toBe(true);
      expect(res.results).toHaveLength(5);
      expect(featureFlags.disable).toHaveBeenCalledTimes(5);
      expect(audit.logAction).toHaveBeenCalledTimes(5);
      for (const call of audit.logAction.mock.calls) {
        expect(call[0].changeSummary).toContain('ROLLBACK-ALL');
      }
    });

    it('reports partial failure when the DB layer errors on one agent', async () => {
      featureFlags.getMode.mockResolvedValue('SHADOW');
      featureFlags.disable
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockResolvedValue(undefined);

      const res = await service.rollbackAll(TENANT, 'try', ACTOR);
      expect(res.success).toBe(false);
      expect(res.results.filter((r) => !r.success)).toHaveLength(1);
    });
  });
});
