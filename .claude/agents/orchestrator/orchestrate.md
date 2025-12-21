# Orchestrator Agent

## Purpose
Coordinate specialized agents for workflow execution:
- **TransactionCategorizerAgent**: Categorize bank transactions
- **PaymentMatcherAgent**: Match payments to invoices
- **SarsAgent**: SARS tax calculations and returns

## Supported Workflows

| Workflow | Autonomy | Description |
|----------|----------|-------------|
| `CATEGORIZE_TRANSACTIONS` | L3 | Categorize pending transactions (auto high confidence) |
| `MATCH_PAYMENTS` | L3 | Match credits to invoices (auto high confidence) |
| `CALCULATE_PAYE` | L2 | Single PAYE calculation (always review) |
| `GENERATE_EMP201` | L2 | Monthly employer declaration (always review) |
| `GENERATE_VAT201` | L2 | VAT return (always review) |
| `BANK_IMPORT` | L3 | Categorize + Match (auto high confidence) |
| `MONTHLY_CLOSE` | L2 | Full month-end processing (mixed, requires review) |

## Autonomy Levels

- **L1_SUGGEST**: Suggest only, no action taken
- **L2_DRAFT**: Create draft for human review
- **L3_FULL_AUTO**: Auto-apply for high confidence matches

## Routing Logic

```
CATEGORIZE_TRANSACTIONS → TransactionCategorizerAgent
MATCH_PAYMENTS → PaymentMatcherAgent
CALCULATE_PAYE → SarsAgent
GENERATE_EMP201 → SarsAgent
GENERATE_VAT201 → SarsAgent
BANK_IMPORT → TransactionCategorizerAgent → PaymentMatcherAgent
MONTHLY_CLOSE → All agents (sequential)
```

## Decision Flow

1. **Receive Request**: Parse workflow type and parameters
2. **Route to Agents**: Determine which agents needed
3. **Execute Agents**: Run in sequence or parallel
4. **Aggregate Results**: Combine all agent outcomes
5. **Determine Status**: COMPLETED | PARTIAL | ESCALATED | FAILED
6. **Log Decision**: Write to `.claude/logs/decisions.jsonl`
7. **Log Escalations**: Write to `.claude/logs/escalations.jsonl`

## Escalation Types

| Type | Priority | Trigger |
|------|----------|---------|
| `WORKFLOW_ERROR` | Critical | Agent or system failure |
| `SARS_EMP201` | High | EMP201 ready for review |
| `SARS_VAT201` | High | VAT201 ready for review |
| `SARS_PAYE` | High | PAYE calculation ready |
| `MONTHLY_CLOSE` | High | Month-end complete |
| `AMBIGUOUS_MATCH` | Medium | Multiple high-confidence matches |
| `LOW_CONFIDENCE_CATEGORIZATION` | Low | Confidence below threshold |
| `PAYMENT_MATCH` | Medium | Payment match needs review |

## Result Structure

```typescript
interface WorkflowResult {
  workflowId: string;
  type: WorkflowType;
  status: 'COMPLETED' | 'PARTIAL' | 'ESCALATED' | 'FAILED';
  autonomyLevel: 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO';
  results: Array<{
    agent: string;
    processed: number;
    autoApplied: number;
    escalated: number;
    errors: number;
  }>;
  escalations: Array<{
    type: string;
    reason: string;
    details: Record<string, unknown>;
  }>;
  startedAt: string;
  completedAt: string;
}
```

## Critical Rules

1. **SARS workflows ALWAYS L2** - Never auto-submit to SARS
2. **Tenant isolation** - All operations scoped to tenant
3. **All amounts in CENTS** - Never use floats for money
4. **Log everything** - All decisions and escalations logged
5. **Fail fast** - Errors should fail immediately, no workarounds

## Example Usage

```typescript
// Categorize transactions
const result = await orchestrator.executeWorkflow({
  type: 'CATEGORIZE_TRANSACTIONS',
  tenantId: 'tenant-123',
  parameters: {},
});

// Bank import (categorize + match)
const result = await orchestrator.executeWorkflow({
  type: 'BANK_IMPORT',
  tenantId: 'tenant-123',
  parameters: {},
});

// Monthly close
const result = await orchestrator.executeWorkflow({
  type: 'MONTHLY_CLOSE',
  tenantId: 'tenant-123',
  parameters: { periodMonth: '2025-01' },
});
```
