<task_spec id="TASK-SDK-003" version="2.0">

<metadata>
  <title>TransactionCategorizerAgent SDK Migration (Pilot)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>703</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-SDK-CATEGORIZER</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The current `TransactionCategorizerAgent` (located at
  `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts`, approximately
  325 lines) uses pattern matching and historical frequency analysis to categorize
  bank transactions to South African accounting codes. It fails on **novel transactions**
  that do not match any known pattern. When no pattern is found, transactions fall
  through to generic default account codes (4100 for credits, 8100 for debits), which
  loses accuracy and requires manual correction.

  The redesign architecture identifies this agent as the **highest-volume agent** and
  the **clearest improvement path** for SDK migration. It is designated as the **pilot
  migration** that establishes patterns for all subsequent agent migrations (TASK-SDK-004
  through TASK-SDK-007).

  **Current categorization flow (rule-based only):**
  1. `contextLoader.getContext()` — gets tenant config including `autoApplyThreshold`
  2. `patternMatcher.getBestMatch(payee, description, amount, isCredit)` — lookup known patterns
  3. `getHistoricalCategorization(tenantId, payee)` — raw SQL query for past decisions
  4. `confidenceScorer.calculate(inputs)` — heuristic 0-100 score
  5. Determines `accountCode`, `accountName`, `vatType` from pattern/historical/fallback
  6. Checks `flagForReview` and `amountExceedsMax`
  7. Auto-applies if confidence >= threshold AND not flagged
  8. Logs decision to `.claude/logs/decisions.jsonl`

  **Proposed hybrid flow (rule-based + ruvector semantic search + LLM via agentic-flow):**
  1. Try pattern matching first (fast, free, deterministic)
  2. If no pattern match OR low confidence (<80%) → **ruvector semantic search** over
     sanitized transaction description embeddings to find semantically similar past
     categorizations (e.g., "Woolworths Food" matches "Woolies groceries" via vector
     similarity even though string matching fails)
  3. If ruvector returns a high-similarity result (cosine >= 0.85), use that categorization
  4. If ruvector returns no strong match → invoke LLM via **agentic-flow** execution engine
     with **multi-model routing**: simple/common categorizations routed to haiku (fast/cheap),
     ambiguous or high-value transactions routed to sonnet (higher reasoning)
  5. LLM uses CrecheBooks MCP tools (`get_patterns`, `get_history`) for context
  6. LLM returns structured output: `{ accountCode, accountName, vatType, confidence, reasoning }`
  7. Successful LLM reasoning chains cached in **agentic-flow ReasoningBank** for reuse on
     similar future inputs (avoids redundant LLM calls for recurring transaction types)
  8. Combine LLM/ruvector confidence with heuristic confidence (weighted)
  9. Rest of flow unchanged (threshold check, flagging, logging, etc.)

  **Gap Analysis:**
  - No LLM inference capability for novel transaction categorization
  - Pattern matching only works for known, previously-seen patterns
  - Fallback to generic account codes (4100/8100) loses categorization accuracy
  - No natural language reasoning in categorization decisions
  - Confidence scores are heuristic-only, not semantically informed
  - No structured output schema for LLM categorization results
  - Decision log does not include `source` field to distinguish LLM vs rule-based
  - No system prompt with SA accounting domain knowledge

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - SDK: `agentic-flow` v2.0.2-alpha (wraps `@anthropic-ai/claude-agent-sdk` transitively;
    provides multi-model routing, ReasoningBank, AgentDB)
  - Vector DB: `ruvector` v0.1.96 (Rust-native HNSW, ONNX WASM all-MiniLM-L6-v2 384d embeddings,
    PostgreSQL extension with `ruvector_route_query`)
  - MCP Tools: CrecheBooks in-process MCP server (from TASK-SDK-002)
  - Testing: Jest
  - Decision Logging: `.claude/logs/decisions.jsonl`

  **Files to Create:**
  - `apps/api/src/agents/transaction-categorizer/sdk-categorizer.ts`
  - `apps/api/src/agents/transaction-categorizer/categorizer-prompt.ts`
  - `apps/api/src/agents/transaction-categorizer/interfaces/sdk-categorizer.interface.ts`
  - `tests/agents/transaction-categorizer/sdk-categorizer.spec.ts`
  - `tests/agents/transaction-categorizer/categorizer-prompt.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` — ADD LLM path before fallback
  - `apps/api/src/agents/transaction-categorizer/categorizer.module.ts` — ADD SDK imports
  - `apps/api/src/agents/transaction-categorizer/interfaces/categorizer.interface.ts` — EXTEND `CategorizationResult` with `source` field

  **Existing File Structure (transaction-categorizer/):**
  ```
  apps/api/src/agents/transaction-categorizer/
  ├── categorizer.agent.ts          # Main agent (325 lines) — MODIFY
  ├── categorizer.module.ts         # NestJS module — MODIFY
  ├── categorizer.service.ts        # Service layer
  ├── context-loader.ts             # Loads tenant context & thresholds
  ├── pattern-matcher.ts            # Pattern matching logic
  ├── confidence-scorer.ts          # Heuristic confidence scoring
  ├── decision-logger.ts            # JSONL decision logging
  ├── interfaces/
  │   └── categorizer.interface.ts  # TypeScript interfaces — MODIFY
  └── dto/
      └── categorize-transaction.dto.ts
  ```
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands:
  ```bash
  pnpm run build
  pnpm test
  pnpm run lint
  ```

  ### 2. SdkCategorizer Class (uses agentic-flow execution engine)
  The SDK categorizer wraps LLM inference for transaction categorization via agentic-flow:
  ```typescript
  // apps/api/src/agents/transaction-categorizer/sdk-categorizer.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { AgenticFlow, AgentDefinition, ReasoningBank } from 'agentic-flow';
  import { BaseSdkAgent, SdkAgentFactory, SdkConfigService } from '../sdk';
  import { RuvectorService } from '../../shared/ruvector/ruvector.service';
  import { CATEGORIZER_SYSTEM_PROMPT } from './categorizer-prompt';
  import {
    SdkCategorizationInput,
    SdkCategorizationResult,
  } from './interfaces/sdk-categorizer.interface';

  @Injectable()
  export class SdkCategorizer extends BaseSdkAgent {
    private readonly logger = new Logger(SdkCategorizer.name);
    private readonly reasoningBank: ReasoningBank;

    constructor(
      protected readonly factory: SdkAgentFactory,
      protected readonly config: SdkConfigService,
      private readonly ruvector: RuvectorService,
    ) {
      super(factory, config);
      this.reasoningBank = new ReasoningBank({ namespace: 'categorizer' });
    }

    getAgentDefinition(tenantId: string): AgentDefinition {
      return this.factory.createCategorizerAgent(tenantId);
    }

    /**
     * Categorize a transaction using agentic-flow execution engine with
     * multi-model routing and ReasoningBank caching.
     * Falls back through: ReasoningBank cache → ruvector semantic search → LLM inference.
     *
     * @param input - Transaction data to categorize
     * @param tenantId - Tenant ID for data isolation
     * @returns Structured categorization result with confidence and reasoning
     */
    async categorize(
      input: SdkCategorizationInput,
      tenantId: string,
    ): Promise<SdkCategorizationResult> {
      const agentDef = this.getAgentDefinition(tenantId);
      const startTime = Date.now();

      // ── Step 0: Check ReasoningBank cache for similar prior reasoning ────
      const cacheKey = this.buildCacheKey(input);
      const cached = await this.reasoningBank.get(cacheKey);
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

      // ── Step 1: Execute LLM via agentic-flow with multi-model routing ───
      // Simple categorizations (common payees) → haiku (fast/cheap)
      // Ambiguous or high-value transactions → sonnet (deeper reasoning)
      const modelRoute = this.routeModel(input);
      const response = await this.executeSdkInference(agentDef, userMessage, tenantId, modelRoute);

      // Parse structured output from LLM response
      const result = this.parseCategorizationResponse(response);

      this.logger.debug(
        `SDK categorization completed in ${Date.now() - startTime}ms: ` +
        `${result.accountCode} (${result.confidence}%) - ${result.reasoning}`,
      );

      // ── Cache successful reasoning in ReasoningBank ─────────────────────
      if (result.confidence >= 75) {
        await this.reasoningBank.store(cacheKey, {
          result,
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
     * Route to appropriate model based on transaction complexity.
     * Simple/common → haiku; ambiguous/high-value → sonnet.
     */
    private routeModel(input: SdkCategorizationInput): string {
      const isHighValue = input.amountCents > 5_000_000; // > R50,000
      const hasAmbiguousDescription = !input.description || input.description.length < 5;
      if (isHighValue || hasAmbiguousDescription) {
        return 'sonnet';
      }
      return 'haiku';
    }

    private buildCacheKey(input: SdkCategorizationInput): string {
      const normalized = `${input.payeeName.toLowerCase().trim()}|${input.isCredit}`;
      return `categorizer:${normalized}`;
    }

    private buildUserMessage(input: SdkCategorizationInput): string {
      const lines = [
        `Categorize this bank transaction:`,
        ``,
        `Payee: ${input.payeeName}`,
        `Description: ${input.description ?? 'N/A'}`,
        `Amount: ${input.amountCents} cents (R${(input.amountCents / 100).toFixed(2)})`,
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
     * Execute inference via agentic-flow execution engine with multi-model routing.
     * agentic-flow wraps @anthropic-ai/claude-agent-sdk transitively and adds
     * multi-model routing (100+ LLM providers), ReasoningBank, and AgentDB.
     */
    private async executeSdkInference(
      agentDef: AgentDefinition,
      userMessage: string,
      tenantId: string,
      model: string = 'haiku',
    ): Promise<string> {
      // agentic-flow execution engine handles model routing, retries, and fallback
      const flow = new AgenticFlow({
        agent: agentDef,
        model,
        tenantId,
      });
      const result = await flow.execute(userMessage);
      return result.content;
    }

    /**
     * Parse the LLM's structured JSON output into a typed result.
     * Handles malformed responses gracefully.
     */
    private parseCategorizationResponse(response: string): SdkCategorizationResult {
      try {
        // Extract JSON from the response (LLM may wrap it in markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*?"accountCode"[\s\S]*?\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in LLM response');
        }

        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

        // Validate required fields
        const accountCode = String(parsed.accountCode ?? '');
        const accountName = String(parsed.accountName ?? '');
        const vatType = this.validateVatType(String(parsed.vatType ?? ''));
        const confidence = Math.min(100, Math.max(0, Number(parsed.confidence ?? 0)));
        const reasoning = String(parsed.reasoning ?? 'No reasoning provided');

        if (!accountCode || !accountName) {
          throw new Error(`Invalid account code or name: ${accountCode} / ${accountName}`);
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
        this.logger.warn(`Failed to parse SDK categorization response: ${message}`);
        throw new Error(`SDK response parsing failed: ${message}`);
      }
    }

    private validateVatType(vatType: string): 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT' {
      const validTypes = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT'] as const;
      const upper = vatType.toUpperCase().replace(/[\s-]/g, '_');
      if (validTypes.includes(upper as typeof validTypes[number])) {
        return upper as typeof validTypes[number];
      }
      return 'STANDARD'; // Safe default
    }
  }
  ```

  ### 3. System Prompt with SA Accounting Knowledge
  ```typescript
  // apps/api/src/agents/transaction-categorizer/categorizer-prompt.ts

  export const CATEGORIZER_SYSTEM_PROMPT = `You are a South African bookkeeping expert specializing in creche (daycare/ECD centre) accounting. Your job is to categorize bank transactions to the correct account codes.

