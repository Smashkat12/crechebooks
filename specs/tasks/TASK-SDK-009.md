<task_spec id="TASK-SDK-009" version="2.0">

<metadata>
  <title>Hybrid Scoring System (LLM + Heuristic Fallback with Accuracy Tracking)</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>integration</layer>
  <sequence>709</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-HYBRID</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-003</task_ref>
    <task_ref status="ready">TASK-SDK-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  With the SDK migration, agents now have two scoring paths: LLM inference (via SDK) and rule-based heuristics (existing code). There is no unified system to:
  1. Combine LLM confidence with heuristic confidence using configurable weights
  2. Track which path (LLM vs heuristic) is more accurate over time per tenant
  3. Route to the more accurate path based on historical data
  4. Provide graceful fallback when LLM is unavailable (API down, rate limited, budget exhausted)
  5. Store accuracy metrics for A/B comparison during the gradual rollout period

  The analysis specifies: "LLM inference as primary, rule-based scoring as fallback, memory stores which path was more accurate over time."

  **Architecture Decision -- agentic-flow SONA Integration:**
  Instead of building custom `HybridScorer`, `AccuracyTracker`, and `ScoringRouter` from scratch with manual weight management, this task leverages **agentic-flow's SONA** (Self-Optimizing Neural Architecture) for adaptive scoring that learns optimal weights automatically based on observed accuracy. Key changes:
  - **SONA replaces custom weight management**: Instead of hardcoded 60/40 default weights and manual LLM_PRIMARY/HEURISTIC_PRIMARY/HYBRID modes, SONA self-optimizes weights based on correction feedback over time.
  - **agentic-flow AgentDB replaces custom AccuracyTracker internals**: AgentDB provides 6 cognitive memory patterns that replace the custom Prisma-query-based accuracy tracking with richer cognitive models.
  - **agentic-flow multi-model routing replaces manual ScoringRouter**: Instead of manually mapping paths to weight presets, multi-model routing auto-selects the optimal scoring model.
  - **ruvector provides embedding-based pattern similarity**: For accuracy comparison, ruvector HNSW embeddings enable semantic pattern matching (e.g., similar transaction descriptions produce similar accuracy profiles).
  - **Dual-write pattern (SONA + Prisma)**: SONA learns and optimizes scoring weights, while Prisma `AgentAccuracyRecord` remains as the compliance/audit layer required for SA financial regulations. Every accuracy outcome is written to both systems.

  **Gap Analysis:**
  - No unified confidence scoring across LLM and heuristic paths
  - No accuracy tracking per scoring path per agent type
  - No A/B comparison capability between paths
  - No automatic path selection based on accuracy history
  - No graceful degradation metrics (how often does LLM fail?)
  - Current `ConfidenceScorer` (136 lines) only implements the heuristic path
  - Current `PaymentMatcherAgent` calculates confidence inline (reference + amount + name scoring)
  - No feedback loop from human corrections to accuracy tracking
  - No semantic similarity for comparing accuracy across similar inputs (only exact matches)

  **Key Files to Understand:**
  - `apps/api/src/agents/transaction-categorizer/confidence-scorer.ts` (136 lines) - Current heuristic confidence scorer
    - Uses weighted formula: pattern (60pts) + historical (30pts) + typical amount (10pts) + description quality (10pts)
    - Auto-apply threshold: 80%
    - Returns 0-100 integer score
  - `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` (325 lines) - Uses ConfidenceScorer, returns `CategorizationResult` with `confidenceScore`, `autoApplied`, `source` (PATTERN|HISTORICAL|FALLBACK)
  - `apps/api/src/agents/payment-matcher/matcher.agent.ts` (428 lines) - Inline confidence scoring (reference 0-40pts + amount 0-40pts + name 0-20pts), auto-apply at 80%
  - `apps/api/src/agents/transaction-categorizer/interfaces/categorizer.interface.ts` - `ConfidenceInput`, `CategorizationResult`
  - `apps/api/src/agents/payment-matcher/interfaces/matcher.interface.ts` - `MatchDecision`, `InvoiceCandidate`
  - `apps/api/src/database/services/accuracy-metrics.service.ts` - Existing accuracy metrics service (may be usable for storage)

  **Files to Create:**
  - `apps/api/src/agents/shared/hybrid-scorer.ts` - Unified scoring engine wrapping agentic-flow SONA for adaptive weight optimization (replaces custom weight management)
  - `apps/api/src/agents/shared/accuracy-tracker.ts` - Wraps agentic-flow AgentDB cognitive tracking with Prisma dual-write for compliance audit trail
  - `apps/api/src/agents/shared/scoring-router.ts` - Wraps agentic-flow multi-model routing for automatic path selection (replaces manual path-to-weight mapping)
  - `apps/api/src/agents/shared/interfaces/hybrid-scoring.interface.ts` - Shared interfaces
  - `tests/agents/shared/hybrid-scorer.spec.ts` - HybridScorer unit tests
  - `tests/agents/shared/accuracy-tracker.spec.ts` - AccuracyTracker unit tests
  - `tests/agents/shared/scoring-router.spec.ts` - ScoringRouter unit tests

  **Files to Modify:**
  - `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` - Integrate HybridScorer alongside existing ConfidenceScorer
  - `apps/api/src/agents/payment-matcher/matcher.agent.ts` - Integrate HybridScorer alongside existing inline scoring
  - `apps/api/src/agents/transaction-categorizer/categorizer.module.ts` - Add shared providers
  - `apps/api/src/agents/payment-matcher/matcher.module.ts` - Add shared providers
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add`, etc.

  ### 2. Monetary Values in CENTS
  ALL monetary values are integers representing cents. This also applies to any financial amounts stored in accuracy records.
  ```typescript
  // CORRECT
  const amountCents: number = 15000; // R150.00

  // WRONG - NEVER floats for money
  const amount: number = 150.00;
  ```

  ### 3. HybridScorer -- SONA-Backed Adaptive Scoring
  Instead of custom weight management (hardcoded 60/40 default), the HybridScorer wraps agentic-flow's
  SONA (Self-Optimizing Neural Architecture) which self-optimizes weights based on observed accuracy.
  ```typescript
  import { SONAScorer } from 'agentic-flow';

  @Injectable()
  export class HybridScorer {
    constructor(
      private readonly sonaScorer: SONAScorer, // agentic-flow SONA for adaptive weight optimization
      private readonly prisma: PrismaService,  // Prisma for audit/compliance dual-write
    ) {}

    /**
     * Combine LLM and heuristic confidence scores using SONA-optimized weights.
     * SONA learns optimal weights over time from correction feedback.
     * If LLM is unavailable (null), falls back to heuristic-only.
     * Safety: SONA weights are clamped -- heuristic never goes below 20% for financial operations.
     *
     * @param llmConfidence - LLM confidence (0-100) or null if unavailable
     * @param heuristicConfidence - Heuristic confidence (0-100)
     * @param context - Tenant and agent context for SONA weight lookup
     * @returns HybridScore with combined score, source label, and LLM availability flag
     */
    async combine(
      llmConfidence: number | null,
      heuristicConfidence: number,
      context: { tenantId: string; agentType: 'categorizer' | 'matcher' },
    ): Promise<HybridScore> {
      if (llmConfidence === null) {
        return {
          score: heuristicConfidence,
          source: 'HEURISTIC_ONLY',
          llmAvailable: false,
          llmScore: null,
          heuristicScore: heuristicConfidence,
        };
      }

      // Get SONA-optimized weights (falls back to 60/40 if insufficient data)
      const sonaWeights = await this.sonaScorer.getOptimalWeights(context);
      const weights: ScoringWeights = {
        llm: sonaWeights?.llm ?? 0.6,
        heuristic: Math.max(sonaWeights?.heuristic ?? 0.4, 0.2), // Safety: min 20% heuristic
      };

      // Normalize weights to sum to 1.0
      const weightSum = weights.llm + weights.heuristic;
      weights.llm = weights.llm / weightSum;
      weights.heuristic = weights.heuristic / weightSum;

      const combined = llmConfidence * weights.llm + heuristicConfidence * weights.heuristic;
      return {
        score: Math.round(combined),
        source: 'HYBRID',
        llmAvailable: true,
        llmScore: llmConfidence,
        heuristicScore: heuristicConfidence,
        sonaWeights: weights, // Expose SONA-selected weights for observability
      };
    }
  }
  ```

  ### 4. AccuracyTracker -- AgentDB Cognitive Tracking with Prisma Dual-Write
  Instead of custom Prisma-only accuracy tracking, the AccuracyTracker wraps agentic-flow's AgentDB
  (6 cognitive memory patterns) for richer learning, while maintaining Prisma dual-write for compliance.
  ```typescript
  import { AgentDB } from 'agentic-flow';

  @Injectable()
  export class AccuracyTracker {
    constructor(
      private readonly agentDB: AgentDB,       // agentic-flow cognitive tracking
      private readonly prisma: PrismaService,   // Prisma compliance dual-write
    ) {}

    /**
     * Record the outcome of a scoring decision.
     * DUAL-WRITE: AgentDB learns from the outcome + Prisma stores for audit compliance.
     * Called when a human corrects (overrides) an auto-applied result.
     *
     * PRIVACY: Only stores agent type + outcome codes, NOT PII.
     */
    async recordOutcome(params: AccuracyOutcome): Promise<void> {
      const outcomeData = {
        tenantId: params.tenantId,
        agentType: params.agentType,
        llmPrediction: params.llmPrediction,
        heuristicPrediction: params.heuristicPrediction,
        actualOutcome: params.actualOutcome,
        llmConfidence: params.llmConfidence,
        heuristicConfidence: params.heuristicConfidence,
        llmCorrect: params.llmPrediction === params.actualOutcome,
        heuristicCorrect: params.heuristicPrediction === params.actualOutcome,
        scoringPath: params.scoringPath,
        createdAt: new Date(),
      };

      // Dual-write: AgentDB (learning) + Prisma (compliance)
      await Promise.all([
        this.agentDB.recordAccuracyOutcome(outcomeData),  // Feeds SONA weight optimization
        this.prisma.agentAccuracyRecord.create({ data: outcomeData }), // Compliance audit trail
      ]);
    }

    /**
     * Get accuracy statistics for a tenant + agent type combination.
     * Uses AgentDB cognitive memory for enriched statistics while
     * falling back to Prisma for raw record queries.
     * Returns accuracy percentages and a recommendation.
     */
    async getAccuracy(
      tenantId: string,
      agentType: 'categorizer' | 'matcher',
    ): Promise<AccuracyStats> {
      // AgentDB provides enriched cognitive accuracy analysis
      const cognitiveStats = await this.agentDB.getAccuracyStats(tenantId, agentType);
      if (cognitiveStats && cognitiveStats.sampleSize > 0) {
        return cognitiveStats;
      }

      // Fallback to Prisma for raw accuracy calculation (last 200 records, recency bias)
      const records = await this.prisma.agentAccuracyRecord.findMany({
        where: { tenantId, agentType },
        orderBy: { createdAt: 'desc' },
        take: 200, // Last 200 outcomes for recency bias
      });

      const sampleSize = records.length;
      if (sampleSize === 0) {
        return {
          llmAccuracy: 0,
          heuristicAccuracy: 0,
          sampleSize: 0,
          recommendation: 'HYBRID', // Not enough data
        };
      }

      const llmCorrect = records.filter(r => r.llmCorrect).length;
      const heuristicCorrect = records.filter(r => r.heuristicCorrect).length;

      const llmAccuracy = Math.round((llmCorrect / sampleSize) * 100);
      const heuristicAccuracy = Math.round((heuristicCorrect / sampleSize) * 100);

      let recommendation: ScoringPathRecommendation;
      if (sampleSize < 50) {
        recommendation = 'HYBRID'; // Not enough data to decide
      } else if (llmAccuracy > heuristicAccuracy + 5) {
        recommendation = 'LLM_PRIMARY';
      } else if (heuristicAccuracy > llmAccuracy + 5) {
        recommendation = 'HEURISTIC_PRIMARY';
      } else {
        recommendation = 'HYBRID'; // Within 5% -- use both
      }

      return { llmAccuracy, heuristicAccuracy, sampleSize, recommendation };
    }
  }
  ```

  ### 5. ScoringRouter -- Multi-Model Routing via agentic-flow
  Instead of manually mapping LLM_PRIMARY/HEURISTIC_PRIMARY/HYBRID to hardcoded weight presets,
  the ScoringRouter wraps agentic-flow's multi-model routing which auto-selects the optimal model.
  ```typescript
  import { MultiModelRouter } from 'agentic-flow';

  @Injectable()
  export class ScoringRouter {
    constructor(
      private readonly multiModelRouter: MultiModelRouter, // agentic-flow auto-routing
      private readonly tracker: AccuracyTracker,            // Accuracy data for routing decisions
    ) {}

    /**
     * Determine the preferred scoring path for a tenant + agent type.
     * Uses agentic-flow multi-model routing which considers accuracy history,
     * model availability, cost, and latency to select the optimal path.
     */
    async getPreferredPath(
      tenantId: string,
      agentType: 'categorizer' | 'matcher',
    ): Promise<ScoringPath> {
      // Multi-model router auto-selects based on learned performance
      const routedPath = await this.multiModelRouter.selectPath({ tenantId, agentType });
      if (routedPath) {
        return routedPath as ScoringPath;
      }

      // Fallback to accuracy-based recommendation
      const accuracy = await this.tracker.getAccuracy(tenantId, agentType);
      return accuracy.recommendation;
    }

    /**
     * Get scoring weights based on the preferred path.
     * When SONA is active, weights are dynamically optimized.
     * These static weights serve as fallback defaults.
     * LLM_PRIMARY: 80/20 LLM-heavy
     * HEURISTIC_PRIMARY: 20/80 heuristic-heavy (heuristic always >= 20%)
     * HYBRID: 60/40 default blend
     */
    getWeightsForPath(path: ScoringPath): ScoringWeights {
      switch (path) {
        case 'LLM_PRIMARY':
          return { llm: 0.8, heuristic: 0.2 };
        case 'HEURISTIC_PRIMARY':
          return { llm: 0.2, heuristic: 0.8 };
        case 'HYBRID':
        default:
          return { llm: 0.6, heuristic: 0.4 };
      }
    }
  }
  ```

  ### 5a. ruvector Embedding-Based Pattern Similarity for Accuracy
  Use ruvector HNSW embeddings to find semantically similar accuracy patterns across inputs.
  ```typescript
  import { RuvectorService } from '../shared/ruvector.service';

  // Within AccuracyTracker or as a helper:
  // Instead of only comparing exact agent type + tenant,
  // ruvector enables finding accuracy patterns for similar transaction types.
  async getAccuracyForSimilarInputs(
    tenantId: string,
    agentType: 'categorizer' | 'matcher',
    inputDescription: string,
  ): Promise<AccuracyStats[]> {
    // ruvector HNSW search: 384d MiniLM-L6-v2 embeddings, <0.5ms latency
    const similarPatterns = await this.ruvectorService.searchSimilar(
      'accuracy_patterns',
      inputDescription,
      { tenantId, agentType, topK: 10 },
    );
    return similarPatterns.map(p => p.accuracyStats);
  }
  ```

  ### 6. Integration with TransactionCategorizerAgent
  The categorizer already uses `ConfidenceScorer` (the heuristic path). The HybridScorer wraps this.
  ```typescript
  // In categorizer.agent.ts - ADD alongside existing flow
  async categorize(transaction: Transaction, tenantId: string): Promise<CategorizationResult> {
    // Existing heuristic confidence calculation (unchanged)
    const heuristicConfidence = this.confidenceScorer.calculate(confidenceInput);

    // NEW: Get LLM confidence if SDK is available
    let llmConfidence: number | null = null;
    if (this.sdkCategorizerAgent) {
      try {
        const llmResult = await this.sdkCategorizerAgent.categorize(transaction, tenantId);
        llmConfidence = llmResult.confidenceScore;
      } catch {
        llmConfidence = null; // SDK unavailable, fallback to heuristic
      }
    }

    // NEW: Combine scores using HybridScorer
    const preferredPath = await this.scoringRouter.getPreferredPath(tenantId, 'categorizer');
    const weights = this.scoringRouter.getWeightsForPath(preferredPath);
    const hybridScore = this.hybridScorer.combine(llmConfidence, heuristicConfidence, weights);

    // Use hybrid score for auto-apply decision
    const meetsThreshold = hybridScore.score >= context.autoApplyThreshold;
    // ... rest of categorization logic uses hybridScore.score instead of heuristicConfidence
  }
  ```

  ### 7. Integration with PaymentMatcherAgent
  The matcher does inline confidence scoring. HybridScorer adds an LLM layer on top.
  ```typescript
  // In matcher.agent.ts - ADD alongside existing flow
  async makeMatchDecision(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
  ): Promise<MatchDecision> {
    // Existing inline scoring produces heuristic confidence per candidate
    // NEW: If SDK available, get LLM confidence for the best candidate
    // Combine using HybridScorer for the final decision
  }
  ```

  ### 8. Human Correction Feedback Loop
  When a user overrides an auto-applied categorization or payment match, the correction feeds into AccuracyTracker.
  ```typescript
  // This is called from the existing correction/override service
  async onHumanCorrection(params: {
    tenantId: string;
    agentType: 'categorizer' | 'matcher';
    originalPrediction: string; // What the agent decided
    correctedOutcome: string;  // What the human changed it to
    llmPrediction: string | null;
    heuristicPrediction: string;
    llmConfidence: number | null;
    heuristicConfidence: number;
    scoringPath: ScoringPath;
  }): Promise<void> {
    await this.accuracyTracker.recordOutcome({
      tenantId: params.tenantId,
      agentType: params.agentType,
      llmPrediction: params.llmPrediction ?? params.heuristicPrediction,
      heuristicPrediction: params.heuristicPrediction,
      actualOutcome: params.correctedOutcome,
      llmConfidence: params.llmConfidence ?? 0,
      heuristicConfidence: params.heuristicConfidence,
      scoringPath: params.scoringPath,
    });
  }
  ```

  ### 9. Prisma Model for Accuracy Records
  NOTE: If a Prisma migration is out of scope, use a JSON-file-based storage as interim (similar to how EscalationManager uses `.claude/logs/escalations.jsonl`). But the preferred approach is a proper Prisma model.
  ```prisma
  model AgentAccuracyRecord {
    id                   String   @id @default(uuid())
    tenantId             String   @map("tenant_id")
    agentType            String   @map("agent_type") // 'categorizer' | 'matcher'
    llmPrediction        String   @map("llm_prediction")
    heuristicPrediction  String   @map("heuristic_prediction")
    actualOutcome        String   @map("actual_outcome")
    llmConfidence        Int      @map("llm_confidence")
    heuristicConfidence  Int      @map("heuristic_confidence")
    llmCorrect           Boolean  @map("llm_correct")
    heuristicCorrect     Boolean  @map("heuristic_correct")
    scoringPath          String   @map("scoring_path") // 'LLM_PRIMARY' | 'HEURISTIC_PRIMARY' | 'HYBRID'
    createdAt            DateTime @default(now()) @map("created_at")

    @@index([tenantId, agentType])
    @@map("agent_accuracy_records")
  }
  ```

  ### 10. NestJS Injectable Pattern
  All new classes must be `@Injectable()`.
  ```typescript
  @Injectable()
  export class HybridScorer { /* ... */ }

  @Injectable()
  export class AccuracyTracker {
    constructor(private readonly prisma: PrismaService) {}
  }

  @Injectable()
  export class ScoringRouter {
    constructor(private readonly tracker: AccuracyTracker) {}
  }
  ```
</critical_patterns>

<context>
  ## Business Context

  The gradual rollout strategy from the SDK migration analysis states: "Run LLM path alongside existing path, compare accuracy before switching." This Hybrid Scoring System enables that strategy by:

  1. **Running both paths** -- LLM inference and heuristic scoring execute in parallel (or LLM-only with heuristic fallback).
  2. **Combining results** -- Configurable weights blend LLM and heuristic confidence into a single score.
  3. **Tracking accuracy** -- When humans correct auto-applied decisions, both paths' predictions are compared against the actual outcome.
  4. **Auto-routing** -- After collecting sufficient data (50+ samples), the system automatically routes to the more accurate path.
  5. **Graceful degradation** -- When LLM is unavailable, seamlessly falls back to heuristic-only scoring with no user impact.

  ### How Human Corrections Feed Back

  The existing codebase has correction flows:
  - **Transaction categorization**: User can override the auto-applied account code in the UI. The `PatternLearningService` at `apps/api/src/database/services/pattern-learning.service.ts` already learns from corrections.
  - **Payment matching**: User can override an auto-applied payment match. The match decision log records the original decision.

  This task adds AccuracyTracker as an additional listener on these correction events.

  ### Current Confidence Scoring

  **TransactionCategorizerAgent** uses `ConfidenceScorer`:
  - Pattern match weight: 0.6 (max 60 points)
  - Historical match: 25 base + 1/additional (max 30 points)
  - Typical amount: 10 points
  - Description quality: 0-10 points
  - Auto-apply threshold: 80%

  **PaymentMatcherAgent** uses inline scoring:
  - Reference match: 0-40 points (exact=40, contains=30, suffix=15)
  - Amount match: 0-40 points (exact=40, 1%=35, 5%=25, 10%=15, partial=10)
  - Name similarity: 0-20 points (Levenshtein distance)
  - Auto-apply threshold: 80% (single high-confidence match)
  - Candidate threshold: 20% (minimum to include)

  ### Accuracy Tracking Schema Note
  The system needs a database table to store accuracy records. If a full Prisma migration is not feasible in this task, an alternative is to use a JSONL file-based storage (consistent with how `EscalationManager` works at `apps/api/src/agents/orchestrator/escalation-manager.ts`). The preferred approach is a Prisma model, but implement whichever is pragmatic. Document the choice.
</context>

<scope>
  <in_scope>
    - `HybridScorer` class wrapping agentic-flow SONA for adaptive weight optimization with LLM fallback to heuristic
    - `AccuracyTracker` class wrapping agentic-flow AgentDB cognitive tracking with Prisma dual-write for compliance
    - `ScoringRouter` class wrapping agentic-flow multi-model routing for automatic path selection
    - Dual-write pattern: every accuracy outcome written to both AgentDB (SONA learning) and Prisma (compliance audit)
    - ruvector embedding-based pattern similarity for accuracy comparison across semantically similar inputs
    - Shared interfaces for hybrid scoring types (including SONA weight types)
    - Integration with `TransactionCategorizerAgent` -- use HybridScorer alongside existing ConfidenceScorer
    - Integration with `PaymentMatcherAgent` -- use HybridScorer alongside existing inline scoring
    - Human correction feedback loop (record outcomes when user overrides auto-applied decisions)
    - Accuracy statistics: per-path accuracy percentages, sample size, recommendation
    - Minimum sample size enforcement (50 records before switching from HYBRID to single-path)
    - 5% accuracy margin before recommending path switch
    - Unit tests for HybridScorer (SONA integration, null LLM handling, score combination, min heuristic weight enforcement)
    - Unit tests for AccuracyTracker (dual-write verification, AgentDB cognitive tracking, Prisma fallback, recommendation logic)
    - Unit tests for ScoringRouter (multi-model routing, fallback path selection, weight mapping)
    - All tests at 90%+ coverage
  </in_scope>
  <out_of_scope>
    - Frontend accuracy dashboard or admin UI
    - Real-time accuracy monitoring WebSocket
    - SONA training hyperparameter tuning (use agentic-flow defaults initially)
    - Prisma schema migration file creation (document the required model, but migration is a separate deployment step)
    - Individual agent SDK migrations (TASK-SDK-003, TASK-SDK-004) -- this task integrates AFTER they exist
    - Custom weight management from scratch (replaced by SONA self-optimization)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run build

# 2. Lint check
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run lint

# 3. Run hybrid scorer tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="hybrid-scorer"

# 4. Run accuracy tracker tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="accuracy-tracker"

# 5. Run scoring router tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="scoring-router"

# 6. Run all shared agent tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="agents/shared"

# 7. Run categorizer tests (ensure no regressions)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="categorizer"

# 8. Run matcher tests (ensure no regressions)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="matcher"

# 9. Verify new files exist
ls -la apps/api/src/agents/shared/hybrid-scorer.ts
ls -la apps/api/src/agents/shared/accuracy-tracker.ts
ls -la apps/api/src/agents/shared/scoring-router.ts
ls -la apps/api/src/agents/shared/interfaces/hybrid-scoring.interface.ts
ls -la tests/agents/shared/hybrid-scorer.spec.ts
ls -la tests/agents/shared/accuracy-tracker.spec.ts
ls -la tests/agents/shared/scoring-router.spec.ts

# 10. Verify heuristic path is NOT removed
grep -n "ConfidenceScorer" apps/api/src/agents/transaction-categorizer/categorizer.agent.ts
# Should still be present -- heuristic path must remain

# 11. Verify no PII in accuracy records interface
grep -rn "firstName\|lastName\|email\|phone\|address\|idNumber" apps/api/src/agents/shared/ --include="*.ts"
# Should return NO results
```
</verification_commands>

