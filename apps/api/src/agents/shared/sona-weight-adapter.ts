/**
 * SONA Weight Adapter
 * TASK-STUB-005: SONA Scorer Adapter (SonaEngine Weight Optimization)
 *
 * @module agents/shared/sona-weight-adapter
 * @description Wraps ruvector's SonaEngine for trajectory-based LLM/heuristic
 * weight optimization. Implements the SONAScorerInterface expected by HybridScorer.
 *
 * CRITICAL RULES:
 * - Lazy-loads SonaEngine via dynamic import (graceful degradation)
 * - Returns null when engine unavailable or insufficient patterns (cold start)
 * - Never blocks the scoring flow — all operations wrapped in try/catch
 * - Heuristic weight never below 0.2 (safety floor)
 * - No PII in trajectories
 * - All monetary values in cents (integers)
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  SONAScorerInterface,
  SONAScorerWeights,
  SonaWeightContext,
  TrajectoryOutcome,
  SonaAdapterConfig,
} from './interfaces/sona-adapter.interface';

/**
 * Internal interface for the SonaEngine instance.
 *
 * ruvector's actual SonaEngine API:
 * - constructor(hiddenDim: number) or SonaEngine.withConfig(config)
 * - findPatterns(embedding, k) -> LearnedPattern[] (sync) with avgQuality field
 * - beginTrajectory(embedding) -> number (trajectory ID)
 * - addStep(trajId, activations, attentionWeights, reward)
 * - endTrajectory(trajId, quality)
 * - forceLearn() -> string
 *
 * We abstract this to isolate test mocking from the ruvector native types.
 */
interface SonaEngineInstance {
  findPatterns(
    embedding: Float32Array | number[],
    k: number,
  ): Array<{ quality: number; avgQuality?: number }>;
  beginTrajectory(embedding: Float32Array | number[]): number;
  addStep(
    trajectoryId: number,
    activations: Float32Array | number[],
    attentionWeights: Float32Array | number[],
    reward: number,
  ): void;
  endTrajectory(trajectoryId: number, quality: number): void;
  forceLearn(): string;
}

/** Default SONA config: max throughput preset for ~0.1ms adaptations */
const DEFAULT_SONA_CONFIG: SonaAdapterConfig = {
  microLoraRank: 2,
  qualityThreshold: 0.4,
  embeddingDimension: 256,
  patternSearchK: 5,
  minPatternsForAdaptation: 3,
  llmFavoredThreshold: 0.6,
  heuristicFavoredThreshold: 0.4,
};

/**
 * Amount bucket helper — converts cent amounts to named buckets
 * for deterministic context embedding.
 *
 * @param amountCents - Transaction amount in cents (integer)
 * @returns Named bucket string for embedding
 */
export function getAmountBucket(amountCents: number): string {
  if (amountCents < 1000) return 'micro'; // < R10
  if (amountCents < 10000) return 'small'; // R10-R100
  if (amountCents < 100000) return 'medium'; // R100-R1000
  if (amountCents < 1000000) return 'large'; // R1000-R10000
  if (amountCents < 5000000) return 'xlarge'; // R10000-R50000
  return 'xxlarge'; // > R50000
}

@Injectable()
export class SonaWeightAdapter implements SONAScorerInterface {
  private readonly logger = new Logger(SonaWeightAdapter.name);
  private sonaEngine: SonaEngineInstance | null = null;
  private readonly config: SonaAdapterConfig;

  constructor(config?: Partial<SonaAdapterConfig>) {
    this.config = { ...DEFAULT_SONA_CONFIG, ...config };
  }

