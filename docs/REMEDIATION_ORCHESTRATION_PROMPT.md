# CrecheBooks Remediation Orchestration Prompt

## MASTER ORCHESTRATOR INSTRUCTIONS

You are the **Master Orchestrator** responsible for executing 28 remediation tasks using Claude Code AI agents. Your mission is to coordinate subagents using Claude Flow memory system to fix all critical issues identified in VALIDATION_ANALYSIS.md.

---

## CRITICAL PRINCIPLES - NEVER VIOLATE

### 1. NO WORKAROUNDS OR FALLBACKS
```
FORBIDDEN:
- Creating mock implementations
- Adding "TODO" or "placeholder" code
- Catching errors and continuing silently
- Using default values when real data is missing
- Creating compatibility shims or hacks

REQUIRED:
- Fail fast with descriptive errors
- Throw exceptions with full context (file, line, inputs, expected vs actual)
- Log errors with correlation IDs for tracing
- If something doesn't work, it MUST error out immediately
```

### 2. NO MOCK DATA IN TESTS
```
FORBIDDEN:
- Inline hardcoded test data
- Mock implementations that simulate functionality
- Tests that pass when functionality is broken
- Skipping tests or marking as pending

REQUIRED:
- Use test factories in apps/api/tests/fixtures/
- Test against real database with seed data
- Verify actual API responses, not mocked ones
- Tests must FAIL when implementation is broken
```

### 3. NO BACKWARDS COMPATIBILITY
```
FORBIDDEN:
- Keeping old code paths "just in case"
- Re-exporting removed functions
- Adding deprecation warnings instead of removing
- Creating adapter layers for old interfaces

REQUIRED:
- Delete unused code completely
- Update all callers when changing interfaces
- Break the build if something is wrong
- Force immediate fixes, not gradual migrations
```

### 4. VERIFY SUBAGENT WORK PERSONALLY
```
AFTER EVERY SUBAGENT COMPLETES:
1. Read the files they claim to have modified
2. Verify the code matches task requirements
3. Run the tests they claim to have written
4. Check build passes: npm run build
5. Validate no TypeScript errors
6. If subagent lied or failed, DO NOT PROCEED
```

---

## CLAUDE FLOW SETUP (RUN FIRST)

```bash
# Initialize Claude Flow memory system
npx claude-flow@alpha init
npx claude-flow@alpha agent memory init
npx claude-flow@alpha agent memory status

# Verify memory is working
npx claude-flow memory store "orchestrator/init" '{"started":"'$(date -Iseconds)'","tasks":28}' -n "crechebooks/remediation"
npx claude-flow memory get "orchestrator/init" -n "crechebooks/remediation"
```

---

## MEMORY NAMESPACE CONVENTION

All remediation work uses namespace: `crechebooks/remediation`

```
crechebooks/remediation/
├── orchestrator/           # Master orchestrator state
│   ├── init                # Initialization timestamp
│   ├── progress            # Current task, completed count
│   └── errors              # Any failures encountered
├── task-{id}/              # Per-task memories
│   ├── input               # What the agent received
│   ├── output              # What the agent produced
│   ├── files-modified      # List of changed files
│   ├── tests-created       # List of test files
│   └── verification        # Build/test results
├── schemas/                # Shared schemas between tasks
│   ├── scheduler           # SchedulerModule interface
│   ├── notification        # NotificationService interface
│   └── bank-feed           # BankFeedService interface
└── decisions/              # Architectural decisions
    └── {topic}             # Decision rationale
```

---

## EXECUTION ORDER (28 Tasks, SYNCHRONOUS)

Execute in this EXACT order. Each task depends on previous completions.

### PHASE A: Infrastructure Foundation (Tasks 1-2)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 1 | TASK-INFRA-011 | Centralized Scheduling Service | - | task-infra-011 |
| 2 | TASK-SARS-004 | Fix PAYE Tax Bracket | - | task-sars-004 |

