<task_spec id="TASK-AGENT-004" version="3.0">

<metadata>
  <title>SARS Calculation Agent</title>
  <status>COMPLETE</status>
  <layer>agent</layer>
  <sequence>40</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-SARS-011 to TASK-SARS-016</task_ref>
    <task_ref status="PENDING">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the SARS Calculation Agent that wraps existing SARS services with Claude Code agent capabilities. SARS services are complete:
- PayeService, UifService, VatService, Emp201Service, Vat201Service, Irp5Service

This task adds:
- ALWAYS escalate for review (L2 autonomy - never auto-submit)
- Decision logging to .claude/logs/decisions.jsonl
- Validation against .claude/context/sars_tables_2025.json

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- Decimal.js with ROUND_HALF_EVEN
- NO backwards compatibility - fail fast
- SARS submissions ALWAYS require human review (L2)

**EXISTING INFRASTRUCTURE (DO NOT RECREATE):**
- PayeService at src/database/services/paye.service.ts
- UifService at src/database/services/uif.service.ts
- VatService at src/database/services/vat.service.ts
- Emp201Service at src/database/services/emp201.service.ts
- Vat201Service at src/database/services/vat201.service.ts
- SARS constants at src/database/constants/paye.constants.ts
</context>

<existing_services>
```typescript
PayeService.calculatePaye(dto): Promise<PayeCalculationResult>
UifService.calculateUif(dto): Promise<UifCalculationResult>
VatService.calculateVatOutput(amountCents): VatCalculation
Emp201Service.generateEmp201(dto): Promise<Emp201Return>
Vat201Service.generateVat201(dto): Promise<Vat201Return>
```

SARS 2025 constants from src/database/constants/paye.constants.ts:
- TAX_BRACKETS_2025: 7 brackets, 18%-45%
- REBATES_2025: Primary R17,600, Secondary R9,750, Tertiary R3,255
- UIF: 1% employee + 1% employer, max R177.12/month
- VAT: 15% standard rate
</existing_services>

<files_to_create>
1. src/agents/sars-agent/sars.agent.ts - Main agent
2. src/agents/sars-agent/decision-logger.ts - Log SARS decisions
3. src/agents/sars-agent/context-validator.ts - Validate against sars_tables_2025.json
4. src/agents/sars-agent/interfaces/sars.interface.ts - Types
5. src/agents/sars-agent/sars.module.ts - NestJS module
6. .claude/agents/sars-agent/calculate-paye.md - PAYE skill
7. tests/agents/sars-agent/sars.agent.spec.ts - Tests
</files_to_create>

<implementation_reference>

## Main Agent (src/agents/sars-agent/sars.agent.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PayeService } from '../../database/services/paye.service';
import { UifService } from '../../database/services/uif.service';
import { Emp201Service } from '../../database/services/emp201.service';
import { Vat201Service } from '../../database/services/vat201.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SarsDecision {
  type: 'PAYE' | 'UIF' | 'VAT' | 'EMP201' | 'VAT201';
  action: 'DRAFT_FOR_REVIEW';  // Always L2
  tenantId: string;
  period: string;
  calculatedAmountCents: number;
  requiresReview: true;
  reasoning: string;
}

@Injectable()
export class SarsAgent {
  private readonly logger = new Logger(SarsAgent.name);
  private readonly logPath = path.join(process.cwd(), '.claude/logs/decisions.jsonl');
  private readonly escalationsPath = path.join(process.cwd(), '.claude/logs/escalations.jsonl');

  constructor(
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
    private readonly emp201Service: Emp201Service,
    private readonly vat201Service: Vat201Service,
  ) {}

  async calculatePayeForReview(
    tenantId: string,
    grossIncomeCents: number,
    payFrequency: 'MONTHLY' | 'WEEKLY' | 'FORTNIGHTLY',
    dateOfBirth: Date,
    medicalAidMembers: number,
    period: string,
  ): Promise<SarsDecision> {
    const result = await this.payeService.calculatePaye({ grossIncomeCents, payFrequency, dateOfBirth, medicalAidMembers });

    const decision: SarsDecision = {
      type: 'PAYE',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period,
      calculatedAmountCents: result.monthlyPayeCents,
      requiresReview: true,
      reasoning: `PAYE R${(result.monthlyPayeCents / 100).toFixed(2)} for gross R${(grossIncomeCents / 100).toFixed(2)}`,
    };

    await this.logDecision(tenantId, 'PAYE', period, result.monthlyPayeCents, decision.reasoning);
    await this.logEscalation(tenantId, 'PAYE', period, 'SARS calculation requires human review', result.monthlyPayeCents);

    return decision;
  }

