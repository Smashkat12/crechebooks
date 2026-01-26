/**
 * Collection Manager Interfaces
 * TASK-STUB-010: Multi-Tenant Vector Collections
 *
 * @module agents/sdk/interfaces/collection-manager.interface
 * @description TypeScript types for tenant-isolated vector collection management.
 * Each tenant gets its own VectorDB collection per purpose, providing structural
 * isolation beyond metadata filtering (POPI Act compliance).
 */

/**
 * Pre-defined collection purposes for CrecheBooks agents.
 * Each purpose gets its own VectorDB collection per tenant.
 */
export type CollectionPurpose =
  | 'decisions'
  | 'reasoning'
  | 'patterns'
  | 'embeddings';

/**
 * Interface matching ruvector VectorDB (VectorDBWrapper) instance shape.
 * Defined locally to avoid issues with ruvector's non-exported type.
 */
export interface VectorDBInstance {
  insert: (entry: {
    id?: string;
    vector: Float32Array | number[];
    metadata?: Record<string, unknown>;
  }) => Promise<string>;
  insertBatch: (
    entries: Array<{
      id?: string;
      vector: Float32Array | number[];
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<string[]>;
  search: (query: {
    vector: Float32Array | number[];
    k: number;
    filter?: Record<string, unknown>;
    efSearch?: number;
  }) => Promise<
    Array<{
      id: string;
      score: number;
      vector?: Float32Array;
      metadata?: Record<string, unknown>;
    }>
  >;
  get: (id: string) => Promise<{
    id?: string;
    vector: Float32Array;
    metadata?: Record<string, unknown>;
  } | null>;
  delete: (id: string) => Promise<boolean>;
  len: () => Promise<number>;
  isEmpty: () => Promise<boolean>;
}

/**
 * A cache entry for an active VectorDB collection.
 */
export interface CollectionCacheEntry {
  /** The VectorDB instance for this collection */
  db: VectorDBInstance;
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
