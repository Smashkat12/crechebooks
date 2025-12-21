<task_spec id="TASK-AGENT-003" version="3.0">

<metadata>
  <title>Payment Matcher Agent</title>
  <status>COMPLETE</status>
  <layer>agent</layer>
  <sequence>39</sequence>
  <implements>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-011</task_ref>
    <task_ref status="PENDING">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the Payment Matcher Agent that wraps the existing PaymentMatchingService
with Claude Code agent capabilities. The PaymentMatchingService already exists in
src/database/services/payment-matching.service.ts with a confidence-based scoring algorithm.
This task adds:
- Decision logging to .claude/logs/decisions.jsonl
- Escalation logging for ambiguous matches
- Context-aware matching using fee_structures.json
- Integration with tenant_config.json for thresholds

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers) - NEVER rands as floats
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
- 80% confidence threshold for auto-apply (L3 autonomy)

**EXISTING INFRASTRUCTURE (DO NOT RECREATE):**
- PaymentMatchingService at src/database/services/payment-matching.service.ts
- PaymentAllocationService at src/database/services/payment-allocation.service.ts
- PaymentRepository at src/database/repositories/payment.repository.ts
- InvoiceRepository at src/database/repositories/invoice.repository.ts
- Existing confidence scoring algorithm (0-100 points):
  - Reference Match: 0-40 points
  - Amount Match: 0-40 points
  - Name Similarity: 0-20 points
</context>

<existing_service>
PaymentMatchingService (src/database/services/payment-matching.service.ts) key methods:

```typescript
// ALREADY EXISTS - these methods work
matchPayments(dto: MatchPaymentsDto): Promise<MatchingBatchResult>
findMatchCandidates(transactionId: string, tenantId: string): Promise<MatchCandidate[]>
applyMatch(dto: ApplyMatchDto): Promise<AppliedMatch>

// Constants
const AUTO_APPLY_THRESHOLD = 80;
const CANDIDATE_THRESHOLD = 20;
const MAX_CANDIDATES = 5;

// Confidence scoring already implemented:
// - calculateReferenceScore() - 0-40 points
// - calculateAmountScore() - 0-40 points
// - calculateNameScore() - 0-20 points
```

Key types from src/database/dto/payment-matching.dto.ts:
```typescript
interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  childName: string;
  parentName: string;
  outstandingCents: number;
  confidenceScore: number;
  confidenceLevel: MatchConfidenceLevel;
  matchReasons: string[];
}

type MatchConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
```
</existing_service>

<files_to_create>
1. src/agents/payment-matcher/matcher.agent.ts - Main agent wrapping service
2. src/agents/payment-matcher/decision-logger.ts - Log matching decisions
3. src/agents/payment-matcher/context-loader.ts - Load fee_structures.json
4. src/agents/payment-matcher/interfaces/matcher.interface.ts - TypeScript types
5. src/agents/payment-matcher/matcher.module.ts - NestJS module
6. .claude/agents/payment-matcher/match-payments.md - Agent skill doc
7. tests/agents/payment-matcher/matcher.agent.spec.ts - Integration tests
</files_to_create>

<files_to_modify>
1. src/database/services/payment-matching.service.ts - Use PaymentMatcherAgent for decisions
2. src/app.module.ts - Import PaymentMatcherModule
</files_to_modify>

<implementation_reference>

## Agent Structure
```
src/agents/
└── payment-matcher/
    ├── matcher.agent.ts      # Main agent class
    ├── decision-logger.ts    # JSONL logging
    ├── context-loader.ts     # Load fee structures
    ├── matcher.module.ts     # NestJS module
    └── interfaces/
        └── matcher.interface.ts
```

## Main Agent (src/agents/payment-matcher/matcher.agent.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Transaction, Invoice } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MatchDecision {
  transactionId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  confidence: number;
  action: 'AUTO_APPLY' | 'REVIEW_REQUIRED' | 'NO_MATCH';
  reasoning: string;
  alternatives: Array<{ invoiceId: string; confidence: number }>;
}

