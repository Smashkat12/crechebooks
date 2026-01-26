/**
 * AuditTrailService Tests
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * Tests database audit trail creation, graceful degradation, tenant isolation,
 * escalation stats, and agent performance stats.
 */

import { AuditTrailService } from '../audit-trail.service';
import type {
  LogDecisionParams,
  LogEscalationParams,
  LogWorkflowParams,
  AuditFilters,
} from '../interfaces/audit.interface';

// ── Mock Prisma ──────────────────────────────────────────────────────

const mockPrisma = {
  agentAuditLog: {
    create: jest.fn().mockResolvedValue({ id: 'audit-001' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function createService(prisma?: typeof mockPrisma): AuditTrailService {
  return new AuditTrailService(prisma as never);
}

const baseDecisionParams: LogDecisionParams = {
  tenantId: 'tenant-1',
  agentType: 'categorizer',
  transactionId: 'tx-001',
  decision: 'categorize',
  confidence: 85,
  source: 'PATTERN',
  autoApplied: true,
  details: { accountCode: '4100', accountName: 'Sales' },
  reasoning: 'Matched payee pattern',
  durationMs: 120,
};

const baseEscalationParams: LogEscalationParams = {
  tenantId: 'tenant-1',
  agentType: 'categorizer',
  transactionId: 'tx-002',
  reason: 'Low confidence score',
  details: { confidence: 45, suggestedAccount: '5000' },
};

const baseWorkflowParams: LogWorkflowParams = {
  tenantId: 'tenant-1',
  workflowId: 'wf-001',
  eventType: 'WORKFLOW_START',
  details: { type: 'CATEGORIZE_TRANSACTIONS' },
};

// ── Tests ────────────────────────────────────────────────────────────

describe('AuditTrailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── logDecision ─────────────────────────────────────────────────

  describe('logDecision', () => {
    it('should create AgentAuditLog record with eventType DECISION', async () => {
      const service = createService(mockPrisma);

      await service.logDecision(baseDecisionParams);

      expect(mockPrisma.agentAuditLog.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
      expect(createCall.data.agentType).toBe('categorizer');
      expect(createCall.data.eventType).toBe('DECISION');
      expect(createCall.data.transactionId).toBe('tx-001');
      expect(createCall.data.decision).toBe('categorize');
      expect(createCall.data.confidence).toBe(85);
      expect(createCall.data.source).toBe('PATTERN');
      expect(createCall.data.autoApplied).toBe(true);
      expect(createCall.data.reasoning).toBe('Matched payee pattern');
      expect(createCall.data.durationMs).toBe(120);
    });

    it('should handle Prisma errors gracefully (non-blocking)', async () => {
      mockPrisma.agentAuditLog.create.mockRejectedValueOnce(
        new Error('DB connection failed'),
      );
      const service = createService(mockPrisma);

      // Should not throw
      await expect(
        service.logDecision(baseDecisionParams),
      ).resolves.toBeUndefined();
    });

    it('should be no-op when Prisma is unavailable', async () => {
      const service = createService(undefined);

      await expect(
        service.logDecision(baseDecisionParams),
      ).resolves.toBeUndefined();

      expect(mockPrisma.agentAuditLog.create).not.toHaveBeenCalled();
    });

    it('should handle optional fields as null', async () => {
      const service = createService(mockPrisma);

      await service.logDecision({
        tenantId: 'tenant-1',
        agentType: 'matcher',
        decision: 'match',
        autoApplied: false,
        details: {},
      });

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.transactionId).toBeNull();
      expect(createCall.data.workflowId).toBeNull();
      expect(createCall.data.confidence).toBeNull();
      expect(createCall.data.source).toBeNull();
      expect(createCall.data.reasoning).toBeNull();
      expect(createCall.data.durationMs).toBeNull();
    });
  });

  // ── logEscalation ──────────────────────────────────────────────

  describe('logEscalation', () => {
    it('should create record with eventType ESCALATION and decision escalate', async () => {
      const service = createService(mockPrisma);

      await service.logEscalation(baseEscalationParams);

      expect(mockPrisma.agentAuditLog.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
      expect(createCall.data.agentType).toBe('categorizer');
      expect(createCall.data.eventType).toBe('ESCALATION');
      expect(createCall.data.decision).toBe('escalate');
      expect(createCall.data.autoApplied).toBe(false);
      expect(createCall.data.reasoning).toBe('Low confidence score');
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.agentAuditLog.create.mockRejectedValueOnce(
        new Error('DB error'),
      );
      const service = createService(mockPrisma);

      await expect(
        service.logEscalation(baseEscalationParams),
      ).resolves.toBeUndefined();
    });
  });

  // ── logWorkflow ────────────────────────────────────────────────

  describe('logWorkflow', () => {
    it('should create record with agentType orchestrator for WORKFLOW_START', async () => {
      const service = createService(mockPrisma);

      await service.logWorkflow(baseWorkflowParams);

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.agentType).toBe('orchestrator');
      expect(createCall.data.eventType).toBe('WORKFLOW_START');
      expect(createCall.data.workflowId).toBe('wf-001');
      expect(createCall.data.decision).toBe('start');
    });

    it('should set decision to complete for WORKFLOW_END', async () => {
      const service = createService(mockPrisma);

      await service.logWorkflow({
        ...baseWorkflowParams,
        eventType: 'WORKFLOW_END',
        durationMs: 5000,
      });

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.decision).toBe('complete');
      expect(createCall.data.durationMs).toBe(5000);
    });
  });

  // ── getDecisionHistory ─────────────────────────────────────────

  describe('getDecisionHistory', () => {
    it('should filter by tenantId, agentType, eventType, and dateRange', async () => {
      const records = [
        {
          id: 'a-1',
          tenantId: 'tenant-1',
          agentType: 'categorizer',
          eventType: 'DECISION',
        },
      ];
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce(records);
      const service = createService(mockPrisma);

      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-12-31');
      const filters: AuditFilters = {
        agentType: 'categorizer',
        eventType: 'DECISION',
        dateFrom,
        dateTo,
      };

      const result = await service.getDecisionHistory('tenant-1', filters);

      expect(result).toEqual(records);
      const findCall = mockPrisma.agentAuditLog.findMany.mock.calls[0][0];
      expect(findCall.where.tenantId).toBe('tenant-1');
      expect(findCall.where.agentType).toBe('categorizer');
      expect(findCall.where.eventType).toBe('DECISION');
      expect(findCall.where.createdAt).toEqual({ gte: dateFrom, lte: dateTo });
    });

    it('should respect limit and offset', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([]);
      const service = createService(mockPrisma);

      await service.getDecisionHistory('tenant-1', {
        limit: 10,
        offset: 20,
      });

      const findCall = mockPrisma.agentAuditLog.findMany.mock.calls[0][0];
      expect(findCall.take).toBe(10);
      expect(findCall.skip).toBe(20);
    });

    it('should return empty array when Prisma unavailable', async () => {
      const service = createService(undefined);
      const result = await service.getDecisionHistory('tenant-1', {});
      expect(result).toEqual([]);
    });

    it('should enforce tenant isolation on all queries', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([]);
      const service = createService(mockPrisma);

      await service.getDecisionHistory('tenant-1', {});

      const findCall = mockPrisma.agentAuditLog.findMany.mock.calls[0][0];
      expect(findCall.where.tenantId).toBe('tenant-1');
    });
  });

  // ── getEscalationStats ─────────────────────────────────────────

  describe('getEscalationStats', () => {
    it('should compute totals by agent and reason', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([
        { agentType: 'categorizer', reasoning: 'Low confidence' },
        { agentType: 'categorizer', reasoning: 'Low confidence' },
        { agentType: 'matcher', reasoning: 'Ambiguous match' },
      ]);
      const service = createService(mockPrisma);

      const stats = await service.getEscalationStats(
        'tenant-1',
        new Date('2025-01-01'),
        new Date('2025-12-31'),
      );

      expect(stats.total).toBe(3);
      expect(stats.byAgent).toEqual({ categorizer: 2, matcher: 1 });
      expect(stats.byReason).toEqual({
        'Low confidence': 2,
        'Ambiguous match': 1,
      });
    });

    it('should return empty stats when Prisma unavailable', async () => {
      const service = createService(undefined);
      const stats = await service.getEscalationStats(
        'tenant-1',
        new Date(),
        new Date(),
      );
      expect(stats).toEqual({ total: 0, byAgent: {}, byReason: {} });
    });
  });

  // ── getAgentPerformance ────────────────────────────────────────

  describe('getAgentPerformance', () => {
    it('should compute averages and rates', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([
        { confidence: 90, autoApplied: true, durationMs: 100 },
        { confidence: 80, autoApplied: true, durationMs: 200 },
        { confidence: 60, autoApplied: false, durationMs: 300 },
      ]);
      mockPrisma.agentAuditLog.count.mockResolvedValueOnce(1); // 1 escalation

      const service = createService(mockPrisma);

      const perf = await service.getAgentPerformance('tenant-1', 'categorizer');

      expect(perf.totalDecisions).toBe(3);
      // avg confidence: (90+80+60)/3 = 76.67
      expect(perf.avgConfidence).toBeCloseTo(76.67, 1);
      // auto apply rate: 2/3 = 0.6667
      expect(perf.autoApplyRate).toBeCloseTo(0.6667, 3);
      // avg duration: (100+200+300)/3 = 200
      expect(perf.avgDurationMs).toBe(200);
      // escalation rate: 1/(3+1) = 0.25
      expect(perf.escalationRate).toBe(0.25);
    });

    it('should return zero stats when no decisions exist', async () => {
      mockPrisma.agentAuditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.agentAuditLog.count.mockResolvedValueOnce(0);
      const service = createService(mockPrisma);

      const perf = await service.getAgentPerformance('tenant-1', 'categorizer');

      expect(perf.totalDecisions).toBe(0);
      expect(perf.avgConfidence).toBe(0);
      expect(perf.autoApplyRate).toBe(0);
      expect(perf.avgDurationMs).toBe(0);
      expect(perf.escalationRate).toBe(0);
    });

    it('should return zero stats when Prisma unavailable', async () => {
      const service = createService(undefined);
      const perf = await service.getAgentPerformance('tenant-1', 'categorizer');
      expect(perf.totalDecisions).toBe(0);
    });
  });

  // ── Tenant isolation ───────────────────────────────────────────

  describe('tenant isolation', () => {
    it('should always include tenantId in logDecision', async () => {
      const service = createService(mockPrisma);
      await service.logDecision(baseDecisionParams);

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
    });

    it('should always include tenantId in logEscalation', async () => {
      const service = createService(mockPrisma);
      await service.logEscalation(baseEscalationParams);

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
    });

    it('should always include tenantId in logWorkflow', async () => {
      const service = createService(mockPrisma);
      await service.logWorkflow(baseWorkflowParams);

      const createCall = mockPrisma.agentAuditLog.create.mock.calls[0][0];
      expect(createCall.data.tenantId).toBe('tenant-1');
    });
  });
});
