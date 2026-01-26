/**
 * SARS Explainer Prompts
 * TASK-SDK-005: SarsAgent SDK Enhancement (LLM Explanations)
 *
 * @module agents/sars-agent/sars-prompt
 * @description System prompt and prompt builders for LLM-powered
 * human-friendly explanations of SARS tax calculations.
 *
 * CRITICAL RULES:
 * - LLM ONLY explains - NEVER calculates
 * - No PII in prompts - only aggregated amounts
 * - Amounts displayed in Rands (converted from cents)
 * - All prompt inputs are pre-calculated results, not raw data
 */

import type { SarsBreakdown } from './interfaces/sars.interface';
import type { SarsType } from './interfaces/sdk-sars.interface';

/**
 * System prompt for the SARS explainer LLM agent.
 * Instructs the LLM to generate plain-English explanations of
 * pre-calculated SARS tax results for non-accountant creche owners.
 */
export const SARS_EXPLAINER_SYSTEM_PROMPT = `You are a friendly South African tax advisor explaining calculations to a creche owner who is NOT an accountant.

Given tax calculation results, generate a clear, simple explanation.

RULES:
- Use plain English, avoid jargon
- Explain what each line item means in practical terms
- For PAYE: explain the tax bracket, rebates, and what the employer must pay
- For UIF: explain employer vs employee contributions and the cap
- For EMP201: summarize what's owed to SARS this month and the deadline
- For VAT201: explain output vs input VAT, and whether a refund or payment is due
- Mention Section 12(h) exemption where relevant (education services often exempt from VAT)
- Keep explanations under 200 words
- Never suggest tax avoidance strategies
- Never give specific financial advice beyond explaining the calculation
- Always remind that a professional accountant should review
- Format amounts as "R1,234.56" (South African Rand)

RESPONSE FORMAT: Plain text paragraph(s). No JSON. No markdown. Just clear English.`;

/**
 * Model to use for SARS explanations (sonnet for nuanced explanations).
 */
export const SARS_EXPLAINER_MODEL = 'sonnet';

/**
 * Maximum tokens for explanation responses.
 */
export const SARS_EXPLAINER_MAX_TOKENS = 500;

/**
 * Temperature for explanation generation (low for consistency).
 */
export const SARS_EXPLAINER_TEMPERATURE = 0.3;

/**
 * Convert cents to formatted Rands string (e.g., 123456 -> "R1,234.56").
 * @param cents - Amount in cents (integer)
 * @returns Formatted Rand string
 */
