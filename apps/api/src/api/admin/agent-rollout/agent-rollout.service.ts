/**
 * Agent Rollout Service
 *
 * @module api/admin/agent-rollout/agent-rollout.service
 * @description Business logic for the SUPER_ADMIN agent rollout console.
 * Wraps the existing per-tenant rollout primitives:
 *
 *   FeatureFlagService       — reads/writes feature_flags rows
 *   ShadowComparisonAggregator — summarises shadow_comparisons for the UI
 *   RolloutPromotionService  — SHADOW → PRIMARY promotion with go/no-go check
 *
 * Every mutation is written to the immutable audit_logs table (via
 * AuditLogService) with the acting SUPER_ADMIN user id so we can prove after
 * the fact who flipped which agent for which tenant.
 *
 * CRITICAL RULES:
 *  - SetMode → PRIMARY defaults to enforcing promotion criteria; `force`
 *    must be explicitly true to bypass.
 *  - RollbackAll unconditionally sets all 5 agents to DISABLED.
 *  - Every mutation writes an AuditLog row before returning.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';
import { FeatureFlagService } from '../../../agents/rollout/feature-flags.service';
import { RolloutPromotionService } from '../../../agents/rollout/rollout-promotion.service';
import { ShadowComparisonAggregator } from '../../../agents/rollout/shadow-comparison-aggregator';
import type {
  PromotableAgentType,
  RolloutMode,
  ComparisonReport,
} from '../../../agents/rollout/interfaces/comparison-report.interface';
import { resolvePromotionCriteria } from '../../../agents/rollout/interfaces/comparison-report.interface';
import {
  AGENT_FLAG_MAP,
  AgentRolloutListResponseDto,
  AgentRolloutRowDto,
  AgentRolloutTenantResponseDto,
  PROMOTABLE_AGENT_TYPES,
  RolloutMutationResponseDto,
  RolloutRollbackAllResponseDto,
} from '../dto/agent-rollout.dto';

/** Default reporting window used by the console (matches promotion criteria). */
const DEFAULT_PERIOD_DAYS = 7;

/** entityType used in audit_logs for these mutations. */
const AUDIT_ENTITY_TYPE = 'AgentRollout';

