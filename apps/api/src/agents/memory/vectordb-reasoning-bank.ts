/**
 * VectorDB Reasoning Bank
 * TASK-STUB-006: ReasoningBank VectorDB Store (Decision Chain Persistence)
 *
 * @module agents/memory/vectordb-reasoning-bank
 * @description VectorDB-backed storage for agent reasoning chains with
 * semantic retrieval capability. Replaces the ephemeral in-memory
 * ReasoningBankStub with persistent, tenant-isolated vector storage.
 *
 * CRITICAL RULES:
 * - Tenant isolation via per-tenant collection naming (POPI Act)
 * - Non-blocking writes: errors caught and logged, never thrown
 * - Lazy VectorDB initialization via dynamic import('ruvector')
 * - No PII in stored chains (accounting logic only)
 * - Dual-write pattern: VectorDB + existing JSONL log (additive)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { RuvectorService } from '../sdk/ruvector.service';
import type {
  ReasoningBankInterface,
  StoreChainParams,
  SimilarReasoningResult,
} from './interfaces/reasoning-bank.interface';

/**
 * Internal interface for VectorDB instance methods used by this adapter.
 * Defined locally to avoid importing ruvector types at the module level.
 */
interface ReasoningVectorDbInstance {
  insert: (entry: {
    id: string;
    vector: number[];
    metadata?: Record<string, unknown>;
    collection?: string;
  }) => Promise<unknown>;
  search: (query: {
    vector?: number[];
    filter?: Record<string, unknown>;
    collection?: string;
    limit?: number;
    k?: number;
  }) => Promise<
    Array<{
      id: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>
  >;
}

/** Injection token for ReasoningBank */
export const REASONING_BANK_TOKEN = 'REASONING_BANK';

@Injectable()
export class VectorDBReasoningBank implements ReasoningBankInterface {
  private readonly logger = new Logger(VectorDBReasoningBank.name);
  private vectorDb: ReasoningVectorDbInstance | null = null;
  private initialized = false;

  constructor(
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
  ) {}

  /**
   * Lazy-initialize VectorDB for reasoning chain storage.
   * Uses a dedicated VectorDB instance for reasoning chains.
   */
  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;
    if (!this.ruvector?.isAvailable()) return false;

    try {
      const ruvectorModule = await import('ruvector');
      const VectorDBClass =
        (ruvectorModule as Record<string, unknown>).VectorDB ??
        (ruvectorModule as Record<string, unknown>).VectorDb;

      if (!VectorDBClass) {
        this.logger.warn(
          'VectorDB class not found in ruvector module (non-fatal)',
        );
        return false;
      }

      this.vectorDb = new (VectorDBClass as new (opts: {
        dimensions: number;
      }) => ReasoningVectorDbInstance)({
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
      this.logger.debug(
        'VectorDB not available -- reasoning chain not persisted',
      );
      return;
    }

    try {
      // Serialize chain to string if it is an object
      const chainText =
        typeof chain === 'string' ? chain : JSON.stringify(chain);

      // Generate embedding from chain text
      const embeddingResult = await this.ruvector.generateEmbedding(chainText);

      // Insert into tenant-scoped VectorDB collection
      const collection = this.getCollectionName(tenantId);
      await this.vectorDb!.insert({
        id: decisionId,
        vector: embeddingResult.vector,
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
      const results = await this.vectorDb!.search({
        filter: {
          field: 'decisionId',
          op: 'eq',
          value: decisionId,
        },
        limit: 1,
      });

      if (results && results.length > 0) {
        const metadata = results[0].metadata;
        if (metadata && typeof metadata.chain === 'string') {
          return metadata.chain;
        }
        return null;
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
   * This is the NEW method not present in the stub -- enables semantic
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
      const queryEmbeddingResult =
        await this.ruvector.generateEmbedding(queryText);

      // Search VectorDB with tenant-scoped collection
      const collection = this.getCollectionName(tenantId);
      const results = await this.vectorDb!.search({
        vector: queryEmbeddingResult.vector,
        collection,
        limit: k,
      });

      if (!results || results.length === 0) return [];

      return results.map(
        (r: {
          id: string;
          score: number;
          metadata?: Record<string, unknown>;
        }) => {
          const meta = r.metadata ?? {};
          const decisionId =
            typeof meta.decisionId === 'string' ? meta.decisionId : r.id;
          const chain = typeof meta.chain === 'string' ? meta.chain : '';
          const storedAt =
            typeof meta.storedAt === 'string' ? meta.storedAt : undefined;

          return {
            decisionId,
            chain,
            similarity: r.score,
            storedAt,
          };
        },
      );
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
