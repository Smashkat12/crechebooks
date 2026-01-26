/**
 * Learning Router
 * TASK-STUB-003: LearningEngine Router Replacement
 *
 * @module agents/shared/learning-router
 * @description Wraps ruvector's LearningEngine with CrecheBooks routing
 * interface. Uses Double-Q learning for agent-routing decisions with
 * epsilon-greedy exploration.
 *
 * Replaces the MultiModelRouter stub in scoring-router.ts and the
 * SONAScorer stub in hybrid-scorer.ts with a unified RL-based router.
 *
 * CRITICAL RULES:
 * - Double-Q algorithm for agent-routing (reduces overestimation bias)
 * - Epsilon configurable via LEARNING_ROUTER_EPSILON env var (default 0.1)
 * - Tenant-scoped state keys: {tenantId}:{agentType}:{contextHash}
 * - Graceful degradation: returns null when unavailable (triggers fallback)
 * - Non-blocking reward updates (fire-and-forget with .catch())
 *
 * Reward signal design:
 *   +1.0 = correct (no human correction)
 *   -0.5 = corrected by human
 *   +0.5 = partially correct (right category, wrong sub-account)
 *    0.0 = unknown / not yet reviewed
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LearningRouterInterface,
  RoutingDecision,
  RoutingRewardSignal,
  RoutingState,
} from './interfaces/learning-router.interface';
import type {
  ScoringPath,
  ScoringWeights,
} from './interfaces/hybrid-scoring.interface';

/** Available routing actions (scoring paths) */
const ROUTING_ACTIONS: ScoringPath[] = [
  'LLM_PRIMARY',
  'HEURISTIC_PRIMARY',
  'HYBRID',
];

/** Weight presets for each routing action */
const ACTION_WEIGHTS: Record<ScoringPath, ScoringWeights> = {
  LLM_PRIMARY: { llm: 0.8, heuristic: 0.2 },
  HEURISTIC_PRIMARY: { llm: 0.2, heuristic: 0.8 },
  HYBRID: { llm: 0.6, heuristic: 0.4 },
};

/** Shape of the ruvector LearningEngine instance (avoids top-level import) */
interface LearningEngineInstance {
  getBestAction(
    taskType: string,
    stateKey: string,
    availableActions: string[],
  ): Promise<{ action: string; confidence: number }>;
  update(
    taskType: string,
    transition: {
      state: string;
      action: string;
      reward: number;
      nextState: string;
      done: boolean;
    },
  ): Promise<void>;
  getQValues(
    taskType: string,
    stateKey: string,
  ): Promise<Record<string, number>>;
  setAlgorithm(taskType: string, algorithm: string): void;
  setEpsilon(taskType: string, epsilon: number): void;
}

@Injectable()
export class LearningRouter implements OnModuleInit, LearningRouterInterface {
  private readonly logger = new Logger(LearningRouter.name);
  private learningEngine: LearningEngineInstance | null = null;
  private initialized = false;
  private readonly epsilon: number;

  constructor(private readonly configService: ConfigService) {
    this.epsilon = parseFloat(
      this.configService.get<string>('LEARNING_ROUTER_EPSILON') ?? '0.1',
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LearningEngine } = require('ruvector') as {
        LearningEngine: new (opts: {
          defaultEpsilon: number;
          discountFactor: number;
        }) => LearningEngineInstance;
      };
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
   * State key format: {tenantId}:{agentType}:{contextHash}
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
   *   +1.0  -- decision was correct (no human correction)
   *   -0.5  -- decision was corrected by human
   *   +0.5  -- partially correct (right category, wrong account)
   *    0.0  -- unknown / not yet reviewed
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
   * Format: {tenantId}:{agentType}:{contextHash}
   * The contextHash is optional -- when absent, the state is just tenant+agent.
   */
  private buildStateKey(context: RoutingState): string {
    const parts = [context.tenantId, context.agentType];
    if (context.contextHash) {
      parts.push(context.contextHash);
    }
    return parts.join(':');
  }
}
