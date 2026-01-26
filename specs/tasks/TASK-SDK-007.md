<task_spec id="TASK-SDK-007" version="2.0">

<metadata>
  <title>OrchestratorAgent SDK Parent Agent Migration</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>agent</layer>
  <sequence>707</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-ORCHESTRATOR</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-003</task_ref>
    <task_ref status="ready">TASK-SDK-004</task_ref>
    <task_ref status="ready">TASK-SDK-005</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The current `OrchestratorAgent` (465 lines at `apps/api/src/agents/orchestrator/orchestrator.agent.ts`) manually routes workflows through a switch statement and executes agent calls strictly sequentially. It cannot run agents in parallel, has no context isolation between subagents, and cannot dynamically adapt execution order. The Claude Agent SDK provides subagent spawning with context isolation and parallel execution capabilities.

  Current flow: Manual switch on `request.type` -> sequential agent calls via `executeCategorization()`, `executePaymentMatching()`, etc. -> aggregate results into `WorkflowResult`.

  Proposed: Use **agentic-flow**'s built-in orchestration engine (dependency graphs, parallel execution, context isolation) instead of a custom `SdkOrchestrator` with manual `Promise.allSettled`. agentic-flow provides native orchestration with dependency graph resolution and per-step context isolation out of the box, eliminating the need for hand-rolled parallel execution logic. Additionally, **ruvector**'s `ruvector_route_query` and `ruvector_multi_agent_route` SQL functions enable dynamic agent routing -- the system can learn which agent performs best for a given workflow type and route accordingly. An **adaptor layer** (`WorkflowResultAdaptor`) is required to map agentic-flow's execution result format to CrecheBooks' existing `WorkflowResult` interface, which is a downstream contract that must not change.

  **Gap Analysis:**
  - No parallel execution of independent agent steps (e.g., BANK_IMPORT runs categorize THEN match sequentially even though they process different transaction sets)
  - No context isolation between agents (a failure in categorization crashes the entire BANK_IMPORT workflow)
  - No dynamic workflow adaptation (cannot reorder steps based on data characteristics)
  - Sequential-only execution model (categorize THEN match THEN EMP201 for MONTHLY_CLOSE)
  - Subagent failures cascade to full workflow failure (single try/catch around the entire switch block)
  - No subagent-level error recovery (WorkflowResult only tracks aggregate errors)

  **Key Files to Understand:**
  - `apps/api/src/agents/orchestrator/orchestrator.agent.ts` (465 lines) - Current orchestrator with switch-based routing
  - `apps/api/src/agents/orchestrator/interfaces/orchestrator.interface.ts` - WorkflowRequest, WorkflowResult, AgentResult, EscalationEntry, AutonomyLevel types
  - `apps/api/src/agents/orchestrator/workflow-router.ts` (185 lines) - WorkflowConfig map with autonomyLevel, agents list, isSequential flag
  - `apps/api/src/agents/orchestrator/escalation-manager.ts` (212 lines) - EscalationRecord with priority determination
  - `apps/api/src/agents/orchestrator/orchestrator.module.ts` - NestJS module importing TransactionCategorizerModule, PaymentMatcherModule, SarsAgentModule

  **Files to Create:**
  - `apps/api/src/agents/orchestrator/sdk-orchestrator.ts` - SDK parent agent class using agentic-flow orchestration engine
  - `apps/api/src/agents/orchestrator/orchestrator-prompt.ts` - System prompt for LLM-based workflow reasoning
  - `apps/api/src/agents/orchestrator/workflow-definitions.ts` - SDK workflow configs with step dependencies and parallelism
  - `apps/api/src/agents/orchestrator/workflow-result-adaptor.ts` - Adaptor that maps agentic-flow execution results to CrecheBooks WorkflowResult format
  - `apps/api/src/agents/orchestrator/interfaces/sdk-orchestrator.interface.ts` - SDK-specific interfaces
  - `tests/agents/orchestrator/sdk-orchestrator.spec.ts` - Unit tests for SDK orchestrator

  **Files to Modify:**
  - `apps/api/src/agents/orchestrator/orchestrator.agent.ts` - Add SDK orchestrator as optional delegate for complex multi-step workflows
  - `apps/api/src/agents/orchestrator/orchestrator.module.ts` - Add SdkOrchestrator to providers/exports
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm add`, etc.

  ### 2. Monetary Values in CENTS
  ALL monetary values are integers representing cents. NEVER use floats for money.
  ```typescript
  // CORRECT
  const amountCents: number = 15000; // R150.00

  // WRONG - NEVER DO THIS
  const amount: number = 150.00; // NEVER floats for money
  ```

  ### 3. Tenant Isolation on ALL Operations
  Every database query and agent call MUST include `tenantId`. No cross-tenant data leakage.
  ```typescript
  // CORRECT - tenantId passed to every subagent
  async spawnSubagent(agentType: string, context: { tenantId: string; /* ... */ }): Promise<SubagentResult> {
    if (!context.tenantId) {
      throw new Error('tenantId is required for subagent spawning');
    }
    // ...
  }
  ```

  ### 4. SARS Workflows Always L2
  SARS workflows (CALCULATE_PAYE, GENERATE_EMP201, GENERATE_VAT201) and any workflow containing SARS steps (MONTHLY_CLOSE) MUST use `L2_DRAFT` autonomy. NEVER auto-apply SARS results.
  ```typescript
  // CORRECT
  MONTHLY_CLOSE: {
    autonomyLevel: 'L2_DRAFT', // Contains SARS step -> always L2
  },

  // WRONG - NEVER DO THIS
  MONTHLY_CLOSE: {
    autonomyLevel: 'L3_FULL_AUTO', // SARS steps can NEVER be L3
  },
  ```

  ### 5. SDK Parent Agent Definition Pattern (agentic-flow orchestration)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { AgenticFlowOrchestrator } from 'agentic-flow';
  // Use agentic-flow's built-in orchestration instead of custom Promise.allSettled.
  // agentic-flow provides native dependency graphs, parallel execution, and context isolation.

  const ORCHESTRATOR_AGENT_DEF = {
    description: 'Coordinates CrecheBooks AI agents for complex multi-step workflows',
    prompt: ORCHESTRATOR_SYSTEM_PROMPT, // imported from orchestrator-prompt.ts
    model: 'haiku', // Orchestrator uses lightweight model - it routes, does not reason on data
    orchestration: {
      engine: 'agentic-flow', // Use agentic-flow's built-in orchestration engine
      dependencyResolution: true, // Automatic step dependency resolution
      contextIsolation: true, // Native per-step context isolation (replaces custom structuredClone)
    },
  };
  ```

  ### 6. Subagent Spawning with Context Isolation (agentic-flow native)
  agentic-flow provides native context isolation per step. Each subagent receives its own isolated context
  automatically -- no manual `structuredClone` needed. A failure in one subagent must not corrupt another.
  ```typescript
  interface SubagentContext {
    tenantId: string;
    workflowId: string;
    stepId: string;
    agentType: string;
    input: Record<string, unknown>;
  }

  // agentic-flow handles context isolation natively via its orchestration engine.
  // Each step in the dependency graph receives an isolated context copy.
  // Error isolation is built-in: failed steps are marked FAILED while others continue.
  async spawnSubagent(context: SubagentContext): Promise<SubagentResult> {
    try {
      // agentic-flow's orchestration engine provides per-step context isolation
      // No manual structuredClone needed -- the engine clones context per step
      const result = await this.agenticFlowOrchestrator.executeStep(context.agentType, {
        tenantId: context.tenantId,
        workflowId: context.workflowId,
        stepId: context.stepId,
        input: context.input, // Isolated by the engine automatically
      });
      return { status: 'SUCCESS', data: result };
    } catch (error) {
      // Error isolated - other subagents continue
      return {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  ```

  ### 7. Parallel Execution for BANK_IMPORT
  BANK_IMPORT processes two independent transaction sets: debits for categorization and credits for payment matching. These CAN run concurrently.
  ```typescript
  async executeBankImportParallel(request: WorkflowRequest, result: WorkflowResult): Promise<void> {
    const [catResult, matchResult] = await Promise.allSettled([
      this.spawnSubagent({
        tenantId: request.tenantId,
        workflowId: result.workflowId,
        stepId: 'categorize',
        agentType: 'categorizer',
        input: { tenantId: request.tenantId },
      }),
      this.spawnSubagent({
        tenantId: request.tenantId,
        workflowId: result.workflowId,
        stepId: 'match',
        agentType: 'matcher',
        input: { tenantId: request.tenantId },
      }),
    ]);

    // Process results regardless of individual failures
    this.processSettledResult(catResult, 'transaction-categorizer', result);
    this.processSettledResult(matchResult, 'payment-matcher', result);
  }
  ```

  ### 8. WorkflowResult Format Preservation
  The SDK orchestrator MUST produce the exact same `WorkflowResult` format as the current orchestrator. Downstream consumers depend on this shape.
  ```typescript
  // This interface MUST NOT change - it is the contract
  interface WorkflowResult {
    workflowId: string;
    type: WorkflowType;
    status: WorkflowStatus; // 'COMPLETED' | 'PARTIAL' | 'ESCALATED' | 'FAILED'
    autonomyLevel: AutonomyLevel;
    results: AgentResult[]; // { agent, processed, autoApplied, escalated, errors }
    escalations: EscalationEntry[];
    startedAt: string;
    completedAt: string;
  }
  ```

  ### 9. Fallback to Sequential Execution
  If the SDK is unavailable or fails to initialize, the orchestrator MUST fall back to the existing sequential execution path.
  ```typescript
  async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
    if (this.sdkOrchestrator && this.isMultiStepWorkflow(request.type)) {
      try {
        return await this.sdkOrchestrator.execute(request);
      } catch (error) {
        this.logger.warn(`SDK orchestrator failed, falling back to sequential: ${error}`);
        // Fall through to existing sequential logic
      }
    }
    // Existing sequential switch statement...
  }
  ```

  ### 10. NestJS Injectable Pattern
  All new classes MUST be `@Injectable()` and registered in `orchestrator.module.ts`.
  ```typescript
  @Injectable()
  export class SdkOrchestrator {
    constructor(
      private readonly agenticFlowOrchestrator: AgenticFlowOrchestrator,
      private readonly ruvectorService: RuvectorService,
      private readonly transactionCategorizer: TransactionCategorizerAgent,
      private readonly paymentMatcher: PaymentMatcherAgent,
      private readonly sarsAgent: SarsAgent,
      private readonly workflowRouter: WorkflowRouter,
      private readonly escalationManager: EscalationManager,
      private readonly prisma: PrismaService,
    ) {}
  }
  ```

  ### 11. WorkflowResultAdaptor Pattern
  agentic-flow returns its own execution result format. CrecheBooks' downstream consumers depend on the
  `WorkflowResult` interface. The adaptor MUST map between the two formats.
  ```typescript
  @Injectable()
  export class WorkflowResultAdaptor {
    /**
     * Converts agentic-flow's execution result into CrecheBooks' WorkflowResult format.
     * This is the ONLY place where agentic-flow result format is translated.
     * Downstream consumers NEVER see agentic-flow internals.
     */
    adapt(
      agenticFlowResult: AgenticFlowExecutionResult,
      workflowType: WorkflowType,
      autonomyLevel: AutonomyLevel,
    ): WorkflowResult {
      return {
        workflowId: agenticFlowResult.executionId,
        type: workflowType,
        status: this.mapStatus(agenticFlowResult),
        autonomyLevel,
        results: this.mapAgentResults(agenticFlowResult.steps),
        escalations: this.extractEscalations(agenticFlowResult.steps),
        startedAt: agenticFlowResult.startedAt,
        completedAt: agenticFlowResult.completedAt,
      };
    }

    private mapStatus(result: AgenticFlowExecutionResult): WorkflowStatus {
      if (result.allSucceeded) return 'COMPLETED';
      if (result.anySucceeded) return 'PARTIAL';
      return 'FAILED';
    }

    private mapAgentResults(steps: AgenticFlowStep[]): AgentResult[] {
      return steps.map(step => ({
        agent: step.agentType,
        processed: step.itemsProcessed ?? 0,
        autoApplied: step.itemsAutoApplied ?? 0,
        escalated: step.itemsEscalated ?? 0,
        errors: step.errors ?? [],
      }));
    }
  }
  ```

  ### 12. ruvector Agent Routing Pattern
  Use ruvector's SQL functions to dynamically route work to the best-performing agent for a given
  workflow type. SARS L2 enforcement is layered on top -- routing NEVER overrides compliance constraints.
  ```typescript
  // Use ruvector to dynamically route to best agent based on learned patterns
  async determineAgentRouting(
    workflowType: WorkflowType,
    context: { tenantId: string; transactionCount: number },
  ): Promise<AgentRoutingDecision> {
    // ruvector_route_query returns the best agent based on historical performance
    const routing = await this.ruvectorService.routeQuery(workflowType, context);

    // CRITICAL: SARS L2 enforcement is hardcoded ABOVE routing decisions
    if (this.isSarsWorkflow(workflowType)) {
      routing.autonomyLevel = 'L2_DRAFT'; // NEVER overridden by routing
    }

    return routing;
  }

  // For multi-agent workflows, use ruvector_multi_agent_route
  async routeMultiAgentWorkflow(
    workflowType: WorkflowType,
    steps: WorkflowStep[],
  ): Promise<MultiAgentRoutingPlan> {
    return this.ruvectorService.multiAgentRoute(workflowType, steps);
  }
  ```