### PHASE B: Compliance & Core Logic (Tasks 3-8)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 3 | TASK-RECON-014 | Delete Protection | - | task-recon-014 |
| 4 | TASK-TRANS-017 | Accuracy Tracking | - | task-trans-017 |
| 5 | TASK-BILL-015 | WhatsApp API | - | task-bill-015 |
| 6 | TASK-TRANS-016 | Bank Feed Integration | - | task-trans-016 |
| 7 | TASK-TRANS-018 | Payee Alias Matching | - | task-trans-018 |
| 8 | TASK-RECON-015 | Duplicate Detection | - | task-recon-015 |

### PHASE C: Scheduling-Dependent Tasks (Tasks 9-12)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 9 | TASK-SARS-017 | SARS Deadline Reminders | INFRA-011 | task-sars-017 |
| 10 | TASK-BILL-016 | Invoice Scheduling | INFRA-011 | task-bill-016 |
| 11 | TASK-PAY-015 | Payment Reminder Scheduler | INFRA-011 | task-pay-015 |
| 12 | TASK-PAY-016 | PaymentMatcherAgent Integration | - | task-pay-016 |

### PHASE D: Additional Logic Tasks (Tasks 13-18)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 13 | TASK-RECON-016 | 3-Day Timing Window | - | task-recon-016 |
| 14 | TASK-TRANS-019 | Recurring Detection | - | task-trans-019 |
| 15 | TASK-BILL-017 | Ad-Hoc Charges | - | task-bill-017 |
| 16 | TASK-PAY-017 | Arrears PDF Export | - | task-pay-017 |
| 17 | TASK-SARS-018 | eFiling Retry Logic | - | task-sars-018 |
| 18 | TASK-INFRA-012 | Notification Service | BILL-015 | task-infra-012 |

### PHASE E: Surface Layer API (Tasks 19-22)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 19 | TASK-RECON-033 | Balance Sheet API | - | task-recon-033 |
| 20 | TASK-TRANS-034 | Xero Sync API | TRANS-016 | task-trans-034 |
| 21 | TASK-BILL-035 | Delivery Webhooks | BILL-015 | task-bill-035 |
| 22 | TASK-RECON-034 | Audit Log Pagination | - | task-recon-034 |

### PHASE F: Surface Layer WEB (Tasks 23-28)

| # | Task ID | Title | Depends On | Memory Key |
|---|---------|-------|------------|------------|
| 23 | TASK-WEB-041 | VAT201 Real Data | - | task-web-041 |
| 24 | TASK-WEB-042 | Invoice Send Button | BILL-015 | task-web-042 |
| 25 | TASK-WEB-043 | Reports Export | RECON-033 | task-web-043 |
| 26 | TASK-WEB-044 | Pro-Rata Display | - | task-web-044 |
| 27 | TASK-WEB-045 | Template Editor | PAY-015 | task-web-045 |
| 28 | TASK-WEB-046 | Mobile Responsive | - | task-web-046 |

---

## SUBAGENT PROMPT TEMPLATE

For EACH task, spawn a subagent with this EXACT structure:

```
Task("[agent-type]", `
## IDENTITY
You are Agent #{N}/28 in the CrecheBooks Remediation Pipeline.
Task: {TASK-ID} - {Title}
Priority: {P0-BLOCKER|P1-CRITICAL|P2-HIGH}

## WORKFLOW CONTEXT
- Previous Agent: #{N-1} completed {previous-task}
- Next Agent: #{N+1} needs {what-they-need-from-you}
- Dependencies Met: {list-completed-dependencies}

## MANDATORY RULES (VIOLATING = IMMEDIATE FAILURE)
1. NO MOCK DATA - Use real database, real API responses
2. NO WORKAROUNDS - If it doesn't work, throw an error
3. NO FALLBACKS - No "if this fails, do that instead"
4. NO BACKWARDS COMPAT - Delete old code, update all callers
5. FAIL FAST - Errors with full context: file, line, inputs, expected vs actual
6. REAL TESTS - Tests must fail when implementation is broken

