/**
 * SDK Payment Matcher
 * TASK-SDK-004: PaymentMatcher SDK Migration
 *
 * @module agents/payment-matcher/sdk-matcher
 * @description SDK-enhanced payment matcher that uses LLM for ambiguity resolution
 * and ruvector for semantic reference similarity search.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Temperature = 0 for deterministic financial matching
 * - SDK calls are OPTIONAL - failure falls back to existing deterministic logic
 * - @Optional() decorator on RuvectorService (may not be available)
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { BaseSdkAgent } from '../sdk/base-sdk-agent';
import { SdkAgentFactory } from '../sdk/sdk-agent.factory';
import { SdkConfigService } from '../sdk/sdk-config';
import { ClaudeClientService } from '../sdk/claude-client.service';
import { AgentDefinition } from '../sdk/interfaces/sdk-agent.interface';
import { RuvectorService } from '../sdk/ruvector.service';
import { InvoiceCandidate } from './interfaces/matcher.interface';
import {
  SdkMatchResult,
  SdkAllocation,
} from './interfaces/sdk-matcher.interface';
import { PAYMENT_MATCHER_SYSTEM_PROMPT } from './matcher-prompt';

/** Threshold in cents above which a transaction is considered high-value (R50,000) */
const HIGH_VALUE_ROUTE_THRESHOLD_CENTS = 5_000_000;

/**
 * Result from ruvector similarity search for invoice references.
 */
export interface SimilarReferenceResult {
  /** Invoice ID from the matched vector */
  invoiceId: string;
  /** Original reference text */
  reference: string;
  /** Cosine similarity score (0-1) */
  similarity: number;
}

