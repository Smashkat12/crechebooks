/**
 * ScoringRouter Tests
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * Tests the scoring router that selects optimal scoring paths.
 * Uses real AccuracyTracker with in-memory store.
 */

import { ScoringRouter } from '../scoring-router';
import { AccuracyTracker } from '../accuracy-tracker';
import type { AccuracyOutcome } from '../interfaces/hybrid-scoring.interface';

describe('ScoringRouter', () => {
  let router: ScoringRouter;
  let tracker: AccuracyTracker;

  beforeEach(() => {
    tracker = new AccuracyTracker();
    router = new ScoringRouter(tracker);
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

  describe('getPreferredPath', () => {
    it('should return accuracy-based recommendation when MultiModelRouter returns null', async () => {
      // MultiModelRouter stub always returns null
      // With no records, accuracy recommendation is HYBRID
      const path = await router.getPreferredPath('tenant-1', 'categorizer');

      expect(path).toBe('HYBRID');
    });

    it('should return HYBRID as default path when insufficient data', async () => {
      const path = await router.getPreferredPath('tenant-1', 'categorizer');

      expect(path).toBe('HYBRID');
    });

    it('should return LLM_PRIMARY when LLM has better accuracy', async () => {
      // Add 60 records: LLM correct 55/60, heuristic correct 30/60
      for (let i = 0; i < 60; i++) {
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: i < 55 ? '4100' : '8100',
            heuristicPrediction: i < 30 ? '4100' : '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const path = await router.getPreferredPath('tenant-1', 'categorizer');
      expect(path).toBe('LLM_PRIMARY');
    });

    it('should return HEURISTIC_PRIMARY when heuristic has better accuracy', async () => {
      // Add 60 records: heuristic correct 55/60, LLM correct 30/60
      for (let i = 0; i < 60; i++) {
        await tracker.recordOutcome(
          makeOutcome({
            llmPrediction: i < 30 ? '4100' : '8100',
            heuristicPrediction: i < 55 ? '4100' : '8100',
            actualOutcome: '4100',
          }),
        );
      }

      const path = await router.getPreferredPath('tenant-1', 'categorizer');
      expect(path).toBe('HEURISTIC_PRIMARY');
    });
  });

  describe('getWeightsForPath', () => {
    it('should return correct weights for LLM_PRIMARY', () => {
      const weights = router.getWeightsForPath('LLM_PRIMARY');

      expect(weights.llm).toBe(0.8);
      expect(weights.heuristic).toBe(0.2);
    });

    it('should return correct weights for HEURISTIC_PRIMARY', () => {
      const weights = router.getWeightsForPath('HEURISTIC_PRIMARY');

      expect(weights.llm).toBe(0.2);
      expect(weights.heuristic).toBe(0.8);
    });

    it('should return correct weights for HYBRID', () => {
      const weights = router.getWeightsForPath('HYBRID');

      expect(weights.llm).toBe(0.6);
      expect(weights.heuristic).toBe(0.4);
    });

    it('should have heuristic >= 0.2 for all weight mappings', () => {
      const paths: Array<'LLM_PRIMARY' | 'HEURISTIC_PRIMARY' | 'HYBRID'> = [
        'LLM_PRIMARY',
        'HEURISTIC_PRIMARY',
        'HYBRID',
      ];

      for (const path of paths) {
        const weights = router.getWeightsForPath(path);
        expect(weights.heuristic).toBeGreaterThanOrEqual(0.2);
      }
    });

    it('should return a copy of weights (not the original object)', () => {
      const weights1 = router.getWeightsForPath('HYBRID');
      const weights2 = router.getWeightsForPath('HYBRID');

      expect(weights1).not.toBe(weights2);
      expect(weights1).toEqual(weights2);
    });
  });
});
