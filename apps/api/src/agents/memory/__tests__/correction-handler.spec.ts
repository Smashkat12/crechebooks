/**
 * CorrectionHandler Tests
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * Tests delegation to memoryService.recordCorrection,
 * feedback loop execution, and error handling.
 */

import { CorrectionHandler } from '../correction-handler';
import type { RecordCorrectionParams } from '../interfaces/agent-memory.interface';

// ── Mock AgentMemoryService ──────────────────────────────────────────

const mockMemoryService = {
  recordCorrection: jest.fn().mockResolvedValue({
    patternCreated: false,
    reason: 'Not enough corrections',
  }),
  storeDecision: jest.fn(),
  getSimilarDecisions: jest.fn(),
  getAccuracyStats: jest.fn(),
};

describe('CorrectionHandler', () => {
  let handler: CorrectionHandler;

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

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-set default mock implementations after clearAllMocks
    mockMemoryService.recordCorrection.mockResolvedValue({
      patternCreated: false,
      reason: 'Not enough corrections',
    });

    handler = new CorrectionHandler(mockMemoryService as never);
  });

  describe('handleCorrection', () => {
    it('should delegate to memoryService.recordCorrection', async () => {
      const result = await handler.handleCorrection(correctionParams);

      expect(mockMemoryService.recordCorrection).toHaveBeenCalledWith(
        correctionParams,
      );
      expect(result.patternCreated).toBe(false);
    });

    it('should run feedback loop stub without errors', async () => {
      const result = await handler.handleCorrection(correctionParams);

      // Feedback loop is non-blocking — just verify no crash
      expect(result).toBeDefined();

      // Allow async operations
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    it('should handle errors from recordCorrection gracefully', async () => {
      mockMemoryService.recordCorrection.mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      const result = await handler.handleCorrection(correctionParams);

      expect(result.patternCreated).toBe(false);
      expect(result.reason).toContain('Correction failed');
    });

    it('should return pattern learn result when pattern is created', async () => {
      mockMemoryService.recordCorrection.mockResolvedValueOnce({
        patternCreated: true,
        payeeName: 'Woolworths',
        accountCode: '5100',
        correctionCount: 3,
      });

      const result = await handler.handleCorrection(correctionParams);

      expect(result.patternCreated).toBe(true);
      expect(result.payeeName).toBe('Woolworths');
      expect(result.accountCode).toBe('5100');
    });
  });
});