@Injectable()
export class SdkPaymentMatcher extends BaseSdkAgent {
  private readonly sdkLogger = new Logger(SdkPaymentMatcher.name);

  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(ClaudeClientService)
    private readonly claudeClient?: ClaudeClientService,
  ) {
    super(factory, config, SdkPaymentMatcher.name);
  }

  /**
   * Returns the agent definition for the payment matcher.
   * @param tenantId - Tenant ID for tenant-specific configuration
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return this.factory.createMatcherAgent(tenantId);
  }

  /**
   * Use LLM to resolve ambiguous payment-to-invoice matching.
   *
   * Builds a prompt with transaction details and candidate invoices,
   * calls the LLM, and parses the JSON response into SdkMatchResult.
   *
   * @param transaction - The bank transaction to match
   * @param candidates - Invoice candidates with deterministic confidence scores
   * @param tenantId - Tenant ID for isolation
   * @param model - Optional model override (e.g., 'haiku' or 'sonnet')
   * @returns Structured match result from the LLM
   */
  async resolveAmbiguity(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
    model?: string,
  ): Promise<SdkMatchResult> {
    const routedModel = model ?? this.routeMatchModel(candidates, transaction);
    this.sdkLogger.debug(
      `Resolving ambiguity for transaction ${transaction.id} with model ${routedModel} (${String(candidates.length)} candidates)`,
    );

    const result = await this.executeWithFallback<SdkMatchResult>(
      async () => {
        if (!this.claudeClient?.isAvailable()) {
          throw new Error(
            'Claude client not available. Check ANTHROPIC_API_KEY configuration.',
          );
        }

        const message = this.buildMatchMessage(transaction, candidates);
        const agentDef = this.getAgentDefinition(tenantId);

        const response = await this.claudeClient.sendMessage({
          systemPrompt: agentDef.prompt,
          messages: [{ role: 'user', content: message }],
          model: routedModel,
          temperature: 0, // Deterministic for financial matching
          maxTokens: 1024,
        });

        return this.parseMatchResponse(response.content);
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        // Fallback: return a no-match result so the caller can continue
        // with existing deterministic logic.
        return {
          bestMatchInvoiceId: null,
          confidence: 0,
          reasoning: 'SDK unavailable, falling back to deterministic matching',
          isPartialPayment: false,
          suggestedAllocation: [],
        };
      },
    );

    return result.data;
  }

  /**
   * Use ruvector to find invoices with semantically similar references.
   *
   * Embeds the bank reference text and searches for similar invoice references
   * in the vector store. Returns empty array if ruvector is unavailable.
   *
   * @param reference - Bank transaction reference text
   * @param _tenantId - Tenant ID (reserved for future collection partitioning)
   * @returns Array of similar reference results sorted by similarity descending
   */
  async findSimilarReferences(
    reference: string,
    _tenantId: string,
  ): Promise<SimilarReferenceResult[]> {
    if (!this.ruvector || !this.ruvector.isAvailable()) {
      this.sdkLogger.debug('Ruvector unavailable, skipping similarity search');
      return [];
    }

    try {
      const embeddingResult = await this.ruvector.generateEmbedding(reference);
      const results = await this.ruvector.searchSimilar(
        embeddingResult.vector,
        'invoice_references',
        10,
      );

      return results
        .filter((r) => r.score > 0.5)
        .map((r) => ({
          invoiceId: r.id,
          reference: (r.metadata?.['reference'] as string) ?? '',
          similarity: r.score,
        }))
        .sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.sdkLogger.warn(`Ruvector similarity search failed: ${msg}`);
      return [];
    }
  }

  /**
   * Route the match to the appropriate model based on complexity.
   *
   * Uses sonnet for complex scenarios:
   * - More than 2 high-confidence candidates (>60%)
   * - High-value transaction (>R50,000)
   * - Split payment signals (amount matches sum of multiple invoices)
   *
   * Uses haiku for simpler disambiguation.
   *
   * @param candidates - Invoice candidates to evaluate
   * @param transaction - The transaction being matched
   * @returns Model identifier ('haiku' or 'sonnet')
   */
  routeMatchModel(
    candidates: InvoiceCandidate[],
    transaction: Transaction,
  ): 'haiku' | 'sonnet' {
    const highConfidenceCandidates = candidates.filter(
      (c) => c.confidence >= 60,
    );

    // Complex: more than 2 high-confidence candidates
    if (highConfidenceCandidates.length > 2) {
      this.sdkLogger.debug(
        `Routing to sonnet: ${String(highConfidenceCandidates.length)} high-confidence candidates`,
      );
      return 'sonnet';
    }

    // Complex: high-value transaction (>R50,000 = 5,000,000 cents)
    if (Math.abs(transaction.amountCents) > HIGH_VALUE_ROUTE_THRESHOLD_CENTS) {
      this.sdkLogger.debug(
        `Routing to sonnet: high-value transaction (${String(transaction.amountCents)} cents)`,
      );
      return 'sonnet';
    }

    // Complex: split payment signal
    // Check if transaction amount matches sum of 2+ candidate outstanding amounts
    if (candidates.length >= 2) {
      const transactionAmount = Math.abs(transaction.amountCents);
      const outstandingAmounts = candidates.map(
        (c) => c.invoice.totalCents - c.invoice.amountPaidCents,
      );

      // Check all pairs
      for (let i = 0; i < outstandingAmounts.length; i++) {
        for (let j = i + 1; j < outstandingAmounts.length; j++) {
          const sum = outstandingAmounts[i] + outstandingAmounts[j];
          const diff = Math.abs(transactionAmount - sum);
          const percentDiff = sum > 0 ? diff / sum : 1;
          if (percentDiff <= 0.01) {
            this.sdkLogger.debug(
              'Routing to sonnet: split payment signal detected',
            );
            return 'sonnet';
          }
        }
      }
    }

    return 'haiku';
  }

  /**
   * Build the user message for the LLM match prompt.
   *
   * @param transaction - The bank transaction
   * @param candidates - Invoice candidates with scores
   * @returns Formatted message string for the LLM
   */
  buildMatchMessage(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
  ): string {
    const lines: string[] = [
      '## Transaction',
      `- ID: ${transaction.id}`,
      `- Amount (cents): ${String(transaction.amountCents)}`,
      `- Reference: ${transaction.reference ?? 'N/A'}`,
      `- Payee Name: ${transaction.payeeName ?? 'N/A'}`,
      `- Description: ${transaction.description}`,
      `- Date: ${transaction.date.toISOString().split('T')[0]}`,
      '',
      '## Candidate Invoices',
    ];

    for (const candidate of candidates) {
      const outstanding =
        candidate.invoice.totalCents - candidate.invoice.amountPaidCents;
      lines.push(
        `### Invoice ${candidate.invoice.invoiceNumber}`,
        `- ID: ${candidate.invoice.id}`,
        `- Total (cents): ${String(candidate.invoice.totalCents)}`,
        `- Already Paid (cents): ${String(candidate.invoice.amountPaidCents)}`,
        `- Outstanding (cents): ${String(outstanding)}`,
        `- Parent: ${candidate.invoice.parent.firstName} ${candidate.invoice.parent.lastName}`,
        `- Child: ${candidate.invoice.child.firstName}`,
        `- Deterministic Confidence: ${String(candidate.confidence)}%`,
        `- Match Reasons: ${candidate.matchReasons.join('; ')}`,
        '',
      );
    }

    lines.push(
      'Based on the above, determine the best invoice match and provide your response as JSON.',
    );

    return lines.join('\n');
  }

  /**
   * Parse the LLM response into a structured SdkMatchResult.
   * Handles both raw JSON and markdown-wrapped JSON blocks.
   *
   * @param response - Raw LLM response string
   * @returns Parsed SdkMatchResult
   * @throws Error if response cannot be parsed
   */
  parseMatchResponse(response: string): SdkMatchResult {
    // Strip markdown code blocks if present
    let cleaned = response.trim();
    const jsonBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
    if (jsonBlockMatch) {
      cleaned = jsonBlockMatch[1].trim();
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Failed to parse LLM match response as JSON: ${cleaned.slice(0, 200)}`,
      );
    }

    // Validate and extract fields with safe defaults
    const bestMatchInvoiceId =
      typeof parsed['bestMatchInvoiceId'] === 'string'
        ? parsed['bestMatchInvoiceId']
        : null;

    const confidence =
      typeof parsed['confidence'] === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed['confidence'])))
        : 0;

    const reasoning =
      typeof parsed['reasoning'] === 'string'
        ? parsed['reasoning']
        : 'No reasoning provided';

    const isPartialPayment =
      typeof parsed['isPartialPayment'] === 'boolean'
        ? parsed['isPartialPayment']
        : false;

    const rawAllocation = Array.isArray(parsed['suggestedAllocation'])
      ? parsed['suggestedAllocation']
      : [];

    const suggestedAllocation: SdkAllocation[] = (
      rawAllocation as Record<string, unknown>[]
    )
      .filter(
        (a) =>
          typeof a['invoiceId'] === 'string' &&
          typeof a['amountCents'] === 'number',
      )
      .map((a) => ({
        invoiceId: a['invoiceId'] as string,
        amountCents: a['amountCents'] as number,
      }));

    return {
      bestMatchInvoiceId,
      confidence,
      reasoning,
      isPartialPayment,
      suggestedAllocation,
    };
  }

  /**
   * Get the system prompt for the payment matcher agent.
   * Exposed for testing.
   */
  getSystemPrompt(): string {
    return PAYMENT_MATCHER_SYSTEM_PROMPT;
  }
}