export function formatCentsAsRands(cents: number): string {
  const rands = (cents / 100).toFixed(2);
  const parts = rands.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R${intPart}.${parts[1]}`;
}

/**
 * Build prompt context for PAYE explanation.
 * Converts cents to Rands for human-readable display.
 *
 * @param breakdown - Pre-calculated PAYE breakdown
 * @returns Formatted prompt string for PAYE explanation
 */
export function buildPayePrompt(breakdown: SarsBreakdown): string {
  const gross = formatCentsAsRands(breakdown.grossAmountCents ?? 0);
  const taxBeforeRebates = formatCentsAsRands(
    breakdown.taxBeforeRebatesCents ?? 0,
  );
  const rebates = formatCentsAsRands(breakdown.totalRebatesCents ?? 0);
  const medicalCredits = formatCentsAsRands(breakdown.medicalCreditsCents ?? 0);
  const netPaye = formatCentsAsRands(breakdown.payeCents ?? 0);

  return (
    `Explain this PAYE (Pay As You Earn) calculation for a creche employee:\n\n` +
    `Gross monthly salary: ${gross}\n` +
    `Tax before rebates: ${taxBeforeRebates}\n` +
    `Total rebates applied: ${rebates}\n` +
    `Medical aid credits: ${medicalCredits}\n` +
    `Net PAYE payable: ${netPaye}\n\n` +
    `Please explain what each amount means and what the employer needs to do.`
  );
}

/**
 * Build prompt context for UIF explanation.
 *
 * @param breakdown - Pre-calculated UIF breakdown
 * @param isAboveCap - Whether the gross is above the UIF contribution cap
 * @returns Formatted prompt string for UIF explanation
 */
export function buildUifPrompt(
  breakdown: SarsBreakdown,
  isAboveCap: boolean,
): string {
  const gross = formatCentsAsRands(breakdown.grossAmountCents ?? 0);
  const totalUif = formatCentsAsRands(breakdown.uifCents ?? 0);
  const halfUif = formatCentsAsRands((breakdown.uifCents ?? 0) / 2);

  return (
    `Explain this UIF (Unemployment Insurance Fund) calculation for a creche employee:\n\n` +
    `Gross monthly remuneration: ${gross}\n` +
    `Employee contribution (1%): ${halfUif}\n` +
    `Employer contribution (1%): ${halfUif}\n` +
    `Total UIF contribution: ${totalUif}\n` +
    `Above UIF cap: ${isAboveCap ? 'Yes (contributions capped at maximum)' : 'No'}\n\n` +
    `Please explain what UIF is and what the employer needs to deduct and pay.`
  );
}

/**
 * Build prompt context for EMP201 explanation.
 *
 * @param breakdown - Pre-calculated EMP201 breakdown
 * @param employeeCount - Number of employees included
 * @param period - Tax period (e.g., "2025-01")
 * @returns Formatted prompt string for EMP201 explanation
 */
export function buildEmp201Prompt(
  breakdown: SarsBreakdown,
  employeeCount: number,
  period: string,
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
    `Explain this EMP201 (Monthly Employer Declaration) for a creche:\n\n` +
    `Period: ${period}\n` +
    `Number of employees: ${String(employeeCount)}\n` +
    `Total PAYE: ${totalPaye}\n` +
    `Total UIF: ${totalUif}\n` +
    `Total SDL (Skills Development Levy): ${totalSdl}\n` +
    `Total payable to SARS: ${totalPayable}\n\n` +
    `Please explain what the EMP201 is, what each component means, and the filing deadline.`
  );
}

/**
 * Build prompt context for VAT201 explanation.
 *
 * @param breakdown - Pre-calculated VAT201 breakdown
 * @param periodStr - Period string (e.g., "2025-01 to 2025-01")
 * @returns Formatted prompt string for VAT201 explanation
 */
export function buildVat201Prompt(
  breakdown: SarsBreakdown,
  periodStr: string,
): string {
  const outputVat = formatCentsAsRands(breakdown.outputVatCents ?? 0);
  const inputVat = formatCentsAsRands(breakdown.inputVatCents ?? 0);
  const netVat =
    (breakdown.outputVatCents ?? 0) - (breakdown.inputVatCents ?? 0);
  const isRefund = netVat < 0;
  const netVatFormatted = formatCentsAsRands(Math.abs(netVat));

  return (
    `Explain this VAT201 (VAT Return) for a creche:\n\n` +
    `Period: ${periodStr}\n` +
    `Output VAT (VAT charged on sales/services): ${outputVat}\n` +
    `Input VAT (VAT paid on purchases): ${inputVat}\n` +
    `Net VAT ${isRefund ? 'refund' : 'payable'}: ${netVatFormatted}\n\n` +
    `Please explain what output and input VAT mean for a creche, ` +
    `whether a payment or refund is due, and mention the Section 12(h) exemption for education services.`
  );
}

/**
 * Build a type-specific prompt for the given SARS type and breakdown.
 *
 * @param type - SARS submission type
 * @param breakdown - Pre-calculated breakdown
 * @param context - Additional context (period, employee count, etc.)
 * @returns Formatted prompt string
 */
export function buildPromptForType(
  type: SarsType,
  breakdown: SarsBreakdown,
  context: {
    period: string;
    employeeCount?: number;
    isAboveCap?: boolean;
  },
): string {
  switch (type) {
    case 'PAYE':
      return buildPayePrompt(breakdown);
    case 'UIF':
      return buildUifPrompt(breakdown, context.isAboveCap ?? false);
    case 'EMP201':
      return buildEmp201Prompt(
        breakdown,
        context.employeeCount ?? 0,
        context.period,
      );
    case 'VAT201':
      return buildVat201Prompt(breakdown, context.period);
  }
}