  /**
   * Lazy-initialize SonaEngine from ruvector.
   * Returns null if ruvector is not available (graceful degradation).
   *
   * Uses SonaEngine.withConfig() for max_throughput-equivalent settings:
   * - microLoraRank: 2 (fast adaptations)
   * - qualityThreshold: 0.4
   * - hiddenDim matching embeddingDimension
   */
  private async getEngine(): Promise<SonaEngineInstance | null> {
    if (this.sonaEngine) return this.sonaEngine;

    try {
      const ruvector = await import('ruvector');
      const SonaEngineClass = ruvector.SonaEngine;

      // Use withConfig for max_throughput-equivalent settings
      const engine = SonaEngineClass.withConfig({
        hiddenDim: this.config.embeddingDimension,
        microLoraRank: this.config.microLoraRank,
        qualityThreshold: this.config.qualityThreshold,
      });

      this.sonaEngine = engine as unknown as SonaEngineInstance;
      this.logger.log(
        `SonaEngine initialized (hiddenDim=${String(this.config.embeddingDimension)}, ` +
          `microLoraRank=${String(this.config.microLoraRank)})`,
      );
      return this.sonaEngine;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SonaEngine initialization failed (non-fatal): ${msg}`);
      return null;
    }
  }

  /**
   * Get optimal LLM/heuristic weights for a given context.
   * Returns null if insufficient data (cold start) or engine unavailable.
   *
   * Algorithm:
   * 1. Hash context to 256d embedding vector
   * 2. findPatterns(embedding, k=5) to find similar historical contexts
   * 3. Average pattern quality distribution
   * 4. If quality > llmFavoredThreshold -> LLM-favored weights
   * 5. If quality < heuristicFavoredThreshold -> heuristic-favored weights
   * 6. If insufficient patterns -> return null (use defaults)
   */
  async getOptimalWeights(
    context: SonaWeightContext,
  ): Promise<SONAScorerWeights | null> {
    const engine = await this.getEngine();
    if (!engine) return null;

    try {
      const contextEmbedding = this.buildContextEmbedding(context);
      const patterns = engine.findPatterns(
        contextEmbedding,
        this.config.patternSearchK,
      );

      if (!patterns || patterns.length < this.config.minPatternsForAdaptation) {
        this.logger.debug(
          `Insufficient SONA patterns (${patterns?.length ?? 0}/${this.config.minPatternsForAdaptation}) ` +
            `for ${context.agentType}@${context.tenantId} — returning null`,
        );
        return null;
      }

      // Average quality across found patterns
      // ruvector LearnedPattern uses avgQuality; our mock interface uses quality
      const avgQuality =
        patterns.reduce(
          (sum: number, p: { quality: number; avgQuality?: number }) =>
            sum + (p.avgQuality ?? p.quality),
          0,
        ) / patterns.length;

      // Derive weights from quality distribution
      return this.deriveWeights(avgQuality);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SONA weight lookup failed: ${msg}`);
      return null;
    }
  }

  /**
   * Record a scoring outcome as a SONA trajectory for continual learning.
   *
   * @param context - The scoring context (tenant, agent type, etc.)
   * @param outcome - Whether the decision was correct, and confidence values
   */
  async recordOutcome(
    context: SonaWeightContext,
    outcome: TrajectoryOutcome,
  ): Promise<void> {
    const engine = await this.getEngine();
    if (!engine) return;

    try {
      const contextEmbedding = this.buildContextEmbedding(context);

      // Reward signal: +1.0 if correct, 0.0 if corrected
      const reward = outcome.wasCorrect ? 1.0 : 0.0;

      // Quality: how decisive the confidence was (0.5 = uncertain, 1.0 = decisive)
      const quality = Math.abs(outcome.confidence / 100 - 0.5) * 2;

      // Build activation vector from confidence values
      const activations = new Float32Array([
        outcome.llmConfidence / 100,
        outcome.heuristicConfidence / 100,
        outcome.confidence / 100,
        reward,
      ]);

      // Attention weights (simplified: equal attention to all dimensions)
      const attentionWeights = new Float32Array(
        this.config.embeddingDimension,
      ).fill(1.0 / this.config.embeddingDimension);

      // Record trajectory
      const trajId = engine.beginTrajectory(contextEmbedding);
      engine.addStep(trajId, activations, attentionWeights, reward);
      engine.endTrajectory(trajId, quality);

      this.logger.debug(
        `SONA trajectory recorded for ${context.agentType}@${context.tenantId}: ` +
          `reward=${reward}, quality=${quality.toFixed(3)}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SONA trajectory recording failed (non-fatal): ${msg}`);
    }
  }

  /**
   * Force consolidation of learned patterns.
   * Useful for manual checkpointing after batch corrections.
   */
  async forceLearning(): Promise<void> {
    const engine = await this.getEngine();
    if (!engine) return;

    try {
      engine.forceLearn();
      this.logger.log('SONA forced learning consolidation completed');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SONA forceLearning failed: ${msg}`);
    }
  }

  /**
   * Build a 256-dimensional context embedding from tenant + agent context.
   * Uses a deterministic hash-based approach (not learned embeddings).
   *
   * Components:
   * - tenantId hash -> first 64 dimensions
   * - agentType hash -> next 64 dimensions
   * - transactionType hash -> next 64 dimensions
   * - amountBucket hash -> final 64 dimensions
   */
  private buildContextEmbedding(context: SonaWeightContext): Float32Array {
    const dim = this.config.embeddingDimension;
    const embedding = new Float32Array(dim);
    const chunkSize = Math.floor(dim / 4);

    // Chunk 1: tenant identity
    const tenantHash = this.hashToFloats(context.tenantId, chunkSize);
    embedding.set(tenantHash, 0);

    // Chunk 2: agent type
    const agentHash = this.hashToFloats(context.agentType, chunkSize);
    embedding.set(agentHash, chunkSize);

    // Chunk 3: transaction type (optional)
    const txType = context.transactionType ?? 'unknown';
    const txHash = this.hashToFloats(txType, chunkSize);
    embedding.set(txHash, chunkSize * 2);

    // Chunk 4: amount bucket (log-scale bucket)
    const bucket = context.amountBucket ?? 'unknown';
    const bucketHash = this.hashToFloats(bucket, chunkSize);
    embedding.set(bucketHash, chunkSize * 3);

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  /**
   * Derive LLM/heuristic weights from average pattern quality.
   *
   * Quality distribution interpretation:
   * - High quality (> 0.6): LLM predictions were consistently more accurate
   *   -> favor LLM weights (e.g., 0.7 LLM / 0.3 heuristic)
   * - Low quality (< 0.4): Heuristic predictions were consistently more accurate
   *   -> favor heuristic weights (e.g., 0.3 LLM / 0.7 heuristic)
   * - Medium quality (0.4-0.6): Mixed results -> balanced weights
   */
  private deriveWeights(avgQuality: number): SONAScorerWeights {
    if (avgQuality > this.config.llmFavoredThreshold) {
      // LLM has been consistently better
      const llmWeight = 0.5 + (avgQuality - 0.5) * 0.4; // 0.54 to 0.70
      return {
        llm: Math.min(0.8, llmWeight), // Cap at 80% (min 20% heuristic)
        heuristic: Math.max(0.2, 1.0 - llmWeight),
      };
    }

    if (avgQuality < this.config.heuristicFavoredThreshold) {
      // Heuristic has been consistently better
      const heuristicWeight = 0.5 + (0.5 - avgQuality) * 0.4; // 0.54 to 0.70
      return {
        llm: Math.max(0.2, 1.0 - heuristicWeight),
        heuristic: Math.min(0.8, heuristicWeight),
      };
    }

    // Balanced — slight LLM preference
    return { llm: 0.55, heuristic: 0.45 };
  }

  /**
   * Hash a string into a Float32Array of pseudo-random values in [-1, 1].
   * Deterministic: same input always produces same output.
   */
  private hashToFloats(input: string, length: number): Float32Array {
    const hash = createHash('sha256').update(input).digest();
    const result = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      // Use 2 bytes per float for better distribution
      const byteIdx = (i * 2) % hash.length;
      const value =
        ((hash[byteIdx] << 8) | hash[(byteIdx + 1) % hash.length]) / 65535;
      result[i] = value * 2 - 1; // Map [0,1] to [-1,1]
    }

    return result;
  }
}