export interface MatchDecisionLog {
  timestamp: string;
  agent: 'payment-matcher';
  tenantId: string;
  transactionId: string;
  transactionAmountCents: number;
  decision: 'match' | 'escalate' | 'no_match';
  invoiceId?: string;
  invoiceNumber?: string;
  confidence: number;
  autoApplied: boolean;
  reasoning: string;
  candidateCount: number;
}

@Injectable()
export class PaymentMatcherAgent {
  private readonly logger = new Logger(PaymentMatcherAgent.name);
  private readonly decisionsLogPath = path.join(process.cwd(), '.claude/logs/decisions.jsonl');
  private readonly escalationsLogPath = path.join(process.cwd(), '.claude/logs/escalations.jsonl');

  constructor(private readonly prisma: PrismaService) {}

  async makeMatchDecision(
    transaction: Transaction,
    candidates: Array<{
      invoice: Invoice;
      confidence: number;
      matchReasons: string[];
    }>,
    tenantId: string,
    autoApplyThreshold: number = 80,
  ): Promise<MatchDecision> {
    const highConfidenceCandidates = candidates.filter(c => c.confidence >= autoApplyThreshold);
    const allCandidates = candidates.filter(c => c.confidence >= 20);

    let decision: MatchDecision;

    if (candidates.length === 0) {
      decision = {
        transactionId: transaction.id,
        confidence: 0,
        action: 'NO_MATCH',
        reasoning: 'No matching invoices found',
        alternatives: [],
      };
      await this.logDecision({ tenantId, transactionId: transaction.id, transactionAmountCents: transaction.amountCents, decision: 'no_match', confidence: 0, autoApplied: false, reasoning: 'No matching invoices', candidateCount: 0 });
    } else if (highConfidenceCandidates.length === 1) {
      const best = highConfidenceCandidates[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'AUTO_APPLY',
        reasoning: best.matchReasons.join('; '),
        alternatives: allCandidates.filter(c => c.invoice.id !== best.invoice.id).map(c => ({ invoiceId: c.invoice.id, confidence: c.confidence })),
      };
      await this.logDecision({ tenantId, transactionId: transaction.id, transactionAmountCents: transaction.amountCents, decision: 'match', invoiceId: best.invoice.id, invoiceNumber: best.invoice.invoiceNumber, confidence: best.confidence, autoApplied: true, reasoning: best.matchReasons.join('; '), candidateCount: allCandidates.length });
    } else if (highConfidenceCandidates.length > 1) {
      const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'REVIEW_REQUIRED',
        reasoning: `Ambiguous: ${highConfidenceCandidates.length} high-confidence matches`,
        alternatives: allCandidates.map(c => ({ invoiceId: c.invoice.id, confidence: c.confidence })),
      };
      await this.logDecision({ tenantId, transactionId: transaction.id, transactionAmountCents: transaction.amountCents, decision: 'escalate', invoiceId: best.invoice.id, invoiceNumber: best.invoice.invoiceNumber, confidence: best.confidence, autoApplied: false, reasoning: `Ambiguous: ${highConfidenceCandidates.length} matches`, candidateCount: allCandidates.length });
      await this.logEscalation(tenantId, transaction.id, 'AMBIGUOUS_MATCH', `${highConfidenceCandidates.length} invoices >= ${autoApplyThreshold}%`, highConfidenceCandidates.map(c => c.invoice.id));
    } else {
      const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'REVIEW_REQUIRED',
        reasoning: `Confidence ${best.confidence}% < ${autoApplyThreshold}%`,
        alternatives: allCandidates.map(c => ({ invoiceId: c.invoice.id, confidence: c.confidence })),
      };
      await this.logDecision({ tenantId, transactionId: transaction.id, transactionAmountCents: transaction.amountCents, decision: 'escalate', invoiceId: best.invoice.id, invoiceNumber: best.invoice.invoiceNumber, confidence: best.confidence, autoApplied: false, reasoning: `Confidence ${best.confidence}% below threshold`, candidateCount: allCandidates.length });
      await this.logEscalation(tenantId, transaction.id, 'LOW_CONFIDENCE', `Best ${best.invoice.invoiceNumber} at ${best.confidence}%`, allCandidates.map(c => c.invoice.id));
    }

    return decision;
  }

  private async logDecision(entry: Omit<MatchDecisionLog, 'timestamp' | 'agent'>): Promise<void> {
    const fullEntry: MatchDecisionLog = { timestamp: new Date().toISOString(), agent: 'payment-matcher', ...entry };
    try { await fs.appendFile(this.decisionsLogPath, JSON.stringify(fullEntry) + '\n'); } catch (e) { this.logger.error(`Log failed: ${e}`); }
  }

  private async logEscalation(tenantId: string, txId: string, type: string, reason: string, invoiceIds: string[]): Promise<void> {
    const entry = { timestamp: new Date().toISOString(), agent: 'payment-matcher', tenantId, transactionId: txId, type, reason, candidateInvoiceIds: invoiceIds, status: 'pending' };
    try { await fs.appendFile(this.escalationsLogPath, JSON.stringify(entry) + '\n'); } catch (e) { this.logger.error(`Escalation log failed: ${e}`); }
  }
}
```

## Module (src/agents/payment-matcher/matcher.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { PaymentMatcherAgent } from './matcher.agent';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [PaymentMatcherAgent],
  exports: [PaymentMatcherAgent],
})
export class PaymentMatcherModule {}
```

