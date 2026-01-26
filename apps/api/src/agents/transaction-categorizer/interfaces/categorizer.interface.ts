/**
 * Transaction Categorizer Agent Interfaces
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/interfaces
 * @description TypeScript interfaces for the Transaction Categorizer Agent.
 * All monetary values are in CENTS (integers).
 */

import { VatType } from '../../../database/entities/categorization.entity';

/**
 * Payee pattern from context file
 */
export interface PayeePattern {
  id: string;
  regex: string;
  accountCode: string;
  accountName: string;
  confidence: number;
  vatType: string;
  flagForReview?: boolean;
  reviewReason?: string;
  requiresAmountCheck?: boolean;
  maxAmountCents?: number;
  isCredit?: boolean;
}

/**
 * Chart of accounts entry from context file
 */
export interface ChartOfAccountsEntry {
  code: string;
  name: string;
  type: string;
  category: string;
}

/**
 * Agent context loaded from .claude/context/ files
 */
export interface AgentContext {
  patterns: PayeePattern[];
  chartOfAccounts: ChartOfAccountsEntry[];
  autoApplyThreshold: number;
}

/**
 * Result of pattern matching
 */
export interface PatternMatch {
  pattern: PayeePattern;
  matchedText: string;
  confidence: number;
}

/**
 * Input for confidence calculation
 */
export interface ConfidenceInput {
  patternConfidence: number;
  hasPatternMatch: boolean;
  hasHistoricalMatch: boolean;
  historicalMatchCount: number;
  isAmountTypical: boolean;
  descriptionQuality: number;
}

/**
 * Decision log entry format
 */
export interface DecisionLogEntry {
  timestamp: string;
  agent: 'transaction-categorizer';
  tenantId: string;
  transactionId: string;
  decision: 'categorize' | 'escalate' | 'skip';
  accountCode?: string;
  accountName?: string;
  confidence: number;
  source: 'PATTERN' | 'HISTORICAL' | 'FALLBACK' | 'LLM';
  autoApplied: boolean;
  reasoning: string;
  patternId?: string;
  model?: string;
  durationMs?: number;
}

/**
 * Escalation log entry format
 */
export interface EscalationLogEntry {
  timestamp: string;
  agent: 'transaction-categorizer';
  tenantId: string;
  transactionId: string;
  type:
    | 'LOW_CONFIDENCE_CATEGORIZATION'
    | 'PATTERN_FLAGGED'
    | 'AMOUNT_EXCEEDS_MAX';
  reason: string;
  suggestedAccount?: string;
  suggestedAccountName?: string;
  confidence?: number;
  status: 'pending';
}

/**
 * Result of categorizing a transaction
 */
export interface CategorizationResult {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reasoning: string;
  vatType: VatType;
  isSplit: boolean;
  autoApplied: boolean;
  patternId?: string;
}
