<task_spec id="TASK-SDK-010" version="2.0">

<metadata>
  <title>AgentDB & Persistent Learning Memory Integration</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>integration</layer>
  <sequence>710</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-AGENTDB</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-009</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>14 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  The current agent system has a static pattern library (PayeePattern table) that requires manual updates and no persistent memory across sessions. Decision logs are JSONL files (.claude/logs/decisions.jsonl, escalations.jsonl) that are append-only and never read back by agents for learning. There is no feedback loop from human corrections to pattern learning. The analysis specifies that "AgentDB replaces the pattern library with a learning memory store" where corrections feed back into pattern matching over time.

  **Architecture Decision -- agentic-flow AgentDB + ruvector Integration:**
  This is the HIGHEST IMPACT change in the SDK migration. Instead of building custom memory, pattern learning, and correction handling from scratch, this task leverages:
  - **agentic-flow AgentDB** (6 cognitive memory patterns): Replaces the custom `AgentMemoryService` with a production-grade memory system that stores decisions, reasoning chains, and learned patterns across sessions. AgentDB provides episodic, semantic, procedural, declarative, working, and meta-cognitive memory patterns.
  - **agentic-flow ReasoningBank**: Stores and retrieves full reasoning chains (richer than simple AgentDecision records). Each decision captures why the agent chose a particular categorization, not just what it chose.
  - **ruvector GNN self-improving index**: Replaces the custom `PatternLearner` threshold logic with a graph neural network that learns patterns organically from correction data, while still writing to Prisma `PayeePattern` for backwards compatibility.
  - **ruvector HNSW embedding-based deduplication**: Replaces SHA-256 input hashing with semantic similarity search using 384-dimensional MiniLM-L6-v2 embeddings. This catches semantically similar inputs (e.g., "Woolworths Food" and "Woolworths Foods") that exact hash matching would miss.
  - **agentic-flow built-in correction/feedback loops**: Replaces the custom `CorrectionHandler` with agentic-flow's production-grade feedback system.
  - **Dual-write pattern (AgentDB + Prisma)**: All writes go to both agentic-flow (learning) and Prisma (compliance). Prisma models `AgentDecision`, `CorrectionFeedback`, and `PayeePattern` are retained as the compliance/audit layer required for SA financial regulations.
  - **PayeePattern Prisma model is KEPT**: It is used across the codebase and cannot be removed. ruvector vector patterns supplement but do not replace it.

  **Gap Analysis:**
  - No feedback loop from human corrections to pattern learning
  - Decision logs are append-only JSONL files, never queried by agents
  - PayeePattern table requires manual inserts for new patterns
  - No cross-session agent memory for decision consistency
  - AccuracyTracker (TASK-SDK-009) stores outcomes but does not feed them back to agents
  - No mechanism to identify repeated corrections and auto-create patterns
  - No "source" field on PayeePattern to distinguish manual vs. learned patterns
  - No semantic similarity for finding similar past decisions (only exact SHA-256 hash matching)
  - No reasoning chain storage (only flat decision metadata)

  **Files to Create:**
  - `apps/api/src/agents/memory/agent-memory.service.ts` - Wraps agentic-flow AgentDB + ReasoningBank with Prisma dual-write and ruvector vector search
  - `apps/api/src/agents/memory/agent-memory.module.ts` (NestJS module)
  - `apps/api/src/agents/memory/pattern-learner.ts` - Wraps ruvector GNN self-improving index with Prisma PayeePattern dual-write
  - `apps/api/src/agents/memory/correction-handler.ts` - Wraps agentic-flow built-in correction/feedback loops with Prisma dual-write
  - `apps/api/src/agents/memory/interfaces/agent-memory.interface.ts` (Types and interfaces)
  - `tests/agents/memory/agent-memory.service.spec.ts`
  - `tests/agents/memory/pattern-learner.spec.ts`
  - `tests/agents/memory/correction-handler.spec.ts`

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` (ADD AgentDecision model, ADD CorrectionFeedback model, ADD source/isActive fields to PayeePattern)
  - `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` (USE AgentMemoryService to store decisions)
  - `apps/api/src/agents/payment-matcher/matcher.agent.ts` (USE AgentMemoryService to store decisions)
  - `apps/api/src/database/database.module.ts` (IMPORT AgentMemoryModule)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm prisma migrate dev`, etc.

  ### 2. Monetary Values in CENTS
  All monetary values are stored as integers in cents. Never use floats for money.
  ```typescript
  // CORRECT
  amountCents: number; // 15000 = R150.00
  // WRONG
  amount: number; // 150.00
  ```

  ### 3. Prisma Schema Conventions
  Follow the existing schema patterns exactly. Models use `@id @default(uuid())`, snake_case `@map()` for database columns, and `@@map()` for table names. All tenant-scoped models must have `tenantId` with a `Tenant @relation()` and `@@index([tenantId])`.

  ```prisma
  model AgentDecision {
    id              String   @id @default(uuid())
    tenantId        String   @map("tenant_id")
    agentType       String   @map("agent_type") @db.VarChar(30)
    inputHash       String   @map("input_hash") @db.VarChar(64)
    decision        Json
    confidence      Int      // 0-100
    source          String   @db.VarChar(20) // 'LLM' | 'PATTERN' | 'HISTORICAL' | 'HYBRID'
    wasCorrect      Boolean? @map("was_correct")
    correctedTo     Json?    @map("corrected_to")
    transactionId   String?  @map("transaction_id")
    createdAt       DateTime @default(now()) @map("created_at")

    tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

    @@index([tenantId, agentType])
    @@index([tenantId, inputHash])
    @@index([agentType, wasCorrect])
    @@index([transactionId])
    @@map("agent_decisions")
  }

  model CorrectionFeedback {
    id              String   @id @default(uuid())
    tenantId        String   @map("tenant_id")
    agentDecisionId String   @map("agent_decision_id")
    originalValue   Json     @map("original_value")
    correctedValue  Json     @map("corrected_value")
    correctedBy     String   @map("corrected_by") // userId
    reason          String?
    appliedToPattern Boolean @default(false) @map("applied_to_pattern")
    createdAt       DateTime @default(now()) @map("created_at")

    agentDecision   AgentDecision @relation(fields: [agentDecisionId], references: [id], onDelete: Cascade)
    tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)

    @@index([tenantId, appliedToPattern])
    @@index([agentDecisionId])
    @@map("correction_feedback")
  }
  ```

  **Also add to the existing PayeePattern model:**
  ```prisma
  // Add these fields to existing PayeePattern model:
  source            String   @default("MANUAL") @db.VarChar(20) // 'MANUAL' | 'LEARNED'
  isActive          Boolean  @default(true) @map("is_active")
  ```

  **Also add to Tenant model relations:**
  ```prisma
  // Add to Tenant model's relations section:
  agentDecisions        AgentDecision[]
  correctionFeedback    CorrectionFeedback[]
  ```

  **Also add to AgentDecision model:**
  ```prisma
  // AgentDecision needs reverse relation for CorrectionFeedback:
  corrections     CorrectionFeedback[]
  ```

  ### 4. NestJS Module Pattern
  Follow the existing module structure. Services are `@Injectable()` and injected via constructor. Modules declare providers and exports.

  ```typescript
  // agent-memory.module.ts
  import { Module } from '@nestjs/common';
  import { AgentMemoryService } from './agent-memory.service';
  import { PatternLearner } from './pattern-learner';
  import { CorrectionHandler } from './correction-handler';
  import { PrismaService } from '../../database/prisma/prisma.service';

  @Module({
    providers: [
      PrismaService,
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
    ],
    exports: [
      AgentMemoryService,
      PatternLearner,
      CorrectionHandler,
    ],
  })
  export class AgentMemoryModule {}
  ```

  ### 5. Input Deduplication -- ruvector Embedding-Based Similarity (Replaces SHA-256)
  Instead of SHA-256 hashing (which only catches exact matches after normalization),
  use ruvector HNSW embeddings for semantic similarity deduplication.
  This catches "Woolworths Food" and "Woolworths Foods" as similar inputs.

  ```typescript
  import { RuvectorService } from '../shared/ruvector.service';

  // SHA-256 hash is KEPT as a fallback identifier but NOT used for similarity search
  import { createHash } from 'crypto';

  export function computeInputHash(params: {
    payeeName: string;
    description: string;
    amountCents: number;
    isCredit: boolean;
  }): string {
    // Still compute hash for backwards compatibility and Prisma indexing
    const normalized = [
      params.payeeName.toLowerCase().trim(),
      params.description.toLowerCase().trim(),
      String(params.amountCents),
      String(params.isCredit),
    ].join('|');
    return createHash('sha256').update(normalized).digest('hex').substring(0, 64);
  }

  // Primary similarity search uses ruvector HNSW embeddings (384d MiniLM-L6-v2)
  // instead of exact hash matching
  async function findSimilarInputs(
    ruvectorService: RuvectorService,
    input: string,
    tenantId: string,
    topK: number = 10,
  ): Promise<SimilarInput[]> {
    // ruvector HNSW: <0.5ms latency, 52K+ inserts/sec
    return ruvectorService.searchSimilar('decision_inputs', input, { tenantId, topK });
  }
  ```

  ### 6. Pattern Learner: ruvector GNN + Prisma PayeePattern Dual-Write
  Instead of only using threshold-based correction counting, the PatternLearner wraps ruvector's
  GNN self-improving index which learns patterns organically. Still writes to Prisma PayeePattern
  for backwards compatibility (dual-write).

  ```typescript
  import { RuvectorService } from '../shared/ruvector.service';

  @Injectable()
  export class PatternLearner {
    private readonly logger = new Logger(PatternLearner.name);
    private static readonly MIN_CORRECTIONS_FOR_PATTERN = 3;

    constructor(
      private readonly ruvectorService: RuvectorService, // ruvector GNN pattern learning
      private readonly prisma: PrismaService,             // Prisma PayeePattern dual-write
    ) {}

    /**
     * Process a correction using ruvector GNN for organic pattern learning.
     * DUAL-WRITE: ruvector GNN learns the pattern + Prisma PayeePattern stores for compatibility.
     * Still enforces MIN_CORRECTIONS_FOR_PATTERN threshold before creating Prisma patterns.
     */
    async processCorrection(correction: CorrectionFeedback): Promise<PatternLearnResult> {
      const correctedValue = correction.correctedValue as CorrectedCategorization;
      if (!correctedValue.payeeName || !correctedValue.accountCode) {
        return { patternCreated: false, reason: 'Missing payeeName or accountCode in correction' };
      }

      // Feed correction to ruvector GNN (learns pattern organically, no threshold needed)
      await this.ruvectorService.learnPattern('payee_patterns', {
        input: correctedValue.payeeName,
        output: correctedValue.accountCode,
        tenantId: correction.tenantId,
        metadata: { accountName: correctedValue.accountName },
      });

      // Count corrections for Prisma PayeePattern threshold (backwards compatibility)
      const similarCorrections = await this.prisma.correctionFeedback.count({
        where: {
          tenantId: correction.tenantId,
          appliedToPattern: false,
          correctedValue: {
            path: ['accountCode'],
            equals: correctedValue.accountCode,
          },
        },
      });

      if (similarCorrections < PatternLearner.MIN_CORRECTIONS_FOR_PATTERN) {
        return {
          patternCreated: false,
          reason: `Only ${similarCorrections}/${PatternLearner.MIN_CORRECTIONS_FOR_PATTERN} corrections — not enough yet for Prisma pattern (ruvector GNN already learning)`,
        };
      }

      // Dual-write: Create/update Prisma PayeePattern for backwards compatibility
      await this.prisma.payeePattern.upsert({
        where: {
          tenantId_payeePattern: {
            tenantId: correction.tenantId,
            payeePattern: correctedValue.payeeName.toLowerCase().trim(),
          },
        },
        create: {
          tenantId: correction.tenantId,
          payeePattern: correctedValue.payeeName.toLowerCase().trim(),
          defaultAccountCode: correctedValue.accountCode,
          defaultAccountName: correctedValue.accountName || '',
          matchCount: similarCorrections,
          source: 'LEARNED',
          isActive: true,
        },
        update: {
          defaultAccountCode: correctedValue.accountCode,
          defaultAccountName: correctedValue.accountName || '',
          matchCount: { increment: 1 },
          source: 'LEARNED',
        },
      });

      // Mark corrections as applied
      await this.prisma.correctionFeedback.updateMany({
        where: {
          tenantId: correction.tenantId,
          appliedToPattern: false,
          correctedValue: {
            path: ['accountCode'],
            equals: correctedValue.accountCode,
          },
        },
        data: { appliedToPattern: true },
      });

      this.logger.log(
        `Learned pattern for tenant ${correction.tenantId}: "${correctedValue.payeeName}" -> ${correctedValue.accountCode} (${similarCorrections} corrections, ruvector GNN + Prisma)`,
      );

      return {
        patternCreated: true,
        payeeName: correctedValue.payeeName,
        accountCode: correctedValue.accountCode,
        correctionCount: similarCorrections,
      };
    }
  }
  ```

  ### 7. AgentMemoryService -- agentic-flow AgentDB + ReasoningBank with Prisma Dual-Write
  Instead of Prisma-only storage, the AgentMemoryService wraps agentic-flow's AgentDB (6 cognitive
  memory patterns) and ReasoningBank (reasoning chain storage) with Prisma dual-write for compliance
  and ruvector for semantic similarity search.

  ```typescript
  import { AgentDB, ReasoningBank } from 'agentic-flow';
  import { RuvectorService } from '../shared/ruvector.service';

  @Injectable()
  export class AgentMemoryService {
    constructor(
      private readonly agentDB: AgentDB,           // agentic-flow cognitive memory (6 patterns)
      private readonly reasoningBank: ReasoningBank, // agentic-flow reasoning chain storage
      private readonly ruvectorService: RuvectorService, // ruvector vector search
      private readonly prisma: PrismaService,        // Prisma compliance dual-write
      private readonly patternLearner: PatternLearner,
    ) {}

    /**
     * Store an agent decision for learning and audit.
     * DUAL-WRITE: AgentDB (cognitive memory) + Prisma (compliance audit trail).
     * Also stores embedding in ruvector for semantic similarity search.
     */
    async storeDecision(params: StoreDecisionParams): Promise<string> {
      // Dual-write: AgentDB + Prisma
      const [agentDBResult, prismaRecord] = await Promise.all([
        this.agentDB.store({
          tenantId: params.tenantId,
          agentType: params.agentType,
          decision: params.decision,
          confidence: params.confidence,
          source: params.source,
        }),
        this.prisma.agentDecision.create({
          data: {
            tenantId: params.tenantId,
            agentType: params.agentType,
            inputHash: params.inputHash,
            decision: params.decision,
            confidence: params.confidence,
            source: params.source,
            transactionId: params.transactionId,
          },
        }),
      ]);

      // Store reasoning chain if available
      if (params.reasoningChain) {
        await this.reasoningBank.store({
          decisionId: prismaRecord.id,
          chain: params.reasoningChain,
          tenantId: params.tenantId,
        });
      }

      // Store embedding in ruvector for semantic similarity search (non-blocking)
      this.ruvectorService.storeEmbedding('decisions', params.inputHash, {
        decisionId: prismaRecord.id,
        tenantId: params.tenantId,
        agentType: params.agentType,
        inputText: params.inputText, // Sanitized, no PII
      }).catch(err => /* non-blocking */ undefined);

      return prismaRecord.id;
    }

    /**
     * Record a human correction to a previous decision.
     * DUAL-WRITE: agentic-flow feedback loop + Prisma correction record.
     * Triggers pattern learning via ruvector GNN if threshold is met.
     */
    async recordCorrection(params: RecordCorrectionParams): Promise<PatternLearnResult> {
      // Update via agentic-flow feedback loop
      await this.agentDB.recordCorrection({
        decisionId: params.agentDecisionId,
        correctedValue: params.correctedValue,
        tenantId: params.tenantId,
      });

      // Update the original Prisma decision record
      await this.prisma.agentDecision.update({
        where: { id: params.agentDecisionId },
        data: {
          wasCorrect: false,
          correctedTo: params.correctedValue,
        },
      });

      // Create Prisma correction record
      const correction = await this.prisma.correctionFeedback.create({
        data: {
          tenantId: params.tenantId,
          agentDecisionId: params.agentDecisionId,
          originalValue: params.originalValue,
          correctedValue: params.correctedValue,
          correctedBy: params.correctedBy,
          reason: params.reason,
        },
      });

      // Trigger pattern learning (ruvector GNN + Prisma PayeePattern dual-write)
      return this.patternLearner.processCorrection(correction);
    }

    /**
     * Find similar past decisions using ruvector HNSW semantic similarity.
     * Falls back to Prisma exact hash lookup if ruvector is unavailable.
     */
    async getSimilarDecisions(
      tenantId: string,
      agentType: string,
      inputText: string,
      inputHash?: string,
    ): Promise<AgentDecision[]> {
      // Primary: ruvector HNSW semantic similarity (<0.5ms, 384d MiniLM-L6-v2)
      try {
        const similar = await this.ruvectorService.searchSimilar(
          'decisions',
          inputText,
          { tenantId, agentType, topK: 10 },
        );
        if (similar.length > 0) {
          return similar;
        }
      } catch {
        // ruvector unavailable, fall through to Prisma
      }

      // Fallback: Prisma exact hash lookup
      if (inputHash) {
        return this.prisma.agentDecision.findMany({
          where: { tenantId, agentType, inputHash },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
      }

      return [];
    }

    /**
     * Get accuracy statistics for an agent within a tenant.
     * Uses AgentDB cognitive stats with Prisma fallback.
     */
    async getAccuracyStats(tenantId: string, agentType: string): Promise<AccuracyStats> {
      // Try AgentDB cognitive stats first
      const cognitiveStats = await this.agentDB.getAccuracyStats(tenantId, agentType);
      if (cognitiveStats) {
        return cognitiveStats;
      }

      // Fallback to Prisma
      const [total, reviewed, correct] = await Promise.all([
        this.prisma.agentDecision.count({ where: { tenantId, agentType } }),
        this.prisma.agentDecision.count({ where: { tenantId, agentType, wasCorrect: { not: null } } }),
        this.prisma.agentDecision.count({ where: { tenantId, agentType, wasCorrect: true } }),
      ]);
      return {
        totalDecisions: total,
        reviewedDecisions: reviewed,
        correctDecisions: correct,
        accuracyRate: reviewed > 0 ? correct / reviewed : 0,
      };
    }
  }
  ```

  ### 8. Categorizer Integration Pattern
  Add AgentMemoryService to the existing TransactionCategorizerAgent without breaking existing behavior:

  ```typescript
  // In categorizer.agent.ts — add optional injection:
  constructor(
    private readonly contextLoader: ContextLoader,
    private readonly patternMatcher: PatternMatcher,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
    @Optional() @Inject(AgentMemoryService) private readonly agentMemory?: AgentMemoryService,
  ) {}

  async categorize(transaction: Transaction, tenantId: string): Promise<CategorizationResult> {
    // ... existing categorization logic ...

    // After producing a result, store decision in memory (non-blocking)
    if (this.agentMemory) {
      const inputHash = computeInputHash({
        payeeName: transaction.payeeName || '',
        description: transaction.description,
        amountCents: transaction.amountCents,
        isCredit: transaction.isCredit,
      });
      this.agentMemory.storeDecision({
        tenantId,
        agentType: 'categorizer',
        inputHash,
        decision: result,
        confidence: result.confidence,
        source: result.source || 'PATTERN',
        transactionId: transaction.id,
      }).catch(err => this.logger.warn(`Failed to store decision: ${err.message}`));
    }

    return result;
  }
  ```

  ### 9. Tenant Isolation
  ALL queries MUST include tenantId. Never expose data across tenants.
  ```typescript
  // CORRECT
  await this.prisma.agentDecision.findMany({
    where: { tenantId, agentType },
  });

  // WRONG - missing tenant isolation
  await this.prisma.agentDecision.findMany({
    where: { agentType },
  });
  ```

  ### 10. Non-Blocking Decision Storage
  Decision storage must NEVER block the main categorization/matching flow. Use `.catch()` to swallow errors:
  ```typescript
  // Store decision asynchronously — never block the response
  this.agentMemory.storeDecision(params).catch(err =>
    this.logger.warn(`Non-critical: failed to store decision: ${err.message}`)
  );
  ```
