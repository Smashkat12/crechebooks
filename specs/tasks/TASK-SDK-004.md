<task_spec id="TASK-SDK-004" version="2.0">

<metadata>
  <title>PaymentMatcherAgent SDK Migration</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>704</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-MATCHER</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>14 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The current `PaymentMatcherAgent` (428 lines at `apps/api/src/agents/payment-matcher/matcher.agent.ts`) uses a deterministic 3-factor scoring system: reference matching (40pts), amount matching (40pts), and name Levenshtein similarity (20pts). It fails on:
  - Partial references (e.g., "Inv 2024-001 partial" does not match "INV-2024-001")
  - Misspelled references ("Inv 224-001" instead of "INV-2024-001")
  - Split payments across multiple transactions ("2nd payment for Jan tuition")
  - Contextual references the scoring algorithm cannot parse ("John Smith Jan school fees")
  - Ambiguous multi-match scenarios that always escalate to human review

  The analysis shows LLM fuzzy matching can understand context like "Inv 2024-001 partial" and match it to Invoice INV-2024-001, and can disambiguate between multiple high-confidence candidates by reasoning about payment context.

  **Current Flow:**
  Reference (Levenshtein) + Amount (exact/range) + Name (Levenshtein) = 0-100 score.
  Decision rules: Single >=80% AUTO_APPLY; Multiple >=80% REVIEW (ambiguous); <80% REVIEW; <20% NO_MATCH.

  **Proposed Flow:**
  Existing scoring (fast path for clear matches) + LLM fuzzy matching (for ambiguous/low-confidence cases).

  **Ruvector Enhancement:**
  In addition to Levenshtein distance, **ruvector** embedding-based reference matching
  provides semantic similarity for invoice references. For example, "Inv 2024-001 partial"
  can match to "INV-2024-001" via vector embedding similarity even when string edit distance
  is high. This uses ruvector's HNSW index with all-MiniLM-L6-v2 384d embeddings (<0.5ms
  per query) as a supplementary signal in the scoring pipeline. Multi-model routing via
  **agentic-flow** optimizes cost on high-volume matching: haiku for standard matching,
  sonnet for complex disambiguation.

  **Gap Analysis:**
  - No LLM fuzzy matching for partial/misspelled references
  - No contextual understanding of payment references (e.g., "2nd payment for Jan")
  - Multi-match disambiguation requires human review -- LLM could reason about the most likely match
  - Split payment detection is purely amount-based, no semantic understanding
  - No natural language explanation of match reasoning for the human reviewer
  - No semantic similarity for invoice references beyond character-level Levenshtein distance

  **Files to Create:**
  - `apps/api/src/agents/payment-matcher/sdk-matcher.ts` (SDK-enhanced matcher class)
  - `apps/api/src/agents/payment-matcher/matcher-prompt.ts` (System prompt template)
  - `apps/api/src/agents/payment-matcher/interfaces/sdk-matcher.interface.ts` (SDK-specific interfaces)
  - `tests/agents/payment-matcher/sdk-matcher.spec.ts` (Unit tests for SDK matcher)

  **Files to Modify:**
  - `apps/api/src/agents/payment-matcher/matcher.agent.ts` (ADD LLM path for ambiguous matches)
  - `apps/api/src/agents/payment-matcher/matcher.module.ts` (ADD SDK imports and providers)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add <pkg>`, etc.

  ### 2. Monetary Values in CENTS
  ALL monetary values are integers representing South African cents. NEVER use floats for money.
  ```typescript
  // CORRECT
  const amountCents = 150000; // R1,500.00
  const displayAmount = `R${(amountCents / 100).toFixed(2)}`; // "R1500.00"

  // WRONG - NEVER DO THIS
  const amount = 1500.00; // Float rands
  ```

  ### 3. Tenant Isolation
  EVERY database query and EVERY SDK call MUST include `tenantId`. Never leak data across tenants.
  ```typescript
  // CORRECT
  async resolveAmbiguity(transaction: Transaction, candidates: InvoiceCandidate[], tenantId: string): Promise<SdkMatchResult> {
    // tenantId passed and used for all queries
  }

  // WRONG - missing tenantId
  async resolveAmbiguity(transaction: Transaction, candidates: InvoiceCandidate[]): Promise<SdkMatchResult> { }
  ```

  ### 4. NestJS Injectable Pattern
  All new classes must be `@Injectable()` NestJS services using constructor dependency injection.
  ```typescript
  @Injectable()
  export class SdkPaymentMatcher {
    private readonly logger = new Logger(SdkPaymentMatcher.name);

    constructor(
      private readonly prisma: PrismaService,
      // SDK client injected via DI
    ) {}
  }
  ```

  ### 5. SDK Agent Definition Pattern
  Define the agent with a system prompt, tool references, and model selection:
  ```typescript
  // In matcher-prompt.ts
  export const MATCHER_SYSTEM_PROMPT = `You are a payment matching expert for a South African creche.
Given a bank transaction and a list of outstanding invoices, determine the best match.

RULES:
- Consider reference numbers (exact, partial, with typos)
- Consider amounts (exact, partial payments, overpayments)
- Consider parent/child names (may have variations)
- "Inv", "INV", "Invoice" + number = invoice reference
- Partial payments: amount < outstanding = likely partial
- Split payments: multiple transactions may cover one invoice
- Explain your reasoning clearly
- Return confidence 0-100

CONTEXT: SA creche invoices typically for tuition fees (monthly), registration fees (annual), meal charges, transport fees.

RESPONSE FORMAT (strict JSON):
{
  "bestMatchInvoiceId": "<id or null>",
  "confidence": <0-100>,
  "reasoning": "<clear explanation>",
  "isPartialPayment": <true/false>,
  "suggestedAllocation": [{"invoiceId": "<id>", "amountCents": <cents>}]
}`;

  export const MATCHER_AGENT_MODEL = 'haiku'; // Fast + cheap for high-volume matching
  ```

  ### 6. Ruvector-Assisted Reference Matching
  Before invoking the LLM for ambiguous cases, use ruvector embeddings to find
  semantically similar invoice references. This supplements (does NOT replace) the
  existing 3-factor Levenshtein-based scoring.
  The updated hybrid matching flow is:
  **Deterministic 3-factor scoring → ruvector reference similarity → LLM fuzzy matching (for remaining ambiguous)**
  ```typescript
  // In sdk-matcher.ts
  import { RuvectorService } from '../../shared/ruvector/ruvector.service';

  @Injectable()
  export class SdkPaymentMatcher {
    constructor(
      private readonly ruvector: RuvectorService,
      // ... other deps
    ) {}

    /**
     * Search ruvector for semantically similar invoice references.
     * Supplements Levenshtein with embedding similarity for cases like:
     * "Inv 2024-001 partial" → INV-2024-001 (cosine similarity 0.91)
     * "School fees Williams Jan" → INV-2024-0042 for Williams family
     */
    async findSimilarReferences(
      bankReference: string,
      tenantId: string,
    ): Promise<Array<{ invoiceId: string; reference: string; similarity: number }>> {
      const results = await this.ruvector.search({
        collection: `invoice_references:${tenantId}`,
        query: bankReference,
        topK: 5,
        minSimilarity: 0.75,
      });
      return results.map(r => ({
        invoiceId: r.metadata.invoiceId,
        reference: r.metadata.reference,
        similarity: r.similarity,
      }));
    }
  }
  ```

  ### 7. Multi-Model Routing for Payment Matching
  Use agentic-flow multi-model routing to optimize cost on high-volume matching:
  ```typescript
  // Standard matching (single candidate, moderate confidence) → haiku (fast/cheap)
  // Complex disambiguation (multiple candidates, split payments) → sonnet (deeper reasoning)
  private routeMatchModel(candidates: InvoiceCandidate[], transaction: Transaction): string {
    const isMultiCandidate = candidates.filter(c => c.confidence >= 40).length > 2;
    const isHighValue = Math.abs(transaction.amountCents) > 5_000_000;
    const hasSplitPaymentSignal = transaction.description?.toLowerCase().includes('partial')
      || transaction.description?.toLowerCase().includes('part payment');
    if (isMultiCandidate || isHighValue || hasSplitPaymentSignal) {
      return 'sonnet';
    }
    return 'haiku';
  }
  ```

  ### 8. Hybrid Matching Flow (Fast Path + Ruvector + LLM Path)
  The existing deterministic scorer handles clear matches. Ruvector supplements reference
  matching. LLM is ONLY invoked for remaining ambiguous or low-confidence scenarios.
  ```typescript
  async makeMatchDecision(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number = 80,
  ): Promise<MatchDecision> {
    const highConfidence = candidates.filter(c => c.confidence >= autoApplyThreshold);

    // FAST PATH: Single clear match >= 80% -- no LLM needed
    if (highConfidence.length === 1) {
      return { action: 'AUTO_APPLY', /* existing logic */ };
    }

    // RUVECTOR PATH: Boost candidates with semantic reference similarity
    if (transaction.bankReference) {
      const similarRefs = await this.sdkMatcher.findSimilarReferences(
        transaction.bankReference, tenantId,
      );
      // Boost existing candidate scores with ruvector similarity (additive, max +10pts)
      for (const candidate of candidates) {
        const refMatch = similarRefs.find(r => r.invoiceId === candidate.invoiceId);
        if (refMatch) {
          candidate.confidence = Math.min(100, candidate.confidence + Math.round(refMatch.similarity * 10));
        }
      }
      // Re-evaluate after boost
      const boostedHigh = candidates.filter(c => c.confidence >= autoApplyThreshold);
      if (boostedHigh.length === 1) {
        return { action: 'AUTO_APPLY', invoice: boostedHigh[0], source: 'deterministic+ruvector' };
      }
    }

    // LLM PATH: Ambiguous (multiple high-conf) or moderate confidence (40-79%)
    if (highConfidence.length > 1 || candidates.some(c => c.confidence >= 40 && c.confidence < autoApplyThreshold)) {
      try {
        const model = this.sdkMatcher.routeMatchModel(candidates, transaction);
        const sdkResult = await this.sdkMatcher.resolveAmbiguity(
          transaction, candidates, tenantId, model,
        );
        return this.convertSdkResult(sdkResult, transaction, candidates);
      } catch (error) {
        this.logger.warn(`SDK matcher failed, falling back to existing logic: ${error.message}`);
        // FALLBACK: existing deterministic logic
      }
    }

    // EXISTING LOGIC: No match / very low confidence
    return existingDecision;
  }
  ```

  ### 9. Structured LLM Output Interface
  ```typescript
  // In interfaces/sdk-matcher.interface.ts
  export interface SdkMatchResult {
    bestMatchInvoiceId: string | null;
    confidence: number; // 0-100
    reasoning: string;  // Human-readable explanation
    isPartialPayment: boolean;
    suggestedAllocation: SdkAllocation[];
  }

  export interface SdkAllocation {
    invoiceId: string;
    amountCents: number; // In CENTS
  }

  export interface SdkMatcherConfig {
    model: string;       // 'haiku' for speed
    maxTokens: number;   // Cap output tokens
    temperature: number; // Low for determinism
    timeoutMs: number;   // Timeout for LLM call
  }
  ```

  ### 10. Decision Logging for SDK Decisions
  Log SDK decisions to the SAME `.claude/logs/decisions.jsonl` file with a `source: 'sdk'` field.
  ```typescript
  await this.decisionLogger.logDecision({
    tenantId,
    transactionId: transaction.id,
    transactionAmountCents: transaction.amountCents,
    decision: 'match',
    invoiceId: sdkResult.bestMatchInvoiceId,
    confidence: sdkResult.confidence,
    autoApplied: sdkResult.confidence >= autoApplyThreshold,
    reasoning: sdkResult.reasoning,
    candidateCount: candidates.length,
    // NEW field
    source: 'sdk', // Distinguish from deterministic decisions
  });
  ```

  ### 11. Error Handling: Graceful Fallback
  LLM failures MUST fall back to existing deterministic logic. The system must never break because the LLM is unavailable.
  ```typescript
  try {
    const sdkResult = await this.sdkMatcher.resolveAmbiguity(transaction, candidates, tenantId);
    return this.convertSdkResult(sdkResult, transaction, candidates);
  } catch (error) {
    this.logger.warn(`SDK matcher failed: ${error.message}`);
    // Fallback to existing decision logic -- NEVER throw
    return this.makeExistingDecision(transaction, candidates, tenantId, autoApplyThreshold);
  }
  ```

  ### 12. High-Value Transaction Safety
  NEVER auto-apply LLM matches for amounts over R50,000 (5,000,000 cents) without human review, even if confidence is high.
  ```typescript
  const HIGH_VALUE_THRESHOLD_CENTS = 5_000_000; // R50,000

  if (Math.abs(transaction.amountCents) > HIGH_VALUE_THRESHOLD_CENTS) {
    decision.action = 'REVIEW_REQUIRED';
    decision.reasoning += ' [HIGH VALUE: requires human review regardless of confidence]';
  }
  ```
</critical_patterns>

<context>
  ## Business Context

  CrecheBooks is accounting software for South African creches (daycare centers). Parents pay monthly tuition fees, registration fees, extra-mural activity fees, meal charges, and transport fees. Payment patterns include:

  - **Bank references:** "John Smith tuition Jan", "INV-2024-0042", "Reg fee + Jan tuition", "School fees Williams"
  - **Partial payments:** Parents on payment plans pay less than the full invoice amount
  - **Split payments:** One invoice may be covered by multiple bank transactions on different days
  - **Multiple children:** One parent may have multiple children enrolled, each with separate invoices
  - **SA banking context:** FNB, Standard Bank, ABSA, Nedbank, Capitec. Bank EFT references are often truncated to 20-30 characters

  ## Existing Agent Architecture

  The `PaymentMatcherAgent` is one of 5 agents in the system:
  1. `TransactionCategorizerAgent` -- categorizes bank transactions
  2. `PaymentMatcherAgent` -- matches payments to invoices (THIS TASK)
  3. `SarsAgent` -- SARS tax calculations (always L2 review)
  4. `ExtractionValidatorAgent` -- validates PDF extraction quality
  5. `OrchestratorAgent` -- coordinates agent workflows

  All agents share:
  - NestJS `@Injectable()` pattern
  - Decision logging to `.claude/logs/decisions.jsonl`
  - Escalation logging to `.claude/logs/escalations.jsonl`
  - Tenant isolation on all operations
  - Confidence-based autonomy levels

  ## Scoring Breakdown (Existing)

  | Factor     | Max Points | Rules                                         |
  |------------|-----------|-----------------------------------------------|
  | Reference  | 40        | exact=40, contains=30, suffix=15              |
  | Amount     | 40        | exact=40, 1%=35, 5%=25, 10%=15, partial=10   |
  | Name       | 20        | exact=20, >80%=15, >60%=10, >40%=5           |
  | **Total**  | **100**   |                                               |

  ## Key Files Reference

  | File | Lines | Purpose |
  |------|-------|---------|
  | `apps/api/src/agents/payment-matcher/matcher.agent.ts` | 428 | Main agent with findCandidates() and makeMatchDecision() |
  | `apps/api/src/agents/payment-matcher/matcher.module.ts` | 19 | NestJS module (PrismaModule import, agent + logger providers) |
  | `apps/api/src/agents/payment-matcher/decision-logger.ts` | 108 | JSONL decision and escalation logging |
  | `apps/api/src/agents/payment-matcher/interfaces/matcher.interface.ts` | 81 | MatchDecision, InvoiceCandidate, log interfaces |
  | `apps/api/src/agents/payment-matcher/index.ts` | -- | Barrel exports |

  ## SA Compliance Notes

  - Financial calculations use Decimal.js with ROUND_HALF_EVEN (banker's rounding)
  - All monetary amounts stored as integer cents in PostgreSQL
  - Tenant isolation is a regulatory requirement (multi-tenant SaaS)
  - Audit trail via decision logging is mandatory for financial operations
</context>

<scope>
  <in_scope>
    - Create `SdkPaymentMatcher` class that wraps LLM calls for ambiguous match resolution
    - Create `matcher-prompt.ts` with the system prompt for the LLM agent
    - Create `interfaces/sdk-matcher.interface.ts` with SdkMatchResult, SdkAllocation, SdkMatcherConfig
    - Integrate ruvector embedding-based reference matching to supplement Levenshtein scoring
      (semantic similarity for partial/misspelled references via all-MiniLM-L6-v2 384d embeddings)
    - Configure agentic-flow multi-model routing (haiku for standard matching, sonnet for complex disambiguation)
    - Modify `matcher.agent.ts` to add ruvector boost + LLM path for ambiguous matches (highConfidence.length > 1 or moderate confidence 40-79%)
    - Modify `matcher.module.ts` to register SdkPaymentMatcher as a provider
    - Add `source: 'sdk'` field to MatchDecisionLog interface to distinguish SDK vs deterministic decisions
    - Implement HIGH_VALUE_THRESHOLD_CENTS (R50,000) safety check
    - Implement graceful fallback to existing logic when SDK call fails
    - Unit tests for SdkPaymentMatcher (mock LLM responses, test fallback, test high-value guard)
    - Unit tests for hybrid flow in matcher.agent.ts (verify fast path skips LLM, verify LLM path triggers correctly)
  </in_scope>
  <out_of_scope>
    - Changing the existing 3-factor scoring algorithm (reference + amount + name)
    - Split payment tracking database model or schema changes
    - Frontend UI for match review
    - Batch processing of historical unmatched transactions
    - Integration tests against real LLM endpoints (unit tests use mocks)
    - Changes to OrchestratorAgent or other agents
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
pnpm run build

# 2. Linting
pnpm run lint

# 3. Run payment matcher tests (existing + new)
pnpm test -- --testPathPatterns="payment-matcher" --verbose

# 4. Verify new files exist
ls -la apps/api/src/agents/payment-matcher/sdk-matcher.ts
ls -la apps/api/src/agents/payment-matcher/matcher-prompt.ts
ls -la apps/api/src/agents/payment-matcher/interfaces/sdk-matcher.interface.ts
ls -la tests/agents/payment-matcher/sdk-matcher.spec.ts

# 5. Verify MatchDecision interface has source field
grep -n "source" apps/api/src/agents/payment-matcher/interfaces/matcher.interface.ts

# 6. Verify hybrid flow in matcher.agent.ts
grep -n "sdkMatcher\|resolveAmbiguity\|HIGH_VALUE" apps/api/src/agents/payment-matcher/matcher.agent.ts

# 7. Verify module registers SdkPaymentMatcher
grep -n "SdkPaymentMatcher" apps/api/src/agents/payment-matcher/matcher.module.ts

# 8. Run full test suite to check no regressions
pnpm test -- --verbose 2>&1 | tail -20
```
</verification_commands>

