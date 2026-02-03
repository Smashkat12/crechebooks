/**
 * PgVector Repository
 * TASK-PGVEC-001: PostgreSQL pgvector integration for AI embedding persistence
 *
 * @module database/repositories/pgvector.repository
 * @description Repository for vector embedding storage and similarity search
 * using PostgreSQL's pgvector extension. Provides tenant-scoped vector operations
 * with HNSW indexing for fast approximate nearest neighbor search.
 *
 * CRITICAL RULES:
 * - All operations MUST be tenant-scoped
 * - Uses raw SQL for vector operations (Prisma doesn't support vector type natively)
 * - Vectors are stored as 384-dimensional (MiniLM) by default
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

/** Result from similarity search */
export interface VectorSearchResult {
  id: string;
  contentId: string;
  contentType: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

/** Options for inserting a vector */
export interface VectorInsertOptions {
  tenantId: string;
  collection: string;
  contentId: string;
  contentType: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/** Options for similarity search */
export interface VectorSearchOptions {
  tenantId: string;
  collection: string;
  embedding: number[];
  limit: number;
  minScore?: number;
  contentType?: string;
}

/** Options for batch insert */
export interface VectorBatchInsertOptions {
  tenantId: string;
  collection: string;
  items: Array<{
    contentId: string;
    contentType: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>;
}

@Injectable()
export class PgVectorRepository implements OnModuleInit {
  private readonly logger = new Logger(PgVectorRepository.name);
  private extensionAvailable = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if pgvector extension is available on startup.
   * Non-fatal: service degrades gracefully if not available.
   */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.prisma.$queryRaw<
        Array<{ extname: string }>
      >`SELECT extname FROM pg_extension WHERE extname = 'vector'`;

      this.extensionAvailable = result.length > 0;

      if (this.extensionAvailable) {
        this.logger.log('pgvector extension is available');
      } else {
        this.logger.warn(
          'pgvector extension not found - vector operations will fail. ' +
            'Run: CREATE EXTENSION IF NOT EXISTS vector;',
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to check pgvector extension: ${msg}`);
      this.extensionAvailable = false;
    }
  }

  /**
   * Check if pgvector is available.
   */
  isAvailable(): boolean {
    return this.extensionAvailable;
  }

  /**
   * Generate SHA-256 hash of content for deduplication.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Format embedding array for PostgreSQL vector type.
   * @example [0.1, 0.2, 0.3] -> '[0.1,0.2,0.3]'
   */
  private formatVector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  /**
   * Insert or update a vector embedding.
   * Uses upsert to handle content changes (matched by contentHash).
   *
   * @throws Error if pgvector is not available
   */
  async upsert(options: VectorInsertOptions): Promise<string> {
    if (!this.extensionAvailable) {
      throw new Error(
        'pgvector extension not available. Run migration to enable.',
      );
    }

    const contentHash = this.hashContent(options.content);
    const vectorStr = this.formatVector(options.embedding);
    const metadataJson = options.metadata
      ? JSON.stringify(options.metadata)
      : null;

    // Use raw SQL for vector insert with ON CONFLICT upsert
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO vector_embeddings (
        id, tenant_id, collection, content_id, content_type,
        content_hash, embedding, metadata, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${options.tenantId},
        ${options.collection},
        ${options.contentId},
        ${options.contentType},
        ${contentHash},
        ${vectorStr}::vector,
        ${metadataJson}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (tenant_id, collection, content_id)
      DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `;

    return result[0].id;
  }

  /**
   * Batch insert multiple vectors efficiently.
   * Uses a single transaction for atomicity.
   *
   * @throws Error if pgvector is not available
   */
  async batchUpsert(options: VectorBatchInsertOptions): Promise<number> {
    if (!this.extensionAvailable) {
      throw new Error(
        'pgvector extension not available. Run migration to enable.',
      );
    }

    if (options.items.length === 0) return 0;

    // Build values for batch insert
    const values = options.items.map((item) => {
      const contentHash = this.hashContent(item.content);
      const vectorStr = this.formatVector(item.embedding);
      const metadataJson = item.metadata
        ? JSON.stringify(item.metadata)
        : 'null';

      return `(
        gen_random_uuid(),
        '${options.tenantId}',
        '${options.collection}',
        '${item.contentId}',
        '${item.contentType}',
        '${contentHash}',
        '${vectorStr}'::vector,
        '${metadataJson}'::jsonb,
        NOW(),
        NOW()
      )`;
    });

    const sql = `
      INSERT INTO vector_embeddings (
        id, tenant_id, collection, content_id, content_type,
        content_hash, embedding, metadata, created_at, updated_at
      ) VALUES ${values.join(',')}
      ON CONFLICT (tenant_id, collection, content_id)
      DO UPDATE SET
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `;

    await this.prisma.$executeRawUnsafe(sql);
    return options.items.length;
  }

  /**
   * Search for similar vectors using cosine similarity.
   * Returns results ordered by similarity score (higher = more similar).
   *
   * @throws Error if pgvector is not available
   */
  async searchSimilar(
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    if (!this.extensionAvailable) {
      throw new Error(
        'pgvector extension not available. Run migration to enable.',
      );
    }

    const vectorStr = this.formatVector(options.embedding);
    const minScore = options.minScore ?? 0;

    // Build content type filter if specified
    const contentTypeFilter = options.contentType
      ? `AND content_type = '${options.contentType}'`
      : '';

    // Use cosine similarity (1 - cosine_distance) for scoring
    // pgvector's <=> operator returns cosine distance, so we convert to similarity
    const sql = `
      SELECT
        id,
        content_id as "contentId",
        content_type as "contentType",
        1 - (embedding <=> '${vectorStr}'::vector) as score,
        metadata
      FROM vector_embeddings
      WHERE tenant_id = '${options.tenantId}'
        AND collection = '${options.collection}'
        ${contentTypeFilter}
        AND 1 - (embedding <=> '${vectorStr}'::vector) >= ${minScore}
      ORDER BY embedding <=> '${vectorStr}'::vector
      LIMIT ${options.limit}
    `;

    const results = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        contentId: string;
        contentType: string;
        score: number;
        metadata: Record<string, unknown> | null;
      }>
    >(sql);

    return results;
  }

