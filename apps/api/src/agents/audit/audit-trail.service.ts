/**
 * Audit Trail Service
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * @module agents/audit/audit-trail.service
 * @description Unified database-backed audit trail for all agent decisions.
 * All operations are non-blocking — errors are logged but never thrown.
 * When Prisma is unavailable, methods degrade gracefully (no-op).
 *
 * CRITICAL RULES:
 * - NEVER blocks the main agent flow
 * - ALL queries include tenantId for tenant isolation
 * - NO PII in audit records — only IDs, codes, confidence, decision metadata
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  LogDecisionParams,
  LogEscalationParams,
  LogWorkflowParams,
  AuditFilters,
  EscalationStats,
  AgentPerformanceStats,
  EventType,
} from './interfaces/audit.interface';

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
  ) {}

  /**
   * Log a decision to the audit trail.
   * Creates an AgentAuditLog record with eventType='DECISION'.
   * Non-blocking: errors are caught and logged.
   */
  async logDecision(params: LogDecisionParams): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — skipping audit decision log');
      return;
    }

    try {
      await this.prisma.agentAuditLog.create({
        data: {
          tenantId: params.tenantId,
          agentType: params.agentType,
          eventType: EventType.DECISION,
          workflowId: params.workflowId ?? null,
          transactionId: params.transactionId ?? null,
          decision: params.decision,
          confidence: params.confidence ?? null,
          source: params.source ?? null,
          autoApplied: params.autoApplied,
          details: params.details as unknown as Prisma.InputJsonValue,
          reasoning: params.reasoning ?? null,
          durationMs: params.durationMs ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log decision: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log an escalation to the audit trail.
   * Creates an AgentAuditLog record with eventType='ESCALATION', decision='escalate'.
   * Non-blocking: errors are caught and logged.
   */
  async logEscalation(params: LogEscalationParams): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — skipping audit escalation log');
      return;
    }

    try {
      await this.prisma.agentAuditLog.create({
        data: {
          tenantId: params.tenantId,
          agentType: params.agentType,
          eventType: EventType.ESCALATION,
          workflowId: params.workflowId ?? null,
          transactionId: params.transactionId ?? null,
          decision: 'escalate',
          autoApplied: false,
          details: params.details as unknown as Prisma.InputJsonValue,
          reasoning: params.reason,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log escalation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log a workflow event (start or end) to the audit trail.
   * Creates an AgentAuditLog record with agentType='orchestrator'.
   * Non-blocking: errors are caught and logged.
   */
  async logWorkflow(params: LogWorkflowParams): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — skipping audit workflow log');
      return;
    }

    try {
      await this.prisma.agentAuditLog.create({
        data: {
          tenantId: params.tenantId,
          agentType: 'orchestrator',
          eventType: params.eventType,
          workflowId: params.workflowId,
          decision: params.eventType === 'WORKFLOW_START' ? 'start' : 'complete',
          autoApplied: false,
          details: params.details as unknown as Prisma.InputJsonValue,
          durationMs: params.durationMs ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to log workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get decision history for a tenant with optional filters.
   * Always includes tenantId for tenant isolation.
   */
  async getDecisionHistory(
    tenantId: string,
    filters: AuditFilters,
  ): Promise<unknown[]> {
    if (!this.prisma) {
      this.logger.debug('Prisma unavailable — returning empty decision history');
      return [];
    }

    try {
      const where: Record<string, unknown> = { tenantId };

      if (filters.agentType) {
        where.agentType = filters.agentType;
      }
      if (filters.eventType) {
        where.eventType = filters.eventType;
      }
      if (filters.transactionId) {
        where.transactionId = filters.transactionId;
      }
      if (filters.workflowId) {
        where.workflowId = filters.workflowId;
      }
      if (filters.dateFrom || filters.dateTo) {
        const createdAt: Record<string, Date> = {};
        if (filters.dateFrom) createdAt.gte = filters.dateFrom;
        if (filters.dateTo) createdAt.lte = filters.dateTo;
        where.createdAt = createdAt;
      }

      return await this.prisma.agentAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 100,
        skip: filters.offset ?? 0,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to get decision history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get escalation statistics for a tenant within a date range.
   * Always includes tenantId for tenant isolation.
   */
  async getEscalationStats(
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<EscalationStats> {
    if (!this.prisma) {
      return { total: 0, byAgent: {}, byReason: {} };
    }

    try {
      const escalations = await this.prisma.agentAuditLog.findMany({
        where: {
          tenantId,
          eventType: EventType.ESCALATION,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
          agentType: true,
          reasoning: true,
        },
      });

      const byAgent: Record<string, number> = {};
      const byReason: Record<string, number> = {};

      for (const esc of escalations) {
        byAgent[esc.agentType] = (byAgent[esc.agentType] ?? 0) + 1;
        const reason = esc.reasoning ?? 'unknown';
        byReason[reason] = (byReason[reason] ?? 0) + 1;
      }

      return {
        total: escalations.length,
        byAgent,
        byReason,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get escalation stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { total: 0, byAgent: {}, byReason: {} };
    }
  }

  /**
   * Get performance statistics for a specific agent type within a tenant.
   * Always includes tenantId for tenant isolation.
   */
  async getAgentPerformance(
    tenantId: string,
    agentType: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<AgentPerformanceStats> {
    if (!this.prisma) {
      return {
        totalDecisions: 0,
        avgConfidence: 0,
        autoApplyRate: 0,
        avgDurationMs: 0,
        escalationRate: 0,
      };
    }

    try {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom) dateFilter.gte = dateFrom;
      if (dateTo) dateFilter.lte = dateTo;

      const whereBase: Record<string, unknown> = {
        tenantId,
        agentType,
        ...(dateFrom || dateTo ? { createdAt: dateFilter } : {}),
      };

      const decisions = await this.prisma.agentAuditLog.findMany({
        where: { ...whereBase, eventType: EventType.DECISION },
        select: {
          confidence: true,
          autoApplied: true,
          durationMs: true,
        },
      });

      const escalationCount = await this.prisma.agentAuditLog.count({
        where: { ...whereBase, eventType: EventType.ESCALATION },
      });

      const totalDecisions = decisions.length;
      if (totalDecisions === 0) {
        return {
          totalDecisions: 0,
          avgConfidence: 0,
          autoApplyRate: 0,
          avgDurationMs: 0,
          escalationRate: 0,
        };
      }

      const confidenceValues = decisions
        .map((d) => d.confidence)
        .filter((c): c is number => c !== null);
      const avgConfidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((sum, c) => sum + c, 0) /
            confidenceValues.length
          : 0;

      const autoAppliedCount = decisions.filter((d) => d.autoApplied).length;
      const autoApplyRate = autoAppliedCount / totalDecisions;

      const durationValues = decisions
        .map((d) => d.durationMs)
        .filter((d): d is number => d !== null);
      const avgDurationMs =
        durationValues.length > 0
          ? durationValues.reduce((sum, d) => sum + d, 0) /
            durationValues.length
          : 0;

      const totalEvents = totalDecisions + escalationCount;
      const escalationRate =
        totalEvents > 0 ? escalationCount / totalEvents : 0;

      return {
        totalDecisions,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        autoApplyRate: Math.round(autoApplyRate * 10000) / 10000,
        avgDurationMs: Math.round(avgDurationMs * 100) / 100,
        escalationRate: Math.round(escalationRate * 10000) / 10000,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get agent performance: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        totalDecisions: 0,
        avgConfidence: 0,
        autoApplyRate: 0,
        avgDurationMs: 0,
        escalationRate: 0,
      };
    }
  }
}
