/**
 * Shadow Runner
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 *
 * @module agents/rollout/shadow-runner
 * @description Runs SDK and heuristic functions in parallel based on feature flag mode.
 *
 * Modes:
 * - DISABLED: Only runs heuristicFn (safe default)
 * - SHADOW:   Runs heuristicFn first, then sdkFn in background (non-blocking).
 *             ALWAYS returns heuristic result. Logs comparison.
 * - PRIMARY:  Runs sdkFn first, falls back to heuristicFn on error.
 *
 * All errors are caught and logged, never thrown.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { FeatureFlagService } from './feature-flags.service';
import { AuditTrailService } from '../audit/audit-trail.service';
import {
  SdkMode,
  ComparisonResult,
  ShadowRunParams,
} from './interfaces/rollout.interface';

@Injectable()
export class ShadowRunner {
  private readonly logger = new Logger(ShadowRunner.name);

  constructor(
    private readonly featureFlags: FeatureFlagService,
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrail?: AuditTrailService,
  ) {}

  /**
   * Run SDK and/or heuristic functions based on the feature flag mode.
   *
   * @param params - Shadow run parameters
   * @returns Result from the appropriate function based on mode
   */
  async run<T>(params: ShadowRunParams<T>): Promise<T> {
    const { tenantId, agentType, sdkFn, heuristicFn, compareFn } = params;

    // Look up feature flag: sdk_{agentType}
    const flagKey = `sdk_${agentType}`;
    let mode: SdkMode;

    try {
      mode = await this.featureFlags.getMode(tenantId, flagKey);
    } catch {
      this.logger.warn(
        `Failed to get mode for ${flagKey} (tenant ${tenantId}) — defaulting to DISABLED`,
      );
      mode = SdkMode.DISABLED;
    }

    switch (mode) {
      case SdkMode.DISABLED:
        return this.runDisabled(heuristicFn);

      case SdkMode.SHADOW:
        return this.runShadow(
          tenantId,
          agentType,
          sdkFn,
          heuristicFn,
          compareFn,
        );

      case SdkMode.PRIMARY:
        return this.runPrimary(tenantId, agentType, sdkFn, heuristicFn);

      default:
        this.logger.warn(
          `Unknown mode "${String(mode)}" for ${flagKey} — defaulting to DISABLED`,
        );
        return this.runDisabled(heuristicFn);
    }
  }

  /**
   * DISABLED mode: only runs heuristicFn.
   */
  private async runDisabled<T>(heuristicFn: () => Promise<T>): Promise<T> {
    return heuristicFn();
  }

  /**
   * SHADOW mode: runs heuristicFn first, then sdkFn in background.
   * ALWAYS returns heuristic result. Comparison is logged asynchronously.
   */
  private async runShadow<T>(
    tenantId: string,
    agentType: string,
    sdkFn: () => Promise<T>,
    heuristicFn: () => Promise<T>,
    compareFn: (sdk: T, heuristic: T) => ComparisonResult,
  ): Promise<T> {
    // Run heuristic first (this is the canonical result)
    const heuristicStart = Date.now();
    const heuristicResult = await heuristicFn();
    const heuristicDurationMs = Date.now() - heuristicStart;

    // Run SDK in background (non-blocking)
    const sdkStart = Date.now();
    sdkFn()
      .then((sdkResult) => {
        const sdkDurationMs = Date.now() - sdkStart;
        try {
          const comparison = compareFn(sdkResult, heuristicResult);
          comparison.sdkDurationMs = sdkDurationMs;
          comparison.heuristicDurationMs = heuristicDurationMs;
          this.logComparison(comparison).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Failed to log comparison: ${msg}`);
          });
        } catch (compareErr: unknown) {
          const msg =
            compareErr instanceof Error
              ? compareErr.message
              : String(compareErr);
          this.logger.warn(
            `Comparison failed for ${agentType} (tenant ${tenantId}): ${msg}`,
          );
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Shadow SDK run failed for ${agentType} (tenant ${tenantId}): ${msg}`,
        );
      });

    // ALWAYS return heuristic result
    return heuristicResult;
  }

  /**
   * PRIMARY mode: runs sdkFn first, falls back to heuristicFn on error.
   */
  private async runPrimary<T>(
    tenantId: string,
    agentType: string,
    sdkFn: () => Promise<T>,
    heuristicFn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await sdkFn();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `PRIMARY SDK failed for ${agentType} (tenant ${tenantId}): ${msg} — falling back to heuristic`,
      );
      return heuristicFn();
    }
  }

  /**
   * Log a comparison result to the audit trail.
   * Non-blocking: errors are caught and logged, never thrown.
   */
  async logComparison(comparison: ComparisonResult): Promise<void> {
    if (!this.auditTrail) {
      this.logger.debug(
        'AuditTrailService unavailable — skipping comparison log',
      );
      return;
    }

    try {
      await this.auditTrail.logDecision({
        tenantId: comparison.tenantId,
        agentType: comparison.agentType as 'categorizer' | 'matcher' | 'sars' | 'validator' | 'orchestrator',
        decision: 'shadow_comparison',
        autoApplied: false,
        details: {
          resultsMatch: comparison.resultsMatch,
          sdkDurationMs: comparison.sdkDurationMs,
          heuristicDurationMs: comparison.heuristicDurationMs,
          sdkConfidence: comparison.sdkConfidence,
          heuristicConfidence: comparison.heuristicConfidence,
          ...comparison.details,
        },
        reasoning: comparison.resultsMatch
          ? 'SDK and heuristic results match'
          : 'SDK and heuristic results differ',
        durationMs: comparison.sdkDurationMs,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to log comparison to audit trail: ${msg}`);
    }
  }
}
