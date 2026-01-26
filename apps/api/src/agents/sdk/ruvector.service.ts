/**
 * Ruvector Service
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 * TASK-STUB-001: EmbeddingService Real Provider Setup
 *
 * @module agents/sdk/ruvector.service
 * @description Service for vector database operations using ruvector.
 * Provides embedding generation, similarity search, and tenant-scoped
 * collection management for agent context retrieval.
 *
 * CRITICAL RULES:
 * - Initialization failure is non-fatal (service degrades gracefully)
 * - Operations on an uninitialized service MUST throw descriptive errors
 * - No silent error swallowing
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmbeddingResult,
  EmbeddingProviderType,
} from './interfaces/embedding.interface';
import {
  RequestyEmbeddingProvider,
  OnnxFallbackProvider,
} from './embedding-provider';
import type { EmbeddingProvider } from './embedding-provider';

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
    filter?: Record<string, unknown>;
  }) => Promise<
    Array<{ id: string; score: number; metadata?: Record<string, unknown> }>
  >;
  insert: (entry: {
    id: string;
    vector: number[];
    metadata?: Record<string, unknown>;
  }) => Promise<string>;
}

/**
 * Internal interface for ruvector's EmbeddingService.
 * Defined locally to avoid importing ruvector types at the module level.
 */
interface EmbeddingServiceInstance {
  embedOne: (text: string, provider?: string) => Promise<number[]>;
  registerProvider?: (provider: {
    name: string;
    embed: (texts: string[]) => Promise<number[][]>;
    getDimensions: () => number;
  }) => void;
  selectProvider?: (name: string) => void;
}

/**
 * Interface for the ruvector module shape used by this service.
 * Defined to decouple from the actual ruvector import.
 */
export interface RuvectorModule {
  VectorDb?: new (opts: {
    dimensions: number;
    distanceMetric: string;
    storagePath?: string;
  }) => VectorDbInstance;
  VectorDB?: new (opts: {
    dimensions: number;
    distanceMetric: string;
    storagePath?: string;
  }) => VectorDbInstance;
  EmbeddingService?: new () => EmbeddingServiceInstance;
  createEmbeddingService?: () => EmbeddingServiceInstance;
}

/** Default VectorDb storage path */
const DEFAULT_STORAGE_PATH = './data/vectors.db';

@Injectable()
export class RuvectorService implements OnModuleInit {
  private readonly logger = new Logger(RuvectorService.name);
  private initialized = false;
  private readonly enabled: boolean;
  private readonly pgExtension: boolean;
  private vectorDb: VectorDbInstance | null = null;
  private embeddingService: EmbeddingServiceInstance | null = null;
  private activeProvider: EmbeddingProviderType = 'onnx-fallback';
  private activeDimensions = 384;
  private fallbackProviders: EmbeddingProvider[] = [];

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

      const storagePath = this.configService.get<string>(
        'RUVECTOR_STORAGE_PATH',
        DEFAULT_STORAGE_PATH,
      );

      this.vectorDb = new VectorDbClass({
        dimensions: 384,
        distanceMetric: 'cosine',
        storagePath,
      });

      // Initialize the embedding service
      if (typeof ruvectorModule.createEmbeddingService === 'function') {
        this.embeddingService = ruvectorModule.createEmbeddingService();
      } else if (ruvectorModule.EmbeddingService) {
        this.embeddingService = new ruvectorModule.EmbeddingService();
      }

      // Register embedding providers
      this.registerProviders();

