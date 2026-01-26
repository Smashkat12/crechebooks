<task_spec id="TASK-STUB-005" version="2.0">

<metadata>
  <title>SONA Scorer Adapter (SonaEngine Weight Optimization)</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>805</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-SONA-SCORER</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `SONAScorer` stub in `apps/api/src/agents/shared/hybrid-scorer.ts` (lines 29-36)
  has `getOptimalWeights(context)` that always returns `null`. The `HybridScorer` class
  uses this stub via the `SONA_SCORER` injection token with `@Optional() @Inject()`.
  When `getOptimalWeights()` returns `null`, the scorer falls back to hardcoded default
  weights: 60% LLM, 40% heuristic (`DEFAULT_LLM_WEIGHT = 0.6`, `DEFAULT_HEURISTIC_WEIGHT = 0.4`).

  This means ALL agents across ALL tenants always use the same 60/40 blend regardless
  of their actual accuracy history. A categorizer agent that is 95% accurate with
  heuristics alone still pays for LLM calls that get 60% weight, while a matcher agent
  that is only 30% accurate with heuristics gets the same treatment.

  **Gap Analysis:**
  - `SONAScorer.getOptimalWeights()` always returns `null` (stub, line 33)
  - No adaptive weight optimization based on actual accuracy data
  - No trajectory recording for learning from scoring outcomes
  - No per-tenant, per-agent weight differentiation
  - No MicroLoRA instant weight adaptation
  - No EWC++ catastrophic forgetting prevention
  - The `SONA_SCORER_TOKEN` injection token exists but is never provided by any module
  - The `HybridScorer` correctly handles the `null` return (falls back to defaults),
    so replacing the stub is safe and backward-compatible

  **Existing Architecture:**
  The `HybridScorer` (lines 49-157) is well-structured:
  - `combine(llmConfidence, heuristicConfidence, context)` is the public API
  - `getWeights(context)` calls `sonaScorer.getOptimalWeights(context)` and falls back
    to defaults when it returns `null`
  - `enforceMinHeuristicWeight(weights)` enforces a minimum 20% heuristic weight
    (safety floor for financial operations) and normalizes weights to sum to 1.0
  - The `ScoringWeights` interface is `{ llm: number; heuristic: number }`
  - The `HybridScore` result includes `sonaWeights` for observability

  **ruvector SonaEngine:**
  ruvector v0.1.96 provides `SonaEngine` — a Rust-native trajectory-based optimization
  engine with:
  - `SonaConfig.max_throughput()` preset: micro_lora_rank: 2, quality_threshold: 0.4
  - `beginTrajectory(embedding)` / `addStep(activations, attentionWeights, reward)` /
    `endTrajectory(quality)` — trajectory lifecycle for recording outcomes
  - `findPatterns(queryEmbedding, k)` — finds k most similar historical trajectories
  - MicroLoRA (~0.1ms) for instant weight adaptation between trajectories
  - EWC++ (Elastic Weight Consolidation) for preventing catastrophic forgetting

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - Vector/ML: `ruvector` v0.1.96 (SonaEngine, MicroLoRA, EWC++)
  - Existing Service: `RuvectorService` from `apps/api/src/agents/sdk/ruvector.service.ts`
  - Testing: Jest
  - All monetary values: integers (cents)

  **Files to Create:**
  - `apps/api/src/agents/shared/sona-weight-adapter.ts` — Wraps SonaEngine with SONAScorer interface
  - `apps/api/src/agents/shared/interfaces/sona-adapter.interface.ts` — Type definitions
  - `apps/api/tests/agents/shared/sona-weight-adapter.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/shared/hybrid-scorer.ts` — Replace SONAScorer stub with SonaWeightAdapter
    provider registration via the `SONA_SCORER_TOKEN`
  - Module registrations (shared module or the module that provides HybridScorer)
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands:
  ```bash
  pnpm run build
  pnpm test
  pnpm run lint
  ```

  ### 2. SonaWeightAdapter Class
  The adapter wraps ruvector's `SonaEngine` and implements the `SONAScorer` interface
  expected by `HybridScorer`. It MUST be a drop-in replacement for the existing stub:
  ```typescript
  // apps/api/src/agents/shared/sona-weight-adapter.ts
  import { Injectable, Logger } from '@nestjs/common';
  import type { SonaEngine, SonaConfig, SonaTrajectory } from 'ruvector';
  import { createHash } from 'crypto';
  import type {
    SONAScorerInterface,
    SONAScorerWeights,
    SonaWeightContext,
    TrajectoryOutcome,
    SonaAdapterConfig,
  } from './interfaces/sona-adapter.interface';

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

  @Injectable()
  export class SonaWeightAdapter implements SONAScorerInterface {
    private readonly logger = new Logger(SonaWeightAdapter.name);
    private sonaEngine: SonaEngine | null = null;
    private readonly config: SonaAdapterConfig;

    constructor(config?: Partial<SonaAdapterConfig>) {
      this.config = { ...DEFAULT_SONA_CONFIG, ...config };
    }

    /**
     * Lazy-initialize SonaEngine from ruvector.
     * Returns null if ruvector is not available (graceful degradation).
     */
    private async getEngine(): Promise<SonaEngine | null> {
      if (this.sonaEngine) return this.sonaEngine;

      try {
        const { SonaEngine: SonaEngineClass, SonaConfig: SonaConfigClass } =
          await import('ruvector');
        const sonaConfig = SonaConfigClass.max_throughput();
        this.sonaEngine = new SonaEngineClass(sonaConfig);
        this.logger.log('SonaEngine initialized (max_throughput preset)');
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
     * 4. If quality > llmFavoredThreshold → LLM-favored weights
     * 5. If quality < heuristicFavoredThreshold → heuristic-favored weights
     * 6. If insufficient patterns → return null (use defaults)
     */
    async getOptimalWeights(
      context: SonaWeightContext,
    ): Promise<SONAScorerWeights | null> {
      const engine = await this.getEngine();
      if (!engine) return null;

      try {
        const contextEmbedding = this.buildContextEmbedding(context);
        const patterns = await engine.findPatterns(
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
        const avgQuality = patterns.reduce(
          (sum: number, p: { quality: number }) => sum + p.quality, 0,
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
        await engine.forceLearning();
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
     * - tenantId hash → first 64 dimensions
     * - agentType hash → next 64 dimensions
     * - transactionType hash → next 64 dimensions
     * - amountBucket hash → final 64 dimensions
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
      const norm = Math.sqrt(
        embedding.reduce((sum, v) => sum + v * v, 0),
      );
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
     *   → favor LLM weights (e.g., 0.7 LLM / 0.3 heuristic)
     * - Low quality (< 0.4): Heuristic predictions were consistently more accurate
     *   → favor heuristic weights (e.g., 0.3 LLM / 0.7 heuristic)
     * - Medium quality (0.4-0.6): Mixed results → balanced weights
     */
    private deriveWeights(avgQuality: number): SONAScorerWeights {
      if (avgQuality > this.config.llmFavoredThreshold) {
        // LLM has been consistently better
        const llmWeight = 0.5 + (avgQuality - 0.5) * 0.4; // 0.54 to 0.70
        return {
          llm: Math.min(0.8, llmWeight),  // Cap at 80% (min 20% heuristic)
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
        const value = ((hash[byteIdx] << 8) | hash[(byteIdx + 1) % hash.length]) / 65535;
        result[i] = value * 2 - 1; // Map [0,1] to [-1,1]
      }

      return result;
    }
  }
  ```

  ### 3. Interfaces for SONA Adapter
  ```typescript
  // apps/api/src/agents/shared/interfaces/sona-adapter.interface.ts

  /**
   * Weights returned by SONA scorer.
   * Must sum to 1.0 and respect MIN_HEURISTIC_WEIGHT (0.2).
   */
  export interface SONAScorerWeights {
    llm: number;
    heuristic: number;
  }

  /**
   * Context provided to SONA for weight lookup.
   * Used to build the context embedding for pattern matching.
   */
  export interface SonaWeightContext {
    tenantId: string;
    agentType: string;
    transactionType?: string;
    amountBucket?: string;
  }

  /**
   * Interface matching the SONAScorer stub contract in hybrid-scorer.ts.
   * SonaWeightAdapter implements this interface.
   */
  export interface SONAScorerInterface {
    getOptimalWeights(
      context: SonaWeightContext,
    ): Promise<SONAScorerWeights | null>;
  }

  /**
   * Outcome data for recording a scoring trajectory.
   * Used by SonaWeightAdapter.recordOutcome().
   */
  export interface TrajectoryOutcome {
    /** Whether the agent decision was correct (true) or corrected (false) */
    wasCorrect: boolean;
    /** Final hybrid confidence (0-100) */
    confidence: number;
    /** LLM component confidence (0-100) */
    llmConfidence: number;
    /** Heuristic component confidence (0-100) */
    heuristicConfidence: number;
  }

  /**
   * Configuration for the SONA weight adapter.
   */
  export interface SonaAdapterConfig {
    /** MicroLoRA rank for instant adaptation (default: 2) */
    microLoraRank: number;
    /** Minimum quality threshold for patterns (default: 0.4) */
    qualityThreshold: number;
    /** Embedding dimension for context vectors (default: 256) */
    embeddingDimension: number;
    /** Number of patterns to search for (default: 5) */
    patternSearchK: number;
    /** Minimum patterns needed before adapting weights (default: 3) */
    minPatternsForAdaptation: number;
    /** Quality threshold above which LLM is favored (default: 0.6) */
    llmFavoredThreshold: number;
    /** Quality threshold below which heuristic is favored (default: 0.4) */
    heuristicFavoredThreshold: number;
  }
  ```

  ### 4. Integration into HybridScorer
  The existing `hybrid-scorer.ts` must be modified to:
  1. Remove the local `SONAScorer` stub class (lines 29-36)
  2. Import `SonaWeightAdapter` and its interface
  3. Keep the `SONA_SCORER_TOKEN` injection token
  4. Keep the `@Optional() @Inject()` pattern — falls back gracefully when no provider

  ```typescript
  // In apps/api/src/agents/shared/hybrid-scorer.ts — changes needed:

  // REMOVE: the local SONAScorer stub class (lines 29-36)
  // REMOVE: the local SONAScorerWeights interface (lines 24-27)

  // ADD: import from interface
  import type { SONAScorerInterface, SONAScorerWeights } from './interfaces/sona-adapter.interface';

  // The constructor stays the same — @Optional() @Inject(SONA_SCORER_TOKEN) handles
  // the case where SonaWeightAdapter is not registered (returns undefined, falls back
  // to a no-op default that returns null).

  // UPDATE: constructor to use interface type
  constructor(
    @Optional()
    @Inject(SONA_SCORER_TOKEN)
    sonaScorer?: SONAScorerInterface,
  ) {
    this.sonaScorer = sonaScorer ?? { getOptimalWeights: async () => null };
  }
  ```

  ### 5. Module Registration
  ```typescript
  // In the module that provides HybridScorer, register SonaWeightAdapter:
  import { SonaWeightAdapter } from './sona-weight-adapter';

  const SONA_SCORER_TOKEN = 'SONA_SCORER';

  @Module({
    providers: [
      HybridScorer,
      {
        provide: SONA_SCORER_TOKEN,
        useFactory: () => {
          try {
            return new SonaWeightAdapter();
          } catch {
            return undefined; // @Optional() handles this
          }
        },
      },
    ],
    exports: [HybridScorer],
  })
  export class SharedAgentModule {}
  ```

  ### 6. Context Embedding: Hash-Based Approach
  Context vectors are NOT generated by a neural embedding model. Instead, we use
  deterministic SHA-256 hashing to produce a 256d vector from:
  - `tenantId` — first 64 dimensions
  - `agentType` — next 64 dimensions
  - `transactionType` — next 64 dimensions (e.g., 'debit', 'credit', 'reversal', 'fee')
  - `amountBucket` — final 64 dimensions (e.g., '0-1000', '1000-10000', '10000+')

  This is intentionally simple. The SONA patterns group similar contexts together via
  trajectory rewards, not via embedding quality. The hash just provides a stable
  coordinate in embedding space.

  ```typescript
  // Amount bucket helper (for use by callers)
  export function getAmountBucket(amountCents: number): string {
    if (amountCents < 1000) return 'micro';        // < R10
    if (amountCents < 10000) return 'small';       // R10-R100
    if (amountCents < 100000) return 'medium';     // R100-R1000
    if (amountCents < 1000000) return 'large';     // R1000-R10000
    if (amountCents < 5000000) return 'xlarge';    // R10000-R50000
    return 'xxlarge';                               // > R50000
  }
  ```

  ### 7. Trajectory Recording Flow
  After a scoring outcome is known (decision confirmed correct or corrected), the
  caller records it:
  ```typescript
  // Example: after correction feedback is received
  await sonaAdapter.recordOutcome(
    {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
      transactionType: 'debit',
      amountBucket: getAmountBucket(250000), // 'medium'
    },
    {
      wasCorrect: false,        // Decision was corrected
      confidence: 85,           // Original hybrid confidence
      llmConfidence: 90,        // LLM component
      heuristicConfidence: 75,  // Heuristic component
    },
  );
  ```

  ### 8. Cold Start Behavior
  When the SONA engine has no prior trajectories:
  - `findPatterns()` returns an empty array
  - `getOptimalWeights()` returns `null`
  - `HybridScorer` uses default 60/40 weights
  - This is the correct behavior — no adaptation until enough data exists

  ### 9. Safety Constraints
  - The `HybridScorer.enforceMinHeuristicWeight()` method (existing code, lines 133-156)
    ALWAYS enforces a minimum 20% heuristic weight regardless of what SONA returns
  - SONA can return weights like `{ llm: 0.85, heuristic: 0.15 }` and the enforcer
    will normalize to `{ llm: 0.80, heuristic: 0.20 }`
  - This safety floor is NOT modified by this task — it is a business rule

  ### 10. Testing Pattern
  ```typescript
  describe('SonaWeightAdapter', () => {
    let adapter: SonaWeightAdapter;

    beforeEach(() => {
      adapter = new SonaWeightAdapter();
    });

    describe('getOptimalWeights', () => {
      it('should return null when SonaEngine is unavailable', async () => {
        // SonaEngine import will fail in test environment (no ruvector native binary)
        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });
        expect(result).toBeNull();
      });

      it('should return null when insufficient patterns (cold start)', async () => {
        // Mock engine with empty patterns
        const mockEngine = {
          findPatterns: jest.fn().mockResolvedValue([]),
          beginTrajectory: jest.fn(),
          addStep: jest.fn(),
          endTrajectory: jest.fn(),
          forceLearning: jest.fn(),
        };
        (adapter as any).sonaEngine = mockEngine;

        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });
        expect(result).toBeNull();
      });

      it('should return LLM-favored weights when quality > 0.6', async () => {
        const mockEngine = {
          findPatterns: jest.fn().mockResolvedValue([
            { quality: 0.8 },
            { quality: 0.75 },
            { quality: 0.7 },
          ]),
        };
        (adapter as any).sonaEngine = mockEngine;

        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });

        expect(result).not.toBeNull();
        expect(result!.llm).toBeGreaterThan(0.5);
        expect(result!.heuristic).toBeLessThan(0.5);
        expect(result!.llm + result!.heuristic).toBeCloseTo(1.0);
      });

      it('should return heuristic-favored weights when quality < 0.4', async () => {
        const mockEngine = {
          findPatterns: jest.fn().mockResolvedValue([
            { quality: 0.2 },
            { quality: 0.3 },
            { quality: 0.25 },
          ]),
        };
        (adapter as any).sonaEngine = mockEngine;

        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });

        expect(result).not.toBeNull();
        expect(result!.heuristic).toBeGreaterThan(0.5);
        expect(result!.llm).toBeLessThan(0.5);
      });

      it('should return balanced weights for medium quality', async () => {
        const mockEngine = {
          findPatterns: jest.fn().mockResolvedValue([
            { quality: 0.5 },
            { quality: 0.45 },
            { quality: 0.55 },
          ]),
        };
        (adapter as any).sonaEngine = mockEngine;

        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });

        expect(result).not.toBeNull();
        expect(result!.llm).toBeCloseTo(0.55, 1);
        expect(result!.heuristic).toBeCloseTo(0.45, 1);
      });

      it('should never return heuristic weight below 0.2', async () => {
        const mockEngine = {
          findPatterns: jest.fn().mockResolvedValue([
            { quality: 0.99 },
            { quality: 0.98 },
            { quality: 0.97 },
          ]),
        };
        (adapter as any).sonaEngine = mockEngine;

        const result = await adapter.getOptimalWeights({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        });

        expect(result).not.toBeNull();
        expect(result!.heuristic).toBeGreaterThanOrEqual(0.2);
      });
    });

    describe('recordOutcome', () => {
      it('should not throw when engine is unavailable', async () => {
        await expect(
          adapter.recordOutcome(
            { tenantId: 't1', agentType: 'categorizer' },
            { wasCorrect: true, confidence: 85, llmConfidence: 90, heuristicConfidence: 75 },
          ),
        ).resolves.not.toThrow();
      });

      it('should record trajectory with correct reward signal', async () => {
        const beginMock = jest.fn().mockReturnValue('traj-1');
        const addStepMock = jest.fn();
        const endMock = jest.fn();

        const mockEngine = {
          beginTrajectory: beginMock,
          addStep: addStepMock,
          endTrajectory: endMock,
        };
        (adapter as any).sonaEngine = mockEngine;

        await adapter.recordOutcome(
          { tenantId: 't1', agentType: 'categorizer' },
          { wasCorrect: true, confidence: 85, llmConfidence: 90, heuristicConfidence: 75 },
        );

        expect(beginMock).toHaveBeenCalledTimes(1);
        expect(addStepMock).toHaveBeenCalledWith(
          'traj-1',
          expect.any(Float32Array),
          expect.any(Float32Array),
          1.0, // correct → reward 1.0
        );
        expect(endMock).toHaveBeenCalledWith(
          'traj-1',
          expect.closeTo(0.7, 1), // quality = abs(0.85 - 0.5) * 2
        );
      });

      it('should record 0.0 reward for incorrect decisions', async () => {
        const addStepMock = jest.fn();
        const mockEngine = {
          beginTrajectory: jest.fn().mockReturnValue('traj-2'),
          addStep: addStepMock,
          endTrajectory: jest.fn(),
        };
        (adapter as any).sonaEngine = mockEngine;

        await adapter.recordOutcome(
          { tenantId: 't1', agentType: 'matcher' },
          { wasCorrect: false, confidence: 40, llmConfidence: 50, heuristicConfidence: 30 },
        );

        expect(addStepMock).toHaveBeenCalledWith(
          'traj-2',
          expect.any(Float32Array),
          expect.any(Float32Array),
          0.0, // incorrect → reward 0.0
        );
      });
    });

    describe('buildContextEmbedding', () => {
      it('should produce deterministic embeddings for same input', () => {
        const ctx = { tenantId: 'abc', agentType: 'categorizer' };
        const emb1 = (adapter as any).buildContextEmbedding(ctx);
        const emb2 = (adapter as any).buildContextEmbedding(ctx);
        expect(emb1).toEqual(emb2);
      });

      it('should produce different embeddings for different tenants', () => {
        const emb1 = (adapter as any).buildContextEmbedding({
          tenantId: 'tenant-a', agentType: 'categorizer',
        });
        const emb2 = (adapter as any).buildContextEmbedding({
          tenantId: 'tenant-b', agentType: 'categorizer',
        });
        expect(emb1).not.toEqual(emb2);
      });

      it('should produce 256-dimensional Float32Array', () => {
        const emb = (adapter as any).buildContextEmbedding({
          tenantId: 't1', agentType: 'categorizer',
        });
        expect(emb).toBeInstanceOf(Float32Array);
        expect(emb.length).toBe(256);
      });

      it('should produce unit-normalized embeddings', () => {
        const emb = (adapter as any).buildContextEmbedding({
          tenantId: 't1', agentType: 'categorizer',
        });
        const norm = Math.sqrt(emb.reduce((s: number, v: number) => s + v * v, 0));
        expect(norm).toBeCloseTo(1.0, 3);
      });
    });

    describe('forceLearning', () => {
      it('should not throw when engine is unavailable', async () => {
        await expect(adapter.forceLearning()).resolves.not.toThrow();
      });

      it('should call engine.forceLearning when available', async () => {
        const forceMock = jest.fn().mockResolvedValue(undefined);
        (adapter as any).sonaEngine = { forceLearning: forceMock };

        await adapter.forceLearning();
        expect(forceMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('HybridScorer with SonaWeightAdapter integration', () => {
    it('should use SONA-derived weights when available', async () => {
      // Mock SonaWeightAdapter returning LLM-favored weights
      const sonaAdapter = {
        getOptimalWeights: jest.fn().mockResolvedValue({ llm: 0.7, heuristic: 0.3 }),
      };
      const scorer = new HybridScorer(sonaAdapter as any);

      const result = await scorer.combine(90, 60, {
        tenantId: 't1',
        agentType: 'categorizer',
      });

      // Expected: 90 * 0.7 + 60 * 0.3 = 63 + 18 = 81
      expect(result.score).toBe(81);
      expect(result.source).toBe('HYBRID');
      expect(result.sonaWeights).toEqual({ llm: 0.7, heuristic: 0.3 });
    });

    it('should fall back to defaults when SONA returns null', async () => {
      const sonaAdapter = {
        getOptimalWeights: jest.fn().mockResolvedValue(null),
      };
      const scorer = new HybridScorer(sonaAdapter as any);

      const result = await scorer.combine(90, 60, {
        tenantId: 't1',
        agentType: 'categorizer',
      });

      // Default: 90 * 0.6 + 60 * 0.4 = 54 + 24 = 78
      expect(result.score).toBe(78);
    });
  });
  ```

  ### 11. Monetary Values
  ALL amounts are in cents (integers). The `amountBucket` helper converts cents to
  buckets for context embedding:
  ```typescript
  // CORRECT — cents to bucket
  getAmountBucket(250000)  // 'medium' (R2,500)

  // WRONG — never use floating-point for money
  // getAmountBucket(2500.00)
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks uses a hybrid scoring approach that combines LLM inference confidence
  with rule-based heuristic confidence. The relative weighting of these two signals
  directly affects categorization accuracy and cost:

  - **Higher LLM weight** → better accuracy for novel transactions but higher API costs
  - **Higher heuristic weight** → lower costs but misses novel patterns
  - **Optimal balance** varies by tenant (some have very consistent transaction patterns,
    others have diverse spending) and by agent type (categorizer vs matcher)

  The SONA scorer provides this optimization automatically by learning from correction
  feedback. As users correct agent decisions, SONA records trajectories and discovers
  which weight balance produces the best outcomes for each context.

  ## SA Compliance Notes
  - All monetary values in cents (integers) — R1,500.00 = 150000
  - The 20% minimum heuristic weight is a financial safety constraint — ensures
    deterministic patterns always have meaningful influence on decisions
  - SARS-related decisions always require L2 human review regardless of weight
    optimization (this is enforced elsewhere, not in the scorer)

  ## Architectural Decisions
  1. **Lazy loading**: SonaEngine is imported dynamically via `import('ruvector')` to
     avoid blocking application startup if the native binary is unavailable
  2. **Hash-based embeddings**: Context vectors use SHA-256 hashing, not neural
     embeddings. This is intentional — the context dimensions (tenantId, agentType)
     are categorical, not semantic. SONA learns from trajectory rewards, not
     embedding quality.
  3. **Cold start safety**: Returns `null` when fewer than 3 patterns exist, ensuring
     the system never adapts weights based on insufficient data
  4. **Non-blocking recording**: Trajectory recording failures are caught and logged
     but never block the scoring flow
  5. **Backward compatibility**: The `SonaWeightAdapter` implements the exact same
     interface as the existing stub, so `HybridScorer` requires zero logic changes
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `SonaWeightAdapter` class wrapping `SonaEngine` from ruvector
    - Implement `getOptimalWeights(context)` with pattern-based weight derivation
    - Implement `recordOutcome(context, outcome)` for trajectory recording
    - Implement `forceLearning()` for manual consolidation
    - Implement deterministic hash-based context embedding (256d, SHA-256)
    - Implement weight derivation logic: quality > 0.6 → LLM-favored, < 0.4 → heuristic-favored
    - Implement cold start handling (return null when < 3 patterns)
    - Create `SonaAdapterConfig` interface with sensible defaults (max_throughput preset)
    - Create `SONAScorerInterface`, `SONAScorerWeights`, `SonaWeightContext`, `TrajectoryOutcome` interfaces
    - Create `getAmountBucket()` utility function for amount-to-bucket conversion
    - Modify `hybrid-scorer.ts`: remove local stub class, import interface types
    - Register `SonaWeightAdapter` as `SONA_SCORER_TOKEN` provider in shared module
    - Lazy-load ruvector SonaEngine via dynamic import (graceful degradation)
    - MicroLoRA configuration via SonaConfig.max_throughput() preset
    - Unit tests: weight derivation (LLM-favored, heuristic-favored, balanced, cold start)
    - Unit tests: trajectory recording (correct/incorrect reward signals, quality computation)
    - Unit tests: context embedding (determinism, dimensionality, normalization, differentiation)
    - Unit tests: forceLearning delegation
    - Integration tests: HybridScorer with SonaWeightAdapter (SONA-derived weights, null fallback)
    - All existing HybridScorer tests still pass
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
  </in_scope>

  <out_of_scope>
    - BaseLoRA (deeper adaptation — future task, SONA uses MicroLoRA only)
    - ONNX embeddings for context vectors (using hash-based approach instead)
    - Batch weight recomputation or scheduled optimization jobs
    - Neural embedding model for context vectors (hash-based is sufficient)
    - Changing the HybridScorer's `enforceMinHeuristicWeight()` logic (keep as-is)
    - Changing the MIN_HEURISTIC_WEIGHT constant (0.2 — business rule)
    - Accuracy tracking service integration (TASK-SDK-009 scope)
    - EWC++ Fisher information computation (handled internally by SonaEngine)
    - Production deployment of ruvector native binary (deployment task)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/shared/sona-weight-adapter.ts
ls -la apps/api/src/agents/shared/interfaces/sona-adapter.interface.ts
ls -la apps/api/tests/agents/shared/sona-weight-adapter.spec.ts

# 2. Build succeeds
cd apps/api && pnpm run build

# 3. Run SONA adapter tests
pnpm test -- --testPathPattern="sona-weight-adapter" --runInBand

# 4. Run existing hybrid scorer tests (regression check)
pnpm test -- --testPathPattern="hybrid-scorer" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify SONAScorer stub is removed from hybrid-scorer.ts
grep -n "class SONAScorer" apps/api/src/agents/shared/hybrid-scorer.ts && echo "FAIL: stub still present" || echo "PASS: stub removed"

# 8. Verify SonaWeightAdapter implements interface
grep -n "implements SONAScorerInterface" apps/api/src/agents/shared/sona-weight-adapter.ts

# 9. Verify lazy loading of ruvector
grep -n "import('ruvector')" apps/api/src/agents/shared/sona-weight-adapter.ts

# 10. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/shared/sona-weight-adapter.ts && echo "FAIL: found 'any'" || echo "PASS: no 'any'"
grep -rn ": any" apps/api/src/agents/shared/interfaces/sona-adapter.interface.ts && echo "FAIL" || echo "PASS"

# 11. Verify SONA_SCORER_TOKEN is still used in hybrid-scorer.ts
grep "SONA_SCORER_TOKEN" apps/api/src/agents/shared/hybrid-scorer.ts

# 12. Verify @Optional() @Inject() pattern preserved
grep -n "@Optional()" apps/api/src/agents/shared/hybrid-scorer.ts

# 13. Verify weights always sum to ~1.0 (spot check test output)
pnpm test -- --testPathPattern="sona-weight-adapter" --verbose 2>&1 | grep -i "weight"

# 14. Verify embedding dimension is 256
grep "256" apps/api/src/agents/shared/sona-weight-adapter.ts | head -3
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `SonaWeightAdapter` class created implementing `SONAScorerInterface`
  - [ ] `SonaWeightAdapter.getOptimalWeights(context)` returns adaptive weights based on SONA patterns
  - [ ] `SonaWeightAdapter.getOptimalWeights()` returns `null` when engine unavailable (graceful degradation)
  - [ ] `SonaWeightAdapter.getOptimalWeights()` returns `null` when < 3 patterns found (cold start)
  - [ ] `SonaWeightAdapter.getOptimalWeights()` returns LLM-favored weights when avg quality > 0.6
  - [ ] `SonaWeightAdapter.getOptimalWeights()` returns heuristic-favored weights when avg quality < 0.4
  - [ ] `SonaWeightAdapter.getOptimalWeights()` returns balanced weights for quality 0.4-0.6
  - [ ] Weights returned by adapter always have heuristic >= 0.2 (safety floor enforced at adapter level too)
  - [ ] Weights returned by adapter always sum to 1.0 (within floating-point precision)
  - [ ] `SonaWeightAdapter.recordOutcome()` records SONA trajectory with correct reward signal
  - [ ] Reward signal: +1.0 for correct decisions, 0.0 for corrected decisions
  - [ ] Quality signal: `abs(confidence/100 - 0.5) * 2` (how decisive the prediction was)
  - [ ] `SonaWeightAdapter.forceLearning()` delegates to `SonaEngine.forceLearning()`
  - [ ] `SonaWeightAdapter.forceLearning()` is safe to call when engine unavailable
  - [ ] SonaEngine is lazy-loaded via `import('ruvector')` (not top-level import)
  - [ ] SonaEngine uses `SonaConfig.max_throughput()` preset (micro_lora_rank: 2, quality_threshold: 0.4)
  - [ ] Context embedding is 256-dimensional Float32Array
  - [ ] Context embedding is deterministic (same input → same output)
  - [ ] Context embedding is unit-normalized (L2 norm = 1.0)
  - [ ] Context embedding differentiates by tenantId, agentType, transactionType, amountBucket
  - [ ] `getAmountBucket()` utility function correctly buckets cent amounts
  - [ ] `SONAScorerInterface` interface created with `getOptimalWeights()` method signature
  - [ ] `SONAScorerWeights` interface created with `llm` and `heuristic` fields
  - [ ] `SonaWeightContext` interface created with `tenantId`, `agentType`, optional `transactionType`, `amountBucket`
  - [ ] `TrajectoryOutcome` interface created with `wasCorrect`, `confidence`, `llmConfidence`, `heuristicConfidence`
  - [ ] `SonaAdapterConfig` interface created with all configurable parameters and defaults
  - [ ] Local `SONAScorer` stub class REMOVED from `hybrid-scorer.ts`
  - [ ] Local `SONAScorerWeights` interface REMOVED from `hybrid-scorer.ts` (replaced by import)
  - [ ] `HybridScorer` constructor uses `SONAScorerInterface` type (imported)
  - [ ] `@Optional() @Inject(SONA_SCORER_TOKEN)` pattern PRESERVED in `HybridScorer`
  - [ ] `SonaWeightAdapter` registered as `SONA_SCORER_TOKEN` provider in module
  - [ ] All existing `HybridScorer` tests still pass (zero regressions)
  - [ ] Non-blocking: all SONA operations wrapped in try/catch, never throw
  - [ ] Unit tests: weight derivation — LLM-favored, heuristic-favored, balanced, cold start
  - [ ] Unit tests: trajectory recording — correct reward (1.0), incorrect reward (0.0), quality computation
  - [ ] Unit tests: context embedding — determinism, dimensionality (256), normalization, differentiation
  - [ ] Unit tests: forceLearning — delegation, safe when unavailable
  - [ ] Integration tests: HybridScorer + SonaWeightAdapter — SONA weights used, null fallback to defaults
  - [ ] Test coverage >= 90% for new files
  - [ ] Zero `any` types in new/modified files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER use `any` type** — use proper TypeScript interfaces and generics
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER block the scoring flow on SONA operations** — all SONA calls must be wrapped in try/catch with graceful fallback to null
  - **NEVER return heuristic weight below 0.2** — this is a financial safety constraint enforced at multiple levels (both adapter and HybridScorer)
  - **NEVER modify the `enforceMinHeuristicWeight()` logic** — it is a business rule safety floor
  - **NEVER modify the `MIN_HEURISTIC_WEIGHT` constant** — 0.2 is a business rule
  - **NEVER use a top-level `import` for ruvector** — use `import('ruvector')` lazy loading to avoid breaking startup when native binary is missing
  - **NEVER use neural embeddings for context vectors** — use deterministic SHA-256 hash-based approach; SONA learns from rewards, not embedding quality
  - **NEVER store PII in trajectories** — context contains only tenantId, agentType, transactionType, amountBucket (no payee names, descriptions, or amounts)
  - **NEVER adapt weights with fewer than 3 patterns** — insufficient data leads to unreliable adaptation; return null and let HybridScorer use defaults
  - **NEVER hardcode weights in the adapter** — always derive from SONA patterns or return null
  - **NEVER make real API calls in tests** — always mock SonaEngine
  - **NEVER modify the HybridScorer's combine() logic** — only replace the stub provider
  - **NEVER store floating-point monetary values** — always integer cents
  - **NEVER remove the `SONA_SCORER_TOKEN` injection pattern** — it provides the backward-compatible integration point
  - **NEVER throw from recordOutcome** — trajectory recording failures must be caught and logged silently
</anti_patterns>

</task_spec>
