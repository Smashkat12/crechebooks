<task_spec id="TASK-STUB-004" version="2.0">

<metadata>
  <title>FeedbackLoop Real Integration</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>804</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-STUB-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-002</task_ref>
    <task_ref status="ready">TASK-STUB-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `FeedbackLoopStub` class defined locally in
  `apps/api/src/agents/memory/correction-handler.ts` (lines 27-31) has a
  `processFeedback()` method that is a complete no-op. When a human accountant
  corrects an agent's categorization or payment match, the correction is:
  1. Stored in Prisma `CorrectionFeedback` table (via `AgentMemoryService.recordCorrection()`)
  2. Processed by `PatternLearner` for payee pattern creation (3+ corrections threshold)
  3. Passed to `FeedbackLoopStub.processFeedback()` which does **nothing**

  This means corrections are persisted for audit but NEVER fed back to the learning
  systems. The `LearningEngine` (TASK-STUB-003) receives no reward signals, and the
  `FastAgentDB` (TASK-STUB-002) receives no correction episodes. The agents cannot
  learn from their mistakes.

  **Gap Analysis:**
  - `FeedbackLoopStub.processFeedback()` is a no-op — corrections are lost to learning
  - No reward signal sent to `LearningEngine` when a correction occurs — the RL agent
    never learns that its routing decision led to a wrong outcome
  - No correction episode stored in `FastAgentDB` — similar future transactions
    cannot benefit from past corrections
  - No reflective learning via `ReflexionMemory` — no strategy adaptation from failures
  - No SONA trajectory recording for corrections (forward-compatible, will be wired later)
  - The `CorrectionHandler.handleCorrection()` method calls the stub but does not
    integrate with any real learning system
  - `AgentMemoryService.recordCorrection()` updates Prisma but does not propagate
    correction data to LearningEngine, FastAgentDB, or ReflexionMemory

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm (NEVER npm)
  - Language: TypeScript (strict mode)
  - Testing: Jest
  - ruvector v0.1.96:
    - `LearningEngine` — RL agent for routing (from TASK-STUB-003, already integrated)
    - `FastAgentDB` — episode storage (from TASK-STUB-002, already integrated via adapter)
    - `SonaEngine` — continual learning (future, used optionally)
  - agentic-flow v2.0.2-alpha:
    - `ReflexionMemory` — reflective learning (from TASK-STUB-002, already via adapter)
  - Existing code:
    - `CorrectionHandler` at `apps/api/src/agents/memory/correction-handler.ts`
    - `AgentMemoryService` at `apps/api/src/agents/memory/agent-memory.service.ts`
    - `PatternLearner` at `apps/api/src/agents/memory/pattern-learner.ts`
    - `LearningRouter` at `apps/api/src/agents/shared/learning-router.ts` (from TASK-STUB-003)
    - `FastAgentDBAdapter` at `apps/api/src/agents/memory/fast-agentdb.adapter.ts` (from TASK-STUB-002)

  **Files to Create:**
  - `apps/api/src/agents/memory/real-feedback-loop.ts` — Real feedback loop integrating
    LearningEngine + FastAgentDB + ReflexionMemory + optional SONA
  - `apps/api/src/agents/memory/interfaces/feedback-loop.interface.ts` — Feedback loop
    interfaces and types
  - `apps/api/tests/agents/memory/real-feedback-loop.spec.ts` — Unit tests

  **Files to Modify:**
  - `apps/api/src/agents/memory/correction-handler.ts` — Replace `FeedbackLoopStub`
    with injected `RealFeedbackLoop`
  - `apps/api/src/agents/memory/agent-memory.module.ts` — Register `RealFeedbackLoop`,
    import SharedModule for `LearningRouter`
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands must use:
  ```bash
  pnpm run build                               # Build
  pnpm test                                    # Test
  pnpm run lint                                # Lint
  ```
  NEVER run `npm install`, `npm run`, or `npx` for project dependencies.

  ### 2. RealFeedbackLoop — Multi-System Integration
  The feedback loop is the central coordinator that propagates corrections to all
  learning subsystems. It does NOT own any of these systems — it calls into them:
  ```typescript
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import type {
    FeedbackLoopInterface,
    FeedbackData,
    FeedbackResult,
    FeedbackTarget,
  } from './interfaces/feedback-loop.interface';

  @Injectable()
  export class RealFeedbackLoop implements FeedbackLoopInterface {
    private readonly logger = new Logger(RealFeedbackLoop.name);

    constructor(
      @Optional()
      @Inject('LearningRouter')
      private readonly learningRouter?: LearningRouterInterface,
      @Optional()
      @Inject(FastAgentDBAdapter)
      private readonly agentDb?: FastAgentDBAdapter,
      @Optional()
      @Inject('SonaEngine')
      private readonly sonaEngine?: SonaEngineInterface,
    ) {}

    /**
     * Process a correction feedback through all learning subsystems.
     *
     * Execution order (all non-blocking):
     * 1. Send negative reward to LearningEngine (routing learns from mistake)
     * 2. Store correction episode in FastAgentDB (memory for similar future queries)
     * 3. Store reflective episode in ReflexionMemory (via FastAgentDB adapter)
     * 4. Record SONA trajectory (when available, quality=0 for corrections)
     *
     * Each write is independent — failure in one does not block others.
     * All writes use .catch() pattern (fire-and-forget).
     */
    async processFeedback(data: FeedbackData): Promise<FeedbackResult> {
      const targets: FeedbackTarget[] = [];
      const errors: string[] = [];

      // 1. LearningEngine reward signal
      if (this.learningRouter) {
        this.sendLearningReward(data)
          .then(() => targets.push('LEARNING_ENGINE'))
          .catch((err: Error) => {
            errors.push(`LearningEngine: ${err.message}`);
            this.logger.warn(`Feedback to LearningEngine failed: ${err.message}`);
          });
      }

      // 2. FastAgentDB correction episode
      if (this.agentDb?.isAvailable()) {
        this.storeCorrectionEpisode(data)
          .then(() => targets.push('FAST_AGENT_DB'))
          .catch((err: Error) => {
            errors.push(`FastAgentDB: ${err.message}`);
            this.logger.warn(`Feedback to FastAgentDB failed: ${err.message}`);
          });
      }

      // 3. SONA trajectory (optional, forward-compatible)
      if (this.sonaEngine) {
        this.recordSonaTrajectory(data)
          .then(() => targets.push('SONA_ENGINE'))
          .catch((err: Error) => {
            errors.push(`SonaEngine: ${err.message}`);
            this.logger.warn(`Feedback to SonaEngine failed: ${err.message}`);
          });
      }

      return {
        processed: true,
        targets,
        errors: errors.length > 0 ? errors : undefined,
      };
    }
  }
  ```

  ### 3. LearningEngine Reward Signal on Correction
  When a correction is received, send a NEGATIVE reward to the LearningEngine
  so the routing agent learns that its chosen path produced a wrong outcome:
  ```typescript
  /**
   * Send a negative reward signal to the LearningEngine.
   *
   * Reward values for corrections:
   *   -0.5 — standard correction (original decision was wrong)
   *   -0.3 — partial correction (right category, wrong sub-account)
   *   -1.0 — critical correction (fundamentally wrong, e.g. debit vs credit)
   *
   * The reward magnitude is determined by the correction type.
   */
  private async sendLearningReward(data: FeedbackData): Promise<void> {
    if (!this.learningRouter) return;

    const reward = this.computeReward(data);

    await this.learningRouter.recordReward({
      context: {
        tenantId: data.tenantId,
        agentType: this.resolveAgentType(data),
      },
      action: data.originalDecision?.source ?? 'HYBRID',
      reward,
      done: true,
    });

    this.logger.debug(
      `Sent reward ${String(reward)} to LearningEngine for correction ${data.agentDecisionId}`,
    );
  }

  /**
   * Compute reward magnitude based on correction type.
   */
  private computeReward(data: FeedbackData): number {
    const original = data.originalValue;
    const corrected = data.correctedValue;

    // Check if it's a partial correction (same category, different sub-account)
    if (
      original &&
      corrected &&
      typeof original === 'object' &&
      typeof corrected === 'object' &&
      'accountCode' in original &&
      'accountCode' in corrected
    ) {
      const origCode = String((original as Record<string, unknown>)['accountCode']);
      const corrCode = String((corrected as Record<string, unknown>)['accountCode']);

      // Same first 2 digits = same category, different sub-account
      if (origCode.substring(0, 2) === corrCode.substring(0, 2)) {
        return -0.3; // Partial — right area, wrong specific account
      }
    }

    return -0.5; // Standard correction
  }
  ```

  ### 4. FastAgentDB Correction Episode Storage
  Store the correction as a negative-reward episode for future similarity search:
  ```typescript
  /**
   * Store a correction episode in FastAgentDB.
   *
   * This enables the agent to find similar corrections in the future:
   * "I corrected a similar Woolworths transaction before — the right account was 4200"
   */
  private async storeCorrectionEpisode(data: FeedbackData): Promise<void> {
    if (!this.agentDb?.isAvailable()) return;

    await this.agentDb.recordCorrection({
      tenantId: data.tenantId,
      agentDecisionId: data.agentDecisionId,
      originalValue: (data.originalValue ?? {}) as Record<string, unknown>,
      correctedValue: (data.correctedValue ?? {}) as Record<string, unknown>,
      correctedBy: data.correctedBy ?? 'unknown',
    });

    this.logger.debug(
      `Stored correction episode in FastAgentDB for decision ${data.agentDecisionId}`,
    );
  }
  ```

  ### 5. SONA Trajectory (Forward-Compatible, Optional)
  Record correction as a SONA trajectory with quality=0 for continual learning:
  ```typescript
  /**
   * Interface for optional SONA engine integration.
   * SonaEngine is from ruvector — not yet integrated (TASK-STUB-005).
   * This interface is forward-compatible.
   */
  interface SonaEngineInterface {
    beginTrajectory(embedding: number[]): Promise<string>;
    addStep(
      trajectoryId: string,
      step: { state: unknown; action: string; reward: number },
    ): Promise<void>;
    endTrajectory(trajectoryId: string, quality: number): Promise<void>;
  }

  /**
   * Record a correction as a SONA trajectory with quality=0.
   * Quality=0 means "this was a failure" — SONA will learn to avoid
   * similar patterns in the future.
   */
  private async recordSonaTrajectory(data: FeedbackData): Promise<void> {
    if (!this.sonaEngine) return;

    // SONA needs an embedding to begin a trajectory.
    // Use a zero-vector placeholder (real embeddings from TASK-STUB-005).
    const placeholderEmbedding = new Array(384).fill(0);

    const trajId = await this.sonaEngine.beginTrajectory(placeholderEmbedding);

    await this.sonaEngine.addStep(trajId, {
      state: {
        tenantId: data.tenantId,
        originalValue: data.originalValue,
      },
      action: JSON.stringify(data.correctedValue),
      reward: -1.0,
    });

    await this.sonaEngine.endTrajectory(trajId, 0.0); // quality=0 for corrections

    this.logger.debug(
      `Recorded SONA correction trajectory ${trajId} for decision ${data.agentDecisionId}`,
    );
  }
  ```

  ### 6. Feedback Loop Interfaces
  ```typescript
  // apps/api/src/agents/memory/interfaces/feedback-loop.interface.ts

  import type { PatternLearnResult } from './agent-memory.interface';

  /** Data received from a correction event */
  export interface FeedbackData {
    /** Tenant ID for scoping */
    tenantId: string;
    /** ID of the original agent decision that was corrected */
    agentDecisionId: string;
    /** The original (incorrect) decision value */
    originalValue: unknown;
    /** The human-corrected value */
    correctedValue: unknown;
    /** Who made the correction (user ID) */
    correctedBy?: string;
    /** Reason for the correction */
    reason?: string;
    /** The original decision metadata (includes source, confidence, etc.) */
    originalDecision?: {
      source: string;
      confidence: number;
      agentType: string;
    };
    /** Pattern learning result from PatternLearner (already processed) */
    patternResult?: PatternLearnResult;
  }

  /** Which learning subsystems received the feedback */
  export type FeedbackTarget =
    | 'LEARNING_ENGINE'
    | 'FAST_AGENT_DB'
    | 'REFLEXION_MEMORY'
    | 'SONA_ENGINE';

  /** Result of processing feedback through all subsystems */
  export interface FeedbackResult {
    /** Whether feedback was processed (always true, even if all targets failed) */
    processed: boolean;
    /** Which targets received the feedback successfully */
    targets: FeedbackTarget[];
    /** Errors from failed targets (empty if all succeeded) */
    errors?: string[];
  }

  /** Full interface for the feedback loop */
  export interface FeedbackLoopInterface {
    processFeedback(data: FeedbackData): Promise<FeedbackResult>;
  }
  ```

  ### 7. Integration into CorrectionHandler
  Replace the inline `FeedbackLoopStub` with injected `RealFeedbackLoop`:
  ```typescript
  import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
  import { AgentMemoryService } from './agent-memory.service';
  import { RealFeedbackLoop } from './real-feedback-loop';
  import type {
    RecordCorrectionParams,
    PatternLearnResult,
  } from './interfaces/agent-memory.interface';

  @Injectable()
  export class CorrectionHandler {
    private readonly logger = new Logger(CorrectionHandler.name);

    constructor(
      @Inject(AgentMemoryService)
      private readonly memoryService: AgentMemoryService,
      @Optional()
      @Inject(RealFeedbackLoop)
      private readonly feedbackLoop?: RealFeedbackLoop,
    ) {}

    async handleCorrection(
      params: RecordCorrectionParams,
    ): Promise<PatternLearnResult> {
      let result: PatternLearnResult;

      try {
        result = await this.memoryService.recordCorrection(params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`recordCorrection failed: ${msg}`);
        result = { patternCreated: false, reason: `Correction failed: ${msg}` };
      }

      // Run real feedback loop (non-blocking)
      if (this.feedbackLoop) {
        this.feedbackLoop
          .processFeedback({
            tenantId: params.tenantId,
            agentDecisionId: params.agentDecisionId,
            originalValue: params.originalValue,
            correctedValue: params.correctedValue,
            correctedBy: params.correctedBy,
            reason: params.reason,
            patternResult: result,
          })
          .catch((err: Error) => {
            this.logger.warn(`Feedback loop failed: ${err.message}`);
          });
      }

      return result;
    }
  }
  ```

  ### 8. Preserving Existing Prisma Writes
  The `AgentMemoryService.recordCorrection()` already handles:
  - Updating `AgentDecision.wasCorrect = false` and `AgentDecision.correctedTo`
  - Creating `CorrectionFeedback` record
  - Triggering `PatternLearner.processCorrection()`
  - Writing to `FastAgentDBAdapter.recordCorrection()` (from TASK-STUB-002)

  The `RealFeedbackLoop` adds ADDITIONAL writes on top. It does NOT replace or
  duplicate any of the above. The flow is:
  ```
  User Correction
    |
    v
  CorrectionHandler.handleCorrection()
    |
    ├── AgentMemoryService.recordCorrection() [AWAITED — critical]
    |   ├── FastAgentDBAdapter.recordCorrection() [fire-and-forget]     <- from TASK-STUB-002
    |   ├── Prisma agentDecision.update() [awaited — compliance]        <- EXISTING
    |   ├── Prisma correctionFeedback.create() [awaited — compliance]   <- EXISTING
    |   └── PatternLearner.processCorrection() [awaited — pattern]      <- EXISTING
    |
    └── RealFeedbackLoop.processFeedback() [fire-and-forget]            <- NEW (this task)
        ├── LearningRouter.recordReward() [fire-and-forget]             <- NEW (routing RL)
        ├── FastAgentDB correction episode [fire-and-forget]            <- NEW (memory)
        └── SonaEngine trajectory [fire-and-forget, optional]           <- NEW (forward-compat)
  ```

  **IMPORTANT**: Note that `FastAgentDBAdapter.recordCorrection()` is called from
  BOTH `AgentMemoryService` (TASK-STUB-002) AND `RealFeedbackLoop` (this task).
  This is intentional — `AgentMemoryService` records the basic correction, while
  `RealFeedbackLoop` may add additional context or process the correction differently
  for RL purposes. The adapter is idempotent for the same `agentDecisionId`.

  To avoid duplicate episode storage, `RealFeedbackLoop` should ONLY call the
  `LearningRouter.recordReward()` and optionally SONA. It should NOT re-call
  `FastAgentDBAdapter.recordCorrection()` since that is already done in
  `AgentMemoryService.recordCorrection()`.

  **CORRECTED FLOW** (no duplicate writes):
  ```
  CorrectionHandler.handleCorrection()
    |
    ├── AgentMemoryService.recordCorrection() [AWAITED]
    |   ├── FastAgentDBAdapter.recordCorrection() [.catch()]   <- episode stored HERE
    |   ├── Prisma writes [awaited]                            <- compliance
    |   └── PatternLearner [awaited]                           <- patterns
    |
    └── RealFeedbackLoop.processFeedback() [.catch()]
        ├── LearningRouter.recordReward() [.catch()]           <- routing RL ONLY
        └── SonaEngine trajectory [.catch(), optional]         <- forward-compat ONLY
  ```

  ### 9. @Optional() @Inject() for All Dependencies
  ```typescript
  // CORRECT: All learning subsystems are optional
  constructor(
    @Optional()
    @Inject('LearningRouter')
    private readonly learningRouter?: LearningRouterInterface,
    @Optional()
    @Inject(FastAgentDBAdapter)
    private readonly agentDb?: FastAgentDBAdapter,
    @Optional()
    @Inject('SonaEngine')
    private readonly sonaEngine?: SonaEngineInterface,
  ) {}

  // The system works with NONE of these available.
  // It works with ANY SUBSET available.
  // It works with ALL available.
  // Each is independently optional.
  ```

  ### 10. Non-Blocking Everything (.catch() Pattern)
  ALL feedback writes MUST be non-blocking:
  ```typescript
  // CORRECT: Non-blocking feedback processing
  this.feedbackLoop
    .processFeedback(data)
    .catch((err: Error) => {
      this.logger.warn(`Feedback loop failed: ${err.message}`);
    });

  // Inside processFeedback, each target is also non-blocking:
  this.sendLearningReward(data)
    .catch((err: Error) => { ... });
  this.recordSonaTrajectory(data)
    .catch((err: Error) => { ... });

  // WRONG: Never await feedback processing in the main path
  // const result = await this.feedbackLoop.processFeedback(data);  // NEVER
  ```

  ### 11. Module Registration
  ```typescript
  // apps/api/src/agents/memory/agent-memory.module.ts
  import { Module, forwardRef } from '@nestjs/common';
  import { AgentMemoryService } from './agent-memory.service';
  import { PatternLearner } from './pattern-learner';
  import { CorrectionHandler } from './correction-handler';
  import { FastAgentDBAdapter } from './fast-agentdb.adapter';
  import { RealFeedbackLoop } from './real-feedback-loop';
  import { PrismaModule } from '../../database/prisma';
  import { SdkAgentModule } from '../sdk';
  import { SharedModule } from '../shared/shared.module'; // For LearningRouter

  @Module({
    imports: [
      PrismaModule,
      SdkAgentModule,
      forwardRef(() => SharedModule), // LearningRouter lives in SharedModule
    ],
    providers: [
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
      FastAgentDBAdapter,
      RealFeedbackLoop,
    ],
    exports: [
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
      FastAgentDBAdapter,
      RealFeedbackLoop,
    ],
  })
  export class AgentMemoryModule {}
  ```

  ### 12. Helper: Agent Type Resolution
  ```typescript
  /**
   * Resolve the agent type from feedback data.
   * Falls back to 'categorizer' if not specified.
   */
  private resolveAgentType(
    data: FeedbackData,
  ): 'categorizer' | 'matcher' {
    const agentType = data.originalDecision?.agentType;
    if (agentType === 'categorizer' || agentType === 'matcher') {
      return agentType;
    }
    // Default to categorizer (most common correction type)
    return 'categorizer';
  }
  ```

  ### 13. Testing Pattern — Mock All Subsystems
  ```typescript
  describe('RealFeedbackLoop', () => {
    let feedbackLoop: RealFeedbackLoop;
    let mockLearningRouter: {
      recordReward: jest.Mock;
      isAvailable: jest.Mock;
    };
    let mockAgentDb: {
      recordCorrection: jest.Mock;
      isAvailable: jest.Mock;
    };
    let mockSonaEngine: {
      beginTrajectory: jest.Mock;
      addStep: jest.Mock;
      endTrajectory: jest.Mock;
    };

    const baseFeedbackData: FeedbackData = {
      tenantId: 'tenant-123',
      agentDecisionId: 'dec-001',
      originalValue: { accountCode: '4100', vatType: 'STANDARD' },
      correctedValue: { accountCode: '4200', vatType: 'EXEMPT' },
      correctedBy: 'user-001',
      reason: 'Wrong account category',
      originalDecision: {
        source: 'LLM',
        confidence: 75,
        agentType: 'categorizer',
      },
    };

    beforeEach(async () => {
      mockLearningRouter = {
        recordReward: jest.fn().mockResolvedValue(undefined),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      mockAgentDb = {
        recordCorrection: jest.fn().mockResolvedValue(undefined),
        isAvailable: jest.fn().mockReturnValue(true),
      };

      mockSonaEngine = {
        beginTrajectory: jest.fn().mockResolvedValue('traj-001'),
        addStep: jest.fn().mockResolvedValue(undefined),
        endTrajectory: jest.fn().mockResolvedValue(undefined),
      };

      const module = await Test.createTestingModule({
        providers: [
          RealFeedbackLoop,
          { provide: 'LearningRouter', useValue: mockLearningRouter },
          { provide: FastAgentDBAdapter, useValue: mockAgentDb },
          { provide: 'SonaEngine', useValue: mockSonaEngine },
        ],
      }).compile();

      feedbackLoop = module.get(RealFeedbackLoop);
    });

    it('should send negative reward to LearningEngine on correction', async () => {
      await feedbackLoop.processFeedback(baseFeedbackData);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            tenantId: 'tenant-123',
            agentType: 'categorizer',
          }),
          action: 'LLM',
          reward: -0.5, // Standard correction (different first 2 digits)
          done: true,
        }),
      );
    });

    it('should compute partial reward for same-category correction', async () => {
      const partialData = {
        ...baseFeedbackData,
        originalValue: { accountCode: '4100' },
        correctedValue: { accountCode: '4120' }, // Same first 2 digits
      };

      await feedbackLoop.processFeedback(partialData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
        expect.objectContaining({
          reward: -0.3, // Partial correction
        }),
      );
    });

    it('should NOT call FastAgentDB recordCorrection (avoid duplicate)', async () => {
      await feedbackLoop.processFeedback(baseFeedbackData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // RealFeedbackLoop should NOT re-call recordCorrection
      // That is already done in AgentMemoryService.recordCorrection()
      expect(mockAgentDb.recordCorrection).not.toHaveBeenCalled();
    });

    it('should record SONA trajectory with quality=0', async () => {
      await feedbackLoop.processFeedback(baseFeedbackData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSonaEngine.beginTrajectory).toHaveBeenCalled();
      expect(mockSonaEngine.addStep).toHaveBeenCalledWith(
        'traj-001',
        expect.objectContaining({
          reward: -1.0,
        }),
      );
      expect(mockSonaEngine.endTrajectory).toHaveBeenCalledWith('traj-001', 0.0);
    });

    it('should work when no subsystems are available', async () => {
      const minimalModule = await Test.createTestingModule({
        providers: [RealFeedbackLoop],
        // No LearningRouter, no FastAgentDB, no SonaEngine
      }).compile();

      const minimalLoop = minimalModule.get(RealFeedbackLoop);
      const result = await minimalLoop.processFeedback(baseFeedbackData);

      expect(result.processed).toBe(true);
      expect(result.targets).toHaveLength(0);
    });

    it('should handle LearningEngine failure gracefully', async () => {
      mockLearningRouter.recordReward.mockRejectedValue(new Error('RL update failed'));

      const result = await feedbackLoop.processFeedback(baseFeedbackData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.processed).toBe(true);
      // Should not throw, just log warning
    });

    it('should handle SONA failure gracefully', async () => {
      mockSonaEngine.beginTrajectory.mockRejectedValue(new Error('SONA unavailable'));

      const result = await feedbackLoop.processFeedback(baseFeedbackData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(result.processed).toBe(true);
    });

    it('should default agent type to categorizer when unspecified', async () => {
      const noAgentData = {
        ...baseFeedbackData,
        originalDecision: undefined,
      };

      await feedbackLoop.processFeedback(noAgentData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            agentType: 'categorizer',
          }),
        }),
      );
    });

    it('should use original decision source as RL action', async () => {
      const patternData = {
        ...baseFeedbackData,
        originalDecision: {
          source: 'PATTERN',
          confidence: 85,
          agentType: 'matcher',
        },
      };

      await feedbackLoop.processFeedback(patternData);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLearningRouter.recordReward).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATTERN',
          context: expect.objectContaining({
            agentType: 'matcher',
          }),
        }),
      );
    });
  });

  describe('CorrectionHandler (with RealFeedbackLoop)', () => {
    it('should call feedbackLoop.processFeedback non-blocking', async () => {
      const mockFeedbackLoop = {
        processFeedback: jest.fn().mockResolvedValue({
          processed: true,
          targets: ['LEARNING_ENGINE'],
        }),
      };

      const handler = new CorrectionHandler(
        mockMemoryService as any,
        mockFeedbackLoop as any,
      );

      const result = await handler.handleCorrection(correctionParams);
      expect(result).toBeDefined();

      // processFeedback should be called but NOT awaited
      expect(mockFeedbackLoop.processFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: correctionParams.tenantId,
          agentDecisionId: correctionParams.agentDecisionId,
        }),
      );
    });

    it('should work when feedbackLoop is not injected', async () => {
      const handler = new CorrectionHandler(mockMemoryService as any);
      const result = await handler.handleCorrection(correctionParams);
      expect(result).toBeDefined();
    });
  });
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks processes bank transactions for creche businesses. When agents make wrong
  categorization or matching decisions, human accountants correct them via the UI. These
  corrections are the most valuable learning signal the system has:

  1. **Direct error signal**: A correction unambiguously tells the system "you were wrong
     and this is the right answer." This is gold for reinforcement learning.
  2. **Pattern signal**: If the same payee is corrected 3+ times to the same account,
     a PayeePattern is created (existing PatternLearner logic, preserved).
  3. **Routing signal**: If the LLM-selected path consistently gets corrected, the
     RL agent should learn to prefer heuristic routing for that tenant/context.
  4. **Memory signal**: The correction episode is stored so future similar transactions
     can find it via vector similarity search.

  Without the feedback loop, all corrections are "fire and forget" — persisted for
  audit in Prisma but never used for learning. The system makes the same mistakes
  repeatedly because no learning system receives the correction data.

  ## SA Compliance Notes
  - All monetary values stored as integers (cents)
  - Corrections must be stored in Prisma CorrectionFeedback table (compliance, POPIA)
  - No PII in learning system data (only IDs, codes, confidence, correctness)
  - Tenant isolation: corrections must be scoped to tenant

  ## Architectural Decisions
  - **Non-blocking feedback**: All learning writes are fire-and-forget with `.catch()`.
    The correction response returns immediately after Prisma writes. Learning
    happens asynchronously.
  - **No duplicate writes**: `RealFeedbackLoop` does NOT re-call
    `FastAgentDBAdapter.recordCorrection()` because that is already done in
    `AgentMemoryService.recordCorrection()`. The feedback loop focuses on the
    LearningEngine reward signal and optional SONA trajectory.
  - **Partial reward signal**: Corrections within the same account category (same
    first 2 digits) get a smaller penalty (-0.3) than cross-category corrections (-0.5).
    This teaches the RL agent that being "close" is better than being wrong.
  - **Forward-compatible SONA**: The SonaEngine interface is defined and injected but
    will only be wired when TASK-STUB-005 is complete. Currently uses injection token
    that resolves to undefined.
  - **All subsystems optional**: The feedback loop works with zero, one, two, or all
    three subsystems available. Each is independently optional via `@Optional()`.
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `RealFeedbackLoop` implementing `FeedbackLoopInterface`
    - Create interfaces: `FeedbackLoopInterface`, `FeedbackData`, `FeedbackResult`,
      `FeedbackTarget`, `SonaEngineInterface` (forward-compatible)
    - Implement `sendLearningReward()` — sends negative reward to LearningRouter
    - Implement `computeReward()` — differentiates standard (-0.5) vs partial (-0.3) corrections
    - Implement `recordSonaTrajectory()` — forward-compatible SONA integration (quality=0)
    - Implement `resolveAgentType()` — resolves agent type from feedback data
    - Replace `FeedbackLoopStub` in `correction-handler.ts` with injected `RealFeedbackLoop`
    - Preserve existing `AgentMemoryService.recordCorrection()` flow unchanged
    - Preserve existing `PatternLearner.processCorrection()` call
    - Preserve existing Prisma CorrectionFeedback and AgentDecision writes
    - Register `RealFeedbackLoop` in `agent-memory.module.ts`
    - Use `@Optional() @Inject()` for LearningRouter, FastAgentDBAdapter, SonaEngine
    - Use `.catch()` for ALL non-critical writes
    - No duplicate FastAgentDB writes (already done in AgentMemoryService)
    - Unit tests: reward signal, partial reward, SONA trajectory, no subsystems,
      failure recovery, agent type resolution, non-blocking behavior
    - Build succeeds (`pnpm run build`)
    - All existing tests still pass
  </in_scope>

  <out_of_scope>
    - SONA engine integration (TASK-STUB-005 — only interface defined here)
    - GNN pattern learning from corrections (TASK-STUB-007)
    - Frontend correction UI changes
    - Batch reprocessing of historical corrections
    - FastAgentDB episode storage (already handled by TASK-STUB-002)
    - LearningEngine setup (already handled by TASK-STUB-003)
    - ReflexionMemory integration (already via FastAgentDBAdapter from TASK-STUB-002)
    - Prisma schema changes
    - Positive reward signals (sent elsewhere when decisions are confirmed correct)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify files exist
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/memory/real-feedback-loop.ts
ls -la apps/api/src/agents/memory/interfaces/feedback-loop.interface.ts
ls -la apps/api/tests/agents/memory/real-feedback-loop.spec.ts

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run feedback-loop-specific tests
pnpm test -- --testPathPattern="agents/memory/real-feedback-loop" --runInBand

# 4. Run all memory tests
pnpm test -- --testPathPattern="agents/memory" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify FeedbackLoopStub REMOVED from correction-handler.ts
grep -c "class FeedbackLoopStub" apps/api/src/agents/memory/correction-handler.ts
# Expected: 0

# 8. Verify RealFeedbackLoop injected in CorrectionHandler
grep "RealFeedbackLoop" apps/api/src/agents/memory/correction-handler.ts

# 9. Verify @Optional() @Inject() pattern on CorrectionHandler
grep -A1 "@Optional" apps/api/src/agents/memory/correction-handler.ts | grep "feedbackLoop"

# 10. Verify RealFeedbackLoop registered in module
grep "RealFeedbackLoop" apps/api/src/agents/memory/agent-memory.module.ts

# 11. Verify non-blocking .catch() pattern in CorrectionHandler
grep "\.catch" apps/api/src/agents/memory/correction-handler.ts

# 12. Verify LearningRouter integration
grep "learningRouter" apps/api/src/agents/memory/real-feedback-loop.ts
grep "recordReward" apps/api/src/agents/memory/real-feedback-loop.ts

# 13. Verify reward computation
grep "computeReward" apps/api/src/agents/memory/real-feedback-loop.ts
grep "\-0.5\|\-0.3" apps/api/src/agents/memory/real-feedback-loop.ts

# 14. Verify SONA trajectory (forward-compatible)
grep "SonaEngine" apps/api/src/agents/memory/real-feedback-loop.ts
grep "beginTrajectory\|endTrajectory" apps/api/src/agents/memory/real-feedback-loop.ts

# 15. Verify NO duplicate FastAgentDB calls in RealFeedbackLoop
grep -c "agentDb.*recordCorrection\|agentDb.*store" apps/api/src/agents/memory/real-feedback-loop.ts
# Expected: 0 (recordCorrection is called from AgentMemoryService, not RealFeedbackLoop)

# 16. Verify Prisma writes preserved in AgentMemoryService
grep "prisma.agentDecision" apps/api/src/agents/memory/agent-memory.service.ts
grep "prisma.correctionFeedback" apps/api/src/agents/memory/agent-memory.service.ts

# 17. Verify PatternLearner call preserved
grep "patternLearner" apps/api/src/agents/memory/agent-memory.service.ts

# 18. Verify no 'any' types
grep -rn ": any" apps/api/src/agents/memory/real-feedback-loop.ts && echo "FAIL" || echo "PASS"
grep -rn ": any" apps/api/src/agents/memory/interfaces/feedback-loop.interface.ts && echo "FAIL" || echo "PASS"

# 19. Verify interface exports
grep "FeedbackLoopInterface\|FeedbackData\|FeedbackResult" \
  apps/api/src/agents/memory/interfaces/feedback-loop.interface.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `RealFeedbackLoop` created as `@Injectable()` NestJS service implementing `FeedbackLoopInterface`
  - [ ] `RealFeedbackLoop.processFeedback()` sends negative reward to `LearningRouter.recordReward()`
  - [ ] `RealFeedbackLoop.processFeedback()` records SONA trajectory when SonaEngine available
  - [ ] `RealFeedbackLoop.processFeedback()` does NOT call `FastAgentDBAdapter.recordCorrection()` (avoids duplicate)
  - [ ] `RealFeedbackLoop.processFeedback()` returns `FeedbackResult` with targets and errors
  - [ ] `RealFeedbackLoop.computeReward()` returns -0.5 for standard corrections
  - [ ] `RealFeedbackLoop.computeReward()` returns -0.3 for partial corrections (same category, different sub-account)
  - [ ] `RealFeedbackLoop.resolveAgentType()` defaults to 'categorizer' when unspecified
  - [ ] `RealFeedbackLoop.sendLearningReward()` uses original decision source as RL action
  - [ ] `RealFeedbackLoop.recordSonaTrajectory()` begins trajectory, adds step (reward=-1.0), ends with quality=0
  - [ ] `SonaEngineInterface` defined for forward-compatible SONA integration
  - [ ] All subsystems injected via `@Optional() @Inject()` — system works with 0, 1, 2, or 3 available
  - [ ] All learning writes use `.catch()` pattern (non-blocking)
  - [ ] Interfaces created: `FeedbackLoopInterface`, `FeedbackData`, `FeedbackResult`, `FeedbackTarget`
  - [ ] `FeedbackLoopStub` class REMOVED from `correction-handler.ts`
  - [ ] `CorrectionHandler` uses `@Optional() @Inject(RealFeedbackLoop)` instead of inline stub
  - [ ] `CorrectionHandler.handleCorrection()` calls `feedbackLoop.processFeedback()` with `.catch()`
  - [ ] `CorrectionHandler.handleCorrection()` works when `feedbackLoop` is undefined
  - [ ] `RealFeedbackLoop` registered as provider in `agent-memory.module.ts`
  - [ ] `RealFeedbackLoop` exported from `agent-memory.module.ts`
  - [ ] `SharedModule` (or `LearningRouter`) imported for DI resolution
  - [ ] Existing `AgentMemoryService.recordCorrection()` flow PRESERVED unchanged
  - [ ] Existing Prisma `AgentDecision` and `CorrectionFeedback` writes PRESERVED
  - [ ] Existing `PatternLearner.processCorrection()` call PRESERVED
  - [ ] No duplicate episode writes to FastAgentDB
  - [ ] Unit tests: sends negative reward (-0.5) to LearningEngine on standard correction
  - [ ] Unit tests: sends partial reward (-0.3) for same-category correction
  - [ ] Unit tests: records SONA trajectory with quality=0
  - [ ] Unit tests: works with no subsystems available (returns processed=true, targets=[])
  - [ ] Unit tests: handles LearningEngine failure gracefully
  - [ ] Unit tests: handles SonaEngine failure gracefully
  - [ ] Unit tests: defaults agent type to 'categorizer' when unspecified
  - [ ] Unit tests: uses original decision source as RL action
  - [ ] Unit tests: CorrectionHandler calls feedbackLoop non-blocking
  - [ ] Unit tests: CorrectionHandler works without feedbackLoop
  - [ ] Test coverage >= 90% for new code
  - [ ] Zero `any` types in new code (except minimal test mocks where unavoidable)
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass (no regressions)
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER duplicate FastAgentDB writes** — `AgentMemoryService.recordCorrection()` already
    calls `FastAgentDBAdapter.recordCorrection()`. The `RealFeedbackLoop` must NOT call it
    again. Only call `LearningRouter.recordReward()` and optionally SONA.
  - **NEVER await feedback processing in the main path** — `processFeedback()` must be called
    with `.catch()` from `CorrectionHandler`. The correction response must return immediately
    after Prisma writes complete.
  - **NEVER remove existing Prisma writes** — The `AgentMemoryService.recordCorrection()` flow
    is compliance-critical. All Prisma writes to `AgentDecision` and `CorrectionFeedback` must
    be preserved exactly as-is.
  - **NEVER remove PatternLearner call** — The existing `PatternLearner.processCorrection()`
    call in `AgentMemoryService.recordCorrection()` must remain. The `RealFeedbackLoop` adds
    additional learning on top, not as a replacement.
  - **NEVER use required injection** — all subsystems (`LearningRouter`, `FastAgentDBAdapter`,
    `SonaEngine`) must use `@Optional() @Inject()`. The system must work with zero subsystems.
  - **NEVER use `any` type** — use proper TypeScript types, generics, or `unknown` with guards
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER store PII in feedback data** — only IDs, codes, confidence, correctness. No names,
    addresses, phone numbers of account holders.
  - **NEVER use floating-point for monetary values** — always integer cents
  - **NEVER make real API calls in tests** — mock all subsystems
  - **NEVER send positive rewards from the feedback loop** — the feedback loop only handles
    corrections (negative signals). Positive rewards are sent when decisions are confirmed
    correct, which is a different flow.
  - **NEVER make SonaEngine a required dependency** — it is forward-compatible. The injection
    token resolves to `undefined` until TASK-STUB-005 wires it. The feedback loop must handle
    this gracefully.
  - **NEVER let a single subsystem failure block other subsystems** — if LearningEngine fails,
    SONA should still proceed (and vice versa). Each write is independent.
  - **NEVER use hard-coded reward values without documentation** — all reward magnitudes
    (-0.5, -0.3, -1.0, 0.0) must be documented with their meaning. Consider extracting to
    constants or an enum for maintainability.
  - **NEVER bypass the RealFeedbackLoop to call LearningRouter directly from CorrectionHandler** —
    the feedback loop is the coordination point. It handles reward computation, SONA integration,
    and error isolation. Direct calls would bypass this coordination.
</anti_patterns>

</task_spec>
