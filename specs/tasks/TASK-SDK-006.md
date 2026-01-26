<task_spec id="TASK-SDK-006" version="2.0">

<metadata>
  <title>ExtractionValidatorAgent SDK Enhancement (LLM Semantic Validation)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>706</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-VALIDATOR</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The current `ExtractionValidatorAgent` (400 lines at `apps/api/src/agents/extraction-validator/validator.agent.ts`) validates PDF bank statement extraction using 5 numerical checks totaling 100 points:

  | Check | Max Points | What It Does |
  |-------|-----------|--------------|
  | Balance reconciliation | 40 | opening + transactions = closing |
  | Amount sanity | 20 | Amounts within reasonable ranges |
  | Date consistency | 15 | All dates within statement period |
  | OCR pattern detection | 15 | Decimal errors, suspicious ratios, amounts in descriptions |
  | Transaction count | 10 | 0-500 transactions is reasonable |

  Thresholds: >=90% auto-accept, 50-89% review, <50% reject.

  These 5 checks are purely numerical. They miss context-dependent errors that require understanding:
  - "This doesn't look like a bank statement" (wrong document type uploaded)
  - "Amounts don't make sense for this account type" (e.g., R1M debit on a petty cash account)
  - "Descriptions suggest this is a credit card statement, not a bank statement"
  - "This appears to be two statements merged into one upload"
  - "Transaction descriptions are gibberish, suggesting severe OCR corruption"

  **Proposed Enhancement:**
  Add a 6th validation check using LLM semantic analysis that adjusts the confidence score by +5 (semantic pass) or -10 (semantic fail). This is a supplementary check -- the 5 existing numerical checks remain the primary validators.

  **SDK Approach:**
  LLM calls for semantic validation are routed through `agentic-flow`'s execution engine (v2.0.2-alpha), which provides multi-model routing across 100+ LLM providers. Haiku remains the default model for validation (fast, cost-effective for high-volume pipeline). Multi-model routing enables cost optimization on high-volume validation by falling back to alternative fast providers when primary is unavailable. The `@anthropic-ai/claude-agent-sdk` is consumed transitively via agentic-flow -- no direct dependency is needed.

  **Gap Analysis:**
  - No document type validation (could be credit card statement, investment report, etc.)
  - No semantic understanding of transaction descriptions (OCR check is pattern-based only)
  - No account type context (amounts appropriate for account type?)
  - No detection of mixed document types in a single upload
  - No natural language explanation of validation issues for human reviewer

  **Files to Create:**
  - `apps/api/src/agents/extraction-validator/sdk-validator.ts` (SDK semantic validator class)
  - `apps/api/src/agents/extraction-validator/validator-prompt.ts` (System prompt for semantic validation)
  - `apps/api/src/agents/extraction-validator/interfaces/sdk-validator.interface.ts` (SDK-specific interfaces)
  - `tests/agents/extraction-validator/sdk-validator.spec.ts` (Unit tests)

  **Files to Modify:**
  - `apps/api/src/agents/extraction-validator/validator.agent.ts` (ADD LLM semantic check as 6th validation step)
  - `apps/api/src/agents/extraction-validator/validator.module.ts` (ADD SdkSemanticValidator to providers)
  - `apps/api/src/agents/extraction-validator/interfaces/validator.interface.ts` (EXTEND ValidationResult with semanticValidation field)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add <pkg>`, etc.

  ### 2. Monetary Values in CENTS
  ALL monetary values are integers representing South African cents. NEVER use floats for money.
  ```typescript
  // CORRECT - when building prompt context
  const openingBalance = `R${(statement.openingBalanceCents / 100).toFixed(2)}`;

  // WRONG
  const openingBalance = statement.openingBalanceCents / 100; // Float
  ```

  ### 3. SDK Agent Definition for Semantic Validation (via agentic-flow)
  ```typescript
  // In validator-prompt.ts
  export const VALIDATOR_SYSTEM_PROMPT = `You are a bank statement validation expert. Analyze extracted bank statement data and identify issues that numerical checks might miss.

CHECK FOR:
1. Document type: Is this actually a bank statement? (not credit card, investment, loan, etc.)
2. Account consistency: Do amounts make sense for this account type? (e.g., a creche business account)
3. Description patterns: Are transaction descriptions consistent with a bank statement? (not gibberish from OCR)
4. Currency/format: Are amounts in ZAR format? Any foreign currency mixing?
5. Temporal patterns: Do transaction patterns make sense? (business days, weekends, holidays)
6. Duplicate detection: Any suspicious duplicate transactions? (same amount+date+description)
7. Statement coherence: Does this look like a single statement or multiple merged documents?

CONTEXT: This is a South African creche (daycare center) bank account. Typical transactions include parent fee payments (credits), staff salaries (debits), supplier payments, SARS payments, utility bills. Common SA banks: FNB, Standard Bank, ABSA, Nedbank, Capitec.

RESPONSE FORMAT (strict JSON):
{
  "isSemanticValid": true/false,
  "semanticConfidence": 0-100,
  "documentType": "bank_statement" | "credit_card" | "investment" | "loan" | "unknown" | "mixed",
  "issues": [
    {
      "severity": "INFO" | "WARNING" | "ERROR",
      "code": "WRONG_DOCUMENT_TYPE" | "OCR_CORRUPTION" | "SUSPICIOUS_AMOUNTS" | "DUPLICATE_TRANSACTIONS" | "MIXED_DOCUMENTS" | "FOREIGN_CURRENCY" | "DESCRIPTION_GIBBERISH",
      "description": "Human-readable description of the issue"
    }
  ],
  "summary": "One-paragraph human-readable assessment of the extraction quality"
}`;

  // Model selection via agentic-flow's multi-model routing:
  // Primary: Claude Haiku (fast, cost-effective for high-volume validation pipeline)
  // Fallback: alternative fast providers via agentic-flow routing
  export const VALIDATOR_AGENT_MODEL = 'haiku';
  ```

  ### 4. Supplementary Confidence Adjustment (Not Replacement)
  The LLM semantic check adjusts the existing 0-100 confidence score by a small amount. It does NOT replace the numerical checks.
  ```typescript
  // After existing 5 checks have produced confidence (0-100 points)
  // Apply semantic adjustment: +5 bonus or -10 penalty
  const SEMANTIC_BONUS = 5;
  const SEMANTIC_PENALTY = -10;

  let semanticAdjustment = 0;
  try {
    const semantic = await this.sdkValidator.validate(statement, tenantId);
    if (semantic.isSemanticValid && semantic.semanticConfidence >= 70) {
      semanticAdjustment = SEMANTIC_BONUS; // Boost confidence
    } else if (!semantic.isSemanticValid) {
      semanticAdjustment = SEMANTIC_PENALTY; // Reduce confidence
      flags.push(...semantic.issues.map(issue => ({
        severity: issue.severity as ValidationFlag['severity'],
        code: `SEMANTIC_${issue.code}`,
        message: issue.description,
      })));
    }
    result.semanticValidation = semantic;
  } catch (error) {
    this.logger.warn(`SDK semantic validation failed: ${error.message}`);
    // Non-critical -- skip semantic check if LLM unavailable
  }

  // Clamp confidence to 0-100 after adjustment
  confidence = Math.max(0, Math.min(100, confidence + semanticAdjustment));
  ```

  ### 5. Structured LLM Output Interface
  ```typescript
  // In interfaces/sdk-validator.interface.ts
  export interface SemanticValidationResult {
    isSemanticValid: boolean;
    semanticConfidence: number; // 0-100
    documentType: 'bank_statement' | 'credit_card' | 'investment' | 'loan' | 'unknown' | 'mixed';
    issues: SemanticIssue[];
    summary: string; // Human-readable assessment
  }

  export interface SemanticIssue {
    severity: 'INFO' | 'WARNING' | 'ERROR';
    code: SemanticIssueCode;
    description: string;
  }

  export type SemanticIssueCode =
    | 'WRONG_DOCUMENT_TYPE'
    | 'OCR_CORRUPTION'
    | 'SUSPICIOUS_AMOUNTS'
    | 'DUPLICATE_TRANSACTIONS'
    | 'MIXED_DOCUMENTS'
    | 'FOREIGN_CURRENCY'
    | 'DESCRIPTION_GIBBERISH';

  export interface SdkValidatorConfig {
    model: string;
    maxTokens: number;
    temperature: number;
    timeoutMs: number;
    maxTransactionsToSample: number; // Don't send all 500 transactions to LLM
  }
  ```

  ### 6. PII Protection -- Sanitize Before Sending to LLM
  Bank statements contain sensitive information. NEVER send raw account numbers, beneficiary details, or full transaction descriptions to the LLM. Sanitize first.
  ```typescript
  private sanitizeForLlm(statement: ParsedBankStatement): SanitizedStatementSummary {
    return {
      bankName: statement.bankName || 'Unknown',
      accountType: statement.accountType || 'Unknown',
      // Mask account number: "1234567890" -> "******7890"
      maskedAccountNumber: statement.accountNumber
        ? '******' + statement.accountNumber.slice(-4)
        : 'Unknown',
      openingBalanceRands: (statement.openingBalanceCents / 100).toFixed(2),
      closingBalanceRands: (statement.closingBalanceCents / 100).toFixed(2),
      transactionCount: statement.transactions.length,
      periodStart: statement.statementPeriod?.start?.toISOString()?.slice(0, 10),
      periodEnd: statement.statementPeriod?.end?.toISOString()?.slice(0, 10),
      // Sample up to 20 transactions -- descriptions only, no account numbers
      sampleTransactions: statement.transactions.slice(0, 20).map((tx, i) => ({
        index: i + 1,
        date: tx.date.toISOString().slice(0, 10),
        description: tx.description.slice(0, 80), // Truncate long descriptions
        amountRands: (tx.amountCents / 100).toFixed(2),
        type: tx.amountCents >= 0 ? 'credit' : 'debit',
      })),
      // Aggregate statistics
      totalCreditsRands: (statement.transactions
        .filter(tx => tx.amountCents > 0)
        .reduce((sum, tx) => sum + tx.amountCents, 0) / 100).toFixed(2),
      totalDebitsRands: (Math.abs(statement.transactions
        .filter(tx => tx.amountCents < 0)
        .reduce((sum, tx) => sum + tx.amountCents, 0)) / 100).toFixed(2),
    };
  }
  ```

  ### 7. NestJS Injectable Pattern
  ```typescript
  @Injectable()
  export class SdkSemanticValidator {
    private readonly logger = new Logger(SdkSemanticValidator.name);

    constructor(
      // SDK client injected via DI
    ) {}

    async validate(
      statement: ParsedBankStatement,
      tenantId: string,
    ): Promise<SemanticValidationResult> {
      const sanitized = this.sanitizeForLlm(statement);
      const prompt = this.buildValidationPrompt(sanitized);
      const rawResult = await this.callLlm(prompt);
      return this.parseResult(rawResult);
    }
  }
  ```

  ### 8. Integration Point in validate() Method
  The semantic check runs AFTER the 5 existing checks, BEFORE the final confidence determination.
  ```typescript
  async validate(statement: ParsedBankStatement, tenantId: string): Promise<ValidationResult> {
    // ... existing 5 checks (unchanged) ...
    // confidence is 0-100 at this point

    // 6. Semantic validation via LLM (supplementary +-10 points)
    let semanticValidation: SemanticValidationResult | undefined;
    try {
      semanticValidation = await this.sdkValidator.validate(statement, tenantId);
      if (semanticValidation.isSemanticValid && semanticValidation.semanticConfidence >= 70) {
        confidence += 5;
        this.logger.log('Semantic validation: PASSED (+5 bonus)');
      } else if (!semanticValidation.isSemanticValid) {
        confidence -= 10;
        flags.push(...semanticValidation.issues.map(issue => ({
          severity: issue.severity as ValidationFlag['severity'],
          code: `SEMANTIC_${issue.code}`,
          message: issue.description,
        })));
        this.logger.warn(`Semantic validation: FAILED (-10 penalty, ${semanticValidation.issues.length} issues)`);
      }
    } catch (error) {
      this.logger.warn(`Semantic validation skipped: ${error.message}`);
    }
    confidence = Math.max(0, Math.min(100, confidence));

    // ... existing threshold determination (UNCHANGED) ...
    const isValid = confidence >= THRESHOLDS.AUTO_ACCEPT && reconciliation.reconciled;

    const result: ValidationResult = {
      // ... existing fields ...
      semanticValidation, // NEW: optional semantic result
    };
  }
  ```

  ### 9. Graceful Fallback
  ```typescript
  try {
    semanticValidation = await this.sdkValidator.validate(statement, tenantId);
    // Apply adjustment...
  } catch (error) {
    this.logger.warn(`SDK semantic validation failed, skipping: ${error.message}`);
    // confidence remains unchanged -- 5 numerical checks are sufficient
  }
  ```

  ### 10. Transaction Sampling for LLM
  Do NOT send all 500 transactions to the LLM. Sample strategically:
  ```typescript
  const MAX_SAMPLE_SIZE = 20;

  private sampleTransactions(transactions: ParsedTransaction[]): ParsedTransaction[] {
    if (transactions.length <= MAX_SAMPLE_SIZE) return transactions;

    // Take first 5, last 5, and 10 random from middle
    const first5 = transactions.slice(0, 5);
    const last5 = transactions.slice(-5);
    const middle = transactions.slice(5, -5);
    const randomMiddle = this.shuffleAndTake(middle, MAX_SAMPLE_SIZE - 10);

    return [...first5, ...randomMiddle, ...last5];
  }
  ```
</critical_patterns>

<context>
  ## Business Context

  CrecheBooks imports bank statements via PDF upload. The extraction pipeline works as follows:

  1. **Upload:** User uploads PDF bank statement
  2. **Parse:** `HybridPdfParser` extracts text (local pdfjs-dist first, LLMWhisperer cloud OCR fallback for scanned PDFs)
  3. **Validate:** `ExtractionValidatorAgent` checks extraction quality (THIS TASK enhances this step)
  4. **Import:** Valid extractions are imported as transactions; invalid ones are escalated for manual review

  ### SA Banking Context

  South African bank statements have specific formats per bank:
  - **FNB (First National Bank):** CSV-like format, consistent column layout
  - **Standard Bank:** Multi-page PDF with running balances
  - **ABSA:** Separate debit and credit columns
  - **Nedbank:** Similar to Standard Bank format
  - **Capitec:** Simple format, often digital-first

  Common extraction issues:
  - **Wrong document:** User uploads credit card statement, investment report, or loan statement instead of bank statement
  - **OCR misreads:** Scanned PDFs have decimal point errors (R1,000.00 becomes R100,000.00)
  - **Column merge:** OCR merges amount column into description column
  - **Mixed documents:** PDF contains multiple statements or non-statement pages (cover letter, T&Cs)
  - **Foreign currency:** Occasional forex transactions in non-ZAR currencies

  ### Typical Creche Bank Statement Content

  Credits: Parent fee payments, ECD subsidy grants, fundraising income
  Debits: Staff salaries, SARS payments (PAYE/UIF/SDL), food suppliers, utilities (water, electricity), rent, educational supplies, insurance

  ## Existing Agent Architecture

  The `ExtractionValidatorAgent` constructor receives 3 dependencies:
  ```typescript
  constructor(
    private readonly balanceReconciler: BalanceReconciler,
    private readonly sanityChecker: AmountSanityChecker,
    private readonly decisionLogger: ExtractionDecisionLogger,
  )
  ```

  It has 2 public methods:
  1. `validate(statement, tenantId)` -- returns `ValidationResult` with confidence 0-100
  2. `validateAndCorrect(statement, tenantId, applyCorrections)` -- validates and optionally applies high-confidence corrections

  Private methods:
  - `datesConsistent(statement)` -- checks dates within statement period
  - `detectOcrPatterns(statement)` -- detects OCR error patterns
  - `generateReasoning(reconciliation, flags, corrections, confidence)` -- builds reasoning string

  ## Key Files Reference

  | File | Lines | Purpose |
  |------|-------|---------|
  | `apps/api/src/agents/extraction-validator/validator.agent.ts` | 400 | Main agent with validate() and validateAndCorrect() |
  | `apps/api/src/agents/extraction-validator/validator.module.ts` | 22 | NestJS module (agent + reconciler + sanity checker + logger) |
  | `apps/api/src/agents/extraction-validator/balance-reconciler.ts` | -- | Balance reconciliation logic (opening + txns = closing) |
  | `apps/api/src/agents/extraction-validator/amount-sanity-checker.ts` | -- | Amount range and sanity validation |
  | `apps/api/src/agents/extraction-validator/decision-logger.ts` | 162 | JSONL validation and escalation logging |
  | `apps/api/src/agents/extraction-validator/interfaces/validator.interface.ts` | 90 | ValidationResult, Correction, ValidationFlag, etc. |

  ## Confidence Score Breakdown (After Enhancement)

  | Check | Points | Source |
  |-------|--------|--------|
  | Balance reconciliation | 0-40 | Existing (BalanceReconciler) |
  | Amount sanity | 0-20 | Existing (AmountSanityChecker) |
  | Date consistency | 0-15 | Existing (datesConsistent) |
  | OCR pattern detection | 0-15 | Existing (detectOcrPatterns) |
  | Transaction count | 0-10 | Existing (count check) |
  | **Semantic validation** | **+5 or -10** | **NEW (SdkSemanticValidator)** |
  | **Total range** | **0-105 clamped to 0-100** | |

  Thresholds remain unchanged: >=90% auto-accept, 50-89% review, <50% reject.
</context>

<scope>
  <in_scope>
    - Create `SdkSemanticValidator` class that performs LLM-based semantic validation of extracted bank statements
    - Create `validator-prompt.ts` with system prompt and model configuration
    - Create `interfaces/sdk-validator.interface.ts` with `SemanticValidationResult`, `SemanticIssue`, `SemanticIssueCode`, `SdkValidatorConfig`
    - Implement PII sanitization: mask account numbers, sample transactions (max 20), truncate descriptions
    - Modify `validator.agent.ts` to add semantic validation as 6th check (after existing 5 checks)
    - Semantic check adjusts confidence by +5 (pass with >=70% semantic confidence) or -10 (fail)
    - Confidence clamped to 0-100 after adjustment
    - Semantic issues added to `flags` array with `SEMANTIC_` prefix on code
    - Modify `ValidationResult` interface to add optional `semanticValidation?: SemanticValidationResult` field
    - Modify `validator.module.ts` to register `SdkSemanticValidator` as a provider
    - Graceful fallback: if LLM fails, 5 existing numerical checks are sufficient
    - Unit tests for `SdkSemanticValidator` (mock LLM, test all issue types, test sanitization, test sampling)
    - agentic-flow multi-model routing for semantic validation (Claude Haiku primary, alternative fast providers as fallback)
  </in_scope>
  <out_of_scope>
    - Changing the existing 5 numerical validation checks or their point values
    - Changing threshold values (90/50) for auto-accept/review/reject
    - Changing `BalanceReconciler` or `AmountSanityChecker` logic
    - PDF parsing or OCR pipeline changes
    - Frontend UI for validation review
    - Batch re-validation of previously imported statements
    - Changes to `validateAndCorrect()` method (semantic check only runs in `validate()`)
    - LLM-based correction suggestions (only validation/flagging)
    - Multi-language statement support
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
pnpm run build

# 2. Linting
pnpm run lint

# 3. Run extraction validator tests (existing + new)
pnpm test -- --testPathPatterns="extraction-validator" --verbose

# 4. Verify new files exist
ls -la apps/api/src/agents/extraction-validator/sdk-validator.ts
ls -la apps/api/src/agents/extraction-validator/validator-prompt.ts
ls -la apps/api/src/agents/extraction-validator/interfaces/sdk-validator.interface.ts
ls -la tests/agents/extraction-validator/sdk-validator.spec.ts

# 5. Verify ValidationResult has semanticValidation field
grep -n "semanticValidation" apps/api/src/agents/extraction-validator/interfaces/validator.interface.ts

# 6. Verify semantic check integrated in validator.agent.ts
grep -n "sdkValidator\|semanticValidation\|SEMANTIC_" apps/api/src/agents/extraction-validator/validator.agent.ts

# 7. Verify module registers SdkSemanticValidator
grep -n "SdkSemanticValidator" apps/api/src/agents/extraction-validator/validator.module.ts

# 8. Verify PII sanitization exists
grep -n "sanitize\|mask\|accountNumber" apps/api/src/agents/extraction-validator/sdk-validator.ts

# 9. Verify confidence clamping
grep -n "Math.max.*Math.min\|clamp" apps/api/src/agents/extraction-validator/validator.agent.ts

# 10. Verify thresholds unchanged
grep -n "AUTO_ACCEPT\|REVIEW_REQUIRED\|REJECT" apps/api/src/agents/extraction-validator/validator.agent.ts

# 11. Run full test suite to check no regressions
pnpm test -- --verbose 2>&1 | tail -20
```
</verification_commands>

