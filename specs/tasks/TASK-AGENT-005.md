<task_spec id="TASK-AGENT-005" version="3.0">

<metadata>
  <title>Orchestrator Agent Setup</title>
  <status>COMPLETE</status>
  <layer>agent</layer>
  <sequence>41</sequence>
  <implements>
    <requirement_ref>NFR-ARCH-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-AGENT-001</task_ref>
    <task_ref status="PENDING">TASK-AGENT-002</task_ref>
    <task_ref status="PENDING">TASK-AGENT-003</task_ref>
    <task_ref status="PENDING">TASK-AGENT-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Orchestrator Agent that coordinates specialized agents:
- TransactionCategorizerAgent (TASK-AGENT-002)
- PaymentMatcherAgent (TASK-AGENT-003)
- SarsAgent (TASK-AGENT-004)

The orchestrator:
- Routes requests to appropriate agents
- Aggregates results
- Manages escalation workflow
- Provides unified decision logging

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- NO backwards compatibility - fail fast
- Tenant isolation on ALL operations
- SARS workflows always L2 (require review)
- Transaction/Payment workflows use L3 for high confidence
</context>

<workflow_types>
```typescript
type WorkflowType =
  | 'CATEGORIZE_TRANSACTIONS'   // Categorize pending transactions
  | 'MATCH_PAYMENTS'            // Match credits to invoices
  | 'CALCULATE_PAYE'            // Single PAYE calculation
  | 'GENERATE_EMP201'           // EMP201 return
  | 'GENERATE_VAT201'           // VAT201 return
  | 'BANK_IMPORT'               // Categorize + Match
  | 'MONTHLY_CLOSE';            // Full month-end

type AutonomyLevel = 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO';
```
</workflow_types>

<files_to_create>
1. src/agents/orchestrator/orchestrator.agent.ts - Main orchestrator
2. src/agents/orchestrator/workflow-router.ts - Route to agents
3. src/agents/orchestrator/escalation-manager.ts - Manage escalations
4. src/agents/orchestrator/interfaces/orchestrator.interface.ts - Types
5. src/agents/orchestrator/orchestrator.module.ts - NestJS module
6. .claude/agents/orchestrator/orchestrate.md - Skill doc
7. tests/agents/orchestrator/orchestrator.agent.spec.ts - Tests
</files_to_create>

<implementation_reference>

## Main Agent (src/agents/orchestrator/orchestrator.agent.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { TransactionCategorizerAgent } from '../transaction-categorizer/categorizer.agent';
import { PaymentMatcherAgent } from '../payment-matcher/matcher.agent';
import { SarsAgent } from '../sars-agent/sars.agent';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface WorkflowRequest {
  type: string;
  tenantId: string;
  parameters: Record<string, unknown>;
}

export interface WorkflowResult {
  workflowId: string;
  type: string;
  status: 'COMPLETED' | 'PARTIAL' | 'ESCALATED';
  autonomyLevel: 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO';
  results: Array<{ agent: string; processed: number; autoApplied: number; escalated: number; errors: number }>;
  escalations: Array<{ type: string; reason: string; details: Record<string, unknown> }>;
  startedAt: string;
  completedAt: string;
}

@Injectable()
export class OrchestratorAgent {
  private readonly logger = new Logger(OrchestratorAgent.name);
  private readonly logPath = path.join(process.cwd(), '.claude/logs/decisions.jsonl');

  constructor(
    private readonly transactionCategorizer: TransactionCategorizerAgent,
    private readonly paymentMatcher: PaymentMatcherAgent,
    private readonly sarsAgent: SarsAgent,
    private readonly prisma: PrismaService,
  ) {}

  async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
    const workflowId = uuidv4();
    const startedAt = new Date().toISOString();
    this.logger.log(`Starting workflow ${workflowId}: ${request.type}`);

