/**
 * PatternLearner Tests
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * Tests correction processing, MIN_CORRECTIONS_FOR_PATTERN threshold,
 * PayeePattern upsert, and tenant isolation.
 */

import { PatternLearner } from '../pattern-learner';

// ── Mock Prisma ──────────────────────────────────────────────────────

const mockPrisma = {
  correctionFeedback: {
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  payeePattern: {
    upsert: jest.fn().mockResolvedValue({
      id: 'pp-001',
      tenantId: 'tenant-1',
      payeePattern: 'woolworths',
      defaultAccountCode: '5100',
      source: 'LEARNED',
    }),
  },
};

// ── Mock Ruvector ────────────────────────────────────────────────────

const mockRuvector = {
  isAvailable: jest.fn().mockReturnValue(false),
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
  searchSimilar: jest.fn().mockResolvedValue([]),
};

describe('PatternLearner', () => {
  let learner: PatternLearner;

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-set default mock implementations after clearAllMocks
    mockPrisma.correctionFeedback.count.mockResolvedValue(0);
    mockPrisma.correctionFeedback.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.payeePattern.upsert.mockResolvedValue({
      id: 'pp-001',
      tenantId: 'tenant-1',
      payeePattern: 'woolworths',
      defaultAccountCode: '5100',
      source: 'LEARNED',
    });
    mockRuvector.isAvailable.mockReturnValue(false);
    mockRuvector.generateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockRuvector.searchSimilar.mockResolvedValue([]);

    learner = new PatternLearner(mockPrisma as never, mockRuvector as never);
  });

  describe('processCorrection', () => {
    it('should feed correction to ruvector GNN stub without errors', async () => {
      const result = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Woolworths',
          accountCode: '5100',
          accountName: 'Cost of Sales',
        },
        agentDecisionId: 'decision-001',
      });

      // GNN stub should not cause errors
      expect(result).toBeDefined();
    });

    it('should require 3+ corrections before creating PayeePattern', async () => {
      // Only 2 corrections found
      mockPrisma.correctionFeedback.count.mockResolvedValue(2);

      const result = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Woolworths',
          accountCode: '5100',
        },
        agentDecisionId: 'decision-001',
      });

      expect(result.patternCreated).toBe(false);
      expect(result.correctionCount).toBe(2);
      expect(result.reason).toContain('need 3');
      expect(mockPrisma.payeePattern.upsert).not.toHaveBeenCalled();
    });

    it('should create/upsert PayeePattern when count >= 3', async () => {
      mockPrisma.correctionFeedback.count.mockResolvedValue(3);

      const result = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Woolworths',
          accountCode: '5100',
          accountName: 'Cost of Sales',
        },
        agentDecisionId: 'decision-001',
      });

      expect(result.patternCreated).toBe(true);
      expect(result.payeeName).toBe('Woolworths');
      expect(result.accountCode).toBe('5100');
      expect(mockPrisma.payeePattern.upsert).toHaveBeenCalledWith({
        where: {
          tenantId_payeePattern: {
            tenantId: 'tenant-1',
            payeePattern: 'woolworths',
          },
        },
        create: {
          tenantId: 'tenant-1',
          payeePattern: 'woolworths',
          defaultAccountCode: '5100',
          defaultAccountName: 'Cost of Sales',
          source: 'LEARNED',
          isActive: true,
        },
        update: {
          defaultAccountCode: '5100',
          defaultAccountName: 'Cost of Sales',
          source: 'LEARNED',
          isActive: true,
        },
      });
    });

    it('should mark corrections as applied after creating pattern', async () => {
      mockPrisma.correctionFeedback.count.mockResolvedValue(4);

      await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Checkers',
          accountCode: '5200',
        },
        agentDecisionId: 'decision-002',
      });

      expect(mockPrisma.correctionFeedback.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          appliedToPattern: false,
          correctedValue: {
            path: ['accountCode'],
            equals: '5200',
          },
        },
        data: {
          appliedToPattern: true,
        },
      });
    });

    it('should return patternCreated=false when count < 3', async () => {
      mockPrisma.correctionFeedback.count.mockResolvedValue(1);

      const result = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Spar',
          accountCode: '4200',
        },
        agentDecisionId: 'decision-003',
      });

      expect(result.patternCreated).toBe(false);
      expect(result.correctionCount).toBe(1);
    });

    it('should require payeeName and accountCode in correctedValue', async () => {
      // Missing payeeName
      const result1 = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          accountCode: '5100',
        },
        agentDecisionId: 'decision-004',
      });

      expect(result1.patternCreated).toBe(false);
      expect(result1.reason).toContain('Missing payeeName or accountCode');

      // Missing accountCode
      const result2 = await learner.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'Woolworths',
        },
        agentDecisionId: 'decision-005',
      });

      expect(result2.patternCreated).toBe(false);
      expect(result2.reason).toContain('Missing payeeName or accountCode');
    });

    it('should enforce tenant isolation - only count corrections for same tenant', async () => {
      mockPrisma.correctionFeedback.count.mockResolvedValue(2);

      await learner.processCorrection({
        tenantId: 'tenant-99',
        correctedValue: {
          payeeName: 'Test',
          accountCode: '6100',
        },
        agentDecisionId: 'decision-006',
      });

      // Verify tenantId is passed in the count query
      expect(mockPrisma.correctionFeedback.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-99',
          appliedToPattern: false,
          correctedValue: {
            path: ['accountCode'],
            equals: '6100',
          },
        },
      });
    });
  });

  describe('in-memory fallback', () => {
    it('should use in-memory tracking when Prisma is unavailable', async () => {
      const learnerNoPrisma = new PatternLearner(undefined, undefined);

      // Process 3 corrections to reach threshold
      for (let i = 0; i < 3; i++) {
        await learnerNoPrisma.processCorrection({
          tenantId: 'tenant-1',
          correctedValue: {
            payeeName: 'ShopRite',
            accountCode: '5300',
          },
          agentDecisionId: `decision-${String(i)}`,
        });
      }

      // The third should still not create a pattern (no Prisma for upsert)
      // but should track the count
      const result = await learnerNoPrisma.processCorrection({
        tenantId: 'tenant-1',
        correctedValue: {
          payeeName: 'ShopRite',
          accountCode: '5300',
        },
        agentDecisionId: 'decision-final',
      });

      // Without Prisma, pattern cannot be created but count is tracked
      expect(result.patternCreated).toBe(false);
      expect(result.reason).toContain('Prisma unavailable');
    });
  });

  describe('MIN_CORRECTIONS_FOR_PATTERN', () => {
    it('should be 3', () => {
      expect(PatternLearner.MIN_CORRECTIONS_FOR_PATTERN).toBe(3);
    });
  });
});
