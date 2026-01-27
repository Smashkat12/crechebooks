/**
 * GNN Pattern Adapter
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * @module agents/memory/gnn-pattern-adapter
 * @description Wraps RuvectorLayer + differentiableSearch to provide
 * graph-based pattern learning and prediction for transaction categorization.
 *
 * CRITICAL RULES:
 * - All ruvector/GNN calls use .catch() fire-and-forget (never block main flow)
 * - Tenant isolation: all cache keys include tenantId prefix
 * - Lazy imports: import('ruvector') dynamic import, NOT top-level
 * - Dual-write: GNN-learned patterns ALSO create Prisma PayeePattern with source: 'LEARNED_GNN'
 * - Zero 'any' types: use RuvectorLayerInstance interface
 * - Graceful degradation when ruvector is unavailable
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { RuvectorService } from '../sdk/ruvector.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { GraphBuilder, NODE_EMBEDDING_DIM } from './graph-builder';
import type {
  GnnPatternInterface,
  GnnLearnInput,
  GnnPredictInput,
  GnnPrediction,
  GnnAdapterConfig,
} from './interfaces/gnn-pattern.interface';

/** Injection token for GNN pattern learner */
export const GNN_PATTERN_TOKEN = 'GNN_PATTERN_LEARNER';

/** Injection token for optional GNN adapter config */
export const GNN_ADAPTER_CONFIG = 'GNN_ADAPTER_CONFIG';

/** GNN hidden dimension (output of RuvectorLayer) */
const GNN_HIDDEN_DIM = 256;
/** GNN attention heads */
const GNN_ATTENTION_HEADS = 4;

/**
 * Local typed interface for the RuvectorLayer instance.
 * Avoids using 'any' when calling methods on the dynamically loaded layer.
 */
interface RuvectorLayerInstance {
  forward(
    nodeEmbedding: Float32Array,
    neighborEmbeddings: Float32Array[],
    edgeWeights: Float32Array,
  ): Promise<Float32Array>;
  computeFisherInformation?: () => Promise<void>;
}

/**
 * Local typed interface for differentiableSearch result.
 */
interface DifferentiableSearchResult {
  index: number;
  score: number;
  attentionWeights?: Float32Array;
}

/**
 * Local typed interface for TensorCompress utility.
 */
interface TensorCompressStatic {
  compress(data: Float32Array, ratio: number): Float32Array;
}

const DEFAULT_GNN_CONFIG: GnnAdapterConfig = {
  inputDim: NODE_EMBEDDING_DIM, // 448
  hiddenDim: GNN_HIDDEN_DIM, // 256
  attentionHeads: GNN_ATTENTION_HEADS, // 4
  searchTemperature: 0.1,
  searchTopK: 5,
  compressThreshold: 10, // Compress embeddings accessed < 10 times
  ewcLambda: 0.5, // EWC regularization strength
};

@Injectable()
export class GnnPatternAdapter implements GnnPatternInterface {
  private readonly logger = new Logger(GnnPatternAdapter.name);
  private ruvectorLayer: RuvectorLayerInstance | null = null;
  private initialized = false;
  private readonly config: GnnAdapterConfig;
  private readonly graphBuilder: GraphBuilder;

  /** Cache of graph-aware embeddings for differentiable search */
  private readonly embeddingCache: Map<string, Float32Array> = new Map();
  /** Access count for TensorCompress decisions */
  private readonly accessCounts: Map<string, number> = new Map();

  constructor(
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(GNN_ADAPTER_CONFIG)
    config?: Partial<GnnAdapterConfig>,
  ) {
    this.config = { ...DEFAULT_GNN_CONFIG, ...config };
    this.graphBuilder = new GraphBuilder();
  }

  /**
   * Lazy-initialize RuvectorLayer from ruvector.
   */
  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      const ruvectorModule = await import('ruvector');
      const RuvectorLayerClass = (ruvectorModule as Record<string, unknown>)[
        'RuvectorLayer'
      ] as new (
        inputDim: number,
        hiddenDim: number,
        attentionHeads: number,
      ) => RuvectorLayerInstance;

      if (!RuvectorLayerClass) {
        throw new Error('RuvectorLayer class not found in ruvector module');
      }

