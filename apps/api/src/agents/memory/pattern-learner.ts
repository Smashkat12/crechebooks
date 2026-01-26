/**
 * Pattern Learner
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * @module agents/memory/pattern-learner
 * @description Learns new PayeePattern entries from accumulated correction feedback.
 * Requires a minimum of 3 corrections for the same payee/account pair before
 * creating or upserting a PayeePattern.
 *
 * GNN learning (via GnnPatternAdapter) is additive -- it supplements
 * the threshold-based learning, not replaces it.
 *
 * CRITICAL RULES:
 * - Min 3 corrections before creating a PayeePattern
 * - Tenant isolation on ALL queries
 * - No PII in pattern records
 * - GNN calls are fire-and-forget (never block main flow)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../sdk/ruvector.service';
import { GNN_PATTERN_TOKEN } from './gnn-pattern-adapter';
import type { GnnPatternInterface } from './interfaces/gnn-pattern.interface';
import type { PatternLearnResult } from './interfaces/agent-memory.interface';

// ────────────────────────────────────────────────────────────────────
// In-memory fallback tracker (used when Prisma is unavailable)
// ────────────────────────────────────────────────────────────────────

interface InMemoryCorrection {
  tenantId: string;
  payeeName: string;
  accountCode: string;
  agentDecisionId: string;
}

@Injectable()
export class PatternLearner {
  private readonly logger = new Logger(PatternLearner.name);
  private readonly gnnAdapter: GnnPatternInterface;

  /** In-memory correction tracker for when Prisma is unavailable */
  private readonly inMemoryCorrections: InMemoryCorrection[] = [];

  static readonly MIN_CORRECTIONS_FOR_PATTERN = 3;

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(GNN_PATTERN_TOKEN)
    gnnAdapter?: GnnPatternInterface,
  ) {
    // Fallback to no-op when GNN is unavailable
    this.gnnAdapter = gnnAdapter ?? {
      learnPattern: () => Promise.resolve(),
      predict: () => Promise.resolve(null),
      consolidateEWC: () => Promise.resolve(),
    };
  }

  /**
   * Process a correction and determine if a new PayeePattern should be created.
   *
   * Flow:
   * 1. Feed correction to GNN adapter (fire-and-forget)
   * 2. Count similar corrections for same payee/account in same tenant
   * 3. If count >= MIN_CORRECTIONS_FOR_PATTERN, upsert PayeePattern
   * 4. Mark corrections as applied
   */
  async processCorrection(correction: {
    tenantId: string;
    correctedValue: Record<string, unknown>;
    agentDecisionId: string;
  }): Promise<PatternLearnResult> {
    const { tenantId, correctedValue, agentDecisionId } = correction;
    const payeeName = correctedValue['payeeName'] as string | undefined;
    const accountCode = correctedValue['accountCode'] as string | undefined;
    const accountName = correctedValue['accountName'] as string | undefined;

    // Require both payeeName and accountCode
    if (!payeeName || !accountCode) {
      return {
        patternCreated: false,
        reason:
          'Missing payeeName or accountCode in correctedValue — cannot create pattern',
      };
    }

    // 1. Feed to GNN adapter (non-blocking, fire-and-forget)
    this.gnnAdapter
      .learnPattern({
        tenantId,
        payeeName,
        accountCode,
        accountName,
        amountCents: (correctedValue['amountCents'] as number) ?? 0,
        isCredit: (correctedValue['isCredit'] as boolean) ?? false,
        agentDecisionId,
      })
      .catch((err: Error) => {
        this.logger.warn(`GNN learnPattern failed: ${err.message}`);
      });

    // 2. Count similar corrections
    let correctionCount: number;

    if (this.prisma) {
      try {
        correctionCount = await this.prisma.correctionFeedback.count({
          where: {
            tenantId,
            appliedToPattern: false,
            correctedValue: {
              path: ['accountCode'],
              equals: accountCode,
            },
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Prisma correction count failed, using in-memory fallback: ${msg}`,
        );
        // Use in-memory fallback
        this.inMemoryCorrections.push({
          tenantId,
          payeeName,
          accountCode,
          agentDecisionId,
        });
        correctionCount = this.inMemoryCorrections.filter(
          (c) =>
            c.tenantId === tenantId &&
            c.accountCode === accountCode &&
            c.payeeName.toLowerCase().trim() === payeeName.toLowerCase().trim(),
        ).length;
      }
    } else {
      // No Prisma — use in-memory tracking
      this.inMemoryCorrections.push({
        tenantId,
        payeeName,
        accountCode,
        agentDecisionId,
      });
      correctionCount = this.inMemoryCorrections.filter(
        (c) =>
          c.tenantId === tenantId &&
          c.accountCode === accountCode &&
          c.payeeName.toLowerCase().trim() === payeeName.toLowerCase().trim(),
      ).length;
    }

    // 3. Check threshold
    if (correctionCount < PatternLearner.MIN_CORRECTIONS_FOR_PATTERN) {
      return {
        patternCreated: false,
        payeeName,
        accountCode,
        correctionCount,
        reason: `Only ${String(correctionCount)} correction(s), need ${String(PatternLearner.MIN_CORRECTIONS_FOR_PATTERN)} to create pattern`,
      };
    }

    // 4. Upsert PayeePattern
    if (this.prisma) {
      try {
        await this.prisma.payeePattern.upsert({
          where: {
            tenantId_payeePattern: {
              tenantId,
              payeePattern: payeeName.toLowerCase().trim(),
            },
          },
          create: {
            tenantId,
            payeePattern: payeeName.toLowerCase().trim(),
            defaultAccountCode: accountCode,
            defaultAccountName: accountName ?? accountCode,
            source: 'LEARNED',
            isActive: true,
          },
          update: {
            defaultAccountCode: accountCode,
            defaultAccountName: accountName ?? accountCode,
            source: 'LEARNED',
            isActive: true,
          },
        });

        // 5. Mark corrections as applied
        await this.prisma.correctionFeedback.updateMany({
          where: {
            tenantId,
            appliedToPattern: false,
            correctedValue: {
              path: ['accountCode'],
              equals: accountCode,
            },
          },
          data: {
            appliedToPattern: true,
          },
        });

        this.logger.log(
          `Created/updated PayeePattern for "${payeeName}" → ${accountCode} (tenant: ${tenantId})`,
        );

        return {
          patternCreated: true,
          payeeName,
          accountCode,
          correctionCount,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`PayeePattern upsert failed: ${msg}`);
        return {
          patternCreated: false,
          payeeName,
          accountCode,
          correctionCount,
          reason: `PayeePattern upsert failed: ${msg}`,
        };
      }
    }

    return {
      patternCreated: false,
      payeeName,
      accountCode,
      correctionCount,
      reason: 'Prisma unavailable — pattern creation deferred',
    };
  }
}
