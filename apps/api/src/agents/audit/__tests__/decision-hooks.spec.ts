/**
 * DecisionHooks Tests
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * Tests pre-decision validation, post-decision triple-write,
 * escalation delegation, and ruvector fallback behavior.
 */

import { DecisionHooks } from '../decision-hooks';
import type { LogDecisionParams } from '../interfaces/audit.interface';

// ── Mock AuditTrailService ──────────────────────────────────────────

const mockAuditTrail = {
  logDecision: jest.fn().mockResolvedValue(undefined),
  logEscalation: jest.fn().mockResolvedValue(undefined),
};

// ── Mock PrismaService ──────────────────────────────────────────────

const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'tenant-1',
      subscriptionStatus: 'ACTIVE',
    }),
  },
};

// ── Mock RuvectorService ────────────────────────────────────────────

const mockRuvector = {
  isAvailable: jest.fn().mockReturnValue(false),
  generateEmbedding: jest.fn().mockResolvedValue({
    vector: [0.1, 0.2, 0.3],
    provider: 'local-ngram',
    dimensions: 3,
    durationMs: 1,
  }),
  searchSimilar: jest.fn().mockResolvedValue([]),
};

// ── Helpers ──────────────────────────────────────────────────────────

function createHooks(opts?: {
  auditTrail?: typeof mockAuditTrail;
  prisma?: typeof mockPrisma;
  ruvector?: typeof mockRuvector;
}): DecisionHooks {
  return new DecisionHooks(
    (opts?.auditTrail ?? mockAuditTrail) as never,
    (opts?.prisma ?? mockPrisma) as never,
    (opts?.ruvector ?? mockRuvector) as never,
  );
}

const baseDecisionParams: LogDecisionParams = {
  tenantId: 'tenant-1',
  agentType: 'categorizer',
  transactionId: 'tx-001',
  decision: 'categorize',
  confidence: 85,
  source: 'PATTERN',
  autoApplied: true,
  details: { accountCode: '4100' },
  reasoning: 'Matched payee pattern',
};

// ── Tests ────────────────────────────────────────────────────────────

describe('DecisionHooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      subscriptionStatus: 'ACTIVE',
    });
    mockRuvector.isAvailable.mockReturnValue(false);
  });

  // ── preDecision ──────────────────────────────────────────────

  describe('preDecision', () => {
    it('should return allowed=true for valid tenant', async () => {
      const hooks = createHooks();

      const result = await hooks.preDecision({
        tenantId: 'tenant-1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return allowed=false when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      const hooks = createHooks();

      const result = await hooks.preDecision({
        tenantId: 'nonexistent',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Tenant not found');
    });

    it('should return allowed=false when subscription cancelled', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: 'tenant-1',
        subscriptionStatus: 'CANCELLED',
      });
      const hooks = createHooks();

      const result = await hooks.preDecision({
        tenantId: 'tenant-1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Tenant subscription is cancelled');
    });

    it('should return allowed=true when Prisma unavailable (fail-open)', async () => {
      const hooks = createHooks({ prisma: undefined as never });

      const result = await hooks.preDecision({
        tenantId: 'tenant-1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
    });

    it('should fail-open on Prisma errors', async () => {
      mockPrisma.tenant.findUnique.mockRejectedValueOnce(new Error('DB down'));
      const hooks = createHooks();

      const result = await hooks.preDecision({
        tenantId: 'tenant-1',
        agentType: 'categorizer',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ── postDecision ──────────────────────────────────────────────

  describe('postDecision', () => {
    it('should log to audit trail', async () => {
      const hooks = createHooks();

      await hooks.postDecision(baseDecisionParams);

      // Give the non-blocking audit trail call time to resolve
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditTrail.logDecision).toHaveBeenCalledWith(
        baseDecisionParams,
      );
    });

    it('should handle errors gracefully', async () => {
      mockAuditTrail.logDecision.mockRejectedValueOnce(new Error('DB error'));
      const hooks = createHooks();

      // Should not throw
      await expect(
        hooks.postDecision(baseDecisionParams),
      ).resolves.toBeUndefined();
    });

    it('should attempt ruvector embedding when available and reasoning present', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      const hooks = createHooks();

      await hooks.postDecision(baseDecisionParams);

      // Give async operations time
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'Matched payee pattern',
      );
    });

    it('should skip ruvector when unavailable', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);
      const hooks = createHooks();

      await hooks.postDecision(baseDecisionParams);

      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });
  });

  // ── postEscalation ────────────────────────────────────────────

  describe('postEscalation', () => {
    it('should delegate to audit trail', async () => {
      const hooks = createHooks();

      const params = {
        tenantId: 'tenant-1',
        agentType: 'categorizer' as const,
        transactionId: 'tx-002',
        reason: 'Low confidence',
        details: { confidence: 45 },
      };

      await hooks.postEscalation(params);

      // Give the non-blocking call time
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAuditTrail.logEscalation).toHaveBeenCalledWith(params);
    });

    it('should handle missing audit trail gracefully', async () => {
      const hooks = createHooks({ auditTrail: undefined as never });

      await expect(
        hooks.postEscalation({
          tenantId: 'tenant-1',
          agentType: 'categorizer',
          reason: 'test',
          details: {},
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ── findSimilarDecisions ──────────────────────────────────────

  describe('findSimilarDecisions', () => {
    it('should return empty array when ruvector unavailable', async () => {
      mockRuvector.isAvailable.mockReturnValue(false);
      const hooks = createHooks();

      const result = await hooks.findSimilarDecisions(
        'payee pattern',
        'tenant-1',
      );

      expect(result).toEqual([]);
      expect(mockRuvector.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should use ruvector embeddings when available', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.searchSimilar.mockResolvedValueOnce([
        { id: 'd-1', score: 0.95, metadata: {} },
      ]);
      const hooks = createHooks();

      const result = await hooks.findSimilarDecisions(
        'payee pattern',
        'tenant-1',
      );

      expect(result).toHaveLength(1);
      expect(mockRuvector.generateEmbedding).toHaveBeenCalledWith(
        'payee pattern',
      );
      expect(mockRuvector.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'audit-decisions',
        10,
      );
    });

    it('should return empty array on ruvector error', async () => {
      mockRuvector.isAvailable.mockReturnValue(true);
      mockRuvector.generateEmbedding.mockRejectedValueOnce(
        new Error('Embedding failed'),
      );
      const hooks = createHooks();

      const result = await hooks.findSimilarDecisions(
        'payee pattern',
        'tenant-1',
      );

      expect(result).toEqual([]);
    });
  });
});
