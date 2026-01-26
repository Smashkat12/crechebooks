/**
 * Embedding Providers
 * TASK-STUB-001: EmbeddingService Real Provider Setup
 *
 * @module agents/sdk/embedding-provider
 * @description Pluggable embedding providers for ruvector's EmbeddingService.
 * - RequestyEmbeddingProvider: calls Requesty.ai /v1/embeddings (semantic, 1024d)
 * - OnnxFallbackProvider: wraps ruvector's built-in ONNX WASM embedder (semantic, 384d)
 *
 * CRITICAL RULES:
 * - Providers MUST be stateless and thread-safe
 * - NO direct ruvector imports in this file (except OnnxFallbackProvider's dynamic import)
 * - NO custom caching — ruvector's EmbeddingService handles LRU (10k entries, 1h TTL)
 */

import { Logger } from '@nestjs/common';

/**
 * ruvector EmbeddingProvider interface.
 * Defined locally to avoid importing ruvector types at the module level.
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

/**
 * Calls the Requesty.ai proxy for real semantic embeddings.
 * Uses OpenAI-compatible /v1/embeddings endpoint.
 *
 * Default model: voyage-3-lite (1024 dimensions, cost-effective).
 */
export class RequestyEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'requesty';
  private readonly logger = new Logger(RequestyEmbeddingProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions: number;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    dimensions?: number;
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
        Authorization: `Bearer ${this.apiKey}`,
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

/**
 * Wraps ruvector's built-in OnnxEmbedder for offline/fallback usage.
 * Model: all-MiniLM-L6-v2, 384 dimensions.
 * NOTE: This is a WASM-based local model — no API calls needed.
 */
export class OnnxFallbackProvider implements EmbeddingProvider {
  readonly name = 'onnx-fallback';
  private readonly logger = new Logger(OnnxFallbackProvider.name);
  private onnxEmbedder: {
    embed: (texts: string[]) => Promise<number[][]>;
  } | null = null;
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
        const OnnxEmbedder = (ruvector as Record<string, unknown>)[
          'OnnxEmbedder'
        ] as new () => { embed: (texts: string[]) => Promise<number[][]> };
        this.onnxEmbedder = new OnnxEmbedder();
      } else {
        this.logger.warn(
          'OnnxEmbedder not available in ruvector — ONNX fallback disabled',
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`ONNX embedder init failed: ${msg}`);
    }
  }
}
