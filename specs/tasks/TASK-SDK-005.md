<task_spec id="TASK-SDK-005" version="2.0">

<metadata>
  <title>SarsAgent SDK Enhancement (LLM Validation and Explanations)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>705</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-SARS</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The current `SarsAgent` (386 lines at `apps/api/src/agents/sars-agent/sars.agent.ts`) produces correct tax calculations using `PayeService`, `UifService`, `Emp201Service`, and `Vat201Service`. However, the reasoning strings are machine-generated templates that are technical and not human-friendly. For example:

  ```
  PAYE calculation: Gross R12,000.00, Annualized R144,000.00, Tax before rebates R1,234.56/month,
  Rebates R123.45/month, Medical credits R0.00, Net PAYE R1,111.11 (9.3% effective rate, bracket 2)
  ```

  Creche owners (who are not accountants) need simple explanations like: "This month, you need to pay R1,111.11 to SARS for employee income tax. This covers Mary's salary of R12,000. She falls in tax bracket 2, which means her income above R95,750 per year is taxed at 26%."

  The LLM layer adds value ONLY by generating human-readable explanations of what the numbers mean. It does NOT change any calculations. All calculations remain 100% rule-based.

  **CRITICAL INVARIANT: SARS Agent STAYS L2 ALWAYS.** The LLM does NOT make decisions -- it only explains. The `action` field is always `DRAFT_FOR_REVIEW`. The `requiresReview` field is always `true`.

  **SDK Approach:**
  LLM calls for generating explanations are routed through `agentic-flow`'s execution engine (v2.0.2-alpha), which provides multi-model routing across 100+ LLM providers. Claude Sonnet remains the default model for SARS explanations (nuanced language is required), but agentic-flow enables automatic fallback to alternative providers (e.g., Gemini) if the primary provider is unavailable. The `@anthropic-ai/claude-agent-sdk` is consumed transitively via agentic-flow -- no direct dependency is needed.

  Note: `ruvector` is not relevant to this task since the SARS explainer is a stateless explanation generator with no vector search requirements.

  **Gap Analysis:**
  - Reasoning strings are technical, not human-friendly (templates with formatted numbers)
  - No plain-English explanation of tax brackets, rebates, credits
  - No contextual advice (e.g., "This is typical for a creche with 3 employees")
  - No comparison to previous periods ("Your PAYE increased by R200 from last month because...")
  - Creche owners (not accountants) need simple explanations they can understand

  **Files to Create:**
  - `apps/api/src/agents/sars-agent/sdk-sars-explainer.ts` (LLM explanation generator class)
  - `apps/api/src/agents/sars-agent/sars-prompt.ts` (System prompt for tax explanations)
  - `apps/api/src/agents/sars-agent/interfaces/sdk-sars.interface.ts` (SDK-specific interfaces)
  - `tests/agents/sars-agent/sdk-sars-explainer.spec.ts` (Unit tests)

  **Files to Modify:**
  - `apps/api/src/agents/sars-agent/sars.agent.ts` (ADD explanation step after each calculation)
  - `apps/api/src/agents/sars-agent/sars.module.ts` (ADD SdkSarsExplainer to providers)
  - `apps/api/src/agents/sars-agent/interfaces/sars.interface.ts` (ADD `humanExplanation?: string` to SarsDecision)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add <pkg>`, etc.

  ### 2. Monetary Values in CENTS
  ALL monetary values are integers representing South African cents. NEVER use floats for money.
  ```typescript
  // CORRECT - converting cents for display in LLM prompt
  const grossRands = (dto.grossIncomeCents / 100).toFixed(2);
  const prompt = `Gross salary: R${grossRands}`;

  // WRONG
  const grossRands = dto.grossIncomeCents * 0.01; // Floating point imprecision
  ```

  ### 3. LLM Explains, NEVER Calculates
  The LLM receives ALREADY CALCULATED results and generates plain-English explanations. It NEVER performs tax calculations.
  ```typescript
  // CORRECT - calculation done, LLM explains the result
  async explain(type: SarsType, calculationResult: SarsBreakdown, dto: AgentPayeDto): Promise<string> {
    const prompt = this.buildExplainerPrompt(type, calculationResult, dto);
    const explanation = await this.callLlm(prompt);
    return explanation; // Human-readable text
  }

  // WRONG - LLM doing calculations
  async calculateAndExplain(dto: AgentPayeDto): Promise<{ amount: number; explanation: string }> {
    // NEVER let LLM calculate tax amounts
  }
  ```

  ### 4. SARS Always L2 -- NEVER Change Autonomy Level
  ```typescript
  // The SarsDecision interface enforces this:
  export interface SarsDecision {
    type: 'PAYE' | 'UIF' | 'EMP201' | 'VAT201';
    action: 'DRAFT_FOR_REVIEW';    // ALWAYS this value -- never 'AUTO_APPLY'
    requiresReview: true;           // ALWAYS true -- never false
    // ...
    humanExplanation?: string;      // NEW: optional LLM-generated explanation
  }
  ```

  ### 5. SDK Agent Definition for SARS Explanations (via agentic-flow)
  ```typescript
  // In sars-prompt.ts
  export const SARS_EXPLAINER_SYSTEM_PROMPT = `You are a friendly South African tax advisor explaining calculations to a creche owner who is NOT an accountant.

Given tax calculation results, generate a clear, simple explanation.

RULES:
- Use plain English, avoid jargon
- Explain what each line item means in practical terms
- For PAYE: explain the tax bracket, rebates, and what the employer must pay
- For UIF: explain employer vs employee contributions
- For EMP201: summarize what's owed to SARS this month and the deadline
- For VAT201: explain output vs input VAT, and whether a refund or payment is due
- Mention Section 12(h) exemption where relevant (education services often exempt from VAT)
- Keep explanations under 200 words
- Never suggest tax avoidance strategies
- Never give specific financial advice beyond explaining the calculation
- Always remind that a professional accountant should review
- Format amounts as "R1,234.56" (South African Rand)

RESPONSE FORMAT: Plain text paragraph(s). No JSON. No markdown. Just clear English.`;

  // Model selection via agentic-flow's multi-model routing:
  // Primary: Claude Sonnet (nuanced language needed for explanations)
  // Fallback: Gemini (via agentic-flow provider routing if Claude is unavailable)
  export const SARS_EXPLAINER_MODEL = 'sonnet';
  ```

  ### 6. Integration Into Existing Flow (Extend, Do Not Replace)
  The human explanation is added AFTER the existing calculation and reasoning, as an optional enhancement.
  ```typescript
  async calculatePayeForReview(dto: AgentPayeDto): Promise<SarsDecision> {
    // EXISTING: calculate using rule-based services (UNCHANGED)
    const result = await this.payeService.calculatePaye({...});
    const reasoning = this.buildPayeReasoning(...); // Keep technical reasoning

    // NEW: generate human-friendly explanation via LLM (optional, non-blocking)
    let humanExplanation: string | undefined;
    try {
      humanExplanation = await this.sdkExplainer.explain('PAYE', {
        grossAmountCents: dto.grossIncomeCents,
        taxBeforeRebatesCents: result.taxBeforeRebatesCents,
        totalRebatesCents: result.totalRebatesCents,
        medicalCreditsCents: result.medicalCreditsCents,
        payeCents: result.netPayeCents,
      }, dto);
    } catch (error) {
      this.logger.warn(`SDK explainer failed for PAYE: ${error.message}`);
      // Non-critical -- decision is still valid without explanation
    }

    return {
      ...decision,
      reasoning,            // Technical (existing, unchanged)
      humanExplanation,     // Plain English (new, optional)
    };
  }
  ```

  ### 7. NestJS Injectable Pattern
  ```typescript
  @Injectable()
  export class SdkSarsExplainer {
    private readonly logger = new Logger(SdkSarsExplainer.name);

    constructor(
      // SDK client injected via DI
    ) {}

    async explain(
      type: SarsDecision['type'],
      breakdown: SarsBreakdown,
      context: { tenantId: string; period: string },
    ): Promise<string> {
      // Build prompt, call LLM, return explanation string
    }
  }
  ```

  ### 8. Graceful Fallback -- Explanation Is Optional
  If the LLM call fails, the SarsDecision is still valid. The `humanExplanation` field simply remains `undefined`.
  ```typescript
  // The decision object is fully valid without humanExplanation
  const decision: SarsDecision = {
    type: 'PAYE',
    action: 'DRAFT_FOR_REVIEW',
    tenantId,
    period,
    calculatedAmountCents: result.netPayeCents,
    requiresReview: true,
    reasoning,               // Always present (template-based)
    humanExplanation,        // May be undefined if LLM fails
    breakdown: { ... },
  };
  ```

  ### 9. Tenant Isolation
  The explainer receives `tenantId` for logging purposes but does NOT query tenant-specific data. It only explains calculation results that were already computed with proper tenant isolation.
  ```typescript
  async explain(type: SarsType, breakdown: SarsBreakdown, context: { tenantId: string; period: string }): Promise<string> {
    // tenantId used for logging only -- no DB queries in explainer
    this.logger.log(`Generating ${type} explanation for tenant ${context.tenantId} period ${context.period}`);
  }
  ```

  ### 10. Decimal.js for Display Formatting
  When converting cents to rands for LLM prompt context, use consistent formatting:
  ```typescript
  import Decimal from 'decimal.js';

  function centsToRandString(cents: number): string {
    return new Decimal(cents).dividedBy(100).toFixed(2);
  }

  // Use in prompt building:
  const grossDisplay = `R${centsToRandString(breakdown.grossAmountCents)}`;
  ```
</critical_patterns>

<context>
  ## Business Context

  The SARS Agent handles South African tax compliance for creches:

  | Tax Type | Description | Frequency | Key Rules |
  |----------|-------------|-----------|-----------|
  | PAYE | Employee income tax | Monthly | 7 tax brackets, age-based rebates, medical credits |
  | UIF | Unemployment Insurance Fund | Monthly | 1% employee + 1% employer, capped at R177.12/month each |
  | SDL | Skills Development Levy | Monthly | 1% of total payroll (creches often exempt if payroll < R500k/yr) |
  | EMP201 | Monthly Employer Return | Monthly | Aggregates PAYE + UIF + SDL for all employees |
  | VAT201 | Bi-monthly VAT Return | Bi-monthly | Output VAT - Input VAT; education services often exempt (Section 12(h)) |

  ## Existing Agent Architecture

  The `SarsAgent` constructor receives 5 dependencies:
  ```typescript
  constructor(
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
    private readonly emp201Service: Emp201Service,
    private readonly vat201Service: Vat201Service,
    private readonly decisionLogger: SarsDecisionLogger,
  )
  ```

  It has 4 public methods, each returning `SarsDecision`:
  1. `calculatePayeForReview(dto: AgentPayeDto)`
  2. `calculateUifForReview(dto: AgentUifDto)`
  3. `generateEmp201ForReview(dto: AgentEmp201Dto)`
  4. `generateVat201ForReview(dto: AgentVat201Dto)`

  Each method follows the same pattern:
  1. Call underlying service for calculation
  2. Build template-based reasoning string
  3. Create `SarsDecision` with `action: 'DRAFT_FOR_REVIEW'`
  4. Log decision and escalation
  5. Return decision

  ## Key Files Reference

  | File | Lines | Purpose |
  |------|-------|---------|
  | `apps/api/src/agents/sars-agent/sars.agent.ts` | 386 | Main agent with 4 calculation methods |
  | `apps/api/src/agents/sars-agent/sars.module.ts` | 21 | NestJS module (DatabaseModule import, agent + logger + validator) |
  | `apps/api/src/agents/sars-agent/decision-logger.ts` | 118 | JSONL decision and escalation logging |
  | `apps/api/src/agents/sars-agent/context-validator.ts` | -- | Validates input context for SARS calculations |
  | `apps/api/src/agents/sars-agent/interfaces/sars.interface.ts` | 107 | SarsDecision, DTOs, log interfaces |

  ## SA Tax Context for Prompts

  The system prompt should include awareness of:
  - **PAYE tax brackets (2025):** 0-237,100 at 18%; 237,101-370,500 at 26%; etc.
  - **Rebates:** Primary R17,235; Secondary (65+) R9,444; Tertiary (75+) R3,145
  - **Medical credits:** R364/month for main member + first dependant; R246/month for additional dependants
  - **UIF cap:** R177.12/month per person (employee + employer)
  - **Section 12(h):** Educational services are exempt from VAT (relevant for creche fee invoicing)
</context>

<scope>
  <in_scope>
    - Create `SdkSarsExplainer` class that generates human-readable explanations from calculation results
    - Create `sars-prompt.ts` with system prompt and model configuration for the explainer
    - Create `interfaces/sdk-sars.interface.ts` with `SarsExplainerConfig` and `ExplanationContext` types
    - Modify `SarsDecision` interface to add optional `humanExplanation?: string` field
    - Modify `sars.agent.ts` to call `SdkSarsExplainer.explain()` after each calculation method
    - Modify `sars.module.ts` to register `SdkSarsExplainer` as a provider
    - All 4 methods (PAYE, UIF, EMP201, VAT201) enhanced with human explanations
    - Graceful fallback: if LLM fails, decision is still returned without explanation
    - Unit tests for `SdkSarsExplainer` (mock LLM, test all 4 tax types, test fallback)
    - agentic-flow multi-model routing for explanation generation (Claude Sonnet primary, Gemini fallback)
  </in_scope>
  <out_of_scope>
    - Changing ANY calculation logic (stays 100% rule-based via PayeService, UifService, etc.)
    - Changing L2 autonomy level (ALWAYS DRAFT_FOR_REVIEW, ALWAYS requiresReview: true)
    - Tax advice or optimization suggestions in explanations
    - Real-time SARS eFiling API integration
    - Modifying DecisionLogger format (explanations stored in SarsDecision, not separate logs)
    - Historical explanation generation for past calculations
    - Frontend UI for displaying explanations
    - Multi-language support (English only for now)
    - ruvector integration (not needed for stateless explanation-only agent)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
pnpm run build

# 2. Linting
pnpm run lint

# 3. Run SARS agent tests (existing + new)
pnpm test -- --testPathPatterns="sars-agent" --verbose

# 4. Verify new files exist
ls -la apps/api/src/agents/sars-agent/sdk-sars-explainer.ts
ls -la apps/api/src/agents/sars-agent/sars-prompt.ts
ls -la apps/api/src/agents/sars-agent/interfaces/sdk-sars.interface.ts
ls -la tests/agents/sars-agent/sdk-sars-explainer.spec.ts

# 5. Verify SarsDecision interface has humanExplanation field
grep -n "humanExplanation" apps/api/src/agents/sars-agent/interfaces/sars.interface.ts

# 6. Verify agent calls explainer in all 4 methods
grep -n "sdkExplainer\|humanExplanation" apps/api/src/agents/sars-agent/sars.agent.ts

# 7. Verify module registers SdkSarsExplainer
grep -n "SdkSarsExplainer" apps/api/src/agents/sars-agent/sars.module.ts

# 8. Verify L2 autonomy is preserved (action is always DRAFT_FOR_REVIEW)
grep -n "AUTO_APPLY\|AUTO_SUBMIT\|action:" apps/api/src/agents/sars-agent/sars.agent.ts

# 9. Run full test suite to check no regressions
pnpm test -- --verbose 2>&1 | tail -20
```
</verification_commands>

