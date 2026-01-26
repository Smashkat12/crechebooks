/**
 * SonaWeightAdapter Tests
 * TASK-STUB-005: SONA Scorer Adapter (SonaEngine Weight Optimization)
 *
 * Tests the SONA weight adapter that wraps ruvector's SonaEngine
 * for trajectory-based LLM/heuristic weight optimization.
 *
 * All tests mock SonaEngine — zero real API or native binary calls.
 */

import {
  SonaWeightAdapter,
  getAmountBucket,
} from '../../../src/agents/shared/sona-weight-adapter';
import { HybridScorer } from '../../../src/agents/shared/hybrid-scorer';

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
        findPatterns: jest.fn().mockReturnValue([]),
        beginTrajectory: jest.fn(),
        addStep: jest.fn(),
        endTrajectory: jest.fn(),
        forceLearn: jest.fn(),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(result).toBeNull();
    });

    it('should return null when patterns below minimum threshold', async () => {
      // Only 2 patterns, minimum is 3
      const mockEngine = {
        findPatterns: jest
          .fn()
          .mockReturnValue([{ quality: 0.8 }, { quality: 0.7 }]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(result).toBeNull();
    });

    it('should return null when findPatterns returns null', async () => {
      const mockEngine = {
        findPatterns: jest.fn().mockReturnValue(null),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(result).toBeNull();
    });

    it('should return LLM-favored weights when quality > 0.6', async () => {
      const mockEngine = {
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.8 },
            { quality: 0.75 },
            { quality: 0.7 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

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
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.2 },
            { quality: 0.3 },
            { quality: 0.25 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

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
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.5 },
            { quality: 0.45 },
            { quality: 0.55 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

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
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.99 },
            { quality: 0.98 },
            { quality: 0.97 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(result).not.toBeNull();
      expect(result!.heuristic).toBeGreaterThanOrEqual(0.2);
    });

    it('should never return LLM weight below 0.2', async () => {
      const mockEngine = {
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.01 },
            { quality: 0.02 },
            { quality: 0.03 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(result).not.toBeNull();
      expect(result!.llm).toBeGreaterThanOrEqual(0.2);
    });

    it('should return null when findPatterns throws', async () => {
      const mockEngine = {
        findPatterns: jest.fn().mockImplementation(() => {
          throw new Error('engine error');
        }),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(result).toBeNull();
    });

    it('should pass correct patternSearchK to findPatterns', async () => {
      const findPatternsMock = jest.fn().mockReturnValue([]);
      const mockEngine = { findPatterns: findPatternsMock };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      expect(findPatternsMock).toHaveBeenCalledWith(
        expect.any(Float32Array),
        5, // default patternSearchK
      );
    });

    it('should use custom config when provided', async () => {
      const customAdapter = new SonaWeightAdapter({
        patternSearchK: 10,
        minPatternsForAdaptation: 5,
      });
      const findPatternsMock = jest
        .fn()
        .mockReturnValue([
          { quality: 0.8 },
          { quality: 0.7 },
          { quality: 0.6 },
        ]);
      const mockEngine = { findPatterns: findPatternsMock };
      (customAdapter as unknown as Record<string, unknown>).sonaEngine =
        mockEngine;

      // 3 patterns is below the custom minPatternsForAdaptation of 5
      const result = await customAdapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });
      expect(result).toBeNull();

      expect(findPatternsMock).toHaveBeenCalledWith(
        expect.any(Float32Array),
        10, // custom patternSearchK
      );
    });

    it('should use avgQuality from ruvector LearnedPattern when available', async () => {
      // ruvector returns LearnedPattern with avgQuality field
      const mockEngine = {
        findPatterns: jest.fn().mockReturnValue([
          { quality: 0.2, avgQuality: 0.8 },
          { quality: 0.2, avgQuality: 0.75 },
          { quality: 0.2, avgQuality: 0.7 },
        ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 'tenant-123',
        agentType: 'categorizer',
      });

      // Should use avgQuality (0.75 avg) not quality (0.2 avg)
      // avgQuality > 0.6 -> LLM-favored
      expect(result).not.toBeNull();
      expect(result!.llm).toBeGreaterThan(0.5);
    });
  });

  describe('recordOutcome', () => {
    it('should not throw when engine is unavailable', async () => {
      await expect(
        adapter.recordOutcome(
          { tenantId: 't1', agentType: 'categorizer' },
          {
            wasCorrect: true,
            confidence: 85,
            llmConfidence: 90,
            heuristicConfidence: 75,
          },
        ),
      ).resolves.not.toThrow();
    });

    it('should record trajectory with correct reward signal', async () => {
      const beginMock = jest.fn().mockReturnValue(1);
      const addStepMock = jest.fn();
      const endMock = jest.fn();

      const mockEngine = {
        beginTrajectory: beginMock,
        addStep: addStepMock,
        endTrajectory: endMock,
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'categorizer' },
        {
          wasCorrect: true,
          confidence: 85,
          llmConfidence: 90,
          heuristicConfidence: 75,
        },
      );

      expect(beginMock).toHaveBeenCalledTimes(1);
      expect(beginMock).toHaveBeenCalledWith(expect.any(Float32Array));
      expect(addStepMock).toHaveBeenCalledWith(
        1,
        expect.any(Float32Array),
        expect.any(Float32Array),
        1.0, // correct -> reward 1.0
      );
      expect(endMock).toHaveBeenCalledWith(
        1,
        expect.closeTo(0.7, 1), // quality = abs(0.85 - 0.5) * 2
      );
    });

    it('should record 0.0 reward for incorrect decisions', async () => {
      const addStepMock = jest.fn();
      const mockEngine = {
        beginTrajectory: jest.fn().mockReturnValue(2),
        addStep: addStepMock,
        endTrajectory: jest.fn(),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'matcher' },
        {
          wasCorrect: false,
          confidence: 40,
          llmConfidence: 50,
          heuristicConfidence: 30,
        },
      );

      expect(addStepMock).toHaveBeenCalledWith(
        2,
        expect.any(Float32Array),
        expect.any(Float32Array),
        0.0, // incorrect -> reward 0.0
      );
    });

    it('should build correct activation vector from outcome', async () => {
      const addStepMock = jest.fn();
      const mockEngine = {
        beginTrajectory: jest.fn().mockReturnValue(3),
        addStep: addStepMock,
        endTrajectory: jest.fn(),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'categorizer' },
        {
          wasCorrect: true,
          confidence: 80,
          llmConfidence: 90,
          heuristicConfidence: 70,
        },
      );

      const activations = addStepMock.mock.calls[0][1] as Float32Array;
      expect(activations[0]).toBeCloseTo(0.9); // llmConfidence / 100
      expect(activations[1]).toBeCloseTo(0.7); // heuristicConfidence / 100
      expect(activations[2]).toBeCloseTo(0.8); // confidence / 100
      expect(activations[3]).toBeCloseTo(1.0); // reward (correct)
    });

    it('should build attention weights with correct dimension', async () => {
      const addStepMock = jest.fn();
      const mockEngine = {
        beginTrajectory: jest.fn().mockReturnValue(4),
        addStep: addStepMock,
        endTrajectory: jest.fn(),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'categorizer' },
        {
          wasCorrect: true,
          confidence: 85,
          llmConfidence: 90,
          heuristicConfidence: 75,
        },
      );

      const attentionWeights = addStepMock.mock.calls[0][2] as Float32Array;
      expect(attentionWeights.length).toBe(256);
      // Each value should be 1/256
      expect(attentionWeights[0]).toBeCloseTo(1 / 256);
    });

    it('should not throw when engine operations fail', async () => {
      const mockEngine = {
        beginTrajectory: jest.fn().mockImplementation(() => {
          throw new Error('trajectory error');
        }),
        addStep: jest.fn(),
        endTrajectory: jest.fn(),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      await expect(
        adapter.recordOutcome(
          { tenantId: 't1', agentType: 'categorizer' },
          {
            wasCorrect: true,
            confidence: 85,
            llmConfidence: 90,
            heuristicConfidence: 75,
          },
        ),
      ).resolves.not.toThrow();
    });

    it('should compute quality as decisiveness metric', async () => {
      const endMock = jest.fn();
      const mockEngine = {
        beginTrajectory: jest.fn().mockReturnValue(5),
        addStep: jest.fn(),
        endTrajectory: endMock,
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      // confidence=50 -> quality = abs(0.5 - 0.5) * 2 = 0.0 (maximally uncertain)
      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'categorizer' },
        {
          wasCorrect: true,
          confidence: 50,
          llmConfidence: 50,
          heuristicConfidence: 50,
        },
      );

      expect(endMock).toHaveBeenCalledWith(5, expect.closeTo(0.0, 3));
    });

    it('should compute maximum quality for extreme confidence', async () => {
      const endMock = jest.fn();
      const mockEngine = {
        beginTrajectory: jest.fn().mockReturnValue(6),
        addStep: jest.fn(),
        endTrajectory: endMock,
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      // confidence=100 -> quality = abs(1.0 - 0.5) * 2 = 1.0 (maximally decisive)
      await adapter.recordOutcome(
        { tenantId: 't1', agentType: 'categorizer' },
        {
          wasCorrect: true,
          confidence: 100,
          llmConfidence: 100,
          heuristicConfidence: 100,
        },
      );

      expect(endMock).toHaveBeenCalledWith(6, expect.closeTo(1.0, 3));
    });
  });

  describe('buildContextEmbedding', () => {
    it('should produce deterministic embeddings for same input', () => {
      const ctx = { tenantId: 'abc', agentType: 'categorizer' };
      const emb1 = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: Record<string, string>) => Float32Array;
        }
      ).buildContextEmbedding(ctx);
      const emb2 = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: Record<string, string>) => Float32Array;
        }
      ).buildContextEmbedding(ctx);
      expect(emb1).toEqual(emb2);
    });

    it('should produce different embeddings for different tenants', () => {
      const buildEmb = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: {
            tenantId: string;
            agentType: string;
          }) => Float32Array;
        }
      ).buildContextEmbedding.bind(adapter);

      const emb1 = buildEmb({
        tenantId: 'tenant-a',
        agentType: 'categorizer',
      });
      const emb2 = buildEmb({
        tenantId: 'tenant-b',
        agentType: 'categorizer',
      });
      expect(emb1).not.toEqual(emb2);
    });

    it('should produce different embeddings for different agent types', () => {
      const buildEmb = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: {
            tenantId: string;
            agentType: string;
          }) => Float32Array;
        }
      ).buildContextEmbedding.bind(adapter);

      const emb1 = buildEmb({
        tenantId: 'tenant-a',
        agentType: 'categorizer',
      });
      const emb2 = buildEmb({
        tenantId: 'tenant-a',
        agentType: 'matcher',
      });
      expect(emb1).not.toEqual(emb2);
    });

    it('should produce 256-dimensional Float32Array', () => {
      const emb = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: {
            tenantId: string;
            agentType: string;
          }) => Float32Array;
        }
      ).buildContextEmbedding.call(adapter, {
        tenantId: 't1',
        agentType: 'categorizer',
      });
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(256);
    });

    it('should produce unit-normalized embeddings', () => {
      const emb = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: {
            tenantId: string;
            agentType: string;
          }) => Float32Array;
        }
      ).buildContextEmbedding.call(adapter, {
        tenantId: 't1',
        agentType: 'categorizer',
      });
      const norm = Math.sqrt(
        emb.reduce((s: number, v: number) => s + v * v, 0),
      );
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('should handle optional transactionType and amountBucket', () => {
      const buildEmb = (
        adapter as unknown as {
          buildContextEmbedding: (ctx: {
            tenantId: string;
            agentType: string;
            transactionType?: string;
            amountBucket?: string;
          }) => Float32Array;
        }
      ).buildContextEmbedding.bind(adapter);

      const embWithout = buildEmb({
        tenantId: 't1',
        agentType: 'categorizer',
      });
      const embWith = buildEmb({
        tenantId: 't1',
        agentType: 'categorizer',
        transactionType: 'debit',
        amountBucket: 'medium',
      });

      expect(embWithout).toBeInstanceOf(Float32Array);
      expect(embWith).toBeInstanceOf(Float32Array);
      expect(embWithout.length).toBe(256);
      expect(embWith.length).toBe(256);
      // Different because transactionType and amountBucket differ
      expect(embWithout).not.toEqual(embWith);
    });
  });

  describe('forceLearning', () => {
    it('should not throw when engine is unavailable', async () => {
      await expect(adapter.forceLearning()).resolves.not.toThrow();
    });

    it('should call engine.forceLearn when available', async () => {
      const forceMock = jest.fn().mockReturnValue('learning complete');
      (adapter as unknown as Record<string, unknown>).sonaEngine = {
        forceLearn: forceMock,
      };

      await adapter.forceLearning();
      expect(forceMock).toHaveBeenCalledTimes(1);
    });

    it('should not throw when engine.forceLearn throws', async () => {
      const forceMock = jest.fn().mockImplementation(() => {
        throw new Error('learning error');
      });
      (adapter as unknown as Record<string, unknown>).sonaEngine = {
        forceLearn: forceMock,
      };

      await expect(adapter.forceLearning()).resolves.not.toThrow();
    });
  });

  describe('getAmountBucket', () => {
    it('should return micro for amounts < R10 (< 1000 cents)', () => {
      expect(getAmountBucket(0)).toBe('micro');
      expect(getAmountBucket(999)).toBe('micro');
    });

    it('should return small for R10-R100 (1000-9999 cents)', () => {
      expect(getAmountBucket(1000)).toBe('small');
      expect(getAmountBucket(9999)).toBe('small');
    });

    it('should return medium for R100-R1000 (10000-99999 cents)', () => {
      expect(getAmountBucket(10000)).toBe('medium');
      expect(getAmountBucket(99999)).toBe('medium');
    });

    it('should return large for R1000-R10000 (100000-999999 cents)', () => {
      expect(getAmountBucket(100000)).toBe('large');
      expect(getAmountBucket(999999)).toBe('large');
    });

    it('should return xlarge for R10000-R50000 (1000000-4999999 cents)', () => {
      expect(getAmountBucket(1000000)).toBe('xlarge');
      expect(getAmountBucket(4999999)).toBe('xlarge');
    });

    it('should return xxlarge for > R50000 (>= 5000000 cents)', () => {
      expect(getAmountBucket(5000000)).toBe('xxlarge');
      expect(getAmountBucket(10000000)).toBe('xxlarge');
    });

    it('should use integer cents (R2500 = 250000 cents = large)', () => {
      // R2,500 = 250,000 cents falls in large bucket (R1000-R10000 = 100000-999999 cents)
      expect(getAmountBucket(250000)).toBe('large');
    });
  });

  describe('weight derivation edge cases', () => {
    it('should always produce weights that sum to 1.0', async () => {
      const qualities = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      for (const quality of qualities) {
        const mockEngine = {
          findPatterns: jest
            .fn()
            .mockReturnValue([{ quality }, { quality }, { quality }]),
        };
        const testAdapter = new SonaWeightAdapter();
        (testAdapter as unknown as Record<string, unknown>).sonaEngine =
          mockEngine;

        const result = await testAdapter.getOptimalWeights({
          tenantId: 't1',
          agentType: 'categorizer',
        });

        expect(result).not.toBeNull();
        expect(result!.llm + result!.heuristic).toBeCloseTo(1.0, 10);
      }
    });

    it('should transition smoothly at quality boundary 0.6', async () => {
      // Just above threshold
      const mockEngine = {
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.61 },
            { quality: 0.61 },
            { quality: 0.61 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result).not.toBeNull();
      expect(result!.llm).toBeGreaterThan(0.5);
    });

    it('should transition smoothly at quality boundary 0.4', async () => {
      // Just below threshold
      const mockEngine = {
        findPatterns: jest
          .fn()
          .mockReturnValue([
            { quality: 0.39 },
            { quality: 0.39 },
            { quality: 0.39 },
          ]),
      };
      (adapter as unknown as Record<string, unknown>).sonaEngine = mockEngine;

      const result = await adapter.getOptimalWeights({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result).not.toBeNull();
      expect(result!.heuristic).toBeGreaterThan(0.5);
    });
  });
});

