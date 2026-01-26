<task_spec id="TASK-STUB-002" version="2.0">

<metadata>
  <title>FastAgentDB Stub Replacement</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>foundation</layer>
  <sequence>802</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-STUB-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `AgentDBStub` class defined locally in
  `apps/api/src/agents/memory/agent-memory.service.ts` (lines 35-48) is a no-op
  stub. Its methods `store()`, `recordCorrection()`, and `getAccuracyStats()` either
  log warnings and return nothing, or return `null` to trigger Prisma fallbacks.
  This means:
  - Agent decisions are stored only in Prisma (compliance) but never in a queryable
    vector-indexed memory that agents can search for similar past episodes
  - The `getSimilarDecisions()` method falls back to exact hash lookup via Prisma
    because the AgentDB stub has no search capability
  - No episode/trajectory data is available for the LearningEngine (TASK-STUB-003)
    or FeedbackLoop (TASK-STUB-004) to learn from
  - The dual-write pattern exists but only one side (Prisma) actually persists data

  Similarly, the `AgentDB` stub in `apps/api/src/agents/shared/accuracy-tracker.ts`
  (lines 31-45) has `recordAccuracyOutcome()` and `getAccuracyStats()` that are
  no-ops returning `null`.

  **Gap Analysis:**
  - `AgentDBStub` in `agent-memory.service.ts`: `store()` is a no-op, `recordCorrection()`
    is a no-op, `getAccuracyStats()` returns `null`
  - `AgentDB` stub in `accuracy-tracker.ts`: `recordAccuracyOutcome()` is a no-op,
    `getAccuracyStats()` returns `null`
  - `ReasoningBankStub` in `agent-memory.service.ts`: Uses an in-memory Map but is
    never persisted — lost on restart
  - No integration with ruvector's `FastAgentDB` for vector-indexed episode storage
  - No integration with `agentic-flow/agentdb`'s `ReflexionMemory` for reflective
    learning from past episodes
  - No adapter layer to bridge CrecheBooks' `AgentDBStub` interface with ruvector's
    `FastAgentDB` episode-based API

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm (NEVER npm)
  - Language: TypeScript (strict mode)
  - Testing: Jest
  - ruvector v0.1.96: `FastAgentDB` — in-memory episode/trajectory storage with
    LRU eviction (configurable max: 100k episodes), vector similarity search,
    batch operations, episode metadata with arbitrary JSON, automatic TTL-based
    eviction
  - agentic-flow v2.0.2-alpha: `agentic-flow/agentdb` sub-export works.
    `ReflexionMemory` — episode-based reflective memory with `storeEpisode()` and
    `retrieveRelevant()`. Note: episode-based API, NOT key-value.
  - Existing dual-write pattern: AgentDB stub + Prisma. Must preserve Prisma writes.

  **Files to Create:**
  - `apps/api/src/agents/memory/fast-agentdb.adapter.ts` — Adapter wrapping
    `FastAgentDB` + `ReflexionMemory` with CrecheBooks `AgentDBStub` interface
  - `apps/api/src/agents/memory/interfaces/fast-agentdb.interface.ts` — Adapter
    interfaces and types
  - `apps/api/tests/agents/memory/fast-agentdb.adapter.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/memory/agent-memory.service.ts` — Replace `AgentDBStub`
    with `FastAgentDBAdapter`, replace `ReasoningBankStub` with real reasoning storage
  - `apps/api/src/agents/memory/agent-memory.module.ts` — Register `FastAgentDBAdapter`
    as provider
  - `apps/api/src/agents/shared/accuracy-tracker.ts` — Replace `AgentDB` stub with
    `FastAgentDBAdapter` for accuracy outcome storage
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. FastAgentDB from ruvector
  ```typescript
  import { FastAgentDB } from 'ruvector';

  // FastAgentDB is an in-memory episode store with vector similarity search.
  // API:
  //   storeEpisode(episode: Episode): Promise<string>        — returns episode ID
  //   getEpisode(id: string): Promise<Episode | null>
  //   searchSimilar(query: number[], k: number): Promise<EpisodeMatch[]>
  //   getStats(): Promise<AgentDBStats>
  //   batchStore(episodes: Episode[]): Promise<string[]>
  //
  // Episode shape:
  //   { state: unknown; action: string; reward: number; nextState?: unknown;
  //     metadata?: Record<string, unknown>; embedding?: number[] }
  //
  // EpisodeMatch shape:
  //   { episode: Episode; score: number; id: string }
  //
  // AgentDBStats shape:
  //   { totalEpisodes: number; avgReward: number; maxReward: number;
  //     minReward: number; memoryUsageBytes: number }
  //
  // Configuration:
  //   new FastAgentDB({ maxEpisodes?: number; ttlMs?: number })
  //   maxEpisodes: default 100_000 (LRU eviction)
  //   ttlMs: default 0 (no TTL, persistent until evicted)
  ```

  ### 3. ReflexionMemory from agentic-flow/agentdb
  ```typescript
  import { ReflexionMemory } from 'agentic-flow/agentdb';

  // ReflexionMemory uses an episode-based API (NOT key-value).
  // API:
  //   storeEpisode(episode: ReflexionEpisode): Promise<string>
  //   retrieveRelevant(query: string, k?: number): Promise<ReflexionEpisode[]>
  //   getTaskStats(task: string): Promise<TaskStats>
  //
  // ReflexionEpisode shape:
  //   { task: string; reflection: string; success: boolean;
  //     strategy: string; timestamp?: number }
  //
  // TaskStats shape:
  //   { totalEpisodes: number; successRate: number;
  //     recentStrategies: string[] }
  //
  // IMPORTANT: ReflexionMemory is episode-based, not key-value.
  // The adapter must convert CrecheBooks' store(data) calls into
  // storeEpisode({ task, reflection, success, strategy }) calls.
  ```

  ### 4. FastAgentDBAdapter — Bridging Interfaces
  The adapter must map CrecheBooks' existing `AgentDBStub` interface to
  `FastAgentDB` + `ReflexionMemory`:
  ```typescript
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import type {
    AgentDBInterface,
    AgentDBStoreParams,
    AgentDBCorrectionParams,
    AgentDBAccuracyStats,
    AgentDBSimilarEpisode,
  } from './interfaces/fast-agentdb.interface';

  @Injectable()
  export class FastAgentDBAdapter implements AgentDBInterface {
    private readonly logger = new Logger(FastAgentDBAdapter.name);
    private fastAgentDB: /* FastAgentDB instance */ | null = null;
    private reflexionMemory: /* ReflexionMemory instance */ | null = null;
    private initialized = false;

    constructor(
      @Optional()
      @Inject(ConfigService)
      private readonly configService?: ConfigService,
    ) {}

    async onModuleInit(): Promise<void> {
      try {
        // Dynamic import to avoid hard dependency
        const { FastAgentDB } = await import('ruvector');
        this.fastAgentDB = new FastAgentDB({
          maxEpisodes: this.configService?.get<number>('AGENTDB_MAX_EPISODES') ?? 50_000,
        });

        const { ReflexionMemory } = await import('agentic-flow/agentdb');
        this.reflexionMemory = new ReflexionMemory();

        this.initialized = true;
        this.logger.log('FastAgentDBAdapter initialized (FastAgentDB + ReflexionMemory)');
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
        const episode = {
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
          embedding: data.embedding, // Optional: pre-computed embedding
        };

        await this.fastAgentDB.storeEpisode(episode).catch((err: Error) => {
          this.logger.warn(`FastAgentDB storeEpisode failed: ${err.message}`);
        });
      }

      // 2. Store in ReflexionMemory for reflective learning
      if (this.reflexionMemory) {
        await this.reflexionMemory.storeEpisode({
          task: data.agentType,
          reflection: `Decision: ${JSON.stringify(data.decision)} | Source: ${data.source}`,
          success: data.confidence >= 80, // 80% threshold = considered successful
          strategy: data.source,
        }).catch((err: Error) => {
          this.logger.warn(`ReflexionMemory storeEpisode failed: ${err.message}`);
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
        await this.fastAgentDB.storeEpisode({
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
        }).catch((err: Error) => {
          this.logger.warn(`FastAgentDB correction episode failed: ${err.message}`);
        });
      }

      if (this.reflexionMemory) {
        await this.reflexionMemory.storeEpisode({
          task: 'correction',
          reflection: `Corrected from ${JSON.stringify(data.originalValue)} to ${JSON.stringify(data.correctedValue)}`,
          success: false,
          strategy: 'human-correction',
        }).catch((err: Error) => {
          this.logger.warn(`ReflexionMemory correction episode failed: ${err.message}`);
        });
      }
    }

    /**
     * Get accuracy statistics from FastAgentDB.
     *
     * Maps: getAccuracyStats() -> FastAgentDB.getStats() aggregation
     */
    async getAccuracyStats(
      tenantId: string,
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
            (reflexionStats?.successRate ?? 0) * (reflexionStats?.totalEpisodes ?? 0),
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
        const matches = await this.fastAgentDB.searchSimilar(queryEmbedding, limit);
        return matches.map((match) => ({
          id: match.id,
          episode: match.episode,
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
  ```

  ### 5. Adapter Interfaces
  ```typescript
  // apps/api/src/agents/memory/interfaces/fast-agentdb.interface.ts

  import type { MemoryAccuracyStats } from './agent-memory.interface';

  /** Parameters for storing an agent decision in FastAgentDB */
  export interface AgentDBStoreParams {
    tenantId: string;
    agentType: string;
    inputHash: string;
    decision: Record<string, unknown>;
    confidence: number;
    source: string;
    transactionId?: string;
    embedding?: number[]; // Pre-computed embedding for vector search
  }

  /** Parameters for recording a correction */
  export interface AgentDBCorrectionParams {
    tenantId: string;
    agentDecisionId: string;
    originalValue: Record<string, unknown>;
    correctedValue: Record<string, unknown>;
    correctedBy: string;
  }

  /** Accuracy stats returned by FastAgentDB (compatible with MemoryAccuracyStats) */
  export type AgentDBAccuracyStats = MemoryAccuracyStats;

  /** A similar episode found via vector search */
  export interface AgentDBSimilarEpisode {
    id: string;
    episode: {
      state: unknown;
      action: string;
      reward: number;
      metadata?: Record<string, unknown>;
    };
    score: number;
  }

  /** Full interface for the FastAgentDB adapter */
  export interface AgentDBInterface {
    store(data: AgentDBStoreParams): Promise<void>;
    recordCorrection(data: AgentDBCorrectionParams): Promise<void>;
    getAccuracyStats(
      tenantId: string,
      agentType: string,
    ): Promise<AgentDBAccuracyStats | null>;
    searchSimilarEpisodes(
      queryEmbedding: number[],
      limit?: number,
    ): Promise<AgentDBSimilarEpisode[]>;
    isAvailable(): boolean;
  }
  ```

  ### 6. Integration into AgentMemoryService
  Replace the inline `AgentDBStub` with the injected `FastAgentDBAdapter`:
  ```typescript
  @Injectable()
  export class AgentMemoryService {
    private readonly logger = new Logger(AgentMemoryService.name);

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
      private readonly agentDb?: FastAgentDBAdapter, // CHANGED: was inline AgentDBStub
    ) {}

    async storeDecision(params: StoreDecisionParams): Promise<string> {
      // 1. Write to FastAgentDB (fire-and-forget with .catch())
      if (this.agentDb?.isAvailable()) {
        this.agentDb
          .store({
            tenantId: params.tenantId,
            agentType: params.agentType,
            inputHash: params.inputHash,
            decision: params.decision,
            confidence: params.confidence,
            source: params.source,
            transactionId: params.transactionId,
          })
          .catch((err: Error) => {
            this.logger.warn(`FastAgentDB store failed: ${err.message}`);
          });
      }

      // 2-4. Prisma, reasoning, ruvector writes unchanged...
    }
  }
  ```

  ### 7. @Optional() @Inject() Pattern for All New Dependencies
  ```typescript
  // CORRECT: Optional injection — system works without FastAgentDBAdapter
  constructor(
    @Optional()
    @Inject(FastAgentDBAdapter)
    private readonly agentDb?: FastAgentDBAdapter,
  ) {}

  // WRONG: Required injection — system crashes if adapter fails to init
  // constructor(
  //   @Inject(FastAgentDBAdapter)
  //   private readonly agentDb: FastAgentDBAdapter,
  // ) {}
  ```

  ### 8. Non-Blocking Writes (.catch() Pattern)
  ALL writes to FastAgentDB and ReflexionMemory MUST be non-blocking:
  ```typescript
  // CORRECT: Fire-and-forget with .catch()
  this.agentDb.store(data).catch((err: Error) => {
    this.logger.warn(`AgentDB write failed: ${err.message}`);
  });

  // WRONG: Awaiting the write blocks the main flow
  // await this.agentDb.store(data);  // NEVER DO THIS for non-critical writes
  ```

  ### 9. Preserve Prisma Dual-Write
  The existing Prisma writes in `AgentMemoryService` MUST be preserved. FastAgentDB
  is an ADDITION to the dual-write, not a replacement:
  ```
  Decision Storage Flow:
    1. FastAgentDB.store() [fire-and-forget, .catch()]     <- NEW
    2. Prisma.agentDecision.create() [awaited, compliance] <- EXISTING (preserved)
    3. ReasoningBank.store() [fire-and-forget, .catch()]   <- EXISTING (preserved)
    4. Ruvector embedding [fire-and-forget, .catch()]      <- EXISTING (preserved)
  ```

  ### 10. Module Registration
  ```typescript
  // apps/api/src/agents/memory/agent-memory.module.ts
  import { Module } from '@nestjs/common';
  import { AgentMemoryService } from './agent-memory.service';
  import { PatternLearner } from './pattern-learner';
  import { CorrectionHandler } from './correction-handler';
  import { FastAgentDBAdapter } from './fast-agentdb.adapter';
  import { PrismaModule } from '../../database/prisma';
  import { SdkAgentModule } from '../sdk';

  @Module({
    imports: [PrismaModule, SdkAgentModule],
    providers: [
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
      FastAgentDBAdapter,  // NEW
    ],
    exports: [
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
      FastAgentDBAdapter,  // NEW — exported for FeedbackLoop (TASK-STUB-004)
    ],
  })
  export class AgentMemoryModule {}
  ```

  ### 11. Testing Pattern — Mock Everything
  ```typescript
  describe('FastAgentDBAdapter', () => {
    let adapter: FastAgentDBAdapter;
    let mockFastAgentDB: {
      storeEpisode: jest.Mock;
      getStats: jest.Mock;
      searchSimilar: jest.Mock;
    };
    let mockReflexionMemory: {
      storeEpisode: jest.Mock;
      getTaskStats: jest.Mock;
    };

    beforeEach(async () => {
      mockFastAgentDB = {
        storeEpisode: jest.fn().mockResolvedValue('ep-001'),
        getStats: jest.fn().mockResolvedValue({
          totalEpisodes: 100,
          avgReward: 0.75,
          maxReward: 1.0,
          minReward: -1.0,
          memoryUsageBytes: 1024,
        }),
        searchSimilar: jest.fn().mockResolvedValue([]),
      };

      mockReflexionMemory = {
        storeEpisode: jest.fn().mockResolvedValue('ref-001'),
        getTaskStats: jest.fn().mockResolvedValue({
          totalEpisodes: 50,
          successRate: 0.8,
          recentStrategies: ['LLM', 'PATTERN'],
        }),
      };

      // Mock dynamic imports
      jest.mock('ruvector', () => ({
        FastAgentDB: jest.fn().mockImplementation(() => mockFastAgentDB),
      }));

      jest.mock('agentic-flow/agentdb', () => ({
        ReflexionMemory: jest.fn().mockImplementation(() => mockReflexionMemory),
      }));

      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [FastAgentDBAdapter],
      }).compile();

      adapter = module.get(FastAgentDBAdapter);
      await adapter.onModuleInit();
    });

    it('should store decision in both FastAgentDB and ReflexionMemory', async () => {
      await adapter.store({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        inputHash: 'abc123',
        decision: { accountCode: '4100', vatType: 'STANDARD' },
        confidence: 92,
        source: 'LLM',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledTimes(1);
      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.stringContaining('4100'),
          reward: 0.92,
        }),
      );

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledTimes(1);
      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'categorizer',
          success: true, // 92% >= 80% threshold
        }),
      );
    });

    it('should record correction with negative reward', async () => {
      await adapter.recordCorrection({
        tenantId: 'tenant-123',
        agentDecisionId: 'dec-001',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4200' },
        correctedBy: 'user-001',
      });

      expect(mockFastAgentDB.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          reward: -1.0,
          metadata: expect.objectContaining({ type: 'correction' }),
        }),
      );

      expect(mockReflexionMemory.storeEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          strategy: 'human-correction',
        }),
      );
    });

    it('should return null from getAccuracyStats when not initialized', async () => {
      const uninitAdapter = new FastAgentDBAdapter();
      const stats = await uninitAdapter.getAccuracyStats('tenant-123', 'categorizer');
      expect(stats).toBeNull();
    });

    it('should aggregate stats from FastAgentDB and ReflexionMemory', async () => {
      const stats = await adapter.getAccuracyStats('tenant-123', 'categorizer');
      expect(stats).toEqual({
        totalDecisions: 100,
        reviewedDecisions: 50,
        correctDecisions: 40, // 0.8 * 50
        accuracyRate: 80,     // 0.8 * 100
      });
    });

    it('should gracefully handle store failure without throwing', async () => {
      mockFastAgentDB.storeEpisode.mockRejectedValue(new Error('disk full'));
      // Should not throw
      await expect(
        adapter.store({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
          inputHash: 'abc',
          decision: {},
          confidence: 50,
          source: 'PATTERN',
        }),
      ).resolves.not.toThrow();
    });

    it('should return empty array when searchSimilar has no matches', async () => {
      const results = await adapter.searchSimilarEpisodes(
        new Array(384).fill(0.1),
        5,
      );
      expect(results).toEqual([]);
    });
  });
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks agents make categorization and matching decisions thousands of times
  per month. Currently, each decision is stored in Prisma (PostgreSQL) for compliance
  and audit, but the agents have no way to learn from their own past decisions.
  The `AgentDBStub` discards all memory data.

  With `FastAgentDB`, agents will be able to:
  1. **Search similar past decisions**: "I categorized a similar transaction from
     Woolworths last week as account 4100 — should I do the same?" (vector similarity)
  2. **Learn from corrections**: When a human corrects a decision, the correction is
     stored as a negative-reward episode. Future similar transactions will be influenced.
  3. **Track accuracy over time**: Real statistics from episode rewards, not just
     Prisma record counts.
  4. **Reflect on strategies**: `ReflexionMemory` tracks which strategy (LLM, PATTERN,
     HISTORICAL) worked best for which task type.

  ## SA Compliance Notes
  - All monetary values stored as integers (cents)
  - No PII in episode metadata (only IDs, codes, confidence, correctness)
  - Tenant isolation: episodes must be scoped to tenant in metadata
  - Prisma dual-write MUST be preserved for compliance (POPIA, financial records)

  ## Architectural Decisions
  - **Adapter pattern**: `FastAgentDBAdapter` implements the same interface as the old
    `AgentDBStub` so all existing code in `AgentMemoryService` works unchanged
  - **Dual-write preserved**: Prisma writes are NOT replaced. FastAgentDB is added as
    a parallel write path for agent learning.
  - **Non-blocking**: All FastAgentDB and ReflexionMemory writes use `.catch()` — they
    never block the main request/response flow
  - **Optional injection**: `@Optional() @Inject()` ensures the system degrades gracefully
    if FastAgentDB or ReflexionMemory fail to initialize
  - **LRU eviction at 50k episodes** (configurable): Prevents unbounded memory growth.
    The most recent 50k episodes are kept. Old episodes are evicted.
  - **ReflexionMemory for strategy tracking**: Stores which source (LLM, PATTERN, etc.)
    produced correct vs incorrect decisions, enabling strategy selection.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `FastAgentDBAdapter` implementing `AgentDBInterface` with methods:
      `store()`, `recordCorrection()`, `getAccuracyStats()`, `searchSimilarEpisodes()`,
      `isAvailable()`
    - Create adapter interfaces: `AgentDBInterface`, `AgentDBStoreParams`,
      `AgentDBCorrectionParams`, `AgentDBAccuracyStats`, `AgentDBSimilarEpisode`
    - Integrate ruvector's `FastAgentDB` for episode storage with LRU eviction
    - Integrate `agentic-flow/agentdb`'s `ReflexionMemory` for reflective learning
    - Replace `AgentDBStub` in `agent-memory.service.ts` with injected `FastAgentDBAdapter`
    - Replace `AgentDB` stub in `accuracy-tracker.ts` with injected `FastAgentDBAdapter`
    - Preserve ALL existing Prisma dual-writes in `AgentMemoryService`
    - Register `FastAgentDBAdapter` in `agent-memory.module.ts`
    - Export `FastAgentDBAdapter` for downstream tasks (TASK-STUB-004)
    - Use `@Optional() @Inject()` for all new dependencies
    - Use `.catch()` for all non-critical writes
    - Dynamic imports for ruvector and agentic-flow (lazy loading)
    - Unit tests: store, correction, accuracy stats, similar search, init failure,
      write failure recovery, uninitialised state
    - Build succeeds (`pnpm run build`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - SONA trajectory recording (TASK-STUB-005)
    - GNN pattern learning (TASK-STUB-007)
    - FeedbackLoop integration (TASK-STUB-004 — depends on this task)
    - LearningEngine / routing (TASK-STUB-003)
    - Vector re-indexing
    - Frontend changes
    - Prisma schema changes (existing AgentDecision and CorrectionFeedback tables unchanged)
    - ReasoningBankStub replacement (will be addressed when agentic-flow ReasoningBank works)
    - Batch reprocessing of historical Prisma records into FastAgentDB
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify files exist
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/memory/fast-agentdb.adapter.ts
ls -la apps/api/src/agents/memory/interfaces/fast-agentdb.interface.ts
ls -la apps/api/tests/agents/memory/fast-agentdb.adapter.spec.ts

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run adapter-specific tests
pnpm test -- --testPathPattern="agents/memory/fast-agentdb" --runInBand

# 4. Run all memory tests
pnpm test -- --testPathPattern="agents/memory" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify AgentDBStub removed from agent-memory.service.ts
grep -c "class AgentDBStub" apps/api/src/agents/memory/agent-memory.service.ts
# Expected: 0

# 8. Verify FastAgentDBAdapter is injected
grep "FastAgentDBAdapter" apps/api/src/agents/memory/agent-memory.service.ts
grep "FastAgentDBAdapter" apps/api/src/agents/memory/agent-memory.module.ts

# 9. Verify @Optional() @Inject() pattern
grep -A1 "@Optional" apps/api/src/agents/memory/agent-memory.service.ts | grep "FastAgentDBAdapter"

# 10. Verify non-blocking .catch() pattern
grep "\.catch(" apps/api/src/agents/memory/fast-agentdb.adapter.ts | wc -l
# Expected: >= 4 (store: 2 catches, correction: 2 catches)

# 11. Verify Prisma dual-write preserved
grep "prisma.agentDecision.create" apps/api/src/agents/memory/agent-memory.service.ts
grep "prisma.correctionFeedback.create" apps/api/src/agents/memory/agent-memory.service.ts

# 12. Verify adapter interface exists
grep "AgentDBInterface" apps/api/src/agents/memory/interfaces/fast-agentdb.interface.ts

# 13. Verify accuracy-tracker updated
grep "FastAgentDBAdapter" apps/api/src/agents/shared/accuracy-tracker.ts

# 14. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/memory/fast-agentdb.adapter.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/memory/interfaces/fast-agentdb.interface.ts && echo "FAIL" || echo "PASS"

# 15. Verify dynamic imports
grep "import(" apps/api/src/agents/memory/fast-agentdb.adapter.ts
# Expected: dynamic import of 'ruvector' and 'agentic-flow/agentdb'
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `FastAgentDBAdapter` created implementing `AgentDBInterface`
  - [ ] `FastAgentDBAdapter.store()` writes episodes to both FastAgentDB and ReflexionMemory
  - [ ] `FastAgentDBAdapter.store()` maps confidence (0-100) to reward (0-1)
  - [ ] `FastAgentDBAdapter.store()` includes tenant, agent type, source in episode metadata
  - [ ] `FastAgentDBAdapter.recordCorrection()` stores correction as negative-reward episode
  - [ ] `FastAgentDBAdapter.recordCorrection()` stores ReflexionMemory episode with `success: false`
  - [ ] `FastAgentDBAdapter.getAccuracyStats()` aggregates from FastAgentDB stats + ReflexionMemory task stats
  - [ ] `FastAgentDBAdapter.getAccuracyStats()` returns `null` when not initialized (triggers Prisma fallback)
  - [ ] `FastAgentDBAdapter.searchSimilarEpisodes()` delegates to FastAgentDB vector search
  - [ ] `FastAgentDBAdapter.searchSimilarEpisodes()` returns empty array when not initialized
  - [ ] `FastAgentDBAdapter.isAvailable()` returns initialization state
  - [ ] `FastAgentDBAdapter.onModuleInit()` uses dynamic imports for ruvector and agentic-flow
  - [ ] `FastAgentDBAdapter.onModuleInit()` configures LRU max episodes from env var (default 50k)
  - [ ] `FastAgentDBAdapter.onModuleInit()` gracefully handles import failures (non-fatal)
  - [ ] Adapter interfaces created: `AgentDBInterface`, `AgentDBStoreParams`, `AgentDBCorrectionParams`, `AgentDBAccuracyStats`, `AgentDBSimilarEpisode`
  - [ ] `AgentDBStub` class REMOVED from `agent-memory.service.ts`
  - [ ] `AgentMemoryService` uses injected `FastAgentDBAdapter` via `@Optional() @Inject()`
  - [ ] `AgentMemoryService.storeDecision()` writes to FastAgentDBAdapter with `.catch()` pattern
  - [ ] `AgentMemoryService.recordCorrection()` writes to FastAgentDBAdapter with `.catch()` pattern
  - [ ] `AgentMemoryService.getAccuracyStats()` tries FastAgentDBAdapter before Prisma fallback
  - [ ] ALL existing Prisma writes preserved unchanged in `AgentMemoryService`
  - [ ] `AgentDB` stub REMOVED from `accuracy-tracker.ts`
  - [ ] `AccuracyTracker` uses injected `FastAgentDBAdapter` via `@Optional() @Inject()`
  - [ ] `FastAgentDBAdapter` registered as provider in `agent-memory.module.ts`
  - [ ] `FastAgentDBAdapter` exported from `agent-memory.module.ts`
  - [ ] Unit tests: store decision in both stores
  - [ ] Unit tests: record correction with negative reward
  - [ ] Unit tests: accuracy stats aggregation from both stores
  - [ ] Unit tests: similar episode search
  - [ ] Unit tests: graceful init failure (returns null/empty, does not throw)
  - [ ] Unit tests: graceful write failure (catches error, does not throw)
  - [ ] Unit tests: uninitialised state (isAvailable() returns false, methods no-op)
  - [ ] Test coverage >= 90% for new code
  - [ ] Zero `any` types in new code
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (no regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER remove Prisma dual-writes** — FastAgentDB is an addition to the write path,
    not a replacement. Prisma records are required for compliance (POPIA, financial audit).
  - **NEVER await FastAgentDB/ReflexionMemory writes** in the main request path — always
    use `.catch()` pattern. These are non-critical, fire-and-forget writes.
  - **NEVER use required injection for FastAgentDBAdapter** — always `@Optional() @Inject()`.
    The system must work without FastAgentDB/ReflexionMemory.
  - **NEVER use `any` type** — use proper TypeScript types, generics, or `unknown` with guards
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER store PII in episode metadata** — only IDs, codes, confidence, correctness.
    No account holder names, addresses, phone numbers.
  - **NEVER use floating-point for monetary values** — always integer cents
  - **NEVER make real API calls in tests** — mock all dynamic imports, all external services
  - **NEVER let init failure crash the application** — `onModuleInit()` failure must be
    non-fatal. Log warning and set `initialized = false`.
  - **NEVER use synchronous imports for ruvector or agentic-flow** — always use dynamic
    `import()` to avoid blocking startup and to handle missing packages gracefully
  - **NEVER store episodes without tenant metadata** — every episode must include
    `tenantId` in metadata for tenant isolation
  - **NEVER remove the `ReasoningBankStub`** — it still works as in-memory storage.
    Replacing it with a real ReasoningBank is out of scope (main agentic-flow export is broken).
  - **NEVER directly access `FastAgentDB` or `ReflexionMemory` outside the adapter** —
    all access goes through `FastAgentDBAdapter`. No direct imports of ruvector/agentic-flow
    in `AgentMemoryService` or `AccuracyTracker`.
  - **NEVER set unbounded maxEpisodes** — always configure a cap (default 50k) to prevent
    OOM in production. LRU eviction keeps the most recent episodes.
</anti_patterns>

</task_spec>
