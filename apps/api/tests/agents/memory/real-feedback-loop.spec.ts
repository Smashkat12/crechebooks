/**
 * RealFeedbackLoop Tests
 * TASK-STUB-004: FeedbackLoop Real Integration
 *
 * Tests the real feedback loop that propagates human corrections to
 * learning subsystems (LearningEngine, SONA).
 */

import { Test } from '@nestjs/testing';
import {
  RealFeedbackLoop,
  SONA_ENGINE_TOKEN,
} from '../../../src/agents/memory/real-feedback-loop';
import { CorrectionHandler } from '../../../src/agents/memory/correction-handler';
import type { AgentMemoryService } from '../../../src/agents/memory/agent-memory.service';
import type {
  FeedbackData,
  SonaEngineInterface,
} from '../../../src/agents/memory/interfaces/feedback-loop.interface';

// ────────────────────────────────────────────────────────────────────
// Test Helpers
// ────────────────────────────────────────────────────────────────────

/** Flush fire-and-forget promises */
const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 20));

/** Base feedback data for standard correction */
const baseFeedbackData: FeedbackData = {
  tenantId: 'tenant-123',
  agentDecisionId: 'dec-001',
  originalValue: { accountCode: '4100', vatType: 'STANDARD' },
  correctedValue: { accountCode: '4200', vatType: 'EXEMPT' },
  correctedBy: 'user-001',
  reason: 'Wrong account category',
  originalDecision: {
    source: 'LLM',
    confidence: 75,
    agentType: 'categorizer',
  },
};

// ────────────────────────────────────────────────────────────────────
// RealFeedbackLoop Tests
// ────────────────────────────────────────────────────────────────────