describe('HybridScorer with SonaWeightAdapter integration', () => {
  it('should use SONA-derived weights when available', async () => {
    // Mock SonaWeightAdapter returning LLM-favored weights
    const sonaAdapter = {
      getOptimalWeights: jest
        .fn()
        .mockResolvedValue({ llm: 0.7, heuristic: 0.3 }),
    };
    const scorer = new HybridScorer(
      sonaAdapter as unknown as ConstructorParameters<typeof HybridScorer>[0],
    );

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
    const scorer = new HybridScorer(
      sonaAdapter as unknown as ConstructorParameters<typeof HybridScorer>[0],
    );

    const result = await scorer.combine(90, 60, {
      tenantId: 't1',
      agentType: 'categorizer',
    });

    // Default: 90 * 0.6 + 60 * 0.4 = 54 + 24 = 78
    expect(result.score).toBe(78);
  });

  it('should enforce min 20% heuristic weight on SONA weights', async () => {
    // Mock SONA returning extreme weights that violate safety floor
    const sonaAdapter = {
      getOptimalWeights: jest
        .fn()
        .mockResolvedValue({ llm: 0.95, heuristic: 0.05 }),
    };
    const scorer = new HybridScorer(
      sonaAdapter as unknown as ConstructorParameters<typeof HybridScorer>[0],
    );

    const result = await scorer.combine(100, 50, {
      tenantId: 't1',
      agentType: 'categorizer',
    });

    // Enforced to 80/20: 100 * 0.8 + 50 * 0.2 = 80 + 10 = 90
    expect(result.sonaWeights!.heuristic).toBeGreaterThanOrEqual(0.2);
    expect(result.score).toBe(90);
  });

  it('should fall back to defaults when SONA throws', async () => {
    const sonaAdapter = {
      getOptimalWeights: jest.fn().mockRejectedValue(new Error('SONA error')),
    };
    const scorer = new HybridScorer(
      sonaAdapter as unknown as ConstructorParameters<typeof HybridScorer>[0],
    );

    const result = await scorer.combine(80, 60, {
      tenantId: 't1',
      agentType: 'categorizer',
    });

    // Default: 80 * 0.6 + 60 * 0.4 = 48 + 24 = 72
    expect(result.score).toBe(72);
  });

  it('should work without any SONA scorer (undefined)', async () => {
    const scorer = new HybridScorer();

    const result = await scorer.combine(80, 70, {
      tenantId: 't1',
      agentType: 'categorizer',
    });

    // Default: 80 * 0.6 + 70 * 0.4 = 48 + 28 = 76
    expect(result.score).toBe(76);
  });
});