</critical_patterns>

<context>
  ## Business Context

  CrecheBooks is a South African creche management platform. The AI agents handle transaction categorization (mapping bank transactions to chart-of-accounts codes) and payment matching (matching incoming payments to invoices). Currently, if a human corrects a categorization, that correction is not fed back to the AI. This task creates the feedback loop.

  **Pattern Learning Loop:**
  1. Agent makes categorization decision (e.g., "Woolworths" -> "Food & Catering")
  2. Decision is stored in AgentDecision table
  3. Human reviews and corrects if wrong (e.g., "Woolworths" -> "Educational Supplies")
  4. Correction stored in CorrectionFeedback table
  5. After 3+ consistent corrections, PatternLearner creates/updates a PayeePattern
  6. Future categorizations use the learned pattern (higher confidence than LLM-only)

  **SA-Specific Examples:**
  - "Woolworths" -> "Food & Catering" (most creches) or "Educational Supplies" (some creches) -- tenant-specific pattern
  - "Pick n Pay" -> varies by context (food vs. supplies)
  - "Eskom" -> "Utilities" (universal)
  - "Makro" -> "Bulk Supplies" or "Food & Catering" (varies)

  **Critical SA Compliance:**
  - All monetary values in CENTS (integers)
  - Tenant isolation is mandatory
  - Decision audit trail required for financial compliance
  - No PII in decision metadata (only IDs and codes)