<definition_of_done>
  - [ ] `apps/api/src/agents/payment-matcher/sdk-matcher.ts` exists and exports `SdkPaymentMatcher` class
  - [ ] `SdkPaymentMatcher` is `@Injectable()` with constructor DI
  - [ ] `SdkPaymentMatcher.resolveAmbiguity()` accepts transaction, candidates, tenantId and returns `SdkMatchResult`
  - [ ] `apps/api/src/agents/payment-matcher/matcher-prompt.ts` exports system prompt string and model config
  - [ ] `apps/api/src/agents/payment-matcher/interfaces/sdk-matcher.interface.ts` exports `SdkMatchResult`, `SdkAllocation`, `SdkMatcherConfig`
  - [ ] `MatchDecisionLog` interface in `matcher.interface.ts` has optional `source?: 'deterministic' | 'sdk'` field
  - [ ] `matcher.agent.ts` constructor accepts optional `SdkPaymentMatcher` dependency
  - [ ] Ruvector reference embedding search integrated via `findSimilarReferences()` to boost candidate scores
  - [ ] Multi-model routing configured via agentic-flow (haiku for standard matching, sonnet for complex disambiguation)
  - [ ] `matcher.agent.ts` `makeMatchDecision()` has fast path (single >=80% no LLM), ruvector boost path, and LLM path (ambiguous or moderate confidence)
  - [ ] LLM path has try/catch with graceful fallback to existing deterministic logic
  - [ ] HIGH_VALUE_THRESHOLD_CENTS = 5_000_000 enforced: amounts > R50,000 always REVIEW_REQUIRED
  - [ ] `matcher.module.ts` registers `SdkPaymentMatcher` as a provider
  - [ ] `tests/agents/payment-matcher/sdk-matcher.spec.ts` has tests for: successful LLM resolution, LLM failure fallback, high-value guard, partial payment detection, structured output parsing
  - [ ] All existing payment matcher tests still pass (no regressions)
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
  - [ ] All monetary values in new code use integer cents
  - [ ] All new methods include `tenantId` parameter
  - [ ] SDK decisions logged with `source: 'sdk'` to `.claude/logs/decisions.jsonl`
