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
