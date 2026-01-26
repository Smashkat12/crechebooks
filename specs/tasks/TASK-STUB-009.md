<task_spec id="TASK-STUB-009" version="2.0">

<metadata>
  <title>IntelligenceEngine Full Stack Integration</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>integration</layer>
  <sequence>809</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-INTELLIGENCE-ENGINE</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-002</task_ref>
    <task_ref status="ready">TASK-STUB-003</task_ref>
    <task_ref status="ready">TASK-STUB-004</task_ref>
    <task_ref status="ready">TASK-STUB-005</task_ref>
    <task_ref status="ready">TASK-STUB-006</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  After TASK-STUB-001 through TASK-STUB-008, individual ruvector and agentic-flow
  components (FastAgentDB, LearningEngine, SonaEngine, VectorDB reasoning bank,
  GNN pattern learner, decision hooks) are all wired independently into CrecheBooks
  agents. Each component has its own injection point, its own lifecycle, and its own
  configuration. They lack a unified orchestration layer that coordinates all
  subsystems into a coherent intelligence surface.

  **Gap Analysis:**
  - No unified intelligence layer. Each component (VectorDB, SONA, FastAgentDB,
    LearningEngine) works independently and is injected separately into each agent.
  - Missing cross-cutting optimizations:
    - SONA trajectories should inform LearningEngine routing decisions
    - GNN patterns should feed back into SONA quality scores
    - VectorDB reasoning chains should improve LearningEngine state representation
    - FastAgentDB episodic memory should provide context to SONA trajectory evaluation
  - Agents currently inject 3-5 individual services each (`@Optional() @Inject()`
    for VectorDB, SONA, FastAgentDB, LearningEngine, etc.), leading to:
    - Duplicated initialization logic across agents
    - Inconsistent configuration between components
    - No unified health check or stats endpoint
    - No single entry point for intelligence operations
  - ruvector's `IntelligenceEngine` exists specifically to solve this problem but
    is not yet integrated into the NestJS application.

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - ruvector v0.1.96: `IntelligenceEngine`, `IntelligenceConfig`, `VectorDB`,
    `SonaEngine`, `FastAgentDB`, `EmbeddingService`, `LearningEngine`
  - agentic-flow v2.0.2-alpha: `ReflexionMemory`, `SkillLibrary`, `EmbeddingService`,
    `NightlyLearner` (only `agentic-flow/agentdb` works)
  - ShadowRunner: wired into all 5 agents, SHADOW mode active in production
  - Tenant: `bdff4374-64d5-420c-b454-8e85e9df552a` ("Think M8 ECD (PTY) Ltd")
  - Railway: api.elleelephant.co.za, Postgres at trolley.proxy.rlwy.net:12401
  - Feature flags in `feature_flags` table (sdk_categorizer, sdk_matcher, sdk_sars,
    sdk_validator, sdk_orchestrator -- all SHADOW mode)

  **Files to Create:**
  - `apps/api/src/agents/sdk/intelligence-engine.service.ts` -- NestJS wrapper around
    ruvector IntelligenceEngine
  - `apps/api/src/agents/sdk/interfaces/intelligence-engine.interface.ts` --
    CrecheBooks-specific wrapper types
  - `apps/api/tests/agents/sdk/intelligence-engine.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/sdk/sdk-agent.module.ts` -- Register IntelligenceEngineService
  - `apps/api/src/agents/sdk/index.ts` -- Export IntelligenceEngineService
  - Each agent module that currently injects multiple individual components can
    optionally switch to IntelligenceEngineService (non-breaking, additive)
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS -- Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. IntelligenceEngine Import and Configuration
  Import from ruvector and configure with CrecheBooks-appropriate defaults:
  ```typescript
  // apps/api/src/agents/sdk/intelligence-engine.service.ts
  import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
  } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import {
    IntelligenceEngine,
    IntelligenceConfig,
  } from 'ruvector';
  import type {
    IntelligenceRouteResult,
    IntelligenceMemoryEntry,
    IntelligenceRecallResult,
    IntelligenceStats,
    IntelligenceTrajectory,
  } from './interfaces/intelligence-engine.interface';

  @Injectable()
  export class IntelligenceEngineService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(IntelligenceEngineService.name);
    private engine: IntelligenceEngine | null = null;
    private initialized = false;

    constructor(private readonly configService: ConfigService) {}

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
      const dataDir = this.configService.get<string>(
        'RUVECTOR_DATA_DIR',
        './data/ruvector',
      );

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
        enableSona: this.configService.get<string>(
          'RUVECTOR_ENABLE_SONA',
          'true',
        ) === 'true',
        enableAttention: this.configService.get<string>(
          'RUVECTOR_ENABLE_ATTENTION',
          'false',
        ) === 'true',
        storagePath: `${dataDir}/intelligence.db`,
        learningRate: this.configService.get<number>(
          'RUVECTOR_LEARNING_RATE',
          0.1,
        ),
      };
    }

    // ── Public API ──────────────────────────────────────────────────────

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

      return results.map((r) => ({
        key: r.key,
        content: r.content,
        type: r.type,
        similarity: r.similarity,
        metadata: r.metadata ?? {},
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

    // ── Private Helpers ─────────────────────────────────────────────────

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
  ```

  ### 3. TypeScript Interfaces for IntelligenceEngine
  ```typescript
  // apps/api/src/agents/sdk/interfaces/intelligence-engine.interface.ts

  /**
   * Result from IntelligenceEngine.routeAgent().
   * Provides the recommended execution path for an agent request.
   */
  export interface IntelligenceRouteResult {
    /** Recommended execution path (e.g., 'sdk', 'heuristic', 'hybrid') */
    recommendedPath: string;
    /** Confidence in the routing decision (0.0 - 1.0) */
    confidence: number;
    /** Human-readable reasoning for the routing decision */
    reasoning: string;
    /** Alternative paths considered with their confidence scores */
    alternatives: Array<{
      path: string;
      confidence: number;
    }>;
  }

  /**
   * A memory entry stored in the dual VectorDB + FastAgentDB store.
   */
  export interface IntelligenceMemoryEntry {
    /** Unique key for retrieval */
    key: string;
    /** Content that was embedded and stored */
    content: string;
    /** Type classification for filtering */
    type: 'decision' | 'reasoning' | 'pattern' | 'embedding';
    /** Tenant ID for isolation */
    tenantId: string;
    /** Timestamp of storage */
    createdAt: number;
    /** Additional metadata */
    metadata: Record<string, unknown>;
  }

  /**
   * Result from IntelligenceEngine.recall() semantic search.
   */
  export interface IntelligenceRecallResult {
    /** Key of the recalled memory */
    key: string;
    /** Content of the recalled memory */
    content: string;
    /** Memory type */
    type: string;
    /** Cosine similarity score (0.0 - 1.0) */
    similarity: number;
    /** Additional metadata from the stored entry */
    metadata: Record<string, unknown>;
  }

  /**
   * A SONA trajectory for the learning subsystem.
   * Captures a state-action-quality triplet for policy learning.
   */
  export interface IntelligenceTrajectory {
    /** State representation (agent context at decision time) */
    state: Record<string, unknown>;
    /** Action taken (e.g., 'categorize:5200', 'match:inv-123') */
    action: string;
    /** Quality of the outcome (0.0 - 1.0, higher = better) */
    quality: number;
    /** Additional metadata (agent type, duration, etc.) */
    metadata?: Record<string, unknown>;
  }

  /**
   * Unified statistics from all IntelligenceEngine subsystems.
   */
  export interface IntelligenceStats {
    vectorDb: {
      totalVectors: number;
      collections: number;
      storageSizeBytes: number;
    };
    sona: {
      trajectoriesRecorded: number;
      patternsLearned: number;
      lastBackgroundRun: number | null;
      backgroundIntervalMs: number;
    };
    fastAgentDb: {
      totalEpisodes: number;
      totalMemories: number;
    };
    learningEngine: {
      totalDecisions: number;
      averageConfidence: number;
      routingAccuracy: number;
    };
    initialized: boolean;
    uptimeMs: number;
  }

  /**
   * Configuration for IntelligenceEngine NestJS service.
   * Maps to ruvector's IntelligenceConfig with CrecheBooks defaults.
   */
  export interface IntelligenceEngineServiceConfig {
    /** Embedding vector dimensions (default: 384 for all-MiniLM-L6-v2) */
    embeddingDim: number;
    /** Maximum number of memory entries (default: 100,000) */
    maxMemories: number;
    /** Maximum number of SONA episodes (default: 50,000) */
    maxEpisodes: number;
    /** Enable SONA self-optimizing architecture (default: true) */
    enableSona: boolean;
    /** Enable attention mechanisms (default: false for CrecheBooks) */
    enableAttention: boolean;
    /** Path to persistent storage (redb ACID on-disk) */
    storagePath: string;
    /** Learning rate for SONA (default: 0.1) */
    learningRate: number;
  }
  ```

  ### 4. NestJS Module Registration (Singleton Scope)
  ```typescript
  // Modification to apps/api/src/agents/sdk/sdk-agent.module.ts
  import { Module } from '@nestjs/common';
  import { ConfigModule } from '@nestjs/config';
  import { SdkAgentFactory } from './sdk-agent.factory';
  import { SdkConfigService } from './sdk-config';
  import { RuvectorService } from './ruvector.service';
  import { IntelligenceEngineService } from './intelligence-engine.service';

  @Module({
    imports: [ConfigModule],
    providers: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,  // NEW: Singleton by default in NestJS
    ],
    exports: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,  // NEW: Available to all importing modules
    ],
  })
  export class SdkAgentModule {}
  ```

  ### 5. Barrel Export Update
  ```typescript
  // Addition to apps/api/src/agents/sdk/index.ts
  export { IntelligenceEngineService } from './intelligence-engine.service';
  export type {
    IntelligenceRouteResult,
    IntelligenceMemoryEntry,
    IntelligenceRecallResult,
    IntelligenceTrajectory,
    IntelligenceStats,
    IntelligenceEngineServiceConfig,
  } from './interfaces/intelligence-engine.interface';
  ```

  ### 6. Optional Agent Integration Pattern
  Each agent can optionally replace multiple individual stub injections with
  a single IntelligenceEngineService injection:
  ```typescript
  // BEFORE (multiple individual injections):
  constructor(
    @Optional() @Inject(VectorDBService) private readonly vectorDb: VectorDBService | null,
    @Optional() @Inject(SonaEngineService) private readonly sona: SonaEngineService | null,
    @Optional() @Inject(FastAgentDBService) private readonly agentDb: FastAgentDBService | null,
    @Optional() @Inject(LearningEngineService) private readonly learning: LearningEngineService | null,
  ) {}

  // AFTER (single unified injection):
  constructor(
    @Optional() @Inject(IntelligenceEngineService)
    private readonly intelligence: IntelligenceEngineService | null,
  ) {}

  // Usage:
  async categorize(input: CategorizationInput): Promise<CategorizationResult> {
    // Route via unified engine
    if (this.intelligence?.isAvailable()) {
      const route = await this.intelligence.routeAgent(
        input.tenantId,
        'categorizer',
        { payeeName: input.payeeName, isCredit: input.isCredit },
      );

      // Store decision memory
      await this.intelligence.storeMemory(
        input.tenantId,
        `categorizer:${input.transactionId}`,
        JSON.stringify(result),
        'decision',
      );

      // Record SONA trajectory for learning
      await this.intelligence.learn(input.tenantId, {
        state: { payeeName: input.payeeName, amountCents: input.amountCents },
        action: `categorize:${result.accountCode}`,
        quality: result.confidence / 100,
      });
    }
  }
  ```

  ### 7. Health Check Integration with NestJS Terminus
  ```typescript
  // In health check controller or module:
  import { HealthCheck, HealthCheckService, HealthIndicator } from '@nestjs/terminus';
  import { IntelligenceEngineService } from '../agents/sdk';

  @Injectable()
  export class IntelligenceHealthIndicator extends HealthIndicator {
    constructor(private readonly intelligence: IntelligenceEngineService) {
      super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
      const isHealthy = await this.intelligence.isHealthy();
      const stats = this.intelligence.isAvailable()
        ? await this.intelligence.getStats()
        : null;

      return this.getStatus(key, isHealthy, {
        initialized: this.intelligence.isAvailable(),
        vectorDbVectors: stats?.vectorDb.totalVectors ?? 0,
        sonaTrajectories: stats?.sona.trajectoriesRecorded ?? 0,
        uptimeMs: stats?.uptimeMs ?? 0,
      });
    }
  }
  ```

  ### 8. Testing Pattern
  Tests MUST mock IntelligenceEngine -- never instantiate real ruvector:
  ```typescript
  // apps/api/tests/agents/sdk/intelligence-engine.service.spec.ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { ConfigModule, ConfigService } from '@nestjs/config';
  import { IntelligenceEngineService } from '../../../src/agents/sdk/intelligence-engine.service';

  // Mock the entire ruvector module
  jest.mock('ruvector', () => ({
    IntelligenceEngine: jest.fn().mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      shutdown: jest.fn().mockResolvedValue(undefined),
      routeAgent: jest.fn().mockResolvedValue({
        recommendedPath: 'sdk',
        confidence: 0.92,
        reasoning: 'High pattern match confidence',
        alternatives: [{ path: 'heuristic', confidence: 0.78 }],
      }),
      storeMemory: jest.fn().mockResolvedValue(undefined),
      recall: jest.fn().mockResolvedValue([
        {
          key: 'categorizer:tx-123',
          content: '{"accountCode": "5200"}',
          type: 'decision',
          similarity: 0.95,
          metadata: {},
        },
      ]),
      learn: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockResolvedValue({
        vectorDb: { totalVectors: 1500, collections: 4, storageSizeBytes: 2048000 },
        sona: {
          trajectoriesRecorded: 350,
          patternsLearned: 42,
          lastBackgroundRun: Date.now() - 3600000,
          backgroundIntervalMs: 3600000,
        },
        fastAgentDb: { totalEpisodes: 200, totalMemories: 800 },
        learningEngine: {
          totalDecisions: 1200,
          averageConfidence: 0.87,
          routingAccuracy: 0.91,
        },
        uptimeMs: 86400000,
      }),
    })),
  }));

  describe('IntelligenceEngineService', () => {
    let service: IntelligenceEngineService;
    let configService: ConfigService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({
              RUVECTOR_DATA_DIR: './data/test-ruvector',
              RUVECTOR_EMBEDDING_DIM: 384,
              RUVECTOR_MAX_MEMORIES: 100000,
              RUVECTOR_MAX_EPISODES: 50000,
              RUVECTOR_ENABLE_SONA: 'true',
              RUVECTOR_ENABLE_ATTENTION: 'false',
              RUVECTOR_LEARNING_RATE: 0.1,
            })],
          }),
        ],
        providers: [IntelligenceEngineService],
      }).compile();

      service = module.get<IntelligenceEngineService>(IntelligenceEngineService);
      configService = module.get<ConfigService>(ConfigService);
    });

    describe('lifecycle', () => {
      it('should initialize on module init', async () => {
        await service.onModuleInit();
        expect(service.isAvailable()).toBe(true);
      });

      it('should handle initialization failure gracefully', async () => {
        // Override mock to throw on initialize
        const { IntelligenceEngine } = require('ruvector');
        IntelligenceEngine.mockImplementationOnce(() => ({
          initialize: jest.fn().mockRejectedValue(new Error('Storage unavailable')),
        }));

        const failService = new IntelligenceEngineService(configService);
        await failService.onModuleInit();
        expect(failService.isAvailable()).toBe(false);
      });

      it('should shut down gracefully', async () => {
        await service.onModuleInit();
        await service.onModuleDestroy();
        // No error thrown
      });
    });

    describe('routeAgent', () => {
      beforeEach(async () => {
        await service.onModuleInit();
      });

      it('should return routing decision with confidence', async () => {
        const result = await service.routeAgent(
          'bdff4374-64d5-420c-b454-8e85e9df552a',
          'categorizer',
          { payeeName: 'Woolworths', isCredit: false },
        );

        expect(result.recommendedPath).toBe('sdk');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.reasoning).toBeTruthy();
      });

      it('should throw when engine not available', async () => {
        const unavailableService = new IntelligenceEngineService(configService);
        await expect(
          unavailableService.routeAgent('tenant', 'categorizer', {}),
        ).rejects.toThrow('IntelligenceEngine is not available');
      });
    });

    describe('storeMemory', () => {
      beforeEach(async () => {
        await service.onModuleInit();
      });

      it('should store memory with tenant isolation', async () => {
        await expect(
          service.storeMemory(
            'bdff4374-64d5-420c-b454-8e85e9df552a',
            'categorizer:tx-001',
            '{"accountCode": "5200", "confidence": 92}',
            'decision',
          ),
        ).resolves.not.toThrow();
      });

      it('should accept all memory types', async () => {
        const types = ['decision', 'reasoning', 'pattern', 'embedding'] as const;
        for (const type of types) {
          await expect(
            service.storeMemory('tenant', `key-${type}`, 'content', type),
          ).resolves.not.toThrow();
        }
      });
    });

    describe('recall', () => {
      beforeEach(async () => {
        await service.onModuleInit();
      });

      it('should return recall results with similarity scores', async () => {
        const results = await service.recall(
          'bdff4374-64d5-420c-b454-8e85e9df552a',
          'Woolworths food categorization',
          5,
        );

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].similarity).toBeGreaterThan(0);
        expect(results[0].similarity).toBeLessThanOrEqual(1);
        expect(results[0].key).toBeTruthy();
        expect(results[0].content).toBeTruthy();
      });

      it('should default k to 5', async () => {
        const results = await service.recall('tenant', 'query');
        expect(results).toBeDefined();
      });
    });

    describe('learn', () => {
      beforeEach(async () => {
        await service.onModuleInit();
      });

      it('should record SONA trajectory', async () => {
        await expect(
          service.learn('bdff4374-64d5-420c-b454-8e85e9df552a', {
            state: { payeeName: 'Woolworths', amountCents: 250000 },
            action: 'categorize:5200',
            quality: 0.92,
            metadata: { agentType: 'categorizer' },
          }),
        ).resolves.not.toThrow();
      });

      it('should accept quality between 0 and 1', async () => {
        await expect(
          service.learn('tenant', {
            state: {},
            action: 'test',
            quality: 0.0,
          }),
        ).resolves.not.toThrow();

        await expect(
          service.learn('tenant', {
            state: {},
            action: 'test',
            quality: 1.0,
          }),
        ).resolves.not.toThrow();
      });
    });

    describe('getStats', () => {
      beforeEach(async () => {
        await service.onModuleInit();
      });

      it('should return unified stats from all subsystems', async () => {
        const stats = await service.getStats();

        expect(stats.initialized).toBe(true);
        expect(stats.vectorDb.totalVectors).toBeGreaterThanOrEqual(0);
        expect(stats.sona.trajectoriesRecorded).toBeGreaterThanOrEqual(0);
        expect(stats.fastAgentDb.totalEpisodes).toBeGreaterThanOrEqual(0);
        expect(stats.learningEngine.totalDecisions).toBeGreaterThanOrEqual(0);
        expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should report correct initialization status', async () => {
        const stats = await service.getStats();
        expect(stats.initialized).toBe(true);
      });
    });

    describe('isHealthy', () => {
      it('should return true when initialized and responsive', async () => {
        await service.onModuleInit();
        const healthy = await service.isHealthy();
        expect(healthy).toBe(true);
      });

      it('should return false when not initialized', async () => {
        const uninitService = new IntelligenceEngineService(configService);
        const healthy = await uninitService.isHealthy();
        expect(healthy).toBe(false);
      });
    });
  });
  ```

  ### 9. Environment Variables
  Add these to `.env.example`:
  ```bash
  # -- IntelligenceEngine (ruvector unified orchestration) -----------------
  RUVECTOR_DATA_DIR=./data/ruvector
  RUVECTOR_EMBEDDING_DIM=384
  RUVECTOR_MAX_MEMORIES=100000
  RUVECTOR_MAX_EPISODES=50000
  RUVECTOR_ENABLE_SONA=true
  RUVECTOR_ENABLE_ATTENTION=false
  RUVECTOR_LEARNING_RATE=0.1
  ```

  ### 10. TypeScript Strict Typing
  ```typescript
  // CORRECT -- explicit types everywhere
  async routeAgent(
    tenantId: string,
    agentType: string,
    context: Record<string, unknown>,
  ): Promise<IntelligenceRouteResult> { ... }

  // WRONG -- never use `any`
  // async routeAgent(tenantId: any, agentType: any, context: any): Promise<any>
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  After TASK-STUB-001 through 008, the system has individual ruvector and agentic-flow
  components wired into each agent separately. The IntelligenceEngine unifies these into
  a single orchestration layer, providing:

  - **Simplified agent code**: Agents inject one service instead of 3-5 separate services
  - **Cross-cutting optimizations**: SONA trajectories feed LearningEngine routing;
    GNN patterns feed back into SONA quality scores; VectorDB reasoning chains improve
    LearningEngine state representation
  - **Unified health monitoring**: One health check endpoint for all AI subsystems
  - **Consistent configuration**: One set of environment variables instead of per-component config
  - **Graceful degradation**: If IntelligenceEngine fails to init, agents fall back to
    individual component injection or pure heuristic mode

  ## SA Compliance Notes
  - All monetary values in cents (integers) -- R1,500.00 = 150000
  - Tenant isolation enforced at the IntelligenceEngine level via tenantId in all API calls
  - SARS agent results ALWAYS require L2 human review regardless of IntelligenceEngine confidence
  - Decision memories stored via IntelligenceEngine are subject to POPI Act requirements

  ## Architectural Decisions
  - **Singleton scope**: One IntelligenceEngine per NestJS application instance. This is the
    default NestJS provider scope and matches ruvector's design (single shared VectorDB,
    SONA, and FastAgentDB).
  - **Optional injection**: Agents use `@Optional() @Inject(IntelligenceEngineService)` so
    they continue working if the engine is not available.
  - **Non-breaking migration**: Agents can adopt IntelligenceEngineService incrementally.
    Individual component injections continue to work alongside the unified service.
  - **redb ACID storage**: VectorDB persistence uses redb for crash-safe on-disk storage,
    configured via `storagePath` in IntelligenceConfig.
  - **Railway deployment**: Storage path must point to Railway persistent volume mount
    (`/data/ruvector`) in production, local `./data/ruvector` in development.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `IntelligenceEngineService` as a NestJS `@Injectable()` singleton wrapping
      ruvector's `IntelligenceEngine`
    - Implement NestJS lifecycle hooks: `OnModuleInit` for initialization,
      `OnModuleDestroy` for graceful shutdown
    - Implement unified API: `routeAgent()`, `storeMemory()`, `recall()`, `learn()`,
      `getStats()`
    - Implement `isAvailable()` availability check and `isHealthy()` health check
    - Implement `ensureAvailable()` guard that throws descriptive error when engine is not ready
    - Implement `buildConfig()` that reads environment variables with CrecheBooks defaults
    - Create TypeScript interfaces: `IntelligenceRouteResult`, `IntelligenceMemoryEntry`,
      `IntelligenceRecallResult`, `IntelligenceTrajectory`, `IntelligenceStats`,
      `IntelligenceEngineServiceConfig`
    - Register `IntelligenceEngineService` in `SdkAgentModule` providers and exports
    - Update barrel export `index.ts` with new service and types
    - Add environment variables to `.env.example`
    - Create NestJS Terminus health check indicator pattern (optional integration)
    - Unit tests for all lifecycle methods (init success, init failure, shutdown)
    - Unit tests for all API methods (routeAgent, storeMemory, recall, learn, getStats)
    - Unit tests for availability guard (throws when not initialized)
    - Unit tests for health check (healthy when initialized, unhealthy when not)
    - All tests use mocked ruvector -- zero real IntelligenceEngine instantiation
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - Distributed IntelligenceEngine (single-instance is sufficient for CrecheBooks)
    - Custom attention mechanisms (enableAttention = false)
    - Worker pool parallel intelligence (not needed at current scale)
    - Migrating all agents from individual injections to IntelligenceEngineService
      (this is incremental and optional per agent)
    - IntelligenceEngine cluster/Raft consensus (single-node sufficient)
    - Custom embedding model training (use pre-trained all-MiniLM-L6-v2)
    - Prometheus metrics export (future task, but health check is in scope)
    - Railway persistent volume provisioning (infrastructure, not code)
    - SONA bootstrap/seeding (TASK-STUB-011)
    - Multi-tenant collection management (TASK-STUB-010)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/intelligence-engine.service.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/interfaces/intelligence-engine.interface.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/agents/sdk/intelligence-engine.service.spec.ts

# 2. Verify build succeeds
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm run build

# 3. Run IntelligenceEngine-specific tests
pnpm test -- --testPathPattern="intelligence-engine" --runInBand

# 4. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 5. Lint check
pnpm run lint

# 6. Verify IntelligenceEngineService registered in SdkAgentModule
grep "IntelligenceEngineService" apps/api/src/agents/sdk/sdk-agent.module.ts

# 7. Verify IntelligenceEngineService exported from barrel
grep "IntelligenceEngineService" apps/api/src/agents/sdk/index.ts

# 8. Verify ruvector IntelligenceEngine import
grep "IntelligenceEngine" apps/api/src/agents/sdk/intelligence-engine.service.ts | head -3

# 9. Verify OnModuleInit and OnModuleDestroy lifecycle hooks
grep -n "OnModuleInit\|OnModuleDestroy" apps/api/src/agents/sdk/intelligence-engine.service.ts

# 10. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/sdk/intelligence-engine.service.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"
grep -rn ": any" apps/api/src/agents/sdk/interfaces/intelligence-engine.interface.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"

# 11. Verify environment variables in .env.example
grep "RUVECTOR_DATA_DIR" apps/api/.env.example
grep "RUVECTOR_ENABLE_SONA" apps/api/.env.example

# 12. Verify health check method exists
grep "isHealthy" apps/api/src/agents/sdk/intelligence-engine.service.ts

# 13. Verify ensureAvailable guard
grep "ensureAvailable" apps/api/src/agents/sdk/intelligence-engine.service.ts

# 14. Verify all public API methods exist
grep -E "async (routeAgent|storeMemory|recall|learn|getStats|isHealthy)" apps/api/src/agents/sdk/intelligence-engine.service.ts

# 15. TypeScript strict check
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm exec tsc --noEmit --strict 2>&1 | grep "intelligence-engine" || echo "PASS: no TS errors in intelligence-engine files"
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `IntelligenceEngineService` created as `@Injectable()` NestJS singleton
  - [ ] `IntelligenceEngineService` implements `OnModuleInit` for initialization
  - [ ] `IntelligenceEngineService` implements `OnModuleDestroy` for graceful shutdown
  - [ ] Initialization failure is non-fatal (logs warning, `isAvailable()` returns false)
  - [ ] `buildConfig()` reads all env vars with CrecheBooks defaults:
        embeddingDim=384, maxMemories=100000, maxEpisodes=50000, enableSona=true,
        enableAttention=false, storagePath=RUVECTOR_DATA_DIR/intelligence.db, learningRate=0.1
  - [ ] `routeAgent(tenantId, agentType, context)` delegates to IntelligenceEngine,
        returns `IntelligenceRouteResult`
  - [ ] `storeMemory(tenantId, key, content, type)` stores in VectorDB + FastAgentDB dual-store
  - [ ] `recall(tenantId, query, k)` performs semantic search, returns `IntelligenceRecallResult[]`
  - [ ] `learn(tenantId, trajectory)` records SONA trajectory with metadata enrichment
  - [ ] `getStats()` returns unified `IntelligenceStats` from all subsystems
  - [ ] `isAvailable()` returns boolean based on initialization state
  - [ ] `isHealthy()` returns boolean based on engine responsiveness (for Terminus integration)
  - [ ] `ensureAvailable()` throws descriptive error when engine is not initialized
  - [ ] All public methods include structured debug logging with tenant ID prefix
  - [ ] TypeScript interfaces created: `IntelligenceRouteResult`, `IntelligenceMemoryEntry`,
        `IntelligenceRecallResult`, `IntelligenceTrajectory`, `IntelligenceStats`,
        `IntelligenceEngineServiceConfig`
  - [ ] `IntelligenceEngineService` registered in `SdkAgentModule` providers array
  - [ ] `IntelligenceEngineService` added to `SdkAgentModule` exports array
  - [ ] Barrel export `index.ts` updated with new service and all interface types
  - [ ] Environment variables added to `.env.example`: RUVECTOR_DATA_DIR,
        RUVECTOR_EMBEDDING_DIM, RUVECTOR_MAX_MEMORIES, RUVECTOR_MAX_EPISODES,
        RUVECTOR_ENABLE_SONA, RUVECTOR_ENABLE_ATTENTION, RUVECTOR_LEARNING_RATE
  - [ ] Unit tests: initialization success (`onModuleInit` sets `isAvailable()` = true)
  - [ ] Unit tests: initialization failure (non-fatal, `isAvailable()` = false)
  - [ ] Unit tests: graceful shutdown (`onModuleDestroy` calls engine.shutdown())
  - [ ] Unit tests: `routeAgent()` returns valid `IntelligenceRouteResult`
  - [ ] Unit tests: `storeMemory()` accepts all 4 memory types (decision, reasoning, pattern, embedding)
  - [ ] Unit tests: `recall()` returns results with similarity scores between 0 and 1
  - [ ] Unit tests: `recall()` defaults k to 5
  - [ ] Unit tests: `learn()` records trajectory with metadata enrichment
  - [ ] Unit tests: `getStats()` returns all subsystem stats
  - [ ] Unit tests: `ensureAvailable()` throws when not initialized
  - [ ] Unit tests: `isHealthy()` returns true when initialized, false when not
  - [ ] All tests mock ruvector -- zero real IntelligenceEngine instantiation
  - [ ] Test coverage >= 90% for IntelligenceEngineService
  - [ ] Zero `any` types in all new files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (zero regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER use `any` type** -- use proper TypeScript interfaces from `intelligence-engine.interface.ts`
  - **NEVER use `npm`** -- all commands must use `pnpm`
  - **NEVER make IntelligenceEngine initialization a hard dependency** -- if init fails, agents must
    continue working via individual component injections or pure heuristic fallback. Use
    `@Optional() @Inject()` in consuming agents.
  - **NEVER create multiple IntelligenceEngine instances** -- it is a singleton by design.
    NestJS default scope is singleton; do not use `Scope.REQUEST` or `Scope.TRANSIENT`.
  - **NEVER expose IntelligenceEngine directly to agents** -- always wrap via
    `IntelligenceEngineService`. Direct `import { IntelligenceEngine } from 'ruvector'`
    in agent code couples agents to ruvector internals.
  - **NEVER omit tenantId from any API call** -- every method (routeAgent, storeMemory,
    recall, learn) requires tenantId for data isolation. This is a POPI/legal requirement.
  - **NEVER store raw PII in IntelligenceEngine memories** -- sanitize descriptions before
    embedding (strip parent names, ID numbers, phone numbers, email addresses).
  - **NEVER hardcode storage paths** -- always read from `RUVECTOR_DATA_DIR` environment variable
    via NestJS ConfigService. Production uses Railway volume mount, development uses local dir.
  - **NEVER skip lifecycle hooks** -- `OnModuleInit` and `OnModuleDestroy` are required for
    proper initialization and graceful shutdown. Without them, redb storage may corrupt on crash.
  - **NEVER make real ruvector calls in tests** -- always mock the `IntelligenceEngine` class.
    Tests must be fast, deterministic, and runnable without ruvector native binaries.
  - **NEVER block application startup if IntelligenceEngine fails** -- initialization failure
    is non-fatal. Log a warning and set `initialized = false`. Agents use `isAvailable()` guard.
  - **NEVER use floating-point for monetary values** -- all amounts in cents (integers).
    IntelligenceEngine memories may contain financial data; ensure cents format throughout.
  - **NEVER auto-apply SARS agent results** -- even with IntelligenceEngine confidence,
    SARS results always require L2 human review (SA regulatory requirement).
</anti_patterns>

</task_spec>
