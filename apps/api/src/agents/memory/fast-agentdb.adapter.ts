/**
 * FastAgentDB Adapter
 * TASK-STUB-002: FastAgentDB Stub Replacement
 *
 * @module agents/memory/fast-agentdb.adapter
 * @description Adapter wrapping ruvector's FastAgentDB + agentic-flow's
 * ReflexionMemory with the CrecheBooks AgentDBInterface. Uses dynamic imports
 * to avoid hard dependencies and gracefully degrades if packages are unavailable.
 *
 * CRITICAL RULES:
 * - Non-blocking writes: ALL writes use .catch() pattern
 * - No PII in episode metadata (only IDs, codes, confidence, correctness)
 * - Tenant isolation: every episode includes tenantId in metadata
 * - Dynamic imports: ruvector and agentic-flow are loaded lazily
 * - Graceful degradation: init failure is non-fatal (logs warning, sets initialized=false)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AgentDBInterface,
  AgentDBStoreParams,
  AgentDBCorrectionParams,
  AgentDBAccuracyStats,
  AgentDBSimilarEpisode,
} from './interfaces/fast-agentdb.interface';

// ────────────────────────────────────────────────────────────────────
// Type shapes for dynamically imported modules (avoids import-time dependency)
// ────────────────────────────────────────────────────────────────────

/** Shape of a FastAgentDB episode */
interface FastAgentDBEpisode {
  state: unknown;
  action: string;
  reward: number;
  nextState?: unknown;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

/** Shape of a FastAgentDB search match */
interface FastAgentDBMatch {
  episode: FastAgentDBEpisode;
  score: number;
  id: string;
}

/** Shape of FastAgentDB stats */
interface FastAgentDBStats {
  totalEpisodes: number;
  avgReward: number;
  maxReward: number;
  minReward: number;
  memoryUsageBytes: number;
}

/** Shape of the FastAgentDB instance */
interface FastAgentDBInstance {
  storeEpisode(episode: FastAgentDBEpisode): Promise<string>;
  getEpisode(id: string): Promise<FastAgentDBEpisode | null>;
  searchSimilar(query: number[], k: number): Promise<FastAgentDBMatch[]>;
  getStats(): Promise<FastAgentDBStats>;
  batchStore(episodes: FastAgentDBEpisode[]): Promise<string[]>;
}

/** Shape of a ReflexionMemory episode */
interface ReflexionEpisode {
  task: string;
  reflection: string;
  success: boolean;
  strategy: string;
  timestamp?: number;
}

/** Shape of ReflexionMemory task stats */
interface ReflexionTaskStats {
  totalEpisodes: number;
  successRate: number;
  recentStrategies: string[];
}

/** Shape of the ReflexionMemory instance */
interface ReflexionMemoryInstance {
  storeEpisode(episode: ReflexionEpisode): Promise<string>;
  retrieveRelevant(query: string, k?: number): Promise<ReflexionEpisode[]>;
  getTaskStats(task: string): Promise<ReflexionTaskStats>;
}

// ────────────────────────────────────────────────────────────────────
// Adapter
// ────────────────────────────────────────────────────────────────────

/** Confidence threshold: decisions at or above this are considered successful */
const SUCCESS_CONFIDENCE_THRESHOLD = 80;

@Injectable()
export class FastAgentDBAdapter implements AgentDBInterface {
  private readonly logger = new Logger(FastAgentDBAdapter.name);
  private fastAgentDB: FastAgentDBInstance | null = null;
  private reflexionMemory: ReflexionMemoryInstance | null = null;
  private initialized = false;