      this.ruvectorLayer = new RuvectorLayerClass(
        this.config.inputDim, // 448
        this.config.hiddenDim, // 256
        this.config.attentionHeads, // 4
      );
      this.initialized = true;
      this.logger.log(
        `GNN RuvectorLayer initialized (${String(this.config.inputDim)}->${String(this.config.hiddenDim)}, ${String(this.config.attentionHeads)} heads)`,
      );
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RuvectorLayer initialization failed (non-fatal): ${msg}`,
      );
      return false;
    }
  }

  /**
   * Learn a pattern from a correction.
   * Builds a node embedding, passes it through the GNN layer with neighbor
   * embeddings, and stores the graph-aware embedding for future search.
   *
   * Dual-write: also creates Prisma PayeePattern (source: 'LEARNED_GNN').
   */
  async learnPattern(input: GnnLearnInput): Promise<void> {
    const ready = await this.ensureInitialized();
    if (!ready) {
      this.logger.debug('GNN not available -- pattern learning skipped');
      return;
    }

    try {
      // Build node embedding for this transaction
      const nodeEmb = this.graphBuilder.buildNodeEmbedding({
        payeeName: input.payeeName,
        accountCode: input.accountCode,
        accountName: input.accountName,
        amountCents: input.amountCents,
        isCredit: input.isCredit,
      });

      // Get neighbor embeddings (other transactions with same payee or account)
      const neighborEmbs = this.getNeighborEmbeddings(
        input.tenantId,
        input.payeeName,
        input.accountCode,
      );

      // Build edge weights (confidence-based)
      const edgeWeights = neighborEmbs.map(() => 0.5); // Equal weight for now

      // Forward pass through GNN layer -> graph-aware embedding
      const layer = this.ruvectorLayer!;
      const graphAwareEmb: Float32Array = await layer.forward(
        nodeEmb,
        neighborEmbs,
        new Float32Array(edgeWeights),
      );

      // Cache the graph-aware embedding for differentiable search
      const cacheKey = this.buildCacheKey(
        input.tenantId,
        input.payeeName,
        input.accountCode,
      );
      this.embeddingCache.set(cacheKey, graphAwareEmb);
      this.accessCounts.set(cacheKey, 0);

      this.logger.debug(
        `GNN pattern learned: ${input.payeeName} -> ${input.accountCode} ` +
          `(${String(neighborEmbs.length)} neighbors, ${String(graphAwareEmb.length)}d embedding)`,
      );

      // Dual-write: create Prisma PayeePattern with source 'LEARNED_GNN'
      await this.createPrismaPattern(input);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GNN learnPattern failed (non-fatal): ${msg}`);
    }
  }

  /**
   * Predict account code for a new transaction using differentiable search.
   * Returns null if insufficient data or GNN unavailable.
   */
  async predict(input: GnnPredictInput): Promise<GnnPrediction | null> {
    const ready = await this.ensureInitialized();
    if (!ready || this.embeddingCache.size === 0) return null;

    try {
      // Build query node embedding
      const queryEmb = this.graphBuilder.buildNodeEmbedding({
        payeeName: input.payeeName,
        accountCode: '', // Unknown -- this is what we are predicting
        amountCents: input.amountCents,
        isCredit: input.isCredit,
      });

      // Get neighbor embeddings
      const neighborEmbs = this.getNeighborEmbeddings(
        input.tenantId,
        input.payeeName,
      );

      // Forward pass -> graph-aware query embedding
      const layer = this.ruvectorLayer!;
      const queryGraphEmb: Float32Array = await layer.forward(
        queryEmb,
        neighborEmbs,
        new Float32Array(neighborEmbs.map(() => 0.5)),
      );

      // Differentiable search over cached embeddings
      const ruvectorModule = await import('ruvector');
      const differentiableSearchFn = (
        ruvectorModule as Record<string, unknown>
      )['differentiableSearch'] as (
        query: Float32Array,
        candidates: Float32Array[],
        topK: number,
        temperature: number,
      ) => DifferentiableSearchResult[];

      const candidates = Array.from(this.embeddingCache.entries()).filter(
        ([key]) => key.startsWith(`${input.tenantId}:`),
      );

      if (candidates.length === 0) return null;

      const candidateEmbs = candidates.map(([, emb]) => emb);
      const results = differentiableSearchFn(
        queryGraphEmb,
        candidateEmbs,
        Math.min(this.config.searchTopK, candidates.length),
        this.config.searchTemperature,
      );

      if (!results || results.length === 0) return null;

      // Extract prediction from best match
      const bestIdx = results[0].index;
      const bestKey = candidates[bestIdx][0];
      const parts = bestKey.split(':');
      const accountCode = parts[parts.length - 1];
      const similarity = results[0].score;

      // Update access count
      this.accessCounts.set(bestKey, (this.accessCounts.get(bestKey) ?? 0) + 1);

      // TensorCompress: compress infrequently accessed embeddings
      await this.compressInfrequentEmbeddings();

      return {
        accountCode,
        confidence: Math.round(similarity * 100),
        source: 'LEARNED_GNN',
        neighbors: neighborEmbs.length,
        attentionWeights: results[0].attentionWeights,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GNN predict failed: ${msg}`);
      return null;
    }
  }

  /**
   * Apply EWC: store Fisher information after a batch of corrections
   * to prevent catastrophic forgetting of previously learned patterns.
   */
  async consolidateEWC(): Promise<void> {
    if (!this.initialized || !this.ruvectorLayer) return;

    try {
      const layer = this.ruvectorLayer;
      if (typeof layer.computeFisherInformation === 'function') {
        await layer.computeFisherInformation();
        this.logger.log('EWC Fisher information consolidated');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`EWC consolidation failed: ${msg}`);
    }
  }

  /**
   * Get neighbor embeddings for a node (other transactions with same payee or account).
   */
  private getNeighborEmbeddings(
    tenantId: string,
    payeeName: string,
    accountCode?: string,
  ): Float32Array[] {
    const neighbors: Float32Array[] = [];

    // Look up cached embeddings that share this payee or account
    for (const [key, emb] of this.embeddingCache.entries()) {
      if (!key.startsWith(`${tenantId}:`)) continue;

      const normalizedPayee = payeeName.toLowerCase().trim();
      if (
        key.includes(normalizedPayee) ||
        (accountCode && key.includes(accountCode))
      ) {
        neighbors.push(emb);
        if (neighbors.length >= 10) break; // Cap neighbors
      }
    }

    return neighbors;
  }

  /**
   * Build a cache key for a pattern embedding.
   */
  private buildCacheKey(
    tenantId: string,
    payeeName: string,
    accountCode: string,
  ): string {
    const normalizedPayee = payeeName.toLowerCase().trim();
    return `${tenantId}:${normalizedPayee}:${accountCode}`;
  }

  /**
   * Dual-write: create Prisma PayeePattern with source 'LEARNED_GNN'.
   */
  private async createPrismaPattern(input: GnnLearnInput): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.payeePattern.upsert({
        where: {
          tenantId_payeePattern: {
            tenantId: input.tenantId,
            payeePattern: input.payeeName.toLowerCase().trim(),
          },
        },
        create: {
          tenantId: input.tenantId,
          payeePattern: input.payeeName.toLowerCase().trim(),
          defaultAccountCode: input.accountCode,
          defaultAccountName: input.accountName ?? input.accountCode,
          source: 'LEARNED_GNN',
          isActive: true,
        },
        update: {
          defaultAccountCode: input.accountCode,
          defaultAccountName: input.accountName ?? input.accountCode,
          source: 'LEARNED_GNN',
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GNN Prisma pattern upsert failed: ${msg}`);
    }
  }

  /**
   * TensorCompress: compress embeddings that have been accessed fewer than
   * `compressThreshold` times. Uses ruvector's TensorCompress for lossy
   * compression to reduce memory footprint.
   */
  private async compressInfrequentEmbeddings(): Promise<void> {
    try {
      const ruvectorModule = await import('ruvector');
      const TensorCompressUtil = (ruvectorModule as Record<string, unknown>)[
        'TensorCompress'
      ] as TensorCompressStatic | undefined;

      if (!TensorCompressUtil) return;

      for (const [key, count] of this.accessCounts.entries()) {
        if (count < this.config.compressThreshold) {
          const emb = this.embeddingCache.get(key);
          if (emb) {
            const compressed = TensorCompressUtil.compress(emb, 0.5); // 50% compression
            this.embeddingCache.set(key, compressed);
          }
        }
      }
    } catch {
      // TensorCompress not available -- skip compression
    }
  }
}
