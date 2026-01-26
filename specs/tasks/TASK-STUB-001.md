<task_spec id="TASK-STUB-001" version="2.0">

<metadata>
  <title>EmbeddingService Real Provider Setup</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>foundation</layer>
  <sequence>801</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-STUB-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The existing `RuvectorService` at `apps/api/src/agents/sdk/ruvector.service.ts`
  dynamically imports `ruvector` and attempts to create an embedding service using
  `createEmbeddingService()` or `new EmbeddingService()`. However, the default
  provider that ruvector ships is `LocalNGramProvider`, which only performs character
  n-gram hashing into a 256-dimensional space. This is NOT semantic: "Woolworths
  Food" and "Woolworths Foods" may hash to very different vectors. For the agent
  memory system (TASK-STUB-002), learning router (TASK-STUB-003), and feedback loop
  (TASK-STUB-004) to work, we need real semantic embeddings where semantically
  similar transaction descriptions produce nearby vectors.

  **Gap Analysis:**
  - No real semantic embedding provider registered with ruvector's `EmbeddingService`
  - The `RuvectorService.generateEmbedding()` method currently uses the default
    `LocalNGramProvider` which produces non-semantic 256d n-gram hash vectors
  - No VectorDB persistence configured (no `storagePath` option) — all vectors
    are lost on restart
  - No tenant-scoped collection management — all vectors go into a single namespace
  - No fallback chain: if ruvector fails, there is no secondary embedding source
  - The `.env.example` has no `RUVECTOR_STORAGE_PATH` or `EMBEDDING_PROVIDER` vars
  - No `RequestyEmbeddingProvider` to leverage the existing Requesty.ai proxy
    already configured in Railway (`ANTHROPIC_BASE_URL=https://router.requesty.ai/v1`)

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm (NEVER npm)
  - Language: TypeScript (strict mode)
  - Testing: Jest
  - ruvector v0.1.96: Already installed. Exports `VectorDB`, `EmbeddingService`,
    `createEmbeddingService`. EmbeddingService has pluggable provider architecture
    with `registerProvider()`, built-in LRU cache (10k entries, 1h TTL).
  - Requesty.ai proxy: Already configured in Railway as
    `ANTHROPIC_BASE_URL=https://router.requesty.ai/v1` — supports Voyage/OpenAI
    embedding endpoints via `/v1/embeddings`
  - Railway deployment: linux-x64-gnu, NAPI binaries available

  **Files to Create:**
  - `apps/api/src/agents/sdk/embedding-provider.ts` — `RequestyEmbeddingProvider`
    implementing ruvector's `EmbeddingProvider` interface, plus `OnnxFallbackProvider`
  - `apps/api/src/agents/sdk/interfaces/embedding.interface.ts` — CrecheBooks-specific
    embedding interfaces and types
  - `apps/api/tests/agents/sdk/embedding-provider.spec.ts` — Unit tests for providers

  **Files to Modify:**
  - `apps/api/src/agents/sdk/ruvector.service.ts` — Register real provider, configure
    `storagePath` for ACID persistence, add tenant-scoped collection management
  - `apps/api/src/agents/sdk/sdk-agent.module.ts` — Ensure `RuvectorService` properly
    initialized with embedding provider configuration
  - `apps/api/src/agents/sdk/index.ts` — Export new embedding types
  - `apps/api/.env.example` — Add `RUVECTOR_STORAGE_PATH`, `EMBEDDING_PROVIDER`,
    `REQUESTY_EMBEDDING_MODEL` env vars
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

  ### 2. EmbeddingProvider Interface from ruvector
  ruvector's `EmbeddingService` accepts pluggable providers. Each provider must
  implement this interface:
  ```typescript
  /**
   * ruvector EmbeddingProvider interface.
   * Implementations MUST be stateless and thread-safe.
   */
  export interface EmbeddingProvider {
    /** Unique name for this provider (used in registerProvider/selectProvider) */
    readonly name: string;
    /** Generate embeddings for a batch of texts */
    embed(texts: string[]): Promise<number[][]>;
    /** Return the dimensionality of the output vectors */
    getDimensions(): number;
  }
  ```

  ### 3. RequestyEmbeddingProvider Implementation
  Calls the Requesty.ai proxy for real semantic embeddings:
  ```typescript
  import { Logger } from '@nestjs/common';

  export class RequestyEmbeddingProvider implements EmbeddingProvider {
    readonly name = 'requesty';
    private readonly logger = new Logger(RequestyEmbeddingProvider.name);
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly model: string;
    private readonly dimensions: number;

    constructor(config: {
      baseUrl: string;      // e.g. 'https://router.requesty.ai/v1'
      apiKey: string;       // ANTHROPIC_API_KEY or dedicated EMBEDDING_API_KEY
      model?: string;       // default: 'voyage-3-lite' (1024d, cheap)
      dimensions?: number;  // default: 1024
    }) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, '');
      this.apiKey = config.apiKey;
      this.model = config.model ?? 'voyage-3-lite';
      this.dimensions = config.dimensions ?? 1024;
    }

    getDimensions(): number {
      return this.dimensions;
    }

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        throw new Error(
          `Requesty embedding request failed (${String(response.status)}): ${errorBody}`,
        );
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to maintain input order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    }
  }
  ```

  ### 4. OnnxFallbackProvider (Offline Fallback)
  Uses ruvector's built-in ONNX WASM embedder as offline fallback:
  ```typescript
  /**
   * Wraps ruvector's built-in OnnxEmbedder for offline/fallback usage.
   * Model: all-MiniLM-L6-v2, 384 dimensions.
   * NOTE: This is a WASM-based local model — no API calls needed.
   */
  export class OnnxFallbackProvider implements EmbeddingProvider {
    readonly name = 'onnx-fallback';
    private readonly logger = new Logger(OnnxFallbackProvider.name);
    private onnxEmbedder: { embed: (texts: string[]) => Promise<number[][]> } | null = null;
    private initPromise: Promise<void> | null = null;

    getDimensions(): number {
      return 384; // all-MiniLM-L6-v2
    }

    async embed(texts: string[]): Promise<number[][]> {
      if (!this.onnxEmbedder) {
        if (!this.initPromise) {
          this.initPromise = this.initialize();
        }
        await this.initPromise;
      }

      if (!this.onnxEmbedder) {
        throw new Error('ONNX embedder failed to initialize');
      }

      return this.onnxEmbedder.embed(texts);
    }

    private async initialize(): Promise<void> {
      try {
        // Dynamic import to avoid loading WASM at startup
        const ruvector = await import('ruvector');
        if ('OnnxEmbedder' in ruvector) {
          const OnnxEmbedder = (ruvector as Record<string, unknown>)['OnnxEmbedder'] as
            new () => { embed: (texts: string[]) => Promise<number[][]> };
          this.onnxEmbedder = new OnnxEmbedder();
        } else {
          this.logger.warn('OnnxEmbedder not available in ruvector — ONNX fallback disabled');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`ONNX embedder init failed: ${msg}`);
      }
    }
  }
  ```

  ### 5. Provider Registration and Fallback Chain
  Register providers with ruvector's `EmbeddingService` in priority order:
  ```typescript
  // In RuvectorService.onModuleInit():

  // 1. Create EmbeddingService
  const embeddingService = ruvectorModule.createEmbeddingService
    ? ruvectorModule.createEmbeddingService()
    : new ruvectorModule.EmbeddingService!();

  // 2. Register providers in priority order
  const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
  const baseUrl = this.configService.get<string>('ANTHROPIC_BASE_URL')
    ?? 'https://router.requesty.ai/v1';
  const embeddingModel = this.configService.get<string>('REQUESTY_EMBEDDING_MODEL')
    ?? 'voyage-3-lite';

  if (apiKey) {
    const requestyProvider = new RequestyEmbeddingProvider({
      baseUrl,
      apiKey,
      model: embeddingModel,
    });
    embeddingService.registerProvider(requestyProvider);
    this.logger.log(`Registered RequestyEmbeddingProvider (model=${embeddingModel})`);
  }

  // 3. Register ONNX fallback (no API key needed)
  const onnxProvider = new OnnxFallbackProvider();
  embeddingService.registerProvider(onnxProvider);

  // 4. LocalNGramProvider is always available as last resort (built-in default)

  // 5. Select the best available provider
  const providerPreference = this.configService.get<string>('EMBEDDING_PROVIDER')
    ?? (apiKey ? 'requesty' : 'onnx-fallback');
  embeddingService.selectProvider(providerPreference);
  ```

  ### 6. VectorDB with ACID Persistence
  Configure VectorDB with `storagePath` for on-disk persistence via redb:
  ```typescript
  // VectorDB with persistence — survives restarts
  const storagePath = this.configService.get<string>('RUVECTOR_STORAGE_PATH')
    ?? './data/vectors.db';

  this.vectorDb = new VectorDbClass({
    dimensions: this.getActiveDimensions(), // Matches active provider
    distanceMetric: 'cosine',
    storagePath,                            // ACID on-disk via redb
  });
  ```

  ### 7. Tenant-Scoped Collection Management
  Use collection name prefixing for multi-tenant isolation:
  ```typescript
  /**
   * Get a tenant-scoped collection name.
   * Format: `{collectionType}-{tenantId}`
   *
   * @example getTenantCollection('decisions', 'bdff4374-...') => 'decisions-bdff4374-...'
   */
  getTenantCollection(collectionType: string, tenantId: string): string {
    return `${collectionType}-${tenantId}`;
  }

  /**
   * Insert a vector into a tenant-scoped collection.
   */
  async insertVector(
    collectionType: string,
    tenantId: string,
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.initialized || !this.vectorDb) {
      throw new Error('Ruvector not initialized');
    }

    const collection = this.getTenantCollection(collectionType, tenantId);
    await this.vectorDb.insert({
      id,
      vector,
      metadata: { ...metadata, _collection: collection, _tenantId: tenantId },
    });
  }

  /**
   * Search within a tenant-scoped collection.
   */
  async searchTenantCollection(
    collectionType: string,
    tenantId: string,
    queryVector: number[],
    limit: number = 5,
  ): Promise<RuvectorSearchResult[]> {
    if (!this.initialized || !this.vectorDb) {
      throw new Error('Ruvector not initialized');
    }

    const collection = this.getTenantCollection(collectionType, tenantId);
    const results = await this.vectorDb.search({
      vector: queryVector,
      k: limit * 2, // Over-fetch then filter by tenant
      filter: { _collection: collection },
    });

    return results.slice(0, limit).map((r) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata,
    }));
  }
  ```

  ### 8. CrecheBooks Embedding Interfaces
  ```typescript
  // apps/api/src/agents/sdk/interfaces/embedding.interface.ts

  /**
   * Supported embedding providers for CrecheBooks.
   * - 'requesty': Requesty.ai proxy (Voyage/OpenAI, 1024d, semantic)
   * - 'onnx-fallback': Local ONNX WASM (all-MiniLM-L6-v2, 384d, semantic)
   * - 'local-ngram': Built-in n-gram hashing (256d, non-semantic, last resort)
   */
  export type EmbeddingProviderType = 'requesty' | 'onnx-fallback' | 'local-ngram';

  /** Configuration for embedding provider selection */
  export interface EmbeddingConfig {
    /** Active provider name */
    provider: EmbeddingProviderType;
    /** Dimensionality of the active provider */
    dimensions: number;
    /** Whether real semantic embeddings are available */
    isSemantic: boolean;
    /** Base URL for API-based providers */
    baseUrl?: string;
    /** Model identifier for API-based providers */
    model?: string;
  }

  /** Result of an embedding operation */
  export interface EmbeddingResult {
    /** The embedding vector */
    vector: number[];
    /** Provider that generated this embedding */
    provider: EmbeddingProviderType;
    /** Dimensionality */
    dimensions: number;
    /** Generation time in ms */
    durationMs: number;
  }

  /** Options for vector insertion */
  export interface VectorInsertOptions {
    /** Collection type (e.g. 'decisions', 'episodes', 'patterns') */
    collectionType: string;
    /** Tenant ID for isolation */
    tenantId: string;
    /** Unique vector ID */
    id: string;
    /** The vector to store */
    vector: number[];
    /** Associated metadata */
    metadata?: Record<string, unknown>;
  }
  ```

  ### 9. Graceful Fallback Chain
  The embedding provider MUST gracefully degrade through the fallback chain:
  ```
  RequestyEmbeddingProvider (1024d, semantic, API-based)
    |  failure? (network error, rate limit, no API key)
    v
  OnnxFallbackProvider (384d, semantic, local WASM)
    |  failure? (WASM not available, init error)
    v
  LocalNGramProvider (256d, non-semantic, built-in default)
  ```

  Implementation in `generateEmbedding()`:
  ```typescript
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    if (!this.initialized) {
      throw new Error('Ruvector is not initialized');
    }

    const startMs = Date.now();

    // Try active provider first
    try {
      const embedding = await this.embeddingService!.embedOne(text);
      return {
        vector: embedding,
        provider: this.activeProvider,
        dimensions: embedding.length,
        durationMs: Date.now() - startMs,
      };
    } catch (primaryErr: unknown) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      this.logger.warn(`Primary embedding provider (${this.activeProvider}) failed: ${msg}`);
    }

    // Try fallback providers in order
    for (const fallback of this.fallbackProviders) {
      try {
        const embedding = await fallback.embed([text]);
        if (embedding.length > 0 && embedding[0].length > 0) {
          this.logger.debug(`Used fallback provider: ${fallback.name}`);
          return {
            vector: embedding[0],
            provider: fallback.name as EmbeddingProviderType,
            dimensions: embedding[0].length,
            durationMs: Date.now() - startMs,
          };
        }
      } catch {
        continue; // Try next fallback
      }
    }

    throw new Error('All embedding providers failed');
  }
  ```

  ### 10. LRU Cache — Built Into EmbeddingService
  ruvector's `EmbeddingService` has a built-in LRU cache (10k entries, 1h TTL).
  Do NOT implement custom caching:
  ```typescript
  // CORRECT: Let ruvector handle caching
  const embedding = await this.embeddingService.embedOne(text);

  // WRONG: Do NOT build a custom cache
  // const cached = this.cache.get(text);
  // if (cached) return cached;
  // NEVER DO THIS — ruvector's LRU cache already handles it
  ```

  ### 11. Environment Variables
  Add these to `.env.example`:
  ```bash
  # ── Ruvector Embedding Provider ────────────────────────────────────
  # EMBEDDING_PROVIDER=requesty                  # Options: requesty, onnx-fallback, local-ngram
  # REQUESTY_EMBEDDING_MODEL=voyage-3-lite       # Embedding model via Requesty proxy
  # RUVECTOR_STORAGE_PATH=./data/vectors.db      # ACID on-disk vector storage path
  ```

  ### 12. Testing Pattern — Mock Everything, No Real API Calls
  ```typescript
  describe('RequestyEmbeddingProvider', () => {
    let provider: RequestyEmbeddingProvider;
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
      provider = new RequestyEmbeddingProvider({
        baseUrl: 'https://router.requesty.ai/v1',
        apiKey: 'test-api-key',
        model: 'voyage-3-lite',
        dimensions: 1024,
      });

      // Mock global fetch
      fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: new Array(1024).fill(0.1), index: 0 },
          ],
        }),
        text: async () => '',
      } as Response);
    });

    afterEach(() => {
      fetchMock.mockRestore();
    });

    it('should embed a single text', async () => {
      const result = await provider.embed(['test transaction']);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1024);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://router.requesty.ai/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('should embed multiple texts in a single batch', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: new Array(1024).fill(0.2), index: 1 },
            { embedding: new Array(1024).fill(0.1), index: 0 },
          ],
        }),
        text: async () => '',
      } as Response);

      const result = await provider.embed(['text one', 'text two']);
      expect(result).toHaveLength(2);
      // Verify sorted by index
      expect(result[0][0]).toBe(0.1); // index 0
      expect(result[1][0]).toBe(0.2); // index 1
    });

    it('should return empty array for empty input', async () => {
      const result = await provider.embed([]);
      expect(result).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw on non-OK response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      } as Response);

      await expect(provider.embed(['test'])).rejects.toThrow(
        'Requesty embedding request failed (429)',
      );
    });

    it('should report correct dimensions', () => {
      expect(provider.getDimensions()).toBe(1024);
      expect(provider.name).toBe('requesty');
    });
  });

  describe('RuvectorService (with real providers)', () => {
    let service: RuvectorService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({
            RUVECTOR_ENABLED: 'true',
            ANTHROPIC_API_KEY: 'test-key',
            RUVECTOR_STORAGE_PATH: ':memory:', // In-memory for tests
          })],
        })],
        providers: [RuvectorService],
      }).compile();

      service = module.get(RuvectorService);
    });

    it('should generate embedding with fallback chain', async () => {
      // Mock the provider chain
      const mockEmbedding = new Array(1024).fill(0.5);
      jest.spyOn(service as any, 'embeddingService', 'get')
        .mockReturnValue({
          embedOne: jest.fn().mockResolvedValue(mockEmbedding),
        });

      const result = await service.generateEmbedding('Woolworths Foods');
      expect(result.vector).toHaveLength(1024);
      expect(result.provider).toBeDefined();
    });

    it('should create tenant-scoped collection names', () => {
      const name = service.getTenantCollection('decisions', 'tenant-123');
      expect(name).toBe('decisions-tenant-123');
    });
  });
  ```

  ### 13. Dimension Mismatch Handling
  When switching providers (e.g., Requesty 1024d to ONNX 384d), the VectorDB
  dimensions may not match. Handle this gracefully:
  ```typescript
  /**
   * Get the dimensionality of the currently active embedding provider.
   * Used to configure VectorDB dimensions and validate inserts.
   */
  getActiveDimensions(): number {
    if (!this.embeddingService) {
      return 384; // Default: ONNX dimensions
    }
    // Return dimensions from active provider
    return this.activeProviderDimensions;
  }

  /**
   * Validate that a vector matches the expected dimensions.
   * Throws if mismatched to prevent corrupt data in VectorDB.
   */
  private validateDimensions(vector: number[], expectedDims: number): void {
    if (vector.length !== expectedDims) {
      throw new Error(
        `Dimension mismatch: vector has ${String(vector.length)} dims, ` +
        `expected ${String(expectedDims)}. Provider may have changed.`,
      );
    }
  }
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  The platform has 5 AI agents that process bank transactions, match payments, validate
  document extractions, and handle SARS compliance. These agents need real semantic
  embeddings to:

  1. **Find similar past transactions**: When categorizing "Woolworths Foods" the system
     should find past decisions for "Woolworths Food", "Woolworths", and "Pick n Pay"
     (similar grocery stores). Character n-gram hashing cannot do this.
  2. **Support agent learning**: FastAgentDB (TASK-STUB-002) uses vector similarity to
     retrieve relevant past episodes. Non-semantic vectors make this useless.
  3. **Enable routing intelligence**: LearningEngine (TASK-STUB-003) uses state
     representations that benefit from semantic clustering.

  ## SA Compliance Notes
  - All monetary values are stored as integers (cents) — never floating-point
  - No PII should be included in embedding input text (use sanitized descriptions)
  - Tenant isolation MUST be maintained — no cross-tenant vector searches

  ## Architectural Decisions
  - **Requesty.ai proxy as primary provider**: Already configured in Railway
    (`ANTHROPIC_BASE_URL=https://router.requesty.ai/v1`). Supports Voyage and
    OpenAI embedding models via proxy. Cost-effective for CrecheBooks volumes.
  - **ONNX WASM as offline fallback**: ruvector includes all-MiniLM-L6-v2 (384d) as
    WASM binary. Works offline, no API key needed. Good for development/testing.
  - **LocalNGramProvider as last resort**: Always available, never fails. Non-semantic
    but provides a vector for storage. Better than crashing.
  - **redb for ACID persistence**: ruvector's `storagePath` option uses redb for
    on-disk storage. Survives restarts, crash-safe.
  - **ruvector's built-in LRU cache**: 10k entries, 1h TTL. No custom caching needed.
  - **Dimension-aware VectorDB**: The VectorDB must match the active provider's
    dimensions. Switching providers may require re-indexing (handled in future task).
  - **ShadowRunner compatibility**: SHADOW mode tenant `bdff4374-64d5-420c-b454-8e85e9df552a`
    already wired into all agents. Embedding provider must not interfere with shadow runs.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `RequestyEmbeddingProvider` implementing ruvector's `EmbeddingProvider` interface
    - Create `OnnxFallbackProvider` wrapping ruvector's built-in ONNX WASM embedder
    - Create CrecheBooks-specific embedding interfaces (`EmbeddingConfig`, `EmbeddingResult`,
      `VectorInsertOptions`, `EmbeddingProviderType`)
    - Modify `RuvectorService` to register providers, configure fallback chain, add
      `storagePath` for ACID persistence, add tenant-scoped collection methods
    - Add `insertVector()`, `searchTenantCollection()`, `getTenantCollection()`,
      `getActiveDimensions()` methods to `RuvectorService`
    - Change `generateEmbedding()` return type from `number[]` to `EmbeddingResult`
    - Preserve backward compatibility: existing `searchSimilar()` method still works
    - Add environment variables to `.env.example`
    - Export new types from `index.ts` barrel
    - Unit tests for `RequestyEmbeddingProvider` (fetch mocked, batch ordering, error handling)
    - Unit tests for `OnnxFallbackProvider` (dynamic import mocked, init failure graceful)
    - Unit tests for `RuvectorService` (provider registration, fallback chain, tenant collections,
      dimension validation, persistence config)
    - All tests mock everything — zero real API calls, zero real file I/O
    - Build succeeds (`pnpm run build`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - FastAgentDB integration (TASK-STUB-002)
    - LearningEngine integration (TASK-STUB-003)
    - FeedbackLoop integration (TASK-STUB-004)
    - SONA / SonaEngine integration (TASK-STUB-005)
    - GNN pattern learning (TASK-STUB-007)
    - Vector re-indexing when switching providers (future task)
    - Embedding dimension reduction / projection
    - Frontend changes
    - Rate limiting for embedding API calls
    - Cost tracking for embedding API usage
    - PostgreSQL pgvector extension setup
    - Cluster/Raft consensus for VectorDB
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify files exist
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/sdk/embedding-provider.ts
ls -la apps/api/src/agents/sdk/interfaces/embedding.interface.ts
ls -la apps/api/tests/agents/sdk/embedding-provider.spec.ts

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run embedding-specific tests
pnpm test -- --testPathPattern="agents/sdk/embedding-provider" --runInBand

# 4. Run all SDK tests to confirm no regressions
pnpm test -- --testPathPattern="agents/sdk" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify RuvectorService has new methods
grep "insertVector" apps/api/src/agents/sdk/ruvector.service.ts
grep "searchTenantCollection" apps/api/src/agents/sdk/ruvector.service.ts
grep "getTenantCollection" apps/api/src/agents/sdk/ruvector.service.ts
grep "getActiveDimensions" apps/api/src/agents/sdk/ruvector.service.ts
grep "generateEmbedding" apps/api/src/agents/sdk/ruvector.service.ts

# 8. Verify provider registration in onModuleInit
grep "registerProvider" apps/api/src/agents/sdk/ruvector.service.ts
grep "RequestyEmbeddingProvider" apps/api/src/agents/sdk/ruvector.service.ts
grep "OnnxFallbackProvider" apps/api/src/agents/sdk/ruvector.service.ts

# 9. Verify env vars in .env.example
grep "RUVECTOR_STORAGE_PATH" apps/api/.env.example
grep "EMBEDDING_PROVIDER" apps/api/.env.example
grep "REQUESTY_EMBEDDING_MODEL" apps/api/.env.example

# 10. Verify storagePath configuration
grep "storagePath" apps/api/src/agents/sdk/ruvector.service.ts

# 11. Verify tenant collection pattern
grep "tenantId" apps/api/src/agents/sdk/ruvector.service.ts | head -5

# 12. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/sdk/embedding-provider.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/sdk/interfaces/embedding.interface.ts && echo "FAIL" || echo "PASS"

# 13. Verify exports from index.ts
grep "embedding" apps/api/src/agents/sdk/index.ts

# 14. Verify fallback chain implementation
grep -A5 "fallback" apps/api/src/agents/sdk/ruvector.service.ts | head -10
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `RequestyEmbeddingProvider` created implementing ruvector's `EmbeddingProvider` interface
  - [ ] `RequestyEmbeddingProvider` calls Requesty.ai proxy at `/v1/embeddings` endpoint
  - [ ] `RequestyEmbeddingProvider` supports batch embedding (multiple texts in one request)
  - [ ] `RequestyEmbeddingProvider` sorts results by index to maintain input order
  - [ ] `RequestyEmbeddingProvider` returns empty array for empty input without making API call
  - [ ] `RequestyEmbeddingProvider` throws descriptive error on non-OK response
  - [ ] `OnnxFallbackProvider` created wrapping ruvector's built-in ONNX WASM embedder
  - [ ] `OnnxFallbackProvider` uses lazy initialization (dynamic import on first use)
  - [ ] `OnnxFallbackProvider` gracefully handles missing OnnxEmbedder in ruvector
  - [ ] `OnnxFallbackProvider` returns 384-dimensional vectors (all-MiniLM-L6-v2)
  - [ ] CrecheBooks embedding interfaces created: `EmbeddingProviderType`, `EmbeddingConfig`, `EmbeddingResult`, `VectorInsertOptions`
  - [ ] `RuvectorService.onModuleInit()` registers `RequestyEmbeddingProvider` when API key available
  - [ ] `RuvectorService.onModuleInit()` registers `OnnxFallbackProvider` always
  - [ ] `RuvectorService.onModuleInit()` selects provider based on `EMBEDDING_PROVIDER` env var
  - [ ] `RuvectorService.onModuleInit()` configures VectorDB with `storagePath` for ACID persistence
  - [ ] `RuvectorService.generateEmbedding()` returns `EmbeddingResult` with provider info and timing
  - [ ] `RuvectorService.generateEmbedding()` implements fallback chain: requesty -> onnx -> ngram
  - [ ] `RuvectorService.insertVector()` inserts into tenant-scoped collection with metadata
  - [ ] `RuvectorService.searchTenantCollection()` searches within tenant scope only
  - [ ] `RuvectorService.getTenantCollection()` returns `{type}-{tenantId}` format
  - [ ] `RuvectorService.getActiveDimensions()` returns dimensionality of active provider
  - [ ] Existing `searchSimilar()` method preserved for backward compatibility
  - [ ] Dimension validation on vector insert (mismatch throws descriptive error)
  - [ ] No custom embedding cache (rely on ruvector's built-in LRU: 10k entries, 1h TTL)
  - [ ] Environment variables added to `.env.example`: `EMBEDDING_PROVIDER`, `REQUESTY_EMBEDDING_MODEL`, `RUVECTOR_STORAGE_PATH`
  - [ ] New types exported from `apps/api/src/agents/sdk/index.ts`
  - [ ] Unit tests for `RequestyEmbeddingProvider`: batch, ordering, empty input, error, dimensions
  - [ ] Unit tests for `OnnxFallbackProvider`: init, embed, missing OnnxEmbedder
  - [ ] Unit tests for `RuvectorService`: provider registration, fallback chain, tenant collections, dimensions, persistence
  - [ ] Test coverage >= 90% for new code
  - [ ] Zero `any` types in new code
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (no regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER build a custom embedding cache** — ruvector's `EmbeddingService` has a built-in
    LRU cache (10k entries, 1h TTL). Adding another cache layer creates stale data bugs
    and memory bloat.
  - **NEVER hardcode API keys or URLs** — always use environment variables via `ConfigService`.
    The Requesty.ai base URL, API key, and model must all come from env vars.
  - **NEVER use `any` type** — use proper TypeScript types, generics, or `unknown` with guards
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER store PII in embedding input** — sanitize transaction descriptions before embedding.
    Remove account numbers, names of individuals (payee business names are OK).
  - **NEVER perform cross-tenant vector searches** — always filter by tenant ID. The
    `searchTenantCollection()` method must include tenant scope in the query.
  - **NEVER use floating-point for monetary values** — always integer cents
  - **NEVER block the main agent flow for embedding operations** — use `.catch()` pattern
    for non-critical embedding writes. Only `generateEmbedding()` may be awaited.
  - **NEVER skip the fallback chain** — if `RequestyEmbeddingProvider` fails, try
    `OnnxFallbackProvider`, then `LocalNGramProvider`. Never crash because one provider
    is down.
  - **NEVER assume fixed dimensions** — the active provider determines dimensions.
    Always use `getActiveDimensions()` instead of hardcoding 384 or 1024.
  - **NEVER make real API calls in tests** — mock `fetch()` globally. Mock ruvector imports.
    No network I/O in CI.
  - **NEVER create a second `EmbeddingService` instance** — reuse the one created in
    `onModuleInit()`. There should be exactly one EmbeddingService per RuvectorService.
  - **NEVER import directly from ruvector in embedding-provider.ts** — the provider classes
    implement the `EmbeddingProvider` interface (which can be defined locally). Only
    `RuvectorService` should dynamically import ruvector.
  - **NEVER store vectors without metadata** — every vector insert must include at minimum
    `_collection` and `_tenantId` in metadata for filtering and audit.
</anti_patterns>

</task_spec>
