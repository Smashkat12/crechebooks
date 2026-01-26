/**
 * RealDecisionHooks Tests
 * TASK-STUB-008: Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)
 *
 * Tests pre-decision correction history checking, semantic similarity checking,
 * post-decision SONA trajectory recording, audit trail writing, and embedding storage.
 * Also tests DecisionHooks integration with RealDecisionHooks.
 */

import { RealDecisionHooks } from '../real-decision-hooks';
import { DecisionHooks } from '../decision-hooks';
import type { PrismaService } from '../../../database/prisma/prisma.service';
import type { RuvectorService } from '../../sdk/ruvector.service';
import type { SonaWeightAdapter } from '../../shared/sona-weight-adapter';
import type { PostDecisionContext } from '../interfaces/decision-hooks.interface';

// ── Mock Factories ──────────────────────────────────────────────────

function createMockPrisma() {
  return {
    agentAuditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        subscriptionStatus: 'ACTIVE',
      }),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function createMockRuvector() {
  return {
    isAvailable: jest.fn().mockReturnValue(true),
    generateEmbedding: jest.fn().mockResolvedValue({
      vector: new Array(384).fill(0.1),
      provider: 'local-ngram',
      dimensions: 384,
      durationMs: 1,
    }),
    searchSimilar: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<RuvectorService>;
}

function createMockSona() {
  return {
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    getOptimalWeights: jest.fn().mockResolvedValue(null),
    forceLearning: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SonaWeightAdapter>;
}

// ── RealDecisionHooks Tests ─────────────────────────────────────────

describe('RealDecisionHooks', () => {
  let hooks: RealDecisionHooks;
  let mockPrisma: jest.Mocked<PrismaService>;
  let mockRuvector: jest.Mocked<RuvectorService>;
  let mockSona: jest.Mocked<SonaWeightAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = createMockPrisma();
    mockRuvector = createMockRuvector();
    mockSona = createMockSona();
    hooks = new RealDecisionHooks(mockPrisma, mockRuvector, mockSona);
  });

  // ── preDecision ─────────────────────────────────────────────────

  describe('preDecision', () => {
    it('should return allowed=true with no warnings when no corrections', async () => {
      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.confidenceAdjustment).toBe(0);
    });

    it('should add WARNING_PREVIOUSLY_CORRECTED when 3+ corrections found', async () => {
      (mockPrisma.agentAuditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c1',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
        {
          id: 'c2',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
        {
          id: 'c3',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('WARNING_PREVIOUSLY_CORRECTED');
      expect(result.warnings[0].correctionCount).toBe(3);
      expect(result.warnings[0].recentCorrections).toHaveLength(3);
      expect(result.confidenceAdjustment).toBe(-10);
    });

    it('should not warn when fewer than 3 corrections found', async () => {
      (mockPrisma.agentAuditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c1',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
        {
          id: 'c2',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.confidenceAdjustment).toBe(0);
    });

    it('should add semantic warning when similar corrected decisions found', async () => {
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'd1', score: 0.92, metadata: { wasCorrect: false } },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(
        result.warnings.some(
          (w) => w.code === 'WARNING_SEMANTIC_MATCH_CORRECTED',
        ),
      ).toBe(true);
    });

    it('should apply lighter penalty (-5) for semantic-only match', async () => {
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'd1', score: 0.92, metadata: { wasCorrect: false } },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(result.confidenceAdjustment).toBe(-5);
    });

    it('should not add semantic warning when similarity is below threshold', async () => {
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'd1', score: 0.7, metadata: { wasCorrect: false } },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(
        result.warnings.some(
          (w) => w.code === 'WARNING_SEMANTIC_MATCH_CORRECTED',
        ),
      ).toBe(false);
    });

    it('should not add semantic warning when similar decisions were correct', async () => {
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'd1', score: 0.92, metadata: { wasCorrect: true } },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(
        result.warnings.some(
          (w) => w.code === 'WARNING_SEMANTIC_MATCH_CORRECTED',
        ),
      ).toBe(false);
    });

    it('should skip semantic check when inputText is not provided', async () => {
      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
      expect(result.warnings).toHaveLength(0);
    });

    it('should skip semantic check when ruvector is unavailable', async () => {
      (mockRuvector.isAvailable as jest.Mock).mockReturnValue(false);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
      expect(result.warnings).toHaveLength(0);
    });

    it('should return allowed=true even when Prisma fails (fail-open)', async () => {
      (mockPrisma.agentAuditLog.findMany as jest.Mock).mockRejectedValue(
        new Error('DB down'),
      );

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.confidenceAdjustment).toBe(0);
    });

    it('should return allowed=true when ruvector semantic check fails', async () => {
      (mockRuvector.generateEmbedding as jest.Mock).mockRejectedValue(
        new Error('Embedding failed'),
      );

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(result.allowed).toBe(true);
    });

    it('should scope queries by tenantId', async () => {
      await hooks.preDecision({
        tenantId: 'tenant-xyz',
        agentType: 'categorizer',
      });

      expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-xyz',
          }),
        }),
      );
    });

    it('should scope queries by agentType', async () => {
      await hooks.preDecision({
        tenantId: 't1',
        agentType: 'matcher',
      });

      expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentType: 'matcher',
          }),
        }),
      );
    });

    it('should filter by eventType CORRECTION', async () => {
      await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventType: 'CORRECTION',
          }),
        }),
      );
    });

    it('should only look back 30 days', async () => {
      const before = new Date();
      before.setDate(before.getDate() - 30);

      await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      const callArgs = (mockPrisma.agentAuditLog.findMany as jest.Mock).mock
        .calls[0][0] as {
        where: { createdAt: { gte: Date } };
      };
      const lookbackDate = callArgs.where.createdAt.gte;

      // Should be approximately 30 days ago (within 2 seconds tolerance)
      expect(Math.abs(lookbackDate.getTime() - before.getTime())).toBeLessThan(
        2000,
      );
    });

    it('should limit to 10 corrections', async () => {
      await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    it('should use tenant-scoped collection for semantic search', async () => {
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([]);

      await hooks.preDecision({
        tenantId: 'tenant-abc',
        agentType: 'categorizer',
        inputText: 'test text',
      });

      expect(mockRuvector.searchSimilar).toHaveBeenCalledWith(
        expect.any(Array),
        'audit-decisions-tenant-abc',
        5,
      );
    });

    it('should return empty corrections when Prisma is unavailable', async () => {
      const hooksNoPrisma = new RealDecisionHooks(
        undefined,
        mockRuvector,
        mockSona,
      );

      const result = await hooksNoPrisma.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle null details in correction records', async () => {
      (mockPrisma.agentAuditLog.findMany as jest.Mock).mockResolvedValue([
        { id: 'c1', details: null, createdAt: new Date() },
        { id: 'c2', details: null, createdAt: new Date() },
        { id: 'c3', details: null, createdAt: new Date() },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].recentCorrections?.[0].originalCode).toBe('');
      expect(result.warnings[0].recentCorrections?.[0].correctedCode).toBe('');
    });

    it('should include both correction and semantic warnings simultaneously', async () => {
      // 3+ corrections
      (mockPrisma.agentAuditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c1',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
        {
          id: 'c2',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
        {
          id: 'c3',
          details: {
            originalAccountCode: '5200',
            correctedAccountCode: '5300',
          },
          createdAt: new Date(),
        },
      ]);

      // Semantic match
      (mockRuvector.searchSimilar as jest.Mock).mockResolvedValue([
        { id: 'd1', score: 0.92, metadata: { wasCorrect: false } },
      ]);

      const result = await hooks.preDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        inputText: 'Woolworths groceries',
      });

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0].code).toBe('WARNING_PREVIOUSLY_CORRECTED');
      expect(result.warnings[1].code).toBe('WARNING_SEMANTIC_MATCH_CORRECTED');
      // Correction penalty takes precedence (-10, not overridden by -5)
      expect(result.confidenceAdjustment).toBe(-10);
    });
  });

  // ── postDecision ────────────────────────────────────────────────

  describe('postDecision', () => {
    const baseContext: PostDecisionContext = {
      tenantId: 't1',
      agentType: 'categorizer',
      decision: 'categorize:5200',
      confidence: 85,
      source: 'LLM',
      autoApplied: true,
      isCredit: false,
      amountBucket: 'medium',
    };

    it('should record SONA trajectory', async () => {
      await hooks.postDecision(baseContext);

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 't1',
          agentType: 'categorizer',
          transactionType: 'debit',
          amountBucket: 'medium',
        }),
        expect.objectContaining({
          wasCorrect: true,
          confidence: 85,
        }),
      );
    });

    it('should pass credit transactionType when isCredit is true', async () => {
      await hooks.postDecision({ ...baseContext, isCredit: true });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'credit',
        }),
        expect.any(Object),
      );
    });

    it('should default wasCorrect to true', async () => {
      await hooks.postDecision(baseContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          wasCorrect: true,
        }),
      );
    });

    it('should pass wasCorrect=false when explicitly set', async () => {
      await hooks.postDecision({ ...baseContext, wasCorrect: false });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          wasCorrect: false,
        }),
      );
    });

    it('should use confidence as fallback for llmConfidence and heuristicConfidence', async () => {
      await hooks.postDecision(baseContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          llmConfidence: 85,
          heuristicConfidence: 85,
        }),
      );
    });

    it('should use explicit llmConfidence and heuristicConfidence when provided', async () => {
      await hooks.postDecision({
        ...baseContext,
        llmConfidence: 90,
        heuristicConfidence: 75,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          llmConfidence: 90,
          heuristicConfidence: 75,
        }),
      );
    });

    it('should write to AgentAuditLog', async () => {
      await hooks.postDecision({
        ...baseContext,
        reasoning: 'Matched Woolworths to food',
        transactionId: 'tx-123',
        accountCode: '5200',
        durationMs: 42,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPrisma.agentAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 't1',
            agentType: 'categorizer',
            eventType: 'DECISION',
            decision: 'categorize:5200',
            confidence: 85,
            source: 'LLM',
            autoApplied: true,
            details: expect.objectContaining({
              transactionId: 'tx-123',
              accountCode: '5200',
              reasoning: 'Matched Woolworths to food',
              durationMs: 42,
            }),
          }),
        }),
      );
    });

    it('should generate embedding when reasoning is provided', async () => {
      await hooks.postDecision({
        ...baseContext,
        reasoning: 'Matched Woolworths to food',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'Matched Woolworths to food',
      );
    });

    it('should skip embedding when reasoning is not provided', async () => {
      await hooks.postDecision(baseContext);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should skip embedding when ruvector is unavailable', async () => {
      (mockRuvector.isAvailable as jest.Mock).mockReturnValue(false);

      await hooks.postDecision({
        ...baseContext,
        reasoning: 'test reasoning',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should not throw when SONA adapter is unavailable', async () => {
      const hooksNoSona = new RealDecisionHooks(
        mockPrisma,
        mockRuvector,
        undefined,
      );

      await expect(
        hooksNoSona.postDecision(baseContext),
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockSona.recordOutcome).not.toHaveBeenCalled();
    });

    it('should not throw when Prisma is unavailable', async () => {
      const hooksNoPrisma = new RealDecisionHooks(
        undefined,
        mockRuvector,
        mockSona,
      );

      await expect(
        hooksNoPrisma.postDecision(baseContext),
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));

      // SONA should still be called
      expect(mockSona.recordOutcome).toHaveBeenCalled();
      // Prisma create should NOT be called
      expect(mockPrisma.agentAuditLog.create).not.toHaveBeenCalled();
    });

    it('should not throw when Ruvector is unavailable', async () => {
      const hooksNoRuvector = new RealDecisionHooks(
        mockPrisma,
        undefined,
        mockSona,
      );

      await expect(
        hooksNoRuvector.postDecision({
          ...baseContext,
          reasoning: 'test reasoning',
        }),
      ).resolves.not.toThrow();
    });

    it('should not throw when all dependencies are unavailable', async () => {
      const hooksNone = new RealDecisionHooks(undefined, undefined, undefined);

      await expect(hooksNone.postDecision(baseContext)).resolves.not.toThrow();
    });

    it('should not throw when SONA recording fails', async () => {
      (mockSona.recordOutcome as jest.Mock).mockRejectedValue(
        new Error('SONA engine failure'),
      );

      await expect(hooks.postDecision(baseContext)).resolves.not.toThrow();

      // Wait for fire-and-forget to settle
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should not throw when audit log write fails', async () => {
      (mockPrisma.agentAuditLog.create as jest.Mock).mockRejectedValue(
        new Error('DB write failed'),
      );

      await expect(hooks.postDecision(baseContext)).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should not throw when embedding generation fails', async () => {
      (mockRuvector.generateEmbedding as jest.Mock).mockRejectedValue(
        new Error('Embedding failed'),
      );

      await expect(
        hooks.postDecision({
          ...baseContext,
          reasoning: 'test reasoning',
        }),
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should be fully non-blocking (fire-and-forget)', async () => {
      // Delay the SONA recording
      (mockSona.recordOutcome as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      const start = Date.now();
      await hooks.postDecision(baseContext);
      const elapsed = Date.now() - start;

      // postDecision should return almost immediately (<50ms)
      // since all operations are fire-and-forget
      expect(elapsed).toBeLessThan(50);
    });
  });
});

