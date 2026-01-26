/**
 * SDK SARS Explainer
 * TASK-SDK-005: SarsAgent SDK Enhancement (LLM Explanations)
 *
 * @module agents/sars-agent/sdk-sars-explainer
 * @description SdkSarsExplainer extends BaseSdkAgent to provide LLM-powered
 * human-friendly explanations of pre-calculated SARS tax results.
 *
 * CRITICAL RULES:
 * - LLM ONLY explains - NEVER calculates
 * - All monetary values are CENTS (integers)
 * - No PII in prompts - only aggregated amounts
 * - Falls back to template-based explanation if SDK is unavailable
 * - SARS is ALWAYS L2: action='DRAFT_FOR_REVIEW', requiresReview=true
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseSdkAgent, SdkAgentFactory, SdkConfigService } from '../sdk';
import type { AgentDefinition } from '../sdk';
import type { SarsBreakdown } from './interfaces/sars.interface';
import type {
  SarsType,
  ExplanationContext,
} from './interfaces/sdk-sars.interface';
import {
  SARS_EXPLAINER_SYSTEM_PROMPT,
  SARS_EXPLAINER_MODEL,
  SARS_EXPLAINER_MAX_TOKENS,
  SARS_EXPLAINER_TEMPERATURE,
  buildPromptForType,
  formatCentsAsRands,
} from './sars-prompt';

@Injectable()
export class SdkSarsExplainer extends BaseSdkAgent {
  protected override readonly logger = new Logger(SdkSarsExplainer.name);

  constructor(factory: SdkAgentFactory, config: SdkConfigService) {
    super(factory, config, SdkSarsExplainer.name);
  }

  /**
   * Returns the SARS agent definition for a given tenant.
   * Delegates to the factory's createSarsAgent method.
   * @param tenantId - Tenant ID for tenant-specific context
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return this.factory.createSarsAgent(tenantId);
  }

  /**
   * Get the model used for SARS explanations.
   */
  getModel(): string {
    return SARS_EXPLAINER_MODEL;
  }

  /**
   * Get the max tokens configuration.
   */
  getMaxTokens(): number {
    return SARS_EXPLAINER_MAX_TOKENS;
  }

  /**
   * Get the temperature configuration.
   */
  getTemperature(): number {
    return SARS_EXPLAINER_TEMPERATURE;
  }

  /**
   * Get the system prompt for explanations.
   */
  getSystemPrompt(): string {
    return SARS_EXPLAINER_SYSTEM_PROMPT;
  }

  /**
   * Generate a human-friendly explanation of a SARS calculation.
   *
   * Uses executeWithFallback to try LLM inference first, then fall back
   * to a template-based explanation if SDK is unavailable or fails.
   *
   * @param type - SARS submission type (PAYE, UIF, EMP201, VAT201)
   * @param breakdown - Pre-calculated breakdown data (all values in cents)
   * @param context - Explanation context (tenantId, period, type)
   * @returns Human-friendly explanation string
   */
  async explain(
    type: SarsType,
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): Promise<string> {
    const userPrompt = buildPromptForType(type, breakdown, {
      period: context.period,
    });

    const result = await this.executeWithFallback<string>(
      // SDK function: attempt LLM inference
      async () => {
        return this.executeSdkInference(
          {
            description: `Explain ${type} calculation for tenant`,
            prompt: SARS_EXPLAINER_SYSTEM_PROMPT,
            tools: [],
            model: SARS_EXPLAINER_MODEL,
          },
          userPrompt,
          context.tenantId,
        );
      },
      // Fallback function: generate template-based explanation
      () => {
        return Promise.resolve(
          this.buildFallbackExplanation(type, breakdown, context),
        );
      },
    );

    return result.data;
  }

  /**
   * Execute inference via the SDK execution engine.
   * NOTE: agentic-flow's AgenticFlow class may not be available at runtime.
   * This method throws "SDK inference not available" when called without
   * the real agentic-flow package. The executeWithFallback() method in
   * BaseSdkAgent catches this and falls through to the fallback path.
   *
   * @param _agentDef - Agent definition with prompt and tools
   * @param _userMessage - User message to send to the LLM
   * @param _tenantId - Tenant ID for isolation
   * @returns LLM response string
   * @throws Error when SDK inference engine is not available
   */
  executeSdkInference(
    _agentDef: AgentDefinition,
    _userMessage: string,
    _tenantId: string,
  ): Promise<string> {
    return Promise.reject(
      new Error(
        'SDK inference not available: agentic-flow execution engine not installed. ' +
          'Install agentic-flow to enable LLM-based SARS explanations.',
      ),
    );
  }

  /**
   * Build a template-based fallback explanation when the LLM is unavailable.
   * Provides a simpler but still useful human-friendly explanation
   * based on the calculated breakdown data.
   *
   * @param type - SARS submission type
   * @param breakdown - Pre-calculated breakdown
   * @param context - Explanation context
   * @returns Template-based explanation string
   */
  buildFallbackExplanation(
    type: SarsType,
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): string {
    switch (type) {
      case 'PAYE':
        return this.buildPayeFallback(breakdown, context);
      case 'UIF':
        return this.buildUifFallback(breakdown, context);
      case 'EMP201':
        return this.buildEmp201Fallback(breakdown, context);
      case 'VAT201':
        return this.buildVat201Fallback(breakdown, context);
    }
  }

  private buildPayeFallback(
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): string {
    const gross = formatCentsAsRands(breakdown.grossAmountCents ?? 0);
    const taxBeforeRebates = formatCentsAsRands(
      breakdown.taxBeforeRebatesCents ?? 0,
    );
    const rebates = formatCentsAsRands(breakdown.totalRebatesCents ?? 0);
    const medicalCredits = formatCentsAsRands(
      breakdown.medicalCreditsCents ?? 0,
    );
    const netPaye = formatCentsAsRands(breakdown.payeCents ?? 0);

    return (
      `PAYE Summary for ${context.period}: ` +
      `On a gross salary of ${gross}, the tax before rebates is ${taxBeforeRebates}. ` +
      `After applying rebates of ${rebates} and medical aid credits of ${medicalCredits}, ` +
      `the net PAYE payable to SARS is ${netPaye}. ` +
      `This amount must be deducted from the employee's salary and paid to SARS. ` +
      `Please have a professional accountant review this calculation before submission.`
    );
  }

  private buildUifFallback(
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): string {
    const gross = formatCentsAsRands(breakdown.grossAmountCents ?? 0);
    const totalUif = formatCentsAsRands(breakdown.uifCents ?? 0);

    return (
      `UIF Summary for ${context.period}: ` +
      `On a gross remuneration of ${gross}, the total UIF contribution is ${totalUif}. ` +
      `This is split equally between employee and employer (1% each). ` +
      `The employer must deduct the employee's share from their salary and pay the full amount to SARS. ` +
      `Please have a professional accountant review this calculation before submission.`
    );
  }

  private buildEmp201Fallback(
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): string {
    const totalPaye = formatCentsAsRands(breakdown.payeCents ?? 0);
    const totalUif = formatCentsAsRands(breakdown.uifCents ?? 0);
    const totalSdl = formatCentsAsRands(breakdown.sdlCents ?? 0);
    const totalPayable = formatCentsAsRands(
      (breakdown.payeCents ?? 0) +
        (breakdown.uifCents ?? 0) +
        (breakdown.sdlCents ?? 0),
    );

    return (
      `EMP201 Summary for ${context.period}: ` +
      `This monthly employer declaration includes PAYE of ${totalPaye}, ` +
      `UIF of ${totalUif}, and SDL of ${totalSdl}, ` +
      `for a total payable to SARS of ${totalPayable}. ` +
      `The EMP201 must be filed within 7 days after the end of the month. ` +
      `Please have a professional accountant review this declaration before submission.`
    );
  }

  private buildVat201Fallback(
    breakdown: SarsBreakdown,
    context: ExplanationContext,
  ): string {
    const outputVat = formatCentsAsRands(breakdown.outputVatCents ?? 0);
    const inputVat = formatCentsAsRands(breakdown.inputVatCents ?? 0);
    const netVat =
      (breakdown.outputVatCents ?? 0) - (breakdown.inputVatCents ?? 0);
    const isRefund = netVat < 0;
    const netVatFormatted = formatCentsAsRands(Math.abs(netVat));

    return (
      `VAT201 Summary for ${context.period}: ` +
      `Output VAT (charged on services) is ${outputVat} and input VAT (paid on purchases) is ${inputVat}. ` +
      `The net ${isRefund ? 'refund due' : 'amount payable'} is ${netVatFormatted}. ` +
      `Note: Education services may be exempt from VAT under Section 12(h). ` +
      `Please have a professional accountant review this return before submission.`
    );
  }
}
