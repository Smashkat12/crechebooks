/**
 * Shadow Runner Tests
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ShadowRunner } from '../shadow-runner';
import { FeatureFlagService } from '../feature-flags.service';
import { AuditTrailService } from '../../audit/audit-trail.service';
import { SdkMode, ComparisonResult } from '../interfaces/rollout.interface';

describe('ShadowRunner', () => {
  let runner: ShadowRunner;
  let featureFlags: { getMode: jest.Mock };
  let auditTrail: { logDecision: jest.Mock };

  const tenantId = 'tenant-1';
  const agentType = 'categorizer';

  const mockCompare = (
    sdk: string,
    heuristic: string,
  ): ComparisonResult => ({
    tenantId,
    agentType,
    sdkResult: sdk,
    heuristicResult: heuristic,
    sdkDurationMs: 100,
    heuristicDurationMs: 50,
    resultsMatch: sdk === heuristic,
    details: {},
  });

  beforeEach(async () => {
    featureFlags = { getMode: jest.fn() };
    auditTrail = { logDecision: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShadowRunner,
        { provide: FeatureFlagService, useValue: featureFlags },
        { provide: AuditTrailService, useValue: auditTrail },
      ],
    }).compile();

    runner = module.get<ShadowRunner>(ShadowRunner);
  });

  describe('DISABLED mode', () => {
    it('should only run heuristicFn, never sdkFn', async () => {
      featureFlags.getMode.mockResolvedValue(SdkMode.DISABLED);
      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');
      const compareFn = jest.fn();

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn,
      });

      expect(result).toBe('heuristic-result');
      expect(heuristicFn).toHaveBeenCalledTimes(1);
      expect(sdkFn).not.toHaveBeenCalled();
      expect(compareFn).not.toHaveBeenCalled();
    });
  });

  describe('SHADOW mode', () => {
    beforeEach(() => {
      featureFlags.getMode.mockResolvedValue(SdkMode.SHADOW);
    });

    it('should run both and return heuristic result regardless', async () => {
      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('heuristic-result');
      expect(heuristicFn).toHaveBeenCalledTimes(1);

      // Wait for background SDK to complete
      await new Promise((r) => setTimeout(r, 50));
      expect(sdkFn).toHaveBeenCalledTimes(1);
    });

    it('should not affect heuristic result when SDK errors', async () => {
      const sdkFn = jest
        .fn()
        .mockRejectedValue(new Error('SDK exploded'));
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('heuristic-result');

      // Wait for background to settle
      await new Promise((r) => setTimeout(r, 50));
      // Should not throw
    });

    it('should log comparison to audit trail', async () => {
      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      // Wait for background processing
      await new Promise((r) => setTimeout(r, 100));

      expect(auditTrail.logDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          agentType: 'categorizer',
          decision: 'shadow_comparison',
          autoApplied: false,
          details: expect.objectContaining({
            resultsMatch: false,
          }),
        }),
      );
    });
  });

  describe('PRIMARY mode', () => {
    beforeEach(() => {
      featureFlags.getMode.mockResolvedValue(SdkMode.PRIMARY);
    });

    it('should return SDK result when it succeeds', async () => {
      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('sdk-result');
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(heuristicFn).not.toHaveBeenCalled();
    });

    it('should fall back to heuristic when SDK fails', async () => {
      const sdkFn = jest
        .fn()
        .mockRejectedValue(new Error('SDK failed'));
      const heuristicFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('fallback-result');
      expect(sdkFn).toHaveBeenCalledTimes(1);
      expect(heuristicFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('unknown mode', () => {
    it('should default to DISABLED behavior', async () => {
      // Force an unknown mode by casting
      featureFlags.getMode.mockResolvedValue('EXPERIMENTAL' as SdkMode);

      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('heuristic-result');
      expect(sdkFn).not.toHaveBeenCalled();
    });
  });

  describe('getMode failure', () => {
    it('should default to DISABLED when getMode throws', async () => {
      featureFlags.getMode.mockRejectedValue(new Error('DB error'));

      const sdkFn = jest.fn().mockResolvedValue('sdk-result');
      const heuristicFn = jest.fn().mockResolvedValue('heuristic-result');

      const result = await runner.run({
        tenantId,
        agentType,
        sdkFn,
        heuristicFn,
        compareFn: mockCompare,
      });

      expect(result).toBe('heuristic-result');
      expect(sdkFn).not.toHaveBeenCalled();
    });
  });

  describe('logComparison', () => {
    it('should write to audit trail (non-blocking)', async () => {
      const comparison: ComparisonResult = {
        tenantId,
        agentType,
        sdkResult: { code: '4100' },
        heuristicResult: { code: '8100' },
        sdkDurationMs: 200,
        heuristicDurationMs: 50,
        resultsMatch: false,
        sdkConfidence: 85,
        heuristicConfidence: 70,
        details: { note: 'mismatch' },
      };

      await runner.logComparison(comparison);

      expect(auditTrail.logDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          agentType,
          decision: 'shadow_comparison',
          autoApplied: false,
          reasoning: 'SDK and heuristic results differ',
          details: expect.objectContaining({
            resultsMatch: false,
            sdkDurationMs: 200,
            heuristicDurationMs: 50,
            sdkConfidence: 85,
            heuristicConfidence: 70,
            note: 'mismatch',
          }),
        }),
      );
    });

    it('should handle audit trail unavailability gracefully', async () => {
      // Create runner without audit trail
      const noAuditModule = await Test.createTestingModule({
        providers: [
          ShadowRunner,
          { provide: FeatureFlagService, useValue: featureFlags },
        ],
      }).compile();

      const noAuditRunner = noAuditModule.get<ShadowRunner>(ShadowRunner);

      const comparison: ComparisonResult = {
        tenantId,
        agentType,
        sdkResult: 'a',
        heuristicResult: 'a',
        sdkDurationMs: 100,
        heuristicDurationMs: 50,
        resultsMatch: true,
        details: {},
      };

      // Should not throw
      await expect(
        noAuditRunner.logComparison(comparison),
      ).resolves.toBeUndefined();
    });

    it('should handle audit trail errors gracefully', async () => {
      auditTrail.logDecision.mockRejectedValue(new Error('DB error'));

      const comparison: ComparisonResult = {
        tenantId,
        agentType,
        sdkResult: 'a',
        heuristicResult: 'b',
        sdkDurationMs: 100,
        heuristicDurationMs: 50,
        resultsMatch: false,
        details: {},
      };

      // Should not throw
      await expect(
        runner.logComparison(comparison),
      ).resolves.toBeUndefined();
    });
  });
});
