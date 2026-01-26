<task_spec id="TASK-SDK-012" version="2.0">

<metadata>
  <title>SDK Agent Integration Tests & Parallel Rollout Framework</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>integration</layer>
  <sequence>712</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-ROLLOUT</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-003</task_ref>
    <task_ref status="ready">TASK-SDK-004</task_ref>
    <task_ref status="ready">TASK-SDK-005</task_ref>
    <task_ref status="ready">TASK-SDK-006</task_ref>
    <task_ref status="ready">TASK-SDK-007</task_ref>
    <task_ref status="ready">TASK-SDK-008</task_ref>
    <task_ref status="ready">TASK-SDK-009</task_ref>
    <task_ref status="ready">TASK-SDK-010</task_ref>
    <task_ref status="ready">TASK-SDK-011</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The analysis specifies: "Gradual rollout -- Run LLM path alongside existing path, compare accuracy before switching." After all SDK agent migrations (TASK-SDK-003 through TASK-SDK-011) are complete, there is no mechanism to:
  1. Toggle SDK-enhanced behavior per tenant and per agent
  2. Run both the heuristic and LLM-enhanced paths simultaneously for comparison
  3. Compare SDK accuracy vs. heuristic accuracy before switching
  4. Safely roll back to heuristic-only if SDK accuracy is lower

  The current agents run purely heuristic logic (pattern matching, confidence scoring, rule-based decisions). The SDK migration adds LLM-enhanced reasoning to each agent. A safe rollout requires feature flags and a shadow-running framework to prove SDK accuracy before switching production traffic.

  **SDK Dependencies:**
  - **agentic-flow** (v2.0.2-alpha): Its multi-agent comparison capabilities align with the ShadowRunner concept -- agentic-flow can natively run both heuristic and LLM paths and compare results, simplifying the ShadowRunner implementation.
  - **ruvector** (v0.1.96): Vector operations (embedding generation, similarity search) must be covered by integration tests alongside Prisma.
  - Integration tests must cover the new agentic-flow + ruvector dependencies in addition to existing heuristic and SDK paths.
  - Feature flags remain **custom** (per-tenant, per-agent, instant rollback) -- this is domain-specific and cannot be replaced by agentic-flow's built-in flags which lack the required granularity.

  **Gap Analysis:**
  - No per-tenant, per-agent feature flags in the database
  - No shadow execution framework to run both paths simultaneously
  - No A/B comparison logging for heuristic vs. SDK results
  - No integration tests for SDK-enhanced agents in all operational modes
  - No rollback capability (currently all-or-nothing)
  - No way to gradually migrate tenants from heuristic to SDK
  - Existing 1536 tests only cover heuristic path

  **Files to Create:**
  - `apps/api/src/agents/rollout/feature-flags.service.ts` (Per-tenant, per-agent SDK toggle)
  - `apps/api/src/agents/rollout/shadow-runner.ts` (Runs both paths, compares results)
  - `apps/api/src/agents/rollout/rollout.module.ts` (NestJS module)
  - `apps/api/src/agents/rollout/interfaces/rollout.interface.ts` (Types and interfaces)
  - `tests/e2e/sdk-agents/categorizer-sdk.e2e.spec.ts` (E2E for SDK categorizer in all 3 modes)
  - `tests/e2e/sdk-agents/matcher-sdk.e2e.spec.ts` (E2E for SDK matcher in all 3 modes)
  - `tests/e2e/sdk-agents/sars-sdk.e2e.spec.ts` (E2E for SDK SARS agent in all 3 modes)
  - `tests/e2e/sdk-agents/validator-sdk.e2e.spec.ts` (E2E for SDK extraction validator in all 3 modes)
  - `tests/e2e/sdk-agents/orchestrator-sdk.e2e.spec.ts` (E2E for SDK orchestrator in all 3 modes)
  - `tests/e2e/sdk-agents/conversational-sdk.e2e.spec.ts` (E2E for conversational agent)
  - `tests/agents/rollout/feature-flags.service.spec.ts` (Unit tests)
  - `tests/agents/rollout/shadow-runner.spec.ts` (Unit tests)

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` (ADD FeatureFlag model)
  - `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` (USE FeatureFlagService + ShadowRunner)
  - `apps/api/src/agents/payment-matcher/matcher.agent.ts` (USE FeatureFlagService + ShadowRunner)
  - `apps/api/src/agents/sars-agent/sars.agent.ts` (USE FeatureFlagService + ShadowRunner)
  - `apps/api/src/agents/extraction-validator/validator.agent.ts` (USE FeatureFlagService + ShadowRunner)
  - `apps/api/src/agents/orchestrator/orchestrator.agent.ts` (USE FeatureFlagService + ShadowRunner)
  - `apps/api/src/database/database.module.ts` (IMPORT RolloutModule)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm prisma migrate dev`, etc.

  ### 2. Prisma Model — FeatureFlag
  Follow existing schema conventions: `@id @default(uuid())`, snake_case `@map()`, `@@map()` for table names, tenant isolation via `tenantId`.

  ```prisma
  model FeatureFlag {
    id          String   @id @default(uuid())
    tenantId    String   @map("tenant_id")
    flag        String   @db.VarChar(50)
    enabled     Boolean  @default(false)
    mode        String   @default("SHADOW") @db.VarChar(20)
    metadata    Json?
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

    @@unique([tenantId, flag])
    @@index([tenantId])
    @@map("feature_flags")
  }
  ```

  **Also add to Tenant model relations:**
  ```prisma
  // Add to Tenant model's relations section:
  featureFlags          FeatureFlag[]
  ```

  ### 3. SDK Modes — TypeScript Constants
  ```typescript
  // interfaces/rollout.interface.ts
  export const SdkMode = {
    DISABLED: 'DISABLED',   // Heuristic only (current behavior, safe default)
    SHADOW: 'SHADOW',       // Run both, compare, return heuristic result
    PRIMARY: 'PRIMARY',     // Use SDK result, heuristic as fallback
  } as const;
  export type SdkMode = (typeof SdkMode)[keyof typeof SdkMode];

  export const SdkFlag = {
    CATEGORIZER: 'sdk_categorizer',
    MATCHER: 'sdk_matcher',
    SARS: 'sdk_sars',
    VALIDATOR: 'sdk_validator',
    ORCHESTRATOR: 'sdk_orchestrator',
    CONVERSATIONAL: 'sdk_conversational',
  } as const;
  export type SdkFlag = (typeof SdkFlag)[keyof typeof SdkFlag];

  export interface ComparisonResult {
    tenantId: string;
    agentType: string;
    sdkResult: unknown;
    heuristicResult: unknown;
    sdkDurationMs: number;
    heuristicDurationMs: number;
    resultsMatch: boolean;
    sdkConfidence?: number;
    heuristicConfidence?: number;
    details: Record<string, unknown>;
  }

  export interface ShadowRunParams<T> {
    tenantId: string;
    agentType: string;
    sdkFn: () => Promise<T>;
    heuristicFn: () => Promise<T>;
    compareFn: (sdk: T, heuristic: T) => ComparisonResult;
  }
  ```

  ### 4. FeatureFlagService
  ```typescript
  @Injectable()
  export class FeatureFlagService {
    private readonly logger = new Logger(FeatureFlagService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Get the SDK mode for a specific agent and tenant.
     * Returns DISABLED if no flag exists (safe default).
     */
    async getMode(tenantId: string, flag: SdkFlag): Promise<SdkMode> {
      const record = await this.prisma.featureFlag.findUnique({
        where: { tenantId_flag: { tenantId, flag } },
      });

      if (!record || !record.enabled) {
        return SdkMode.DISABLED;
      }

      // Validate mode is a known value
      if (Object.values(SdkMode).includes(record.mode as SdkMode)) {
        return record.mode as SdkMode;
      }

      this.logger.warn(
        `Unknown SDK mode "${record.mode}" for tenant ${tenantId}, flag ${flag}. Defaulting to DISABLED.`,
      );
      return SdkMode.DISABLED;
    }

    /**
     * Enable shadow mode for a specific agent and tenant.
     * Shadow mode runs both paths, compares results, but returns heuristic result.
     */
    async enableShadow(tenantId: string, flag: SdkFlag, metadata?: Record<string, unknown>): Promise<void> {
      await this.prisma.featureFlag.upsert({
        where: { tenantId_flag: { tenantId, flag } },
        create: {
          tenantId,
          flag,
          enabled: true,
          mode: SdkMode.SHADOW,
          metadata: metadata || null,
        },
        update: {
          enabled: true,
          mode: SdkMode.SHADOW,
          metadata: metadata || undefined,
        },
      });
      this.logger.log(`Enabled SHADOW mode for tenant ${tenantId}, flag ${flag}`);
    }

    /**
     * Enable primary mode for a specific agent and tenant.
     * Primary mode uses SDK result with heuristic as fallback.
     */
    async enablePrimary(tenantId: string, flag: SdkFlag, metadata?: Record<string, unknown>): Promise<void> {
      await this.prisma.featureFlag.upsert({
        where: { tenantId_flag: { tenantId, flag } },
        create: {
          tenantId,
          flag,
          enabled: true,
          mode: SdkMode.PRIMARY,
          metadata: metadata || null,
        },
        update: {
          enabled: true,
          mode: SdkMode.PRIMARY,
          metadata: metadata || undefined,
        },
      });
      this.logger.log(`Enabled PRIMARY mode for tenant ${tenantId}, flag ${flag}`);
    }

    /**
     * Disable SDK for a specific agent and tenant.
     * Instant rollback to heuristic-only behavior.
     */
    async disable(tenantId: string, flag: SdkFlag): Promise<void> {
      await this.prisma.featureFlag.upsert({
        where: { tenantId_flag: { tenantId, flag } },
        create: {
          tenantId,
          flag,
          enabled: false,
          mode: SdkMode.DISABLED,
        },
        update: {
          enabled: false,
          mode: SdkMode.DISABLED,
        },
      });
      this.logger.log(`Disabled SDK for tenant ${tenantId}, flag ${flag}`);
    }

    /**
     * Get all feature flags for a tenant.
     */
    async getAllFlags(tenantId: string): Promise<FeatureFlag[]> {
      return this.prisma.featureFlag.findMany({
        where: { tenantId },
      });
    }

    /**
     * Check if a specific SDK feature is enabled (any mode except DISABLED).
     */
    async isEnabled(tenantId: string, flag: SdkFlag): Promise<boolean> {
      const mode = await this.getMode(tenantId, flag);
      return mode !== SdkMode.DISABLED;
    }
  }
  ```

  ### 5. ShadowRunner — Runs Both Paths for Comparison (leveraging agentic-flow)
  The ShadowRunner leverages agentic-flow's multi-agent comparison capabilities for the SHADOW mode.
  In SHADOW mode, agentic-flow can natively run both heuristic and LLM paths and compare results,
  simplifying the implementation compared to a fully custom dual-execution framework.

  ```typescript
  import { AgenticFlowComparison } from 'agentic-flow';

  @Injectable()
  export class ShadowRunner {
    private readonly logger = new Logger(ShadowRunner.name);

    constructor(
      private readonly featureFlags: FeatureFlagService,
      @Optional() @Inject(AgenticFlowComparison) private readonly afComparison?: AgenticFlowComparison,
      @Optional() @Inject(AuditTrailService) private readonly auditTrail?: AuditTrailService,
    ) {}

    /**
     * Execute an agent action with the appropriate SDK mode.
     *
     * DISABLED: Only run heuristic (existing behavior)
     * SHADOW:   Run both, compare, return heuristic result
     * PRIMARY:  Run SDK first, fallback to heuristic on error
     */
    async run<T>(params: ShadowRunParams<T>): Promise<T> {
      const flag = `sdk_${params.agentType}` as SdkFlag;
      const mode = await this.featureFlags.getMode(params.tenantId, flag);

      switch (mode) {
        case SdkMode.DISABLED:
          return this.runDisabled(params);

        case SdkMode.SHADOW:
          return this.runShadow(params);

        case SdkMode.PRIMARY:
          return this.runPrimary(params);

        default:
          this.logger.warn(`Unknown mode "${mode}", falling back to DISABLED`);
          return this.runDisabled(params);
      }
    }

    /**
     * DISABLED mode: Only run heuristic.
     */
    private async runDisabled<T>(params: ShadowRunParams<T>): Promise<T> {
      return params.heuristicFn();
    }

    /**
     * SHADOW mode: Run both paths in parallel, compare, return heuristic result.
     * SDK errors are caught and logged but never affect the result.
     */
    private async runShadow<T>(params: ShadowRunParams<T>): Promise<T> {
      const heuristicStart = Date.now();
      const heuristicResult = await params.heuristicFn();
      const heuristicDurationMs = Date.now() - heuristicStart;

      // Run SDK in background — never block or affect the heuristic result
      const sdkStart = Date.now();
      params.sdkFn()
        .then(sdkResult => {
          const sdkDurationMs = Date.now() - sdkStart;
          try {
            const comparison = params.compareFn(sdkResult, heuristicResult);
            comparison.sdkDurationMs = sdkDurationMs;
            comparison.heuristicDurationMs = heuristicDurationMs;
            this.logComparison(comparison);
          } catch (err) {
            this.logger.warn(
              `Shadow comparison failed for ${params.agentType}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        })
        .catch(err => {
          this.logger.warn(
            `Shadow SDK execution failed for ${params.agentType}: ${err instanceof Error ? err.message : String(err)}`,
          );
          this.logComparison({
            tenantId: params.tenantId,
            agentType: params.agentType,
            sdkResult: null,
            heuristicResult,
            sdkDurationMs: Date.now() - sdkStart,
            heuristicDurationMs,
            resultsMatch: false,
            details: { sdkError: err instanceof Error ? err.message : String(err) },
          });
        });

      // Always return heuristic result in shadow mode
      return heuristicResult;
    }

    /**
     * PRIMARY mode: Run SDK first. Fallback to heuristic on error.
     */
    private async runPrimary<T>(params: ShadowRunParams<T>): Promise<T> {
      try {
        const sdkStart = Date.now();
        const result = await params.sdkFn();
        const sdkDurationMs = Date.now() - sdkStart;

        this.logger.debug(
          `PRIMARY mode: SDK succeeded for ${params.agentType} in ${sdkDurationMs}ms`,
        );
        return result;
      } catch (err) {
        this.logger.warn(
          `PRIMARY mode: SDK failed for ${params.agentType}, falling back to heuristic: ${err instanceof Error ? err.message : String(err)}`,
        );
        return params.heuristicFn();
      }
    }

    /**
     * Log comparison results to audit trail.
     */
    private logComparison(comparison: ComparisonResult): void {
      if (this.auditTrail) {
        this.auditTrail.logDecision({
          tenantId: comparison.tenantId,
          agentType: comparison.agentType as any,
          decision: 'shadow_comparison',
          confidence: comparison.sdkConfidence,
          autoApplied: false,
          details: {
            mode: 'SHADOW',
            resultsMatch: comparison.resultsMatch,
            sdkDurationMs: comparison.sdkDurationMs,
            heuristicDurationMs: comparison.heuristicDurationMs,
            sdkConfidence: comparison.sdkConfidence,
            heuristicConfidence: comparison.heuristicConfidence,
            ...comparison.details,
          },
          reasoning: comparison.resultsMatch
            ? 'SDK and heuristic produced matching results'
            : 'SDK and heuristic produced different results',
          durationMs: comparison.sdkDurationMs + comparison.heuristicDurationMs,
        }).catch(err =>
          this.logger.warn(`Failed to log comparison: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    }
  }
  ```

  ### 6. Agent Integration Pattern — Categorizer Example
  Each agent wraps its core logic with the ShadowRunner:

  ```typescript
  // In categorizer.agent.ts
  constructor(
    private readonly contextLoader: ContextLoader,
    private readonly patternMatcher: PatternMatcher,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
    @Optional() @Inject(AgentMemoryService) private readonly agentMemory?: AgentMemoryService,
    @Optional() @Inject(ShadowRunner) private readonly shadowRunner?: ShadowRunner,
  ) {}

  async categorize(
    transaction: Transaction,
    tenantId: string,
  ): Promise<CategorizationResult> {
    // If shadow runner is available, use it for mode-aware execution
    if (this.shadowRunner) {
      return this.shadowRunner.run({
        tenantId,
        agentType: 'categorizer',
        heuristicFn: () => this.categorizeHeuristic(transaction, tenantId),
        sdkFn: () => this.categorizeSdk(transaction, tenantId),
        compareFn: (sdk, heuristic) => this.compareResults(tenantId, sdk, heuristic),
      });
    }

    // Fallback: heuristic-only (when ShadowRunner not injected)
    return this.categorizeHeuristic(transaction, tenantId);
  }

  /**
   * Existing heuristic categorization logic (current behavior, unchanged).
   */
  private async categorizeHeuristic(
    transaction: Transaction,
    tenantId: string,
  ): Promise<CategorizationResult> {
    // ... existing categorization logic (pattern matching, confidence scoring, etc.) ...
  }

  /**
   * SDK-enhanced categorization logic (LLM-powered).
   * Only called when SDK mode is SHADOW or PRIMARY.
   */
  private async categorizeSdk(
    transaction: Transaction,
    tenantId: string,
  ): Promise<CategorizationResult> {
    // ... SDK-enhanced logic using Claude Agent SDK ...
    // This is implemented by the agent-specific SDK migration tasks (TASK-SDK-003 etc.)
  }

  /**
   * Compare SDK and heuristic results.
   */
  private compareResults(
    tenantId: string,
    sdk: CategorizationResult,
    heuristic: CategorizationResult,
  ): ComparisonResult {
    return {
      tenantId,
      agentType: 'categorizer',
      sdkResult: sdk,
      heuristicResult: heuristic,
      sdkDurationMs: 0, // Filled by ShadowRunner
      heuristicDurationMs: 0, // Filled by ShadowRunner
      resultsMatch: sdk.accountCode === heuristic.accountCode,
      sdkConfidence: sdk.confidence,
      heuristicConfidence: heuristic.confidence,
      details: {
        sdkAccountCode: sdk.accountCode,
        heuristicAccountCode: heuristic.accountCode,
        sdkAccountName: sdk.accountName,
        heuristicAccountName: heuristic.accountName,
      },
    };
  }
  ```

  ### 7. E2E Test Pattern
  Each E2E test verifies all 3 modes for an agent. Use real database, mock only external APIs (Xero, Claude SDK LLM calls).

  ```typescript
  // tests/e2e/sdk-agents/categorizer-sdk.e2e.spec.ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { INestApplication } from '@nestjs/common';
  // ... imports ...

  describe('TransactionCategorizerAgent (SDK E2E)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let featureFlags: FeatureFlagService;
    let categorizer: TransactionCategorizerAgent;
    let tenantId: string;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();

      prisma = app.get(PrismaService);
      featureFlags = app.get(FeatureFlagService);
      categorizer = app.get(TransactionCategorizerAgent);
    });

    beforeEach(async () => {
      // Create test tenant and transaction data
      const tenant = await prisma.tenant.create({
        data: { /* ... test tenant data ... */ },
      });
      tenantId = tenant.id;
    });

    afterEach(async () => {
      // Clean up test data
      await prisma.featureFlag.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    });

    afterAll(async () => {
      await app.close();
    });

    describe('DISABLED mode (heuristic only)', () => {
      beforeEach(async () => {
        await featureFlags.disable(tenantId, SdkFlag.CATEGORIZER);
      });

      it('should categorize known patterns via heuristic', async () => {
        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Woolworths',
          description: 'POS Purchase',
          amountCents: -15000,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);

        expect(result).toBeDefined();
        expect(result.accountCode).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
        // Verify no audit log with shadow_comparison
        const auditLogs = await prisma.agentAuditLog.findMany({
          where: { tenantId, decision: 'shadow_comparison' },
        });
        expect(auditLogs).toHaveLength(0);
      });

      it('should escalate unknown patterns', async () => {
        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Unknown Company XYZ',
          description: 'Unknown purchase',
          amountCents: -5000,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);
        expect(result.confidence).toBeLessThan(80);
      });
    });

    describe('SHADOW mode (run both, compare)', () => {
      beforeEach(async () => {
        await featureFlags.enableShadow(tenantId, SdkFlag.CATEGORIZER);
      });

      it('should return heuristic result while running SDK in shadow', async () => {
        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Pick n Pay',
          description: 'POS Purchase',
          amountCents: -8500,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);

        // Result should be heuristic-based
        expect(result).toBeDefined();
        expect(result.accountCode).toBeDefined();

        // Wait for shadow comparison to be logged (async)
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify comparison was logged in audit trail
        const auditLogs = await prisma.agentAuditLog.findMany({
          where: { tenantId, decision: 'shadow_comparison' },
        });
        // May or may not exist depending on SDK availability
        // The key assertion is that the heuristic result was returned correctly
      });

      it('should not affect heuristic result even if SDK fails', async () => {
        // Mock SDK to throw an error
        // ... setup ...

        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Eskom',
          description: 'Electricity payment',
          amountCents: -250000,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);

        // Heuristic should still work
        expect(result).toBeDefined();
        expect(result.accountCode).toBeDefined();
      });
    });

    describe('PRIMARY mode (SDK first, heuristic fallback)', () => {
      beforeEach(async () => {
        await featureFlags.enablePrimary(tenantId, SdkFlag.CATEGORIZER);
      });

      it('should use SDK result when available', async () => {
        // Requires SDK to be configured - skip if not available
        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Makro',
          description: 'Bulk purchase',
          amountCents: -45000,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);
        expect(result).toBeDefined();
        expect(result.accountCode).toBeDefined();
      });

      it('should fallback to heuristic when SDK fails', async () => {
        // Mock SDK failure
        // ... setup ...

        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Woolworths',
          description: 'POS Purchase',
          amountCents: -12000,
          isCredit: false,
        });

        const result = await categorizer.categorize(transaction, tenantId);

        // Should still get a valid result via heuristic fallback
        expect(result).toBeDefined();
        expect(result.accountCode).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    describe('Mode transitions', () => {
      it('should switch from DISABLED to SHADOW without restart', async () => {
        await featureFlags.disable(tenantId, SdkFlag.CATEGORIZER);

        const transaction = await createTestTransaction(prisma, tenantId, {
          payeeName: 'Checkers',
          description: 'Grocery purchase',
          amountCents: -7500,
          isCredit: false,
        });

        // First call: DISABLED
        const result1 = await categorizer.categorize(transaction, tenantId);
        expect(result1).toBeDefined();

        // Switch to SHADOW (no restart needed - database lookup each time)
        await featureFlags.enableShadow(tenantId, SdkFlag.CATEGORIZER);

        // Second call: SHADOW
        const result2 = await categorizer.categorize(transaction, tenantId);
        expect(result2).toBeDefined();
      });

      it('should instant rollback from PRIMARY to DISABLED', async () => {
        await featureFlags.enablePrimary(tenantId, SdkFlag.CATEGORIZER);
        await featureFlags.disable(tenantId, SdkFlag.CATEGORIZER);

        const mode = await featureFlags.getMode(tenantId, SdkFlag.CATEGORIZER);
        expect(mode).toBe(SdkMode.DISABLED);
      });
    });
  });

  // Helper function
  async function createTestTransaction(
    prisma: PrismaService,
    tenantId: string,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    return prisma.transaction.create({
      data: {
        tenantId,
        bankAccount: 'FNB-001',
        date: new Date(),
        description: data.description || 'Test transaction',
        payeeName: data.payeeName,
        amountCents: data.amountCents || -10000,
        isCredit: data.isCredit ?? false,
        source: 'MANUAL',
        ...data,
      },
    });
  }
  ```

  ### 8. NestJS Module Wiring (includes agentic-flow + ruvector)
  ```typescript
  // rollout.module.ts
  import { Module } from '@nestjs/common';
  import { FeatureFlagService } from './feature-flags.service';
  import { ShadowRunner } from './shadow-runner';
  import { PrismaService } from '../../database/prisma/prisma.service';
  import { AuditTrailModule } from '../audit/audit-trail.module';
  import { AgenticFlowModule } from 'agentic-flow';

  @Module({
    imports: [AuditTrailModule, AgenticFlowModule],
    providers: [PrismaService, FeatureFlagService, ShadowRunner],
    exports: [FeatureFlagService, ShadowRunner],
  })
  export class RolloutModule {}
  ```

  **Update DatabaseModule imports:**
  ```typescript
  // In database.module.ts, add:
  import { RolloutModule } from '../agents/rollout/rollout.module';

  @Module({
    imports: [
      // ... existing imports ...
      RolloutModule, // TASK-SDK-012: Parallel Rollout Framework
    ],
    // ...
  })
  ```

  ### 9. Tenant Isolation
  Feature flags are always per-tenant. Never apply a flag globally.
  ```typescript
  // CORRECT — per-tenant flag
  await this.featureFlags.getMode(tenantId, SdkFlag.CATEGORIZER);

  // WRONG — global flag
  const mode = process.env.SDK_MODE || 'DISABLED';
  ```

  ### 10. Safe Defaults
  - Default mode is DISABLED (heuristic-only)
  - Missing flag record = DISABLED
  - Unknown mode string = DISABLED
  - Shadow mode ALWAYS returns heuristic result
  - Primary mode ALWAYS falls back to heuristic on error
  - Feature flags read from database on each call (no caching that could prevent instant rollback)
</critical_patterns>

<context>
  ## Business Context

  The SDK migration introduces LLM-enhanced reasoning to all 5 existing agents and adds a new ConversationalAgent. Before switching production traffic from heuristic to LLM-enhanced paths, the team must verify that SDK accuracy is equal to or better than heuristic accuracy. This requires:

  1. **Shadow mode testing** — Run both paths, compare results, gather data
  2. **Per-tenant rollout** — Enable SDK for pilot tenants first
  3. **Instant rollback** — Disable SDK immediately if issues are found
  4. **A/B comparison data** — Log comparison results for analysis

  **Rollout Strategy:**
  1. Deploy with all flags DISABLED (no behavior change, no risk)
  2. Enable SHADOW for 2-3 pilot creche tenants
  3. Run shadow for 2 weeks, collect comparison data
  4. Analyze: If SDK accuracy >= heuristic accuracy, proceed
  5. Enable PRIMARY for pilot tenants
  6. Monitor PRIMARY for 1 week
  7. Gradually expand to all tenants
  8. If any issue: `disable(tenantId, flag)` = instant rollback

  **SA-Specific Considerations:**
  - SARS agent is NEVER auto-applied regardless of mode (always requires human review)
  - Financial categorization accuracy directly impacts tax compliance
  - Pattern matching for SA-specific payees (Woolworths, Pick n Pay, Eskom, Makro) must remain accurate
  - PAYE/UIF/VAT calculations in SARS agent must be bit-exact in all modes
</context>

<scope>
  <in_scope>
    - FeatureFlag Prisma model with migration
    - Tenant model relation addition
    - FeatureFlagService with getMode, enableShadow, enablePrimary, disable, getAllFlags, isEnabled (custom, per-tenant per-agent)
    - ShadowRunner with DISABLED/SHADOW/PRIMARY execution modes, leveraging agentic-flow multi-agent comparison for SHADOW mode
    - Comparison result logging to audit trail (TASK-SDK-011)
    - RolloutModule NestJS module (includes AgenticFlowModule import)
    - Update all 5 existing agents to use ShadowRunner via @Optional() injection
    - Updated test infrastructure covering agentic-flow + ruvector initialization and teardown
    - E2E test for categorizer agent (all 3 modes + mode transitions)
    - E2E test for matcher agent (all 3 modes)
    - E2E test for SARS agent (all 3 modes, verify never auto-applied)
    - E2E test for extraction validator (all 3 modes)
    - E2E test for orchestrator (all 3 modes)
    - E2E test for conversational agent (basic functionality)
    - Unit tests for FeatureFlagService (90%+ coverage)
    - Unit tests for ShadowRunner (90%+ coverage)
    - Import RolloutModule in DatabaseModule
    - All existing 1536+ tests still pass with flags DISABLED
  </in_scope>
  <out_of_scope>
    - Frontend feature flag management UI (separate task)
    - Automated promotion from SHADOW to PRIMARY (manual decision required)
    - Load testing / performance benchmarking of dual execution
    - Cost analysis of LLM API calls in shadow/primary mode
    - Feature flag caching (read from DB each call for instant rollback)
    - Global (non-tenant) feature flags
    - A/B analysis dashboard or reporting (separate task)
    - Percentage-based rollout (e.g., 10% of requests use SDK) — binary per-tenant only
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate and apply Prisma migration
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
pnpm prisma migrate dev --name add_feature_flags

# 2. Verify Prisma client generation
pnpm prisma generate

# 3. Run unit tests for rollout module
pnpm test -- --testPathPattern="tests/agents/rollout" --verbose

# 4. Run E2E tests for SDK agents
pnpm test -- --testPathPattern="tests/e2e/sdk-agents" --verbose

# 5. Run existing agent tests to verify no regression (CRITICAL)
pnpm test -- --testPathPattern="tests/agents" --verbose

# 6. Verify all existing tests still pass with flags DISABLED
pnpm test --verbose

# 7. Build the project
pnpm run build

# 8. Lint check
pnpm run lint

# 9. Type check
pnpm run typecheck

# 10. Run full test suite (must include all 1536+ existing tests passing)
pnpm test

# 11. Verify agentic-flow + ruvector integration
pnpm test -- --testPathPattern="tests/agents/rollout" --grep="agentic-flow" --verbose
pnpm test -- --testPathPattern="tests/agents/rollout" --grep="ruvector" --verbose

# 12. Verify agentic-flow multi-model routing integration
pnpm test -- --testPathPattern="tests/e2e/sdk-agents" --grep="multi-model" --verbose
```
</verification_commands>

<definition_of_done>
  - [ ] FeatureFlag model added to `apps/api/prisma/schema.prisma` with `@@unique([tenantId, flag])` and `@@map("feature_flags")`
  - [ ] Tenant model updated with `featureFlags` relation
  - [ ] Prisma migration created and applies cleanly
  - [ ] `apps/api/src/agents/rollout/interfaces/rollout.interface.ts` — SdkMode, SdkFlag, ComparisonResult, ShadowRunParams types defined
  - [ ] `apps/api/src/agents/rollout/feature-flags.service.ts` — getMode, enableShadow, enablePrimary, disable, getAllFlags, isEnabled methods
  - [ ] `apps/api/src/agents/rollout/shadow-runner.ts` — DISABLED/SHADOW/PRIMARY execution with comparison logging; SHADOW mode leverages agentic-flow multi-agent comparison where applicable
  - [ ] `apps/api/src/agents/rollout/rollout.module.ts` — NestJS module wiring (imports AgenticFlowModule)
  - [ ] `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` — uses ShadowRunner via `@Optional()` injection with heuristicFn/sdkFn split
  - [ ] `apps/api/src/agents/payment-matcher/matcher.agent.ts` — uses ShadowRunner via `@Optional()` injection
  - [ ] `apps/api/src/agents/sars-agent/sars.agent.ts` — uses ShadowRunner via `@Optional()` injection
  - [ ] `apps/api/src/agents/extraction-validator/validator.agent.ts` — uses ShadowRunner via `@Optional()` injection
  - [ ] `apps/api/src/agents/orchestrator/orchestrator.agent.ts` — uses ShadowRunner via `@Optional()` injection
  - [ ] `apps/api/src/database/database.module.ts` — imports RolloutModule
  - [ ] `tests/e2e/sdk-agents/categorizer-sdk.e2e.spec.ts` — tests all 3 modes + mode transitions
  - [ ] `tests/e2e/sdk-agents/matcher-sdk.e2e.spec.ts` — tests all 3 modes
  - [ ] `tests/e2e/sdk-agents/sars-sdk.e2e.spec.ts` — tests all 3 modes, verifies never auto-applied
  - [ ] `tests/e2e/sdk-agents/validator-sdk.e2e.spec.ts` — tests all 3 modes
  - [ ] `tests/e2e/sdk-agents/orchestrator-sdk.e2e.spec.ts` — tests all 3 modes
  - [ ] `tests/e2e/sdk-agents/conversational-sdk.e2e.spec.ts` — basic functionality test
  - [ ] `tests/agents/rollout/feature-flags.service.spec.ts` — unit tests (90%+ coverage)
  - [ ] `tests/agents/rollout/shadow-runner.spec.ts` — unit tests (90%+ coverage) including all 3 modes, error handling, comparison logging, agentic-flow comparison integration
  - [ ] Integration tests verify agentic-flow + ruvector initialization and teardown
  - [ ] Test coverage for ruvector vector operations (embedding generation, similarity search) within rollout context
  - [ ] Test coverage for agentic-flow multi-model routing (verify SHADOW mode dispatches to AgenticFlowComparison)
  - [ ] Shadow mode ALWAYS returns heuristic result (never SDK)
  - [ ] Primary mode falls back to heuristic on SDK error
  - [ ] Default mode is DISABLED when no flag exists
  - [ ] Feature flags are read from database per-call (no caching, instant rollback)
  - [ ] Comparison results logged to AgentAuditLog via AuditTrailService
  - [ ] All existing 1536+ tests still pass with all flags DISABLED
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
</definition_of_done>

<anti_patterns>
  - **NEVER** enable SDK for all tenants at once. Gradual per-tenant rollout only. Start with 2-3 pilot tenants.
  - **NEVER** skip the SHADOW phase. Always compare SDK vs. heuristic accuracy before making SDK the PRIMARY path.
  - **NEVER** remove the heuristic path. It is the permanent fallback for SDK failures and the safe default.
  - **NEVER** let shadow mode affect actual results. Shadow mode MUST always return the heuristic result, even if SDK result is better.
  - **NEVER** store feature flag decisions in environment variables. Use the database FeatureFlag model for per-tenant control and instant rollback.
  - **NEVER** cache feature flag lookups. Read from database on every call to ensure instant rollback when a flag is disabled.
  - **NEVER** make FeatureFlagService or ShadowRunner required dependencies. Use `@Optional() @Inject()` in all agents to avoid breaking existing tests.
  - **NEVER** auto-promote from SHADOW to PRIMARY. Mode changes are manual decisions based on comparison data analysis.
  - **NEVER** use `npm` — use `pnpm` for all commands.
  - **NEVER** save test files in the project root. E2E tests go in `tests/e2e/sdk-agents/`, unit tests in `tests/agents/rollout/`.
  - **NEVER** use `@default(cuid())` — this project uses `@default(uuid())` for primary keys.
  - **NEVER** create global feature flags. All flags are scoped to a tenantId.
  - **NEVER** remove the custom FeatureFlagService -- agentic-flow's built-in flags don't support the per-tenant per-agent granularity needed for safe rollout in a multi-tenant creche environment.
  - **NEVER** skip testing the dual-write pattern -- both agentic-flow/ruvector AND Prisma must be verified in integration tests to ensure the triple-write (JSONL + Prisma + ruvector) from TASK-SDK-011 works correctly under all rollout modes.
</anti_patterns>

</task_spec>
