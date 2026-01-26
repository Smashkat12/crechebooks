/**
 * SDK Categorizer
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * @module agents/transaction-categorizer/sdk-categorizer
 * @description SdkCategorizer extends BaseSdkAgent to provide LLM-based
 * transaction categorization via the agentic-flow execution engine.
 * Falls back through: ReasoningBank cache -> ruvector semantic search -> LLM inference.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Temperature = 0 for financial categorization
 * - JSON response parsing with markdown code block handling
 * - VAT type validation (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
 * - Confidence clamping (0-100)
 * - Graceful degradation: if SDK fails, caller falls through to historical -> fallback
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import {
  BaseSdkAgent,
  SdkAgentFactory,
  SdkConfigService,
  RuvectorService,
} from '../sdk';
import type { AgentDefinition } from '../sdk';
import { CATEGORIZER_SYSTEM_PROMPT } from './categorizer-prompt';
import type {
  SdkCategorizationInput,
  SdkCategorizationResult,
} from './interfaces/sdk-categorizer.interface';

// ────────────────────────────────────────────────────────────────────────────
// Local stub for ReasoningBank (agentic-flow may not be installed)
// Provides in-memory caching of successful LLM reasoning chains.
// ────────────────────────────────────────────────────────────────────────────

interface ReasoningBankEntry {
  result: {
    accountCode: string;
    accountName: string;
    vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
    confidence: number;
    reasoning: string;
  };
  model: string;
  confidence: number;
}

class ReasoningBank {
  private readonly cache = new Map<string, ReasoningBankEntry>();
  private readonly namespace: string;

  constructor(opts: { namespace: string }) {
    this.namespace = opts.namespace;
  }

  get(key: string): ReasoningBankEntry | undefined {
    return this.cache.get(`${this.namespace}:${key}`);
  }

  store(key: string, entry: ReasoningBankEntry): void {
    this.cache.set(`${this.namespace}:${key}`, entry);
  }

  get size(): number {
    return this.cache.size;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SdkCategorizer
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SdkCategorizer extends BaseSdkAgent {
  protected override readonly logger = new Logger(SdkCategorizer.name);
  private readonly reasoningBank: ReasoningBank;

  constructor(
    factory: SdkAgentFactory,
    config: SdkConfigService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
  ) {
    super(factory, config, SdkCategorizer.name);
    this.reasoningBank = new ReasoningBank({ namespace: 'categorizer' });
  }

  /**
   * Returns the agent definition for a given tenant.
   * Uses the factory's categorizer prompt with SA accounting knowledge.
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return {
      ...this.factory.createCategorizerAgent(tenantId),
      prompt: CATEGORIZER_SYSTEM_PROMPT,
    };
  }

  /**
   * Categorize a transaction using the SDK execution engine with
   * multi-model routing and ReasoningBank caching.
   * Falls back through: ReasoningBank cache -> LLM inference.
   *
   * @param input - Transaction data to categorize
   * @param tenantId - Tenant ID for data isolation
   * @returns Structured categorization result with confidence and reasoning
   * @throws Error if LLM response cannot be parsed
   */
  async categorize(
    input: SdkCategorizationInput,
    tenantId: string,
  ): Promise<SdkCategorizationResult> {
    const startTime = Date.now();

    // Step 0: Check ReasoningBank cache for similar prior reasoning
    const cacheKey = this.buildCacheKey(input);
    const cached = this.reasoningBank.get(cacheKey);
    if (cached && cached.confidence >= 80) {
      this.logger.debug(`ReasoningBank cache hit for "${input.payeeName}"`);
      return {
        ...cached.result,
        source: 'LLM',
        model: cached.model,
        durationMs: Date.now() - startTime,
      };
    }

    // Build the user message for the LLM
    const userMessage = this.buildUserMessage(input);

    // Step 1: Execute LLM via SDK with multi-model routing
    const modelRoute = this.routeModel(input);
    const agentDef = this.getAgentDefinition(tenantId);
    const response = await this.executeSdkInference(
      agentDef,
      userMessage,
      tenantId,
      modelRoute,
    );

    // Parse structured output from LLM response
    const result = this.parseCategorizationResponse(response);

    this.logger.debug(
      `SDK categorization completed in ${String(Date.now() - startTime)}ms: ` +
        `${result.accountCode} (${String(result.confidence)}%) - ${result.reasoning}`,
    );

    // Cache successful reasoning in ReasoningBank
    if (result.confidence >= 75) {
      this.reasoningBank.store(cacheKey, {
        result: {
          accountCode: result.accountCode,
          accountName: result.accountName,
          vatType: result.vatType,
          confidence: result.confidence,
          reasoning: result.reasoning,
        },
        model: modelRoute,
        confidence: result.confidence,
      });
    }

    return {
      ...result,
      source: 'LLM',
      model: modelRoute,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Search ruvector for semantically similar past categorizations.
   * Uses sanitized description embeddings (no PII in vectors).
   * Returns null if ruvector is unavailable or no strong semantic match found
   * (cosine similarity < 0.85).
   *
   * @param description - Sanitized transaction description
   * @param tenantId - Tenant ID for collection scoping
   * @returns Categorization result if a strong match is found, null otherwise
   */
  async searchSimilarCategorizations(
    description: string,
    tenantId: string,
  ): Promise<SdkCategorizationResult | null> {
    if (!this.ruvector?.isAvailable()) {
      this.logger.debug('Ruvector not available, skipping semantic search');
      return null;
    }

    try {
      const startTime = Date.now();

      // Generate embedding for the description
      const embeddingResult =
        await this.ruvector.generateEmbedding(description);

      // Search for similar vectors in the tenant's categorization collection
      const collection = `categorizations:${tenantId}`;
      const results = await this.ruvector.searchSimilar(
        embeddingResult.vector,
        collection,
        3,
      );

      // Filter by minimum similarity threshold (0.85)
      const MIN_SIMILARITY = 0.85;
      const strongMatches = results.filter((r) => r.score >= MIN_SIMILARITY);

      if (strongMatches.length === 0) {
        this.logger.debug(
          `No strong semantic matches for "${description}" (best score: ${String(results[0]?.score ?? 0)})`,
        );
        return null;
      }

      const best = strongMatches[0];
      const metadata = best.metadata ?? {};

      const metaAccountCode = metadata['accountCode'];
      const metaAccountName = metadata['accountName'];
      const metaVatType = metadata['vatType'];

      return {
        accountCode: typeof metaAccountCode === 'string' ? metaAccountCode : '',
        accountName: typeof metaAccountName === 'string' ? metaAccountName : '',
        vatType: this.validateVatType(
          typeof metaVatType === 'string' ? metaVatType : '',
        ),
        confidence: Math.round(best.score * 100),
        reasoning: `Semantic match to prior categorization (similarity: ${best.score.toFixed(3)})`,
        source: 'LLM',
        model: 'ruvector-hnsw',
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ruvector semantic search failed: ${message}`);
      return null;
    }
  }

  /**
   * Route to appropriate model based on transaction complexity.
   * Simple/common transactions -> haiku (fast/cheap);
   * Ambiguous or high-value transactions -> sonnet (deeper reasoning).
   */
  routeModel(input: SdkCategorizationInput): string {
    const isHighValue = input.amountCents > 5_000_000; // > R50,000
    const hasAmbiguousDescription =
      !input.description || input.description.length < 5;
    if (isHighValue || hasAmbiguousDescription) {
      return 'sonnet';
    }
    return 'haiku';
  }

  /**
   * Build a cache key for the ReasoningBank from the input.
   * Normalizes payee name and credit flag for consistent lookups.
   */
  private buildCacheKey(input: SdkCategorizationInput): string {
    const normalized = `${input.payeeName.toLowerCase().trim()}|${String(input.isCredit)}`;
    return `categorizer:${normalized}`;
  }

  /**
   * Build the user message to send to the LLM for categorization.
   * Includes all relevant transaction details and instructions.
   */
  private buildUserMessage(input: SdkCategorizationInput): string {
    const lines = [
      `Categorize this bank transaction:`,
      ``,
      `Payee: ${input.payeeName}`,
      `Description: ${input.description ?? 'N/A'}`,
      `Amount: ${String(input.amountCents)} cents (R${(input.amountCents / 100).toFixed(2)})`,
      `Type: ${input.isCredit ? 'CREDIT (income)' : 'DEBIT (expense)'}`,
      `Date: ${input.transactionDate ?? 'N/A'}`,
      `Tenant ID: ${input.tenantId}`,
      ``,
      `IMPORTANT:`,
      `1. First check known patterns using the get_patterns tool`,
      `2. Then check categorization history using the get_history tool`,
      `3. Return your categorization as JSON with these fields:`,
      `   { "accountCode": "XXXX", "accountName": "Name", "vatType": "TYPE", "confidence": 0-100, "reasoning": "explanation" }`,
    ];
    return lines.join('\n');
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
   * @param _model - Model to use (haiku or sonnet)
   * @returns LLM response string
   * @throws Error when SDK inference engine is not available
   */
  executeSdkInference(
    _agentDef: AgentDefinition,
    _userMessage: string,
    _tenantId: string,
    _model: string = 'haiku',
  ): Promise<string> {
    // The actual agentic-flow AgenticFlow class is not available at runtime.
    // This stub rejects so that executeWithFallback() catches it and uses
    // the fallback path. When the real agentic-flow ships, this method
    // will be replaced with actual LLM inference.
    return Promise.reject(
      new Error(
        'SDK inference not available: agentic-flow execution engine not installed. ' +
          'Install agentic-flow to enable LLM-based categorization.',
      ),
    );
  }

  /**
   * Parse the LLM's structured JSON output into a typed result.
   * Handles malformed responses and markdown code block wrapping.
   *
   * @param response - Raw LLM response string
   * @returns Parsed and validated categorization result
   * @throws Error if response cannot be parsed
   */
  parseCategorizationResponse(response: string): SdkCategorizationResult {
    try {
      // Extract JSON from the response (LLM may wrap it in markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*?"accountCode"[\s\S]*?\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in LLM response');
      }

      const parsed: Record<string, string | number | boolean | null> =
        JSON.parse(jsonMatch[0]) as Record<
          string,
          string | number | boolean | null
        >;

      // Validate required fields with proper type narrowing
      const rawAccountCode = parsed['accountCode'];
      const rawAccountName = parsed['accountName'];
      const rawVatType = parsed['vatType'];
      const rawConfidence = parsed['confidence'];
      const rawReasoning = parsed['reasoning'];

      const accountCode =
        typeof rawAccountCode === 'string' ? rawAccountCode : '';
      const accountName =
        typeof rawAccountName === 'string' ? rawAccountName : '';
      const vatType = this.validateVatType(
        typeof rawVatType === 'string' ? rawVatType : '',
      );
      const confidence = Math.min(
        100,
        Math.max(0, typeof rawConfidence === 'number' ? rawConfidence : 0),
      );
      const reasoning =
        typeof rawReasoning === 'string'
          ? rawReasoning
          : 'No reasoning provided';

      if (!accountCode || !accountName) {
        throw new Error(
          `Invalid account code or name: ${accountCode} / ${accountName}`,
        );
      }

      return {
        accountCode,
        accountName,
        vatType,
        confidence,
        reasoning,
        source: 'LLM',
        model: this.config.getModelForAgent('categorizer'),
        durationMs: 0, // Caller sets this
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to parse SDK categorization response: ${message}`,
      );
      throw new Error(`SDK response parsing failed: ${message}`);
    }
  }

  /**
   * Validate and normalize a VAT type string.
   * Returns a valid VatType or defaults to STANDARD.
   */
  validateVatType(
    vatType: string,
  ): 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT' {
    const validTypes = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT'] as const;
    const upper = vatType.toUpperCase().replace(/[\s-]/g, '_');
    if (validTypes.includes(upper as (typeof validTypes)[number])) {
      return upper as (typeof validTypes)[number];
    }
    return 'STANDARD'; // Safe default
  }
}