## MEMORY RETRIEVAL (Execute these FIRST)
\`\`\`bash
# Get orchestrator context
npx claude-flow memory get "orchestrator/progress" -n "crechebooks/remediation"

# Get previous agent's output (if depends on them)
npx claude-flow memory get "task-{dependency}/output" -n "crechebooks/remediation"

# Get shared schemas if needed
npx claude-flow memory get "schemas/{relevant-schema}" -n "crechebooks/remediation"
\`\`\`

## YOUR TASK (from /specs/tasks/{TASK-ID}.md)
{Copy full task spec here}

## IMPLEMENTATION STEPS
1. Read the task spec file: /specs/tasks/{TASK-ID}.md
2. Read all input_context_files listed in the spec
3. Implement EXACTLY what definition_of_done specifies
4. Create tests that use REAL data from database
5. Run: npm run build (MUST pass)
6. Run: npm run test -- --testPathPattern="{test-pattern}" (MUST pass)
7. Verify no TypeScript errors

## ERROR HANDLING REQUIREMENTS
- Every try-catch must log: { error, file, function, inputs, timestamp, correlationId }
- Use custom exceptions from apps/api/src/shared/exceptions/
- Never catch and swallow - always re-throw after logging
- Financial errors must include: amount, currency, calculation details

## MEMORY STORAGE (Execute AFTER completing task)
\`\`\`bash
# Store your output for next agent
npx claude-flow memory store "task-{TASK-ID}/output" '{
  "status": "complete|failed",
  "filesModified": ["path1", "path2"],
  "filesCreated": ["path3", "path4"],
  "testsCreated": ["test1.spec.ts"],
  "buildPassed": true|false,
  "testsPassed": true|false,
  "errors": []
}' -n "crechebooks/remediation"

# Store any schemas you created for future agents
npx claude-flow memory store "schemas/{schema-name}" '{...schema...}' -n "crechebooks/remediation"

# Update orchestrator progress
npx claude-flow memory store "orchestrator/progress" '{
  "currentTask": {N},
  "completed": [{list}],
  "lastAgent": "{TASK-ID}",
  "timestamp": "'$(date -Iseconds)'"
}' -n "crechebooks/remediation"
\`\`\`

## REPORT BACK
When complete, provide:
1. MEMORY KEYS STORED: List all keys you stored in memory
2. FILES MODIFIED: List with line counts
3. TESTS CREATED: List with test count
4. BUILD RESULT: Pass/Fail
5. TEST RESULT: Pass/Fail with coverage %
6. VERIFICATION COMMAND: Exact command to verify your work

## SUCCESS CRITERIA (ALL must be true)
- [ ] All files from definition_of_done created
- [ ] All signatures match exactly
- [ ] All constraints respected
- [ ] npm run build passes with 0 errors
- [ ] Tests pass with real data
- [ ] No TODO, placeholder, or mock code
- [ ] Memory stored for next agent
`)
```

---

## ORCHESTRATOR WORKFLOW

### For EACH task (1-28):

```
STEP 1: Pre-Flight Check
- Verify previous task completed: npx claude-flow memory get "task-{prev}/output" -n "crechebooks/remediation"
- Verify dependencies met (check output.status === "complete")
- If any dependency failed, STOP and report

STEP 2: Spawn Subagent (SYNCHRONOUS)
- Use Task() with full prompt from template above
- WAIT for agent to complete before proceeding
- DO NOT spawn next agent until current finishes

STEP 3: Verify Subagent Work (YOU MUST DO THIS)
a) Read files agent claims to have modified
b) Verify code matches task spec
c) Run: npm run build
d) Run: npm run test -- --testPathPattern="{pattern}"
e) Check memory was stored correctly

STEP 4: Handle Results
IF PASSED:
  - Update orchestrator progress memory
  - Proceed to next task

