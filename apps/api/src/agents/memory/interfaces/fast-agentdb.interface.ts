/**
 * FastAgentDB Adapter Interfaces
 * TASK-STUB-002: FastAgentDB Stub Replacement
 *
 * @module agents/memory/interfaces/fast-agentdb.interface
 * @description Type definitions for the FastAgentDB adapter that bridges
 * CrecheBooks' AgentDBStub interface with ruvector's FastAgentDB and
 * agentic-flow's ReflexionMemory.
 *
 * CRITICAL RULES:
 * - No PII in stored records (only IDs, codes, confidence, correctness)
 * - ALL monetary values are CENTS (integers)
 * - Tenant isolation: tenantId required in all store params
 */

import type { MemoryAccuracyStats } from './agent-memory.interface';

/** Parameters for storing an agent decision in FastAgentDB */
export interface AgentDBStoreParams {
  tenantId: string;
  agentType: string;
  inputHash: string;
  decision: Record<string, unknown>;
  confidence: number;
  source: string;
  transactionId?: string;
  embedding?: number[]; // Pre-computed embedding for vector search
}

/** Parameters for recording a correction */
export interface AgentDBCorrectionParams {
  tenantId: string;
  agentDecisionId: string;
  originalValue: Record<string, unknown>;
  correctedValue: Record<string, unknown>;
  correctedBy: string;
}

/** Accuracy stats returned by FastAgentDB (compatible with MemoryAccuracyStats) */
export type AgentDBAccuracyStats = MemoryAccuracyStats;

/** A similar episode found via vector search */
export interface AgentDBSimilarEpisode {
  id: string;
  episode: {
    state: unknown;
    action: string;
    reward: number;
    metadata?: Record<string, unknown>;
  };
  score: number;
}

/** Full interface for the FastAgentDB adapter */
export interface AgentDBInterface {
  store(data: AgentDBStoreParams): Promise<void>;
  recordCorrection(data: AgentDBCorrectionParams): Promise<void>;
  getAccuracyStats(
    tenantId: string,
    agentType: string,
  ): Promise<AgentDBAccuracyStats | null>;
  searchSimilarEpisodes(
    queryEmbedding: number[],
    limit?: number,
  ): Promise<AgentDBSimilarEpisode[]>;
  isAvailable(): boolean;
}