</context>

<scope>
  <in_scope>
    - agentic-flow AgentDB integration (6 cognitive memory patterns) wrapping decision storage and retrieval
    - agentic-flow ReasoningBank integration for storing decision reasoning chains
    - ruvector HNSW embedding-based semantic similarity search for finding similar past decisions (replaces SHA-256 exact hash matching)
    - ruvector GNN self-improving index for organic pattern learning from corrections
    - Dual-write pattern: every write goes to both agentic-flow/ruvector AND Prisma
    - AgentDecision Prisma model with migration (compliance audit layer)
    - CorrectionFeedback Prisma model with migration (compliance audit layer)
    - PayeePattern model additions (source, isActive fields) with migration
    - Tenant model relation additions
    - AgentMemoryService wrapping AgentDB + ReasoningBank + ruvector + Prisma dual-write
    - PatternLearner wrapping ruvector GNN + Prisma PayeePattern dual-write (auto-creates PayeePatterns after 3+ corrections)
    - CorrectionHandler wrapping agentic-flow feedback loops + Prisma dual-write
    - SHA-256 input hash computation retained as fallback identifier and Prisma index key
    - Integration with TransactionCategorizerAgent (optional injection, non-blocking)
    - Integration with PaymentMatcherAgent (optional injection, non-blocking)
    - AgentMemoryModule registered in DatabaseModule
    - Comprehensive unit tests (90%+ coverage)
  </in_scope>
  <out_of_scope>
    - Migrating existing PayeePattern data to ruvector (future task -- current patterns remain in Prisma only)
    - Frontend correction UI (separate task -- API endpoint only)
    - Real-time learning (batch process corrections on write)
    - SARS agent memory integration (lower priority, add in future task)
    - Extraction validator memory integration (add in future task)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate and apply Prisma migration
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
pnpm prisma migrate dev --name add_agent_memory

