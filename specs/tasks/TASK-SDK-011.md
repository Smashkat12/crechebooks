<task_spec id="TASK-SDK-011" version="2.0">

<metadata>
  <title>Structured Audit Trail & Decision Hooks Migration</title>
  <status>ready</status>
  <phase>SDK-migration</phase>
  <layer>integration</layer>
  <sequence>711</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SDK-AUDIT</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-SDK-001</task_ref>
    <task_ref status="ready">TASK-SDK-010</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  All five agents (TransactionCategorizerAgent, PaymentMatcherAgent, SarsAgent, ExtractionValidator, Orchestrator) log decisions to JSONL flat files in `.claude/logs/`. Each agent has its own `DecisionLogger` class that writes to `decisions.jsonl` and `escalations.jsonl` via `fs.appendFile()`. These files are:
  - Append-only with no efficient query capability (full file scan required)
  - Not in the database (cannot join with transaction, invoice, or tenant data)
  - Not searchable or filterable by date, agent, confidence, or decision type
  - Inconsistent format across agents (each has unique interfaces)
  - Grow unbounded with no rotation or cleanup
  - Not accessible from a web dashboard

  The analysis specifies: "Hooks replace the custom decision logging with structured audit trails." The agentic-flow SDK (v2.0.2-alpha) provides a native hook system (pre-task, post-task, pre-edit, post-edit) that can replace the custom `DecisionHooks` class with a standardized, battle-tested hook lifecycle. Additionally, ruvector (v0.1.96) enables **vector-indexed audit search** -- "find all decisions similar to this one" via HNSW embedding similarity instead of just field-based filtering. This task migrates all decision logging to a unified database-backed audit trail while maintaining backwards-compatible JSONL writing.

  **Important:** The Prisma `AgentAuditLog` is a financial compliance requirement and cannot be replaced by agentic-flow or ruvector. The dual-write pattern becomes a **triple-write**: JSONL + Prisma + ruvector vector index.

  **Gap Analysis:**
  - 4 separate DecisionLogger classes with different interfaces (see existing files below)
  - No unified decision log model in the database
  - No pre-decision validation hooks (e.g., check tenant active, rate limits)
  - No post-decision action hooks (e.g., trigger accuracy tracking, update metrics)
  - No structured audit trail queryable by SQL
  - No performance tracking (decision duration in ms)
  - No workflow-level tracking (orchestrator flow linking)
  - Decision log format varies per agent:
    - Categorizer: `DecisionLogEntry` with `accountCode`, `accountName`, `confidence`, `source`
    - Matcher: `MatchDecisionLog` with `invoiceNumber`, `invoiceId`, `confidence`
    - SARS: `SarsDecisionLog` with `type`, `period`, `amountCents`, `autoApplied`
    - Validator: `ValidationDecision` with `balanceReconciled`, `flagCount`, `correctionCount`

  **Existing Decision Logger Files (to be updated):**
  - `apps/api/src/agents/transaction-categorizer/decision-logger.ts` — `DecisionLogger` class
  - `apps/api/src/agents/payment-matcher/decision-logger.ts` — `MatchDecisionLogger` class
  - `apps/api/src/agents/sars-agent/decision-logger.ts` — `SarsDecisionLogger` class
  - `apps/api/src/agents/extraction-validator/decision-logger.ts` — `ExtractionDecisionLogger` class
  - Orchestrator: logs via its own escalation-manager.ts (no dedicated decision-logger)

  **Files to Create:**
  - `apps/api/src/agents/audit/audit-trail.service.ts` (Unified audit service)
  - `apps/api/src/agents/audit/audit-trail.module.ts` (NestJS module)
  - `apps/api/src/agents/audit/decision-hooks.ts` (Pre/post decision hooks)
  - `apps/api/src/agents/audit/interfaces/audit.interface.ts` (Types and interfaces)
  - `tests/agents/audit/audit-trail.service.spec.ts`
  - `tests/agents/audit/decision-hooks.spec.ts`

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` (ADD AgentAuditLog model)
  - `apps/api/src/agents/transaction-categorizer/decision-logger.ts` (ADD AuditTrailService call alongside existing JSONL)
  - `apps/api/src/agents/payment-matcher/decision-logger.ts` (ADD AuditTrailService call alongside existing JSONL)
  - `apps/api/src/agents/sars-agent/decision-logger.ts` (ADD AuditTrailService call alongside existing JSONL)
  - `apps/api/src/agents/extraction-validator/decision-logger.ts` (ADD AuditTrailService call alongside existing JSONL)
  - `apps/api/src/agents/orchestrator/orchestrator.agent.ts` (USE AuditTrailService for workflow logging)
  - `apps/api/src/database/database.module.ts` (IMPORT AuditTrailModule)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, `pnpm prisma migrate dev`, etc.

  ### 2. Prisma Model — AgentAuditLog
  Follow existing schema conventions: `@id @default(uuid())`, snake_case `@map()`, `@@map()` for table names, tenant isolation via `tenantId`.

  ```prisma
  model AgentAuditLog {
    id              String   @id @default(uuid())
    tenantId        String   @map("tenant_id")
    agentType       String   @map("agent_type") @db.VarChar(30)
    eventType       String   @map("event_type") @db.VarChar(30)
    workflowId      String?  @map("workflow_id")
    transactionId   String?  @map("transaction_id")
    decision        String   @db.VarChar(50)
    confidence      Int?
    source          String?  @db.VarChar(20)
    autoApplied     Boolean  @default(false) @map("auto_applied")
    details         Json
    reasoning       String?  @db.Text
    durationMs      Int?     @map("duration_ms")
    createdAt       DateTime @default(now()) @map("created_at")

    tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

    @@index([tenantId, agentType])
    @@index([tenantId, eventType])
    @@index([tenantId, createdAt])
    @@index([workflowId])
    @@index([transactionId])
    @@map("agent_audit_logs")
  }
  ```

  **Also add to Tenant model relations:**
  ```prisma
  // Add to Tenant model's relations section:
  agentAuditLogs        AgentAuditLog[]
  ```

  ### 3. Event Types Enum (Application-Level, Not Prisma Enum)
  Define event types as TypeScript constants, not Prisma enums, for flexibility:

  ```typescript
  // interfaces/audit.interface.ts
  export const AgentType = {
    CATEGORIZER: 'categorizer',
    MATCHER: 'matcher',
    SARS: 'sars',
    VALIDATOR: 'validator',
    ORCHESTRATOR: 'orchestrator',
  } as const;
  export type AgentType = (typeof AgentType)[keyof typeof AgentType];

  export const EventType = {
    DECISION: 'DECISION',
    ESCALATION: 'ESCALATION',
    CORRECTION: 'CORRECTION',
    WORKFLOW_START: 'WORKFLOW_START',
    WORKFLOW_END: 'WORKFLOW_END',
    VALIDATION: 'VALIDATION',
  } as const;
  export type EventType = (typeof EventType)[keyof typeof EventType];

  export const DecisionSource = {
    LLM: 'LLM',
    PATTERN: 'PATTERN',
    HISTORICAL: 'HISTORICAL',
    HYBRID: 'HYBRID',
    RULE_BASED: 'RULE_BASED',
  } as const;
  export type DecisionSource = (typeof DecisionSource)[keyof typeof DecisionSource];

  export interface LogDecisionParams {
    tenantId: string;
    agentType: AgentType;
    transactionId?: string;
    workflowId?: string;
    decision: string;
    confidence?: number;
    source?: DecisionSource;
    autoApplied: boolean;
    details: Record<string, unknown>;
    reasoning?: string;
    durationMs?: number;
  }

  export interface LogEscalationParams {
    tenantId: string;
    agentType: AgentType;
    transactionId?: string;
    workflowId?: string;
    reason: string;
    details: Record<string, unknown>;
  }

  export interface LogWorkflowParams {
    tenantId: string;
    workflowId: string;
    eventType: 'WORKFLOW_START' | 'WORKFLOW_END';
    details: Record<string, unknown>;
    durationMs?: number;
  }

  export interface AuditFilters {
    agentType?: AgentType;
    eventType?: EventType;
    dateFrom?: Date;
    dateTo?: Date;
    transactionId?: string;
    workflowId?: string;
    limit?: number;
    offset?: number;
  }

  export interface EscalationStats {
    totalEscalations: number;
    byAgent: Record<string, number>;
    byReason: Record<string, number>;
  }

  export interface AgentPerformanceStats {
    totalDecisions: number;
    averageConfidence: number;
    averageDurationMs: number;
    autoApplyRate: number;
    escalationRate: number;
  }
  ```

  ### 4. AuditTrailService Implementation
  ```typescript
  @Injectable()
  export class AuditTrailService {
    private readonly logger = new Logger(AuditTrailService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Log a decision to the database.
     * Non-blocking — errors are logged but do not propagate.
     */
    async logDecision(params: LogDecisionParams): Promise<void> {
      try {
        await this.prisma.agentAuditLog.create({
          data: {
            tenantId: params.tenantId,
            agentType: params.agentType,
            eventType: EventType.DECISION,
            transactionId: params.transactionId,
            workflowId: params.workflowId,
            decision: params.decision,
            confidence: params.confidence,
            source: params.source,
            autoApplied: params.autoApplied,
            details: params.details,
            reasoning: params.reasoning,
            durationMs: params.durationMs,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to log decision for ${params.agentType}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async logEscalation(params: LogEscalationParams): Promise<void> {
      try {
        await this.prisma.agentAuditLog.create({
          data: {
            tenantId: params.tenantId,
            agentType: params.agentType,
            eventType: EventType.ESCALATION,
            transactionId: params.transactionId,
            workflowId: params.workflowId,
            decision: 'escalate',
            details: params.details,
            reasoning: params.reason,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to log escalation for ${params.agentType}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    async logWorkflow(params: LogWorkflowParams): Promise<void> {
      try {
        await this.prisma.agentAuditLog.create({
          data: {
            tenantId: params.tenantId,
            agentType: AgentType.ORCHESTRATOR,
            eventType: params.eventType,
            workflowId: params.workflowId,
            decision: params.eventType === 'WORKFLOW_START' ? 'start' : 'complete',
            details: params.details,
            durationMs: params.durationMs,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to log workflow event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    /**
     * Query decision history for a tenant with filters.
     */
    async getDecisionHistory(
      tenantId: string,
      filters: AuditFilters,
    ): Promise<AgentAuditLog[]> {
      return this.prisma.agentAuditLog.findMany({
        where: {
          tenantId,
          ...(filters.agentType && { agentType: filters.agentType }),
          ...(filters.eventType && { eventType: filters.eventType }),
          ...(filters.transactionId && { transactionId: filters.transactionId }),
          ...(filters.workflowId && { workflowId: filters.workflowId }),
          ...((filters.dateFrom || filters.dateTo) && {
            createdAt: {
              ...(filters.dateFrom && { gte: filters.dateFrom }),
              ...(filters.dateTo && { lte: filters.dateTo }),
            },
          }),
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 100,
        skip: filters.offset || 0,
      });
    }

    /**
     * Get escalation statistics for a time period.
     */
    async getEscalationStats(
      tenantId: string,
      dateFrom: Date,
      dateTo: Date,
    ): Promise<EscalationStats> {
      const escalations = await this.prisma.agentAuditLog.findMany({
        where: {
          tenantId,
          eventType: EventType.ESCALATION,
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        select: { agentType: true, reasoning: true },
      });

      const byAgent: Record<string, number> = {};
      const byReason: Record<string, number> = {};
      for (const esc of escalations) {
        byAgent[esc.agentType] = (byAgent[esc.agentType] || 0) + 1;
        const reason = esc.reasoning || 'unknown';
        byReason[reason] = (byReason[reason] || 0) + 1;
      }

      return { totalEscalations: escalations.length, byAgent, byReason };
    }

    /**
     * Get agent performance statistics.
     */
    async getAgentPerformance(
      tenantId: string,
      agentType: AgentType,
      dateFrom?: Date,
      dateTo?: Date,
    ): Promise<AgentPerformanceStats> {
      const where = {
        tenantId,
        agentType,
        eventType: EventType.DECISION,
        ...((dateFrom || dateTo) && {
          createdAt: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        }),
      };

      const [decisions, escalations, aggregates] = await Promise.all([
        this.prisma.agentAuditLog.count({ where }),
        this.prisma.agentAuditLog.count({
          where: { ...where, eventType: EventType.ESCALATION },
        }),
        this.prisma.agentAuditLog.aggregate({
          where,
          _avg: { confidence: true, durationMs: true },
          _count: { _all: true },
        }),
      ]);

      const autoApplied = await this.prisma.agentAuditLog.count({
        where: { ...where, autoApplied: true },
      });

      return {
        totalDecisions: decisions,
        averageConfidence: aggregates._avg.confidence || 0,
        averageDurationMs: aggregates._avg.durationMs || 0,
        autoApplyRate: decisions > 0 ? autoApplied / decisions : 0,
        escalationRate: decisions > 0 ? escalations / (decisions + escalations) : 0,
      };
    }
  }
  ```

  ### 5. Decision Hooks (wrapping agentic-flow hook system)
  DecisionHooks wraps agentic-flow's native hook lifecycle and adds ruvector vector-indexed audit entries:

  ```typescript
  import { AgenticFlowHooks } from 'agentic-flow';

  @Injectable()
  export class DecisionHooks {
    private readonly logger = new Logger(DecisionHooks.name);

    constructor(
      private readonly afHooks: AgenticFlowHooks,  // agentic-flow hooks
      private readonly ruvectorService: RuvectorService, // vector audit index
      private readonly prisma: PrismaService,       // compliance
      private readonly auditTrail: AuditTrailService,
    ) {}

    /**
     * Pre-decision validation. Called before any agent makes a decision.
     * Delegates to agentic-flow's pre-task hook, then applies domain checks.
     * Returns whether the decision is allowed to proceed.
     */
    async preDecision(context: {
      tenantId: string;
      agentType: AgentType;
    }): Promise<{ allowed: boolean; reason?: string }> {
      // agentic-flow pre-task hook (logging, metrics, etc.)
      await this.afHooks.preTask(context);

      // Domain-specific: verify tenant exists and subscription is active
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: context.tenantId },
        select: { subscriptionStatus: true },
      });

      if (!tenant) {
        return { allowed: false, reason: 'Tenant not found' };
      }

      if (tenant.subscriptionStatus === 'CANCELLED') {
        return { allowed: false, reason: 'Tenant subscription cancelled' };
      }

      return { allowed: true };
    }

    /**
     * Post-decision hook. Called after any agent makes a decision.
     * Triple-write: agentic-flow hook + ruvector vector index + Prisma audit trail.
     * Non-blocking.
     */
    async postDecision(context: LogDecisionParams): Promise<void> {
      await Promise.all([
        this.afHooks.postTask(context),              // agentic-flow hook
        this.ruvectorService.indexAuditEntry(context), // vector index for similarity search
        this.auditTrail.logDecision(context),          // Prisma write (compliance)
      ]);
    }

    /**
     * Post-escalation hook. Called when an agent escalates.
     */
    async postEscalation(params: LogEscalationParams): Promise<void> {
      await this.auditTrail.logEscalation(params);
    }

    /**
     * New capability: semantic audit search via ruvector.
     * Find all decisions similar to a natural-language query using HNSW embedding similarity.
     */
    async findSimilarDecisions(query: string, tenantId: string): Promise<AgentAuditLog[]> {
      const vectorResults = await this.ruvectorService.searchSimilar('audit', query, { tenantId });
      return this.prisma.agentAuditLog.findMany({
        where: { id: { in: vectorResults.map(r => r.id) } }
      });
    }
  }
  ```

  ### 6. Updating Existing Decision Loggers — Backwards-Compatible Pattern
  Each existing DecisionLogger must KEEP its JSONL writing AND add database logging via AuditTrailService. Use `@Optional()` injection so existing tests don't break.

  ```typescript
  // Example update for transaction-categorizer/decision-logger.ts:
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import { AuditTrailService } from '../audit/audit-trail.service';
  // ... existing imports ...

  @Injectable()
  export class DecisionLogger {
    private readonly logger = new Logger(DecisionLogger.name);
    // ... existing fields ...

    constructor(
      @Optional() @Inject(AuditTrailService) private readonly auditTrail?: AuditTrailService,
    ) {}

    async log(entry: Omit<DecisionLogEntry, 'timestamp' | 'agent'>): Promise<void> {
      // EXISTING: Write to JSONL (keep for backwards compatibility)
      await this.ensureLogsDirectory();
      const fullEntry: DecisionLogEntry = {
        timestamp: new Date().toISOString(),
        agent: 'transaction-categorizer',
        ...entry,
      };
      try {
        await fs.appendFile(this.decisionsPath, JSON.stringify(fullEntry) + '\n');
      } catch (error) {
        this.logger.error(`Failed to write decision log: ${error instanceof Error ? error.message : String(error)}`);
      }

      // NEW: Write to database audit trail (non-blocking)
      if (this.auditTrail) {
        this.auditTrail.logDecision({
          tenantId: entry.tenantId,
          agentType: 'categorizer',
          transactionId: entry.transactionId,
          decision: entry.decision,
          confidence: entry.confidence,
          source: entry.source as DecisionSource | undefined,
          autoApplied: entry.autoApplied ?? false,
          details: entry as Record<string, unknown>,
          reasoning: entry.reasoning,
        }).catch(err => this.logger.warn(`Audit trail write failed: ${err.message}`));
      }
    }

    // Same pattern for logEscalation...
  }
  ```

  **Apply the same pattern to ALL 4 decision loggers:**
  - `transaction-categorizer/decision-logger.ts` — `DecisionLogger`
  - `payment-matcher/decision-logger.ts` — `MatchDecisionLogger`
  - `sars-agent/decision-logger.ts` — `SarsDecisionLogger`
  - `extraction-validator/decision-logger.ts` — `ExtractionDecisionLogger`

  ### 7. NestJS Module Wiring
  ```typescript
  // audit-trail.module.ts
  import { Module } from '@nestjs/common';
  import { AuditTrailService } from './audit-trail.service';
  import { DecisionHooks } from './decision-hooks';
  import { PrismaService } from '../../database/prisma/prisma.service';

  @Module({
    providers: [PrismaService, AuditTrailService, DecisionHooks],
    exports: [AuditTrailService, DecisionHooks],
  })
  export class AuditTrailModule {}
  ```

  **Update DatabaseModule imports:**
  ```typescript
  // In database.module.ts, add:
  import { AuditTrailModule } from '../agents/audit/audit-trail.module';

  @Module({
    imports: [
      // ... existing imports ...
      AuditTrailModule, // TASK-SDK-011: Structured Audit Trail
    ],
    // ...
  })
  ```

  ### 8. Tenant Isolation
  ALL audit queries MUST include tenantId:
  ```typescript
  // CORRECT
  await this.prisma.agentAuditLog.findMany({ where: { tenantId, agentType } });

  // WRONG — cross-tenant leak
  await this.prisma.agentAuditLog.findMany({ where: { agentType } });
  ```

  ### 9. No PII in Audit Records
  ```typescript
  // CORRECT — only IDs and codes
  details: {
    transactionId: 'uuid-123',
    accountCode: '5010',
    accountName: 'Food & Catering',
    confidence: 92,
  }

  // WRONG — contains PII
  details: {
    payeeName: 'John Smith',
    bankAccount: '1234567890',
    description: 'Payment from Mrs. Williams',
  }
  ```

  ### 10. Duration Tracking
  All agent methods should track decision duration:
  ```typescript
  const startTime = Date.now();
  // ... agent decision logic ...
  const durationMs = Date.now() - startTime;

  await this.auditTrail.logDecision({
    // ... other params ...
    durationMs,
  });
  ```
</critical_patterns>

<context>
  ## Business Context

  Financial compliance in South Africa requires auditable decision trails. SARS (South African Revenue Service) and other regulatory bodies may request evidence of how financial categorizations and tax calculations were made. The current JSONL-based logging is insufficient for audit queries.

  **Key Requirements:**
  - Every agent decision must be traceable (who/what/when/why)
  - Escalations must be tracked with reasons
  - Workflow-level tracking links orchestrator flows to individual agent decisions
  - Performance metrics enable monitoring agent effectiveness
  - Backwards compatibility: existing JSONL logging continues during transition

  **Agent Decision Flow:**
  1. Orchestrator receives transaction batch -> logs WORKFLOW_START
  2. For each transaction, routes to appropriate agent
  3. Agent runs pre-decision hook (tenant validation)
  4. Agent makes decision -> logs DECISION with confidence, source, reasoning
  5. If confidence too low -> logs ESCALATION
  6. Agent runs post-decision hook (audit trail, metrics update)
  7. Orchestrator completes -> logs WORKFLOW_END with total duration

  **Migration Strategy (Backwards Compatible):**
  1. Add AuditTrailService as `@Optional()` dependency in existing loggers
  2. Existing JSONL writing continues (no deletion)
  3. New database logging runs in parallel
  4. Future task: deprecate JSONL after dashboard is built
  5. Future task: remove JSONL writing (breaking change, separate task)
</context>

<scope>
  <in_scope>
    - AgentAuditLog Prisma model with migration
    - Tenant model relation addition
    - AuditTrailService with logDecision, logEscalation, logWorkflow, and query methods
    - DecisionHooks wrapping agentic-flow hook system (pre-task, post-task) with domain-specific validation
    - ruvector vector-indexed audit search (`findSimilarDecisions()` via HNSW embedding similarity)
    - Triple-write pattern: JSONL + Prisma + ruvector vector index
    - AuditTrailModule NestJS module
    - Update all 4 existing DecisionLogger classes to dual-write (JSONL + database)
    - Update Orchestrator to use AuditTrailService for workflow logging
    - Import AuditTrailModule in DatabaseModule
    - Duration tracking in decision logging
    - Unit tests for AuditTrailService and DecisionHooks (90%+ coverage)
  </in_scope>
  <out_of_scope>
    - Frontend audit dashboard (separate task)
    - JSONL file removal or deprecation (keep for backwards compatibility)
    - Real-time audit event streaming (WebSocket/SSE)
    - Compliance report PDF generation
    - Rate limiting implementation in pre-decision hooks (stub only)
    - Automated alert triggers on escalation thresholds
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate and apply Prisma migration
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
pnpm prisma migrate dev --name add_agent_audit_log

# 2. Verify Prisma client generation
pnpm prisma generate

# 3. Run unit tests for audit module
pnpm test -- --testPathPattern="tests/agents/audit" --verbose

# 4. Run existing agent tests to verify no regression (CRITICAL)
pnpm test -- --testPathPattern="tests/agents" --verbose

# 5. Verify all existing decision loggers still work (JSONL + database)
pnpm test -- --testPathPattern="tests/agents/transaction-categorizer" --verbose
pnpm test -- --testPathPattern="tests/agents/payment-matcher" --verbose
pnpm test -- --testPathPattern="tests/agents/sars-agent" --verbose

# 6. Build the project
pnpm run build

# 7. Lint check
pnpm run lint

# 8. Type check
pnpm run typecheck

# 9. Run full test suite
pnpm test
```
</verification_commands>

<definition_of_done>
  - [ ] AgentAuditLog model added to `apps/api/prisma/schema.prisma` with all indexes and `@@map("agent_audit_logs")`
  - [ ] Tenant model updated with `agentAuditLogs` relation
  - [ ] Prisma migration created and applies cleanly
  - [ ] `apps/api/src/agents/audit/interfaces/audit.interface.ts` — all types and const enums defined
  - [ ] `apps/api/src/agents/audit/audit-trail.service.ts` — logDecision, logEscalation, logWorkflow, getDecisionHistory, getEscalationStats, getAgentPerformance methods
  - [ ] `apps/api/src/agents/audit/decision-hooks.ts` — wraps agentic-flow hook system; preDecision (tenant validation via afHooks.preTask), postDecision (triple-write: afHooks.postTask + ruvector.indexAuditEntry + Prisma), postEscalation
  - [ ] `apps/api/src/agents/audit/decision-hooks.ts` — `findSimilarDecisions()` method using ruvector similarity search (HNSW embeddings)
  - [ ] Triple-write verified: JSONL + Prisma + ruvector vector index all receive audit entries
  - [ ] ruvector vector-indexed audit entries for semantic search across decision history
  - [ ] `apps/api/src/agents/audit/audit-trail.module.ts` — NestJS module wiring (includes AgenticFlowHooks and RuvectorService providers)
  - [ ] `apps/api/src/agents/transaction-categorizer/decision-logger.ts` — dual-writes to JSONL AND AuditTrailService
  - [ ] `apps/api/src/agents/payment-matcher/decision-logger.ts` — dual-writes to JSONL AND AuditTrailService
  - [ ] `apps/api/src/agents/sars-agent/decision-logger.ts` — dual-writes to JSONL AND AuditTrailService
  - [ ] `apps/api/src/agents/extraction-validator/decision-logger.ts` — dual-writes to JSONL AND AuditTrailService
  - [ ] `apps/api/src/agents/orchestrator/orchestrator.agent.ts` — uses AuditTrailService for WORKFLOW_START/WORKFLOW_END events
  - [ ] `apps/api/src/database/database.module.ts` — imports AuditTrailModule
  - [ ] AuditTrailService uses `@Optional()` injection in all decision loggers (no breaking changes)
  - [ ] Existing JSONL logging continues to work exactly as before
  - [ ] Database audit logging is non-blocking (errors caught, logged, never propagated)
  - [ ] Duration tracking (durationMs) included in decision log entries
  - [ ] No PII stored in audit detail records (only IDs and codes)
  - [ ] `tests/agents/audit/audit-trail.service.spec.ts` — unit tests (90%+ coverage)
  - [ ] `tests/agents/audit/decision-hooks.spec.ts` — unit tests including tenant validation
  - [ ] All existing 1536+ tests still pass
  - [ ] `pnpm run build` succeeds
  - [ ] `pnpm run lint` passes
</definition_of_done>

<anti_patterns>
  - **NEVER** remove existing JSONL logging. Add database logging alongside it. JSONL deprecation is a future task.
  - **NEVER** remove the Prisma AgentAuditLog write -- it is a financial compliance requirement mandated by SA regulatory standards.
  - **NEVER** remove the JSONL write -- backwards compatibility required during the migration period.
  - **NEVER** store PII in ruvector audit embeddings -- embed decision metadata only (agent type, event type, decision, confidence), not personal data (names, bank accounts, descriptions).
  - **NEVER** log PII in audit records. No names, account numbers, bank details, or personal descriptions. Only IDs, codes, confidence scores, and decision metadata.
  - **NEVER** skip logging for any agent decision. Every categorization, match, SARS calculation, and validation must be logged.
  - **NEVER** allow cross-tenant audit queries. Every query method must require and filter by tenantId.
  - **NEVER** let audit logging failures propagate to the caller. Audit logging is non-critical — catch all errors.
  - **NEVER** make AuditTrailService a required dependency in existing classes. Use `@Optional() @Inject()` to avoid breaking existing tests.
  - **NEVER** use `npm` — use `pnpm` for all commands.
  - **NEVER** save test files in the project root. Tests go in `tests/agents/audit/`.
  - **NEVER** use `@default(cuid())` — this project uses `@default(uuid())` for primary keys.
  - **NEVER** use Prisma enums for event types or agent types. Use TypeScript const objects for flexibility.
</anti_patterns>

</task_spec>