</critical_patterns>

<context>
  ## Business Context

  The OrchestratorAgent is the top-level coordinator for all CrecheBooks AI workflows. It does NOT perform domain-specific work itself -- it routes to specialized agents:
  - **TransactionCategorizerAgent** - categorizes bank transactions (pattern matching + historical analysis)
  - **PaymentMatcherAgent** - matches credit transactions to outstanding invoices
  - **SarsAgent** - calculates PAYE, UIF, generates EMP201/VAT201 (ALWAYS L2 review)

  ### Workflow Types (from `orchestrator.interface.ts`)
  | Type | Agents | Autonomy | Sequential? |
  |------|--------|----------|-------------|
  | CATEGORIZE_TRANSACTIONS | categorizer | L3 | Single step |
  | MATCH_PAYMENTS | matcher | L3 | Single step |
  | CALCULATE_PAYE | sars | L2 | Single step |
  | GENERATE_EMP201 | sars | L2 | Single step |
  | GENERATE_VAT201 | sars | L2 | Single step |
  | BANK_IMPORT | categorizer, matcher | L3 | Currently sequential, CAN be parallel |
  | MONTHLY_CLOSE | categorizer, matcher, sars | L2 | Must be sequential (data dependencies) |

  ### SA Compliance Notes
  - MONTHLY_CLOSE includes EMP201 generation (mandatory monthly SARS return for employers).
  - All SARS workflows MUST remain L2 (draft for human review). This is a legal requirement.
  - Tax year runs March to February (relevant for period calculations).
  - Education services are VAT exempt under Section 12(h) of the VAT Act.

  ### Architecture Notes
  - The existing `OrchestratorAgent` constructor injects: `transactionCategorizer`, `paymentMatcher`, `sarsAgent`, `workflowRouter`, `escalationManager`, `prisma`.
  - `WorkflowRouter` has a Map of `WorkflowConfig` objects with `autonomyLevel`, `agents[]`, and `isSequential` flag.
  - `EscalationManager` logs to `.claude/logs/escalations.jsonl` with priority determination (SARS = high, WORKFLOW_ERROR = critical).
  - Decision logging goes to `.claude/logs/decisions.jsonl`.

  ### Why SDK Migration
  1. **Parallel execution** -- BANK_IMPORT can run categorization and payment matching concurrently (they process different transaction sets: debits vs credits).
  2. **Error isolation** -- One subagent failure should not crash the entire workflow. Currently, a crash in `executeCategorization()` prevents `executePaymentMatching()` from running.
  3. **Context isolation** -- Each subagent gets its own context, preventing state leakage between steps.
  4. **Dynamic adaptation** -- The SDK can choose execution strategies based on data characteristics (e.g., skip payment matching if no credits exist).
