/**
 * Decision Hooks
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * @module agents/audit/decision-hooks
 * @description Pre- and post-decision hooks for agent audit coordination.
 * Integrates with AuditTrailService, RuvectorService, and a local
 * AgenticFlowHooks stub for triple-write logging.
 *
 * CRITICAL RULES:
 * - ALL hooks are non-blocking — errors are caught, never thrown
 * - preDecision is fail-open when Prisma is unavailable
 * - ruvector embedding is optional and non-blocking
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../sdk/ruvector.service';
import { AuditTrailService } from './audit-trail.service';
import { LogDecisionParams, LogEscalationParams } from './interfaces/audit.interface';

// ── AgenticFlowHooks Stub ──────────────────────────────────────────

/**
 * Local stub for AgenticFlowHooks.
 * The agentic-flow package does not export a usable AgenticFlowHooks class,
 * so we stub it locally to maintain the triple-write pattern.
 */
class AgenticFlowHooksStub {
  async preTask(_context: Record<string, unknown>): Promise<void> {
    /* stub */
  }
  async postTask(_context: Record<string, unknown>): Promise<void> {
    /* stub */
  }
}

@Injectable()
export class DecisionHooks {
  private readonly logger = new Logger(DecisionHooks.name);
  private readonly afHooks: AgenticFlowHooksStub;

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
  ) {
    this.afHooks = new AgenticFlowHooksStub();
  }

  /**
   * Pre-decision validation hook.
   * Validates that the tenant exists and subscription is not CANCELLED.
   * Fail-open: returns allowed=true when Prisma is unavailable.
   */
  async preDecision(context: {
    tenantId: string;
    agentType: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.prisma) {
      this.logger.debug(
        'Prisma unavailable — fail-open, allowing decision',
      );
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

      return { allowed: true };
    } catch (error) {
      this.logger.warn(
        `preDecision check failed (fail-open): ${error instanceof Error ? error.message : String(error)}`,
      );
      return { allowed: true };
    }
  }

  /**
   * Post-decision hook — triple-write pattern.
   * 1. AgenticFlowHooks stub (postTask)
   * 2. Ruvector embedding (non-blocking, catch errors)
   * 3. AuditTrailService (non-blocking, catch errors)
   *
   * ALL writes are non-blocking.
   */
  async postDecision(context: LogDecisionParams): Promise<void> {
    // 1. AgenticFlowHooks stub
    try {
      await this.afHooks.postTask({
        agentType: context.agentType,
        decision: context.decision,
        tenantId: context.tenantId,
      });
    } catch (error) {
      this.logger.debug(
        `AgenticFlowHooks postTask failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

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
      const embedding = await this.ruvector.generateEmbedding(query);
      const results = await this.ruvector.searchSimilar(
        embedding,
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
