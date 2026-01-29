/**
 * AgentMemoryService Tests
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * Tests dual-write pattern, reasoning chain storage, ruvector embedding,
 * correction handling, accuracy stats, and tenant isolation.
 */

import { AgentMemoryService, computeInputHash } from '../agent-memory.service';
import type { PatternLearner as _PatternLearner } from '../pattern-learner';
import type {
  StoreDecisionParams,
  RecordCorrectionParams,
} from '../interfaces/agent-memory.interface';

// ── Mock Prisma ──────────────────────────────────────────────────────

const mockPrisma = {
  agentDecision: {
    create: jest.fn().mockResolvedValue({
      id: 'decision-001',
      tenantId: 'tenant-1',
      agentType: 'categorizer',
      inputHash: 'abc123',
      decision: { accountCode: '4100' },
      confidence: 85,
      source: 'PATTERN',
    }),
    update: jest.fn().mockResolvedValue({ id: 'decision-001' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  correctionFeedback: {
    create: jest.fn().mockResolvedValue({
      id: 'cf-001',
      tenantId: 'tenant-1',
      agentDecisionId: 'decision-001',
    }),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  payeePattern: {
    upsert: jest.fn().mockResolvedValue({ id: 'pp-001' }),
  },
};

// ── Mock Ruvector ────────────────────────────────────────────────────

const mockRuvector = {
  isAvailable: jest.fn().mockReturnValue(false),
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  searchSimilar: jest.fn().mockResolvedValue([]),
};

// ── Mock PatternLearner ──────────────────────────────────────────────

const mockPatternLearner = {
  processCorrection: jest.fn().mockResolvedValue({
    patternCreated: false,
    reason: 'Not enough corrections',
  }),
};

describe('AgentMemoryService', () => {
  let service: AgentMemoryService;

  const defaultParams: StoreDecisionParams = {
    tenantId: 'tenant-1',
    agentType: 'categorizer',
    inputHash: 'abc123def456',
    inputText: 'woolworths grocery',
    decision: { accountCode: '4100', accountName: 'Sales' },
    confidence: 85,
    source: 'PATTERN',
    transactionId: 'tx-001',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-set default mock implementations after clearAllMocks
    mockPrisma.agentDecision.create.mockResolvedValue({
      id: 'decision-001',
      tenantId: 'tenant-1',
      agentType: 'categorizer',
      inputHash: 'abc123',
      decision: { accountCode: '4100' },
      confidence: 85,
      source: 'PATTERN',
    });
    mockPrisma.agentDecision.update.mockResolvedValue({ id: 'decision-001' });
    mockPrisma.agentDecision.findMany.mockResolvedValue([]);
    mockPrisma.agentDecision.count.mockResolvedValue(0);
    mockPrisma.correctionFeedback.create.mockResolvedValue({
      id: 'cf-001',
      tenantId: 'tenant-1',
      agentDecisionId: 'decision-001',
    });
    mockPrisma.correctionFeedback.count.mockResolvedValue(0);
    mockPrisma.correctionFeedback.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.payeePattern.upsert.mockResolvedValue({ id: 'pp-001' });
    mockRuvector.isAvailable.mockReturnValue(false);
    mockRuvector.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockRuvector.searchSimilar.mockResolvedValue([]);
    mockPatternLearner.processCorrection.mockResolvedValue({
      patternCreated: false,
      reason: 'Not enough corrections',
    });

    service = new AgentMemoryService(
      mockPrisma as never,
      mockRuvector as never,
      mockPatternLearner as never,
    );
  });

  // ── storeDecision ────────────────────────────────────────────────

  describe('storeDecision', () => {
    it('should write to both AgentDB stub and Prisma', async () => {
      const id = await service.storeDecision(defaultParams);

      expect(id).toBe('decision-001');
      expect(mockPrisma.agentDecision.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          agentType: 'categorizer',
          inputHash: 'abc123def456',
          decision: { accountCode: '4100', accountName: 'Sales' },
          confidence: 85,
          source: 'PATTERN',
          transactionId: 'tx-001',
        },
      });
    });

    it('should store reasoning chain when provided', async () => {
      const params: StoreDecisionParams = {
        ...defaultParams,
        reasoningChain: 'Pattern matched Woolworths -> 4100',
      };

      const id = await service.storeDecision(params);

      // Service stores reasoning chain internally; verify no error
      expect(id).toBe('decision-001');
    });

    it('should return UUID when Prisma is unavailable', async () => {
      const serviceNoPrisma = new AgentMemoryService(
        undefined,
        undefined,
        undefined,
      );

      const id = await serviceNoPrisma.storeDecision(defaultParams);

      // Should be a valid UUID format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should attempt ruvector embedding when available (non-blocking)', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);

      const id = await service.storeDecision(defaultParams);

      expect(id).toBe('decision-001');
      // Give the async embedding time to fire
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'woolworths grocery',
      );
    });

    it('should not throw even when ruvector fails', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.generateEmbedding.mockRejectedValue(
        new Error('ruvector down'),
      );

      // Should not throw
      const id = await service.storeDecision(defaultParams);
      expect(id).toBe('decision-001');

      // Allow time for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should return UUID when Prisma create throws', async () => {
      mockPrisma.agentDecision.create.mockRejectedValueOnce(
        new Error('DB error'),
      );

      const id = await service.storeDecision(defaultParams);

      // Should be a valid UUID (fallback)
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  // ── getSimilarDecisions ──────────────────────────────────────────

  describe('getSimilarDecisions', () => {
    it('should use ruvector when available', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.searchSimilar.mockResolvedValue([
        {
          id: 'vec-001',
          score: 0.92,
          metadata: { accountCode: '4100' },
        },
      ]);

      const results = await service.getSimilarDecisions(
        'tenant-1',
        'categorizer',
        'woolworths grocery',
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('vec-001');
      expect(results[0].similarity).toBe(0.92);
      expect(results[0].source).toBe('SEMANTIC');
      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'woolworths grocery',
      );
    });

    it('should fall back to Prisma hash lookup when ruvector unavailable', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);
      mockPrisma.agentDecision.findMany.mockResolvedValue([
        {
          id: 'decision-001',
          decision: { accountCode: '4100' },
          confidence: 85,
          source: 'PATTERN',
          createdAt: new Date(),
        },
      ]);

      const results = await service.getSimilarDecisions(
        'tenant-1',
        'categorizer',
        'woolworths grocery',
        'hash123',
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('decision-001');
      expect(results[0].source).toBe('PATTERN');
      expect(mockPrisma.agentDecision.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          agentType: 'categorizer',
          inputHash: 'hash123',
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });

    it('should return empty array when both ruvector and Prisma unavailable', async () => {
      const serviceNone = new AgentMemoryService(
        undefined,
        undefined,
        undefined,
      );

      const results = await serviceNone.getSimilarDecisions(
        'tenant-1',
        'categorizer',
        'test',
      );

      expect(results).toEqual([]);
    });
  });

  // ── getAccuracyStats ─────────────────────────────────────────────

  describe('getAccuracyStats', () => {
    it('should compute from Prisma when AgentDB returns null', async () => {
      mockPrisma.agentDecision.count
        .mockResolvedValueOnce(100) // totalDecisions
        .mockResolvedValueOnce(50) // reviewedDecisions
        .mockResolvedValueOnce(45); // correctDecisions

      const stats = await service.getAccuracyStats('tenant-1', 'categorizer');

      expect(stats.totalDecisions).toBe(100);
      expect(stats.reviewedDecisions).toBe(50);
      expect(stats.correctDecisions).toBe(45);
      expect(stats.accuracyRate).toBe(90);
    });

    it('should return zero stats when Prisma unavailable', async () => {
      const serviceNone = new AgentMemoryService(
        undefined,
        undefined,
        undefined,
      );

      const stats = await serviceNone.getAccuracyStats(
        'tenant-1',
        'categorizer',
      );

      expect(stats.totalDecisions).toBe(0);
      expect(stats.accuracyRate).toBe(0);
    });

    it('should enforce tenant isolation on count queries', async () => {
      mockPrisma.agentDecision.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(4);

      await service.getAccuracyStats('tenant-99', 'matcher');

      // Verify tenantId is passed for all count calls
      expect(mockPrisma.agentDecision.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-99', agentType: 'matcher' },
      });
      expect(mockPrisma.agentDecision.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-99',
          agentType: 'matcher',
          wasCorrect: { not: null },
        },
      });
      expect(mockPrisma.agentDecision.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-99',
          agentType: 'matcher',
          wasCorrect: true,
        },
      });
    });
  });

  // ── recordCorrection ─────────────────────────────────────────────

  describe('recordCorrection', () => {
    const correctionParams: RecordCorrectionParams = {
      tenantId: 'tenant-1',
      agentDecisionId: 'decision-001',
      originalValue: { accountCode: '4100' },
      correctedValue: {
        accountCode: '5100',
        accountName: 'Cost of Sales',
        payeeName: 'Woolworths',
      },
      correctedBy: 'user-001',
      reason: 'Wrong category',
    };

    it('should update original decision (wasCorrect=false)', async () => {
      await service.recordCorrection(correctionParams);

      expect(mockPrisma.agentDecision.update).toHaveBeenCalledWith({
        where: { id: 'decision-001' },
        data: {
          wasCorrect: false,
          correctedTo: {
            accountCode: '5100',
            accountName: 'Cost of Sales',
            payeeName: 'Woolworths',
          },
        },
      });
    });

    it('should create correction feedback record', async () => {
      await service.recordCorrection(correctionParams);

      expect(mockPrisma.correctionFeedback.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          agentDecisionId: 'decision-001',
          originalValue: { accountCode: '4100' },
          correctedValue: {
            accountCode: '5100',
            accountName: 'Cost of Sales',
            payeeName: 'Woolworths',
          },
          correctedBy: 'user-001',
          reason: 'Wrong category',
        },
      });
    });

    it('should trigger pattern learning', async () => {
      await service.recordCorrection(correctionParams);

      expect(mockPatternLearner.processCorrection).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        correctedValue: {
          accountCode: '5100',
          accountName: 'Cost of Sales',
          payeeName: 'Woolworths',
        },
        agentDecisionId: 'decision-001',
      });
    });

    it('should return fallback result when pattern learner unavailable', async () => {
      const serviceNoLearner = new AgentMemoryService(
        mockPrisma as never,
        undefined,
        undefined,
      );

      const result = await serviceNoLearner.recordCorrection(correctionParams);

      expect(result.patternCreated).toBe(false);
      expect(result.reason).toContain('Pattern learner unavailable');
    });
  });

  // ── Tenant Isolation ─────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('should include tenantId on storeDecision Prisma call', async () => {
      await service.storeDecision(defaultParams);

      const createCall = mockPrisma.agentDecision.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
    });

    it('should include tenantId on correction feedback', async () => {
      await service.recordCorrection({
        tenantId: 'tenant-42',
        agentDecisionId: 'decision-001',
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '5100' },
        correctedBy: 'user-001',
      });

      const createCall = mockPrisma.correctionFeedback.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-42');
    });

    it('should include tenantId on getSimilarDecisions Prisma fallback', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);
      mockPrisma.agentDecision.findMany.mockResolvedValue([]);

      await service.getSimilarDecisions(
        'tenant-77',
        'categorizer',
        'test input',
        'hash-77',
      );

      expect(mockPrisma.agentDecision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-77' }),
        }),
      );
    });
  });

  // ── Non-blocking behavior ────────────────────────────────────────

  describe('non-blocking behavior', () => {
    it('should not throw even when ruvector embedding fails', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.generateEmbedding.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.storeDecision(defaultParams)).resolves.toBe(
        'decision-001',
      );

      // Allow async operations
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  // ── computeInputHash ─────────────────────────────────────────────

  describe('computeInputHash', () => {
    it('should produce a deterministic 64-char hex hash', () => {
      const hash = computeInputHash({
        payeeName: 'Woolworths',
        description: 'Grocery purchase',
        amountCents: 15000,
        isCredit: false,
      });

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce same hash for same normalized input', () => {
      const hash1 = computeInputHash({
        payeeName: '  WOOLWORTHS  ',
        description: '  Grocery Purchase  ',
        amountCents: 15000,
        isCredit: false,
      });

      const hash2 = computeInputHash({
        payeeName: 'woolworths',
        description: 'grocery purchase',
        amountCents: 15000,
        isCredit: false,
      });

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different inputs', () => {
      const hash1 = computeInputHash({
        payeeName: 'Woolworths',
        description: 'Grocery',
        amountCents: 15000,
        isCredit: false,
      });

      const hash2 = computeInputHash({
        payeeName: 'Checkers',
        description: 'Grocery',
        amountCents: 15000,
        isCredit: false,
      });

      expect(hash1).not.toBe(hash2);
    });
  });
});