</context>

<scope>
  <in_scope>
    - SdkOrchestrator class (`@Injectable()`) using agentic-flow's built-in orchestration engine for dependency graphs, parallel execution, and context isolation
    - agentic-flow orchestration engine integration (replaces custom Promise.allSettled orchestration)
    - WorkflowResultAdaptor class to convert agentic-flow execution results to CrecheBooks' WorkflowResult format
    - ruvector agent routing integration (`ruvector_route_query`, `ruvector_multi_agent_route`) for dynamic workflow optimization
    - System prompt for orchestrator reasoning (orchestrator-prompt.ts)
    - Workflow definitions with step dependencies and parallel flags (workflow-definitions.ts)
    - SDK-specific interfaces (SubagentContext, SubagentResult, WorkflowStep, AgenticFlowExecutionResult, AgentRoutingDecision, etc.)
    - Parallel execution for BANK_IMPORT via agentic-flow dependency graph (categorize + match concurrently)
    - Error isolation between subagents (native to agentic-flow's orchestration engine)
    - Graceful fallback to existing sequential execution on SDK/agentic-flow failure
    - Integration into existing OrchestratorAgent (delegate to SDK for multi-step workflows)
    - Module registration in orchestrator.module.ts
    - WorkflowResult format preservation (exact same output shape, enforced through WorkflowResultAdaptor)
    - SARS L2 enforcement layered above ruvector routing decisions
    - Decision and escalation logging preserved
    - Unit tests for SdkOrchestrator (90%+ coverage)
    - Tests for parallel execution, error isolation, fallback behavior, WorkflowResultAdaptor mapping, ruvector routing
  </in_scope>
  <out_of_scope>
    - Individual agent SDK migrations (TASK-SDK-003 through TASK-SDK-006)
    - TASK-SDK-001: SDK foundation setup (dependency)
    - New workflow types beyond the existing 7
    - Frontend workflow monitoring or status dashboards
    - Claude-Flow topology integration (TASK-SDK-010)
    - WebSocket/real-time workflow progress updates
    - Agent retry/circuit-breaker patterns (future enhancement)
    - Prisma schema changes
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. TypeScript compilation
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run build

# 2. Lint check
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm run lint

# 3. Run SDK orchestrator tests
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="sdk-orchestrator"

# 4. Run all orchestrator tests (ensure no regressions)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="orchestrator"

# 5. Run all agent tests (ensure no regressions)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks && pnpm test -- --testPathPattern="agents"

# 6. Verify new files exist
ls -la apps/api/src/agents/orchestrator/sdk-orchestrator.ts
ls -la apps/api/src/agents/orchestrator/orchestrator-prompt.ts
ls -la apps/api/src/agents/orchestrator/workflow-definitions.ts
ls -la apps/api/src/agents/orchestrator/interfaces/sdk-orchestrator.interface.ts
ls -la tests/agents/orchestrator/sdk-orchestrator.spec.ts

# 7. Verify no SARS autonomy level changes
grep -n "L3_FULL_AUTO" apps/api/src/agents/orchestrator/workflow-definitions.ts
# Should NOT match any SARS workflow types (CALCULATE_PAYE, GENERATE_EMP201, GENERATE_VAT201, MONTHLY_CLOSE)
```
</verification_commands>

<definition_of_done>
  - [ ] `SdkOrchestrator` class created as `@Injectable()` NestJS provider at `apps/api/src/agents/orchestrator/sdk-orchestrator.ts`
  - [ ] `SdkOrchestrator` uses agentic-flow's built-in orchestration engine for dependency graph resolution, parallel execution, and context isolation
  - [ ] `WorkflowResultAdaptor` class created at `apps/api/src/agents/orchestrator/workflow-result-adaptor.ts` to convert agentic-flow execution results to CrecheBooks' `WorkflowResult` format
  - [ ] ruvector agent routing integrated via `ruvector_route_query` and `ruvector_multi_agent_route` for dynamic workflow optimization
  - [ ] `SdkOrchestrator` can spawn subagents for each agent type (categorizer, matcher, sars) with agentic-flow native context isolation
  - [ ] System prompt exported from `apps/api/src/agents/orchestrator/orchestrator-prompt.ts` with complete workflow routing instructions
  - [ ] Workflow definitions at `apps/api/src/agents/orchestrator/workflow-definitions.ts` cover all 7 workflow types with step dependencies and parallel flags
  - [ ] BANK_IMPORT executes categorization and payment matching in parallel via agentic-flow dependency graph (no manual `Promise.allSettled`)
  - [ ] MONTHLY_CLOSE executes sequentially (categorize -> match -> EMP201) due to data dependencies
  - [ ] Single-step workflows (CATEGORIZE_TRANSACTIONS, MATCH_PAYMENTS, CALCULATE_PAYE, GENERATE_EMP201, GENERATE_VAT201) delegate directly to the appropriate agent
  - [ ] Error isolation: one subagent failure sets that step to FAILED but other steps continue; final WorkflowResult status is PARTIAL
  - [ ] Fallback: if SDK initialization fails or subagent spawning throws, falls back to existing sequential execution in `OrchestratorAgent.executeWorkflow()`
  - [ ] `WorkflowResult` output format is IDENTICAL to current format (no interface changes)
  - [ ] `AgentResult` entries in `results[]` match existing `{ agent, processed, autoApplied, escalated, errors }` shape
  - [ ] Escalation entries are correctly aggregated from subagent results
  - [ ] Decision logging via `logWorkflowDecision()` still writes to `.claude/logs/decisions.jsonl`
  - [ ] SARS workflows remain `L2_DRAFT` -- no autonomy level changes
  - [ ] `orchestrator.module.ts` updated with `SdkOrchestrator` in providers
  - [ ] `orchestrator.agent.ts` modified to optionally delegate to `SdkOrchestrator` for multi-step workflows
  - [ ] SDK-specific interfaces defined at `apps/api/src/agents/orchestrator/interfaces/sdk-orchestrator.interface.ts`
  - [ ] Unit tests at `tests/agents/orchestrator/sdk-orchestrator.spec.ts` with 90%+ coverage
  - [ ] Tests cover: parallel execution (BANK_IMPORT), sequential execution (MONTHLY_CLOSE), error isolation, fallback behavior, single-step delegation, SARS L2 enforcement
  - [ ] `pnpm run build` passes with no errors
  - [ ] `pnpm run lint` passes with no warnings
  - [ ] All existing orchestrator tests continue to pass (no regressions)
</definition_of_done>

<anti_patterns>
  - **NEVER** change SARS autonomy levels -- CALCULATE_PAYE, GENERATE_EMP201, GENERATE_VAT201, and MONTHLY_CLOSE must ALWAYS be L2_DRAFT
  - **NEVER** skip error isolation -- one subagent failure must NOT crash the entire workflow; use `Promise.allSettled` for parallel steps and try/catch for sequential steps
  - **NEVER** remove the existing sequential fallback path -- the SDK orchestrator is an enhancement, not a replacement
  - **NEVER** spawn subagents without tenant context isolation -- every subagent call must include `tenantId`
  - **NEVER** modify the `WorkflowResult` interface -- downstream consumers depend on the exact shape
  - **NEVER** modify the `WorkflowRequest` interface -- callers depend on the exact shape
  - **NEVER** use `npm` -- always use `pnpm`
  - **NEVER** use floats for monetary values -- all amounts are in cents (integers)
  - **NEVER** allow cross-tenant data access in subagent contexts
  - **NEVER** auto-apply SARS calculation results -- they always require human review
  - **NEVER** expose agentic-flow's internal result format to downstream consumers -- always map through `WorkflowResultAdaptor`
  - **NEVER** let ruvector agent routing override SARS L2 enforcement -- compliance constraints are hardcoded above routing decisions
  - **NEVER** save test files or working files to the project root folder
</anti_patterns>

</task_spec>