<definition_of_done>
  - [ ] `HybridScorer` class created as `@Injectable()` at `apps/api/src/agents/shared/hybrid-scorer.ts`
  - [ ] `HybridScorer` integrates agentic-flow SONA for adaptive weight optimization (replaces custom weight management)
  - [ ] `HybridScorer.combine()` accepts `llmConfidence` (number|null), `heuristicConfidence` (number), and `context` (tenantId, agentType)
  - [ ] `HybridScorer.combine()` returns `HybridScore` with `score`, `source`, `llmAvailable`, `llmScore`, `heuristicScore`, `sonaWeights`
  - [ ] SONA-optimized weights are clamped: heuristic weight never drops below 20% for financial operations
  - [ ] When `llmConfidence` is null, returns heuristic-only score with `source: 'HEURISTIC_ONLY'`
  - [ ] When both available, returns SONA-weighted combination with `source: 'HYBRID'`
  - [ ] Falls back to 60/40 default weights when SONA has insufficient data
  - [ ] `AccuracyTracker` class created as `@Injectable()` at `apps/api/src/agents/shared/accuracy-tracker.ts`
  - [ ] `AccuracyTracker` uses agentic-flow AgentDB cognitive memory with Prisma dual-write for compliance
  - [ ] `AccuracyTracker.recordOutcome()` dual-writes: AgentDB (feeds SONA learning) + Prisma (compliance audit trail)
  - [ ] `AccuracyTracker.getAccuracy()` uses AgentDB cognitive stats with Prisma fallback; returns per-path accuracy percentages, sample size, and recommendation
  - [ ] Recommendation logic: HYBRID if <50 samples; LLM_PRIMARY if llm > heuristic + 5%; HEURISTIC_PRIMARY if heuristic > llm + 5%; HYBRID otherwise
  - [ ] Uses last 200 records with recency bias (most recent outcomes weighted more)
  - [ ] `ScoringRouter` class created as `@Injectable()` at `apps/api/src/agents/shared/scoring-router.ts`
  - [ ] `ScoringRouter` uses agentic-flow multi-model routing for automatic path selection
  - [ ] `ScoringRouter.getPreferredPath()` uses multi-model router with accuracy-based fallback
  - [ ] `ScoringRouter.getWeightsForPath()` maps paths to fallback weights (LLM_PRIMARY: 80/20, HEURISTIC_PRIMARY: 20/80, HYBRID: 60/40)
  - [ ] Dual-write pattern verified: every accuracy outcome written to both AgentDB and Prisma
  - [ ] ruvector embedding similarity integrated for pattern-based accuracy comparison across similar inputs
  - [ ] Interfaces defined at `apps/api/src/agents/shared/interfaces/hybrid-scoring.interface.ts` (HybridScore, ScoringWeights, ScoringPath, AccuracyOutcome, AccuracyStats)
  - [ ] `TransactionCategorizerAgent` modified to optionally use HybridScorer when SDK categorizer is available
  - [ ] `PaymentMatcherAgent` modified to optionally use HybridScorer when SDK matcher is available
  - [ ] Existing heuristic path (ConfidenceScorer + inline matcher scoring) remains fully functional as fallback
  - [ ] Human correction events recorded via AccuracyTracker (hooks into existing correction flows)
  - [ ] No PII stored in accuracy records (only agent type, prediction codes, confidence scores, correctness flags)
  - [ ] Accuracy records include tenant isolation (`tenantId` on every record)
  - [ ] Prisma `AgentAccuracyRecord` model retained as compliance/audit layer (dual-write with SONA)
  - [ ] Unit tests for HybridScorer at `tests/agents/shared/hybrid-scorer.spec.ts` (90%+ coverage)
  - [ ] Unit tests for AccuracyTracker at `tests/agents/shared/accuracy-tracker.spec.ts` (90%+ coverage)
  - [ ] Unit tests for ScoringRouter at `tests/agents/shared/scoring-router.spec.ts` (90%+ coverage)
  - [ ] Tests cover: null LLM confidence, SONA weight optimization, min heuristic weight enforcement, dual-write verification, score combination, accuracy calculation, recommendation thresholds, path-to-weight mapping, minimum sample size, multi-model routing fallback
  - [ ] `pnpm run build` passes with no errors
  - [ ] `pnpm run lint` passes with no warnings
  - [ ] All existing categorizer and matcher tests continue to pass (no regressions)