## YOUR WORKFLOW

1. **FIRST**: Call the get_patterns tool with the tenant ID and payee name to check known patterns
2. **SECOND**: Call the get_history tool with the tenant ID and payee name to check past categorizations
3. **THIRD**: If patterns/history provide a clear match (confidence >= 80), use that categorization
4. **FOURTH**: If no clear match, apply your SA accounting knowledge to categorize the transaction

## ACCOUNT CODE RANGES (SA Chart of Accounts for Creches)

### Assets (1000-1999)
- 1000: Bank Account (current/cheque)
- 1100: Savings Account
- 1200: Petty Cash
- 1300: Accounts Receivable (parent fees outstanding)
- 1400: Prepaid Expenses
- 1500: Fixed Assets (equipment, furniture, vehicles)
- 1510: Accumulated Depreciation

### Liabilities (2000-2999)
- 2000: Accounts Payable
- 2100: VAT Output (collected)
- 2110: VAT Input (paid)
- 2200: PAYE Payable
- 2210: UIF Payable (employer + employee)
- 2220: SDL Payable (Skills Development Levy)
- 2300: Parent Deposits (advance payments)

### Equity (3000-3999)
- 3000: Owner's Equity / Capital
- 3100: Retained Earnings
- 3200: Drawings

### Revenue (4000-4999)
- 4000: Tuition Fees (monthly fees) — VAT EXEMPT under Section 12(h)
- 4100: Registration Fees — VAT EXEMPT under Section 12(h)
- 4200: Extra-Mural Activities (aftercare, holiday care)
- 4300: Uniform Sales — STANDARD VAT
- 4400: Meal/Catering Fees — may be EXEMPT if included in tuition
- 4500: Transport Fees
- 4600: Stationery/Materials Sales
- 4900: Other Income

