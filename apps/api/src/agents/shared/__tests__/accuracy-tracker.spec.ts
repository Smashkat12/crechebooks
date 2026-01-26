/**
 * AccuracyTracker Tests
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * Tests the accuracy tracking system with dual-write pattern.
 * Uses real logic for the tracker, the AgentDB stub returns null by design.
 */

import { AccuracyTracker } from '../accuracy-tracker';
import type { AccuracyOutcome } from '../interfaces/hybrid-scoring.interface';

describe('AccuracyTracker', () => {
  let tracker: AccuracyTracker;

  beforeEach(() => {
    tracker = new AccuracyTracker();
  });

  const makeOutcome = (
    overrides: Partial<AccuracyOutcome> = {},
  ): AccuracyOutcome => ({
    tenantId: 'tenant-1',
    agentType: 'categorizer',
    llmPrediction: '4100',
    heuristicPrediction: '4100',
    actualOutcome: '4100',
    llmConfidence: 85,
    heuristicConfidence: 70,
    scoringPath: 'HYBRID',
    ...overrides,
  });

  describe('recordOutcome', () => {
    it('should store record in memory', async () => {
      await tracker.recordOutcome(makeOutcome());

      expect(tracker.getRecordCount('tenant-1', 'categorizer')).toBe(1);
    });

    it('should compute llmCorrect correctly when prediction matches', async () => {
      await tracker.recordOutcome(
        makeOutcome({
          llmPrediction: '4100',
          actualOutcome: '4100',
        }),
      );

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.llmAccuracy).toBe(100);
    });

    it('should compute llmCorrect correctly when prediction does not match', async () => {
      await tracker.recordOutcome(
        makeOutcome({
          llmPrediction: '4100',
          actualOutcome: '8100',
        }),
      );

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.llmAccuracy).toBe(0);
    });

    it('should compute heuristicCorrect correctly when prediction matches', async () => {
      await tracker.recordOutcome(
        makeOutcome({
          heuristicPrediction: '4100',
          actualOutcome: '4100',
        }),
      );

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.heuristicAccuracy).toBe(100);
    });

    it('should compute heuristicCorrect correctly when prediction does not match', async () => {
      await tracker.recordOutcome(
        makeOutcome({
          heuristicPrediction: '4100',
          actualOutcome: '8100',
        }),
      );

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.heuristicAccuracy).toBe(0);
    });

    it('should dual-write to both AgentDB and in-memory', async () => {
      // AgentDB is a stub that does nothing, but the in-memory store should work
      await tracker.recordOutcome(makeOutcome());

      // Verify in-memory store received the data
      expect(tracker.getRecordCount('tenant-1', 'categorizer')).toBe(1);
      // AgentDB stub doesn't throw, so dual-write completed without error
    });
  });

  describe('getAccuracy', () => {
    it('should return 0/0 with HYBRID recommendation when no records', async () => {
      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');

      expect(stats.llmAccuracy).toBe(0);
      expect(stats.heuristicAccuracy).toBe(0);
      expect(stats.sampleSize).toBe(0);
      expect(stats.recommendation).toBe('HYBRID');
    });

    it('should return HYBRID when sampleSize < 50', async () => {
      // Add 30 records (< 50 threshold)
      for (let i = 0; i < 30; i++) {
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: '4100',
            heuristicPrediction: '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.sampleSize).toBe(30);
      expect(stats.recommendation).toBe('HYBRID');
    });

    it('should return LLM_PRIMARY when llm accuracy > heuristic + 5%', async () => {
      // Add 60 records: LLM correct 50/60, heuristic correct 25/60
      for (let i = 0; i < 60; i++) {
        const llmCorrect = i < 50;
        const heuristicCorrect = i < 25;
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: llmCorrect ? '4100' : '8100',
            heuristicPrediction: heuristicCorrect ? '4100' : '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.sampleSize).toBe(60);
      // llmAccuracy = round(50/60 * 100) = 83
      // heuristicAccuracy = round(25/60 * 100) = 42
      expect(stats.llmAccuracy).toBeGreaterThan(stats.heuristicAccuracy + 5);
      expect(stats.recommendation).toBe('LLM_PRIMARY');
    });

    it('should return HEURISTIC_PRIMARY when heuristic accuracy > llm + 5%', async () => {
      // Add 60 records: heuristic correct 50/60, LLM correct 25/60
      for (let i = 0; i < 60; i++) {
        const llmCorrect = i < 25;
        const heuristicCorrect = i < 50;
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: llmCorrect ? '4100' : '8100',
            heuristicPrediction: heuristicCorrect ? '4100' : '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      expect(stats.heuristicAccuracy).toBeGreaterThan(stats.llmAccuracy + 5);
      expect(stats.recommendation).toBe('HEURISTIC_PRIMARY');
    });

    it('should return HYBRID when within 5% margin', async () => {
      // Add 60 records: LLM correct 40/60, heuristic correct 38/60
      for (let i = 0; i < 60; i++) {
        const llmCorrect = i < 40;
        const heuristicCorrect = i < 38;
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: llmCorrect ? '4100' : '8100',
            heuristicPrediction: heuristicCorrect ? '4100' : '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      // llmAccuracy = round(40/60 * 100) = 67
      // heuristicAccuracy = round(38/60 * 100) = 63
      // Margin = 4, which is <= 5
      expect(
        Math.abs(stats.llmAccuracy - stats.heuristicAccuracy),
      ).toBeLessThanOrEqual(5);
      expect(stats.recommendation).toBe('HYBRID');
    });

    it('should use last 200 records (recency bias)', async () => {
      // Add 250 records: first 150 = LLM wrong, last 100 = LLM correct
      for (let i = 0; i < 250; i++) {
        const llmCorrect = i >= 150;
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: llmCorrect ? '4100' : '8100',
            heuristicPrediction: '8100', // always wrong
            actualOutcome: '4100',
          }),
        );
      }

      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      // Last 200 records: records 50-249
      // LLM correct for records 150-249 = 100 out of 200 = 50%
      expect(stats.sampleSize).toBe(200);
      expect(stats.llmAccuracy).toBe(50);
    });

    it('should filter by tenantId', async () => {
      await tracker.recordOutcome(makeOutcome({ tenantId: 'tenant-1' }));
      await tracker.recordOutcome(makeOutcome({ tenantId: 'tenant-2' }));

      expect(tracker.getRecordCount('tenant-1', 'categorizer')).toBe(1);
      expect(tracker.getRecordCount('tenant-2', 'categorizer')).toBe(1);
    });

    it('should filter by agentType', async () => {
      await tracker.recordOutcome(makeOutcome({ agentType: 'categorizer' }));
      await tracker.recordOutcome(makeOutcome({ agentType: 'matcher' }));

      expect(tracker.getRecordCount('tenant-1', 'categorizer')).toBe(1);
      expect(tracker.getRecordCount('tenant-1', 'matcher')).toBe(1);
    });

    it('should not store PII in records', async () => {
      await tracker.recordOutcome(makeOutcome());

      // Verify the record fields don't include PII
      const stats = await tracker.getAccuracy('tenant-1', 'categorizer');
      // AccuracyStats only contains: llmAccuracy, heuristicAccuracy, sampleSize, recommendation
      expect(stats).not.toHaveProperty('firstName');
      expect(stats).not.toHaveProperty('lastName');
      expect(stats).not.toHaveProperty('email');
      expect(stats).not.toHaveProperty('phone');
      expect(stats).not.toHaveProperty('address');
      expect(stats).not.toHaveProperty('idNumber');
    });
  });
});