</definition_of_done>

<anti_patterns>
  - **NEVER** remove or modify the existing 3-factor scoring algorithm -- it handles 70%+ of matches fast and free
  - **NEVER** auto-apply LLM-sourced matches for amounts over R50,000 (5,000,000 cents) without human review
  - **NEVER** skip tenant isolation -- every method must accept and propagate `tenantId`
  - **NEVER** use `npm` -- this project uses `pnpm` exclusively
  - **NEVER** use floats for monetary values -- all amounts in integer cents
  - **NEVER** make the LLM call blocking/required -- always wrap in try/catch with fallback to deterministic logic
  - **NEVER** send PII (account numbers, full names) unnecessarily to the LLM -- only send what is needed for matching
  - **NEVER** bypass the decision logger -- all SDK decisions must be logged just like deterministic ones
  - **NEVER** change the AUTO_APPLY_THRESHOLD (80) or CANDIDATE_THRESHOLD (20) constants
  - **NEVER** make SdkPaymentMatcher a required dependency -- it must be optional so the system works without SDK config
  - **NEVER** replace Levenshtein scoring with ruvector alone -- ruvector supplements the existing 3-factor scoring (reference 40pts + amount 40pts + name 20pts) as an additive boost, it does not replace any of the three factors
</anti_patterns>

</task_spec>
