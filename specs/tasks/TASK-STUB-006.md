<task_spec id="TASK-STUB-006" version="2.0">

<metadata>
  <title>ReasoningBank VectorDB Store (Decision Chain Persistence)</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>806</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-REASONING-BANK</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
    <task_ref status="ready">TASK-STUB-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `ReasoningBankStub` in `apps/api/src/agents/memory/agent-memory.service.ts`
  (lines 50-64) has two methods:
  - `store({ decisionId, chain, tenantId })` — stores chain text in an in-memory Map
  - `get(decisionId)` — retrieves chain text from the in-memory Map

  The in-memory Map is ephemeral — all reasoning chains are lost on application restart.
  There is no persistence, no semantic retrieval, and no tenant isolation beyond what
  the caller provides. The `AgentMemoryService` calls `this.reasoningBank.store()` at
  line 168-173 after storing a decision, but the stored chains vanish when the process
  restarts.

  **Gap Analysis:**
  - Reasoning chains (the "why" behind each categorization decision) are not persisted
  - No semantic retrieval: cannot find reasoning chains similar to a given query text
  - No VectorDB-backed storage: chains are in-memory only
  - No tenant isolation at the storage level (only at the caller level)
  - No embedding generation for chain text
  - No `findSimilarReasoning()` capability for semantic search
  - The `ReasoningBankStub` is instantiated directly (`new ReasoningBankStub()`) at
    line 93, not injected — needs to be replaced with an injectable provider
  - The existing JSONL decision logger already records decisions to disk, but NOT the
    full reasoning chain (only `reasoning` as a short string field)

  **Note on ruvector's Rust-level ReasoningBank:**
  ruvector v0.1.96 includes a Rust-native `ReasoningBank` that uses K-means++ clustering
  for trajectory pattern analysis. This operates at a fundamentally different abstraction
  level — it clusters trajectory embeddings, not string reasoning chains. The CrecheBooks
  reasoning chain storage needs key-value persistence (decisionId → chain text) with
  optional semantic search, which is better served by `VectorDB` from ruvector rather
  than the trajectory-focused `ReasoningBank`.

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - Vector DB: `ruvector` v0.1.96 (VectorDB, EmbeddingService for all-MiniLM-L6-v2 384d)
  - Existing Service: `RuvectorService` from `apps/api/src/agents/sdk/ruvector.service.ts`
  - Testing: Jest
  - All monetary values: integers (cents)

  **Existing Code Architecture (agent-memory.service.ts):**
  ```
  class AgentMemoryService {
    private readonly agentDb = new AgentDBStub();          // Line 92
    private readonly reasoningBank = new ReasoningBankStub(); // Line 93 — THIS IS THE TARGET

    constructor(
      @Optional() @Inject(PrismaService) prisma?,
      @Optional() @Inject(RuvectorService) ruvector?,
      @Optional() @Inject(PatternLearner) patternLearner?,
    ) {}

    async storeDecision(params) {
      // ... stores decision ...
      if (reasoningChain) {
        this.reasoningBank.store({ decisionId, chain: reasoningChain, tenantId }); // Line 168-173
      }
    }
  }
  ```

  **Files to Create:**
  - `apps/api/src/agents/memory/vectordb-reasoning-bank.ts` — VectorDB-backed reasoning bank
  - `apps/api/src/agents/memory/interfaces/reasoning-bank.interface.ts` — Type definitions
  - `apps/api/tests/agents/memory/vectordb-reasoning-bank.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/memory/agent-memory.service.ts` — Replace ReasoningBankStub with VectorDBReasoningBank
  - `apps/api/src/agents/memory/agent-memory.module.ts` — Register VectorDBReasoningBank provider
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands:
  ```bash
  pnpm run build
  pnpm test
  pnpm run lint
  ```

  ### 2. VectorDBReasoningBank Class
  The reasoning bank wraps ruvector's `VectorDB` for persistent chain storage with
  semantic retrieval. It implements the `ReasoningBankInterface` matching the stub's
  method signatures:
  ```typescript
  // apps/api/src/agents/memory/vectordb-reasoning-bank.ts
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import { RuvectorService } from '../sdk/ruvector.service';
  import type {
    ReasoningBankInterface,
    StoreChainParams,
    ReasoningChainRecord,
    SimilarReasoningResult,
  } from './interfaces/reasoning-bank.interface';

  /** Injection token for ReasoningBank */
  export const REASONING_BANK_TOKEN = 'REASONING_BANK';

  @Injectable()
  export class VectorDBReasoningBank implements ReasoningBankInterface {
    private readonly logger = new Logger(VectorDBReasoningBank.name);
    private vectorDb: unknown = null;
    private initialized = false;

    constructor(
      @Optional()
      @Inject(RuvectorService)
      private readonly ruvector?: RuvectorService,
    ) {}

    /**
     * Lazy-initialize VectorDB for reasoning chain storage.
     * Uses a dedicated collection per tenant for data isolation.
     */
    private async ensureInitialized(): Promise<boolean> {
      if (this.initialized) return true;
      if (!this.ruvector?.isAvailable()) return false;

      try {
        const { VectorDB } = await import('ruvector');
        this.vectorDb = new VectorDB({
          dimensions: 384, // all-MiniLM-L6-v2 embedding dimension
        });
        this.initialized = true;
        this.logger.log('VectorDBReasoningBank initialized');
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`VectorDB initialization failed (non-fatal): ${msg}`);
        return false;
      }
    }

    /**
     * Store a reasoning chain with its decision ID.
     *
     * Dual-write pattern:
     * 1. Generate embedding from chain text via ruvector EmbeddingService
     * 2. Insert into VectorDB with decisionId + chain text in metadata
     *
     * Non-blocking: errors are caught and logged.
     */
    async store(params: StoreChainParams): Promise<void> {
      const { decisionId, chain, tenantId } = params;
      const ready = await this.ensureInitialized();
      if (!ready || !this.ruvector) {
        this.logger.debug('VectorDB not available — reasoning chain not persisted');
        return;
      }

      try {
        // Serialize chain to string if it is an object
        const chainText = typeof chain === 'string'
          ? chain
          : JSON.stringify(chain);

        // Generate embedding from chain text
        const embedding = await this.ruvector.generateEmbedding(chainText);

        // Insert into tenant-scoped VectorDB collection
        const collection = this.getCollectionName(tenantId);
        await (this.vectorDb as any).insert({
          id: decisionId,
          vector: embedding,
          metadata: {
            decisionId,
            chain: chainText,
            tenantId,
            storedAt: new Date().toISOString(),
          },
          collection,
        });

        this.logger.debug(
          `Reasoning chain stored for decision ${decisionId} in collection ${collection}`,
        );
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Reasoning chain store failed (non-blocking): ${msg}`);
      }
    }

    /**
     * Retrieve a reasoning chain by its exact decision ID.
     *
     * Uses VectorDB metadata filter with exact match on decisionId.
     * Returns null if not found or VectorDB unavailable.
     */
    async get(decisionId: string): Promise<string | null> {
      const ready = await this.ensureInitialized();
      if (!ready) return null;

      try {
        // Search with metadata filter for exact decisionId match
        // We don't need a vector query here — just metadata lookup
        const results = await (this.vectorDb as any).search({
          filter: {
            field: 'decisionId',
            op: 'eq',
            value: decisionId,
          },
          limit: 1,
        });

        if (results && results.length > 0) {
          const metadata = results[0].metadata;
          return metadata?.chain ?? null;
        }

        return null;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Reasoning chain get failed: ${msg}`);
        return null;
      }
    }

    /**
     * Find reasoning chains semantically similar to a query text.
     *
     * This is the NEW method not present in the stub — enables semantic
     * retrieval of past reasoning to inform future decisions.
     *
     * @param queryText - Natural language query to search for
     * @param tenantId - Tenant ID for data isolation
     * @param k - Number of results to return (default: 5)
     * @returns Array of similar reasoning chains with similarity scores
     */
    async findSimilarReasoning(
      queryText: string,
      tenantId: string,
      k: number = 5,
    ): Promise<SimilarReasoningResult[]> {
      const ready = await this.ensureInitialized();
      if (!ready || !this.ruvector) return [];

      try {
        // Generate embedding for query text
        const queryEmbedding = await this.ruvector.generateEmbedding(queryText);

        // Search VectorDB with tenant-scoped collection
        const collection = this.getCollectionName(tenantId);
        const results = await (this.vectorDb as any).search({
          vector: queryEmbedding,
          collection,
          limit: k,
        });

        if (!results || results.length === 0) return [];

        return results.map((r: {
          id: string;
          score: number;
          metadata: Record<string, unknown>;
        }) => ({
          decisionId: String(r.metadata?.decisionId ?? r.id),
          chain: String(r.metadata?.chain ?? ''),
          similarity: r.score,
          storedAt: r.metadata?.storedAt
            ? String(r.metadata.storedAt)
            : undefined,
        }));
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Similar reasoning search failed: ${msg}`);
        return [];
      }
    }

    /**
     * Build tenant-scoped collection name for VectorDB.
     * Each tenant's reasoning chains are stored in a separate collection
     * for complete data isolation.
     */
    private getCollectionName(tenantId: string): string {
      return `reasoning-chains-${tenantId}`;
    }
  }
  ```

  ### 3. ReasoningBank Interface
  ```typescript
  // apps/api/src/agents/memory/interfaces/reasoning-bank.interface.ts

  /**
   * Parameters for storing a reasoning chain.
   */
  export interface StoreChainParams {
    /** Unique decision ID (from Prisma agentDecision.id) */
    decisionId: string;
    /** The reasoning chain — either a string or structured object */
    chain: string | Record<string, unknown>;
    /** Tenant ID for data isolation */
    tenantId: string;
  }

  /**
   * A stored reasoning chain record.
   */
  export interface ReasoningChainRecord {
    /** Decision ID that produced this reasoning */
    decisionId: string;
    /** The reasoning chain text */
    chain: string;
    /** Tenant ID */
    tenantId: string;
    /** When the chain was stored (ISO string) */
    storedAt?: string;
  }

  /**
   * Result from semantic similarity search over reasoning chains.
   */
  export interface SimilarReasoningResult {
    /** Decision ID of the similar reasoning chain */
    decisionId: string;
    /** The reasoning chain text */
    chain: string;
    /** Cosine similarity score (0.0 to 1.0) */
    similarity: number;
    /** When the chain was stored (ISO string) */
    storedAt?: string;
  }

  /**
   * Interface for reasoning chain storage and retrieval.
   * Implemented by VectorDBReasoningBank (production) and the legacy
   * in-memory stub (fallback).
   */
  export interface ReasoningBankInterface {
    /**
     * Store a reasoning chain for a decision.
     * Non-blocking — errors should be caught and logged.
     */
    store(params: StoreChainParams): Promise<void>;

    /**
     * Retrieve a reasoning chain by decision ID.
     * Returns null if not found.
     */
    get(decisionId: string): Promise<string | null>;

    /**
     * Find reasoning chains semantically similar to query text.
     * Returns empty array if VectorDB unavailable.
     *
     * @param queryText - Text to search for similar reasoning
     * @param tenantId - Tenant ID for data isolation
     * @param k - Number of results (default: 5)
     */
    findSimilarReasoning?(
      queryText: string,
      tenantId: string,
      k?: number,
    ): Promise<SimilarReasoningResult[]>;
  }
  ```

  ### 4. Integration into AgentMemoryService
  The `agent-memory.service.ts` must be modified to:
  1. Remove the local `ReasoningBankStub` class (lines 50-64)
  2. Import `VectorDBReasoningBank` and inject it via `@Optional() @Inject()`
  3. Fall back to a minimal in-memory stub if VectorDBReasoningBank is not available

  ```typescript
  // In apps/api/src/agents/memory/agent-memory.service.ts — changes needed:

  // REMOVE: class ReasoningBankStub (lines 50-64)

  // ADD: import
  import { VectorDBReasoningBank, REASONING_BANK_TOKEN } from './vectordb-reasoning-bank';
  import type { ReasoningBankInterface } from './interfaces/reasoning-bank.interface';

  // MODIFY: class AgentMemoryService
  @Injectable()
  export class AgentMemoryService {
    private readonly logger = new Logger(AgentMemoryService.name);
    private readonly agentDb = new AgentDBStub();
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
      @Inject(REASONING_BANK_TOKEN)
      reasoningBank?: ReasoningBankInterface,
    ) {
      // Fallback to minimal in-memory map when VectorDB is unavailable
      this.reasoningBank = reasoningBank ?? {
        store: async () => { /* no-op fallback */ },
        get: async () => null,
      };
    }

    // ... rest of the class unchanged ...
    // The existing calls to this.reasoningBank.store() and this.reasoningBank.get()
    // continue to work because VectorDBReasoningBank implements the same interface.
  }
  ```

  ### 5. Module Registration
  ```typescript
  // apps/api/src/agents/memory/agent-memory.module.ts
  import { Module } from '@nestjs/common';
  import { DatabaseModule } from '../../database/database.module';
  import { SdkAgentModule } from '../sdk/sdk-agent.module';
  import { AgentMemoryService } from './agent-memory.service';
  import { PatternLearner } from './pattern-learner';
  import { VectorDBReasoningBank, REASONING_BANK_TOKEN } from './vectordb-reasoning-bank';

  @Module({
    imports: [DatabaseModule, SdkAgentModule],
    providers: [
      AgentMemoryService,
      PatternLearner,
      VectorDBReasoningBank,
      {
        provide: REASONING_BANK_TOKEN,
        useExisting: VectorDBReasoningBank,
      },
    ],
    exports: [AgentMemoryService, PatternLearner],
  })
  export class AgentMemoryModule {}
  ```

  ### 6. Tenant Isolation Pattern
  Every VectorDB operation MUST be scoped by tenant:
  ```typescript
  // CORRECT — tenant-scoped collection
  const collection = `reasoning-chains-${tenantId}`;
  await vectorDb.insert({ ..., collection });
  await vectorDb.search({ ..., collection });

  // WRONG — single global collection (cross-tenant data leak!)
  // await vectorDb.insert({ ..., collection: 'reasoning-chains' });
  ```

  ### 7. Non-Blocking Write Pattern
  All VectorDB writes MUST be non-blocking. The decision flow must never be delayed
  by reasoning chain storage:
  ```typescript
  // CORRECT — fire-and-forget with .catch()
  this.reasoningBank
    .store({ decisionId: recordId, chain: reasoningChain, tenantId })
    .catch((err: Error) => {
      this.logger.warn(`ReasoningBank store failed: ${err.message}`);
    });

  // WRONG — awaiting the store blocks the decision flow
  // await this.reasoningBank.store({ ... }); // NEVER block on this
  ```

  ### 8. Dual-Write Pattern
  Reasoning chains should be stored in BOTH VectorDB (for semantic retrieval) AND
  the existing JSONL decision log (for auditability). The JSONL log already captures
  the `reasoning` field in decision log entries. This task adds VectorDB persistence
  alongside it, not replacing it.

  ### 9. Embedding Generation
  Chain text is embedded via `RuvectorService.generateEmbedding()` which uses the
  all-MiniLM-L6-v2 model (384 dimensions). The chain text should be the full
  reasoning string, not sanitized (reasoning chains do not contain PII — they contain
  accounting logic explanations).

  ### 10. Testing Pattern
  ```typescript
  describe('VectorDBReasoningBank', () => {
    let bank: VectorDBReasoningBank;
    let mockRuvector: jest.Mocked<RuvectorService>;

    beforeEach(() => {
      mockRuvector = {
        isAvailable: jest.fn().mockReturnValue(true),
        generateEmbedding: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
        searchSimilar: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<RuvectorService>;

      bank = new VectorDBReasoningBank(mockRuvector);
    });

    describe('store', () => {
      it('should not throw when VectorDB is unavailable', async () => {
        mockRuvector.isAvailable.mockReturnValue(false);
        await expect(
          bank.store({
            decisionId: 'dec-1',
            chain: 'Categorized as food because Woolworths is a grocery store',
            tenantId: 'tenant-abc',
          }),
        ).resolves.not.toThrow();
      });

      it('should generate embedding from chain text', async () => {
        // Mock vectorDb insert
        (bank as any).vectorDb = {
          insert: jest.fn().mockResolvedValue(undefined),
        };
        (bank as any).initialized = true;

        await bank.store({
          decisionId: 'dec-1',
          chain: 'Woolworths categorized as 5200 Food & Catering',
          tenantId: 'tenant-abc',
        });

        expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
          'Woolworths categorized as 5200 Food & Catering',
        );
      });

      it('should use tenant-scoped collection', async () => {
        const insertMock = jest.fn().mockResolvedValue(undefined);
        (bank as any).vectorDb = { insert: insertMock };
        (bank as any).initialized = true;

        await bank.store({
          decisionId: 'dec-1',
          chain: 'test chain',
          tenantId: 'tenant-xyz',
        });

        expect(insertMock).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: 'reasoning-chains-tenant-xyz',
          }),
        );
      });

      it('should store decisionId in metadata', async () => {
        const insertMock = jest.fn().mockResolvedValue(undefined);
        (bank as any).vectorDb = { insert: insertMock };
        (bank as any).initialized = true;

        await bank.store({
          decisionId: 'dec-42',
          chain: 'test',
          tenantId: 't1',
        });

        expect(insertMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'dec-42',
            metadata: expect.objectContaining({
              decisionId: 'dec-42',
              chain: 'test',
              tenantId: 't1',
            }),
          }),
        );
      });

      it('should stringify object chains', async () => {
        const insertMock = jest.fn().mockResolvedValue(undefined);
        (bank as any).vectorDb = { insert: insertMock };
        (bank as any).initialized = true;

        await bank.store({
          decisionId: 'dec-1',
          chain: { step1: 'check patterns', step2: 'apply LLM' } as unknown as string,
          tenantId: 't1',
        });

        expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
          JSON.stringify({ step1: 'check patterns', step2: 'apply LLM' }),
        );
      });
    });

    describe('get', () => {
      it('should return null when VectorDB is unavailable', async () => {
        mockRuvector.isAvailable.mockReturnValue(false);
        const result = await bank.get('dec-1');
        expect(result).toBeNull();
      });

      it('should return chain text for exact decisionId match', async () => {
        const searchMock = jest.fn().mockResolvedValue([
          {
            id: 'dec-1',
            score: 1.0,
            metadata: {
              decisionId: 'dec-1',
              chain: 'Found pattern for Woolworths → 5200',
              tenantId: 't1',
            },
          },
        ]);
        (bank as any).vectorDb = { search: searchMock };
        (bank as any).initialized = true;

        const result = await bank.get('dec-1');
        expect(result).toBe('Found pattern for Woolworths → 5200');
      });

      it('should return null when decisionId not found', async () => {
        const searchMock = jest.fn().mockResolvedValue([]);
        (bank as any).vectorDb = { search: searchMock };
        (bank as any).initialized = true;

        const result = await bank.get('nonexistent');
        expect(result).toBeNull();
      });
    });

    describe('findSimilarReasoning', () => {
      it('should return empty array when VectorDB unavailable', async () => {
        mockRuvector.isAvailable.mockReturnValue(false);
        const results = await bank.findSimilarReasoning('test', 't1');
        expect(results).toEqual([]);
      });

      it('should search with tenant-scoped collection', async () => {
        const searchMock = jest.fn().mockResolvedValue([]);
        (bank as any).vectorDb = { search: searchMock };
        (bank as any).initialized = true;

        await bank.findSimilarReasoning('food categorization', 'tenant-abc', 3);

        expect(searchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            collection: 'reasoning-chains-tenant-abc',
            limit: 3,
          }),
        );
      });

      it('should return similarity results with proper shape', async () => {
        const searchMock = jest.fn().mockResolvedValue([
          {
            id: 'dec-1',
            score: 0.92,
            metadata: {
              decisionId: 'dec-1',
              chain: 'Woolworths matched to Food & Catering (5200)',
              storedAt: '2026-01-20T10:00:00Z',
            },
          },
          {
            id: 'dec-2',
            score: 0.87,
            metadata: {
              decisionId: 'dec-2',
              chain: 'Pick n Pay matched to Food & Catering (5200)',
              storedAt: '2026-01-21T10:00:00Z',
            },
          },
        ]);
        (bank as any).vectorDb = { search: searchMock };
        (bank as any).initialized = true;

        const results = await bank.findSimilarReasoning('grocery food', 't1', 5);

        expect(results).toHaveLength(2);
        expect(results[0].decisionId).toBe('dec-1');
        expect(results[0].chain).toContain('Woolworths');
        expect(results[0].similarity).toBe(0.92);
        expect(results[1].similarity).toBe(0.87);
      });

      it('should default k to 5', async () => {
        const searchMock = jest.fn().mockResolvedValue([]);
        (bank as any).vectorDb = { search: searchMock };
        (bank as any).initialized = true;

        await bank.findSimilarReasoning('test', 't1');

        expect(searchMock).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 5 }),
        );
      });
    });
  });

  describe('AgentMemoryService with VectorDBReasoningBank', () => {
    it('should use VectorDBReasoningBank when injected', async () => {
      // Verify that the reasoning bank is called during storeDecision
      const storeSpy = jest.fn().mockResolvedValue(undefined);
      const bank = { store: storeSpy, get: jest.fn() };

      const service = new AgentMemoryService(
        undefined, // prisma
        undefined, // ruvector
        undefined, // patternLearner
        bank as any,
      );

      await service.storeDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputHash: 'hash-1',
        inputText: 'test',
        decision: {},
        confidence: 85,
        source: 'LLM',
        reasoningChain: 'LLM decided this is food',
      });

      // storeSpy should be called (fire-and-forget pattern)
      // Due to async nature, check with a small delay or use jest.advanceTimers
    });

    it('should fall back to no-op when VectorDBReasoningBank is not provided', async () => {
      // @Optional() injection returns undefined — service uses in-line stub
      const service = new AgentMemoryService();
      // Should not throw
      await expect(
        service.storeDecision({
          tenantId: 't1',
          agentType: 'categorizer',
          inputHash: 'h1',
          inputText: 'test',
          decision: {},
          confidence: 80,
          source: 'PATTERN',
        }),
      ).resolves.toBeDefined();
    });
  });
  ```

  ### 11. Monetary Values
  This task does not directly handle monetary values, but reasoning chains may
  reference amounts. ALL amounts in reasoning text are in cents (integers):
  ```typescript
  // CORRECT: reasoning references cents
  chain: 'Transaction of 250000 cents (R2,500) categorized as 5200 Food'

  // WRONG: floating-point in reasoning
  // chain: 'Transaction of R2500.00 categorized as 5200 Food'
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks agents make categorization and matching decisions that affect financial
  records. Understanding WHY a past decision was made is critical for:

  1. **Debugging**: When a categorization is wrong, the reasoning chain shows the
     logic path that led to the error
  2. **Consistency**: Finding similar past reasoning helps ensure consistent treatment
     of similar transactions across time
  3. **Audit trail**: SARS and POPI compliance may require explaining automated
     financial decisions
  4. **Learning**: SONA and GNN components can use reasoning chain patterns to improve
     future decisions

  Currently, reasoning chains are lost on restart because the stub uses an in-memory
  Map. With VectorDB persistence, reasoning chains survive restarts and can be
  semantically searched.

  ## SA Compliance Notes
  - Reasoning chains do NOT contain PII (they contain accounting logic, not personal data)
  - Reasoning chains MAY reference transaction amounts (always in cents/integers)
  - Tenant isolation is legally required (POPI Act) — each tenant's reasoning chains
    must be stored in a separate VectorDB collection
  - SARS audit requirements may require explaining how automated categorization
    decisions were made — reasoning chains provide this capability

  ## Architectural Decisions
  1. **VectorDB over Rust ReasoningBank**: The ruvector Rust-level `ReasoningBank`
     uses K-means++ clustering for trajectory patterns — a different abstraction than
     string-based reasoning chain storage. VectorDB better fits the key-value + semantic
     search pattern needed here.
  2. **Tenant-scoped collections**: Each tenant gets its own VectorDB collection
     (`reasoning-chains-{tenantId}`) for complete data isolation
  3. **Non-blocking writes**: Reasoning chain storage never blocks the decision flow.
     All writes use `.catch()` fire-and-forget pattern.
  4. **Dual-write**: Reasoning chains are stored in VectorDB (semantic retrieval) AND
     JSONL log (audit trail). Neither replaces the other.
  5. **Backward compatible**: The `ReasoningBankInterface` matches the existing stub's
     method signatures (`store()` and `get()`), plus adds the new `findSimilarReasoning()`
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `VectorDBReasoningBank` class implementing `ReasoningBankInterface`
    - Implement `store({ decisionId, chain, tenantId })` with VectorDB persistence + embedding generation
    - Implement `get(decisionId)` with VectorDB metadata filter (exact match)
    - Implement `findSimilarReasoning(queryText, tenantId, k)` for semantic retrieval (NEW method)
    - Create `ReasoningBankInterface` with `store()`, `get()`, and optional `findSimilarReasoning()`
    - Create `StoreChainParams`, `ReasoningChainRecord`, `SimilarReasoningResult` interfaces
    - Create `REASONING_BANK_TOKEN` injection token
    - Tenant isolation via `reasoning-chains-{tenantId}` collection naming
    - Non-blocking write pattern (`.catch()` fire-and-forget)
    - Lazy VectorDB initialization via `import('ruvector')`
    - Modify `agent-memory.service.ts`: remove `ReasoningBankStub`, inject `VectorDBReasoningBank`
    - Modify `agent-memory.module.ts`: register `VectorDBReasoningBank` and `REASONING_BANK_TOKEN`
    - Fallback to minimal no-op stub when VectorDB is unavailable (`@Optional()`)
    - Handle object chains (JSON.stringify before embedding)
    - Unit tests: store (VectorDB available, unavailable, tenant scoping, metadata)
    - Unit tests: get (found, not found, unavailable)
    - Unit tests: findSimilarReasoning (results, empty, unavailable, tenant scoping)
    - Integration tests: AgentMemoryService with VectorDBReasoningBank
    - All existing AgentMemoryService tests still pass
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
  </in_scope>

  <out_of_scope>
    - SONA ReasoningBank (K-means++ trajectory clustering — different abstraction level)
    - Reasoning chain analytics or dashboards
    - Reasoning chain deletion or expiration
    - Cross-tenant reasoning chain comparison (prohibited by POPI)
    - Reasoning chain compression or summarization
    - Real database integration tests (use mock VectorDB and RuvectorService)
    - Changing JSONL decision log format (keep existing, this is additive)
    - Batch embedding generation for historical chains (migration task)
    - Cost tracking for embedding generation
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/memory/vectordb-reasoning-bank.ts
ls -la apps/api/src/agents/memory/interfaces/reasoning-bank.interface.ts
ls -la apps/api/tests/agents/memory/vectordb-reasoning-bank.spec.ts