### Cost of Sales / Direct Costs (5000-5999)
- 5000: Salaries & Wages (teachers, carers)
- 5100: UIF Contributions (employer portion)
- 5110: SDL Contributions
- 5200: Food & Catering Costs
- 5300: Educational Materials & Supplies
- 5400: Nappies & Hygiene Supplies

### Operating Expenses (6000-6999)
- 6000: Rent / Property Lease
- 6100: Utilities (electricity, water, rates)
- 6200: Insurance (liability, property, vehicle)
- 6300: Cleaning & Maintenance
- 6400: Office Supplies & Stationery
- 6500: Telephone & Internet
- 6600: Bank Charges & Fees
- 6700: Professional Fees (accounting, legal)
- 6800: Advertising & Marketing
- 6900: Vehicle Expenses (fuel, maintenance)
- 6950: Depreciation
- 6990: Sundry Expenses

### Suspense (9000-9999)
- 9999: Suspense / Unreconciled — ONLY use when truly unable to categorize

## VAT RULES FOR CRECHES (South Africa)

- **EXEMPT**: Educational services under Section 12(h) of the VAT Act
  - Tuition fees, registration fees, educational materials provided as part of education
  - This is the most common VAT type for creche income
- **STANDARD** (15%): Non-educational goods and services
  - Uniform sales, stationery sales, catering sold separately
- **ZERO_RATED**: Exports or zero-rated supplies (rare for creches)
- **NO_VAT**: Below VAT registration threshold or non-taxable items

## CONFIDENCE SCORING GUIDELINES

- **95-100**: Exact pattern match from database with high historical frequency
- **85-94**: Strong pattern match or very clear categorization
- **75-84**: Reasonable categorization with some ambiguity
- **60-74**: Best guess — some uncertainty about the correct code
- **Below 60**: Low confidence — recommend human review

## OUTPUT FORMAT

Return a JSON object with these exact fields:
{
  "accountCode": "XXXX",
  "accountName": "Account Name",
  "vatType": "STANDARD" | "ZERO_RATED" | "EXEMPT" | "NO_VAT",
  "confidence": 0-100,
  "reasoning": "Brief explanation of why this categorization was chosen"
}

## IMPORTANT RULES