    const result: WorkflowResult = {
      workflowId,
      type: request.type,
      status: 'COMPLETED',
      autonomyLevel: this.getAutonomyLevel(request.type),
      results: [],
      escalations: [],
      startedAt,
      completedAt: '',
    };

    try {
      switch (request.type) {
        case 'CATEGORIZE_TRANSACTIONS':
          await this.executeCategorization(request, result);
          break;
        case 'MATCH_PAYMENTS':
          await this.executePaymentMatching(request, result);
          break;
        case 'GENERATE_EMP201':
          await this.executeEmp201(request, result);
          break;
        case 'BANK_IMPORT':
          await this.executeCategorization(request, result);
          await this.executePaymentMatching(request, result);
          break;
        default:
          throw new Error(`Unknown workflow: ${request.type}`);
      }
    } catch (error) {
      result.status = 'PARTIAL';
      result.escalations.push({ type: 'WORKFLOW_ERROR', reason: String(error), details: {} });
    }

    result.completedAt = new Date().toISOString();
    if (result.escalations.length > 0 || result.results.some(r => r.escalated > 0)) {
      result.status = 'ESCALATED';
    }

    await this.logWorkflow(result);
    return result;
  }

  private getAutonomyLevel(type: string): 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO' {
    if (['CALCULATE_PAYE', 'GENERATE_EMP201', 'GENERATE_VAT201'].includes(type)) return 'L2_DRAFT';
    return 'L3_FULL_AUTO';
  }

  private async executeCategorization(request: WorkflowRequest, result: WorkflowResult): Promise<void> {
    const transactions = await this.prisma.transaction.findMany({
      where: { tenantId: request.tenantId, status: 'PENDING', isDeleted: false },
    });

    let autoApplied = 0, escalated = 0, errors = 0;
    for (const tx of transactions) {
      try {
        const cat = await this.transactionCategorizer.categorize(tx, request.tenantId);
        if (cat.autoApplied) autoApplied++;
        else {
          escalated++;
          result.escalations.push({ type: 'LOW_CONFIDENCE_CATEGORIZATION', reason: cat.reasoning, details: { transactionId: tx.id, confidence: cat.confidenceScore } });
        }
      } catch (e) { errors++; }
    }
    result.results.push({ agent: 'transaction-categorizer', processed: transactions.length, autoApplied, escalated, errors });
  }

  private async executePaymentMatching(request: WorkflowRequest, result: WorkflowResult): Promise<void> {
    const credits = await this.prisma.transaction.findMany({
      where: { tenantId: request.tenantId, isCredit: true, status: { in: ['PENDING', 'CATEGORIZED'] }, isDeleted: false, payments: { none: {} } },
    });
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId: request.tenantId, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, outstandingCents: { gt: 0 } },
      include: { parent: true, child: true },
    });

    let autoApplied = 0, escalated = 0, errors = 0;
    for (const tx of credits) {
      try {
        const candidates = this.findCandidates(tx, invoices);
        const decision = await this.paymentMatcher.makeMatchDecision(tx, candidates, request.tenantId);
        if (decision.action === 'AUTO_APPLY') autoApplied++;
        else if (decision.action === 'REVIEW_REQUIRED') {
          escalated++;
          result.escalations.push({ type: 'PAYMENT_MATCH', reason: decision.reasoning, details: { transactionId: tx.id } });
        }
      } catch (e) { errors++; }
    }
    result.results.push({ agent: 'payment-matcher', processed: credits.length, autoApplied, escalated, errors });
  }

  private findCandidates(tx: any, invoices: any[]): Array<{ invoice: any; confidence: number; matchReasons: string[] }> {
    return invoices.map(inv => {
      let confidence = 0;
      const reasons: string[] = [];
      if (tx.description.includes(inv.invoiceNumber)) { confidence += 40; reasons.push('Ref match'); }
      if (Math.abs(tx.amountCents - inv.outstandingCents) === 0) { confidence += 40; reasons.push('Amount match'); }
      const name = `${inv.parent.firstName} ${inv.parent.lastName}`.toUpperCase();
      if (tx.description.toUpperCase().includes(name)) { confidence += 20; reasons.push('Name match'); }
      return { invoice: inv, confidence, matchReasons: reasons };
    }).filter(c => c.confidence >= 20).sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  private async executeEmp201(request: WorkflowRequest, result: WorkflowResult): Promise<void> {
    const { year, month } = request.parameters as { year: number; month: number };
    const decision = await this.sarsAgent.generateEmp201ForReview(request.tenantId, year, month);
    result.results.push({ agent: 'sars-agent', processed: 1, autoApplied: 0, escalated: 1, errors: 0 });
    result.escalations.push({ type: 'SARS_EMP201', reason: 'EMP201 requires review', details: { amountCents: decision.calculatedAmountCents, period: decision.period } });
  }

  private async logWorkflow(result: WorkflowResult): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: 'orchestrator',
      workflowId: result.workflowId,
      type: result.type,
      status: result.status,
      autonomyLevel: result.autonomyLevel,
      totalProcessed: result.results.reduce((s, r) => s + r.processed, 0),
      totalAutoApplied: result.results.reduce((s, r) => s + r.autoApplied, 0),
      totalEscalated: result.results.reduce((s, r) => s + r.escalated, 0),
      durationMs: new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime(),
    };
    try { await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n'); } catch (e) { this.logger.error(`Log failed: ${e}`); }
  }
}
```

## Module (src/agents/orchestrator/orchestrator.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { OrchestratorAgent } from './orchestrator.agent';
import { TransactionCategorizerModule } from '../transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../payment-matcher/matcher.module';
import { SarsAgentModule } from '../sars-agent/sars.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, TransactionCategorizerModule, PaymentMatcherModule, SarsAgentModule],
  providers: [OrchestratorAgent],
  exports: [OrchestratorAgent],
})
export class OrchestratorModule {}
```