# 2. Build succeeds
cd apps/api && pnpm run build

# 3. Run VectorDBReasoningBank tests
pnpm test -- --testPathPattern="vectordb-reasoning-bank" --runInBand

# 4. Run existing agent-memory tests (regression check)
pnpm test -- --testPathPattern="agent-memory" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify ReasoningBankStub is removed from agent-memory.service.ts
grep -n "class ReasoningBankStub" apps/api/src/agents/memory/agent-memory.service.ts && echo "FAIL: stub still present" || echo "PASS: stub removed"

# 8. Verify VectorDBReasoningBank implements interface
grep -n "implements ReasoningBankInterface" apps/api/src/agents/memory/vectordb-reasoning-bank.ts

# 9. Verify tenant isolation — collection names include tenantId
grep -n "reasoning-chains-" apps/api/src/agents/memory/vectordb-reasoning-bank.ts

# 10. Verify no 'any' types in interfaces
grep -rn ": any" apps/api/src/agents/memory/interfaces/reasoning-bank.interface.ts && echo "FAIL" || echo "PASS"

# 11. Verify non-blocking pattern
grep -n "\.catch(" apps/api/src/agents/memory/vectordb-reasoning-bank.ts

# 12. Verify @Optional() @Inject() pattern
grep -n "@Optional()" apps/api/src/agents/memory/agent-memory.service.ts | head -5

