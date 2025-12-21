<task_spec id="TASK-AGENT-002" version="4.0">

<metadata>
  <title>Transaction Categorizer Agent</title>
  <status>completed</status>
  <layer>agent</layer>
  <sequence>38</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
    <task_ref status="ready">TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<current_state>
## IMPLEMENTATION STATUS: CODE COMPLETE, TESTS FAILING

**Files Implemented (Verified 2025-12-21):**
```
src/agents/transaction-categorizer/
├── categorizer.agent.ts      # Main agent (implements categorize())
├── categorizer.module.ts     # NestJS module (exports agent)
├── context-loader.ts         # Loads .claude/context/*.json
├── pattern-matcher.ts        # Regex pattern matching
├── confidence-scorer.ts      # Deterministic 0-100 scoring
├── decision-logger.ts        # JSONL logging to .claude/logs/
├── index.ts                  # Barrel export
└── interfaces/
    └── categorizer.interface.ts
```

**Test File:**
- `tests/agents/transaction-categorizer/categorizer.agent.spec.ts` (471 lines)

**BLOCKER: Tests fail with "DATABASE_URL not set"**
- Root cause: `.env.test` file missing
- Fix: Run TASK-AGENT-001 first to create `.env.test`
</current_state>

<context>
This agent wraps the existing CategorizationService with Claude Code capabilities:
- Pattern matching against `.claude/context/payee_patterns.json`
- Historical categorization lookup from database
- Deterministic confidence scoring
- Decision logging to `.claude/logs/decisions.jsonl`
- Escalation for low-confidence (<80%) transactions

**CRITICAL PROJECT RULES:**
- ALL monetary values are CENTS (integers)
- NO backwards compatibility - fail fast with errors
- NO mock data in tests - use real PostgreSQL
- Tenant isolation on ALL queries
- 80% confidence = auto-apply threshold (L3 autonomy)
- SARS patterns (flagForReview: true) always escalate

**DEPENDS ON TASK-AGENT-001:**
Must complete TASK-AGENT-001 first to:
1. Create `.env.test` with DATABASE_URL
2. Verify `.claude/context/` files exist
3. Ensure `.claude/logs/` is writable
</context>

<existing_implementation>
## Key Code Reference

**ContextLoader** loads from `.claude/context/`:
```typescript
// src/agents/transaction-categorizer/context-loader.ts
async loadContext(): Promise<AgentContext> {
  const [patternsRaw, coaRaw] = await Promise.all([
    fs.readFile(path.join(this.contextPath, 'payee_patterns.json'), 'utf-8'),
    fs.readFile(path.join(this.contextPath, 'chart_of_accounts.json'), 'utf-8'),
  ]);
  // Returns { patterns, chartOfAccounts, autoApplyThreshold: 80 }
}
```

**PatternMatcher** uses regex patterns:
```typescript
// src/agents/transaction-categorizer/pattern-matcher.ts
match(payee: string, description: string, amountCents?: number, isCredit?: boolean): PatternMatch[]
getBestMatch(payee: string, description: string): PatternMatch | null
```

**ConfidenceScorer** formula (0-100):
- Pattern match: confidence × 0.6 (max 60 points)
- Historical match: 25 base + 1 per additional (max 30 points)
- Typical amount: 10 points
- Description quality: words × 1 (max 10 points)

**TransactionCategorizerAgent.categorize():**
```typescript
async categorize(transaction: Transaction, tenantId: string): Promise<CategorizationResult> {
  // 1. Load context
  // 2. Pattern match
  // 3. Historical lookup
  // 4. Calculate confidence
  // 5. Log decision
  // 6. Escalate if <80% or flagForReview
  return { accountCode, accountName, confidenceScore, reasoning, vatType, isSplit, autoApplied, patternId };
}
```
</existing_implementation>

<implementation_actions>
## REQUIRED ACTIONS

### Prerequisite: Complete TASK-AGENT-001
```bash
# Verify .env.test exists
test -f .env.test || echo "BLOCKER: Run TASK-AGENT-001 first"
```

### Step 1: Verify code compiles
```bash
npm run build
npm run lint
```

### Step 2: Run categorizer tests
```bash
npm run test -- --testPathPatterns="transaction-categorizer" --verbose
```

### Step 3: If tests fail, debug specific issues
Common issues:
- `Context not loaded`: ContextLoader.loadContext() failed - check JSON files
- `DATABASE_URL not set`: .env.test missing - run TASK-AGENT-001
- `Prisma error`: Test database schema mismatch - run migrations

### Step 4: Verify pattern matching works
```bash
# Run a quick node test
node -e "
const fs = require('fs');
const patterns = JSON.parse(fs.readFileSync('.claude/context/payee_patterns.json'));
console.log('Patterns loaded:', patterns.patterns.length);
patterns.patterns.forEach(p => {
  try { new RegExp(p.regex, 'i'); } catch(e) { console.error('Invalid regex:', p.id, p.regex); }
});
console.log('All patterns valid');
"
```
</implementation_actions>

<validation_criteria>
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
- All 8 categorizer tests pass
- Pattern matching works with FNB, ESKOM, SARS patterns
- Confidence >= 80% → autoApplied = true (except flagForReview patterns)
- Confidence < 80% → autoApplied = false + escalation logged
- SARS patterns → always escalate (flagForReview: true)
- Decisions logged to `.claude/logs/decisions.jsonl`
- VatType correctly mapped from patterns
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="transaction-categorizer" --verbose
</test_commands>

</task_spec>
