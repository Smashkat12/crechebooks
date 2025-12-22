/**
 * SARS Agent Interfaces
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * @module agents/sars-agent/interfaces
 * @description TypeScript interfaces for the SARS Agent.
 * All monetary values are in CENTS (integers).
 *
 * CRITICAL: SARS submissions ALWAYS require human review (L2 autonomy)
 */

/**
 * SARS decision result - ALWAYS requires review
 */
export interface SarsDecision {
  type: 'PAYE' | 'UIF' | 'EMP201' | 'VAT201';
  action: 'DRAFT_FOR_REVIEW'; // Always L2 - never auto-submit
  tenantId: string;
  period: string;
  calculatedAmountCents: number;
  requiresReview: true; // Always true for SARS
  reasoning: string;
  breakdown?: SarsBreakdown;
}

/**
 * Breakdown details for SARS calculations
 */
export interface SarsBreakdown {
  grossAmountCents?: number;
  taxBeforeRebatesCents?: number;
  totalRebatesCents?: number;
  medicalCreditsCents?: number;
  outputVatCents?: number;
  inputVatCents?: number;
  payeCents?: number;
  uifCents?: number;
  sdlCents?: number;
}

/**
 * Decision log entry format for SARS decisions
 */
export interface SarsDecisionLog {
  timestamp: string;
  agent: 'sars-agent';
  tenantId: string;
  type: 'PAYE' | 'UIF' | 'EMP201' | 'VAT201';
  period: string;
  amountCents: number;
  autoApplied: false; // SARS is NEVER auto-applied
  reasoning: string;
}

/**
 * Escalation log entry format for SARS submissions
 */
export interface SarsEscalationLog {
  timestamp: string;
  agent: 'sars-agent';
  tenantId: string;
  type: 'SARS_SUBMISSION';
  subType: 'PAYE' | 'UIF' | 'EMP201' | 'VAT201';
  period: string;
  amountCents: number;
  reason: string;
  status: 'pending';
  requiresHumanApproval: true;
}

/**
 * DTO for PAYE calculation through agent
 */
export interface AgentPayeDto {
  tenantId: string;
  grossIncomeCents: number;
  payFrequency: 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY';
  dateOfBirth: Date;
  medicalAidMembers: number;
  period: string; // e.g., "2025-01"
}

/**
 * DTO for UIF calculation through agent
 */
export interface AgentUifDto {
  tenantId: string;
  grossRemunerationCents: number;
  period: string;
}

/**
 * DTO for EMP201 generation through agent
 */
export interface AgentEmp201Dto {
  tenantId: string;
  periodMonth: string; // e.g., "2025-01"
}

/**
 * DTO for VAT201 generation through agent
 */
export interface AgentVat201Dto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}