  /**
   * Delete vectors by content ID.
   * Useful when the original content is deleted.
   */
  async deleteByContentId(
    tenantId: string,
    collection: string,
    contentId: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM vector_embeddings
      WHERE tenant_id = ${tenantId}
        AND collection = ${collection}
        AND content_id = ${contentId}
    `;
  }

  /**
   * Delete all vectors in a collection for a tenant.
   * Useful for re-indexing.
   */
  async deleteCollection(
    tenantId: string,
    collection: string,
  ): Promise<number> {
    const result = await this.prisma.$executeRaw`
      DELETE FROM vector_embeddings
      WHERE tenant_id = ${tenantId}
        AND collection = ${collection}
    `;
    return result;
  }

  /**
   * Get collection statistics.
   */
  async getCollectionStats(
    tenantId: string,
    collection: string,
  ): Promise<{ count: number; contentTypes: string[] }> {
    const countResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM vector_embeddings
      WHERE tenant_id = ${tenantId}
        AND collection = ${collection}
    `;

    const typesResult = await this.prisma.$queryRaw<
      Array<{ content_type: string }>
    >`
      SELECT DISTINCT content_type
      FROM vector_embeddings
      WHERE tenant_id = ${tenantId}
        AND collection = ${collection}
    `;

    return {
      count: Number(countResult[0]?.count ?? 0),
      contentTypes: typesResult.map((r) => r.content_type),
    };
  }

  /**
   * Check if a vector exists by content hash (for deduplication).
   */
  async existsByHash(
    tenantId: string,
    collection: string,
    contentHash: string,
  ): Promise<boolean> {
    const result = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1 FROM vector_embeddings
        WHERE tenant_id = ${tenantId}
          AND collection = ${collection}
          AND content_hash = ${contentHash}
      ) as exists
    `;
    return result[0]?.exists ?? false;
  }
}