<definition_of_done>
  - [ ] `apps/api/src/agents/sars-agent/sdk-sars-explainer.ts` exists and exports `SdkSarsExplainer` class
  - [ ] `SdkSarsExplainer` is `@Injectable()` with constructor DI
  - [ ] `SdkSarsExplainer.explain()` accepts tax type, breakdown, and context; returns `Promise<string>`
  - [ ] `apps/api/src/agents/sars-agent/sars-prompt.ts` exports system prompt and model config
  - [ ] System prompt explicitly instructs: no tax avoidance advice, under 200 words, plain English, mention accountant review
  - [ ] `apps/api/src/agents/sars-agent/interfaces/sdk-sars.interface.ts` exports `SarsExplainerConfig` and `ExplanationContext`
  - [ ] `SarsDecision` interface in `sars.interface.ts` has `humanExplanation?: string` field added
  - [ ] `sars.agent.ts` constructor accepts optional `SdkSarsExplainer` dependency
  - [ ] All 4 methods (`calculatePayeForReview`, `calculateUifForReview`, `generateEmp201ForReview`, `generateVat201ForReview`) call explainer after calculation
  - [ ] Each method wraps explainer call in try/catch -- failure does NOT break the method
  - [ ] `humanExplanation` is `undefined` (not empty string) when explainer fails or is not available
  - [ ] `sars.module.ts` registers `SdkSarsExplainer` as a provider
  - [ ] `action` is ALWAYS `'DRAFT_FOR_REVIEW'` in all code paths (verify no `AUTO_APPLY` or `AUTO_SUBMIT`)
  - [ ] `requiresReview` is ALWAYS `true` in all code paths
  - [ ] `tests/agents/sars-agent/sdk-sars-explainer.spec.ts` tests: PAYE explanation, UIF explanation, EMP201 explanation, VAT201 explanation, LLM failure returns undefined
  - [ ] All existing SARS agent tests still pass (no regressions)
  - [ ] No calculation logic is changed or duplicated
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
  - [ ] All monetary values in new code use integer cents (display formatting only in prompt building)
  - [ ] LLM calls routed through agentic-flow execution engine (not direct @anthropic-ai/claude-agent-sdk)
</definition_of_done>

<anti_patterns>
  - **NEVER** change ANY calculation logic -- the LLM explains, it never calculates
  - **NEVER** change the autonomy level -- SARS is ALWAYS L2 (DRAFT_FOR_REVIEW, requiresReview: true)
  - **NEVER** suggest tax avoidance or optimization in LLM prompts or explanations
  - **NEVER** make `humanExplanation` a required field -- it must be optional (`?`)
  - **NEVER** block the calculation on the LLM call -- wrap in try/catch, return decision even if explanation fails
  - **NEVER** use `npm` -- this project uses `pnpm` exclusively
  - **NEVER** use floats for monetary values in calculations -- cents only (display formatting is OK for prompts)
  - **NEVER** send raw PII to the LLM -- only send aggregated calculation results, not employee names or IDs
  - **NEVER** log the human explanation separately -- it is part of the SarsDecision object
  - **NEVER** make `SdkSarsExplainer` a required dependency -- it must be optional so the system works without SDK config
  - **NEVER** change the `buildPayeReasoning()` private method or its output -- the technical reasoning is kept alongside the human explanation
  - **NEVER** use multi-model routing to route SARS explanations to low-quality models -- explanations must be accurate and use sonnet-class or better
</anti_patterns>

</task_spec>