## Agent Skill Doc (.claude/agents/payment-matcher/match-payments.md)
```markdown
# Payment Matcher Agent Skill

## Purpose
Match incoming bank payments (credit transactions) to outstanding invoices.

## Algorithm (0-100 points)
- Reference Match: 0-40 pts (exact=40, contains=30, suffix=15)
- Amount Match: 0-40 pts (exact=40, 1%=35, 5%=25, 10%=15)
- Name Similarity: 0-20 pts (exact=20, >0.8=15, >0.6=10)

## Decision Rules
- Single >= 80%: AUTO_APPLY
- Multiple >= 80%: REVIEW (ambiguous)
- Best < 80%: REVIEW (low confidence)
- No >= 20%: NO_MATCH

## Autonomy Level
- L3: Single high-confidence match
- L1: Multiple matches or low confidence
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL - NO MOCKS.

```typescript
describe('PaymentMatcherAgent', () => {
  it('should auto-apply single high-confidence match', async () => {
    const decision = await agent.makeMatchDecision(transaction, [{ invoice, confidence: 95, matchReasons: ['Exact ref'] }], tenantId);
    expect(decision.action).toBe('AUTO_APPLY');
  });

  it('should escalate ambiguous matches', async () => {
    const decision = await agent.makeMatchDecision(transaction, [
      { invoice: inv1, confidence: 85, matchReasons: [] },
      { invoice: inv2, confidence: 82, matchReasons: [] },
    ], tenantId);
    expect(decision.action).toBe('REVIEW_REQUIRED');
    expect(decision.reasoning).toContain('Ambiguous');
  });

  it('should escalate low-confidence', async () => {
    const decision = await agent.makeMatchDecision(transaction, [{ invoice, confidence: 55, matchReasons: [] }], tenantId);
    expect(decision.action).toBe('REVIEW_REQUIRED');
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles
- Lint passes
- Tests pass with real PostgreSQL
- Auto-apply only single >= 80%
- Escalate ambiguous (multiple >= 80%)
- Escalate low confidence (< 80%)
- All decisions logged to .claude/logs/decisions.jsonl
- All escalations logged
- Amounts in cents
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="payment-matcher" --verbose
</test_commands>

</task_spec>