</definition_of_done>

<anti_patterns>
  - **NEVER** remove the heuristic path -- it is the free, fast, always-available fallback. The `ConfidenceScorer` and inline matcher scoring must remain fully functional
  - **NEVER** auto-switch to LLM-only without sufficient accuracy data -- minimum 50 samples before recommending a single-path switch
  - **NEVER** track PII in accuracy records -- only store agent type, prediction outcome codes, confidence scores, and correctness boolean flags. No parent names, transaction descriptions, or financial details
  - **NEVER** use `npm` -- always use `pnpm`
  - **NEVER** use floats for monetary values -- all amounts remain in cents (integers)
  - **NEVER** modify the existing `ConfidenceScorer` class internals -- HybridScorer wraps it, does not replace it
  - **NEVER** modify the existing matcher scoring logic internals -- HybridScorer adds a layer on top
  - **NEVER** make HybridScorer a hard dependency -- if HybridScorer fails to initialize, the agents must continue working with heuristic-only scoring
  - **NEVER** block agent execution on accuracy lookups -- cache accuracy stats or accept stale data rather than blocking categorization/matching
  - **NEVER** allow accuracy tracking to affect the auto-apply threshold value (80%) -- the threshold is a business rule, not a dynamic value
  - **NEVER** save test files or working files to the project root folder
  - **NEVER** let SONA auto-optimize weights below safety thresholds -- always enforce minimum heuristic weight of 20% for financial operations. SONA may suggest aggressive LLM-heavy weights, but financial compliance requires a heuristic safety floor
  - **NEVER** remove the Prisma dual-write -- `AgentAccuracyRecord` is required for financial audit compliance even though AgentDB handles the learning. Both systems must receive every write
  - **NEVER** trust SONA optimization without validation against the 50+ sample recommendation threshold -- SONA weight suggestions are only applied after sufficient data collection
</anti_patterns>

</task_spec>
