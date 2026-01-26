<task_spec id="TASK-STUB-003" version="2.0">

<metadata>
  <title>LearningEngine Router Replacement</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>803</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `MultiModelRouter` stub class defined locally in
  `apps/api/src/agents/shared/scoring-router.ts` (lines 25-32) has a `selectPath()`
  method that always returns `null`. This causes the `ScoringRouter.getPreferredPath()`
  method to always fall through to the accuracy-based recommendation from
  `AccuracyTracker`. When the `AccuracyTracker` has fewer than 50 samples (which is
  the case for new tenants and during early production), it returns `'HYBRID'` with
  default 60/40 weights. This means:
  - Every agent always uses the same 60/40 LLM/heuristic split regardless of context
  - No per-tenant, per-agent learning happens over time
  - There is no reinforcement learning to adapt routing based on observed outcomes
  - The system cannot discover that "for this tenant, the heuristic is always right
    for payroll transactions, but the LLM is better for ad-hoc purchases"

  Similarly, the `SONAScorer` stub in `apps/api/src/agents/shared/hybrid-scorer.ts`
  (lines 29-36) has `getOptimalWeights()` that always returns `null`, causing the
  `HybridScorer` to always use default 60/40 weights.

  **Gap Analysis:**
  - `MultiModelRouter.selectPath()` always returns `null` — no intelligent routing
  - `SONAScorer.getOptimalWeights()` always returns `null` — no adaptive weighting
  - No reinforcement learning agent to learn from outcome feedback
  - No state representation for routing decisions (tenant + agent type + context)
  - No reward signal design (what constitutes a "good" routing decision?)
  - No integration with ruvector's `LearningEngine` which provides 9 RL algorithms
  - No epsilon-greedy exploration for discovering better routing paths
  - AccuracyTracker only kicks in after 50 samples — cold start is entirely default

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm (NEVER npm)
  - Language: TypeScript (strict mode)
  - Testing: Jest
  - ruvector v0.1.96: `LearningEngine` — 9 RL algorithms (Q-learning, SARSA,
    Double-Q, Actor-Critic, PPO, Decision Transformer, Monte Carlo, TD-lambda, DQN).
    Task-specific defaults: `agent-routing` → Double-Q learning.
    `getBestAction(taskType, stateKey, availableActions)` → `{ action, confidence }`.
    `update(taskType, { state, action, reward, nextState, done })` — RL update.
    Epsilon-greedy exploration (configurable, default 0.1).
  - Existing stubs: `MultiModelRouter` (scoring-router.ts), `SONAScorer` (hybrid-scorer.ts)
  - Existing infrastructure: `ScoringRouter` uses `AccuracyTracker` as fallback,
    `HybridScorer` combines LLM + heuristic scores with weights

  **Files to Create:**
  - `apps/api/src/agents/shared/learning-router.ts` — Wraps ruvector `LearningEngine`
    with CrecheBooks routing interface
  - `apps/api/src/agents/shared/interfaces/learning-router.interface.ts` — Router interfaces
  - `apps/api/tests/agents/shared/learning-router.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/shared/scoring-router.ts` — Replace `MultiModelRouter` stub
    with `LearningRouter` injection
  - `apps/api/src/agents/shared/hybrid-scorer.ts` — Replace `SONAScorer` stub with
    `LearningRouter` for adaptive weight selection
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. LearningEngine from ruvector
  ```typescript
  import { LearningEngine } from 'ruvector';

  // LearningEngine provides 9 RL algorithms with task-specific defaults.
  // API:
  //   getBestAction(taskType, stateKey, availableActions):
  //     Promise<{ action: string; confidence: number }>
  //   update(taskType, transition): Promise<void>
  //   getQValues(taskType, stateKey): Promise<Record<string, number>>
  //   setAlgorithm(taskType, algorithm): void
  //   setEpsilon(taskType, epsilon): void
  //
  // Transition shape:
  //   { state: string; action: string; reward: number;
  //     nextState: string; done: boolean }
  //
  // Task-specific defaults:
  //   'agent-routing' → Double-Q learning (reduces overestimation bias)
  //   'exploration'   → Actor-Critic
  //   'optimization'  → PPO
  //
  // Epsilon-greedy: default 0.1 (10% random exploration)
  //
  // Configuration:
  //   new LearningEngine({ defaultEpsilon?: number; discountFactor?: number })
  //   defaultEpsilon: default 0.1
  //   discountFactor: default 0.95 (gamma)
  ```

  ### 3. LearningRouter Implementation
  ```typescript
  import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import type {
    LearningRouterInterface,
    RoutingDecision,
    RoutingRewardSignal,
    RoutingState,
  } from './interfaces/learning-router.interface';
  import type { ScoringPath, ScoringWeights } from './interfaces/hybrid-scoring.interface';

  /** Available routing actions (scoring paths) */
  const ROUTING_ACTIONS: ScoringPath[] = ['LLM_PRIMARY', 'HEURISTIC_PRIMARY', 'HYBRID'];

  /** Weight presets for each routing action */
  const ACTION_WEIGHTS: Record<ScoringPath, ScoringWeights> = {
    LLM_PRIMARY: { llm: 0.8, heuristic: 0.2 },
    HEURISTIC_PRIMARY: { llm: 0.2, heuristic: 0.8 },
    HYBRID: { llm: 0.6, heuristic: 0.4 },
  };

  @Injectable()
  export class LearningRouter implements OnModuleInit, LearningRouterInterface {
    private readonly logger = new Logger(LearningRouter.name);
    private learningEngine: /* LearningEngine instance */ | null = null;
    private initialized = false;
    private readonly epsilon: number;

    constructor(private readonly configService: ConfigService) {
      this.epsilon = parseFloat(
        this.configService.get<string>('LEARNING_ROUTER_EPSILON') ?? '0.1',
      );
    }

    async onModuleInit(): Promise<void> {
      try {
        const { LearningEngine } = await import('ruvector');
        this.learningEngine = new LearningEngine({
          defaultEpsilon: this.epsilon,
          discountFactor: 0.95,
        });
        // Use Double-Q for agent-routing (reduces overestimation bias)
        this.learningEngine.setAlgorithm('agent-routing', 'double-q');
        this.initialized = true;
        this.logger.log(
          `LearningRouter initialized (algorithm=double-q, epsilon=${String(this.epsilon)})`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`LearningRouter init failed (non-fatal): ${msg}`);
        this.initialized = false;
      }
    }

    /**
     * Select the best routing path for a given context.
     *
     * State key format: `{tenantId}:{agentType}:{contextHash}`
     * - Tenant-scoped learning (each tenant learns independently)
     * - Agent-specific (categorizer and matcher may learn different preferences)
     * - Context-aware (optional context hash for sub-grouping)
     *
     * Returns null when not initialized (triggers existing fallback behavior).
     */
    async selectPath(context: RoutingState): Promise<RoutingDecision | null> {
      if (!this.initialized || !this.learningEngine) {
        return null;
      }

      const stateKey = this.buildStateKey(context);

      try {
        const result = await this.learningEngine.getBestAction(
          'agent-routing',
          stateKey,
          ROUTING_ACTIONS,
        );

        const path = result.action as ScoringPath;
        return {
          path,
          confidence: result.confidence,
          weights: ACTION_WEIGHTS[path],
          source: 'LEARNING_ENGINE',
          stateKey,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`LearningEngine getBestAction failed: ${msg}`);
        return null;
      }
    }

    /**
     * Get optimal weights for the hybrid scorer.
     *
     * Maps the RL-selected path to weight configuration.
     * Returns null when not initialized (triggers default 60/40 weights).
     */
    async getOptimalWeights(
      context: RoutingState,
    ): Promise<ScoringWeights | null> {
      const decision = await this.selectPath(context);
      if (!decision) return null;

      return decision.weights;
    }

    /**
     * Provide a reward signal to the LearningEngine after observing the outcome.
     *
     * Reward signals:
     *   +1.0  — decision was correct (no human correction)
     *   -0.5  — decision was corrected by human
     *   +0.5  — partially correct (right category, wrong account)
     *    0.0  — unknown / not yet reviewed
     *
     * This method MUST be called non-blocking (fire-and-forget with .catch()).
     */
    async recordReward(signal: RoutingRewardSignal): Promise<void> {
      if (!this.initialized || !this.learningEngine) return;

      const stateKey = this.buildStateKey(signal.context);
      const nextStateKey = signal.nextContext
        ? this.buildStateKey(signal.nextContext)
        : stateKey;

      try {
        await this.learningEngine.update('agent-routing', {
          state: stateKey,
          action: signal.action,
          reward: signal.reward,
          nextState: nextStateKey,
          done: signal.done ?? true,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`LearningEngine update failed: ${msg}`);
      }
    }

    /**
     * Get the Q-values for a state (useful for debugging/observability).
     */
    async getQValues(
      context: RoutingState,
    ): Promise<Record<string, number> | null> {
      if (!this.initialized || !this.learningEngine) return null;

      const stateKey = this.buildStateKey(context);
      try {
        return await this.learningEngine.getQValues('agent-routing', stateKey);
      } catch {
        return null;
      }
    }

    isAvailable(): boolean {
      return this.initialized;
    }

    /**
     * Build a tenant-scoped state key for the RL agent.
     *
     * Format: `{tenantId}:{agentType}:{contextHash}`
     * The contextHash is optional — when absent, the state is just tenant+agent.
     */
    private buildStateKey(context: RoutingState): string {
      const parts = [context.tenantId, context.agentType];
      if (context.contextHash) {
        parts.push(context.contextHash);
      }
      return parts.join(':');
    }
  }
  ```

  ### 4. Learning Router Interfaces
  ```typescript
  // apps/api/src/agents/shared/interfaces/learning-router.interface.ts

  import type { ScoringPath, ScoringWeights } from './hybrid-scoring.interface';

  /** State representation for routing decisions */
  export interface RoutingState {
    /** Tenant ID — learning is tenant-scoped */
    tenantId: string;
    /** Agent type — categorizer or matcher */
    agentType: 'categorizer' | 'matcher';
    /** Optional context hash for sub-grouping (e.g., transaction type) */
    contextHash?: string;
  }

  /** Result of a routing decision from the LearningEngine */
  export interface RoutingDecision {
    /** Selected scoring path */
    path: ScoringPath;
    /** Confidence in this decision (0-1) from RL Q-values */
    confidence: number;
    /** Weight configuration for this path */
    weights: ScoringWeights;
    /** Source of the decision */
    source: 'LEARNING_ENGINE' | 'ACCURACY_TRACKER' | 'DEFAULT';
    /** State key used for this decision (for reward tracking) */
    stateKey: string;
  }

  /** Reward signal to send after observing an outcome */
  export interface RoutingRewardSignal {
    /** Context that produced the original decision */
    context: RoutingState;
    /** Action that was taken (the scoring path) */
    action: ScoringPath;
    /** Reward value:
     *   +1.0 = correct (no correction)
     *   -0.5 = corrected by human
     *   +0.5 = partially correct
     *    0.0 = unknown */
    reward: number;
    /** Optional next context (for multi-step episodes) */
    nextContext?: RoutingState;
    /** Whether this is a terminal state (default: true) */
    done?: boolean;
  }

  /** Full interface for the LearningRouter */
  export interface LearningRouterInterface {
    selectPath(context: RoutingState): Promise<RoutingDecision | null>;
    getOptimalWeights(context: RoutingState): Promise<ScoringWeights | null>;
    recordReward(signal: RoutingRewardSignal): Promise<void>;
    getQValues(context: RoutingState): Promise<Record<string, number> | null>;
    isAvailable(): boolean;
  }
  ```

  ### 5. Integration into ScoringRouter
  Replace the inline `MultiModelRouter` stub with injected `LearningRouter`:
  ```typescript
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import type { ScoringPath, ScoringWeights } from './interfaces/hybrid-scoring.interface';
  import { AccuracyTracker } from './accuracy-tracker';
  import { LearningRouter } from './learning-router';

  /** Static weight mappings for each scoring path */
  const PATH_WEIGHTS: Record<ScoringPath, ScoringWeights> = {
    LLM_PRIMARY: { llm: 0.8, heuristic: 0.2 },
    HEURISTIC_PRIMARY: { llm: 0.2, heuristic: 0.8 },
    HYBRID: { llm: 0.6, heuristic: 0.4 },
  };

  @Injectable()
  export class ScoringRouter {
    private readonly logger = new Logger(ScoringRouter.name);

    constructor(
      private readonly accuracyTracker: AccuracyTracker,
      @Optional()
      @Inject(LearningRouter)
      private readonly learningRouter?: LearningRouter,
    ) {}

    async getPreferredPath(
      tenantId: string,
      agentType: 'categorizer' | 'matcher',
    ): Promise<ScoringPath> {
      // Try LearningRouter first (replaces MultiModelRouter stub)
      if (this.learningRouter?.isAvailable()) {
        try {
          const decision = await this.learningRouter.selectPath({
            tenantId,
            agentType,
          });

          if (decision) {
            this.logger.debug(
              `LearningRouter selected ${decision.path} (confidence=${String(decision.confidence.toFixed(2))})`,
            );
            return decision.path;
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`LearningRouter failed, using accuracy-based: ${msg}`);
        }
      }

      // Fall back to accuracy-based recommendation
      const stats = await this.accuracyTracker.getAccuracy(tenantId, agentType);
      return stats.recommendation;
    }

    getWeightsForPath(path: ScoringPath): ScoringWeights {
      return { ...PATH_WEIGHTS[path] };
    }
  }
  ```

  ### 6. Integration into HybridScorer
  Replace the inline `SONAScorer` stub with `LearningRouter.getOptimalWeights()`:
  ```typescript
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import type { HybridScore, ScoringWeights } from './interfaces/hybrid-scoring.interface';
  import { LearningRouter } from './learning-router';

  const DEFAULT_LLM_WEIGHT = 0.6;
  const DEFAULT_HEURISTIC_WEIGHT = 0.4;
  const MIN_HEURISTIC_WEIGHT = 0.2;

  @Injectable()
  export class HybridScorer {
    private readonly logger = new Logger(HybridScorer.name);

    constructor(
      @Optional()
      @Inject(LearningRouter)
      private readonly learningRouter?: LearningRouter,
    ) {}

    async combine(
      llmConfidence: number | null,
      heuristicConfidence: number,
      context: { tenantId: string; agentType: 'categorizer' | 'matcher' },
    ): Promise<HybridScore> {
      if (llmConfidence === null) {
        return {
          score: heuristicConfidence,
          source: 'HEURISTIC_ONLY',
          llmAvailable: false,
          llmScore: null,
          heuristicScore: heuristicConfidence,
        };
      }

      // Get weights from LearningRouter (replaces SONAScorer stub)
      let weights = await this.getWeights(context);
      weights = this.enforceMinHeuristicWeight(weights);

      const rawScore = llmConfidence * weights.llm + heuristicConfidence * weights.heuristic;
      const score = Math.min(100, Math.max(0, Math.round(rawScore)));

      return {
        score,
        source: 'HYBRID',
        llmAvailable: true,
        llmScore: llmConfidence,
        heuristicScore: heuristicConfidence,
        sonaWeights: weights,
      };
    }

    private async getWeights(
      context: { tenantId: string; agentType: string },
    ): Promise<ScoringWeights> {
      // Try LearningRouter for adaptive weights
      if (this.learningRouter?.isAvailable()) {
        try {
          const weights = await this.learningRouter.getOptimalWeights({
            tenantId: context.tenantId,
            agentType: context.agentType as 'categorizer' | 'matcher',
          });
          if (weights !== null) {
            return weights;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`LearningRouter weight lookup failed, using defaults: ${msg}`);
        }
      }

      return { llm: DEFAULT_LLM_WEIGHT, heuristic: DEFAULT_HEURISTIC_WEIGHT };
    }

    private enforceMinHeuristicWeight(weights: ScoringWeights): ScoringWeights {
      let { llm, heuristic } = weights;
      if (heuristic < MIN_HEURISTIC_WEIGHT) {
        heuristic = MIN_HEURISTIC_WEIGHT;
        llm = 1.0 - heuristic;
      }
      const total = llm + heuristic;
      if (total !== 1.0 && total > 0) {
        llm = llm / total;
        heuristic = heuristic / total;
      }
      if (heuristic < MIN_HEURISTIC_WEIGHT) {
        heuristic = MIN_HEURISTIC_WEIGHT;
        llm = 1.0 - heuristic;
      }
      return { llm, heuristic };
    }
  }
  ```

  ### 7. Reward Signal Design
  ```typescript
  // Reward values used throughout CrecheBooks:
  //
  // +1.0 = CORRECT — The agent's decision was confirmed correct
  //   - Transaction categorized correctly (no human correction)
  //   - Payment matched correctly (no human correction)
  //
  // -0.5 = CORRECTED — Human corrected the agent's decision
  //   - Category changed by accountant
  //   - Payment match overridden
  //   - Note: -0.5 (not -1.0) because the agent still did useful work
  //     (extracted data, narrowed options)
  //
  // +0.5 = PARTIAL — Partially correct
  //   - Right account category but wrong sub-account
  //   - Right payee but wrong VAT type
  //   - Right invoice matched but wrong line item
  //
  //  0.0 = UNKNOWN — Not yet reviewed
  //   - No reward signal sent (RL state unchanged)
  //   - Decision logged but not fed back to LearningEngine
  ```

  ### 8. State Key Design
  ```typescript
  // State key format: `{tenantId}:{agentType}:{contextHash}`
  //
  // Examples:
  //   'bdff4374-...:categorizer'           — General categorizer state
  //   'bdff4374-...:categorizer:payroll'    — Categorizer for payroll context
  //   'bdff4374-...:matcher'               — General matcher state
  //   'bdff4374-...:matcher:recurring'     — Matcher for recurring payments
  //
  // Why tenant-scoped?
  //   - Each creche has different transaction patterns
  //   - A creche in Cape Town may have different vendors than one in Johannesburg
  //   - Learning should be independent per business
  //
  // Why agent-scoped?
  //   - Categorizer may prefer LLM for novel transactions
  //   - Matcher may prefer heuristic for exact amount matching
  //   - Different agents learn different routing preferences
  ```

  ### 9. Cold Start Behavior
  ```typescript
  // When the LearningEngine has no data for a state:
  //   1. Epsilon-greedy exploration: with probability epsilon (default 0.1),
  //      a random action is chosen from ROUTING_ACTIONS
  //   2. With probability (1 - epsilon), the LearningEngine returns a uniform
  //      random action (since all Q-values are 0 initially)
  //   3. This means: for the first ~50 decisions, actions are essentially random
  //   4. After enough reward signals, the Q-values diverge and the engine
  //      starts preferring the path with highest expected reward
  //
  // The AccuracyTracker fallback (existing code) handles the first 50 samples
  // separately by always recommending HYBRID. The LearningEngine's exploration
  // augments this with actual RL-based routing as data accumulates.
  ```

  ### 10. Non-Blocking Reward Updates
  ```typescript
  // CORRECT: Fire-and-forget reward signal
  this.learningRouter?.recordReward({
    context: { tenantId, agentType },
    action: selectedPath,
    reward: wasCorrect ? 1.0 : -0.5,
  }).catch((err: Error) => {
    this.logger.warn(`Reward update failed: ${err.message}`);
  });

  // WRONG: Awaiting reward blocks the response
  // await this.learningRouter.recordReward(signal);  // NEVER DO THIS
  ```

  ### 11. Testing Pattern — Mock LearningEngine
  ```typescript
  describe('LearningRouter', () => {
    let router: LearningRouter;
    let mockLearningEngine: {
      getBestAction: jest.Mock;
      update: jest.Mock;
      getQValues: jest.Mock;
      setAlgorithm: jest.Mock;
      setEpsilon: jest.Mock;
    };

    beforeEach(async () => {
      mockLearningEngine = {
        getBestAction: jest.fn().mockResolvedValue({
          action: 'LLM_PRIMARY',
          confidence: 0.85,
        }),
        update: jest.fn().mockResolvedValue(undefined),
        getQValues: jest.fn().mockResolvedValue({
          LLM_PRIMARY: 0.85,
          HEURISTIC_PRIMARY: 0.45,
          HYBRID: 0.65,
        }),
        setAlgorithm: jest.fn(),
        setEpsilon: jest.fn(),
      };

      jest.mock('ruvector', () => ({
        LearningEngine: jest.fn().mockImplementation(() => mockLearningEngine),
      }));

      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [LearningRouter],
      }).compile();

      router = module.get(LearningRouter);
      await router.onModuleInit();
    });

    it('should select LLM_PRIMARY when Q-values favor it', async () => {
      const decision = await router.selectPath({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(decision).not.toBeNull();
      expect(decision!.path).toBe('LLM_PRIMARY');
      expect(decision!.confidence).toBe(0.85);
      expect(decision!.source).toBe('LEARNING_ENGINE');
      expect(mockLearningEngine.getBestAction).toHaveBeenCalledWith(
        'agent-routing',
        'tenant-123:categorizer',
        ['LLM_PRIMARY', 'HEURISTIC_PRIMARY', 'HYBRID'],
      );
    });

    it('should build tenant-scoped state keys', async () => {
      await router.selectPath({
        tenantId: 'tenant-123',
        agentType: 'matcher',
        contextHash: 'recurring',
      });

      expect(mockLearningEngine.getBestAction).toHaveBeenCalledWith(
        'agent-routing',
        'tenant-123:matcher:recurring',
        expect.any(Array),
      );
    });

    it('should return null when not initialized', async () => {
      const uninitRouter = new LearningRouter(
        { get: () => undefined } as any, // Minimal config mock
      );
      const decision = await uninitRouter.selectPath({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(decision).toBeNull();
    });

    it('should record positive reward for correct decision', async () => {
      await router.recordReward({
        context: { tenantId: 'tenant-123', agentType: 'categorizer' },
        action: 'LLM_PRIMARY',
        reward: 1.0,
      });

      expect(mockLearningEngine.update).toHaveBeenCalledWith(
        'agent-routing',
        expect.objectContaining({
          state: 'tenant-123:categorizer',
          action: 'LLM_PRIMARY',
          reward: 1.0,
          done: true,
        }),
      );
    });

    it('should record negative reward for corrected decision', async () => {
      await router.recordReward({
        context: { tenantId: 'tenant-123', agentType: 'categorizer' },
        action: 'HYBRID',
        reward: -0.5,
      });

      expect(mockLearningEngine.update).toHaveBeenCalledWith(
        'agent-routing',
        expect.objectContaining({
          reward: -0.5,
          action: 'HYBRID',
        }),
      );
    });

    it('should return Q-values for observability', async () => {
      const qValues = await router.getQValues({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(qValues).toEqual({
        LLM_PRIMARY: 0.85,
        HEURISTIC_PRIMARY: 0.45,
        HYBRID: 0.65,
      });
    });

    it('should use Double-Q algorithm for agent-routing', async () => {
      expect(mockLearningEngine.setAlgorithm).toHaveBeenCalledWith(
        'agent-routing',
        'double-q',
      );
    });

    it('should get optimal weights mapping path to weights', async () => {
      const weights = await router.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(weights).toEqual({ llm: 0.8, heuristic: 0.2 }); // LLM_PRIMARY
    });

    it('should return null weights when not initialized', async () => {
      const uninitRouter = new LearningRouter(
        { get: () => undefined } as any,
      );
      const weights = await uninitRouter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(weights).toBeNull();
    });
  });

  describe('ScoringRouter (with LearningRouter)', () => {
    it('should prefer LearningRouter over AccuracyTracker', async () => {
      // Setup: LearningRouter returns LLM_PRIMARY
      const mockLearningRouter = {
        isAvailable: () => true,
        selectPath: jest.fn().mockResolvedValue({
          path: 'LLM_PRIMARY',
          confidence: 0.9,
          weights: { llm: 0.8, heuristic: 0.2 },
          source: 'LEARNING_ENGINE',
          stateKey: 'tenant-123:categorizer',
        }),
      };

      const router = new ScoringRouter(
        mockAccuracyTracker,
        mockLearningRouter as any,
      );

      const path = await router.getPreferredPath('tenant-123', 'categorizer');
      expect(path).toBe('LLM_PRIMARY');
      // AccuracyTracker should NOT be called when LearningRouter succeeds
      expect(mockAccuracyTracker.getAccuracy).not.toHaveBeenCalled();
    });

    it('should fall back to AccuracyTracker when LearningRouter unavailable', async () => {
      const router = new ScoringRouter(mockAccuracyTracker); // No LearningRouter
      const path = await router.getPreferredPath('tenant-123', 'categorizer');
      expect(path).toBe('HYBRID'); // AccuracyTracker default
      expect(mockAccuracyTracker.getAccuracy).toHaveBeenCalled();
    });
  });
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks processes thousands of bank transactions per month for creche businesses
  across South Africa. Each transaction must be categorized (account code, VAT type)
  and matched to invoices. The routing decision — whether to rely on LLM inference,
  heuristic rules, or a hybrid of both — directly impacts accuracy and cost:

  - **LLM_PRIMARY (80% LLM, 20% heuristic)**: Best for novel/ambiguous transactions
    where rules fail. More expensive (API calls).
  - **HEURISTIC_PRIMARY (20% LLM, 80% heuristic)**: Best for well-known payees with
    established patterns. Cheap and fast.
  - **HYBRID (60% LLM, 40% heuristic)**: Safe default when uncertain. Moderate cost.

  Currently, the system always uses HYBRID. With the LearningEngine, each tenant will
  independently learn which routing path works best for their specific transaction
  patterns. A creche that mostly pays the same 10 vendors will quickly learn to
  prefer HEURISTIC_PRIMARY. A creche with diverse, novel expenses will learn to
  prefer LLM_PRIMARY.

  ## SA Compliance Notes
  - All monetary values stored as integers (cents)
  - SARS agent results always require L2 human review (never auto-apply) —
    the routing decision does not override this requirement
  - Confidence threshold for auto-apply: 80% (configurable per tenant) —
    the LearningEngine confidence is separate from the auto-apply confidence

  ## Architectural Decisions
  - **Double-Q learning for routing**: Reduces overestimation bias which is important
    for financial decisions. If one path appears good due to noise, Double-Q is less
    likely to overcommit to it.
  - **Epsilon-greedy exploration at 0.1**: 10% of routing decisions are random to
    discover better paths. Configurable via `LEARNING_ROUTER_EPSILON` env var.
  - **Tenant-scoped state keys**: Each tenant learns independently. No cross-tenant
    learning (different businesses have different patterns).
  - **Non-blocking reward updates**: Reward signals are fire-and-forget. They do not
    block the transaction processing pipeline.
  - **Graceful degradation**: When LearningRouter is unavailable, the system falls
    back to AccuracyTracker, then to default HYBRID. Three layers of fallback.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `LearningRouter` implementing `LearningRouterInterface` with methods:
      `selectPath()`, `getOptimalWeights()`, `recordReward()`, `getQValues()`,
      `isAvailable()`
    - Create interfaces: `LearningRouterInterface`, `RoutingDecision`,
      `RoutingRewardSignal`, `RoutingState`
    - Integrate ruvector's `LearningEngine` with Double-Q algorithm for `agent-routing`
    - Design reward signal values (+1.0 correct, -0.5 corrected, +0.5 partial)
    - Design state key format: `{tenantId}:{agentType}:{contextHash}`
    - Replace `MultiModelRouter` stub in `scoring-router.ts` with `LearningRouter` injection
    - Replace `SONAScorer` stub in `hybrid-scorer.ts` with `LearningRouter.getOptimalWeights()`
    - Remove inline `MultiModelRouter` class from `scoring-router.ts`
    - Remove inline `SONAScorer` class from `hybrid-scorer.ts`
    - Use `@Optional() @Inject()` for `LearningRouter` in both `ScoringRouter` and
      `HybridScorer`
    - Preserve existing `AccuracyTracker` fallback behavior in `ScoringRouter`
    - Preserve existing default 60/40 weights fallback in `HybridScorer`
    - Preserve min 20% heuristic weight enforcement in `HybridScorer`
    - Configure epsilon from env var `LEARNING_ROUTER_EPSILON` (default 0.1)
    - Unit tests: path selection, Q-values, reward recording, cold start, state keys,
      init failure, fallback behavior, weight integration
    - Build succeeds (`pnpm run build`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - SONA integration (TASK-STUB-005)
    - GNN pattern routing (TASK-STUB-007)
    - FeedbackLoop integration (TASK-STUB-004 — consumes LearningRouter but implemented there)
    - FastAgentDB integration (TASK-STUB-002)
    - Wiring reward signals from CorrectionHandler (TASK-STUB-004 handles this)
    - Frontend routing dashboard
    - Multi-tenant cross-learning (each tenant learns independently)
    - Algorithm comparison benchmarks (future task)
    - Persistence of Q-values across restarts (future task — currently in-memory)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify files exist
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/shared/learning-router.ts
ls -la apps/api/src/agents/shared/interfaces/learning-router.interface.ts
ls -la apps/api/tests/agents/shared/learning-router.spec.ts

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run learning-router-specific tests
pnpm test -- --testPathPattern="agents/shared/learning-router" --runInBand

# 4. Run all shared tests (scoring-router, hybrid-scorer, accuracy-tracker)
pnpm test -- --testPathPattern="agents/shared" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify MultiModelRouter stub REMOVED from scoring-router.ts
grep -c "class MultiModelRouter" apps/api/src/agents/shared/scoring-router.ts
# Expected: 0

# 8. Verify SONAScorer stub REMOVED from hybrid-scorer.ts
grep -c "class SONAScorer" apps/api/src/agents/shared/hybrid-scorer.ts
# Expected: 0

# 9. Verify LearningRouter injected into ScoringRouter
grep "LearningRouter" apps/api/src/agents/shared/scoring-router.ts

# 10. Verify LearningRouter injected into HybridScorer
grep "LearningRouter" apps/api/src/agents/shared/hybrid-scorer.ts

# 11. Verify @Optional() @Inject() pattern
grep -A1 "@Optional" apps/api/src/agents/shared/scoring-router.ts | grep "LearningRouter"
grep -A1 "@Optional" apps/api/src/agents/shared/hybrid-scorer.ts | grep "LearningRouter"

# 12. Verify Double-Q algorithm configuration
grep "double-q" apps/api/src/agents/shared/learning-router.ts

# 13. Verify reward signal values in code or comments
grep "1.0\|0.5\|-0.5" apps/api/src/agents/shared/learning-router.ts

# 14. Verify state key format
grep "buildStateKey" apps/api/src/agents/shared/learning-router.ts

# 15. Verify no 'any' types in new files
grep -rn ": any" apps/api/src/agents/shared/learning-router.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/shared/interfaces/learning-router.interface.ts && echo "FAIL" || echo "PASS"

# 16. Verify dynamic import of ruvector
grep "import(" apps/api/src/agents/shared/learning-router.ts

# 17. Verify SONA_SCORER_TOKEN removed from hybrid-scorer.ts
grep -c "SONA_SCORER_TOKEN" apps/api/src/agents/shared/hybrid-scorer.ts
# Expected: 0

# 18. Verify AccuracyTracker fallback preserved
grep "accuracyTracker" apps/api/src/agents/shared/scoring-router.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `LearningRouter` created as `@Injectable()` NestJS service implementing `LearningRouterInterface`
  - [ ] `LearningRouter.onModuleInit()` dynamically imports ruvector's `LearningEngine`
  - [ ] `LearningRouter.onModuleInit()` configures Double-Q algorithm for `agent-routing` task type
  - [ ] `LearningRouter.onModuleInit()` sets epsilon from `LEARNING_ROUTER_EPSILON` env var (default 0.1)
  - [ ] `LearningRouter.onModuleInit()` gracefully handles import failure (non-fatal)
  - [ ] `LearningRouter.selectPath()` builds tenant-scoped state key: `{tenantId}:{agentType}:{contextHash}`
  - [ ] `LearningRouter.selectPath()` calls `LearningEngine.getBestAction()` with `agent-routing` task type
  - [ ] `LearningRouter.selectPath()` returns `RoutingDecision` with path, confidence, weights, source
  - [ ] `LearningRouter.selectPath()` returns `null` when not initialized (triggers fallback)
  - [ ] `LearningRouter.getOptimalWeights()` maps selected path to weight configuration
  - [ ] `LearningRouter.getOptimalWeights()` returns `null` when not initialized
  - [ ] `LearningRouter.recordReward()` calls `LearningEngine.update()` with state, action, reward
  - [ ] `LearningRouter.recordReward()` is designed to be called non-blocking (`.catch()`)
  - [ ] `LearningRouter.getQValues()` exposes Q-values for debugging/observability
  - [ ] `LearningRouter.isAvailable()` returns initialization state
  - [ ] Interfaces created: `LearningRouterInterface`, `RoutingDecision`, `RoutingRewardSignal`, `RoutingState`
  - [ ] Reward signal design documented: +1.0 correct, -0.5 corrected, +0.5 partial, 0.0 unknown
  - [ ] State key design documented: tenant-scoped, agent-scoped, optional context hash
  - [ ] `MultiModelRouter` stub class REMOVED from `scoring-router.ts`
  - [ ] `ScoringRouter` uses `@Optional() @Inject(LearningRouter)` instead of inline stub
  - [ ] `ScoringRouter.getPreferredPath()` tries LearningRouter first, then AccuracyTracker fallback
  - [ ] `SONAScorer` stub class REMOVED from `hybrid-scorer.ts`
  - [ ] `SONA_SCORER_TOKEN` constant REMOVED from `hybrid-scorer.ts`
  - [ ] `HybridScorer` uses `@Optional() @Inject(LearningRouter)` for weight selection
  - [ ] `HybridScorer.getWeights()` tries LearningRouter first, then default 60/40 fallback
  - [ ] Min 20% heuristic weight enforcement PRESERVED in `HybridScorer`
  - [ ] `AccuracyTracker` fallback PRESERVED in `ScoringRouter` (not removed)
  - [ ] Weight presets for paths PRESERVED: LLM_PRIMARY (80/20), HEURISTIC_PRIMARY (20/80), HYBRID (60/40)
  - [ ] Unit tests: selectPath returns RoutingDecision when engine available
  - [ ] Unit tests: selectPath returns null when not initialized
  - [ ] Unit tests: tenant-scoped state key generation (with and without contextHash)
  - [ ] Unit tests: recordReward sends correct transition to LearningEngine
  - [ ] Unit tests: positive reward (+1.0) and negative reward (-0.5) recording
  - [ ] Unit tests: getQValues returns Q-value map
  - [ ] Unit tests: getOptimalWeights maps path to weights correctly
  - [ ] Unit tests: ScoringRouter prefers LearningRouter over AccuracyTracker
  - [ ] Unit tests: ScoringRouter falls back to AccuracyTracker when LearningRouter unavailable
  - [ ] Unit tests: HybridScorer uses LearningRouter weights when available
  - [ ] Unit tests: HybridScorer falls back to default 60/40 when LearningRouter unavailable
  - [ ] Unit tests: init failure does not throw (non-fatal)
  - [ ] Test coverage >= 90% for new code
  - [ ] Zero `any` types in new code (except minimal test mocks where unavoidable)
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (no regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER remove the AccuracyTracker fallback** — LearningRouter is a new layer on top.
    When LearningRouter is unavailable, ScoringRouter must still fall back to
    AccuracyTracker's recommendation.
  - **NEVER remove the min 20% heuristic weight floor** — this is a safety requirement
    for financial operations. Even if the LearningEngine learns to prefer 100% LLM,
    the HybridScorer enforces at least 20% heuristic weight.
  - **NEVER await reward signals in the main request path** — `recordReward()` must
    always be called with `.catch()` pattern. Blocking the response for RL updates
    adds unacceptable latency.
  - **NEVER use `any` type** — use proper TypeScript types, generics, or `unknown`
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER enable cross-tenant learning** — each tenant learns independently. State
    keys MUST include `tenantId`. Sharing Q-values across tenants would leak
    competitive intelligence.
  - **NEVER hardcode epsilon** — use `LEARNING_ROUTER_EPSILON` env var. Different
    environments need different exploration rates (high in dev, low in production).
  - **NEVER make real API calls in tests** — mock ruvector's `LearningEngine` entirely
  - **NEVER auto-apply SARS agent results** based on LearningEngine confidence —
    SARS results always require L2 human review regardless of routing confidence.
  - **NEVER use a discount factor > 0.99** — high discount factors cause Q-values to
    diverge in financial routing. Use 0.95 (default).
  - **NEVER bypass the LearningRouter to call LearningEngine directly** — all access
    goes through the `LearningRouter` service. No direct ruvector imports outside
    `learning-router.ts`.
  - **NEVER store monetary values in state keys** — state keys contain tenant ID,
    agent type, and optional context hash. Never amounts, account numbers, or PII.
  - **NEVER use temperature > 0 for routing decisions** — LearningEngine's epsilon
    handles exploration. Do not add randomness in the scoring/weighting layer.
  - **NEVER modify the ScoringPath type** — the three paths (`LLM_PRIMARY`,
    `HEURISTIC_PRIMARY`, `HYBRID`) are fixed. Adding new paths requires a separate
    design discussion.
</anti_patterns>

</task_spec>
