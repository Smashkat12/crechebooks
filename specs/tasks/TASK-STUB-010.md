<task_spec id="TASK-STUB-010" version="2.0">

<metadata>
  <title>Multi-Tenant Vector Collections</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>integration</layer>
  <sequence>810</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-TENANT-COLLECTIONS</requirement_ref>
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
  The current `RuvectorService` uses a single VectorDB instance with metadata-based
  tenant filtering. Every vector search scans all vectors across all tenants and
  filters by tenant metadata post-hoc. This approach has several scaling issues:

  1. **Performance degradation**: As tenant count grows, every search query scans
     the full HNSW index (all tenants combined), even though only one tenant's data
     is relevant. With N tenants each having M vectors, search scans N*M vectors
     instead of just M.
  2. **No isolation guarantee**: Metadata filtering is a software-level check. A bug
     in the filter logic could leak vectors across tenants. Collection-per-tenant
     provides structural isolation -- no metadata filter can bypass collection boundaries.
  3. **No independent scaling**: All tenants share one HNSW graph with one set of
     parameters. High-volume tenants (e.g., "Think M8 ECD" with bdff4374...) inflate
     the graph for low-volume tenants.
  4. **No per-tenant lifecycle**: Cannot independently archive, compact, or delete
     a tenant's vector data without affecting other tenants.

  **Gap Analysis:**
  - No tenant-isolated vector collections in the current RuvectorService
  - Single shared VectorDB instance with metadata filtering for all tenants
  - No collection naming convention for multi-tenant isolation
  - No lazy collection creation on first access
  - No LRU cache for frequently accessed collections
  - No collection lifecycle management (create on onboarding, archive on deactivation)
  - No migration path from shared metadata-filtered data to per-tenant collections
  - No per-tenant storage path separation on disk

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - ruvector v0.1.96: `VectorDB`, `EmbeddingService`, HNSW indexing, redb ACID storage
  - Storage: redb via `storagePath` configuration in VectorDB
  - Tenant: `bdff4374-64d5-420c-b454-8e85e9df552a` ("Think M8 ECD (PTY) Ltd")
  - Railway: persistent volume at `/data/ruvector`
  - Multi-tenancy: Currently metadata-filtered, target is collection-per-tenant

  **Files to Create:**
  - `apps/api/src/agents/sdk/tenant-collection-manager.ts` -- Per-tenant vector
    collection management with lazy init and LRU cache
  - `apps/api/src/agents/sdk/interfaces/collection-manager.interface.ts` --
    TypeScript types for collection management
  - `apps/api/tests/agents/sdk/tenant-collection-manager.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/sdk/ruvector.service.ts` -- Use TenantCollectionManager
    for tenant-scoped operations
  - `apps/api/src/agents/sdk/sdk-agent.module.ts` -- Register TenantCollectionManager
  - `apps/api/src/agents/sdk/index.ts` -- Export TenantCollectionManager and types
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

  ### 2. TenantCollectionManager Implementation
  ```typescript
  // apps/api/src/agents/sdk/tenant-collection-manager.ts
  import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
  } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { VectorDB } from 'ruvector';
  import type {
    CollectionPurpose,
    CollectionInfo,
    CollectionCacheEntry,
    TenantCollectionManagerConfig,
  } from './interfaces/collection-manager.interface';

  /** Pre-defined collection purposes for CrecheBooks agents */
  const COLLECTION_PURPOSES: CollectionPurpose[] = [
    'decisions',
    'reasoning',
    'patterns',
    'embeddings',
  ];

  @Injectable()
  export class TenantCollectionManager implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TenantCollectionManager.name);

    /**
     * LRU cache of active VectorDB collections.
     * Key format: `${purpose}_${tenantIdPrefix}`
     * Value: { db: VectorDB, lastAccess: timestamp }
     */
    private readonly cache = new Map<string, CollectionCacheEntry>();

    /** Maximum number of collections to keep in memory (LRU eviction) */
    private readonly maxCacheSize: number;

    /** Base data directory for collection storage */
    private readonly dataDir: string;

    /** Embedding dimensions for VectorDB instances */
    private readonly embeddingDim: number;

    /** Periodic cleanup interval handle */
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly configService: ConfigService) {
      this.maxCacheSize = this.configService.get<number>(
        'RUVECTOR_MAX_CACHED_COLLECTIONS',
        20,
      );
      this.dataDir = this.configService.get<string>(
        'RUVECTOR_DATA_DIR',
        './data/ruvector',
      );
      this.embeddingDim = this.configService.get<number>(
        'RUVECTOR_EMBEDDING_DIM',
        384,
      );
    }

    async onModuleInit(): Promise<void> {
      this.logger.log(
        `TenantCollectionManager initialized ` +
        `(maxCache=${this.maxCacheSize}, dataDir=${this.dataDir}, ` +
        `embeddingDim=${this.embeddingDim})`,
      );

      // Start periodic LRU cleanup every 5 minutes
      this.cleanupInterval = setInterval(
        () => this.evictStaleCollections(),
        5 * 60 * 1000,
      );
    }

    async onModuleDestroy(): Promise<void> {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Gracefully close all cached VectorDB instances
      const closePromises: Promise<void>[] = [];
      for (const [key, entry] of this.cache.entries()) {
        closePromises.push(
          entry.db.close().catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to close collection ${key}: ${msg}`);
          }),
        );
      }
      await Promise.all(closePromises);
      this.cache.clear();

      this.logger.log('TenantCollectionManager shut down gracefully');
    }

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Get or create a VectorDB collection for a specific tenant and purpose.
     * Uses lazy initialization: collection is created on first access.
     * Uses LRU cache: recently accessed collections stay in memory.
     *
     * @param tenantId - Full tenant UUID
     * @param purpose - Collection purpose (decisions, reasoning, patterns, embeddings)
     * @returns VectorDB instance scoped to this tenant+purpose
     */
    async getCollection(
      tenantId: string,
      purpose: CollectionPurpose,
    ): Promise<VectorDB> {
      this.validateTenantId(tenantId);
      this.validatePurpose(purpose);

      const cacheKey = this.buildCollectionKey(tenantId, purpose);

      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached) {
        cached.lastAccess = Date.now();
        return cached.db;
      }

      // Evict LRU entry if cache is full
      if (this.cache.size >= this.maxCacheSize) {
        await this.evictLeastRecentlyUsed();
      }

      // Create new VectorDB collection
      const storagePath = this.buildStoragePath(tenantId, purpose);
      const db = new VectorDB({
        dimensions: this.embeddingDim,
        distanceMetric: 'cosine',
        storagePath,
      });
      await db.initialize();

      // Add to cache
      this.cache.set(cacheKey, {
        db,
        lastAccess: Date.now(),
        tenantId,
        purpose,
        storagePath,
      });

      this.logger.debug(
        `Created collection: ${cacheKey} (storage=${storagePath})`,
      );

      return db;
    }

    /**
     * Initialize all standard collections for a new tenant.
     * Called during tenant onboarding to pre-create collection directories.
     *
     * @param tenantId - Full tenant UUID
     */
    async initializeTenantCollections(tenantId: string): Promise<void> {
      this.validateTenantId(tenantId);

      this.logger.log(
        `Initializing collections for tenant ${tenantId.substring(0, 8)}`,
      );

      const initPromises = COLLECTION_PURPOSES.map(async (purpose) => {
        const db = await this.getCollection(tenantId, purpose);
        // Ensure the collection is initialized and storage is created
        this.logger.debug(
          `Initialized ${purpose} collection for tenant ${tenantId.substring(0, 8)}`,
        );
        return db;
      });

      await Promise.all(initPromises);

      this.logger.log(
        `All ${COLLECTION_PURPOSES.length} collections initialized for ` +
        `tenant ${tenantId.substring(0, 8)}`,
      );
    }

    /**
     * Fallback: search with metadata filter on a shared collection.
     * Used during migration period when data exists in the shared VectorDB.
     *
     * @param sharedDb - The shared VectorDB instance
     * @param purpose - Collection purpose
     * @param query - Embedding vector to search
     * @param tenantId - Tenant ID for metadata filtering
     * @param k - Number of results
     */
    async searchWithFilter(
      sharedDb: VectorDB,
      purpose: string,
      query: number[],
      tenantId: string,
      k: number = 10,
    ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
      this.validateTenantId(tenantId);

      const results = await sharedDb.search(query, k * 2); // Over-fetch for post-filter

      // Post-filter by tenant metadata -- defensive coding
      const filtered = results
        .filter((r) => {
          const meta = r.metadata ?? {};
          return meta.tenantId === tenantId && meta.purpose === purpose;
        })
        .slice(0, k);

      // DEFENSIVE ASSERTION: Verify no cross-tenant results leaked
      for (const result of filtered) {
        const resultTenantId = (result.metadata as Record<string, unknown>)?.tenantId;
        if (resultTenantId !== tenantId) {
          this.logger.error(
            `CRITICAL: Cross-tenant vector leak detected! ` +
            `Expected ${tenantId}, got ${String(resultTenantId)}. ` +
            `Result excluded from response.`,
          );
          throw new Error(
            'Cross-tenant data isolation violation detected. Search aborted.',
          );
        }
      }

      return filtered.map((r) => ({
        id: r.id,
        score: r.score,
        metadata: r.metadata as Record<string, unknown>,
      }));
    }

    /**
     * Migrate data from a shared metadata-filtered collection to a
     * tenant-isolated collection. Idempotent: skips already-migrated entries.
     *
     * @param sharedDb - Source shared VectorDB
     * @param purpose - Collection purpose to migrate
     * @param tenantId - Tenant whose data to migrate
     * @returns Number of entries migrated
     */
    async migrateSharedToIsolated(
      sharedDb: VectorDB,
      purpose: CollectionPurpose,
      tenantId: string,
    ): Promise<number> {
      this.validateTenantId(tenantId);

      const targetDb = await this.getCollection(tenantId, purpose);

      // Fetch all entries for this tenant from shared collection
      const allEntries = await sharedDb.listAll({
        filter: { tenantId, purpose },
      });

      let migrated = 0;
      for (const entry of allEntries) {
        try {
          // Check if already exists in target (idempotent)
          const existing = await targetDb.get(entry.id);
          if (existing) continue;

          await targetDb.insert(entry.id, entry.vector, entry.metadata);
          migrated++;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Migration failed for entry ${entry.id}: ${msg}`,
          );
        }
      }

      this.logger.log(
        `Migration complete: ${migrated}/${allEntries.length} entries ` +
        `migrated for ${purpose}_${tenantId.substring(0, 8)}`,
      );

      return migrated;
    }

    /**
     * Get statistics for all collections across all tenants.
     * Returns per-tenant collection sizes and last access times.
     */
    getCollectionStats(): CollectionInfo[] {
      const stats: CollectionInfo[] = [];

      for (const [key, entry] of this.cache.entries()) {
        stats.push({
          key,
          tenantId: entry.tenantId,
          purpose: entry.purpose,
          lastAccess: entry.lastAccess,
          storagePath: entry.storagePath,
        });
      }

      return stats.sort((a, b) => b.lastAccess - a.lastAccess);
    }

    /**
     * Get the number of currently cached collections.
     */
    getCacheSize(): number {
      return this.cache.size;
    }

    /**
     * Check if a collection exists in the cache.
     */
    hasCollection(tenantId: string, purpose: CollectionPurpose): boolean {
      const key = this.buildCollectionKey(tenantId, purpose);
      return this.cache.has(key);
    }

    // ── Private Helpers ─────────────────────────────────────────────────

    /**
     * Build a collection cache key from tenant ID and purpose.
     * Uses first 8 chars of UUID for readability.
     *
     * Format: `${purpose}_${tenantIdPrefix}`
     * Example: `decisions_bdff4374`
     */
    private buildCollectionKey(
      tenantId: string,
      purpose: CollectionPurpose,
    ): string {
      return `${purpose}_${tenantId.substring(0, 8)}`;
    }

    /**
     * Build the on-disk storage path for a collection.
     * Each collection gets its own subdirectory.
     *
     * Format: `${dataDir}/collections/${purpose}_${tenantId}/vectors.db`
     */
    private buildStoragePath(
      tenantId: string,
      purpose: CollectionPurpose,
    ): string {
      return `${this.dataDir}/collections/${purpose}_${tenantId}/vectors.db`;
    }

    /**
     * Validate tenant ID format (UUID).
     * Prevents directory traversal and invalid collection names.
     */
    private validateTenantId(tenantId: string): void {
      if (!tenantId || typeof tenantId !== 'string') {
        throw new Error('tenantId is required and must be a string');
      }
      // UUID v4 format check
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantId)) {
        throw new Error(
          `Invalid tenantId format: "${tenantId}". Expected UUID v4.`,
        );
      }
    }

    /**
     * Validate collection purpose against allowed values.
     */
    private validatePurpose(purpose: CollectionPurpose): void {
      if (!COLLECTION_PURPOSES.includes(purpose)) {
        throw new Error(
          `Invalid collection purpose: "${purpose}". ` +
          `Allowed: ${COLLECTION_PURPOSES.join(', ')}`,
        );
      }
    }

    /**
     * Evict the least recently used collection from the cache.
     * Closes the VectorDB instance to free memory.
     */
    private async evictLeastRecentlyUsed(): Promise<void> {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccess < oldestTime) {
          oldestTime = entry.lastAccess;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry) {
          try {
            await entry.db.close();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Error closing evicted collection ${oldestKey}: ${msg}`);
          }
          this.cache.delete(oldestKey);
          this.logger.debug(`Evicted LRU collection: ${oldestKey}`);
        }
      }
    }

    /**
     * Periodic cleanup: evict collections not accessed in the last 30 minutes.
     */
    private evictStaleCollections(): void {
      const staleThreshold = Date.now() - 30 * 60 * 1000; // 30 minutes
      const staleKeys: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccess < staleThreshold) {
          staleKeys.push(key);
        }
      }

      for (const key of staleKeys) {
        const entry = this.cache.get(key);
        if (entry) {
          entry.db.close().catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Error closing stale collection ${key}: ${msg}`);
          });
          this.cache.delete(key);
        }
      }

      if (staleKeys.length > 0) {
        this.logger.debug(
          `Evicted ${staleKeys.length} stale collections: ${staleKeys.join(', ')}`,
        );
      }
    }
  }
  ```

  ### 3. TypeScript Interfaces for Collection Management
  ```typescript
  // apps/api/src/agents/sdk/interfaces/collection-manager.interface.ts

  /**
   * Pre-defined collection purposes for CrecheBooks agents.
   * Each purpose gets its own VectorDB collection per tenant.
   */
  export type CollectionPurpose = 'decisions' | 'reasoning' | 'patterns' | 'embeddings';

  /**
   * A cache entry for an active VectorDB collection.
   */
  export interface CollectionCacheEntry {
    /** The VectorDB instance for this collection */
    db: import('ruvector').VectorDB;
    /** Timestamp of last access (for LRU eviction) */
    lastAccess: number;
    /** The tenant this collection belongs to */
    tenantId: string;
    /** The purpose of this collection */
    purpose: CollectionPurpose;
    /** On-disk storage path */
    storagePath: string;
  }

  /**
   * Collection information for stats/monitoring.
   */
  export interface CollectionInfo {
    /** Cache key (purpose_tenantPrefix) */
    key: string;
    /** Full tenant UUID */
    tenantId: string;
    /** Collection purpose */
    purpose: CollectionPurpose;
    /** Timestamp of last access */
    lastAccess: number;
    /** On-disk storage path */
    storagePath: string;
  }

  /**
   * Configuration for TenantCollectionManager.
   */
  export interface TenantCollectionManagerConfig {
    /** Maximum number of collections to keep in LRU cache (default: 20) */
    maxCacheSize: number;
    /** Base data directory for collection storage */
    dataDir: string;
    /** Embedding dimensions for VectorDB instances (default: 384) */
    embeddingDim: number;
    /** Distance metric for VectorDB (default: cosine) */
    distanceMetric: 'cosine' | 'euclidean' | 'dot';
    /** Stale collection eviction threshold in milliseconds (default: 30 min) */
    staleThresholdMs: number;
  }

  /**
   * Result from a filtered search operation on a shared collection.
   */
  export interface FilteredSearchResult {
    /** Vector entry ID */
    id: string;
    /** Similarity/distance score */
    score: number;
    /** Metadata attached to the vector entry */
    metadata: Record<string, unknown>;
  }

  /**
   * Result from a migration operation.
   */
  export interface MigrationResult {
    /** Number of entries migrated */
    migrated: number;
    /** Total entries found for the tenant */
    total: number;
    /** Number of entries skipped (already existed) */
    skipped: number;
    /** Number of entries that failed to migrate */
    failed: number;
  }
  ```

  ### 4. RuvectorService Integration
  Modify `ruvector.service.ts` to delegate tenant-scoped operations to TenantCollectionManager:
  ```typescript
  // In apps/api/src/agents/sdk/ruvector.service.ts
  // ADD import:
  import { TenantCollectionManager } from './tenant-collection-manager';

  @Injectable()
  export class RuvectorService implements OnModuleInit {
    // ... existing code ...

    constructor(
      private readonly configService: ConfigService,
      @Optional() @Inject(TenantCollectionManager)
      private readonly collectionManager: TenantCollectionManager | null,
    ) {}

    /**
     * Get a tenant-scoped VectorDB collection.
     * Delegates to TenantCollectionManager for per-tenant isolation.
     * Falls back to shared VectorDB with metadata filtering if manager unavailable.
     */
    async getTenantCollection(
      tenantId: string,
      purpose: 'decisions' | 'reasoning' | 'patterns' | 'embeddings',
    ): Promise<VectorDB> {
      if (this.collectionManager) {
        return this.collectionManager.getCollection(tenantId, purpose);
      }
      // Fallback: return shared VectorDB (metadata filtering required by caller)
      return this.getSharedDb();
    }

    /**
     * Search within a tenant-scoped collection.
     * When TenantCollectionManager is available, searches are structurally
     * isolated to the tenant's own HNSW index.
     */
    async searchTenantScoped(
      tenantId: string,
      purpose: 'decisions' | 'reasoning' | 'patterns' | 'embeddings',
      query: number[],
      k: number = 10,
    ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
      if (this.collectionManager) {
        const db = await this.collectionManager.getCollection(tenantId, purpose);
        const results = await db.search(query, k);
        return results.map((r) => ({
          id: r.id,
          score: r.score,
          metadata: r.metadata as Record<string, unknown>,
        }));
      }

      // Fallback: shared DB with metadata filter
      return this.collectionManager
        ? this.collectionManager.searchWithFilter(
            await this.getSharedDb(),
            purpose,
            query,
            tenantId,
            k,
          )
        : [];
    }
  }
  ```

  ### 5. Module Registration
  ```typescript
  // In apps/api/src/agents/sdk/sdk-agent.module.ts
  // ADD to providers and exports:
  import { TenantCollectionManager } from './tenant-collection-manager';

  @Module({
    imports: [ConfigModule],
    providers: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,
      TenantCollectionManager,  // NEW
    ],
    exports: [
      SdkAgentFactory,
      SdkConfigService,
      RuvectorService,
      IntelligenceEngineService,
      TenantCollectionManager,  // NEW
    ],
  })
  export class SdkAgentModule {}
  ```

  ### 6. Barrel Export Update
  ```typescript
  // Addition to apps/api/src/agents/sdk/index.ts
  export { TenantCollectionManager } from './tenant-collection-manager';
  export type {
    CollectionPurpose,
    CollectionInfo,
    CollectionCacheEntry,
    TenantCollectionManagerConfig,
    FilteredSearchResult,
    MigrationResult,
  } from './interfaces/collection-manager.interface';
  ```

  ### 7. Testing Pattern
  ```typescript
  // apps/api/tests/agents/sdk/tenant-collection-manager.spec.ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { ConfigModule } from '@nestjs/config';
  import { TenantCollectionManager } from '../../../src/agents/sdk/tenant-collection-manager';

  // Mock ruvector VectorDB
  const mockVectorDB = {
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    listAll: jest.fn().mockResolvedValue([]),
  };

  jest.mock('ruvector', () => ({
    VectorDB: jest.fn().mockImplementation(() => ({ ...mockVectorDB })),
  }));

  const TEST_TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';
  const SECOND_TENANT_ID = 'aaaa1111-2222-3333-4444-555566667777';

  describe('TenantCollectionManager', () => {
    let manager: TenantCollectionManager;

    beforeEach(async () => {
      jest.clearAllMocks();

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [() => ({
              RUVECTOR_DATA_DIR: './data/test-ruvector',
              RUVECTOR_MAX_CACHED_COLLECTIONS: 5,
              RUVECTOR_EMBEDDING_DIM: 384,
            })],
          }),
        ],
        providers: [TenantCollectionManager],
      }).compile();

      manager = module.get<TenantCollectionManager>(TenantCollectionManager);
      await manager.onModuleInit();
    });

    afterEach(async () => {
      await manager.onModuleDestroy();
    });

    describe('getCollection', () => {
      it('should create a new collection on first access', async () => {
        const db = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        expect(db).toBeDefined();
        expect(db.initialize).toHaveBeenCalled();
      });

      it('should return cached collection on subsequent access', async () => {
        const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        const db2 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        // VectorDB constructor should only be called once
        expect(db1).toBe(db2);
      });

      it('should create separate collections for different tenants', async () => {
        const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        const db2 = await manager.getCollection(SECOND_TENANT_ID, 'decisions');
        expect(db1).not.toBe(db2);
      });

      it('should create separate collections for different purposes', async () => {
        const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        const db2 = await manager.getCollection(TEST_TENANT_ID, 'reasoning');
        expect(db1).not.toBe(db2);
      });

      it('should reject invalid tenant ID format', async () => {
        await expect(
          manager.getCollection('invalid-uuid', 'decisions'),
        ).rejects.toThrow('Invalid tenantId format');
      });

      it('should reject empty tenant ID', async () => {
        await expect(
          manager.getCollection('', 'decisions'),
        ).rejects.toThrow('tenantId is required');
      });

      it('should reject invalid purpose', async () => {
        await expect(
          manager.getCollection(TEST_TENANT_ID, 'invalid' as any),
        ).rejects.toThrow('Invalid collection purpose');
      });
    });

    describe('LRU cache', () => {
      it('should evict LRU entry when cache is full', async () => {
        // Create 5 collections (max cache size)
        for (let i = 0; i < 5; i++) {
          const tenantId = `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
          await manager.getCollection(tenantId, 'decisions');
        }
        expect(manager.getCacheSize()).toBe(5);

        // Access 6th collection -- should evict the LRU (first one)
        const sixthTenant = '00000005-0000-0000-0000-000000000000';
        await manager.getCollection(sixthTenant, 'decisions');
        expect(manager.getCacheSize()).toBe(5);
      });

      it('should update lastAccess on cache hit', async () => {
        const db1 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        const statsBefore = manager.getCollectionStats();
        const accessBefore = statsBefore[0].lastAccess;

        // Wait a tiny bit so timestamp differs
        await new Promise((r) => setTimeout(r, 10));

        const db2 = await manager.getCollection(TEST_TENANT_ID, 'decisions');
        const statsAfter = manager.getCollectionStats();
        const accessAfter = statsAfter[0].lastAccess;

        expect(accessAfter).toBeGreaterThanOrEqual(accessBefore);
      });
    });

    describe('initializeTenantCollections', () => {
      it('should create all 4 purpose collections', async () => {
        await manager.initializeTenantCollections(TEST_TENANT_ID);

        expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(true);
        expect(manager.hasCollection(TEST_TENANT_ID, 'reasoning')).toBe(true);
        expect(manager.hasCollection(TEST_TENANT_ID, 'patterns')).toBe(true);
        expect(manager.hasCollection(TEST_TENANT_ID, 'embeddings')).toBe(true);
      });

      it('should reject invalid tenant ID', async () => {
        await expect(
          manager.initializeTenantCollections('bad-id'),
        ).rejects.toThrow('Invalid tenantId format');
      });
    });

    describe('searchWithFilter', () => {
      it('should filter results by tenantId metadata', async () => {
        const sharedDb = {
          search: jest.fn().mockResolvedValue([
            { id: 'v1', score: 0.95, metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' } },
            { id: 'v2', score: 0.90, metadata: { tenantId: SECOND_TENANT_ID, purpose: 'decisions' } },
            { id: 'v3', score: 0.85, metadata: { tenantId: TEST_TENANT_ID, purpose: 'decisions' } },
          ]),
        } as any;

        const results = await manager.searchWithFilter(
          sharedDb, 'decisions', [0.1, 0.2, 0.3], TEST_TENANT_ID, 10,
        );

        expect(results).toHaveLength(2);
        expect(results.every((r) => r.metadata.tenantId === TEST_TENANT_ID)).toBe(true);
      });

      it('should throw on cross-tenant data leak detection', async () => {
        // This tests the defensive assertion
        const sharedDb = {
          search: jest.fn().mockResolvedValue([
            { id: 'v1', score: 0.95, metadata: { tenantId: 'wrong-tenant-id', purpose: 'decisions' } },
          ]),
        } as any;

        // The post-filter should exclude this, so no leak
        const results = await manager.searchWithFilter(
          sharedDb, 'decisions', [0.1], TEST_TENANT_ID, 10,
        );
        expect(results).toHaveLength(0);
      });
    });

    describe('getCollectionStats', () => {
      it('should return stats for all cached collections', async () => {
        await manager.getCollection(TEST_TENANT_ID, 'decisions');
        await manager.getCollection(TEST_TENANT_ID, 'reasoning');

        const stats = manager.getCollectionStats();
        expect(stats).toHaveLength(2);
        expect(stats[0].tenantId).toBe(TEST_TENANT_ID);
        expect(stats[0].purpose).toBeDefined();
        expect(stats[0].lastAccess).toBeGreaterThan(0);
      });

      it('should sort by lastAccess descending', async () => {
        await manager.getCollection(TEST_TENANT_ID, 'decisions');
        await new Promise((r) => setTimeout(r, 10));
        await manager.getCollection(TEST_TENANT_ID, 'reasoning');

        const stats = manager.getCollectionStats();
        expect(stats[0].purpose).toBe('reasoning'); // most recent
      });
    });

    describe('hasCollection', () => {
      it('should return true for cached collections', async () => {
        await manager.getCollection(TEST_TENANT_ID, 'decisions');
        expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(true);
      });

      it('should return false for non-cached collections', () => {
        expect(manager.hasCollection(TEST_TENANT_ID, 'decisions')).toBe(false);
      });
    });

    describe('lifecycle', () => {
      it('should close all collections on destroy', async () => {
        await manager.getCollection(TEST_TENANT_ID, 'decisions');
        await manager.getCollection(TEST_TENANT_ID, 'reasoning');

        await manager.onModuleDestroy();
        expect(manager.getCacheSize()).toBe(0);
      });
    });
  });
  ```

  ### 8. Collection Naming Convention
  ```
  Collection key format:  ${purpose}_${tenantId.substring(0, 8)}
  Storage path format:    ${RUVECTOR_DATA_DIR}/collections/${purpose}_${tenantId}/vectors.db

  Examples for tenant bdff4374-64d5-420c-b454-8e85e9df552a:
  - Cache key:    decisions_bdff4374
  - Storage path: ./data/ruvector/collections/decisions_bdff4374-64d5-420c-b454-8e85e9df552a/vectors.db

  Note: Cache key uses truncated UUID for readability in logs.
        Storage path uses FULL UUID for guaranteed uniqueness on disk.
  ```

  ### 9. Monetary Values
  ALL monetary values MUST be integers (cents). Never use floating-point:
  ```typescript
  // CORRECT
  amountCents: 150000  // R1,500.00

  // WRONG
  // amount: 1500.00    // NEVER use floating-point for money
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks is a South African bookkeeping platform for creche (daycare) businesses.
  As more creches onboard to the platform, the single-VectorDB-with-metadata-filtering
  approach becomes a scaling bottleneck and a data isolation risk. Collection-per-tenant
  provides:

  - **True data isolation**: Each tenant's vectors live in a separate HNSW index. No
    metadata filter bug can leak cross-tenant data. This is critical for POPI Act
    compliance.
  - **Independent scaling**: High-volume tenants (Think M8 ECD with thousands of
    transactions) don't degrade search performance for small tenants.
  - **Per-tenant lifecycle**: Tenants can be archived (close collection, preserve files),
    deleted (remove collection directory), or compacted independently.
  - **Simpler search**: No need for metadata filtering -- searches are structurally
    scoped to the correct tenant.

  ## SA Compliance Notes
  - POPI (Protection of Personal Information) Act requires strict data isolation between
    organizations. Collection-per-tenant provides structural isolation beyond software filtering.
  - All monetary values in cents (integers) -- R1,500.00 = 150000
  - Tenant isolation is a legal requirement, not just a best practice.

  ## Architectural Decisions
  - **Lazy initialization**: Collections are created on first access, not eagerly for all
    tenants. This avoids creating thousands of empty collections on startup.
  - **LRU cache**: Keep the N most recently used collections in memory (default: 20).
    Stale collections are evicted after 30 minutes of inactivity.
  - **Full UUID in storage paths**: While cache keys use truncated UUIDs for log readability,
    storage paths use the full UUID to guarantee disk-level uniqueness.
  - **Pre-defined purposes**: Only 4 collection purposes are allowed (decisions, reasoning,
    patterns, embeddings). This prevents unbounded collection creation.
  - **Fallback to shared DB**: During migration, `searchWithFilter()` provides backward
    compatibility with the existing metadata-filtered approach.
  - **redb ACID storage**: Each collection uses redb for crash-safe on-disk persistence,
    inherited from VectorDB's storagePath configuration.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `TenantCollectionManager` as NestJS `@Injectable()` with lifecycle hooks
    - Implement lazy collection creation via `getCollection(tenantId, purpose)`
    - Implement LRU cache with configurable max size (default: 20)
    - Implement periodic stale collection eviction (30-minute threshold)
    - Implement `initializeTenantCollections(tenantId)` for tenant onboarding
    - Implement `searchWithFilter()` for backward-compatible shared-DB searching
    - Implement cross-tenant data leak detection with defensive assertions
    - Implement `migrateSharedToIsolated()` for background data migration
    - Implement `getCollectionStats()` for monitoring
    - Implement `hasCollection()` and `getCacheSize()` utility methods
    - Implement tenant ID validation (UUID format check) to prevent directory traversal
    - Implement purpose validation against pre-defined allowed values
    - Create TypeScript interfaces: `CollectionPurpose`, `CollectionCacheEntry`,
      `CollectionInfo`, `TenantCollectionManagerConfig`, `FilteredSearchResult`,
      `MigrationResult`
    - Collection naming: `${purpose}_${tenantId.substring(0, 8)}` for cache keys,
      full UUID for storage paths
    - Per-collection storage path: `${dataDir}/collections/${purpose}_${tenantId}/vectors.db`
    - Modify `RuvectorService` to delegate tenant-scoped operations to TenantCollectionManager
    - Register `TenantCollectionManager` in `SdkAgentModule`
    - Update barrel export with new service and types
    - Unit tests for all public methods
    - Unit tests for LRU cache behavior (eviction, update on access)
    - Unit tests for tenant isolation (separate collections per tenant)
    - Unit tests for input validation (invalid UUID, invalid purpose)
    - Unit tests for lifecycle (init, destroy with cleanup)
    - All tests mock ruvector VectorDB
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - Automatic collection sharding (single HNSW per collection is sufficient)
    - Cross-tenant analytics (each collection is isolated by design)
    - Collection backup/restore (use VectorDB's built-in snapshot feature)
    - Automatic tenant detection/onboarding triggers (manual via service call)
    - Collection compaction/optimization (VectorDB handles this internally)
    - Distributed collection management (single-instance sufficient)
    - Collection encryption at rest (rely on Railway volume encryption)
    - Real database integration tests (use mock VectorDB)
    - Web UI for collection management (API-only)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/tenant-collection-manager.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/sdk/interfaces/collection-manager.interface.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/tests/agents/sdk/tenant-collection-manager.spec.ts

# 2. Verify build succeeds
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm run build

# 3. Run TenantCollectionManager-specific tests
pnpm test -- --testPathPattern="tenant-collection-manager" --runInBand

# 4. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 5. Lint check
pnpm run lint

# 6. Verify TenantCollectionManager registered in SdkAgentModule
grep "TenantCollectionManager" apps/api/src/agents/sdk/sdk-agent.module.ts

# 7. Verify TenantCollectionManager exported from barrel
grep "TenantCollectionManager" apps/api/src/agents/sdk/index.ts

# 8. Verify collection naming convention
grep "buildCollectionKey" apps/api/src/agents/sdk/tenant-collection-manager.ts
grep "buildStoragePath" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 9. Verify tenant ID validation (UUID format check)
grep "uuidRegex" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 10. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/sdk/tenant-collection-manager.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"
grep -rn ": any" apps/api/src/agents/sdk/interfaces/collection-manager.interface.ts && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"

# 11. Verify LRU cache implementation
grep -n "evictLeastRecentlyUsed\|evictStaleCollections" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 12. Verify cross-tenant isolation assertion
grep -n "Cross-tenant" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 13. Verify OnModuleInit and OnModuleDestroy lifecycle hooks
grep -n "OnModuleInit\|OnModuleDestroy" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 14. Verify 4 collection purposes defined
grep -n "COLLECTION_PURPOSES" apps/api/src/agents/sdk/tenant-collection-manager.ts

# 15. Verify migration helper exists
grep -n "migrateSharedToIsolated" apps/api/src/agents/sdk/tenant-collection-manager.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `TenantCollectionManager` created as `@Injectable()` NestJS service with lifecycle hooks
  - [ ] `OnModuleInit` starts periodic stale collection eviction (5-minute interval)
  - [ ] `OnModuleDestroy` gracefully closes all cached VectorDB instances
  - [ ] `getCollection(tenantId, purpose)` lazily creates VectorDB collections per tenant
  - [ ] `getCollection()` returns cached instance on subsequent calls (no re-creation)
  - [ ] `getCollection()` validates tenant ID format (UUID v4 regex)
  - [ ] `getCollection()` validates purpose against allowed values (decisions, reasoning, patterns, embeddings)
  - [ ] LRU cache with configurable max size (default: 20, via RUVECTOR_MAX_CACHED_COLLECTIONS)
  - [ ] LRU eviction: when cache is full, least recently used collection is closed and removed
  - [ ] LRU touch: accessing a cached collection updates its lastAccess timestamp
  - [ ] Periodic stale eviction: collections not accessed in 30 minutes are closed and removed
  - [ ] Collection key format: `${purpose}_${tenantId.substring(0, 8)}`
  - [ ] Storage path format: `${RUVECTOR_DATA_DIR}/collections/${purpose}_${tenantId}/vectors.db`
  - [ ] `initializeTenantCollections(tenantId)` creates all 4 purpose collections
  - [ ] `searchWithFilter()` provides backward-compatible shared-DB searching with metadata filter
  - [ ] Cross-tenant data leak detection: defensive assertion throws on mismatched tenantId
  - [ ] `migrateSharedToIsolated()` moves data from shared to per-tenant collection (idempotent)
  - [ ] `getCollectionStats()` returns per-collection info sorted by lastAccess
  - [ ] `hasCollection()` checks cache for a specific tenant+purpose
  - [ ] `getCacheSize()` returns current number of cached collections
  - [ ] TypeScript interfaces created: `CollectionPurpose`, `CollectionCacheEntry`, `CollectionInfo`,
        `TenantCollectionManagerConfig`, `FilteredSearchResult`, `MigrationResult`
  - [ ] `RuvectorService` modified to delegate tenant-scoped operations via `getTenantCollection()`
        and `searchTenantScoped()` methods
  - [ ] `TenantCollectionManager` registered in `SdkAgentModule` providers and exports
  - [ ] Barrel export `index.ts` updated with TenantCollectionManager and all interface types
  - [ ] Unit tests: lazy creation on first access
  - [ ] Unit tests: cache hit on subsequent access
  - [ ] Unit tests: separate collections per tenant
  - [ ] Unit tests: separate collections per purpose
  - [ ] Unit tests: LRU eviction when cache is full
  - [ ] Unit tests: lastAccess updated on cache hit
  - [ ] Unit tests: initializeTenantCollections creates all 4 purposes
  - [ ] Unit tests: invalid tenant ID rejected (non-UUID format)
  - [ ] Unit tests: invalid purpose rejected
  - [ ] Unit tests: searchWithFilter filters by tenantId metadata
  - [ ] Unit tests: cross-tenant leak detection
  - [ ] Unit tests: getCollectionStats returns sorted results
  - [ ] Unit tests: lifecycle cleanup on destroy
  - [ ] All tests mock ruvector VectorDB -- zero real VectorDB instantiation
  - [ ] Test coverage >= 90% for TenantCollectionManager
  - [ ] Zero `any` types in all new/modified files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (zero regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER return results from the wrong tenant** -- every search must be scoped to a single
    tenant's collection. Cross-tenant data leaks are a POPI Act violation.
  - **NEVER skip tenant ID validation** -- always validate UUID format before building storage
    paths. Invalid tenant IDs can cause directory traversal attacks.
  - **NEVER create unbounded collection types** -- only the 4 pre-defined purposes (decisions,
    reasoning, patterns, embeddings) are allowed. Arbitrary purpose strings would create
    unlimited collections.
  - **NEVER use `any` type** -- use proper TypeScript interfaces from `collection-manager.interface.ts`
  - **NEVER use `npm`** -- all commands must use `pnpm`
  - **NEVER eagerly create collections for all tenants on startup** -- use lazy initialization.
    Creating thousands of VectorDB instances on startup would exhaust memory.
  - **NEVER use truncated UUID for storage paths** -- only use truncated UUID for cache keys
    (log readability). Storage paths MUST use the full UUID for guaranteed uniqueness.
  - **NEVER skip graceful shutdown** -- all VectorDB instances must be closed on module destroy.
    Unclosed redb databases can corrupt on-disk storage.
  - **NEVER omit the cross-tenant assertion** -- the defensive assertion in `searchWithFilter()`
    is the last line of defense against data leaks. Never remove or weaken it.
  - **NEVER allow arbitrary collection configuration per tenant** -- all collections use the
    same embeddingDim, distanceMetric, and storage engine. Per-tenant config differences
    would make migration and consistency checks impossible.
  - **NEVER store raw PII in vector collections** -- sanitize descriptions before embedding
    (strip parent names, ID numbers, phone numbers).
  - **NEVER use floating-point for monetary values** -- all amounts in cents (integers).
  - **NEVER make real VectorDB calls in tests** -- always mock ruvector's VectorDB class.
  - **NEVER hold collection references outside the cache** -- always go through
    `getCollection()` to ensure LRU tracking and lifecycle management.
</anti_patterns>

</task_spec>
