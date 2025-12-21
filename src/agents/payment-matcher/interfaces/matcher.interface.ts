/**
 * Payment Matcher Agent Interfaces
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/interfaces
 * @description TypeScript interfaces for the Payment Matcher Agent.
 * All monetary values are in CENTS (integers).
 */

/**
 * Match decision result
 */
export interface MatchDecision {
  transactionId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  confidence: number;
  action: 'AUTO_APPLY' | 'REVIEW_REQUIRED' | 'NO_MATCH';
  reasoning: string;
  alternatives: Array<{
    invoiceId: string;
    invoiceNumber: string;
    confidence: number;
  }>;
}

/**
 * Decision log entry format
 */
export interface MatchDecisionLog {
  timestamp: string;
  agent: 'payment-matcher';
  tenantId: string;
  transactionId: string;
  transactionAmountCents: number;
  decision: 'match' | 'escalate' | 'no_match';
  invoiceId?: string;
  invoiceNumber?: string;
  confidence: number;
  autoApplied: boolean;
  reasoning: string;
  candidateCount: number;
}

/**
 * Escalation log entry format
 */
export interface MatchEscalationLog {
  timestamp: string;
  agent: 'payment-matcher';
  tenantId: string;
  transactionId: string;
  type: 'AMBIGUOUS_MATCH' | 'LOW_CONFIDENCE' | 'AMOUNT_MISMATCH';
  reason: string;
  candidateInvoiceIds: string[];
  candidateInvoiceNumbers: string[];
  status: 'pending';
}

/**
 * Invoice candidate for matching
 */
export interface InvoiceCandidate {
  invoice: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    amountPaidCents: number;
    parentId: string;
    parent: {
      firstName: string;
      lastName: string;
    };
    child: {
      firstName: string;
    };
  };
  confidence: number;
  matchReasons: string[];
}