# 2. Verify Prisma client generation
pnpm prisma generate

# 3. Run unit tests for memory module
pnpm test -- --testPathPattern="tests/agents/memory" --verbose

# 4. Run existing agent tests to verify no regression
pnpm test -- --testPathPattern="tests/agents" --verbose

# 5. Build the project
pnpm run build

# 6. Lint check
pnpm run lint

# 7. Type check
pnpm run typecheck

# 8. Run full test suite to verify no regressions
pnpm test
```
</verification_commands>

<definition_of_done>
  - [ ] AgentDecision model added to `apps/api/prisma/schema.prisma` with all indexes and `@@map("agent_decisions")`
  - [ ] CorrectionFeedback model added to `apps/api/prisma/schema.prisma` with all indexes and `@@map("correction_feedback")`
  - [ ] PayeePattern model updated with `source` (default 'MANUAL') and `isActive` (default true) fields
  - [ ] Tenant model updated with `agentDecisions` and `correctionFeedback` relations
  - [ ] Prisma migration created and applies cleanly
  - [ ] All Prisma models unchanged for compliance -- AgentDecision, CorrectionFeedback, PayeePattern retained as audit layer
  - [ ] `apps/api/src/agents/memory/interfaces/agent-memory.interface.ts` — all types defined (StoreDecisionParams, RecordCorrectionParams, AccuracyStats, PatternLearnResult, CorrectedCategorization)
  - [ ] `apps/api/src/agents/memory/agent-memory.service.ts` — wraps agentic-flow AgentDB + ReasoningBank with Prisma dual-write and ruvector vector search
  - [ ] AgentMemoryService.storeDecision() dual-writes to both AgentDB and Prisma, stores embedding in ruvector
  - [ ] AgentMemoryService.getSimilarDecisions() uses ruvector HNSW semantic similarity with Prisma exact-hash fallback
  - [ ] AgentMemoryService.recordCorrection() uses agentic-flow feedback loops with Prisma dual-write
  - [ ] ReasoningBank stores decision reasoning chains (richer than flat decision metadata)
  - [ ] `apps/api/src/agents/memory/pattern-learner.ts` — wraps ruvector GNN self-improving index with Prisma PayeePattern dual-write, processCorrection creates PayeePattern after 3+ corrections
  - [ ] ruvector GNN learns patterns organically from every correction (no threshold); Prisma PayeePattern still requires 3+ threshold
  - [ ] `apps/api/src/agents/memory/correction-handler.ts` — wraps agentic-flow built-in correction/feedback loops with Prisma dual-write
  - [ ] `apps/api/src/agents/memory/agent-memory.module.ts` — NestJS module wiring including AgentDB, ReasoningBank, RuvectorService providers
  - [ ] Dual-write verified: every write goes to both agentic-flow/ruvector AND Prisma
  - [ ] `apps/api/src/agents/transaction-categorizer/categorizer.agent.ts` — uses AgentMemoryService via `@Optional()` injection, stores decisions non-blocking
  - [ ] `apps/api/src/agents/payment-matcher/matcher.agent.ts` — uses AgentMemoryService via `@Optional()` injection, stores decisions non-blocking
  - [ ] @Optional() injection pattern retained for backwards compatibility
  - [ ] `apps/api/src/database/database.module.ts` — imports AgentMemoryModule
  - [ ] `tests/agents/memory/agent-memory.service.spec.ts` — unit tests (90%+ coverage) including dual-write verification, ruvector similarity search, AgentDB cognitive memory
  - [ ] `tests/agents/memory/pattern-learner.spec.ts` — unit tests including 3-correction threshold, ruvector GNN learning, PayeePattern dual-write, tenant isolation
  - [ ] `tests/agents/memory/correction-handler.spec.ts` — unit tests including agentic-flow feedback loop verification
  - [ ] All existing 1536+ tests still pass
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
</definition_of_done>

<anti_patterns>
  - **NEVER** auto-learn from a single correction. Minimum 3 consistent corrections required before creating a Prisma PayeePattern. (ruvector GNN may learn organically from fewer corrections, but Prisma patterns require the threshold.)
  - **NEVER** delete or overwrite existing manual PayeePatterns. Learned patterns supplement them. Manual patterns always take priority.
  - **NEVER** expose correction or decision data across tenants. Every query must include `tenantId`.
  - **NEVER** store raw transaction data (descriptions, payee names) directly in AgentDecision. Store only the decision metadata (account codes, confidence, source) and the inputHash for dedup.
  - **NEVER** let decision storage block the main categorization/matching response. Always use non-blocking `.catch()` pattern.
  - **NEVER** use `npm` — use `pnpm` for all commands.
  - **NEVER** save test files in the project root. Tests go in `tests/agents/memory/`.
  - **NEVER** use float for monetary values. All amounts in cents (integers).
  - **NEVER** use `@default(cuid())` — this project uses `@default(uuid())` for primary keys.
  - **NEVER** remove the Prisma dual-write -- `AgentDecision` and `CorrectionFeedback` are compliance requirements for SA financial regulations. AgentDB/ruvector supplement but never replace the Prisma audit trail.
  - **NEVER** remove `PayeePattern` Prisma model -- it is used across the codebase (pattern matcher, confidence scorer, etc.). ruvector vector patterns supplement, they do not replace PayeePattern.
  - **NEVER** store raw PII in ruvector embeddings -- sanitize all input text before embedding generation. Only store sanitized descriptions, never parent names, ID numbers, or financial account details.
  - **NEVER** trust ruvector semantic similarity alone for critical financial decisions -- always validate ruvector similarity results against deterministic checks (exact hash match, amount match, tenant isolation).
</anti_patterns>

</task_spec>