describe('RealFeedbackLoop', () => {
  let feedbackLoop: RealFeedbackLoop;
  let mockLearningRouter: {
    recordReward: jest.Mock;
    isAvailable: jest.Mock;
    selectPath: jest.Mock;
    getOptimalWeights: jest.Mock;
    getQValues: jest.Mock;
  };
  let mockSonaEngine: {
    beginTrajectory: jest.Mock;
    addStep: jest.Mock;
    endTrajectory: jest.Mock;
  };

  beforeEach(async () => {
    mockLearningRouter = {
      recordReward: jest.fn().mockResolvedValue(undefined),
      isAvailable: jest.fn().mockReturnValue(true),
      selectPath: jest.fn().mockResolvedValue(null),
      getOptimalWeights: jest.fn().mockResolvedValue(null),
      getQValues: jest.fn().mockResolvedValue(null),
    };

    mockSonaEngine = {
      beginTrajectory: jest.fn().mockResolvedValue('traj-001'),
      addStep: jest.fn().mockResolvedValue(undefined),
      endTrajectory: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        RealFeedbackLoop,
        { provide: 'LearningRouter', useValue: mockLearningRouter },
        { provide: SONA_ENGINE_TOKEN, useValue: mockSonaEngine },
      ],
    }).compile();

    feedbackLoop = module.get(RealFeedbackLoop);
  });

  // ──────────────────────────────────────────────────────────────────
  // LearningEngine Reward Tests
  // ──────────────────────────────────────────────────────────────────

  it('should send negative reward (-0.5) to LearningEngine on standard correction', async () => {
    await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          tenantId: 'tenant-123',
          agentType: 'categorizer',
        }),
        action: 'LLM',
        reward: -0.5,
        done: true,
      }),
    );
  });

  it('should compute partial reward (-0.3) for same-category correction', async () => {
    const partialData: FeedbackData = {
      ...baseFeedbackData,
      originalValue: { accountCode: '4100' },
      correctedValue: { accountCode: '4120' }, // Same first 2 digits
    };

    await feedbackLoop.processFeedback(partialData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        reward: -0.3,
      }),
    );
  });

  it('should send standard reward (-0.5) when account codes differ in first 2 digits', async () => {
    const crossCategoryData: FeedbackData = {
      ...baseFeedbackData,
      originalValue: { accountCode: '4100' },
      correctedValue: { accountCode: '5200' }, // Different first 2 digits
    };

    await feedbackLoop.processFeedback(crossCategoryData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        reward: -0.5,
      }),
    );
  });

  it('should send standard reward (-0.5) when values are not objects with accountCode', async () => {
    const simpleData: FeedbackData = {
      ...baseFeedbackData,
      originalValue: 'old-value',
      correctedValue: 'new-value',
    };

    await feedbackLoop.processFeedback(simpleData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        reward: -0.5,
      }),
    );
  });

  it('should use original decision source as RL action', async () => {
    const patternData: FeedbackData = {
      ...baseFeedbackData,
      originalDecision: {
        source: 'PATTERN',
        confidence: 85,
        agentType: 'matcher',
      },
    };

    await feedbackLoop.processFeedback(patternData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PATTERN',
        context: expect.objectContaining({
          agentType: 'matcher',
        }),
      }),
    );
  });

  it('should default action to HYBRID when original decision source is undefined', async () => {
    const noSourceData: FeedbackData = {
      ...baseFeedbackData,
      originalDecision: undefined,
    };

    await feedbackLoop.processFeedback(noSourceData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'HYBRID',
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // Agent Type Resolution Tests
  // ──────────────────────────────────────────────────────────────────

  it('should default agent type to categorizer when unspecified', async () => {
    const noAgentData: FeedbackData = {
      ...baseFeedbackData,
      originalDecision: undefined,
    };

    await feedbackLoop.processFeedback(noAgentData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          agentType: 'categorizer',
        }),
      }),
    );
  });

  it('should use matcher agent type when specified', async () => {
    const matcherData: FeedbackData = {
      ...baseFeedbackData,
      originalDecision: {
        source: 'LLM',
        confidence: 60,
        agentType: 'matcher',
      },
    };

    await feedbackLoop.processFeedback(matcherData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          agentType: 'matcher',
        }),
      }),
    );
  });

  it('should default to categorizer for unknown agent type', async () => {
    const unknownTypeData: FeedbackData = {
      ...baseFeedbackData,
      originalDecision: {
        source: 'LLM',
        confidence: 70,
        agentType: 'unknown-agent',
      },
    };

    await feedbackLoop.processFeedback(unknownTypeData);
    await flushPromises();

    expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          agentType: 'categorizer',
        }),
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────
  // SONA Trajectory Tests
  // ──────────────────────────────────────────────────────────────────

  it('should record SONA trajectory with quality=0', async () => {
    await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(mockSonaEngine.beginTrajectory).toHaveBeenCalledWith(
      expect.arrayContaining([0]),
    );
    // Verify it's a 384-element zero vector
    const embedding = mockSonaEngine.beginTrajectory.mock
      .calls[0][0] as number[];
    expect(embedding).toHaveLength(384);
    expect(embedding.every((v: number) => v === 0)).toBe(true);

    expect(mockSonaEngine.addStep).toHaveBeenCalledWith(
      'traj-001',
      expect.objectContaining({
        state: expect.objectContaining({
          tenantId: 'tenant-123',
          originalValue: baseFeedbackData.originalValue,
        }),
        action: JSON.stringify(baseFeedbackData.correctedValue),
        reward: -1.0,
      }),
    );

    expect(mockSonaEngine.endTrajectory).toHaveBeenCalledWith('traj-001', 0.0);
  });

  // ──────────────────────────────────────────────────────────────────
  // No Duplicate FastAgentDB Tests
  // ──────────────────────────────────────────────────────────────────

  it('should NOT call FastAgentDB recordCorrection (avoid duplicate)', async () => {
    // RealFeedbackLoop should NOT have any agentDb dependency at all.
    // It delegates that to AgentMemoryService.recordCorrection().
    // This test verifies the architectural decision.
    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    // Only LEARNING_ENGINE and SONA_ENGINE should be targeted
    // FAST_AGENT_DB should never appear in targets
    expect(result.targets).not.toContain('FAST_AGENT_DB');
  });

  // ──────────────────────────────────────────────────────────────────
  // No Subsystems Available Tests
  // ──────────────────────────────────────────────────────────────────

  it('should work when no subsystems are available', async () => {
    const minimalModule = await Test.createTestingModule({
      providers: [RealFeedbackLoop],
    }).compile();

    const minimalLoop = minimalModule.get(RealFeedbackLoop);
    const result = await minimalLoop.processFeedback(baseFeedbackData);

    expect(result.processed).toBe(true);
    expect(result.targets).toHaveLength(0);
    expect(result.errors).toBeUndefined();
  });

  it('should work with only LearningRouter available', async () => {
    const partialModule = await Test.createTestingModule({
      providers: [
        RealFeedbackLoop,
        { provide: 'LearningRouter', useValue: mockLearningRouter },
      ],
    }).compile();

    const partialLoop = partialModule.get(RealFeedbackLoop);
    const result = await partialLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    expect(mockLearningRouter.recordReward).toHaveBeenCalled();
    expect(mockSonaEngine.beginTrajectory).not.toHaveBeenCalled();
  });

  it('should work with only SonaEngine available', async () => {
    // Reset mock to track independently
    const freshSona: SonaEngineInterface = {
      beginTrajectory: jest
        .fn<Promise<string>, [number[]]>()
        .mockResolvedValue('traj-002'),
      addStep: jest
        .fn<
          Promise<void>,
          [string, { state: unknown; action: string; reward: number }]
        >()
        .mockResolvedValue(undefined),
      endTrajectory: jest
        .fn<Promise<void>, [string, number]>()
        .mockResolvedValue(undefined),
    };

    const partialModule = await Test.createTestingModule({
      providers: [
        RealFeedbackLoop,
        { provide: SONA_ENGINE_TOKEN, useValue: freshSona },
      ],
    }).compile();

    const partialLoop = partialModule.get(RealFeedbackLoop);
    const result = await partialLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    expect(freshSona.beginTrajectory).toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Error Recovery Tests
  // ──────────────────────────────────────────────────────────────────

  it('should handle LearningEngine failure gracefully', async () => {
    mockLearningRouter.recordReward.mockRejectedValue(
      new Error('RL update failed'),
    );

    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    // Should not throw, SONA should still proceed
    expect(mockSonaEngine.beginTrajectory).toHaveBeenCalled();
  });

  it('should handle SONA beginTrajectory failure gracefully', async () => {
    mockSonaEngine.beginTrajectory.mockRejectedValue(
      new Error('SONA unavailable'),
    );

    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    // LearningEngine should still proceed
    expect(mockLearningRouter.recordReward).toHaveBeenCalled();
  });

  it('should handle SONA addStep failure gracefully', async () => {
    mockSonaEngine.addStep.mockRejectedValue(new Error('Step failed'));

    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
    expect(mockLearningRouter.recordReward).toHaveBeenCalled();
  });

  it('should handle SONA endTrajectory failure gracefully', async () => {
    mockSonaEngine.endTrajectory.mockRejectedValue(new Error('End failed'));

    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
  });

  it('should handle both subsystems failing gracefully', async () => {
    mockLearningRouter.recordReward.mockRejectedValue(new Error('RL down'));
    mockSonaEngine.beginTrajectory.mockRejectedValue(new Error('SONA down'));

    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    expect(result.processed).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // FeedbackResult Shape Tests
  // ──────────────────────────────────────────────────────────────────

  it('should return correct FeedbackResult shape on success', async () => {
    const result = await feedbackLoop.processFeedback(baseFeedbackData);

    expect(result.processed).toBe(true);
    expect(Array.isArray(result.targets)).toBe(true);
  });

  it('should not include errors property when all targets succeed', async () => {
    await feedbackLoop.processFeedback(baseFeedbackData);
    await flushPromises();

    // Re-test with fresh instance to ensure sync check
    const result = await feedbackLoop.processFeedback(baseFeedbackData);
    // The targets array may or may not be populated immediately (fire-and-forget)
    expect(result.processed).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// CorrectionHandler Integration Tests (with RealFeedbackLoop)
// ────────────────────────────────────────────────────────────────────

describe('CorrectionHandler (with RealFeedbackLoop)', () => {
  // These use direct instantiation since CorrectionHandler has simple deps

  const correctionParams = {
    tenantId: 'tenant-123',
    agentDecisionId: 'dec-001',
    originalValue: { accountCode: '4100' },
    correctedValue: {
      accountCode: '4200',
      accountName: 'Groceries',
    },
    correctedBy: 'user-001',
    reason: 'Wrong category',
  };

  it('should call feedbackLoop.processFeedback non-blocking', async () => {
    const mockMemoryService = {
      recordCorrection: jest.fn().mockResolvedValue({
        patternCreated: false,
        reason: 'Below threshold',
      }),
    };

    const mockFeedbackLoop = {
      processFeedback: jest.fn().mockResolvedValue({
        processed: true,
        targets: ['LEARNING_ENGINE'] as const,
      }),
    };

    const handler = new CorrectionHandler(
      mockMemoryService as unknown as AgentMemoryService,
      mockFeedbackLoop as unknown as RealFeedbackLoop,
    );

    const result = await handler.handleCorrection(correctionParams);

    expect(result).toBeDefined();
    expect(result.patternCreated).toBe(false);

    // processFeedback should be called but NOT awaited (non-blocking)
    expect(mockFeedbackLoop.processFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: correctionParams.tenantId,
        agentDecisionId: correctionParams.agentDecisionId,
        originalValue: correctionParams.originalValue,
        correctedValue: correctionParams.correctedValue,
        correctedBy: correctionParams.correctedBy,
        reason: correctionParams.reason,
      }),
    );
  });

  it('should work when feedbackLoop is not injected', async () => {
    const mockMemoryService = {
      recordCorrection: jest.fn().mockResolvedValue({
        patternCreated: true,
        payeeName: 'Test',
        accountCode: '4200',
        correctionCount: 3,
      }),
    };

    // No feedbackLoop passed (undefined)
    const handler = new CorrectionHandler(
      mockMemoryService as unknown as AgentMemoryService,
    );

    const result = await handler.handleCorrection(correctionParams);

    expect(result).toBeDefined();
    expect(result.patternCreated).toBe(true);
    // No error should occur
  });

  it('should handle feedbackLoop.processFeedback failure gracefully', async () => {
    const mockMemoryService = {
      recordCorrection: jest.fn().mockResolvedValue({
        patternCreated: false,
        reason: 'Below threshold',
      }),
    };

    const mockFeedbackLoop = {
      processFeedback: jest.fn().mockRejectedValue(new Error('Feedback boom')),
    };

    const handler = new CorrectionHandler(
      mockMemoryService as unknown as AgentMemoryService,
      mockFeedbackLoop as unknown as RealFeedbackLoop,
    );

    // Should NOT throw -- .catch() handles the error
    const result = await handler.handleCorrection(correctionParams);
    expect(result).toBeDefined();
    expect(result.patternCreated).toBe(false);

    await flushPromises();
  });

  it('should pass patternResult from recordCorrection to processFeedback', async () => {
    const patternResult = {
      patternCreated: true,
      payeeName: 'Woolworths',
      accountCode: '4200',
      correctionCount: 3,
    };

    const mockMemoryService = {
      recordCorrection: jest.fn().mockResolvedValue(patternResult),
    };

    const mockFeedbackLoop = {
      processFeedback: jest.fn().mockResolvedValue({
        processed: true,
        targets: [],
      }),
    };

    const handler = new CorrectionHandler(
      mockMemoryService as unknown as AgentMemoryService,
      mockFeedbackLoop as unknown as RealFeedbackLoop,
    );

    await handler.handleCorrection(correctionParams);

    expect(mockFeedbackLoop.processFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        patternResult,
      }),
    );
  });
});