1. ALWAYS check patterns and history FIRST using MCP tools before applying your own judgment
2. Prefer database patterns over your own knowledge when confidence is high
3. Education-related income is almost always VAT EXEMPT (Section 12(h))
4. Bank charges are ALWAYS account 6600, NO_VAT
5. Salary payments go to 5000, not 6000 range
6. NEVER return account code 9999 unless you truly cannot categorize
7. All amounts are in CENTS (integers) — do NOT convert to rands
8. When in doubt between two codes, pick the more specific one and note the uncertainty
`;

  /**
   * Build a tenant-specific prompt addendum with custom context.
   * This adds any tenant-specific overrides or notes to the base prompt.
   */
  export function buildTenantPromptContext(tenantConfig: {
    autoApplyThreshold: number;
    customAccountCodes?: Array<{ code: string; name: string; description: string }>;
    businessType?: string;
  }): string {
    const lines = [
      `\n## TENANT-SPECIFIC CONTEXT`,
      `- Auto-apply threshold: ${tenantConfig.autoApplyThreshold}%`,
    ];

    if (tenantConfig.businessType) {
      lines.push(`- Business type: ${tenantConfig.businessType}`);
    }

    if (tenantConfig.customAccountCodes?.length) {
      lines.push(`\n### Custom Account Codes`);
      for (const code of tenantConfig.customAccountCodes) {
        lines.push(`- ${code.code}: ${code.name} — ${code.description}`);
      }
    }

    return lines.join('\n');
  }
  ```

  ### 4. Interfaces for SDK Categorization
  ```typescript
  // apps/api/src/agents/transaction-categorizer/interfaces/sdk-categorizer.interface.ts

  /**
   * Input for SDK-based transaction categorization.
   * This is what the SdkCategorizer receives from the main categorizer agent.
   */
  export interface SdkCategorizationInput {
    tenantId: string;
    payeeName: string;
    description?: string;
    amountCents: number;
    isCredit: boolean;
    transactionDate?: string;
    bankAccountId?: string;
  }

  /**
   * Structured output from SDK-based categorization.
   * The LLM returns this via JSON structured output.
   */
  export interface SdkCategorizationResult {
    accountCode: string;
    accountName: string;
    vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
    confidence: number;     // 0-100
    reasoning: string;
    source: 'LLM';
    model: string;
    durationMs: number;
  }

  /**
   * Extended categorization result that includes the source field.
   * This extends the existing CategorizationResult interface.
   */
  export type CategorizationSource = 'LLM' | 'PATTERN' | 'HISTORICAL' | 'FALLBACK';

  export interface ExtendedCategorizationResult {
    accountCode: string;
    accountName: string;
    vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
    confidence: number;
    reasoning?: string;
    source: CategorizationSource;
    model?: string;              // Only set when source is 'LLM'
    durationMs?: number;         // Only set when source is 'LLM'
    flagForReview: boolean;
    autoApplied: boolean;
  }
  ```

  ### 5. Ruvector Semantic Pattern Search (between pattern match and LLM)
  When pattern matching fails or has low confidence, use ruvector to find semantically
  similar past transactions before invoking the LLM. The full categorization cascade is:
  **Pattern match → ruvector semantic search → LLM inference → historical fallback → manual**
  ```typescript
  // In sdk-categorizer.ts — semantic search step
  /**
   * Search ruvector for semantically similar past categorizations.
   * Uses sanitized description embeddings (no PII in vectors).
   * Returns null if no strong semantic match found (cosine < 0.85).
   */
  async searchSimilarCategorizations(
    description: string,
    tenantId: string,
  ): Promise<SdkCategorizationResult | null> {
    // ruvector HNSW search with all-MiniLM-L6-v2 384d embeddings
    const results = await this.ruvector.search({
      collection: `categorizations:${tenantId}`,
      query: description, // sanitized — no PII
      topK: 3,
      minSimilarity: 0.85,
    });

    if (results.length === 0) return null;

    const best = results[0];
    return {
      accountCode: best.metadata.accountCode,
      accountName: best.metadata.accountName,
      vatType: best.metadata.vatType,
      confidence: Math.round(best.similarity * 100),
      reasoning: `Semantic match to prior categorization: "${best.metadata.originalDescription}" (similarity: ${best.similarity.toFixed(3)})`,
      source: 'LLM', // Counted as LLM-path since it is non-deterministic
      model: 'ruvector-hnsw',
      durationMs: 0, // Caller sets
    };
  }
  ```

  ### 6. Hybrid Integration in Main Categorizer Agent
  The main `categorizer.agent.ts` MUST be modified to insert the LLM path.
  This is the critical integration point:

  ```typescript
  // In apps/api/src/agents/transaction-categorizer/categorizer.agent.ts
  // ADD these imports:
  import { SdkCategorizer } from './sdk-categorizer';
  import { CategorizationSource, ExtendedCategorizationResult } from './interfaces/sdk-categorizer.interface';

  // ADD constructor injection:
  constructor(
    // ... existing dependencies ...
    private readonly sdkCategorizer: SdkCategorizer,  // NEW
  ) {}

  // MODIFY the categorize method to add LLM path:
  async categorize(transaction: TransactionInput, tenantId: string): Promise<ExtendedCategorizationResult> {
    const context = await this.contextLoader.getContext(tenantId);
    let source: CategorizationSource = 'FALLBACK';
    let reasoning: string | undefined;
    let model: string | undefined;
    let sdkDurationMs: number | undefined;

    // ── Step 1: Pattern matching (fast, free, deterministic) ────────────
    const patternMatch = this.patternMatcher.getBestMatch(
      transaction.payeeName,
      transaction.description,
      transaction.amountCents,
      transaction.isCredit,
    );

    let accountCode: string;
    let accountName: string;
    let vatType: string;
    let confidence: number;

    if (patternMatch && patternMatch.confidence >= 80) {
      // High-confidence pattern match — use it directly
      accountCode = patternMatch.accountCode;
      accountName = patternMatch.accountName;
      vatType = patternMatch.vatType;
      confidence = patternMatch.confidence;
      source = 'PATTERN';
    } else {
      // ── Step 2: Ruvector semantic search (fast vector similarity) ──────
      const semanticResult = await this.sdkCategorizer.searchSimilarCategorizations(
        transaction.description ?? transaction.payeeName,
        tenantId,
      );
      if (semanticResult && semanticResult.confidence >= 80) {
        accountCode = semanticResult.accountCode;
        accountName = semanticResult.accountName;
        vatType = semanticResult.vatType;
        confidence = semanticResult.confidence;
        reasoning = semanticResult.reasoning;
        model = semanticResult.model;
        source = 'LLM'; // ruvector is non-deterministic path
      }

      // ── Step 3: LLM inference via agentic-flow (for novel/low-confidence) ─
      if (source !== 'LLM') {
      try {
        const sdkResult = await this.sdkCategorizer.executeWithFallback(
          async () => {
            return this.sdkCategorizer.categorize(
              {
                tenantId,
                payeeName: transaction.payeeName,
                description: transaction.description,
                amountCents: transaction.amountCents,
                isCredit: transaction.isCredit,
                transactionDate: transaction.transactionDate,
              },
              tenantId,
            );
          },
          async () => {
            // Fallback to historical (Step 3)
            return null;
          },
        );

        if (sdkResult) {
          accountCode = sdkResult.accountCode;
          accountName = sdkResult.accountName;
          vatType = sdkResult.vatType;
          confidence = sdkResult.confidence;
          reasoning = sdkResult.reasoning;
          model = sdkResult.model;
          sdkDurationMs = sdkResult.durationMs;
          source = 'LLM';
        } else {
          // SDK returned null (fallback was invoked) — continue to Step 3
          // Fall through to historical matching below
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`SDK categorization failed: ${msg}`);
        // Fall through to historical matching
      }
      } // end ruvector/LLM gate

      // ── Step 4: Historical matching (existing logic) ──────────────────
      if (source !== 'LLM') {
        const historical = await this.getHistoricalCategorization(tenantId, transaction.payeeName);
        if (historical) {
          accountCode = historical.accountCode;
          accountName = historical.accountName;
          vatType = historical.vatType;
          confidence = historical.confidence;
          source = 'HISTORICAL';
        } else {
          // ── Step 5: Fallback defaults ─────────────────────────────────
          accountCode = transaction.isCredit ? '4100' : '8100';
          accountName = transaction.isCredit ? 'Registration Fees' : 'General Expense';
          vatType = transaction.isCredit ? 'EXEMPT' : 'STANDARD';
          confidence = 30;
          source = 'FALLBACK';
        }
      }
    }

    // ── Confidence scoring (combine heuristic + source weight) ──────────
    const heuristicScore = this.confidenceScorer.calculate({
      patternMatch: patternMatch ?? undefined,
      amount: transaction.amountCents,
      isCredit: transaction.isCredit,
    });

    // Weight: LLM gets higher trust than pure heuristic
    const finalConfidence = source === 'LLM'
      ? Math.round(confidence * 0.7 + heuristicScore * 0.3)
      : source === 'PATTERN'
        ? confidence
        : Math.round(confidence * 0.5 + heuristicScore * 0.5);

    // ── Review flags ────────────────────────────────────────────────────
    const flagForReview =
      finalConfidence < context.autoApplyThreshold ||
      this.isAmountExcessive(transaction.amountCents) ||
      this.isSuspiciousPayee(transaction.payeeName);

    const autoApplied = finalConfidence >= context.autoApplyThreshold && !flagForReview;

    // ── Decision logging ────────────────────────────────────────────────
    await this.decisionLogger.log({
      timestamp: new Date().toISOString(),
      agentType: 'categorizer',
      source,                    // NEW: tracks where the decision came from
      model: model ?? undefined, // NEW: which LLM model was used (if any)
      tenantId,
      transactionId: transaction.id,
      payeeName: transaction.payeeName,
      amountCents: transaction.amountCents,
      isCredit: transaction.isCredit,
      accountCode: accountCode!,
      accountName: accountName!,
      vatType: vatType!,
      confidence: finalConfidence,
      autoApplied,
      flagForReview,
      reasoning,                 // NEW: LLM reasoning (if available)
      durationMs: sdkDurationMs, // NEW: SDK inference time (if used)
    });

    return {
      accountCode: accountCode!,
      accountName: accountName!,
      vatType: vatType! as ExtendedCategorizationResult['vatType'],
      confidence: finalConfidence,
      reasoning,
      source,
      model,
      durationMs: sdkDurationMs,
      flagForReview,
      autoApplied,
    };
  }
  ```

  ### 7. Module Updates
  ```typescript
  // apps/api/src/agents/transaction-categorizer/categorizer.module.ts
  // ADD these imports:
  import { SdkAgentModule } from '../sdk';
  import { SdkCategorizer } from './sdk-categorizer';

  @Module({
    imports: [
      // ... existing imports ...
      SdkAgentModule,  // NEW
    ],
    providers: [
      // ... existing providers ...
      SdkCategorizer,  // NEW
    ],
    exports: [
      // ... existing exports ...
    ],
  })
  export class CategorizerModule {}
  ```

  ### 8. Decision Logger Extension
  The existing `decision-logger.ts` logs to `.claude/logs/decisions.jsonl`. The log
  schema MUST be extended to include new fields:
  ```typescript
  // Extended decision log entry
  interface DecisionLogEntry {
    // Existing fields:
    timestamp: string;
    agentType: string;
    tenantId: string;
    transactionId: string;
    payeeName: string;
    amountCents: number;
    isCredit: boolean;
    accountCode: string;
    accountName: string;
    vatType: string;
    confidence: number;
    autoApplied: boolean;
    flagForReview: boolean;

    // NEW fields:
    source: 'LLM' | 'PATTERN' | 'HISTORICAL' | 'FALLBACK';
    model?: string;        // e.g. 'haiku', only when source = 'LLM'
    reasoning?: string;    // LLM explanation, only when source = 'LLM'
    durationMs?: number;   // SDK inference time in ms, only when source = 'LLM'
  }
  ```

  ### 9. Testing Pattern
  ```typescript
  // tests/agents/transaction-categorizer/sdk-categorizer.spec.ts
  describe('SdkCategorizer', () => {
    let sdkCategorizer: SdkCategorizer;
    let factory: SdkAgentFactory;
    let config: SdkConfigService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [SdkCategorizer, SdkAgentFactory, SdkConfigService],
      }).compile();

      sdkCategorizer = module.get(SdkCategorizer);
      factory = module.get(SdkAgentFactory);
      config = module.get(SdkConfigService);
    });

    describe('categorize', () => {
      it('should return structured categorization result', async () => {
        // Mock the SDK inference to return a valid JSON response
        jest.spyOn(sdkCategorizer as any, 'executeSdkInference').mockResolvedValue(
          JSON.stringify({
            accountCode: '5200',
            accountName: 'Food & Catering Costs',
            vatType: 'STANDARD',
            confidence: 88,
            reasoning: 'Woolworths is a grocery retailer, categorized as food expense',
          }),
        );

        const result = await sdkCategorizer.categorize(
          {
            tenantId: 'tenant-123',
            payeeName: 'Woolworths',
            description: 'Groceries for meals',
            amountCents: 250000,
            isCredit: false,
          },
          'tenant-123',
        );

        expect(result.accountCode).toBe('5200');
        expect(result.accountName).toBe('Food & Catering Costs');
        expect(result.vatType).toBe('STANDARD');
        expect(result.confidence).toBe(88);
        expect(result.source).toBe('LLM');
        expect(result.reasoning).toContain('grocery');
      });

      it('should handle JSON wrapped in markdown code blocks', async () => {
        jest.spyOn(sdkCategorizer as any, 'executeSdkInference').mockResolvedValue(
          '```json\n{"accountCode": "6600", "accountName": "Bank Charges", "vatType": "NO_VAT", "confidence": 99, "reasoning": "Bank fee"}\n```',
        );

        const result = await sdkCategorizer.categorize(
          { tenantId: 't1', payeeName: 'FNB', amountCents: 5000, isCredit: false },
          't1',
        );

        expect(result.accountCode).toBe('6600');
        expect(result.vatType).toBe('NO_VAT');
      });

      it('should throw on malformed response', async () => {
        jest.spyOn(sdkCategorizer as any, 'executeSdkInference').mockResolvedValue(
          'Sorry, I cannot categorize this transaction.',
        );

        await expect(
          sdkCategorizer.categorize(
            { tenantId: 't1', payeeName: 'Unknown', amountCents: 100, isCredit: false },
            't1',
          ),
        ).rejects.toThrow('SDK response parsing failed');
      });
    });

    describe('parseCategorizationResponse', () => {
      it('should validate VAT types', () => {
        const result = (sdkCategorizer as any).validateVatType('exempt');
        expect(result).toBe('EXEMPT');
      });

      it('should default invalid VAT types to STANDARD', () => {
        const result = (sdkCategorizer as any).validateVatType('invalid');
        expect(result).toBe('STANDARD');
      });

      it('should clamp confidence to 0-100', async () => {
        jest.spyOn(sdkCategorizer as any, 'executeSdkInference').mockResolvedValue(
          JSON.stringify({
            accountCode: '4000',
            accountName: 'Tuition Fees',
            vatType: 'EXEMPT',
            confidence: 150,  // Over 100
            reasoning: 'test',
          }),
        );

        const result = await sdkCategorizer.categorize(
          { tenantId: 't1', payeeName: 'Parent', amountCents: 500000, isCredit: true },
          't1',
        );

        expect(result.confidence).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Hybrid categorization flow', () => {
    // Test the integration in categorizer.agent.ts

    it('should use pattern match when confidence >= 80', async () => {
      // Setup: pattern matcher returns high-confidence match
      // Assert: LLM is NOT called, source is 'PATTERN'
    });

    it('should invoke LLM when pattern match confidence < 80', async () => {
      // Setup: pattern matcher returns low-confidence match
      // Assert: LLM IS called, source is 'LLM'
    });

    it('should invoke LLM when no pattern match found', async () => {
      // Setup: pattern matcher returns null
      // Assert: LLM IS called
    });

    it('should fall back to historical when LLM fails', async () => {
      // Setup: pattern matcher returns null, SDK throws
      // Assert: historical match used, source is 'HISTORICAL'
    });

    it('should fall back to defaults when all methods fail', async () => {
      // Setup: pattern null, SDK throws, historical returns null
      // Assert: defaults used (4100/8100), source is 'FALLBACK'
    });

    it('should log source field in decision log', async () => {
      // Assert: decisionLogger.log called with source: 'LLM'
    });

    it('should log model field when source is LLM', async () => {
      // Assert: decisionLogger.log called with model: 'haiku'
    });

    it('should weight LLM confidence at 70/30 with heuristic', async () => {
      // Setup: LLM returns confidence 90, heuristic returns 60
      // Assert: final confidence = round(90*0.7 + 60*0.3) = 81
    });

    it('should not auto-apply below threshold', async () => {
      // Setup: confidence below autoApplyThreshold
      // Assert: autoApplied = false, flagForReview = true
    });
  });
  ```

  ### 10. SA-Specific Test Cases
  ```typescript
  describe('SA accounting domain knowledge', () => {
    it('should categorize tuition fees as EXEMPT', async () => {
      // Parent pays monthly fees → 4000, EXEMPT
    });

    it('should categorize bank charges as NO_VAT', async () => {
      // FNB service fee → 6600, NO_VAT
    });

    it('should categorize Woolworths food as STANDARD VAT', async () => {
      // Woolworths groceries for meals → 5200, STANDARD
    });

    it('should categorize salary payments to 5000 range', async () => {
      // Teacher salary → 5000, not 6000 range
    });

    it('should use EXEMPT for registration fees', async () => {
      // Registration fee → 4100, EXEMPT (Section 12(h))
    });
  });
  ```

  ### 11. Monetary Values
  ALL amounts are in cents (integers). Never use floating-point:
  ```typescript
  // CORRECT
  amountCents: 150000  // R1,500.00

  // For display in prompts only (not storage):
  `R${(amountCents / 100).toFixed(2)}`  // "R1500.00"

  // WRONG — NEVER store or return as float
  // amount: 1500.00
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  This is the **PILOT migration** — the first CrecheBooks agent to receive Claude
  Agent SDK capabilities. It sets the architectural pattern for all subsequent agent
  migrations (payment-matcher, sars-agent, extraction-validator, orchestrator). The
  TransactionCategorizerAgent is chosen because:

  1. **Highest volume**: Processes every bank transaction imported
  2. **Clearest improvement path**: Novel transactions currently get generic defaults
  3. **Bounded scope**: Categorization is a single-step decision (not multi-step workflow)
  4. **Easy to measure**: Before/after accuracy comparison is straightforward

  ## SA-Specific Context

  ### Section 12(h) VAT Exemption
  Under the South African VAT Act, Section 12(h), the supply of educational services
  by an educational institution is VAT exempt. This applies to:
  - Tuition/school fees
  - Registration fees
  - Educational materials provided as part of the educational service

  This does NOT apply to:
  - Uniform sales (STANDARD VAT)
  - Stationery sold separately (STANDARD VAT)
  - Catering sold as a separate service (STANDARD VAT)

  ### Account Code Conventions
  - 1000-1999: Assets
  - 2000-2999: Liabilities
  - 3000-3999: Equity
  - 4000-4999: Revenue (most creche income here)
  - 5000-5999: Cost of Sales / Direct Costs (salaries, food, supplies)
  - 6000-6999: Operating Expenses (rent, utilities, insurance, bank charges)
  - 9999: Suspense (unreconciled — last resort only)

  ### Confidence Thresholds
  - 80% (default, configurable per tenant): Auto-apply threshold
  - Below 80%: Flag for human review (L2)
  - SARS-related: Always L2 regardless of confidence (but that is a different agent)

  ## Design Decisions

  1. **LLM is secondary to pattern matching**: Patterns are fast, free, and deterministic.
     The LLM is only invoked when patterns fail or have low confidence.
  2. **Weighted confidence**: LLM confidence is weighted 70% with heuristic 30% to
     incorporate both semantic and statistical signals.
  3. **Structured output**: The LLM must return JSON with specific fields. If parsing
     fails, the entire SDK path fails and we fall back to rule-based.
  4. **Decision logging**: Every decision records its `source` field, enabling
     accuracy analysis comparing LLM vs pattern vs historical vs fallback.
  5. **No removing existing logic**: The current pattern matching, historical lookup,
     and fallback logic remain intact and unchanged. We only add the LLM path.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `SdkCategorizer` class extending `BaseSdkAgent`
    - Create `CATEGORIZER_SYSTEM_PROMPT` with full SA accounting knowledge
    - Create `buildTenantPromptContext()` for tenant-specific customization
    - Create TypeScript interfaces: `SdkCategorizationInput`, `SdkCategorizationResult`,
      `ExtendedCategorizationResult`, `CategorizationSource`
    - Integrate ruvector semantic pattern search as fallback between pattern match and LLM
      (cosine similarity >= 0.85 over sanitized description embeddings via all-MiniLM-L6-v2)
    - Configure agentic-flow multi-model routing (haiku default, sonnet for high-value/ambiguous)
    - Integrate agentic-flow ReasoningBank caching for successful LLM categorizations
    - Modify `categorizer.agent.ts` to add ruvector + LLM path: pattern -> ruvector -> LLM -> historical -> fallback
    - Modify `categorizer.module.ts` to import `SdkAgentModule` and provide `SdkCategorizer`
    - Extend `CategorizationResult` interface with `source` field
    - Extend decision log schema with `source`, `model`, `reasoning`, `durationMs` fields
    - Implement confidence weighting: LLM 70% / heuristic 30%
    - Implement graceful fallback: if SDK fails -> continue to historical -> fallback
    - Implement JSON response parsing with markdown code block handling
    - Implement VAT type validation (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
    - Implement confidence clamping (0-100)
    - Unit tests for `SdkCategorizer` (categorize, response parsing, error handling)
    - Unit tests for `categorizer-prompt.ts` (prompt content, tenant context builder)
    - Integration tests for hybrid flow (all 4 paths: pattern, LLM, historical, fallback)
    - Tests for SA-specific categorization expectations
    - Tests for decision logging with source field
    - All existing categorizer tests still pass
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
  </in_scope>

  <out_of_scope>
    - Changing existing pattern matching logic in `pattern-matcher.ts` (keep as-is)
    - Changing confidence scoring algorithm in `confidence-scorer.ts` (keep as-is)
    - Changing decision logging file format (extend, do not replace)
    - Changing the JSONL file path (keep `.claude/logs/decisions.jsonl`)
    - Other agent migrations: payment-matcher (TASK-SDK-004), sars-agent (TASK-SDK-005),
      extraction-validator (TASK-SDK-006), orchestrator (TASK-SDK-007)
    - ConversationalAgent (TASK-SDK-008)
    - Accuracy comparison framework / benchmarking (TASK-SDK-012)
    - AgentDB / learning layer integration (TASK-SDK-010)
    - Ruvector training/fine-tuning of the embedding model (use pre-trained all-MiniLM-L6-v2 as-is)
    - Pattern auto-learning from LLM decisions (future task)
    - Cost tracking / rate limiting for API calls (future task)
    - Streaming / real-time inference (future task)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/transaction-categorizer/sdk-categorizer.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/transaction-categorizer/categorizer-prompt.ts
ls -la /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api/src/agents/transaction-categorizer/interfaces/sdk-categorizer.interface.ts

# 2. Build succeeds
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm run build

# 3. Run categorizer-specific tests
pnpm test -- --testPathPattern="categorizer" --runInBand

# 4. Run SDK categorizer tests specifically
pnpm test -- --testPathPattern="sdk-categorizer" --runInBand

# 5. Run prompt tests
pnpm test -- --testPathPattern="categorizer-prompt" --runInBand

# 6. Run ALL existing tests (regression check)
pnpm test -- --runInBand

# 7. Lint check
pnpm run lint

# 8. Verify SdkCategorizer extends BaseSdkAgent
grep -n "extends BaseSdkAgent" apps/api/src/agents/transaction-categorizer/sdk-categorizer.ts

# 9. Verify source field in decision logging
grep -n "source" apps/api/src/agents/transaction-categorizer/categorizer.agent.ts

# 10. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/transaction-categorizer/ && echo "FAIL: found 'any'" || echo "PASS: no 'any'"

# 11. Verify pattern matching is NOT removed
grep -n "patternMatcher" apps/api/src/agents/transaction-categorizer/categorizer.agent.ts | head -5

# 12. Verify module imports SdkAgentModule
grep "SdkAgentModule" apps/api/src/agents/transaction-categorizer/categorizer.module.ts

# 13. Verify system prompt contains SA accounting content
grep -c "Section 12" apps/api/src/agents/transaction-categorizer/categorizer-prompt.ts
grep -c "VAT" apps/api/src/agents/transaction-categorizer/categorizer-prompt.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `SdkCategorizer` class created extending `BaseSdkAgent` with `categorize()` method
  - [ ] `SdkCategorizer` uses `executeWithFallback` for graceful degradation
  - [ ] `SdkCategorizer` builds structured user message with transaction details
  - [ ] `SdkCategorizer` parses JSON response (handles markdown code blocks)
  - [ ] `SdkCategorizer` validates VAT types (STANDARD, ZERO_RATED, EXEMPT, NO_VAT)
  - [ ] `SdkCategorizer` clamps confidence to 0-100 range
  - [ ] `CATEGORIZER_SYSTEM_PROMPT` contains full SA accounting chart of accounts (1000-9999)
  - [ ] `CATEGORIZER_SYSTEM_PROMPT` contains VAT rules for creches (Section 12(h))
  - [ ] `CATEGORIZER_SYSTEM_PROMPT` instructs LLM to use MCP tools first (get_patterns, get_history)
  - [ ] `CATEGORIZER_SYSTEM_PROMPT` specifies exact JSON output format
  - [ ] `buildTenantPromptContext()` adds tenant-specific auto-apply threshold and custom codes
  - [ ] `SdkCategorizationInput` interface with tenantId, payeeName, description, amountCents, isCredit, transactionDate
  - [ ] `SdkCategorizationResult` interface with accountCode, accountName, vatType, confidence, reasoning, source, model, durationMs
  - [ ] `ExtendedCategorizationResult` interface with source field and all existing fields
  - [ ] `CategorizationSource` type: 'LLM' | 'PATTERN' | 'HISTORICAL' | 'FALLBACK'
  - [ ] Ruvector semantic search integrated as fallback step between pattern match and LLM
  - [ ] Ruvector `searchSimilarCategorizations()` uses cosine similarity >= 0.85 threshold
  - [ ] Multi-model routing configured via agentic-flow (haiku default, sonnet for high-value/ambiguous)
  - [ ] ReasoningBank caching stores successful LLM categorizations (confidence >= 75) for reuse
  - [ ] ReasoningBank cache checked before LLM invocation to avoid redundant calls
  - [ ] `categorizer.agent.ts` modified: hybrid flow pattern -> ruvector -> LLM -> historical -> fallback
  - [ ] `categorizer.agent.ts`: pattern match >= 80% confidence skips LLM (source: 'PATTERN')
  - [ ] `categorizer.agent.ts`: pattern < 80% or null triggers LLM attempt
  - [ ] `categorizer.agent.ts`: LLM failure falls through to historical match
  - [ ] `categorizer.agent.ts`: all paths fail -> default codes (4100/8100) with source: 'FALLBACK'
  - [ ] Confidence weighting: LLM = 70% LLM confidence + 30% heuristic score
  - [ ] Decision logger extended with `source`, `model`, `reasoning`, `durationMs` fields
  - [ ] `categorizer.module.ts` imports `SdkAgentModule` and provides `SdkCategorizer`
  - [ ] Unit tests: `SdkCategorizer.categorize()` returns valid result
  - [ ] Unit tests: JSON parsing handles markdown code blocks
  - [ ] Unit tests: malformed LLM response throws parseable error
  - [ ] Unit tests: VAT type validation normalizes and defaults
  - [ ] Unit tests: confidence clamped to 0-100
  - [ ] Integration tests: hybrid flow covers all 4 paths (pattern, LLM, historical, fallback)
  - [ ] Integration tests: LLM failure gracefully falls back
  - [ ] Integration tests: decision log includes source field
  - [ ] Integration tests: confidence weighting calculation is correct
  - [ ] Existing categorizer tests still pass (zero regressions)
  - [ ] Test coverage >= 90% for new files
  - [ ] Zero `any` types in new/modified files
  - [ ] Existing pattern matching logic in `pattern-matcher.ts` is NOT modified
  - [ ] Existing confidence scoring in `confidence-scorer.ts` is NOT modified
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing 1536 tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER remove existing pattern matching** — it is the fast/free/deterministic fallback. The LLM is additive, not replacement.
  - **NEVER make LLM the only categorization path** — always have pattern -> historical -> fallback chain
  - **NEVER auto-apply LLM results below 80% confidence** — flag for human review
  - **NEVER skip decision logging for LLM-sourced categorizations** — every decision MUST be logged with `source: 'LLM'`
  - **NEVER hardcode account codes in the LLM prompt as the sole source** — instruct the LLM to use MCP tools (`get_patterns`, `get_history`) first
  - **NEVER use `any` type** — use proper TypeScript interfaces
  - **NEVER use `npm`** — use `pnpm`
  - **NEVER return account code 9999 from LLM without very strong justification** — the prompt should instruct the LLM to try harder
  - **NEVER store floating-point monetary values** — always integer cents
  - **NEVER modify existing pattern-matcher.ts or confidence-scorer.ts** — these are out of scope
  - **NEVER bypass the confidence threshold check** — even LLM results must pass the auto-apply gate
  - **NEVER make real API calls in tests** — always mock `executeSdkInference`
  - **NEVER change the decision log file path** — keep `.claude/logs/decisions.jsonl`
  - **NEVER trust LLM output without validation** — always parse, validate types, clamp ranges
  - **NEVER log sensitive data (API keys, full responses) to decision log** — only structured results
  - **NEVER rely solely on ruvector semantic search for categorization** — it supplements the existing pattern matching + LLM flow as one step in the cascade; it does not replace deterministic pattern matching or LLM reasoning
  - **NEVER store raw transaction PII in ruvector embeddings** — only store sanitized description embeddings (strip account numbers, parent names, personal identifiers before embedding)
</anti_patterns>

</task_spec>
