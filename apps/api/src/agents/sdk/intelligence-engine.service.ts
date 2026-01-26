/**
 * IntelligenceEngine Service
 * TASK-STUB-009: IntelligenceEngine Full Stack Integration
 *
 * @module agents/sdk/intelligence-engine.service
 * @description NestJS singleton service wrapping ruvector's IntelligenceEngine.
 * Provides a unified API for routing, memory, recall, learning, and health checks.
 * Initialization is non-fatal: if IntelligenceEngine fails to init, agents
 * continue working via individual component injections or pure heuristic fallback.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PersistenceConfig } from './persistence-config';
import { IntelligenceEngine } from 'ruvector';
import type { IntelligenceConfig } from 'ruvector';
import type {
  IntelligenceRouteResult,
  IntelligenceRecallResult,
  IntelligenceStats,
  IntelligenceTrajectory,
} from './interfaces/intelligence-engine.interface';

@Injectable()
export class IntelligenceEngineService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(IntelligenceEngineService.name);
  // Engine typed as any because the ruvector IntelligenceEngine API is extended
  // beyond the current type definitions (TASK-STUB-009)

  private engine: any = null;
  private initialized = false;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(PersistenceConfig)
    private readonly persistenceConfig?: PersistenceConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const config = this.buildConfig();
      this.engine = new IntelligenceEngine(config);
      await this.engine.initialize();
      this.initialized = true;
      this.logger.log(
        'IntelligenceEngine initialized successfully ' +
          `(embeddingDim=${config.embeddingDim}, sona=${config.enableSona}, ` +
          `storagePath=${config.storagePath})`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `IntelligenceEngine initialization failed (non-fatal): ${message}. ` +
          'Agents will operate without unified intelligence.',
      );
      this.initialized = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.shutdown();
        this.logger.log('IntelligenceEngine shut down gracefully');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`IntelligenceEngine shutdown error: ${message}`);
      }
    }
  }

  /**
   * Check if the IntelligenceEngine is available and initialized.
   * Agents should check this before calling any engine methods.
   */
  isAvailable(): boolean {
    return this.initialized && this.engine !== null;
  }

  /**
   * Build the IntelligenceConfig from environment variables with
   * CrecheBooks-appropriate defaults.
   */
  private buildConfig(): IntelligenceConfig {
    // Use PersistenceConfig if available, otherwise fall back to direct env var
    const storagePath = this.persistenceConfig
      ? this.persistenceConfig.getConfig().intelligenceDbPath
      : `${this.configService.get<string>('RUVECTOR_DATA_DIR', './data/ruvector')}/intelligence.db`;

    return {
      embeddingDim: this.configService.get<number>(
        'RUVECTOR_EMBEDDING_DIM',
        384,
      ),
      maxMemories: this.configService.get<number>(
        'RUVECTOR_MAX_MEMORIES',
        100_000,
      ),
      maxEpisodes: this.configService.get<number>(
        'RUVECTOR_MAX_EPISODES',
        50_000,
      ),
      enableSona:
        this.configService.get<string>('RUVECTOR_ENABLE_SONA', 'true') ===
        'true',
      enableAttention:
        this.configService.get<string>('RUVECTOR_ENABLE_ATTENTION', 'false') ===
        'true',
      storagePath,
      learningRate: this.configService.get<number>(
        'RUVECTOR_LEARNING_RATE',
        0.1,
      ),
    };
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Route an agent request through IntelligenceEngine.
   * Delegates to LearningEngine internally for optimal routing decisions.
   *
   * @param tenantId - Tenant ID for data isolation
   * @param agentType - Type of agent (categorizer, matcher, sars, etc.)
   * @param context - Contextual information for routing
   * @returns Routing result with recommended path and confidence
   */
  async routeAgent(
    tenantId: string,
    agentType: string,
    context: Record<string, unknown>,
  ): Promise<IntelligenceRouteResult> {
    this.ensureAvailable('routeAgent');
    const startTime = Date.now();

    const result = await this.engine!.routeAgent(tenantId, agentType, context);

    this.logger.debug(
      `routeAgent: tenant=${tenantId.substring(0, 8)} agent=${agentType} ` +
        `path=${result.recommendedPath} confidence=${result.confidence} ` +
        `duration=${Date.now() - startTime}ms`,
    );

    return {
      recommendedPath: result.recommendedPath,
      confidence: result.confidence,
      reasoning: result.reasoning,
      alternatives: result.alternatives ?? [],
    };
  }

  /**
   * Store a memory entry in VectorDB + FastAgentDB dual-store.
   * Memories are stored with tenant isolation via collection scoping.
   *
   * @param tenantId - Tenant ID for data isolation
   * @param key - Unique key for the memory entry
   * @param content - Content to store (will be embedded)
   * @param type - Memory type (decision, reasoning, pattern, embedding)
   */
  async storeMemory(
    tenantId: string,
    key: string,
    content: string,
    type: 'decision' | 'reasoning' | 'pattern' | 'embedding',
  ): Promise<void> {
    this.ensureAvailable('storeMemory');

    await this.engine!.storeMemory(tenantId, key, content, type);

    this.logger.debug(
      `storeMemory: tenant=${tenantId.substring(0, 8)} ` +
        `key=${key} type=${type} contentLength=${content.length}`,
    );
  }

  /**
   * Recall memories by semantic search across all memory types.
   * Uses VectorDB HNSW index for fast approximate nearest neighbor search.
   *
   * @param tenantId - Tenant ID for data isolation
   * @param query - Natural language query to search for
   * @param k - Number of results to return (default: 5)
   * @returns Array of recall results with similarity scores
   */
  async recall(
    tenantId: string,
    query: string,
    k: number = 5,
  ): Promise<IntelligenceRecallResult[]> {
    this.ensureAvailable('recall');
    const startTime = Date.now();

    const results = await this.engine!.recall(tenantId, query, k);

    this.logger.debug(
      `recall: tenant=${tenantId.substring(0, 8)} query="${query.substring(0, 50)}" ` +
        `results=${results.length} duration=${Date.now() - startTime}ms`,
    );

    return results.map((r: Record<string, unknown>) => ({
      key: r.key as string,
      content: r.content as string,
      type: r.type as string,
      similarity: r.similarity as number,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Record a SONA trajectory for learning.
   * SONA uses the trajectory to extract patterns, update LoRA weights,
   * and improve future routing decisions.
   *
   * @param tenantId - Tenant ID for data isolation
   * @param trajectory - SONA trajectory with state, action, quality
   */
  async learn(
    tenantId: string,
    trajectory: IntelligenceTrajectory,
  ): Promise<void> {
    this.ensureAvailable('learn');

    await this.engine!.learn(tenantId, {
      state: trajectory.state,
      action: trajectory.action,
      quality: trajectory.quality,
      metadata: {
        ...trajectory.metadata,
        tenantId,
        timestamp: Date.now(),
      },
    });

    this.logger.debug(
      `learn: tenant=${tenantId.substring(0, 8)} ` +
        `action=${trajectory.action} quality=${trajectory.quality.toFixed(3)}`,
    );
  }

  /**
   * Get unified stats from all subsystems.
   * Returns VectorDB, SONA, FastAgentDB, and LearningEngine stats.
   */
  async getStats(): Promise<IntelligenceStats> {
    this.ensureAvailable('getStats');

    const stats = await this.engine!.getStats();

    return {
      vectorDb: {
        totalVectors: stats.vectorDb?.totalVectors ?? 0,
        collections: stats.vectorDb?.collections ?? 0,
        storageSizeBytes: stats.vectorDb?.storageSizeBytes ?? 0,
      },
      sona: {
        trajectoriesRecorded: stats.sona?.trajectoriesRecorded ?? 0,
        patternsLearned: stats.sona?.patternsLearned ?? 0,
        lastBackgroundRun: stats.sona?.lastBackgroundRun ?? null,
        backgroundIntervalMs: stats.sona?.backgroundIntervalMs ?? 0,
      },
      fastAgentDb: {
        totalEpisodes: stats.fastAgentDb?.totalEpisodes ?? 0,
        totalMemories: stats.fastAgentDb?.totalMemories ?? 0,
      },
      learningEngine: {
        totalDecisions: stats.learningEngine?.totalDecisions ?? 0,
        averageConfidence: stats.learningEngine?.averageConfidence ?? 0,
        routingAccuracy: stats.learningEngine?.routingAccuracy ?? 0,
      },
      initialized: this.initialized,
      uptimeMs: stats.uptimeMs ?? 0,
    };
  }

  /**
   * Health check for NestJS Terminus integration.
   * Returns true if IntelligenceEngine is initialized and responsive.
   */
  async isHealthy(): Promise<boolean> {
    if (!this.initialized || !this.engine) {
      return false;
    }
    try {
      const stats = await this.engine.getStats();
      return stats !== null && stats !== undefined;
    } catch {
      return false;
    }
  }

  // -- Private Helpers ------------------------------------------------------

  /**
   * Ensure the engine is available before executing operations.
   * Throws a descriptive error if not initialized.
   */
  private ensureAvailable(methodName: string): void {
    if (!this.initialized || !this.engine) {
      throw new Error(
        `IntelligenceEngine is not available. ` +
          `Cannot call ${methodName}(). ` +
          `Check RUVECTOR_DATA_DIR and initialization logs.`,
      );
    }
  }
}