## Skill Doc (.claude/agents/orchestrator/orchestrate.md)
```markdown
# Orchestrator Agent

## Supported Workflows
- CATEGORIZE_TRANSACTIONS: L3 (auto high confidence)
- MATCH_PAYMENTS: L3 (auto high confidence)
- GENERATE_EMP201: L2 (always review)
- GENERATE_VAT201: L2 (always review)
- BANK_IMPORT: Categorize + Match (L3)
- MONTHLY_CLOSE: Full month-end (L2/L3 mixed)

## Routing
- Transactions → TransactionCategorizerAgent
- Payments → PaymentMatcherAgent
- SARS → SarsAgent (always L2)
```
</implementation_reference>

<test_requirements>
```typescript
describe('OrchestratorAgent', () => {
  it('should execute CATEGORIZE workflow', async () => {
    const result = await orchestrator.executeWorkflow({ type: 'CATEGORIZE_TRANSACTIONS', tenantId, parameters: {} });
    expect(result.autonomyLevel).toBe('L3_FULL_AUTO');
    expect(result.results.some(r => r.agent === 'transaction-categorizer')).toBe(true);
  });

  it('should execute BANK_IMPORT with multiple agents', async () => {
    const result = await orchestrator.executeWorkflow({ type: 'BANK_IMPORT', tenantId, parameters: {} });
    expect(result.results.length).toBe(2);
  });

  it('should always escalate SARS workflows', async () => {
    const result = await orchestrator.executeWorkflow({ type: 'GENERATE_EMP201', tenantId, parameters: { year: 2025, month: 1 } });
    expect(result.autonomyLevel).toBe('L2_DRAFT');
    expect(result.status).toBe('ESCALATED');
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles
- Lint passes
- Tests pass with real PostgreSQL
- SARS workflows return L2_DRAFT
- Transaction workflows use L3
- Results aggregated from all agents
- All workflows logged
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="orchestrator" --verbose
</test_commands>

</task_spec>