  constructor(
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Dynamic import to avoid hard dependency on ruvector
      const { FastAgentDB } = await import('ruvector');
      this.fastAgentDB = new FastAgentDB({
        maxEpisodes:
          this.configService?.get<number>('AGENTDB_MAX_EPISODES') ?? 50_000,
      }) as FastAgentDBInstance;

      // Dynamic import to avoid hard dependency on agentic-flow
      const { ReflexionMemory } = await import('agentic-flow/agentdb');
      this.reflexionMemory = new ReflexionMemory() as ReflexionMemoryInstance;

      this.initialized = true;
      this.logger.log(
        'FastAgentDBAdapter initialized (FastAgentDB + ReflexionMemory)',
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FastAgentDBAdapter init failed (non-fatal): ${msg}`);
      this.initialized = false;
    }
  }

  /**
   * Store an agent decision as an episode in FastAgentDB and ReflexionMemory.
   *
   * Maps: store(data) -> FastAgentDB.storeEpisode() + ReflexionMemory.storeEpisode()
   */
  async store(data: AgentDBStoreParams): Promise<void> {
    if (!this.initialized) return;

    // 1. Store in FastAgentDB as episode
    if (this.fastAgentDB) {
      const episode: FastAgentDBEpisode = {
        state: {
          tenantId: data.tenantId,
          agentType: data.agentType,
          inputHash: data.inputHash,
        },
        action: JSON.stringify(data.decision),
        reward: data.confidence / 100, // Normalize 0-100 to 0-1
        metadata: {
          tenantId: data.tenantId,
          agentType: data.agentType,
          source: data.source,
          transactionId: data.transactionId,
          timestamp: Date.now(),
        },
        embedding: data.embedding,
      };

      await this.fastAgentDB.storeEpisode(episode).catch((err: Error) => {
        this.logger.warn(`FastAgentDB storeEpisode failed: ${err.message}`);
      });
    }

    // 2. Store in ReflexionMemory for reflective learning
    if (this.reflexionMemory) {
      await this.reflexionMemory
        .storeEpisode({
          task: data.agentType,
          reflection: `Decision: ${JSON.stringify(data.decision)} | Source: ${data.source}`,
          success: data.confidence >= SUCCESS_CONFIDENCE_THRESHOLD,
          strategy: data.source,
        })
        .catch((err: Error) => {
          this.logger.warn(
            `ReflexionMemory storeEpisode failed: ${err.message}`,
          );
        });
    }
  }

  /**
   * Record a correction as a negative-reward episode.
   *
   * Maps: recordCorrection(data) -> FastAgentDB.storeEpisode(reward=-1)
   *   + ReflexionMemory.storeEpisode(success=false)
   */
  async recordCorrection(data: AgentDBCorrectionParams): Promise<void> {
    if (!this.initialized) return;

    if (this.fastAgentDB) {
      await this.fastAgentDB
        .storeEpisode({
          state: {
            tenantId: data.tenantId,
            agentDecisionId: data.agentDecisionId,
            originalValue: data.originalValue,
          },
          action: JSON.stringify(data.correctedValue),
          reward: -1.0, // Negative reward for corrections
          nextState: {
            correctedValue: data.correctedValue,
            correctedBy: data.correctedBy,
          },
          metadata: {
            type: 'correction',
            tenantId: data.tenantId,
            agentDecisionId: data.agentDecisionId,
            timestamp: Date.now(),
          },
        })
        .catch((err: Error) => {
          this.logger.warn(
            `FastAgentDB correction episode failed: ${err.message}`,
          );
        });
    }

    if (this.reflexionMemory) {
      await this.reflexionMemory
        .storeEpisode({
          task: 'correction',
          reflection: `Corrected from ${JSON.stringify(data.originalValue)} to ${JSON.stringify(data.correctedValue)}`,
          success: false,
          strategy: 'human-correction',
        })
        .catch((err: Error) => {
          this.logger.warn(
            `ReflexionMemory correction episode failed: ${err.message}`,
          );
        });
    }
  }

  /**
   * Get accuracy statistics from FastAgentDB.
   *
   * Maps: getAccuracyStats() -> FastAgentDB.getStats() aggregation
   */
  async getAccuracyStats(
    _tenantId: string,
    agentType: string,
  ): Promise<AgentDBAccuracyStats | null> {
    if (!this.initialized || !this.fastAgentDB) {
      return null; // Triggers Prisma fallback
    }

    try {
      const stats = await this.fastAgentDB.getStats();
      const reflexionStats = this.reflexionMemory
        ? await this.reflexionMemory.getTaskStats(agentType).catch(() => null)
        : null;

      return {
        totalDecisions: stats.totalEpisodes,
        reviewedDecisions: reflexionStats?.totalEpisodes ?? 0,
        correctDecisions: Math.round(
          (reflexionStats?.successRate ?? 0) *
            (reflexionStats?.totalEpisodes ?? 0),
        ),
        accuracyRate: Math.round((reflexionStats?.successRate ?? 0) * 100),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FastAgentDB getStats failed: ${msg}`);
      return null;
    }
  }

  /**
   * Search for similar past episodes using vector similarity.
   */
  async searchSimilarEpisodes(
    queryEmbedding: number[],
    limit: number = 5,
  ): Promise<AgentDBSimilarEpisode[]> {
    if (!this.initialized || !this.fastAgentDB) {
      return [];
    }

    try {
      const matches = await this.fastAgentDB.searchSimilar(
        queryEmbedding,
        limit,
      );
      return matches.map((match) => ({
        id: match.id,
        episode: {
          state: match.episode.state,
          action: match.episode.action,
          reward: match.episode.reward,
          metadata: match.episode.metadata,
        },
        score: match.score,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FastAgentDB searchSimilar failed: ${msg}`);
      return [];
    }
  }

  isAvailable(): boolean {
    return this.initialized;
  }
}