<definition_of_done>
  - [ ] `apps/api/src/agents/extraction-validator/sdk-validator.ts` exists and exports `SdkSemanticValidator` class
  - [ ] `SdkSemanticValidator` is `@Injectable()` with constructor DI
  - [ ] `SdkSemanticValidator.validate()` accepts `ParsedBankStatement` and `tenantId`, returns `Promise<SemanticValidationResult>`
  - [ ] PII sanitization implemented: account numbers masked (`******XXXX`), transactions sampled (max 20), descriptions truncated (max 80 chars)
  - [ ] Transaction sampling takes first 5, last 5, and 10 random from middle
  - [ ] `apps/api/src/agents/extraction-validator/validator-prompt.ts` exports system prompt and model config
  - [ ] System prompt checks for: document type, account consistency, description patterns, currency format, temporal patterns, duplicates, statement coherence
  - [ ] `apps/api/src/agents/extraction-validator/interfaces/sdk-validator.interface.ts` exports `SemanticValidationResult`, `SemanticIssue`, `SemanticIssueCode`, `SdkValidatorConfig`
  - [ ] `ValidationResult` interface in `validator.interface.ts` has `semanticValidation?: SemanticValidationResult` field added
  - [ ] `validator.agent.ts` constructor accepts optional `SdkSemanticValidator` dependency
  - [ ] Semantic check runs AFTER existing 5 checks, BEFORE final confidence determination
  - [ ] Semantic pass (isSemanticValid=true AND semanticConfidence>=70): confidence += 5
  - [ ] Semantic fail (isSemanticValid=false): confidence -= 10, semantic issues added to flags with `SEMANTIC_` prefix
  - [ ] Confidence clamped to `Math.max(0, Math.min(100, confidence))` after adjustment
  - [ ] LLM failure wrapped in try/catch -- validation proceeds without semantic check
  - [ ] `validator.module.ts` registers `SdkSemanticValidator` as a provider
  - [ ] Existing thresholds unchanged: AUTO_ACCEPT=90, REVIEW_REQUIRED=50, REJECT=50
  - [ ] Existing 5 numerical checks completely unchanged
  - [ ] `tests/agents/extraction-validator/sdk-validator.spec.ts` tests: semantic pass (+5), semantic fail (-10), wrong document type detection, OCR corruption detection, PII sanitization, transaction sampling, LLM failure graceful fallback
  - [ ] All existing extraction validator tests still pass (no regressions)
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
  - [ ] All monetary values in new code use integer cents (display formatting only in prompt building)
  - [ ] LLM calls routed through agentic-flow execution engine (not direct @anthropic-ai/claude-agent-sdk)