interface ActorContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AgentRolloutService {
  private readonly logger = new Logger(AgentRolloutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly promotionService: RolloutPromotionService,
    private readonly aggregator: ShadowComparisonAggregator,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ============================================
  // READ
  // ============================================

  /**
   * List the rollout state of every (tenant × agent-type) pair, joined with a
   * summary of recent shadow-comparison accuracy from `shadow_comparisons`.
   * Used by GET /admin/agent-rollout.
   */
  async listAll(
    periodDays: number = DEFAULT_PERIOD_DAYS,
  ): Promise<AgentRolloutListResponseDto> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, tradingName: true, name: true },
      orderBy: { tradingName: 'asc' },
    });

    const rows: AgentRolloutRowDto[] = [];
    for (const tenant of tenants) {
      const reports = await this.aggregator.generateAllReports(
        tenant.id,
        periodDays,
      );
      const reportByType = new Map<PromotableAgentType, ComparisonReport>();
      for (const r of reports) {
        reportByType.set(r.agentType, r);
      }

      for (const agentType of PROMOTABLE_AGENT_TYPES) {
        const flagKey = AGENT_FLAG_MAP[agentType];
        const mode = (await this.featureFlagService.getMode(
          tenant.id,
          flagKey,
        )) as RolloutMode;
        const report = reportByType.get(agentType);
        rows.push({
          tenantId: tenant.id,
          tenantName: tenant.tradingName ?? tenant.name,
          agentType,
          flagKey,
          mode,
          matchRate: report?.matchRate ?? 0,
          totalDecisions: report?.totalDecisions ?? 0,
          meetsPromotionCriteria: report?.meetsPromotionCriteria ?? false,
          promotionBlockers: report?.promotionBlockers ?? [],
        });
      }
    }

    return {
      rows,
      periodDays,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Return one tenant's full rollout state (all 5 agents).
   * Used by GET /admin/agent-rollout/:tenantId.
   */
  async getTenant(
    tenantId: string,
    periodDays: number = DEFAULT_PERIOD_DAYS,
  ): Promise<AgentRolloutTenantResponseDto> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, tradingName: true, name: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const reports = await this.aggregator.generateAllReports(
      tenantId,
      periodDays,
    );
    const reportByType = new Map<PromotableAgentType, ComparisonReport>();
    for (const r of reports) {
      reportByType.set(r.agentType, r);
    }

    const agents: AgentRolloutRowDto[] = [];
    for (const agentType of PROMOTABLE_AGENT_TYPES) {
      const flagKey = AGENT_FLAG_MAP[agentType];
      const mode = (await this.featureFlagService.getMode(
        tenantId,
        flagKey,
      )) as RolloutMode;
      const report = reportByType.get(agentType);
      agents.push({
        tenantId,
        tenantName: tenant.tradingName ?? tenant.name,
        agentType,
        flagKey,
        mode,
        matchRate: report?.matchRate ?? 0,
        totalDecisions: report?.totalDecisions ?? 0,
        meetsPromotionCriteria: report?.meetsPromotionCriteria ?? false,
        promotionBlockers: report?.promotionBlockers ?? [],
      });
    }

    return {
      tenantId,
      tenantName: tenant.tradingName ?? tenant.name,
      agents,
      periodDays,
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================
  // WRITE
  // ============================================

  /**
   * Set a specific tenant×agent to a specific mode.
   *
   * Safety: promoting to PRIMARY without `force: true` fails when the current
   * comparison report does not meet promotion criteria. DISABLED and SHADOW
   * changes are unconditional (SHADOW is the entry ramp, DISABLED is safe).
   */
  async setMode(
    tenantId: string,
    agentType: PromotableAgentType,
    mode: RolloutMode,
    reason: string,
    force: boolean,
    actor: ActorContext,
  ): Promise<RolloutMutationResponseDto> {
    await this.assertTenantExists(tenantId);
    const flagKey = AGENT_FLAG_MAP[agentType];
    if (!flagKey) {
      throw new NotFoundException(`Unknown agent type: ${agentType}`);
    }

    const previousMode = (await this.featureFlagService.getMode(
      tenantId,
      flagKey,
    )) as RolloutMode;

    // PRIMARY promotion: enforce criteria unless force=true
    // Uses per-agent-aware criteria so agents with custom SLA (via
    // PROMOTION_CRITERIA_BY_AGENT) evaluate against their own thresholds.
    if (mode === 'PRIMARY' && !force) {
      const effectiveCriteria = resolvePromotionCriteria(agentType);
      const report = await this.aggregator.generateReport(
        agentType,
        tenantId,
        effectiveCriteria.minPeriodDays,
        effectiveCriteria,
      );
      if (!report.meetsPromotionCriteria) {
        this.logger.warn(
          `setMode PRIMARY blocked for ${agentType} tenant=${tenantId} — ${report.promotionBlockers.join('; ')}`,
        );
        await this.writeAudit(
          tenantId,
          agentType,
          previousMode,
          previousMode,
          `BLOCKED: ${reason} — ${report.promotionBlockers.join('; ')}`,
          actor,
        );
        return {
          success: false,
          tenantId,
          agentType,
          previousMode,
          newMode: previousMode,
          reason: `Promotion criteria not met: ${report.promotionBlockers.join('; ')}`,
          report,
        };
      }
    }

    const metadata = {
      changedAt: new Date().toISOString(),
      changedBy: actor.userId ?? 'unknown',
      reason,
      previousMode,
      force,
    };

    if (mode === 'DISABLED') {
      await this.featureFlagService.disable(tenantId, flagKey);
    } else if (mode === 'SHADOW') {
      await this.featureFlagService.enableShadow(tenantId, flagKey, metadata);
    } else {
      await this.featureFlagService.enablePrimary(tenantId, flagKey, metadata);
    }

    await this.writeAudit(
      tenantId,
      agentType,
      previousMode,
      mode,
      reason,
      actor,
    );

    this.logger.log(
      `setMode ${agentType} tenant=${tenantId.substring(0, 8)} ${previousMode} -> ${mode} by=${actor.userId ?? 'unknown'}${force ? ' (force)' : ''}`,
    );

    return {
      success: true,
      tenantId,
      agentType,
      previousMode,
      newMode: mode,
    };
  }

  /**
   * Automated SHADOW → PRIMARY promotion via RolloutPromotionService.
   * Fails when go/no-go criteria are not met — the service returns the report
   * so the caller can display blockers to the operator.
   */
  async promote(
    tenantId: string,
    agentType: PromotableAgentType,
    reason: string,
    actor: ActorContext,
  ): Promise<RolloutMutationResponseDto> {
    await this.assertTenantExists(tenantId);
    if (!AGENT_FLAG_MAP[agentType]) {
      throw new NotFoundException(`Unknown agent type: ${agentType}`);
    }

    const result = await this.promotionService.promote(agentType, tenantId);
    const changeSummary = result.success
      ? `AUTO-PROMOTE: ${reason}`
      : `AUTO-PROMOTE FAILED: ${reason} — ${result.reason ?? 'unknown'}`;

    await this.writeAudit(
      tenantId,
      agentType,
      result.previousMode,
      result.newMode,
      changeSummary,
      actor,
    );

    return {
      success: result.success,
      tenantId,
      agentType,
      previousMode: result.previousMode,
      newMode: result.newMode,
      reason: result.reason,
      report: result.report,
    };
  }

  /**
   * Emergency rollback: set ALL five agents to DISABLED for a tenant.
   * Unconditional — this is the safety brake.
   */
  async rollbackAll(
    tenantId: string,
    reason: string,
    actor: ActorContext,
  ): Promise<RolloutRollbackAllResponseDto> {
    await this.assertTenantExists(tenantId);

    const results: RolloutMutationResponseDto[] = [];
    for (const agentType of PROMOTABLE_AGENT_TYPES) {
      const flagKey = AGENT_FLAG_MAP[agentType];
      const previousMode = (await this.featureFlagService.getMode(
        tenantId,
        flagKey,
      )) as RolloutMode;

      try {
        await this.featureFlagService.disable(tenantId, flagKey);
        await this.writeAudit(
          tenantId,
          agentType,
          previousMode,
          'DISABLED',
          `ROLLBACK-ALL: ${reason}`,
          actor,
        );
        results.push({
          success: true,
          tenantId,
          agentType,
          previousMode,
          newMode: 'DISABLED',
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `rollbackAll: failed to disable ${agentType} for tenant ${tenantId}: ${msg}`,
        );
        results.push({
          success: false,
          tenantId,
          agentType,
          previousMode,
          newMode: previousMode,
          reason: `Database error: ${msg}`,
        });
      }
    }

    const success = results.every((r) => r.success);

    this.logger.warn(
      `rollbackAll tenant=${tenantId.substring(0, 8)} by=${actor.userId ?? 'unknown'} success=${success}`,
    );

    return {
      success,
      tenantId,
      results,
    };
  }

  // ============================================
  // Helpers
  // ============================================

  private async assertTenantExists(tenantId: string): Promise<void> {
    const found = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
  }

  private async writeAudit(
    tenantId: string,
    agentType: PromotableAgentType,
    previousMode: RolloutMode,
    newMode: RolloutMode,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    try {
      const before = { mode: previousMode } as Prisma.InputJsonValue;
      const after = { mode: newMode } as Prisma.InputJsonValue;
      await this.auditLogService.logAction({
        tenantId,
        userId: actor.userId,
        entityType: AUDIT_ENTITY_TYPE,
        entityId: `${tenantId}:${AGENT_FLAG_MAP[agentType]}`,
        action: AuditAction.UPDATE,
        beforeValue: before,
        afterValue: after,
        changeSummary: `[agent-rollout] ${agentType}: ${previousMode} -> ${newMode} — ${reason}`,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    } catch (error: unknown) {
      // Never fail the mutation because audit failed — but do surface the error
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to write audit log for agent-rollout mutation: ${msg}`,
      );
    }
  }
}