  async generateEmp201ForReview(tenantId: string, year: number, month: number): Promise<SarsDecision> {
    const result = await this.emp201Service.generateEmp201({ tenantId, year, month });
    const totalCents = result.totalPayeCents + result.totalUifCents;
    const period = `${year}-${String(month).padStart(2, '0')}`;

    const decision: SarsDecision = {
      type: 'EMP201',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period,
      calculatedAmountCents: totalCents,
      requiresReview: true,
      reasoning: `EMP201 R${(totalCents / 100).toFixed(2)} (PAYE R${(result.totalPayeCents / 100).toFixed(2)}, UIF R${(result.totalUifCents / 100).toFixed(2)})`,
    };

    await this.logDecision(tenantId, 'EMP201', period, totalCents, decision.reasoning);
    await this.logEscalation(tenantId, 'EMP201', period, 'EMP201 submission requires review', totalCents);

    return decision;
  }

  async generateVat201ForReview(tenantId: string, startDate: Date, endDate: Date): Promise<SarsDecision> {
    const result = await this.vat201Service.generateVat201({ tenantId, startDate, endDate });
    const period = `${startDate.toISOString().slice(0, 7)} to ${endDate.toISOString().slice(0, 7)}`;

    const decision: SarsDecision = {
      type: 'VAT201',
      action: 'DRAFT_FOR_REVIEW',
      tenantId,
      period,
      calculatedAmountCents: result.netVatCents,
      requiresReview: true,
      reasoning: `VAT201 R${(result.netVatCents / 100).toFixed(2)} (Output R${(result.outputVatCents / 100).toFixed(2)}, Input R${(result.inputVatCents / 100).toFixed(2)})`,
    };

    await this.logDecision(tenantId, 'VAT201', period, result.netVatCents, decision.reasoning);
    await this.logEscalation(tenantId, 'VAT201', period, 'VAT201 submission requires review', result.netVatCents);

    return decision;
  }

  private async logDecision(tenantId: string, type: string, period: string, amountCents: number, reasoning: string): Promise<void> {
    const entry = { timestamp: new Date().toISOString(), agent: 'sars-agent', tenantId, type, period, amountCents, autoApplied: false, reasoning };
    try { await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n'); } catch (e) { this.logger.error(`Log failed: ${e}`); }
  }

  private async logEscalation(tenantId: string, type: string, period: string, reason: string, amountCents: number): Promise<void> {
    const entry = { timestamp: new Date().toISOString(), agent: 'sars-agent', tenantId, type: 'SARS_SUBMISSION', subType: type, period, amountCents, reason, status: 'pending', requiresHumanApproval: true };
    try { await fs.appendFile(this.escalationsPath, JSON.stringify(entry) + '\n'); } catch (e) { this.logger.error(`Escalation failed: ${e}`); }
  }
}
```

## Module (src/agents/sars-agent/sars.module.ts)
```typescript
import { Module } from '@nestjs/common';
import { SarsAgent } from './sars.agent';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [SarsAgent],
  exports: [SarsAgent],
})
export class SarsAgentModule {}
```

## Agent Skill Doc (.claude/agents/sars-agent/calculate-paye.md)
```markdown
# SARS Agent - PAYE Skill

## Purpose
Calculate PAYE using 2025 SARS tax tables. ALWAYS draft for human review.

## Autonomy Level
L2 (Draft Only) - NEVER auto-submit to SARS

## Algorithm
1. Annualize income
2. Find tax bracket
3. Calculate: base_tax + (excess × rate)
4. Apply rebates (Primary R17,600, Secondary R9,750 age 65+, Tertiary R3,255 age 75+)
5. De-annualize to monthly
6. ALWAYS escalate for review

## All Amounts in CENTS
- Inputs/outputs in cents (integers)
- Decimal.js with ROUND_HALF_EVEN
```
</implementation_reference>

<test_requirements>
CRITICAL: Real PostgreSQL - NO MOCKS.

```typescript
describe('SarsAgent', () => {
  it('should always escalate PAYE', async () => {
    const decision = await agent.calculatePayeForReview(tenantId, 2500000, 'MONTHLY', new Date('1990-01-15'), 2, '2025-01');
    expect(decision.action).toBe('DRAFT_FOR_REVIEW');
    expect(decision.requiresReview).toBe(true);
  });

  it('should always escalate EMP201', async () => {
    const decision = await agent.generateEmp201ForReview(tenantId, 2025, 1);
    expect(decision.action).toBe('DRAFT_FOR_REVIEW');
    expect(decision.requiresReview).toBe(true);
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles
- Lint passes
- Tests pass with real PostgreSQL
- SARS always returns requiresReview: true
- All decisions logged
- All escalations logged
- Amounts in cents
- Decimal.js with ROUND_HALF_EVEN
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="sars-agent" --verbose
</test_commands>

</task_spec>
