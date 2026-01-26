<task_spec id="TASK-STUB-008" version="2.0">

<metadata>
  <title>Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>808</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-STUB-DECISION-HOOKS</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-005</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `AgenticFlowHooksStub` in `apps/api/src/agents/audit/decision-hooks.ts`
  (lines 29-36) has two no-op methods:
  - `preTask(context)` — does nothing
  - `postTask(context)` — does nothing

  The `DecisionHooks` class (lines 39-183) uses this stub in its `postDecision()`
  method at lines 108-119 as part of a triple-write pattern. The stub's no-op
  behavior means:
  1. **No pre-decision validation against historical failures**: When an agent is
     about to make a decision, there is no check against recently corrected similar
     decisions. The agent repeats the same mistakes until manually corrected again.
  2. **No post-decision trajectory recording**: After an agent makes a decision,
     no SONA trajectory is recorded, so the weight optimization system (TASK-STUB-005)
     receives no feedback data.

  The existing `DecisionHooks` already has the infrastructure:
  - `preDecision(context)` validates tenant subscription status (lines 62-97)
  - `postDecision(context)` performs triple-write: stub → ruvector → audit trail (lines 107-139)
  - `postEscalation(params)` delegates to audit trail (lines 146-154)
  - `findSimilarDecisions(query)` uses ruvector for semantic search (lines 160-182)

  **Gap Analysis:**
  - `AgenticFlowHooksStub.preTask()` is a no-op — no pre-decision validation against
    correction history
  - `AgenticFlowHooksStub.postTask()` is a no-op — no SONA trajectory recording for
    weight optimization
  - No semantic similarity check before decisions to catch repeating mistakes
  - No confidence reduction when similar past decisions were corrected
  - No integration with `SonaWeightAdapter` (from TASK-STUB-005) for trajectory recording
  - No integration with `AgentAuditLog` for correction history lookup
  - The existing `preDecision()` only checks subscription status, not decision quality

  **Note on MCP Gate (Cognitum Gate system):**
  The ruvector/agentic-flow ecosystem includes an MCP Gate (`permit_action`) that
  provides a full gating system for agent actions. However, it requires the `mcp-gate`
  Rust binary and a full Cognitum Gate server. This is too heavyweight for CrecheBooks.
  Instead, we implement lightweight audit-trail-based pre-validation + SONA trajectory
  post-recording.

  **Existing Infrastructure:**
  - `AuditTrailService` (in `apps/api/src/agents/audit/audit-trail.service.ts`) — already
    logs decisions and escalations to `AgentAuditLog` Prisma model
  - `RuvectorService` — provides embedding generation and similarity search
  - `SonaWeightAdapter` (TASK-STUB-005) — provides trajectory recording
  - `PrismaService` — provides access to `AgentAuditLog` table with correction data

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - SONA: `SonaWeightAdapter` (from TASK-STUB-005)
  - Vector: `RuvectorService` (from TASK-SDK-001)
  - Testing: Jest
  - All monetary values: integers (cents)

  **Files to Create:**
  - `apps/api/src/agents/audit/real-decision-hooks.ts` — Pre/post hooks with audit trail + SONA
  - `apps/api/src/agents/audit/interfaces/decision-hooks.interface.ts` — Type definitions
  - `apps/api/tests/agents/audit/real-decision-hooks.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/audit/decision-hooks.ts` — Replace AgenticFlowHooksStub with RealDecisionHooks
  - Module registrations as needed
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

  ### 2. RealDecisionHooks Class
  Replaces the `AgenticFlowHooksStub` with real pre/post decision logic:
  ```typescript
  // apps/api/src/agents/audit/real-decision-hooks.ts
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import { PrismaService } from '../../database/prisma/prisma.service';
  import { RuvectorService } from '../sdk/ruvector.service';
  import { SonaWeightAdapter } from '../shared/sona-weight-adapter';
  import type {
    DecisionHooksInterface,
    PreDecisionContext,
    PreDecisionResult,
    PostDecisionContext,
    CorrectionHistoryMatch,
  } from './interfaces/decision-hooks.interface';

  /** Injection token for decision hooks */
  export const DECISION_HOOKS_TOKEN = 'DECISION_HOOKS';

  /** Number of recent corrections to trigger a warning */
  const CORRECTION_WARNING_THRESHOLD = 3;

  /** Confidence reduction when similar past decisions were corrected (percentage points) */
  const CORRECTION_CONFIDENCE_PENALTY = 10;

  /** Number of days to look back for correction history */
  const CORRECTION_LOOKBACK_DAYS = 30;

  /** Maximum number of similar decisions to check */
  const MAX_SIMILAR_CHECK = 10;

  @Injectable()
  export class RealDecisionHooks implements DecisionHooksInterface {
    private readonly logger = new Logger(RealDecisionHooks.name);

    constructor(
      @Optional()
      @Inject(PrismaService)
      private readonly prisma?: PrismaService,
      @Optional()
      @Inject(RuvectorService)
      private readonly ruvector?: RuvectorService,
      @Optional()
      @Inject(SonaWeightAdapter)
      private readonly sonaAdapter?: SonaWeightAdapter,
    ) {}

    /**
     * Pre-decision hook: check for recently failed similar decisions.
     *
     * Algorithm:
     * 1. Query AgentAuditLog for recent corrections with similar input
     * 2. Use RuvectorService.searchSimilar() for semantic matching
     * 3. If 3+ corrections found for similar inputs → add WARNING_PREVIOUSLY_CORRECTED flag
     * 4. Reduce confidence by 10 percentage points
     *
     * CRITICAL: This is advisory only. The hook NEVER blocks decisions.
     * All operations are wrapped in try/catch.
     */
    async preDecision(context: PreDecisionContext): Promise<PreDecisionResult> {
      const result: PreDecisionResult = {
        allowed: true,
        warnings: [],
        confidenceAdjustment: 0,
      };

      try {
        // Step 1: Check correction history via Prisma
        const corrections = await this.checkCorrectionHistory(context);

        if (corrections.length >= CORRECTION_WARNING_THRESHOLD) {
          result.warnings.push({
            code: 'WARNING_PREVIOUSLY_CORRECTED',
            message:
              `Found ${corrections.length} recent corrections for similar inputs ` +
              `(agent: ${context.agentType}, tenant: ${context.tenantId}). ` +
              `Reducing confidence by ${CORRECTION_CONFIDENCE_PENALTY}%.`,
            correctionCount: corrections.length,
            recentCorrections: corrections.slice(0, 3).map((c) => ({
              decisionId: c.decisionId,
              correctedAt: c.correctedAt,
              originalCode: c.originalCode,
              correctedCode: c.correctedCode,
            })),
          });
          result.confidenceAdjustment = -CORRECTION_CONFIDENCE_PENALTY;
        }

        // Step 2: Semantic similarity check via ruvector
        if (this.ruvector?.isAvailable() && context.inputText) {
          const semanticWarnings = await this.checkSemanticSimilarity(context);
          result.warnings.push(...semanticWarnings);

          // Additional penalty if semantic matches with corrections found
          if (semanticWarnings.length > 0 && result.confidenceAdjustment === 0) {
            result.confidenceAdjustment = -5; // Lighter penalty for semantic-only match
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`preDecision hook failed (non-blocking): ${msg}`);
        // Fail-open: return allowed=true with no adjustments
      }

      return result;
    }

    /**
     * Post-decision hook: record SONA trajectory and update audit trail.
     *
     * Algorithm:
     * 1. Record SONA trajectory via SonaWeightAdapter.recordOutcome()
     * 2. Store decision embedding via ruvector for future similarity checks
     * 3. Update accuracy tracking in AgentAuditLog
     *
     * CRITICAL: ALL operations are non-blocking. Errors are caught, never thrown.
     */
    async postDecision(context: PostDecisionContext): Promise<void> {
      // Step 1: Record SONA trajectory (for weight optimization)
      this.recordSonaTrajectory(context).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`SONA trajectory recording failed (non-blocking): ${msg}`);
      });

      // Step 2: Store decision embedding for future similarity checks
      this.storeDecisionEmbedding(context).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Decision embedding storage failed (non-blocking): ${msg}`);
      });

      // Step 3: Update audit trail accuracy tracking
      this.updateAccuracyTracking(context).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Accuracy tracking update failed (non-blocking): ${msg}`);
      });
    }

    /**
     * Check correction history in AgentAuditLog for similar inputs.
     * Returns recent corrections where the agent type and tenant match.
     */
    private async checkCorrectionHistory(
      context: PreDecisionContext,
    ): Promise<CorrectionHistoryMatch[]> {
      if (!this.prisma) return [];

      try {
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - CORRECTION_LOOKBACK_DAYS);

        const corrections = await this.prisma.agentAuditLog.findMany({
          where: {
            tenantId: context.tenantId,
            agentType: context.agentType,
            eventType: 'CORRECTION',
            createdAt: { gte: lookbackDate },
          },
          orderBy: { createdAt: 'desc' },
          take: MAX_SIMILAR_CHECK,
          select: {
            id: true,
            details: true,
            createdAt: true,
          },
        });

        return corrections.map((c) => {
          const details = c.details as Record<string, unknown> | null;
          return {
            decisionId: c.id,
            correctedAt: c.createdAt.toISOString(),
            originalCode: String(details?.originalAccountCode ?? ''),
            correctedCode: String(details?.correctedAccountCode ?? ''),
          };
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Correction history check failed: ${msg}`);
        return [];
      }
    }

    /**
     * Semantic similarity check: find past decisions with similar input text
     * that were subsequently corrected.
     */
    private async checkSemanticSimilarity(
      context: PreDecisionContext,
    ): Promise<Array<{
      code: string;
      message: string;
    }>> {
      if (!this.ruvector?.isAvailable() || !context.inputText) return [];

      try {
        const embedding = await this.ruvector.generateEmbedding(context.inputText);
        const similar = await this.ruvector.searchSimilar(
          embedding,
          `audit-decisions-${context.tenantId}`,
          5,
        );

        // Filter for high-similarity results that were corrected
        const correctedSimilar = similar.filter(
          (s) => s.score >= 0.85 && (s.metadata?.wasCorrect === false),
        );

        if (correctedSimilar.length > 0) {
          return [{
            code: 'WARNING_SEMANTIC_MATCH_CORRECTED',
            message:
              `Found ${correctedSimilar.length} semantically similar past decisions ` +
              `that were corrected. Consider reviewing carefully.`,
          }];
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.debug(`Semantic similarity check failed: ${msg}`);
      }

      return [];
    }

    /**
     * Record SONA trajectory for weight optimization learning.
     * Uses SonaWeightAdapter from TASK-STUB-005.
     */
    private async recordSonaTrajectory(context: PostDecisionContext): Promise<void> {
      if (!this.sonaAdapter) return;

      // Build SONA context
      const sonaContext = {
        tenantId: context.tenantId,
        agentType: context.agentType,
        transactionType: context.isCredit ? 'credit' : 'debit',
        amountBucket: context.amountBucket,
      };

      // Build trajectory outcome
      const outcome = {
        wasCorrect: context.wasCorrect ?? true, // Assume correct until corrected
        confidence: context.confidence,
        llmConfidence: context.llmConfidence ?? context.confidence,
        heuristicConfidence: context.heuristicConfidence ?? context.confidence,
      };

      await this.sonaAdapter.recordOutcome(sonaContext, outcome);

      this.logger.debug(
        `SONA trajectory recorded: ${context.agentType}@${context.tenantId} ` +
        `confidence=${context.confidence}, correct=${String(outcome.wasCorrect)}`,
      );
    }

    /**
     * Store decision embedding for future similarity checks.
     * Non-blocking: errors caught by caller.
     */
    private async storeDecisionEmbedding(context: PostDecisionContext): Promise<void> {
      if (!this.ruvector?.isAvailable() || !context.reasoning) return;

      const embedding = await this.ruvector.generateEmbedding(context.reasoning);

      // Store in tenant-scoped audit decisions collection
      // Note: This requires ruvector.storeEmbedding() which may not be available yet
      // Forward-compatible stub
      this.logger.debug(
        `Decision embedding generated for ${context.agentType}@${context.tenantId} ` +
        `(${embedding.length}d)`,
      );
    }

    /**
     * Update accuracy tracking in AgentAuditLog.
     * Writes a DECISION event to the audit trail via Prisma.
     */
    private async updateAccuracyTracking(context: PostDecisionContext): Promise<void> {
      if (!this.prisma) return;

      try {
        await this.prisma.agentAuditLog.create({
          data: {
            tenantId: context.tenantId,
            agentType: context.agentType,
            eventType: 'DECISION',
            decision: context.decision,
            confidence: context.confidence,
            source: context.source,
            autoApplied: context.autoApplied,
            details: {
              transactionId: context.transactionId,
              accountCode: context.accountCode,
              reasoning: context.reasoning,
              llmConfidence: context.llmConfidence,
              heuristicConfidence: context.heuristicConfidence,
              durationMs: context.durationMs,
            },
          },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Audit trail write failed: ${msg}`);
      }
    }
  }
  ```

  ### 3. Decision Hooks Interface
  ```typescript
  // apps/api/src/agents/audit/interfaces/decision-hooks.interface.ts

  /**
   * Context for pre-decision validation.
   */
  export interface PreDecisionContext {
    tenantId: string;
    agentType: string;
    /** Sanitized input text for semantic similarity check */
    inputText?: string;
    /** Transaction ID being processed */
    transactionId?: string;
    /** Payee name being categorized */
    payeeName?: string;
    /** Amount in cents */
    amountCents?: number;
    /** Credit or debit */
    isCredit?: boolean;
  }

  /**
   * Warning generated during pre-decision validation.
   */
  export interface PreDecisionWarning {
    /** Warning code for programmatic handling */
    code: string;
    /** Human-readable warning message */
    message: string;
    /** Number of corrections found (if applicable) */
    correctionCount?: number;
    /** Recent correction details (if applicable) */
    recentCorrections?: Array<{
      decisionId: string;
      correctedAt: string;
      originalCode: string;
      correctedCode: string;
    }>;
  }

  /**
   * Result from pre-decision validation hook.
   */
  export interface PreDecisionResult {
    /** Always true — hooks are advisory, never blocking */
    allowed: boolean;
    /** Warnings to attach to the decision context */
    warnings: PreDecisionWarning[];
    /** Confidence adjustment (negative = reduce confidence) */
    confidenceAdjustment: number;
  }

  /**
   * Context for post-decision trajectory recording.
   */
  export interface PostDecisionContext {
    tenantId: string;
    agentType: string;
    /** The decision made (e.g., account code assigned) */
    decision: string;
    /** Final confidence score (0-100) */
    confidence: number;
    /** Decision source */
    source: string;
    /** Whether the decision was auto-applied */
    autoApplied: boolean;
    /** Account code assigned */
    accountCode?: string;
    /** Transaction ID */
    transactionId?: string;
    /** LLM reasoning text */
    reasoning?: string;
    /** LLM component confidence (0-100) */
    llmConfidence?: number;
    /** Heuristic component confidence (0-100) */
    heuristicConfidence?: number;
    /** Whether credit or debit */
    isCredit?: boolean;
    /** Amount bucket for SONA context */
    amountBucket?: string;
    /** Processing duration in ms */
    durationMs?: number;
    /** Whether the decision was correct (may be set later via correction) */
    wasCorrect?: boolean;
  }

  /**
   * A correction history match from the audit log.
   */
  export interface CorrectionHistoryMatch {
    decisionId: string;
    correctedAt: string;
    originalCode: string;
    correctedCode: string;
  }

  /**
   * Interface for decision lifecycle hooks.
   * Implemented by RealDecisionHooks (production) and the legacy
   * AgenticFlowHooksStub (fallback).
   */
  export interface DecisionHooksInterface {
    /**
     * Pre-decision hook: validate against correction history.
     * MUST be fail-open (allowed=true on error).
     * MUST be non-blocking.
     */
    preDecision(context: PreDecisionContext): Promise<PreDecisionResult>;

    /**
     * Post-decision hook: record SONA trajectory and audit data.
     * MUST be non-blocking — all operations fire-and-forget.
     */
    postDecision(context: PostDecisionContext): Promise<void>;
  }
  ```

  ### 4. Integration into DecisionHooks
  The existing `decision-hooks.ts` must be modified to:
  1. Remove the local `AgenticFlowHooksStub` class (lines 29-36)
  2. Import `RealDecisionHooks` and inject via `@Optional() @Inject()`
  3. Wire the real hooks into the existing triple-write pattern

  ```typescript
  // In apps/api/src/agents/audit/decision-hooks.ts — changes needed:

  // REMOVE: class AgenticFlowHooksStub (lines 29-36)

  // ADD: import
  import { RealDecisionHooks, DECISION_HOOKS_TOKEN } from './real-decision-hooks';
  import type { DecisionHooksInterface } from './interfaces/decision-hooks.interface';

  @Injectable()
  export class DecisionHooks {
    private readonly logger = new Logger(DecisionHooks.name);
    private readonly realHooks: DecisionHooksInterface;

    constructor(
      @Optional()
      @Inject(AuditTrailService)
      private readonly auditTrail?: AuditTrailService,
      @Optional()
      @Inject(PrismaService)
      private readonly prisma?: PrismaService,
      @Optional()
      @Inject(RuvectorService)
      private readonly ruvector?: RuvectorService,
      @Optional()
      @Inject(DECISION_HOOKS_TOKEN)
      realHooks?: DecisionHooksInterface,
    ) {
      // Fallback to no-op when real hooks are unavailable
      this.realHooks = realHooks ?? {
        preDecision: async () => ({
          allowed: true,
          warnings: [],
          confidenceAdjustment: 0,
        }),
        postDecision: async () => {},
      };
    }

    // MODIFY preDecision to also call realHooks:
    async preDecision(context: {
      tenantId: string;
      agentType: string;
      inputText?: string;
      payeeName?: string;
      amountCents?: number;
      isCredit?: boolean;
    }): Promise<{
      allowed: boolean;
      reason?: string;
      warnings?: Array<{ code: string; message: string }>;
      confidenceAdjustment?: number;
    }> {
      // Existing subscription check
      if (!this.prisma) {
        return { allowed: true };
      }

      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: context.tenantId },
          select: { id: true, subscriptionStatus: true },
        });

        if (!tenant) {
          return { allowed: false, reason: 'Tenant not found' };
        }

        if (tenant.subscriptionStatus === 'CANCELLED') {
          return { allowed: false, reason: 'Tenant subscription is cancelled' };
        }

        // NEW: Call real hooks for correction history check
        const hookResult = await this.realHooks.preDecision({
          tenantId: context.tenantId,
          agentType: context.agentType,
          inputText: context.inputText,
          payeeName: context.payeeName,
          amountCents: context.amountCents,
          isCredit: context.isCredit,
        });

        return {
          allowed: true,
          warnings: hookResult.warnings,
          confidenceAdjustment: hookResult.confidenceAdjustment,
        };
      } catch (error) {
        this.logger.warn(
          `preDecision failed (fail-open): ${error instanceof Error ? error.message : String(error)}`,
        );
        return { allowed: true };
      }
    }

    // MODIFY postDecision to also call realHooks:
    async postDecision(context: LogDecisionParams): Promise<void> {
      // Step 1: Call real hooks (SONA trajectory + audit) — non-blocking
      this.realHooks
        .postDecision({
          tenantId: context.tenantId,
          agentType: context.agentType,
          decision: context.decision,
          confidence: context.confidence ?? 0,
          source: context.source ?? 'RULE_BASED',
          autoApplied: context.autoApplied,
          transactionId: context.transactionId,
          reasoning: context.reasoning,
          durationMs: context.durationMs,
        })
        .catch((error: Error) => {
          this.logger.debug(
            `RealDecisionHooks postDecision failed: ${error.message}`,
          );
        });

      // Step 2: Ruvector embedding (existing, non-blocking)
      if (this.ruvector?.isAvailable() && context.reasoning) {
        this.ruvector
          .generateEmbedding(context.reasoning)
          .catch((err: Error) =>
            this.logger.debug(
              `Ruvector embedding failed (non-blocking): ${err.message}`,
            ),
          );
      }

      // Step 3: Audit trail (existing, non-blocking)
      if (this.auditTrail) {
        this.auditTrail
          .logDecision(context)
          .catch((err: Error) =>
            this.logger.warn(`Audit trail postDecision failed: ${err.message}`),
          );
      }
    }
  }
  ```

  ### 5. Non-Blocking Pattern (CRITICAL)
  ALL hook operations MUST be non-blocking. Decision flow must NEVER be delayed
  by hook processing:
  ```typescript
  // CORRECT — fire-and-forget with .catch()
  this.realHooks
    .postDecision(context)
    .catch((err) => this.logger.warn(`Hook failed: ${err.message}`));

  // WRONG — awaiting blocks the decision flow
  // await this.realHooks.postDecision(context); // NEVER block on hooks
  ```

  For pre-decision, the hook returns quickly but NEVER blocks. Even if the database
  query takes time, the hook result is advisory — the agent proceeds regardless:
  ```typescript
  // Pre-decision is called inline but result is advisory only
  const hookResult = await this.realHooks.preDecision(context);
  // hookResult.allowed is ALWAYS true
  // hookResult.warnings and confidenceAdjustment are SUGGESTIONS, not mandates
  ```

  ### 6. Tenant Isolation
  All audit log queries and ruvector searches MUST be tenant-scoped:
  ```typescript
  // CORRECT — tenant-scoped
  where: {
    tenantId: context.tenantId,  // MANDATORY
    agentType: context.agentType,
    eventType: 'CORRECTION',
  }

  // CORRECT — tenant-scoped ruvector collection
  await this.ruvector.searchSimilar(
    embedding,
    `audit-decisions-${context.tenantId}`,  // Tenant-scoped
    5,
  );

  // WRONG — global queries
  // where: { agentType: context.agentType }  // NEVER omit tenantId
  ```

  ### 7. SONA Trajectory Integration
  The post-decision hook feeds the SONA weight optimization system from TASK-STUB-005:
  ```typescript
  // SONA trajectory recording flow:
  // 1. Agent makes decision → confidence, source, llm/heuristic scores
  // 2. PostDecision hook called with all context
  // 3. SonaWeightAdapter.recordOutcome() records trajectory
  // 4. Next time HybridScorer.combine() is called, SONA provides optimized weights

  await this.sonaAdapter.recordOutcome(
    {
      tenantId: context.tenantId,
      agentType: context.agentType,
      transactionType: context.isCredit ? 'credit' : 'debit',
      amountBucket: context.amountBucket,
    },
    {
      wasCorrect: context.wasCorrect ?? true,
      confidence: context.confidence,
      llmConfidence: context.llmConfidence ?? context.confidence,
      heuristicConfidence: context.heuristicConfidence ?? context.confidence,
    },
  );
  ```

  ### 8. Correction History Lookup
  Pre-decision queries `AgentAuditLog` for recent corrections:
  ```typescript
  // Query: Find recent corrections for this agent type and tenant
  const corrections = await this.prisma.agentAuditLog.findMany({
    where: {
      tenantId: context.tenantId,
      agentType: context.agentType,
      eventType: 'CORRECTION',
      createdAt: { gte: lookbackDate }, // Last 30 days
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // If 3+ corrections found → WARNING_PREVIOUSLY_CORRECTED
  // Confidence reduced by 10 percentage points
  ```

  ### 9. Testing Pattern
  ```typescript
  describe('RealDecisionHooks', () => {
    let hooks: RealDecisionHooks;
    let mockPrisma: jest.Mocked<PrismaService>;
    let mockRuvector: jest.Mocked<RuvectorService>;
    let mockSona: jest.Mocked<SonaWeightAdapter>;

    beforeEach(() => {
      mockPrisma = {
        agentAuditLog: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        },
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ id: 't1', subscriptionStatus: 'ACTIVE' }),
        },
      } as unknown as jest.Mocked<PrismaService>;

      mockRuvector = {
        isAvailable: jest.fn().mockReturnValue(true),
        generateEmbedding: jest.fn().mockResolvedValue(new Array(384).fill(0.1)),
        searchSimilar: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<RuvectorService>;

      mockSona = {
        recordOutcome: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<SonaWeightAdapter>;

      hooks = new RealDecisionHooks(mockPrisma, mockRuvector, mockSona);
    });

    describe('preDecision', () => {
      it('should return allowed=true with no warnings when no corrections', async () => {
        const result = await hooks.preDecision({
          tenantId: 't1',
          agentType: 'categorizer',
        });

        expect(result.allowed).toBe(true);
        expect(result.warnings).toHaveLength(0);
        expect(result.confidenceAdjustment).toBe(0);
      });

      it('should add WARNING_PREVIOUSLY_CORRECTED when 3+ corrections found', async () => {
        mockPrisma.agentAuditLog.findMany.mockResolvedValue([
          { id: 'c1', details: { originalAccountCode: '5200', correctedAccountCode: '5300' }, createdAt: new Date() },
          { id: 'c2', details: { originalAccountCode: '5200', correctedAccountCode: '5300' }, createdAt: new Date() },
          { id: 'c3', details: { originalAccountCode: '5200', correctedAccountCode: '5300' }, createdAt: new Date() },
        ]);

        const result = await hooks.preDecision({
          tenantId: 't1',
          agentType: 'categorizer',
        });

        expect(result.allowed).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('WARNING_PREVIOUSLY_CORRECTED');
        expect(result.confidenceAdjustment).toBe(-10);
      });

      it('should add semantic warning when similar corrected decisions found', async () => {
        mockRuvector.searchSimilar.mockResolvedValue([
          { id: 'd1', score: 0.92, metadata: { wasCorrect: false } },
        ]);

        const result = await hooks.preDecision({
          tenantId: 't1',
          agentType: 'categorizer',
          inputText: 'Woolworths groceries',
        });

        expect(result.warnings.some(w => w.code === 'WARNING_SEMANTIC_MATCH_CORRECTED')).toBe(true);
      });

      it('should return allowed=true even when Prisma fails (fail-open)', async () => {
        mockPrisma.agentAuditLog.findMany.mockRejectedValue(new Error('DB down'));

        const result = await hooks.preDecision({
          tenantId: 't1',
          agentType: 'categorizer',
        });

        expect(result.allowed).toBe(true);
        expect(result.confidenceAdjustment).toBe(0);
      });

      it('should scope queries by tenantId', async () => {
        await hooks.preDecision({
          tenantId: 'tenant-xyz',
          agentType: 'categorizer',
        });

        expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              tenantId: 'tenant-xyz',
            }),
          }),
        );
      });

      it('should only look back 30 days', async () => {
        await hooks.preDecision({
          tenantId: 't1',
          agentType: 'categorizer',
        });

        expect(mockPrisma.agentAuditLog.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: expect.objectContaining({
                gte: expect.any(Date),
              }),
            }),
          }),
        );
      });
    });

    describe('postDecision', () => {
      it('should record SONA trajectory', async () => {
        await hooks.postDecision({
          tenantId: 't1',
          agentType: 'categorizer',
          decision: 'categorize:5200',
          confidence: 85,
          source: 'LLM',
          autoApplied: true,
          isCredit: false,
          amountBucket: 'medium',
        });

        // Allow async operations to complete
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockSona.recordOutcome).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 't1',
            agentType: 'categorizer',
          }),
          expect.objectContaining({
            wasCorrect: true,
            confidence: 85,
          }),
        );
      });

      it('should write to AgentAuditLog', async () => {
        await hooks.postDecision({
          tenantId: 't1',
          agentType: 'categorizer',
          decision: 'categorize:5200',
          confidence: 85,
          source: 'LLM',
          autoApplied: true,
          reasoning: 'Matched Woolworths to food',
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        expect(mockPrisma.agentAuditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tenantId: 't1',
              agentType: 'categorizer',
              eventType: 'DECISION',
            }),
          }),
        );
      });

      it('should not throw when SONA adapter is unavailable', async () => {
        const hooksNoSona = new RealDecisionHooks(mockPrisma, mockRuvector, undefined);

        await expect(
          hooksNoSona.postDecision({
            tenantId: 't1',
            agentType: 'categorizer',
            decision: 'categorize:5200',
            confidence: 85,
            source: 'PATTERN',
            autoApplied: true,
          }),
        ).resolves.not.toThrow();
      });

      it('should not throw when Prisma is unavailable', async () => {
        const hooksNoPrisma = new RealDecisionHooks(undefined, mockRuvector, mockSona);

        await expect(
          hooksNoPrisma.postDecision({
            tenantId: 't1',
            agentType: 'categorizer',
            decision: 'categorize:5200',
            confidence: 85,
            source: 'PATTERN',
            autoApplied: true,
          }),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('DecisionHooks with RealDecisionHooks integration', () => {
    it('should wire real hooks into triple-write pattern', async () => {
      // Test that DecisionHooks calls RealDecisionHooks.postDecision
      const mockRealHooks = {
        preDecision: jest.fn().mockResolvedValue({
          allowed: true,
          warnings: [],
          confidenceAdjustment: 0,
        }),
        postDecision: jest.fn().mockResolvedValue(undefined),
      };

      const decisionHooks = new DecisionHooks(
        undefined, // auditTrail
        undefined, // prisma
        undefined, // ruvector
        mockRealHooks as any,
      );

      await decisionHooks.postDecision({
        tenantId: 't1',
        agentType: 'categorizer',
        decision: 'categorize:5200',
        autoApplied: true,
        details: {},
      });

      // Wait for async
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRealHooks.postDecision).toHaveBeenCalled();
    });

    it('should fall back gracefully when real hooks not available', async () => {
      const decisionHooks = new DecisionHooks();
      // Should not throw
      await expect(
        decisionHooks.postDecision({
          tenantId: 't1',
          agentType: 'categorizer',
          decision: 'test',
          autoApplied: false,
          details: {},
        }),
      ).resolves.not.toThrow();
    });
  });
  ```

  ### 10. Monetary Values
  All amounts referenced in hook contexts are in cents (integers):
  ```typescript
  // CORRECT
  amountCents: 250000  // R2,500.00
  amountBucket: 'medium'

  // WRONG
  // amount: 2500.00
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks agents process financial transactions autonomously. Without decision
  lifecycle hooks, agents can repeatedly make the same categorization mistakes
  because they have no memory of past corrections. The hooks provide two critical
  capabilities:

  1. **Pre-decision awareness**: Before categorizing a transaction, the agent checks
     whether similar past categorizations were corrected. If the same payee was
     miscategorized 3+ times in the last 30 days, the agent reduces its confidence
     and flags the decision for review.

  2. **Post-decision learning**: After making a decision, the agent records a SONA
     trajectory that feeds the weight optimization system. Over time, SONA learns
     the optimal LLM/heuristic weight balance for each tenant and agent type based
     on actual correctness outcomes.

  ## SA Compliance Notes
  - All monetary values in cents (integers) — R1,500.00 = 150000
  - Tenant isolation on all audit log queries (POPI Act)
  - Hooks are advisory only — they NEVER block agent decisions (fail-open design)
  - Decision audit data helps satisfy SARS requirements for explaining automated
    financial categorization decisions

  ## Architectural Decisions
  1. **Fail-open design**: Pre-decision hooks ALWAYS return `allowed: true`. They
     provide warnings and confidence adjustments, never blocking.
  2. **Non-blocking post-decision**: All post-decision operations use `.catch()`
     fire-and-forget. A hook failure never delays the decision flow.
  3. **Lightweight over MCP Gate**: The ruvector/agentic-flow MCP Gate system
     (`permit_action`) is too heavyweight. We use audit-trail-based pre-validation
     and SONA trajectory recording instead.
  4. **SONA integration**: Post-decision trajectories feed TASK-STUB-005's weight
     optimization, creating a feedback loop: decisions → trajectories → better
     weights → better decisions.
  5. **Correction lookback**: 30-day window for correction history. Older corrections
     are assumed to have been addressed by pattern learning or model updates.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `RealDecisionHooks` class implementing `DecisionHooksInterface`
    - Implement `preDecision()`: correction history check + semantic similarity check
    - Implement `postDecision()`: SONA trajectory recording + audit trail write + embedding storage
    - Create `DecisionHooksInterface` with `preDecision()` and `postDecision()` methods
    - Create `PreDecisionContext`, `PreDecisionResult`, `PreDecisionWarning` interfaces
    - Create `PostDecisionContext`, `CorrectionHistoryMatch` interfaces
    - Create `DECISION_HOOKS_TOKEN` injection token
    - Pre-decision: query `AgentAuditLog` for corrections (30-day lookback, tenant-scoped)
    - Pre-decision: semantic similarity via `RuvectorService.searchSimilar()` with tenant-scoped collection
    - Pre-decision: WARNING_PREVIOUSLY_CORRECTED when 3+ corrections found
    - Pre-decision: 10% confidence reduction when corrections found
    - Pre-decision: WARNING_SEMANTIC_MATCH_CORRECTED when similar corrected decisions found
    - Post-decision: SONA trajectory via `SonaWeightAdapter.recordOutcome()`
    - Post-decision: audit log write via `PrismaService.agentAuditLog.create()`
    - Post-decision: decision embedding via `RuvectorService.generateEmbedding()`
    - All operations non-blocking (fire-and-forget with `.catch()`)
    - Fail-open design: pre-decision always returns `allowed: true`
    - `@Optional() @Inject()` for all dependencies (PrismaService, RuvectorService, SonaWeightAdapter)
    - Modify `decision-hooks.ts`: remove `AgenticFlowHooksStub`, inject `RealDecisionHooks`
    - Register `RealDecisionHooks` and `DECISION_HOOKS_TOKEN` in module
    - Fallback to no-op when real hooks unavailable
    - Unit tests: preDecision (no corrections, 3+ corrections, semantic match, Prisma failure, tenant scoping)
    - Unit tests: postDecision (SONA recording, audit log write, embedding, unavailable deps)
    - Integration tests: DecisionHooks with RealDecisionHooks wiring
    - All existing DecisionHooks tests still pass
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
  </in_scope>

  <out_of_scope>
    - MCP Gate integration (`permit_action` / Cognitum Gate) — too heavyweight
    - Real-time decision blocking (hooks are advisory only)
    - Custom attention mechanisms in pre-decision
    - Cross-tenant correction analysis (prohibited by POPI)
    - Correction workflow management (correction recording handled by AgentMemoryService)
    - Modifying AuditTrailService (existing, this is additive)
    - Batch trajectory reprocessing
    - Real database integration tests (use mocks)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/audit/real-decision-hooks.ts
ls -la apps/api/src/agents/audit/interfaces/decision-hooks.interface.ts
ls -la apps/api/tests/agents/audit/real-decision-hooks.spec.ts

# 2. Build succeeds
cd apps/api && pnpm run build

# 3. Run decision hooks tests
pnpm test -- --testPathPattern="real-decision-hooks" --runInBand

# 4. Run existing decision-hooks tests (regression check)
pnpm test -- --testPathPattern="decision-hooks" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify AgenticFlowHooksStub is removed
grep -n "class AgenticFlowHooksStub" apps/api/src/agents/audit/decision-hooks.ts && echo "FAIL: stub present" || echo "PASS: stub removed"

# 8. Verify RealDecisionHooks implements interface
grep -n "implements DecisionHooksInterface" apps/api/src/agents/audit/real-decision-hooks.ts

# 9. Verify non-blocking pattern
grep -n "\.catch(" apps/api/src/agents/audit/real-decision-hooks.ts | wc -l

# 10. Verify no 'any' types in interfaces
grep -rn ": any" apps/api/src/agents/audit/interfaces/decision-hooks.interface.ts && echo "FAIL" || echo "PASS"

# 11. Verify @Optional() @Inject() pattern
grep -n "@Optional()" apps/api/src/agents/audit/real-decision-hooks.ts

# 12. Verify SONA integration
grep -n "sonaAdapter" apps/api/src/agents/audit/real-decision-hooks.ts | head -5

# 13. Verify tenant isolation in queries
grep -n "tenantId" apps/api/src/agents/audit/real-decision-hooks.ts | grep "where" | head -5

# 14. Verify DECISION_HOOKS_TOKEN
grep "DECISION_HOOKS_TOKEN" apps/api/src/agents/audit/real-decision-hooks.ts

# 15. Verify fail-open: preDecision always returns allowed=true
grep -n "allowed: true" apps/api/src/agents/audit/real-decision-hooks.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `RealDecisionHooks` class created implementing `DecisionHooksInterface`
  - [ ] `RealDecisionHooks.preDecision()` queries AgentAuditLog for recent corrections (30-day lookback)
  - [ ] `RealDecisionHooks.preDecision()` adds WARNING_PREVIOUSLY_CORRECTED when 3+ corrections found
  - [ ] `RealDecisionHooks.preDecision()` reduces confidence by 10% when corrections found
  - [ ] `RealDecisionHooks.preDecision()` checks semantic similarity via RuvectorService
  - [ ] `RealDecisionHooks.preDecision()` adds WARNING_SEMANTIC_MATCH_CORRECTED for similar corrected decisions
  - [ ] `RealDecisionHooks.preDecision()` ALWAYS returns `allowed: true` (fail-open)
  - [ ] `RealDecisionHooks.preDecision()` scopes all queries by tenantId
  - [ ] `RealDecisionHooks.preDecision()` handles Prisma failures gracefully (returns no warnings)
  - [ ] `RealDecisionHooks.preDecision()` handles RuvectorService failures gracefully
  - [ ] `RealDecisionHooks.postDecision()` records SONA trajectory via SonaWeightAdapter
  - [ ] `RealDecisionHooks.postDecision()` writes to AgentAuditLog via PrismaService
  - [ ] `RealDecisionHooks.postDecision()` stores decision embedding via RuvectorService
  - [ ] `RealDecisionHooks.postDecision()` is entirely non-blocking (all .catch() fire-and-forget)
  - [ ] `RealDecisionHooks.postDecision()` handles missing SonaWeightAdapter gracefully
  - [ ] `RealDecisionHooks.postDecision()` handles missing PrismaService gracefully
  - [ ] `RealDecisionHooks.postDecision()` handles missing RuvectorService gracefully
  - [ ] `DecisionHooksInterface` created with `preDecision()` and `postDecision()` method signatures
  - [ ] `PreDecisionContext` interface created with tenantId, agentType, inputText, payeeName, amountCents, isCredit
  - [ ] `PreDecisionResult` interface created with allowed, warnings[], confidenceAdjustment
  - [ ] `PreDecisionWarning` interface created with code, message, optional correctionCount and recentCorrections
  - [ ] `PostDecisionContext` interface created with all decision context fields
  - [ ] `CorrectionHistoryMatch` interface created with decisionId, correctedAt, originalCode, correctedCode
  - [ ] `DECISION_HOOKS_TOKEN` injection token exported
  - [ ] `AgenticFlowHooksStub` class REMOVED from `decision-hooks.ts`
  - [ ] `DecisionHooks` constructor accepts `@Optional() @Inject(DECISION_HOOKS_TOKEN)` parameter
  - [ ] `DecisionHooks` falls back to no-op when `RealDecisionHooks` not provided
  - [ ] `DecisionHooks.preDecision()` calls `realHooks.preDecision()` after subscription check
  - [ ] `DecisionHooks.postDecision()` calls `realHooks.postDecision()` as first step (fire-and-forget)
  - [ ] All existing `DecisionHooks` tests still pass (zero regressions)
  - [ ] SONA trajectory includes: tenantId, agentType, transactionType, amountBucket, wasCorrect, confidence, llm/heuristic confidence
  - [ ] Correction lookback is 30 days (configurable via constant)
  - [ ] Correction warning threshold is 3 (configurable via constant)
  - [ ] Confidence penalty is 10 percentage points (configurable via constant)
  - [ ] Unit tests: preDecision — no corrections, 3+ corrections, semantic match, Prisma failure (fail-open), tenant scoping, 30-day lookback
  - [ ] Unit tests: postDecision — SONA recording, audit log write, embedding, unavailable deps (all 3), non-blocking verification
  - [ ] Integration tests: DecisionHooks + RealDecisionHooks wiring, fallback when unavailable
  - [ ] Test coverage >= 90% for new files
  - [ ] Zero `any` types in interface files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER block agent decisions from pre-decision hooks** — hooks are ADVISORY ONLY. Always return `allowed: true`. The hook provides warnings and confidence adjustments, not gates.
  - **NEVER block the decision flow on post-decision hooks** — ALL post-decision operations must use `.catch()` fire-and-forget. A hook failure must NEVER delay or prevent agent decisions.
  - **NEVER expose audit data across tenants** — all AgentAuditLog queries and ruvector searches MUST be tenant-scoped. This is a POPI Act legal requirement.
  - **NEVER use `any` type** — use proper TypeScript interfaces from `decision-hooks.interface.ts`
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER use MCP Gate for decision gating** — it requires the `mcp-gate` Rust binary and is too heavyweight for CrecheBooks. Use lightweight audit-trail-based pre-validation.
  - **NEVER throw from hook methods** — ALL errors must be caught and logged. Hooks are non-critical.
  - **NEVER modify the AuditTrailService** — it is existing infrastructure. This task is additive.
  - **NEVER make real API calls in tests** — always mock PrismaService, RuvectorService, SonaWeightAdapter
  - **NEVER skip SONA trajectory recording** — every decision should produce a trajectory for weight optimization
  - **NEVER use a global correction lookback** — scope to tenant + agent type + 30-day window
  - **NEVER hard-code the correction threshold** — use configurable constants (3 corrections, 10% penalty, 30-day window)
  - **NEVER assume `wasCorrect` in post-decision** — default to `true` but accept updates from correction flow
  - **NEVER store PII in audit log details** — store transaction IDs, account codes, and confidence, not personal data
  - **NEVER use floating-point for monetary values** — always integer cents
  - **NEVER use the existing `postDecision` ruvector embedding as a replacement for SONA recording** — they serve different purposes (embedding for similarity search, SONA trajectory for weight optimization)
</anti_patterns>

</task_spec>
