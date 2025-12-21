<task_spec id="TASK-AGENT-003" version="4.0">

<metadata>
  <title>Payment Matcher Agent</title>
  <status>completed</status>
  <layer>agent</layer>
  <sequence>39</sequence>
  <implements>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-011</task_ref>
    <task_ref status="ready">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<current_state>
## IMPLEMENTATION STATUS: CODE COMPLETE, TESTS FAILING

**Files Implemented (Verified 2025-12-21):**
```
src/agents/payment-matcher/
├── matcher.agent.ts          # Main agent (implements makeMatchDecision())
├── matcher.module.ts         # NestJS module
├── decision-logger.ts        # JSONL logging
├── index.ts                  # Barrel export
└── interfaces/
    └── matcher.interface.ts
```

**Test File:**
- `tests/agents/payment-matcher/matcher.agent.spec.ts`

**BLOCKER: Tests fail with "DATABASE_URL not set"**
- Root cause: `.env.test` file missing
- Fix: Run TASK-AGENT-001 first
</current_state>

<context>
This agent wraps the existing PaymentMatchingService with Claude Code capabilities:
- Match credit transactions to outstanding invoices
- Confidence-based auto-apply (single >= 80%)
- Escalate ambiguous matches (multiple >= 80%)
- Decision logging and escalation tracking

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- NO backwards compatibility - fail fast
- NO mock data in tests - use real PostgreSQL
- Tenant isolation on ALL queries
- Single high-confidence (>=80%) = AUTO_APPLY
- Multiple high-confidence = REVIEW_REQUIRED (ambiguous)
- Low confidence (<80%) = REVIEW_REQUIRED

**DEPENDS ON TASK-AGENT-001:**
Must complete TASK-AGENT-001 first for test database setup.
</context>

<existing_implementation>
## Key Code Reference

**PaymentMatcherAgent.makeMatchDecision():**
```typescript
async makeMatchDecision(
  transaction: Transaction,
  candidates: Array<{ invoice: Invoice; confidence: number; matchReasons: string[] }>,
  tenantId: string,
  autoApplyThreshold: number = 80,
): Promise<MatchDecision>
```

**Decision Rules:**
1. No candidates → `{ action: 'NO_MATCH' }`
2. Single candidate >= 80% → `{ action: 'AUTO_APPLY', autoApplied: true }`
3. Multiple candidates >= 80% → `{ action: 'REVIEW_REQUIRED', reasoning: 'Ambiguous' }`
4. Best candidate < 80% → `{ action: 'REVIEW_REQUIRED', reasoning: 'Low confidence' }`

**Confidence Scoring (from PaymentMatchingService):**
- Reference match: 0-40 points (exact=40, contains=30, suffix=15)
- Amount match: 0-40 points (exact=40, within 1%=35, 5%=25, 10%=15)
- Name similarity: 0-20 points (exact=20, >0.8=15, >0.6=10)
</existing_implementation>

<implementation_actions>
## REQUIRED ACTIONS

### Prerequisite: Complete TASK-AGENT-001
```bash
test -f .env.test || echo "BLOCKER: Run TASK-AGENT-001 first"
```

### Step 1: Verify code compiles
```bash
npm run build
npm run lint
```

### Step 2: Run payment matcher tests
```bash
npm run test -- --testPathPatterns="payment-matcher" --verbose
```

### Step 3: Verify decision logging
Check that decisions are written to `.claude/logs/decisions.jsonl`:
```json
{"timestamp":"...","agent":"payment-matcher","decision":"match|escalate|no_match",...}
```
</implementation_actions>

<validation_criteria>
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- Payment matcher tests pass
- Single >= 80% → AUTO_APPLY
- Multiple >= 80% → REVIEW_REQUIRED (ambiguous)
- < 80% → REVIEW_REQUIRED (low confidence)
- All decisions logged to `.claude/logs/decisions.jsonl`
- Escalations logged to `.claude/logs/escalations.jsonl`
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="payment-matcher" --verbose
</test_commands>

</task_spec>