IF FAILED:
  - Store failure in memory: npx claude-flow memory store "orchestrator/errors" '{"task":"{id}","error":"..."}' -n "crechebooks/remediation"
  - DO NOT PROCEED to next task
  - Report exact failure with file:line:error
  - Request human intervention

STEP 5: Record Progress
npx claude-flow memory store "orchestrator/progress" '{
  "currentTask": {N+1},
  "completed": [...],
  "lastSuccess": "{TASK-ID}",
  "timestamp": "'$(date -Iseconds)'"
}' -n "crechebooks/remediation"
```

---

## AGENT TYPE SELECTION

| Task Type | Agent Type | Rationale |
|-----------|------------|-----------|
| Database/Entity | backend-dev | Schema expertise |
| Service Logic | backend-dev | NestJS patterns |
| API Endpoint | backend-dev | Controller/DTO |
| Frontend Hook | coder | React/Next.js |
| Frontend Component | coder | UI implementation |
| Test Writing | tester | Test coverage |
| Infrastructure | backend-dev | BullMQ/scheduling |
| Integration | backend-dev | External APIs |

---

## VERIFICATION COMMANDS

After EACH subagent, run these:

```bash
# Build check (MUST pass)
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
npm run build

# Type check
npm run typecheck

# Lint check
npm run lint

# Run specific tests
npm run test -- --testPathPattern="{task-test-pattern}" --verbose

# Check for TODO/mock in new files
grep -r "TODO\|MOCK\|placeholder\|NotImplemented" apps/api/src/{new-files}
```

---

## EXAMPLE: Task 1 (TASK-INFRA-011)

```
# ORCHESTRATOR: Spawn Agent 1

Task("backend-dev", `
## IDENTITY
You are Agent #1/28 in the CrecheBooks Remediation Pipeline.
Task: TASK-INFRA-011 - Centralized Scheduling Service with BullMQ
Priority: P0-BLOCKER

## WORKFLOW CONTEXT
- Previous Agent: None (you are first)
- Next Agent: #9 SARS-017, #10 BILL-016, #11 PAY-015 need your SchedulerModule
- Dependencies Met: TASK-CORE-001 (complete)

## MANDATORY RULES
1. NO MOCK DATA - Use real Redis connection
2. NO WORKAROUNDS - Throw if Redis unavailable
3. NO FALLBACKS - No in-memory queue fallback
4. FAIL FAST - Connection errors with full details
5. REAL TESTS - Test actual queue operations

## MEMORY RETRIEVAL
\`\`\`bash
npx claude-flow memory get "orchestrator/init" -n "crechebooks/remediation"
\`\`\`

## YOUR TASK
Read: /specs/tasks/TASK-INFRA-011.md

Create:
- apps/api/src/scheduler/scheduler.module.ts
- apps/api/src/scheduler/types/scheduler.types.ts
- apps/api/src/scheduler/processors/base.processor.ts
- apps/api/src/scheduler/__tests__/scheduler.module.spec.ts

Queues: INVOICE_GENERATION, PAYMENT_REMINDER, SARS_DEADLINE, BANK_SYNC

## MEMORY STORAGE (AFTER COMPLETING)
\`\`\`bash
npx claude-flow memory store "task-infra-011/output" '{
  "status": "complete",
  "filesCreated": [
    "apps/api/src/scheduler/scheduler.module.ts",
    "apps/api/src/scheduler/types/scheduler.types.ts",
    "apps/api/src/scheduler/processors/base.processor.ts"
  ],
  "testsCreated": ["apps/api/src/scheduler/__tests__/scheduler.module.spec.ts"],
  "exports": {
    "SchedulerModule": "apps/api/src/scheduler/scheduler.module.ts",
    "QUEUE_NAMES": "apps/api/src/scheduler/types/scheduler.types.ts",
    "BaseProcessor": "apps/api/src/scheduler/processors/base.processor.ts"
  }
}' -n "crechebooks/remediation"

npx claude-flow memory store "schemas/scheduler" '{
  "module": "SchedulerModule",
  "queues": ["INVOICE_GENERATION", "PAYMENT_REMINDER", "SARS_DEADLINE", "BANK_SYNC"],
  "baseProcessor": "BaseProcessor<T>",
  "imports": "@nestjs/bull, @nestjs/schedule"
}' -n "crechebooks/remediation"

npx claude-flow memory store "orchestrator/progress" '{
  "currentTask": 1,
  "completed": ["TASK-INFRA-011"],
  "lastAgent": "TASK-INFRA-011",
  "timestamp": "'$(date -Iseconds)'"
}' -n "crechebooks/remediation"
\`\`\`

## REPORT BACK FORMAT
MEMORY KEYS STORED: task-infra-011/output, schemas/scheduler, orchestrator/progress
FILES CREATED: [list with paths]
TESTS CREATED: [list]
BUILD RESULT: Pass/Fail
TEST RESULT: Pass/Fail (X tests)
VERIFICATION: npm run test -- --testPathPattern="scheduler" --verbose
`)

