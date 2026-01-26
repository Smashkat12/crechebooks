/**
 * SDK SARS Explainer Interfaces
 * TASK-SDK-005: SarsAgent SDK Enhancement (LLM Explanations)
 *
 * @module agents/sars-agent/interfaces/sdk-sars.interface
 * @description TypeScript interfaces for SDK-enhanced SARS explanations.
 * The LLM ONLY explains calculations - it NEVER calculates.
 * All monetary values are in CENTS (integers).
 */

/**
 * SARS submission types supported by the explainer.
 */
export type SarsType = 'PAYE' | 'UIF' | 'EMP201' | 'VAT201';

/**
 * Configuration for the SARS explainer LLM agent.
 */
export interface SarsExplainerConfig {
  /** Model identifier (e.g., 'sonnet' for nuanced explanations) */
  model: string;
  /** Maximum tokens for the explanation response */
  maxTokens: number;
  /** Temperature for response generation (low for consistency) */
  temperature: number;
}

/**
 * Context about the SARS calculation being explained.
 */
export interface ExplanationContext {
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Tax period (e.g., '2025-01') */
  period: string;
  /** Type of SARS calculation */
  type: SarsType;
}

/**
 * Input data for PAYE explanation.
 * All monetary values are in CENTS (integers).
 */
export interface PayeExplanationInput {
  grossAmountCents: number;
  taxBeforeRebatesCents: number;
  totalRebatesCents: number;
  medicalCreditsCents: number;
  payeCents: number;
}

/**
 * Input data for UIF explanation.
 * All monetary values are in CENTS (integers).
 */
export interface UifExplanationInput {
  grossAmountCents: number;
  employeeContributionCents: number;
  employerContributionCents: number;
  totalContributionCents: number;
  isAboveCap: boolean;
}

/**
 * Input data for EMP201 explanation.
 * All monetary values are in CENTS (integers).
 */
export interface Emp201ExplanationInput {
  totalPayeCents: number;
  totalUifCents: number;
  totalSdlCents: number;
  totalPayableCents: number;
  employeeCount: number;
  period: string;
}

/**
 * Input data for VAT201 explanation.
 * All monetary values are in CENTS (integers).
 */
export interface Vat201ExplanationInput {
  outputVatCents: number;
  inputVatCents: number;
  netVatCents: number;
  periodStr: string;
}
