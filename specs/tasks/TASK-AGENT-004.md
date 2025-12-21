<task_spec id="TASK-AGENT-004" version="4.0">

<metadata>
  <title>SARS Calculation Agent</title>
  <status>completed</status>
  <layer>agent</layer>
  <sequence>40</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-SARS-011 to TASK-SARS-016</task_ref>
    <task_ref status="ready">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<current_state>
## IMPLEMENTATION STATUS: CODE COMPLETE, TESTS FAILING

**Files Implemented (Verified 2025-12-21):**
```
src/agents/sars-agent/
├── sars.agent.ts            # Main agent
├── sars.module.ts           # NestJS module
├── decision-logger.ts       # JSONL logging
├── context-validator.ts     # Validates against sars_tables_2025.json
├── index.ts                 # Barrel export
└── interfaces/
    └── sars.interface.ts
```

**Test File:**
- `tests/agents/sars-agent/sars.agent.spec.ts`

**BLOCKER: Tests fail with "DATABASE_URL not set"**
- Root cause: `.env.test` file missing
- Fix: Run TASK-AGENT-001 first
</current_state>

<context>
This agent wraps existing SARS services with Claude Code capabilities.
**CRITICAL: SARS calculations ALWAYS require human review (L2 autonomy).**

Uses existing services:
- PayeService (2025 tax brackets)
- UifService (1% capped at R177.12/month)
- VatService (15% standard rate)
- Emp201Service (monthly PAYE/UIF return)
- Vat201Service (bi-monthly VAT return)

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- Decimal.js with ROUND_HALF_EVEN (banker's rounding)
- NO backwards compatibility - fail fast
- SARS submissions ALWAYS require review (L2)
- Tax tables from `.claude/context/sars_tables_2025.json`
</context>

<existing_implementation>
## Key Code Reference

**SarsAgent Methods:**
```typescript
// All return { action: 'DRAFT_FOR_REVIEW', requiresReview: true }
calculatePayeForReview(tenantId, grossIncomeCents, payFrequency, dob, medicalAidMembers, period)
generateEmp201ForReview(tenantId, year, month)
generateVat201ForReview(tenantId, startDate, endDate)
```

**SARS 2025 Tax Brackets (from sars_tables_2025.json):**
| Bracket | Annual Income (Cents) | Rate | Base Tax (Cents) |
|---------|----------------------|------|------------------|
| 1 | 0 - 237,400 | 18% | 0 |
| 2 | 237,401 - 370,800 | 26% | 42,732 |
| 3 | 370,801 - 512,100 | 31% | 77,376 |
| 4 | 512,101 - 673,400 | 36% | 121,110 |
| 5 | 673,401 - 857,100 | 39% | 179,178 |
| 6 | 857,101 - 1,812,700 | 41% | 250,905 |
| 7 | > 1,812,700 | 45% | 642,567 |

**Rebates (ALL VALUES IN CENTS):**
- Primary: R17,600 (176,000 cents)
- Secondary (65+): R9,750 (97,500 cents)
- Tertiary (75+): R3,255 (32,550 cents)

**UIF:**
- Employee: 1% of gross (max R177.12/month = 17,712 cents)
- Employer: 1% of gross (max R177.12/month)
</existing_implementation>

<implementation_actions>
## REQUIRED ACTIONS

### Prerequisite: Complete TASK-AGENT-001
```bash
test -f .env.test || echo "BLOCKER: Run TASK-AGENT-001 first"
```

### Step 1: Verify SARS context file
```bash
node -e "
const data = JSON.parse(require('fs').readFileSync('.claude/context/sars_tables_2025.json'));
console.log('Tax brackets:', data.paye.taxBrackets.length);
console.log('Primary rebate (cents):', data.paye.rebates.primary.amountCents);
console.log('UIF max (cents):', data.uif.maxMonthlyContributionCents);
"
```

### Step 2: Run SARS agent tests
```bash
npm run build
npm run lint
npm run test -- --testPathPatterns="sars-agent" --verbose
```

### Step 3: Verify all returns have requiresReview: true
Every SARS calculation MUST return:
```typescript
{
  action: 'DRAFT_FOR_REVIEW',
  requiresReview: true
}
```
</implementation_actions>

<validation_criteria>
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- SARS agent tests pass
- ALL SARS methods return `requiresReview: true`
- Calculations use Decimal.js with ROUND_HALF_EVEN
- All values in CENTS
- Decisions logged to `.claude/logs/decisions.jsonl`
- Escalations logged to `.claude/logs/escalations.jsonl`
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="sars-agent" --verbose
</test_commands>

</task_spec>
