/**
 * Tenant Collection Manager
 * TASK-STUB-010: Multi-Tenant Vector Collections
 *
 * @module agents/sdk/tenant-collection-manager
 * @description Per-tenant vector collection management with lazy initialization
 * and LRU cache. Each tenant gets its own VectorDB collection per purpose,
 * providing structural data isolation (POPI Act compliance).
 *
 * CRITICAL RULES:
 * - Each tenant+purpose pair has its own VectorDB with separate HNSW index
 * - Cache keys use truncated UUID (readability); storage paths use full UUID (uniqueness)
 * - Only 4 pre-defined purposes are allowed (no arbitrary collection creation)
 * - Tenant ID must be a valid UUID v4 (prevents directory traversal)
 * - Graceful shutdown removes all cached VectorDB references (redb ACID safety)
 */

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
  VectorDBInstance,
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
   * Value: { db: VectorDBInstance, lastAccess: timestamp }
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

  onModuleInit(): void {
    this.logger.log(
      `TenantCollectionManager initialized ` +
        `(maxCache=${String(this.maxCacheSize)}, dataDir=${this.dataDir}, ` +
        `embeddingDim=${String(this.embeddingDim)})`,
    );

    // Start periodic LRU cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => this.evictStaleCollections(),
      5 * 60 * 1000,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Remove all cached VectorDB references.
    // ruvector's VectorDBWrapper does not expose a close() method;
    // clearing the cache releases references for garbage collection.
    this.cache.clear();

    this.logger.log('TenantCollectionManager shut down gracefully');
  }

  // -- Public API -----------------------------------------------------------

  /**
   * Get or create a VectorDB collection for a specific tenant and purpose.
   * Uses lazy initialization: collection is created on first access.
   * Uses LRU cache: recently accessed collections stay in memory.
   *
   * @param tenantId - Full tenant UUID
   * @param purpose - Collection purpose (decisions, reasoning, patterns, embeddings)
   * @returns VectorDBInstance scoped to this tenant+purpose
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getCollection(
    tenantId: string,
    purpose: CollectionPurpose,
  ): Promise<VectorDBInstance> {
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
      this.evictLeastRecentlyUsed();
    }

    // Create new VectorDB collection
    const storagePath = this.buildStoragePath(tenantId, purpose);
    const db: VectorDBInstance = new VectorDB({
      dimensions: this.embeddingDim,
      distanceMetric: 'cosine',
      storagePath,
    }) as unknown as VectorDBInstance;

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
      this.logger.debug(
        `Initialized ${purpose} collection for tenant ${tenantId.substring(0, 8)}`,
      );
      return db;
    });

    await Promise.all(initPromises);

    this.logger.log(
      `All ${String(COLLECTION_PURPOSES.length)} collections initialized for ` +
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
    sharedDb: VectorDBInstance,
    purpose: string,
    query: number[],
    tenantId: string,
    k: number = 10,
  ): Promise<
    Array<{ id: string; score: number; metadata: Record<string, unknown> }>
  > {
    this.validateTenantId(tenantId);

    // Over-fetch for post-filter
    const results = await sharedDb.search({ vector: query, k: k * 2 });

    // Post-filter by tenant metadata -- defensive coding
    const filtered = results
      .filter((r) => {
        const meta = r.metadata ?? {};
        return meta.tenantId === tenantId && meta.purpose === purpose;
      })
      .slice(0, k);

    // DEFENSIVE ASSERTION: Verify no cross-tenant results leaked
    for (const result of filtered) {
      const resultTenantId = result.metadata?.tenantId;
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
      metadata: r.metadata ?? {},
    }));
  }

  /**
   * Migrate data from a shared metadata-filtered collection to a
   * tenant-isolated collection. Idempotent: skips already-migrated entries.
   *
   * Callers provide pre-fetched entries since ruvector's VectorDBWrapper
   * does not expose a listAll() method.
   *
   * @param entries - Pre-fetched entries from the shared collection for this tenant
   * @param purpose - Collection purpose to migrate
   * @param tenantId - Tenant whose data to migrate
   * @returns Number of entries migrated
   */
  async migrateSharedToIsolated(
    entries: Array<{
      id: string;
      vector: number[] | Float32Array;
      metadata?: Record<string, unknown>;
    }>,
    purpose: CollectionPurpose,
    tenantId: string,
  ): Promise<number> {
    this.validateTenantId(tenantId);

    const targetDb = await this.getCollection(tenantId, purpose);

    let migrated = 0;
    for (const entry of entries) {
      try {
        // Check if already exists in target (idempotent)
        const existing = await targetDb.get(entry.id);
        if (existing) continue;

        await targetDb.insert({
          id: entry.id,
          vector: entry.vector,
          metadata: entry.metadata,
        });
        migrated++;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Migration failed for entry ${String(entry.id)}: ${msg}`,
        );
      }
    }

    this.logger.log(
      `Migration complete: ${String(migrated)}/${String(entries.length)} entries ` +
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

  // -- Private Helpers ------------------------------------------------------

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
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
        `Invalid collection purpose: "${String(purpose)}". ` +
          `Allowed: ${COLLECTION_PURPOSES.join(', ')}`,
      );
    }
  }

  /**
   * Evict the least recently used collection from the cache.
   * Removes the reference to free memory.
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Evicted LRU collection: ${oldestKey}`);
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
      this.cache.delete(key);
    }

    if (staleKeys.length > 0) {
      this.logger.debug(
        `Evicted ${String(staleKeys.length)} stale collections: ${staleKeys.join(', ')}`,
      );
    }
  }
}
