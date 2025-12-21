<task_spec id="TASK-AGENT-005" version="4.0">

<metadata>
  <title>Orchestrator Agent Setup</title>
  <status>completed</status>
  <layer>agent</layer>
  <sequence>41</sequence>
  <implements>
    <requirement_ref>NFR-ARCH-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-AGENT-001</task_ref>
    <task_ref status="ready">TASK-AGENT-002</task_ref>
    <task_ref status="ready">TASK-AGENT-003</task_ref>
    <task_ref status="ready">TASK-AGENT-004</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<current_state>
## IMPLEMENTATION STATUS: CODE COMPLETE, TESTS FAILING

**Files Implemented (Verified 2025-12-21):**
```
src/agents/orchestrator/
├── orchestrator.agent.ts     # Main orchestrator
├── orchestrator.module.ts    # NestJS module (imports all agent modules)
├── workflow-router.ts        # Routes to appropriate agents
├── escalation-manager.ts     # Manages escalation workflow
├── index.ts                  # Barrel export
└── interfaces/
    └── orchestrator.interface.ts
```

**Test File:**
- `tests/agents/orchestrator/orchestrator.agent.spec.ts`

**BLOCKER: Tests fail with "DATABASE_URL not set"**
- Root cause: `.env.test` file missing
- Fix: Run TASK-AGENT-001 first
</current_state>

<context>
The Orchestrator coordinates all specialized agents:
- TransactionCategorizerAgent (TASK-AGENT-002)
- PaymentMatcherAgent (TASK-AGENT-003)
- SarsAgent (TASK-AGENT-004)

**Supported Workflows:**
| Workflow | Agents Used | Autonomy |
|----------|-------------|----------|
| CATEGORIZE_TRANSACTIONS | TransactionCategorizer | L3 (auto high-confidence) |
| MATCH_PAYMENTS | PaymentMatcher | L3 (auto high-confidence) |
| GENERATE_EMP201 | SarsAgent | L2 (always review) |
| GENERATE_VAT201 | SarsAgent | L2 (always review) |
| BANK_IMPORT | Categorizer + Matcher | L3 |
| MONTHLY_CLOSE | All | Mixed L2/L3 |

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS
- NO backwards compatibility
- SARS workflows always L2
- Transaction/Payment workflows use L3 for high confidence
</context>

<existing_implementation>
## Key Code Reference

**OrchestratorAgent.executeWorkflow():**
```typescript
async executeWorkflow(request: WorkflowRequest): Promise<WorkflowResult> {
  // Routes to appropriate agents based on request.type
  switch (request.type) {
    case 'CATEGORIZE_TRANSACTIONS': await this.executeCategorization(request, result);
    case 'MATCH_PAYMENTS': await this.executePaymentMatching(request, result);
    case 'GENERATE_EMP201': await this.executeEmp201(request, result);
    case 'BANK_IMPORT':
      await this.executeCategorization(request, result);
      await this.executePaymentMatching(request, result);
  }
}
```

**WorkflowResult Structure:**
```typescript
interface WorkflowResult {
  workflowId: string;
  type: string;
  status: 'COMPLETED' | 'PARTIAL' | 'ESCALATED';
  autonomyLevel: 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO';
  results: Array<{ agent: string; processed: number; autoApplied: number; escalated: number; errors: number }>;
  escalations: Array<{ type: string; reason: string; details: Record<string, unknown> }>;
}
```

**Autonomy Level Rules:**
```typescript
private getAutonomyLevel(type: string): AutonomyLevel {
  if (['CALCULATE_PAYE', 'GENERATE_EMP201', 'GENERATE_VAT201'].includes(type))
    return 'L2_DRAFT';  // SARS always requires review
  return 'L3_FULL_AUTO'; // Transaction/Payment can auto-apply
}
```
</existing_implementation>

<implementation_actions>
## REQUIRED ACTIONS

### Prerequisite: Complete TASK-AGENT-001 through TASK-AGENT-004
All sub-agents must work before orchestrator can be tested.

### Step 1: Verify all agent modules can be imported
```bash
npm run build
```

### Step 2: Run orchestrator tests
```bash
npm run test -- --testPathPatterns="orchestrator" --verbose
```

### Step 3: Verify workflow execution
Test each workflow type:
- CATEGORIZE_TRANSACTIONS → uses TransactionCategorizerAgent
- MATCH_PAYMENTS → uses PaymentMatcherAgent
- GENERATE_EMP201 → uses SarsAgent, returns L2_DRAFT
- BANK_IMPORT → uses both Categorizer + Matcher

### Step 4: Verify escalation aggregation
Orchestrator should aggregate escalations from all sub-agents and set status to 'ESCALATED' if any escalations exist.
</implementation_actions>

<validation_criteria>
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- Orchestrator tests pass
- CATEGORIZE workflow returns L3_FULL_AUTO
- MATCH_PAYMENTS workflow returns L3_FULL_AUTO
- GENERATE_EMP201 workflow returns L2_DRAFT
- BANK_IMPORT executes both Categorizer and Matcher
- Results aggregated from all sub-agents
- Escalations collected and status set to 'ESCALATED' if any
- All workflows logged to `.claude/logs/decisions.jsonl`
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="orchestrator" --verbose
npm run test -- --testPathPatterns="agents" --verbose
</test_commands>

</task_spec>
