/**
 * Agent Memory Interfaces
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * @module agents/memory/interfaces/agent-memory.interface
 * @description Type definitions for agent decision storage,
 * correction feedback loops, and pattern learning.
 *
 * CRITICAL RULES:
 * - No PII in decision records (only IDs, codes, confidence, correctness)
 * - ALL monetary values are CENTS (integers)
 * - Tenant isolation on ALL queries
 */

export interface StoreDecisionParams {
  tenantId: string;
  agentType: 'categorizer' | 'matcher';
  inputHash: string;
  inputText: string; // Sanitized, no PII — used for embedding
  decision: Record<string, unknown>;
  confidence: number;
  source: 'LLM' | 'PATTERN' | 'HISTORICAL' | 'HYBRID';
  transactionId?: string;
  reasoningChain?: string;
}

export interface RecordCorrectionParams {
  tenantId: string;
  agentDecisionId: string;
  originalValue: Record<string, unknown>;
  correctedValue: CorrectedCategorization;
  correctedBy: string;
  reason?: string;
}

export interface CorrectedCategorization {
  payeeName?: string;
  accountCode: string;
  accountName?: string;
  vatType?: string;
}

export interface PatternLearnResult {
  patternCreated: boolean;
  payeeName?: string;
  accountCode?: string;
  correctionCount?: number;
  reason?: string;
}

export interface MemoryAccuracyStats {
  totalDecisions: number;
  reviewedDecisions: number;
  correctDecisions: number;
  accuracyRate: number;
}

export interface SimilarDecision {
  id: string;
  decision: Record<string, unknown>;
  confidence: number;
  source: string;
  similarity?: number;
}
