/**
 * Embedding Interfaces
 * TASK-STUB-001: EmbeddingService Real Provider Setup
 *
 * @module agents/sdk/interfaces/embedding.interface
 * @description CrecheBooks-specific embedding interfaces and types
 * for the ruvector-based vector database integration.
 *
 * Providers:
 * - 'requesty': Requesty.ai proxy (Voyage/OpenAI, 1024d, semantic)
 * - 'onnx-fallback': Local ONNX WASM (all-MiniLM-L6-v2, 384d, semantic)
 * - 'local-ngram': Built-in n-gram hashing (256d, non-semantic, last resort)
 */

/**
 * Supported embedding providers for CrecheBooks.
 * - 'requesty': Requesty.ai proxy (Voyage/OpenAI, 1024d, semantic)
 * - 'onnx-fallback': Local ONNX WASM (all-MiniLM-L6-v2, 384d, semantic)
 * - 'local-ngram': Built-in n-gram hashing (256d, non-semantic, last resort)
 */
export type EmbeddingProviderType =
  | 'requesty'
  | 'onnx-fallback'
  | 'local-ngram';

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
