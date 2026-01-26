/**
 * Accuracy Tracker
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * @module agents/shared/accuracy-tracker
 * @description Tracks accuracy of LLM and heuristic predictions using a
 * dual-write pattern: AgentDB (learning) + in-memory store (audit).
 *
 * CRITICAL RULES:
 * - No PII in stored records (only agent type, prediction codes, confidence, correctness)
 * - Dual-write: both AgentDB and in-memory receive every write
 * - Uses in-memory fallback since AgentAccuracyRecord Prisma model doesn't exist yet
 * - Last 200 records used for accuracy calculation (recency bias)
 * - Recommendation thresholds: <50 samples -> HYBRID, >5% margin -> bias toward winner
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AccuracyOutcome,
  AccuracyRecord,
  AccuracyStats,
  ScoringPathRecommendation,
} from './interfaces/hybrid-scoring.interface';

// ────────────────────────────────────────────────────────────────────────────
// Local stub for AgentDB (agentic-flow not installed)
// Returns null/void to trigger in-memory fallback.
// ────────────────────────────────────────────────────────────────────────────

class AgentDB {
  async recordAccuracyOutcome(_data: Record<string, unknown>): Promise<void> {
    // Stub: agentic-flow not installed
  }

  async getAccuracyStats(
    _tenantId: string,
    _agentType: string,
  ): Promise<AccuracyStats | null> {
    // Stub: returns null to trigger in-memory fallback
    return null;
  }
}

/** Maximum number of records to consider for accuracy calculation (recency bias) */
const MAX_RECORDS_FOR_ACCURACY = 200;

/** Minimum sample size before making path recommendations */
const MIN_SAMPLE_SIZE = 50;

/** Accuracy margin required to recommend a primary path */
const ACCURACY_MARGIN = 5;

@Injectable()
export class AccuracyTracker {
  private readonly logger = new Logger(AccuracyTracker.name);
  private readonly records: AccuracyRecord[] = [];
  private readonly agentDb: AgentDB;

  constructor() {
    this.agentDb = new AgentDB();
  }

  /**
   * Record an accuracy outcome using dual-write pattern.
   * Both AgentDB and in-memory store receive the data.
   *
   * @param params - Accuracy outcome data (no PII)
   */
  async recordOutcome(params: AccuracyOutcome): Promise<void> {
    const llmCorrect = params.llmPrediction === params.actualOutcome;
    const heuristicCorrect =
      params.heuristicPrediction === params.actualOutcome;

    const record: AccuracyRecord = {
      ...params,
      id: randomUUID(),
      llmCorrect,
      heuristicCorrect,
      createdAt: new Date(),
    };

    // Dual-write 1: AgentDB (learning store)
    try {
      await this.agentDb.recordAccuracyOutcome({
        id: record.id,
        tenantId: record.tenantId,
        agentType: record.agentType,
        llmPrediction: record.llmPrediction,
        heuristicPrediction: record.heuristicPrediction,
        actualOutcome: record.actualOutcome,
        llmConfidence: record.llmConfidence,
        heuristicConfidence: record.heuristicConfidence,
        scoringPath: record.scoringPath,
        llmCorrect: record.llmCorrect,
        heuristicCorrect: record.heuristicCorrect,
        createdAt: record.createdAt.toISOString(),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AgentDB write failed (continuing with in-memory): ${msg}`,
      );
    }

    // Dual-write 2: In-memory store (audit)
    this.records.push(record);
  }

  /**
   * Get accuracy statistics for a tenant/agent pair.
   * Tries AgentDB first (returns null from stub), then falls back to in-memory.
   * Uses last 200 records for recency bias.
   *
   * @param tenantId - Tenant ID for filtering
   * @param agentType - Agent type for filtering
   * @returns Accuracy stats with recommendation
   */
  async getAccuracy(
    tenantId: string,
    agentType: 'categorizer' | 'matcher',
  ): Promise<AccuracyStats> {
    // Try AgentDB first
    try {
      const agentDbStats = await this.agentDb.getAccuracyStats(
        tenantId,
        agentType,
      );
      if (agentDbStats !== null) {
        return agentDbStats;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`AgentDB stats failed, using in-memory: ${msg}`);
    }

    // Fall back to in-memory records
    return this.computeFromMemory(tenantId, agentType);
  }

  /**
   * Get the number of in-memory records for a tenant/agent pair.
   * Useful for testing.
   *
   * @param tenantId - Tenant ID for filtering
   * @param agentType - Agent type for filtering
   * @returns Number of matching records
   */
  getRecordCount(
    tenantId: string,
    agentType: 'categorizer' | 'matcher',
  ): number {
    return this.records.filter(
      (r) => r.tenantId === tenantId && r.agentType === agentType,
    ).length;
  }

  /**
   * Compute accuracy stats from in-memory records.
   */
  private computeFromMemory(
    tenantId: string,
    agentType: 'categorizer' | 'matcher',
  ): AccuracyStats {
    // Filter by tenantId and agentType
    const filtered = this.records.filter(
      (r) => r.tenantId === tenantId && r.agentType === agentType,
    );

    // Take last MAX_RECORDS_FOR_ACCURACY records (recency bias)
    const recent = filtered.slice(-MAX_RECORDS_FOR_ACCURACY);

    const sampleSize = recent.length;

    if (sampleSize === 0) {
      return {
        llmAccuracy: 0,
        heuristicAccuracy: 0,
        sampleSize: 0,
        recommendation: 'HYBRID',
      };
    }

    const llmCorrectCount = recent.filter((r) => r.llmCorrect).length;
    const heuristicCorrectCount = recent.filter(
      (r) => r.heuristicCorrect,
    ).length;

    const llmAccuracy = Math.round((llmCorrectCount / sampleSize) * 100);
    const heuristicAccuracy = Math.round(
      (heuristicCorrectCount / sampleSize) * 100,
    );

    const recommendation = this.computeRecommendation(
      llmAccuracy,
      heuristicAccuracy,
      sampleSize,
    );

    return {
      llmAccuracy,
      heuristicAccuracy,
      sampleSize,
      recommendation,
    };
  }

  /**
   * Compute scoring path recommendation based on accuracy data.
   */
  private computeRecommendation(
    llmAccuracy: number,
    heuristicAccuracy: number,
    sampleSize: number,
  ): ScoringPathRecommendation {
    // Not enough data to make a recommendation
    if (sampleSize < MIN_SAMPLE_SIZE) {
      return 'HYBRID';
    }

    // LLM is clearly better
    if (llmAccuracy > heuristicAccuracy + ACCURACY_MARGIN) {
      return 'LLM_PRIMARY';
    }

    // Heuristic is clearly better
    if (heuristicAccuracy > llmAccuracy + ACCURACY_MARGIN) {
      return 'HEURISTIC_PRIMARY';
    }

    // Within margin - use hybrid
    return 'HYBRID';
  }
}
