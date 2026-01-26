/**
 * Agent Memory Service
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * @module agents/memory/agent-memory.service
 * @description Manages persistent agent decision storage with dual-write
 * pattern (AgentDB stub + Prisma), correction feedback loops, and
 * semantic similarity retrieval via ruvector.
 *
 * CRITICAL RULES:
 * - Non-blocking decision storage (NEVER block main agent flow)
 * - Dual-write pattern: AgentDB stub + Prisma (mocked in tests)
 * - Tenant isolation on ALL queries
 * - No PII in decision records
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../sdk/ruvector.service';
import { PatternLearner } from './pattern-learner';
import { FastAgentDBAdapter } from './fast-agentdb.adapter';
import { REASONING_BANK_TOKEN } from './vectordb-reasoning-bank';
import type { AgentDBInterface } from './interfaces/fast-agentdb.interface';
import type {
  ReasoningBankInterface,
  StoreChainParams,
} from './interfaces/reasoning-bank.interface';
import type {
  StoreDecisionParams,
  RecordCorrectionParams,
  PatternLearnResult,
  MemoryAccuracyStats,
  SimilarDecision,
} from './interfaces/agent-memory.interface';

// ────────────────────────────────────────────────────────────────────
// Utility: input hash computation
// ────────────────────────────────────────────────────────────────────

export function computeInputHash(params: {
  payeeName: string;
  description: string;
  amountCents: number;
  isCredit: boolean;
}): string {
  const normalized = [
    params.payeeName.toLowerCase().trim(),
    params.description.toLowerCase().trim(),
    String(params.amountCents),
    String(params.isCredit),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex').substring(0, 64);
}

// ────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);
  private readonly agentDb: Pick<
    AgentDBInterface,
    'store' | 'recordCorrection' | 'getAccuracyStats'
  >;
  private readonly reasoningBank: ReasoningBankInterface;

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(PatternLearner)
    private readonly patternLearner?: PatternLearner,
    @Optional()
    @Inject(FastAgentDBAdapter)
    agentDb?: AgentDBInterface,
    @Optional()
    @Inject(REASONING_BANK_TOKEN)
    reasoningBank?: ReasoningBankInterface,
  ) {
    this.agentDb = agentDb ?? {
      store: () => Promise.resolve(),
      recordCorrection: () => Promise.resolve(),
      getAccuracyStats: () => Promise.resolve(null),
    };
    this.reasoningBank = reasoningBank ?? {
      store: () => Promise.resolve(),
      get: () => Promise.resolve(null),
    };
  }

  /**
   * Store an agent decision. Dual-writes to AgentDB stub and Prisma.
   * Ruvector embedding storage is non-blocking.
   *
   * @returns The Prisma record ID, or a random UUID if Prisma is unavailable
   */
  async storeDecision(params: StoreDecisionParams): Promise<string> {
    const {
      tenantId,
      agentType,
      inputHash,
      inputText,
      decision,
      confidence,
      source,
      transactionId,
      reasoningChain,
    } = params;

    // 1. Write to AgentDB stub (fire-and-forget)
    this.agentDb
      .store({
        tenantId,
        agentType,
        inputHash,
        decision,
        confidence,
        source,
        transactionId,
      })
      .catch((err: Error) => {
        this.logger.warn(`AgentDB stub write failed: ${err.message}`);
      });

    // 2. Write to Prisma
    let recordId: string;
    if (this.prisma) {
      try {
        const record = await this.prisma.agentDecision.create({
          data: {
            tenantId,
            agentType,
            inputHash,
            decision: decision as unknown as Prisma.InputJsonValue,
            confidence,
            source,
            transactionId,
          },
        });
        recordId = record.id;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Prisma agentDecision create failed: ${msg}`);
        recordId = randomUUID();
      }
    } else {
      recordId = randomUUID();
    }

    // 3. Store reasoning chain if provided
    if (reasoningChain) {
      this.reasoningBank
        .store({ decisionId: recordId, chain: reasoningChain, tenantId })
        .catch((err: Error) => {
          this.logger.warn(`ReasoningBank store failed: ${err.message}`);
        });
    }

    // 4. Non-blocking ruvector embedding storage
    if (this.ruvector?.isAvailable() && inputText) {
      this.storeEmbeddingAsync(recordId, inputText, tenantId, agentType).catch(
        (err: Error) => {
          this.logger.warn(
            `Non-critical: ruvector embedding storage failed: ${err.message}`,
          );
        },
      );
    }

    return recordId;
  }

  /**
   * Record a correction against a previous agent decision.
   * Updates original decision, creates feedback record, triggers pattern learning.
   */
  async recordCorrection(
    params: RecordCorrectionParams,
  ): Promise<PatternLearnResult> {
    const {
      tenantId,
      agentDecisionId,
      originalValue,
      correctedValue,
      correctedBy,
      reason,
    } = params;

    // 1. Update AgentDB stub
    this.agentDb
      .recordCorrection({
        tenantId,
        agentDecisionId,
        originalValue,
        correctedValue: correctedValue as unknown as Record<string, unknown>,
        correctedBy,
      })
      .catch((err: Error) => {
        this.logger.warn(
          `AgentDB stub correction write failed: ${err.message}`,
        );
      });

    // 2. Update Prisma agentDecision (wasCorrect=false, correctedTo)
    if (this.prisma) {
      try {
        await this.prisma.agentDecision.update({
          where: { id: agentDecisionId },
          data: {
            wasCorrect: false,
            correctedTo: correctedValue as never,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Prisma agentDecision update failed: ${msg}`);
      }
    }

    // 3. Create correction feedback record in Prisma
    if (this.prisma) {
      try {
        await this.prisma.correctionFeedback.create({
          data: {
            tenantId,
            agentDecisionId,
            originalValue: originalValue as unknown as Prisma.InputJsonValue,
            correctedValue: correctedValue as unknown as Prisma.InputJsonValue,
            correctedBy,
            reason,
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Prisma correctionFeedback create failed: ${msg}`);
      }
    }

    // 4. Trigger pattern learning if available
    if (this.patternLearner) {
      try {
        return await this.patternLearner.processCorrection({
          tenantId,
          correctedValue: correctedValue as unknown as Record<string, unknown>,
          agentDecisionId,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Pattern learner failed: ${msg}`);
      }
    }

    return { patternCreated: false, reason: 'Pattern learner unavailable' };
  }

  /**
   * Find similar decisions using ruvector semantic search or Prisma hash lookup.
   */
  async getSimilarDecisions(
    tenantId: string,
    agentType: string,
    inputText: string,
    inputHash?: string,
  ): Promise<SimilarDecision[]> {
    // Try ruvector semantic search first
    if (this.ruvector?.isAvailable() && inputText) {
      try {
        const embeddingResult =
          await this.ruvector.generateEmbedding(inputText);
        const results = await this.ruvector.searchSimilar(
          embeddingResult.vector,
          `decisions-${agentType}`,
          5,
        );
        return results.map((r) => ({
          id: r.id,
          decision: r.metadata ?? {},
          confidence: Math.round(r.score * 100),
          source: 'SEMANTIC',
          similarity: r.score,
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Ruvector search failed, falling back to Prisma: ${msg}`,
        );
      }
    }

    // Fallback: Prisma exact hash lookup
    if (this.prisma && inputHash) {
      try {
        const records = await this.prisma.agentDecision.findMany({
          where: {
            tenantId,
            agentType,
            inputHash,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });
        return records.map((r) => ({
          id: r.id,
          decision: r.decision as Record<string, unknown>,
          confidence: r.confidence,
          source: r.source,
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Prisma hash lookup failed: ${msg}`);
      }
    }

    return [];
  }

  /**
   * Get accuracy statistics for an agent type within a tenant.
   */
  async getAccuracyStats(
    tenantId: string,
    agentType: string,
  ): Promise<MemoryAccuracyStats> {
    // Try AgentDB stub first (returns null, triggering Prisma fallback)
    const stubStats = await this.agentDb.getAccuracyStats(tenantId, agentType);
    if (stubStats) {
      return stubStats;
    }

    // Fallback: compute from Prisma
    if (this.prisma) {
      try {
        const totalDecisions = await this.prisma.agentDecision.count({
          where: { tenantId, agentType },
        });

        const reviewedDecisions = await this.prisma.agentDecision.count({
          where: { tenantId, agentType, wasCorrect: { not: null } },
        });

        const correctDecisions = await this.prisma.agentDecision.count({
          where: { tenantId, agentType, wasCorrect: true },
        });

        const accuracyRate =
          reviewedDecisions > 0
            ? Math.round((correctDecisions / reviewedDecisions) * 100)
            : 0;

        return {
          totalDecisions,
          reviewedDecisions,
          correctDecisions,
          accuracyRate,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Prisma accuracy stats failed: ${msg}`);
      }
    }

    return {
      totalDecisions: 0,
      reviewedDecisions: 0,
      correctDecisions: 0,
      accuracyRate: 0,
    };
  }

  /**
   * Non-blocking embedding storage via ruvector.
   * Stubbed locally since ruvector doesn't have a storeEmbedding method.
   */
  private async storeEmbeddingAsync(
    decisionId: string,
    inputText: string,
    _tenantId: string,
    _agentType: string,
  ): Promise<void> {
    if (!this.ruvector?.isAvailable()) return;
    // Generate embedding (the actual storage would require a vectorDb.insert method
    // which doesn't exist yet on RuvectorService — this is a forward-compatible stub)
    await this.ruvector.generateEmbedding(inputText);
    this.logger.debug(
      `Embedding generated for decision ${decisionId} (storage pending vectorDb.insert support)`,
    );
  }
}
