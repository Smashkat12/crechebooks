/**
 * Decision Hooks
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 * TASK-STUB-008: Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)
 *
 * @module agents/audit/decision-hooks
 * @description Pre- and post-decision hooks for agent audit coordination.
 * Integrates with AuditTrailService, RuvectorService, and RealDecisionHooks
 * for correction history checking and SONA trajectory recording.
 *
 * CRITICAL RULES:
 * - ALL hooks are non-blocking — errors are caught, never thrown
 * - preDecision is fail-open when Prisma is unavailable
 * - ruvector embedding is optional and non-blocking
 * - RealDecisionHooks integration is advisory only (never blocks)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../sdk/ruvector.service';
import { AuditTrailService } from './audit-trail.service';
import {
  LogDecisionParams,
  LogEscalationParams,
} from './interfaces/audit.interface';
import { DECISION_HOOKS_TOKEN } from './real-decision-hooks';
import type {
  DecisionHooksInterface,
  PreDecisionWarning,
} from './interfaces/decision-hooks.interface';

@Injectable()
export class DecisionHooks {
  private readonly logger = new Logger(DecisionHooks.name);
  private readonly realHooks: DecisionHooksInterface;

  constructor(
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrail?: AuditTrailService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(DECISION_HOOKS_TOKEN)
    realHooks?: DecisionHooksInterface,
  ) {
    // Fallback to no-op when real hooks are unavailable
    this.realHooks = realHooks ?? {
      preDecision: () =>
        Promise.resolve({
          allowed: true,
          warnings: [],
          confidenceAdjustment: 0,
        }),
      postDecision: () => Promise.resolve(),
    };
  }

  /**
   * Pre-decision validation hook.
   * 1. Validates that the tenant exists and subscription is not CANCELLED.
   * 2. Calls RealDecisionHooks.preDecision() for correction history check.
   * Fail-open: returns allowed=true when Prisma is unavailable or hooks fail.
   */
  async preDecision(context: {
    tenantId: string;
    agentType: string;
    inputText?: string;
    payeeName?: string;
    amountCents?: number;
    isCredit?: boolean;
  }): Promise<{
    allowed: boolean;
    reason?: string;
    warnings?: PreDecisionWarning[];
    confidenceAdjustment?: number;
  }> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — fail-open, allowing decision');
      return { allowed: true };
    }

    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: context.tenantId },
        select: { id: true, subscriptionStatus: true },
      });

      if (!tenant) {
        return { allowed: false, reason: 'Tenant not found' };
      }

      if (tenant.subscriptionStatus === 'CANCELLED') {
        return {
          allowed: false,
          reason: 'Tenant subscription is cancelled',
        };
      }

      // Call real hooks for correction history check
      const hookResult = await this.realHooks.preDecision({
        tenantId: context.tenantId,
        agentType: context.agentType,
        inputText: context.inputText,
        payeeName: context.payeeName,
        amountCents: context.amountCents,
        isCredit: context.isCredit,
      });

      return {
        allowed: true,
        warnings: hookResult.warnings,
        confidenceAdjustment: hookResult.confidenceAdjustment,
      };
    } catch (error) {
      this.logger.warn(
        `preDecision check failed (fail-open): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { allowed: true };
    }
  }

  /**
   * Post-decision hook — triple-write pattern.
   * 1. RealDecisionHooks (SONA trajectory + audit) — non-blocking
   * 2. Ruvector embedding (non-blocking, catch errors)
   * 3. AuditTrailService (non-blocking, catch errors)
   *
   * ALL writes are non-blocking.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- intentionally fire-and-forget
  async postDecision(context: LogDecisionParams): Promise<void> {
    // 1. RealDecisionHooks (SONA trajectory + audit) — non-blocking
    this.realHooks
      .postDecision({
        tenantId: context.tenantId,
        agentType: context.agentType,
        decision: context.decision,
        confidence: context.confidence ?? 0,
        source: context.source ?? 'RULE_BASED',
        autoApplied: context.autoApplied,
        transactionId: context.transactionId,
        reasoning: context.reasoning,
        durationMs: context.durationMs,
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.debug(`RealDecisionHooks postDecision failed: ${msg}`);
      });

    // 2. Ruvector embedding (non-blocking)
    if (this.ruvector?.isAvailable() && context.reasoning) {
      this.ruvector
        .generateEmbedding(context.reasoning)
        .catch((err: Error) =>
          this.logger.debug(
            `Ruvector embedding failed (non-blocking): ${err.message}`,
          ),
        );
    }

    // 3. Audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail
        .logDecision(context)
        .catch((err: Error) =>
          this.logger.warn(`Audit trail postDecision failed: ${err.message}`),
        );
    }
  }

  /**
   * Post-escalation hook — delegates to audit trail.
   * Non-blocking: errors are caught and logged.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- intentionally fire-and-forget
  async postEscalation(params: LogEscalationParams): Promise<void> {
    if (this.auditTrail) {
      this.auditTrail
        .logEscalation(params)
        .catch((err: Error) =>
          this.logger.warn(`Audit trail postEscalation failed: ${err.message}`),
        );
    }
  }

  /**
   * Find similar decisions using ruvector embeddings.
   * Returns empty array when ruvector is unavailable.
   */
  async findSimilarDecisions(
    query: string,
    _tenantId: string,
  ): Promise<unknown[]> {
    if (!this.ruvector?.isAvailable()) {
      return [];
    }

    try {
      const embeddingResult = await this.ruvector.generateEmbedding(query);
      const results = await this.ruvector.searchSimilar(
        embeddingResult.vector,
        'audit-decisions',
        10,
      );
      return results;
    } catch (error) {
      this.logger.debug(
        `findSimilarDecisions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