      this.initialized = true;
      this.logger.log(
        `Ruvector initialized successfully (pgExtension=${String(this.pgExtension)}, ` +
          `provider=${this.activeProvider}, dimensions=${String(this.activeDimensions)})`,
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
   * Register embedding providers and select default.
   * Provider priority: env override → requesty (if API key) → onnx-fallback
   */
  private registerProviders(): void {
    if (!this.embeddingService) return;

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    const baseUrl = this.configService.get<string>(
      'ANTHROPIC_BASE_URL',
      'https://router.requesty.ai/v1',
    );
    const providerOverride =
      this.configService.get<string>('EMBEDDING_PROVIDER');

    // Always register onnx-fallback
    const onnxProvider = new OnnxFallbackProvider();
    this.fallbackProviders.push(onnxProvider);
    if (this.embeddingService.registerProvider) {
      this.embeddingService.registerProvider(onnxProvider);
    }

    // Register requesty if API key is available
    if (apiKey) {
      const requestyProvider = new RequestyEmbeddingProvider({
        baseUrl,
        apiKey,
      });
      this.fallbackProviders.unshift(requestyProvider); // Primary fallback
      if (this.embeddingService.registerProvider) {
        this.embeddingService.registerProvider(requestyProvider);
      }
    }

    // Select active provider
    let selectedProvider: EmbeddingProviderType;
    if (
      providerOverride === 'onnx-fallback' ||
      providerOverride === 'requesty'
    ) {
      selectedProvider = providerOverride;
    } else if (apiKey) {
      selectedProvider = 'requesty';
    } else {
      selectedProvider = 'onnx-fallback';
    }

    this.activeProvider = selectedProvider;
    this.activeDimensions = selectedProvider === 'requesty' ? 1024 : 384;

    if (this.embeddingService.selectProvider) {
      this.embeddingService.selectProvider(selectedProvider);
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
   * Get the dimensionality of the active embedding provider.
   * Returns 384 (default) when not initialized.
   */
  getActiveDimensions(): number {
    return this.activeDimensions;
  }

  /**
   * Get a tenant-scoped collection name.
   * Format: {collectionType}-{tenantId}
   *
   * @param collectionType - Collection type (e.g., 'decisions', 'episodes', 'patterns')
   * @param tenantId - Tenant ID
   * @returns Tenant-scoped collection name
   */
  getTenantCollection(collectionType: string, tenantId: string): string {
    return `${collectionType}-${tenantId}`;
  }

  /**
   * Generate an embedding vector for the given text.
   * Returns an EmbeddingResult with vector, provider info, dimensions, and timing.
   *
   * @param text - The text to generate an embedding for
   * @returns EmbeddingResult with the embedding vector and metadata
   * @throws Error if ruvector is not initialized or all providers fail
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
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

    const startTime = Date.now();

    // Try primary embedding service
    try {
      const vector = await this.embeddingService.embedOne(text);
      return {
        vector,
        provider: this.activeProvider,
        dimensions: vector.length,
        durationMs: Date.now() - startTime,
      };
    } catch (primaryError) {
      const primaryMsg =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);
      this.logger.warn(`Primary embedding failed: ${primaryMsg}`);

      // Try fallback providers
      for (const provider of this.fallbackProviders) {
        try {
          const results = await provider.embed([text]);
          if (results.length > 0) {
            return {
              vector: results[0],
              provider: provider.name as EmbeddingProviderType,
              dimensions: results[0].length,
              durationMs: Date.now() - startTime,
            };
          }
        } catch (fallbackError: unknown) {
          const msg =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          this.logger.warn(`Fallback provider ${provider.name} failed: ${msg}`);
        }
      }

      throw new Error('All embedding providers failed');
    }
  }

  /**
   * Insert a vector into a tenant-scoped collection.
   *
   * @param collectionType - Collection type
   * @param tenantId - Tenant ID
   * @param id - Unique vector ID
   * @param vector - The vector to store
   * @param metadata - Optional metadata
   * @throws Error if ruvector is not initialized
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
      metadata: {
        ...metadata,
        _collection: collection,
        _tenantId: tenantId,
      },
    });
  }

  /**
   * Search within a tenant-scoped collection.
   *
   * @param collectionType - Collection type
   * @param tenantId - Tenant ID
   * @param queryVector - The query embedding vector
   * @param limit - Maximum results to return
   * @returns Array of search results
   * @throws Error if ruvector is not initialized
   */
  async searchTenantCollection(
    collectionType: string,
    tenantId: string,
    queryVector: number[],
    limit: number,
  ): Promise<RuvectorSearchResult[]> {
    if (!this.initialized || !this.vectorDb) {
      throw new Error('Ruvector not initialized');
    }

    const collection = this.getTenantCollection(collectionType, tenantId);

    const results = await this.vectorDb.search({
      vector: queryVector,
      k: limit * 2, // Over-fetch to account for filtering
      filter: { _collection: collection },
    });

    return results.slice(0, limit).map((result) => ({
      id: result.id,
      score: result.score,
      metadata: result.metadata,
    }));
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