# ORCHESTRATOR: After agent completes, VERIFY:
1. Read apps/api/src/scheduler/scheduler.module.ts - check exports
2. Run: npm run build
3. Run: npm run test -- --testPathPattern="scheduler"
4. Verify memory stored: npx claude-flow memory get "task-infra-011/output" -n "crechebooks/remediation"
5. If ALL pass, proceed to Task 2
```

---

## FAILURE RECOVERY

If a subagent fails:

```
1. DO NOT PROCEED to next task
2. Store failure:
   npx claude-flow memory store "orchestrator/errors" '{
     "task": "{TASK-ID}",
     "error": "{exact error message}",
     "file": "{file:line}",
     "timestamp": "'$(date -Iseconds)'"
   }' -n "crechebooks/remediation"

3. Report to user:
   - Which task failed
   - Exact error message
   - File and line number
   - What was expected vs actual
   - Suggested fix

4. Wait for human resolution before continuing
```

---

## COMPLETION CHECKLIST

After ALL 28 tasks:

```bash
# Final verification
npm run build
npm run typecheck
npm run lint
npm run test

# Memory summary
npx claude-flow memory list -n "crechebooks/remediation"

# Check for any errors
npx claude-flow memory get "orchestrator/errors" -n "crechebooks/remediation"

# Generate completion report
npx claude-flow memory store "orchestrator/complete" '{
  "totalTasks": 28,
  "completed": 28,
  "failed": 0,
  "timestamp": "'$(date -Iseconds)'",
  "buildPassed": true,
  "testsPassed": true
}' -n "crechebooks/remediation"
```

---

## QUICK REFERENCE

```bash
# Memory commands
npx claude-flow memory store "<key>" '<json>' -n "crechebooks/remediation"
npx claude-flow memory get "<key>" -n "crechebooks/remediation"
npx claude-flow memory list -n "crechebooks/remediation"

# Verification
npm run build
npm run test -- --testPathPattern="{pattern}" --verbose

# Check progress
npx claude-flow memory get "orchestrator/progress" -n "crechebooks/remediation"

# Task spec location
/specs/tasks/TASK-{DOMAIN}-{NUM}.md
```

---

## REMEMBER

1. **SYNCHRONOUS ONLY** - One agent at a time
2. **VERIFY EVERYTHING** - Trust but verify subagent work
3. **FAIL FAST** - No workarounds, no fallbacks
4. **MEMORY HANDOFF** - Every agent stores what next needs
5. **REAL DATA** - No mocks, no placeholders
6. **BRUTAL HONESTY** - If broken, say broken

**The system must WORK after changes or FAIL FAST so it can be debugged.**

---

*Document Generated: 2025-12-24*
*Total Tasks: 28*
*Execution Mode: SYNCHRONOUS*
*Memory Namespace: crechebooks/remediation*
