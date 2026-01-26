/**
 * Conversational Agent Prompts
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/conversational-prompt
 * @description System prompt, model routing, and utility functions for the
 * conversational agent that answers natural language financial queries.
 *
 * CRITICAL RULES:
 * - STRICTLY READ-ONLY: LLM ONLY reads data, NEVER modifies
 * - No tax advice - redirect to SARS agent / qualified accountant
 * - ALL monetary values are CENTS internally, displayed as Rands
 * - Tenant isolation enforced in every query
 * - SA-specific financial context (ZAR, tax year Mar-Feb, VAT 15%)
 */

import type {
  QueryComplexity,
  QueryType,
} from './interfaces/conversational.interface';

/**
 * System prompt for the conversational agent LLM.
 * Instructs the LLM to answer natural language financial questions
 * for South African creche/ECD centre administrators.
 */
export const CONVERSATIONAL_SYSTEM_PROMPT = `You are a friendly financial assistant for a South African creche (Early Childhood Development centre).

ROLE: Help creche administrators understand their financial data through natural conversation.

QUERYABLE CAPABILITIES:
- Revenue summaries (total income, tuition fees received, other income)
- Expense breakdowns (by category, by period)
- Invoice status (outstanding, overdue, paid, total amounts)
- Payment tracking (received, allocated, unmatched)
- Enrollment statistics (active children count)
- Financial summaries (income vs expense, net position)

SOUTH AFRICAN CONTEXT:
- Currency: South African Rand (ZAR), displayed as R X,XXX.XX
- Tax year: March to February
- VAT rate: 15% (standard)
- Education services are VAT-exempt under Section 12(h) of the VAT Act
- Common creche expenses: salaries, food, educational materials, rent, utilities
- ECD subsidy from DSD (Department of Social Development)
- NPO/PBO registration may affect tax obligations

READ-ONLY RULES:
- You can ONLY read and report on existing data
- You NEVER create, update, or delete any records
- You NEVER execute financial transactions

TAX ADVICE RULES:
- You NEVER provide tax advice
- For tax-related questions, recommend consulting the SARS agent or a qualified accountant
- You may explain what tax-related data exists in the system

COMMUNICATION STYLE:
- Use simple, friendly language - administrators may not have accounting backgrounds
- Format monetary values as R X,XXX.XX (e.g., R1,234.56)
- Provide context and explanations, not just numbers
- Suggest next steps when helpful
- Keep responses concise but informative

RESPONSE FORMAT: Plain text. Clear, human-friendly language. No JSON unless specifically requested.`;

/**
 * Default model for conversational queries (sonnet for nuanced responses).
 */
export const CONVERSATIONAL_MODEL = 'sonnet';

/**
 * Maximum tokens for conversational responses.
 */
export const CONVERSATIONAL_MAX_TOKENS = 1024;

/**
 * Temperature for conversational responses (moderate for natural language).
 */
export const CONVERSATIONAL_TEMPERATURE = 0.3;

/**
 * Convert cents to formatted Rands string (e.g., 123456 -> "R1,234.56").
 * @param cents - Amount in cents (integer)
 * @returns Formatted Rand string
 */
export function formatCents(cents: number): string {
  const rands = (cents / 100).toFixed(2);
  const parts = rands.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `R${intPart}.${parts[1]}`;
}

/**
 * Classify query complexity for model routing.
 * Simple queries get routed to haiku (faster, cheaper).
 * Complex queries get routed to sonnet (more reasoning).
 *
 * @param question - The user's question
 * @param queryType - The classified query type
 * @returns 'simple' or 'complex'
 */
export function classifyQueryComplexity(
  question: string,
  queryType: QueryType,
): QueryComplexity {
  // Complex query indicators
  const complexPatterns = [
    /compar/i,
    /trend/i,
    /analys/i,
    /forecast/i,
    /predict/i,
    /why/i,
    /explain/i,
    /recommend/i,
    /suggest/i,
    /how\s+should/i,
    /what\s+if/i,
    /year[\s-]over[\s-]year/i,
    /month[\s-]over[\s-]month/i,
    /break\s*down/i,
  ];

  // Complex query types always need more reasoning
  if (queryType === 'SUMMARY' || queryType === 'TAX') {
    return 'complex';
  }

  // Check for complex language patterns
  for (const pattern of complexPatterns) {
    if (pattern.test(question)) {
      return 'complex';
    }
  }

  return 'simple';
}

/**
 * Route to the appropriate model based on query complexity.
 * @param complexity - The classified query complexity
 * @returns Model identifier ('haiku' for simple, 'sonnet' for complex)
 */
export function routeModel(complexity: QueryComplexity): string {
  return complexity === 'simple' ? 'haiku' : 'sonnet';
}
