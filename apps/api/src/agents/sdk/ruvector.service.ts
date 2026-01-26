/**
 * Ruvector Service
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk/ruvector.service
 * @description Service for vector database operations using ruvector.
 * Provides embedding generation and similarity search for agent context retrieval.
 *
 * CRITICAL RULES:
 * - Initialization failure is non-fatal (service degrades gracefully)
 * - Operations on an uninitialized service MUST throw descriptive errors
 * - No silent error swallowing
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Search result from ruvector similarity search.
 */
export interface RuvectorSearchResult {
  /** ID of the matched vector */
  id: string;
  /** Similarity score (0-1, higher is better) */
  score: number;
  /** Associated metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal interface for the ruvector VectorDb instance.
 * Defined locally to avoid importing ruvector types at the module level.
 */
interface VectorDbInstance {
  search: (query: {
    vector: number[] | Float32Array;
    k: number;
  }) => Promise<
    Array<{ id: string; score: number; metadata?: Record<string, unknown> }>
  >;
}

/**
 * Internal interface for ruvector's EmbeddingService.
 * Defined locally to avoid importing ruvector types at the module level.
 */
interface EmbeddingServiceInstance {
  embedOne: (text: string, provider?: string) => Promise<number[]>;
}

/**
 * Interface for the ruvector module shape used by this service.
 * Defined to decouple from the actual ruvector import.
 */
export interface RuvectorModule {
  VectorDb?: new (opts: {
    dimensions: number;
    distanceMetric: string;
  }) => VectorDbInstance;
  VectorDB?: new (opts: {
    dimensions: number;
    distanceMetric: string;
  }) => VectorDbInstance;
  EmbeddingService?: new () => EmbeddingServiceInstance;
  createEmbeddingService?: () => EmbeddingServiceInstance;
}

@Injectable()
export class RuvectorService implements OnModuleInit {
  private readonly logger = new Logger(RuvectorService.name);
  private initialized = false;
  private readonly enabled: boolean;
  private readonly pgExtension: boolean;
  private vectorDb: VectorDbInstance | null = null;
  private embeddingService: EmbeddingServiceInstance | null = null;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('RUVECTOR_ENABLED') === 'true';
    this.pgExtension =
      this.configService.get<string>('RUVECTOR_PG_EXTENSION') === 'true';
  }

  /**
   * Load the ruvector module dynamically.
   * Protected so tests can override this method to inject mocks.
   * @returns The loaded ruvector module
   */
  protected async loadRuvectorModule(): Promise<RuvectorModule> {
    return (await import('ruvector')) as unknown as RuvectorModule;
  }

  /**
   * Initialize the ruvector service on module startup.
   * Failure is non-fatal: the service will report as unavailable.
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Ruvector is disabled (RUVECTOR_ENABLED != true)');
      return;
    }

    try {
      const ruvectorModule = await this.loadRuvectorModule();
      const VectorDbClass = ruvectorModule.VectorDb ?? ruvectorModule.VectorDB;

      if (!VectorDbClass) {
        throw new Error('VectorDb/VectorDB class not found in ruvector module');
      }

      this.vectorDb = new VectorDbClass({
        dimensions: 384, // Standard embedding dimension
        distanceMetric: 'cosine',
      });

      // Initialize the embedding service using ruvector's built-in provider
      if (typeof ruvectorModule.createEmbeddingService === 'function') {
        this.embeddingService = ruvectorModule.createEmbeddingService();
      } else if (ruvectorModule.EmbeddingService) {
        this.embeddingService = new ruvectorModule.EmbeddingService();
      }

      this.initialized = true;
      this.logger.log(
        `Ruvector initialized successfully (pgExtension=${String(this.pgExtension)}, embeddingService=${String(!!this.embeddingService)})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Ruvector initialization failed (non-fatal): ${errorMessage}`,
      );
      this.initialized = false;
    }
  }

  /**
   * Check whether ruvector is available and initialized.
   * @returns true if the service initialized successfully
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Generate an embedding vector for the given text.
   * @param text - The text to generate an embedding for
   * @returns Array of floating-point numbers representing the embedding
   * @throws Error if ruvector is not initialized or embedding service is unavailable
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.initialized) {
      throw new Error(
        'Ruvector is not initialized. Check RUVECTOR_ENABLED env var and ruvector package installation.',
      );
    }

    if (!this.embeddingService) {
      throw new Error(
        'Ruvector embedding service is not available. The ruvector module did not provide an EmbeddingService.',
      );
    }

    try {
      const embedding = await this.embeddingService.embedOne(text);
      return embedding;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Embedding generation failed: ${errorMessage}`);
      throw new Error(`Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Search for similar vectors in a collection.
   * @param embedding - The query embedding vector
   * @param _collection - The collection name (reserved for future multi-collection support)
   * @param limit - Maximum number of results to return
   * @returns Array of search results with scores
   * @throws Error if ruvector is not initialized
   */
  async searchSimilar(
    embedding: number[],
    _collection: string,
    limit: number,
  ): Promise<RuvectorSearchResult[]> {
    if (!this.initialized || !this.vectorDb) {
      throw new Error(
        'Ruvector is not initialized. Check RUVECTOR_ENABLED env var and ruvector package installation.',
      );
    }

    try {
      const results = await this.vectorDb.search({
        vector: embedding,
        k: limit,
      });

      return results.map((result) => ({
        id: result.id,
        score: result.score,
        metadata: result.metadata,
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Similarity search failed: ${errorMessage}`);
      throw new Error(`Failed to search similar vectors: ${errorMessage}`);
    }
  }
}