// ── DecisionHooks + RealDecisionHooks Integration Tests ─────────────

describe('DecisionHooks with RealDecisionHooks integration', () => {
  it('should wire real hooks into postDecision triple-write pattern', async () => {
    const mockRealHooks = {
      preDecision: jest.fn().mockResolvedValue({
        allowed: true,
        warnings: [],
        confidenceAdjustment: 0,
      }),
      postDecision: jest.fn().mockResolvedValue(undefined),
    };

    const decisionHooks = new DecisionHooks(
      undefined, // auditTrail
      undefined, // prisma
      undefined, // ruvector
      mockRealHooks as unknown as import('../interfaces/decision-hooks.interface').DecisionHooksInterface,
    );

    await decisionHooks.postDecision({
      tenantId: 't1',
      agentType: 'categorizer',
      decision: 'categorize:5200',
      autoApplied: true,
      details: {},
    });

    // Wait for async
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRealHooks.postDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        agentType: 'categorizer',
        decision: 'categorize:5200',
      }),
    );
  });

  it('should wire real hooks into preDecision after subscription check', async () => {
    const mockRealHooks = {
      preDecision: jest.fn().mockResolvedValue({
        allowed: true,
        warnings: [
          {
            code: 'WARNING_PREVIOUSLY_CORRECTED',
            message: 'Found 3 corrections',
            correctionCount: 3,
          },
        ],
        confidenceAdjustment: -10,
      }),
      postDecision: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          subscriptionStatus: 'ACTIVE',
        }),
      },
    };

    const decisionHooks = new DecisionHooks(
      undefined, // auditTrail
      mockPrisma as unknown as PrismaService,
      undefined, // ruvector
      mockRealHooks as unknown as import('../interfaces/decision-hooks.interface').DecisionHooksInterface,
    );

    const result = await decisionHooks.preDecision({
      tenantId: 't1',
      agentType: 'categorizer',
    });

    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0].code).toBe('WARNING_PREVIOUSLY_CORRECTED');
    expect(result.confidenceAdjustment).toBe(-10);
  });

  it('should not call real hooks preDecision when subscription is cancelled', async () => {
    const mockRealHooks = {
      preDecision: jest.fn().mockResolvedValue({
        allowed: true,
        warnings: [],
        confidenceAdjustment: 0,
      }),
      postDecision: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          subscriptionStatus: 'CANCELLED',
        }),
      },
    };

    const decisionHooks = new DecisionHooks(
      undefined,
      mockPrisma as unknown as PrismaService,
      undefined,
      mockRealHooks as unknown as import('../interfaces/decision-hooks.interface').DecisionHooksInterface,
    );

    const result = await decisionHooks.preDecision({
      tenantId: 't1',
      agentType: 'categorizer',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Tenant subscription is cancelled');
    // Real hooks should NOT be called because subscription check failed first
    expect(mockRealHooks.preDecision).not.toHaveBeenCalled();
  });

  it('should fall back gracefully when real hooks not available', async () => {
    const decisionHooks = new DecisionHooks();

    // Should not throw
    await expect(
      decisionHooks.postDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        decision: 'test',
        autoApplied: false,
        details: {},
      }),
    ).resolves.not.toThrow();
  });

  it('should fall back to no-op preDecision when real hooks not available', async () => {
    const mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't1',
          subscriptionStatus: 'ACTIVE',
        }),
      },
    };

    const decisionHooks = new DecisionHooks(
      undefined,
      mockPrisma as unknown as PrismaService,
      undefined,
      undefined, // no real hooks
    );

    const result = await decisionHooks.preDecision({
      tenantId: 't1',
      agentType: 'categorizer',
    });

    expect(result.allowed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.confidenceAdjustment).toBe(0);
  });

  it('should handle real hooks postDecision failure gracefully', async () => {
    const mockRealHooks = {
      preDecision: jest.fn().mockResolvedValue({
        allowed: true,
        warnings: [],
        confidenceAdjustment: 0,
      }),
      postDecision: jest.fn().mockRejectedValue(new Error('Hook crashed')),
    };

    const decisionHooks = new DecisionHooks(
      undefined,
      undefined,
      undefined,
      mockRealHooks as unknown as import('../interfaces/decision-hooks.interface').DecisionHooksInterface,
    );

    // Should not throw
    await expect(
      decisionHooks.postDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        decision: 'test',
        autoApplied: false,
        details: {},
      }),
    ).resolves.not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