</definition_of_done>

<anti_patterns>
  - **NEVER** replace or modify the existing 5 numerical validation checks -- LLM semantic check is supplementary only
  - **NEVER** auto-reject based on LLM semantic check alone -- it only adjusts the score by +5/-10
  - **NEVER** change the AUTO_ACCEPT (90), REVIEW_REQUIRED (50), or REJECT (50) threshold values
  - **NEVER** send raw PII to the LLM -- always sanitize account numbers, mask sensitive data, sample transactions
  - **NEVER** send all 500 transactions to the LLM -- sample max 20 (first 5, last 5, 10 random middle)
  - **NEVER** use `npm` -- this project uses `pnpm` exclusively
  - **NEVER** use floats for monetary values in validation logic -- cents only (display formatting OK for prompts)
  - **NEVER** make `SdkSemanticValidator` a required dependency -- it must be optional so the system works without SDK config
  - **NEVER** modify `validateAndCorrect()` -- semantic check only applies to `validate()`
  - **NEVER** let the semantic confidence score exceed 100 or go below 0 -- always clamp
  - **NEVER** change the confidence point values for existing checks (40, 20, 15, 15, 10)
  - **NEVER** add the semantic check to the `BalanceReconciler` or `AmountSanityChecker` -- it is a separate step in the main `validate()` method
</anti_patterns>

</task_spec>