# 13. Verify REASONING_BANK_TOKEN is exported
grep "REASONING_BANK_TOKEN" apps/api/src/agents/memory/vectordb-reasoning-bank.ts

# 14. Verify module registration
grep "VectorDBReasoningBank" apps/api/src/agents/memory/agent-memory.module.ts
grep "REASONING_BANK_TOKEN" apps/api/src/agents/memory/agent-memory.module.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `VectorDBReasoningBank` class created implementing `ReasoningBankInterface`
  - [ ] `VectorDBReasoningBank.store()` generates embedding from chain text and inserts into VectorDB
  - [ ] `VectorDBReasoningBank.store()` uses tenant-scoped collection (`reasoning-chains-{tenantId}`)
  - [ ] `VectorDBReasoningBank.store()` stores `decisionId`, `chain`, `tenantId`, `storedAt` in metadata
  - [ ] `VectorDBReasoningBank.store()` handles object chains (JSON.stringify)
  - [ ] `VectorDBReasoningBank.store()` is non-blocking — errors caught and logged, never thrown
  - [ ] `VectorDBReasoningBank.store()` returns gracefully when VectorDB unavailable
  - [ ] `VectorDBReasoningBank.get()` retrieves chain text by exact decisionId metadata filter
  - [ ] `VectorDBReasoningBank.get()` returns `null` when not found
  - [ ] `VectorDBReasoningBank.get()` returns `null` when VectorDB unavailable
  - [ ] `VectorDBReasoningBank.findSimilarReasoning()` generates query embedding and searches VectorDB
  - [ ] `VectorDBReasoningBank.findSimilarReasoning()` uses tenant-scoped collection
  - [ ] `VectorDBReasoningBank.findSimilarReasoning()` returns `SimilarReasoningResult[]` with decisionId, chain, similarity
  - [ ] `VectorDBReasoningBank.findSimilarReasoning()` defaults k to 5
  - [ ] `VectorDBReasoningBank.findSimilarReasoning()` returns empty array when VectorDB unavailable
  - [ ] VectorDB is lazy-initialized via `import('ruvector')` (not top-level)
  - [ ] VectorDB uses 384 dimensions (matching all-MiniLM-L6-v2 embedding model)
  - [ ] `ReasoningBankInterface` created with `store()`, `get()`, and optional `findSimilarReasoning()`
  - [ ] `StoreChainParams` interface created with `decisionId`, `chain`, `tenantId`
  - [ ] `ReasoningChainRecord` interface created with all fields
  - [ ] `SimilarReasoningResult` interface created with `decisionId`, `chain`, `similarity`, `storedAt`
  - [ ] `REASONING_BANK_TOKEN` injection token exported
  - [ ] `ReasoningBankStub` class REMOVED from `agent-memory.service.ts`
  - [ ] `AgentMemoryService` constructor accepts `@Optional() @Inject(REASONING_BANK_TOKEN)` parameter
  - [ ] `AgentMemoryService` falls back to no-op stub when `VectorDBReasoningBank` not provided
  - [ ] `agent-memory.module.ts` registers `VectorDBReasoningBank` and `REASONING_BANK_TOKEN`
  - [ ] `agent-memory.module.ts` imports `SdkAgentModule` for `RuvectorService`
  - [ ] All existing `AgentMemoryService` tests still pass (zero regressions)
  - [ ] Existing JSONL decision logging is NOT modified (dual-write, additive)
  - [ ] Unit tests: store — VectorDB available (embedding + insert), unavailable (graceful), tenant scoping, metadata
  - [ ] Unit tests: get — found (returns chain), not found (returns null), unavailable (returns null)
  - [ ] Unit tests: findSimilarReasoning — results (proper shape), empty, unavailable, tenant scoping, default k
  - [ ] Integration tests: AgentMemoryService with VectorDBReasoningBank (injected), without (fallback)
  - [ ] Test coverage >= 90% for new files
  - [ ] Zero `any` types in interface files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER expose reasoning chains across tenants** — every VectorDB operation MUST use tenant-scoped collections (`reasoning-chains-{tenantId}`). This is a POPI Act legal requirement.
  - **NEVER block the decision flow on reasoning chain storage** — all writes use `.catch()` fire-and-forget. A VectorDB failure must never delay or prevent agent decisions.
  - **NEVER use a single global VectorDB collection** for all tenants — each tenant gets its own collection
  - **NEVER use `any` type** — use proper TypeScript interfaces from `reasoning-bank.interface.ts`
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER use a top-level `import` for ruvector** — use `import('ruvector')` lazy loading
  - **NEVER replace the JSONL decision log with VectorDB** — this is additive (dual-write), not replacement
  - **NEVER store PII in reasoning chains** — chains contain accounting logic, not personal data. If caller passes PII, it is the caller's responsibility to sanitize.
  - **NEVER make the `findSimilarReasoning()` method required in the interface** — mark it optional (`?`) for backward compatibility with the stub
  - **NEVER make real API calls in tests** — always mock `RuvectorService` and VectorDB
  - **NEVER throw from `store()` or `get()` methods** — always return gracefully (`undefined` / `null`)
  - **NEVER use `findFirst` without tenant context** — all queries must be tenant-scoped
  - **NEVER modify the existing `computeInputHash()` function** — it is out of scope
  - **NEVER use floating-point for monetary values** referenced in reasoning chains — always integer cents
  - **NEVER confuse ruvector's Rust-level `ReasoningBank` with this VectorDB-based store** — they operate at different abstraction levels (trajectory clustering vs. key-value chain persistence)
</anti_patterns>

</task_spec>
