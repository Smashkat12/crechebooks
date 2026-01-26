/**
 * Learning Router Tests
 * TASK-STUB-003: LearningEngine Router Replacement
 *
 * Tests for the LearningRouter, ScoringRouter (with LearningRouter),
 * and HybridScorer (with LearningRouter) integration.
 *
 * CRITICAL: All tests mock ruvector's LearningEngine — zero real API calls.
 */

import { ConfigService } from '@nestjs/config';
import { LearningRouter } from '../../../src/agents/shared/learning-router';
import { ScoringRouter } from '../../../src/agents/shared/scoring-router';
import { HybridScorer } from '../../../src/agents/shared/hybrid-scorer';
import { AccuracyTracker } from '../../../src/agents/shared/accuracy-tracker';

// ---------------------------------------------------------------------------
// Helper: Create a mock LearningEngine instance
// ---------------------------------------------------------------------------
function createMockLearningEngine() {
  return {
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
}

// ---------------------------------------------------------------------------
// Global mock for ruvector - intercepts require('ruvector') in onModuleInit
// ---------------------------------------------------------------------------
const globalMockEngine = createMockLearningEngine();
const mockLearningEngineConstructor = jest
  .fn()
  .mockImplementation(() => globalMockEngine);

jest.mock('ruvector', () => ({
  LearningEngine: mockLearningEngineConstructor,
}));

// ---------------------------------------------------------------------------
// Helper: Create a mock ConfigService
// ---------------------------------------------------------------------------
function createMockConfigService(
  overrides: Record<string, string> = {},
): ConfigService {
  return {
    get: (key: string) => overrides[key] ?? undefined,
  } as unknown as ConfigService;
}

// ---------------------------------------------------------------------------
// Helper: Create an initialized LearningRouter with mock engine injected
// ---------------------------------------------------------------------------
function createInitializedRouter(
  engine: ReturnType<typeof createMockLearningEngine>,
  configOverrides: Record<string, string> = {},
): LearningRouter {
  const configService = createMockConfigService(configOverrides);
  const router = new LearningRouter(configService);
  // Directly inject the mock engine to bypass dynamic import('ruvector')
  (router as unknown as Record<string, unknown>)['learningEngine'] = engine;
  (router as unknown as Record<string, unknown>)['initialized'] = true;
  return router;
}

// ---------------------------------------------------------------------------
// LearningRouter Unit Tests
// ---------------------------------------------------------------------------
describe('LearningRouter', () => {
  let router: LearningRouter;
  let mockEngine: ReturnType<typeof createMockLearningEngine>;

  beforeEach(() => {
    mockEngine = createMockLearningEngine();
    router = createInitializedRouter(mockEngine);
  });

  // ── selectPath ──────────────────────────────────────────────────────────

  it('should select LLM_PRIMARY when Q-values favor it', async () => {
    const decision = await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(decision).not.toBeNull();
    expect(decision!.path).toBe('LLM_PRIMARY');
    expect(decision!.confidence).toBe(0.85);
    expect(decision!.source).toBe('LEARNING_ENGINE');
    expect(mockEngine.getBestAction).toHaveBeenCalledWith(
      'agent-routing',
      'tenant-123:categorizer',
      ['LLM_PRIMARY', 'HEURISTIC_PRIMARY', 'HYBRID'],
    );
  });

  it('should select HEURISTIC_PRIMARY when engine returns it', async () => {
    mockEngine.getBestAction.mockResolvedValueOnce({
      action: 'HEURISTIC_PRIMARY',
      confidence: 0.9,
    });

    const decision = await router.selectPath({
      tenantId: 'tenant-456',
      agentType: 'matcher',
    });

    expect(decision).not.toBeNull();
    expect(decision!.path).toBe('HEURISTIC_PRIMARY');
    expect(decision!.confidence).toBe(0.9);
    expect(decision!.weights).toEqual({ llm: 0.2, heuristic: 0.8 });
  });

  it('should select HYBRID when engine returns it', async () => {
    mockEngine.getBestAction.mockResolvedValueOnce({
      action: 'HYBRID',
      confidence: 0.7,
    });

    const decision = await router.selectPath({
      tenantId: 'tenant-789',
      agentType: 'categorizer',
    });

    expect(decision).not.toBeNull();
    expect(decision!.path).toBe('HYBRID');
    expect(decision!.weights).toEqual({ llm: 0.6, heuristic: 0.4 });
  });

  it('should include correct weights for LLM_PRIMARY in decision', async () => {
    const decision = await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(decision!.weights).toEqual({ llm: 0.8, heuristic: 0.2 });
  });

  it('should include stateKey in decision', async () => {
    const decision = await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(decision!.stateKey).toBe('tenant-123:categorizer');
  });

  // ── State Key Generation ────────────────────────────────────────────────

  it('should build tenant-scoped state keys without contextHash', async () => {
    await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'matcher',
    });

    expect(mockEngine.getBestAction).toHaveBeenCalledWith(
      'agent-routing',
      'tenant-123:matcher',
      expect.any(Array),
    );
  });

  it('should build tenant-scoped state keys with contextHash', async () => {
    await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'matcher',
      contextHash: 'recurring',
    });

    expect(mockEngine.getBestAction).toHaveBeenCalledWith(
      'agent-routing',
      'tenant-123:matcher:recurring',
      expect.any(Array),
    );
  });

  it('should build state key with categorizer and payroll context', async () => {
    await router.selectPath({
      tenantId: 'bdff4374-abc',
      agentType: 'categorizer',
      contextHash: 'payroll',
    });

    expect(mockEngine.getBestAction).toHaveBeenCalledWith(
      'agent-routing',
      'bdff4374-abc:categorizer:payroll',
      expect.any(Array),
    );
  });

  // ── Uninitialized behavior ──────────────────────────────────────────────

  it('should return null when not initialized', async () => {
    const uninitRouter = new LearningRouter(createMockConfigService());

    const decision = await uninitRouter.selectPath({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(decision).toBeNull();
  });

  it('should report unavailable when not initialized', () => {
    const uninitRouter = new LearningRouter(createMockConfigService());
    expect(uninitRouter.isAvailable()).toBe(false);
  });

  it('should report available after successful init', () => {
    expect(router.isAvailable()).toBe(true);
  });

  // ── Init failure ────────────────────────────────────────────────────────

  it('should not throw on init failure (non-fatal)', async () => {
    // Temporarily make the constructor throw to simulate ruvector failure
    mockLearningEngineConstructor.mockImplementationOnce(() => {
      throw new Error('Module not found');
    });

    const failRouter = new LearningRouter(createMockConfigService());
    // onModuleInit should not throw
    await expect(failRouter.onModuleInit()).resolves.toBeUndefined();
    expect(failRouter.isAvailable()).toBe(false);
  });

  // ── selectPath error handling ───────────────────────────────────────────

  it('should return null when getBestAction throws', async () => {
    mockEngine.getBestAction.mockRejectedValueOnce(new Error('Network error'));

    const decision = await router.selectPath({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(decision).toBeNull();
  });

  // ── recordReward ────────────────────────────────────────────────────────

  it('should record positive reward for correct decision', async () => {
    await router.recordReward({
      context: { tenantId: 'tenant-123', agentType: 'categorizer' },
      action: 'LLM_PRIMARY',
      reward: 1.0,
    });

    expect(mockEngine.update).toHaveBeenCalledWith(
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

    expect(mockEngine.update).toHaveBeenCalledWith(
      'agent-routing',
      expect.objectContaining({
        reward: -0.5,
        action: 'HYBRID',
      }),
    );
  });

  it('should record partial reward (+0.5)', async () => {
    await router.recordReward({
      context: { tenantId: 'tenant-123', agentType: 'matcher' },
      action: 'HEURISTIC_PRIMARY',
      reward: 0.5,
    });

    expect(mockEngine.update).toHaveBeenCalledWith(
      'agent-routing',
      expect.objectContaining({
        state: 'tenant-123:matcher',
        action: 'HEURISTIC_PRIMARY',
        reward: 0.5,
        done: true,
      }),
    );
  });

  it('should use nextContext for nextState when provided', async () => {
    await router.recordReward({
      context: { tenantId: 'tenant-123', agentType: 'categorizer' },
      action: 'LLM_PRIMARY',
      reward: 1.0,
      nextContext: {
        tenantId: 'tenant-123',
        agentType: 'categorizer',
        contextHash: 'next-step',
      },
      done: false,
    });

    expect(mockEngine.update).toHaveBeenCalledWith(
      'agent-routing',
      expect.objectContaining({
        state: 'tenant-123:categorizer',
        nextState: 'tenant-123:categorizer:next-step',
        done: false,
      }),
    );
  });

  it('should use same state as nextState when nextContext not provided', async () => {
    await router.recordReward({
      context: { tenantId: 'tenant-123', agentType: 'categorizer' },
      action: 'LLM_PRIMARY',
      reward: 1.0,
    });

    expect(mockEngine.update).toHaveBeenCalledWith(
      'agent-routing',
      expect.objectContaining({
        state: 'tenant-123:categorizer',
        nextState: 'tenant-123:categorizer',
      }),
    );
  });

  it('should not throw when recordReward fails', async () => {
    mockEngine.update.mockRejectedValueOnce(new Error('Update failed'));

    await expect(
      router.recordReward({
        context: { tenantId: 'tenant-123', agentType: 'categorizer' },
        action: 'LLM_PRIMARY',
        reward: 1.0,
      }),
    ).resolves.toBeUndefined();
  });

  it('should skip recordReward when not initialized', async () => {
    const uninitRouter = new LearningRouter(createMockConfigService());

    await uninitRouter.recordReward({
      context: { tenantId: 'tenant-123', agentType: 'categorizer' },
      action: 'LLM_PRIMARY',
      reward: 1.0,
    });

    expect(mockEngine.update).not.toHaveBeenCalled();
  });

  // ── getQValues ──────────────────────────────────────────────────────────

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

  it('should return null Q-values when not initialized', async () => {
    const uninitRouter = new LearningRouter(createMockConfigService());

    const qValues = await uninitRouter.getQValues({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(qValues).toBeNull();
  });

  it('should return null Q-values when getQValues throws', async () => {
    mockEngine.getQValues.mockRejectedValueOnce(new Error('Failure'));

    const qValues = await router.getQValues({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(qValues).toBeNull();
  });

  // ── Algorithm configuration (via onModuleInit) ──────────────────────────

  it('should use Double-Q algorithm for agent-routing via onModuleInit', async () => {
    const freshEngine = createMockLearningEngine();
    mockLearningEngineConstructor.mockImplementationOnce(() => freshEngine);

    const freshRouter = new LearningRouter(createMockConfigService());
    await freshRouter.onModuleInit();

    expect(freshEngine.setAlgorithm).toHaveBeenCalledWith(
      'agent-routing',
      'double-q',
    );
    expect(freshRouter.isAvailable()).toBe(true);
  });

  // ── getOptimalWeights ───────────────────────────────────────────────────

  it('should get optimal weights mapping path to weights', async () => {
    const weights = await router.getOptimalWeights({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // LLM_PRIMARY -> { llm: 0.8, heuristic: 0.2 }
    expect(weights).toEqual({ llm: 0.8, heuristic: 0.2 });
  });

  it('should get HEURISTIC_PRIMARY weights when engine selects it', async () => {
    mockEngine.getBestAction.mockResolvedValueOnce({
      action: 'HEURISTIC_PRIMARY',
      confidence: 0.9,
    });

    const weights = await router.getOptimalWeights({
      tenantId: 'tenant-123',
      agentType: 'matcher',
    });

    expect(weights).toEqual({ llm: 0.2, heuristic: 0.8 });
  });

  it('should return null weights when not initialized', async () => {
    const uninitRouter = new LearningRouter(createMockConfigService());

    const weights = await uninitRouter.getOptimalWeights({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(weights).toBeNull();
  });

  it('should return null weights when getBestAction fails', async () => {
    mockEngine.getBestAction.mockRejectedValueOnce(new Error('Engine error'));

    const weights = await router.getOptimalWeights({
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(weights).toBeNull();
  });

  // ── Epsilon configuration ───────────────────────────────────────────────

  it('should use default epsilon 0.1 when env var not set', async () => {
    mockLearningEngineConstructor.mockClear();

    const r = new LearningRouter(createMockConfigService());
    await r.onModuleInit();

    expect(mockLearningEngineConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultEpsilon: 0.1,
        discountFactor: 0.95,
      }),
    );
  });

  it('should use custom epsilon from env var', async () => {
    mockLearningEngineConstructor.mockClear();

    const r = new LearningRouter(
      createMockConfigService({ LEARNING_ROUTER_EPSILON: '0.05' }),
    );
    await r.onModuleInit();

    expect(mockLearningEngineConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultEpsilon: 0.05,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ScoringRouter (with LearningRouter) Tests
// ---------------------------------------------------------------------------
describe('ScoringRouter (with LearningRouter)', () => {
  let mockAccuracyTracker: {
    getAccuracy: jest.Mock;
    recordOutcome: jest.Mock;
    getRecordCount: jest.Mock;
  };

  beforeEach(() => {
    mockAccuracyTracker = {
      getAccuracy: jest.fn().mockResolvedValue({
        llmAccuracy: 60,
        heuristicAccuracy: 55,
        sampleSize: 100,
        recommendation: 'HYBRID',
      }),
      recordOutcome: jest.fn().mockResolvedValue(undefined),
      getRecordCount: jest.fn().mockReturnValue(0),
    };
  });

  it('should prefer LearningRouter over AccuracyTracker', async () => {
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

    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
      mockLearningRouter as unknown as LearningRouter,
    );

    const path = await scoringRouter.getPreferredPath(
      'tenant-123',
      'categorizer',
    );
    expect(path).toBe('LLM_PRIMARY');
    // AccuracyTracker should NOT be called when LearningRouter succeeds
    expect(mockAccuracyTracker.getAccuracy).not.toHaveBeenCalled();
  });

  it('should fall back to AccuracyTracker when LearningRouter unavailable', async () => {
    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
      // No LearningRouter provided
    );

    const path = await scoringRouter.getPreferredPath(
      'tenant-123',
      'categorizer',
    );
    expect(path).toBe('HYBRID'); // AccuracyTracker default
    expect(mockAccuracyTracker.getAccuracy).toHaveBeenCalled();
  });

  it('should fall back to AccuracyTracker when LearningRouter is not available', async () => {
    const mockLearningRouter = {
      isAvailable: () => false,
      selectPath: jest.fn(),
    };

    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
      mockLearningRouter as unknown as LearningRouter,
    );

    const path = await scoringRouter.getPreferredPath('tenant-123', 'matcher');
    expect(path).toBe('HYBRID');
    expect(mockLearningRouter.selectPath).not.toHaveBeenCalled();
    expect(mockAccuracyTracker.getAccuracy).toHaveBeenCalled();
  });

  it('should fall back to AccuracyTracker when LearningRouter selectPath returns null', async () => {
    const mockLearningRouter = {
      isAvailable: () => true,
      selectPath: jest.fn().mockResolvedValue(null),
    };

    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
      mockLearningRouter as unknown as LearningRouter,
    );

    const path = await scoringRouter.getPreferredPath(
      'tenant-123',
      'categorizer',
    );
    expect(path).toBe('HYBRID');
    expect(mockAccuracyTracker.getAccuracy).toHaveBeenCalled();
  });

  it('should fall back to AccuracyTracker when LearningRouter selectPath throws', async () => {
    const mockLearningRouter = {
      isAvailable: () => true,
      selectPath: jest.fn().mockRejectedValue(new Error('RL failure')),
    };

    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
      mockLearningRouter as unknown as LearningRouter,
    );

    const path = await scoringRouter.getPreferredPath(
      'tenant-123',
      'categorizer',
    );
    expect(path).toBe('HYBRID');
    expect(mockAccuracyTracker.getAccuracy).toHaveBeenCalled();
  });

  it('should return correct weight configurations', () => {
    const scoringRouter = new ScoringRouter(
      mockAccuracyTracker as unknown as AccuracyTracker,
    );

    expect(scoringRouter.getWeightsForPath('LLM_PRIMARY')).toEqual({
      llm: 0.8,
      heuristic: 0.2,
    });
    expect(scoringRouter.getWeightsForPath('HEURISTIC_PRIMARY')).toEqual({
      llm: 0.2,
      heuristic: 0.8,
    });
    expect(scoringRouter.getWeightsForPath('HYBRID')).toEqual({
      llm: 0.6,
      heuristic: 0.4,
    });
  });
});

// ---------------------------------------------------------------------------
// HybridScorer (with LearningRouter) Tests
// ---------------------------------------------------------------------------
describe('HybridScorer (with LearningRouter)', () => {
  // Note: HybridScorer constructor is (sonaScorer?, learningRouter?)
  // SONA adapter from TASK-STUB-005 is first param; LearningRouter is second.
  // We pass undefined for sonaScorer to test LearningRouter fallback path.

  it('should use LearningRouter weights when available (SONA returns null)', async () => {
    const mockLR = {
      isAvailable: () => true,
      getOptimalWeights: jest
        .fn()
        .mockResolvedValue({ llm: 0.8, heuristic: 0.2 }),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // 80 * 0.8 + 60 * 0.2 = 64 + 12 = 76
    expect(result.score).toBe(76);
    expect(result.source).toBe('HYBRID');
    expect(result.llmAvailable).toBe(true);
    expect(result.sonaWeights).toEqual({ llm: 0.8, heuristic: 0.2 });
  });

  it('should fall back to default 60/40 when LearningRouter unavailable', async () => {
    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      // no LearningRouter
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // 80 * 0.6 + 60 * 0.4 = 48 + 24 = 72
    expect(result.score).toBe(72);
    expect(result.sonaWeights).toEqual({ llm: 0.6, heuristic: 0.4 });
  });

  it('should fall back to default 60/40 when LearningRouter is not available', async () => {
    const mockLR = {
      isAvailable: () => false,
      getOptimalWeights: jest.fn(),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // Default 60/40: 80 * 0.6 + 60 * 0.4 = 72
    expect(result.score).toBe(72);
    expect(mockLR.getOptimalWeights).not.toHaveBeenCalled();
  });

  it('should fall back to default 60/40 when getOptimalWeights returns null', async () => {
    const mockLR = {
      isAvailable: () => true,
      getOptimalWeights: jest.fn().mockResolvedValue(null),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // Default 60/40
    expect(result.score).toBe(72);
  });

  it('should fall back to default 60/40 when getOptimalWeights throws', async () => {
    const mockLR = {
      isAvailable: () => true,
      getOptimalWeights: jest.fn().mockRejectedValue(new Error('RL error')),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // Default 60/40
    expect(result.score).toBe(72);
  });

  it('should return heuristic-only when LLM is unavailable', async () => {
    const mockLR = {
      isAvailable: () => true,
      getOptimalWeights: jest.fn(),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(null, 75, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(result.score).toBe(75);
    expect(result.source).toBe('HEURISTIC_ONLY');
    expect(result.llmAvailable).toBe(false);
    expect(result.llmScore).toBeNull();
    // Should not call LearningRouter when LLM is unavailable
    expect(mockLR.getOptimalWeights).not.toHaveBeenCalled();
  });

  it('should enforce min 20% heuristic weight', async () => {
    const mockLR = {
      isAvailable: () => true,
      // Return weights with too-low heuristic
      getOptimalWeights: jest
        .fn()
        .mockResolvedValue({ llm: 0.95, heuristic: 0.05 }),
    };

    const scorer = new HybridScorer(
      undefined, // no SONA scorer
      mockLR as unknown as LearningRouter,
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // Should enforce min 20% heuristic: { llm: 0.8, heuristic: 0.2 }
    // 80 * 0.8 + 60 * 0.2 = 64 + 12 = 76
    expect(result.score).toBe(76);
    expect(result.sonaWeights!.heuristic).toBeGreaterThanOrEqual(0.2);
  });

  it('should clamp score to 0-100', async () => {
    const scorer = new HybridScorer();

    const result = await scorer.combine(100, 100, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should round scores to integers', async () => {
    const scorer = new HybridScorer();

    const result = await scorer.combine(73, 67, {
      tenantId: 'tenant-123',
      agentType: 'categorizer',
    });

    // 73 * 0.6 + 67 * 0.4 = 43.8 + 26.8 = 70.6 -> 71
    expect(result.score).toBe(71);
    expect(Number.isInteger(result.score)).toBe(true);
  });
});
