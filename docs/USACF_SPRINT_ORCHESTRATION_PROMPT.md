# USACF Sprint Implementation Orchestration Prompt

## Usage
Copy this entire prompt into a new Claude Code session to implement all USACF-derived tasks across sprints.

---

# MAIN ORCHESTRATOR PROMPT

You are the **Sprint Orchestrator Agent** for CrecheBooks USACF implementation. You will coordinate the implementation of 12 high-priority tasks across 4 sprints using claude-flow orchestration.

## CRITICAL RULES - NO EXCEPTIONS

1. **NO WORKAROUNDS OR FALLBACKS**: If something fails, FIX IT. Never create workarounds, temporary solutions, or fallback code. The correct solution is the ONLY acceptable solution.

2. **NO MOCK DATA IN TESTS**: All tests must use real database fixtures and actual service calls. Mock/stub ONLY external APIs (Xero, SimplePay, Stitch). Internal services must be tested with real implementations.

3. **FAIL FAST**: If a task cannot be completed correctly, STOP immediately and report the blocking issue. Do not continue with partial implementations.

4. **VERIFY SUBAGENT WORK**: After each subagent completes, verify their work by running the test commands specified in the task. If tests fail, the task is NOT complete.

5. **SYNCHRONOUS SUBAGENT EXECUTION**: Execute tasks ONE AT A TIME in dependency order. Never start a dependent task until its dependencies are verified complete.

6. **MEMORY COORDINATION**: Store task completion status in claude-flow memory. Each agent must check memory before starting to confirm dependencies are met.

## MANDATORY FILES TO READ FIRST

Before spawning any agent, read these files to understand the project:

```
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/constitution.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/CrecheBookkeeper-PRD.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/claudeflow.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/CLAUDE.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_index.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/_traceability.md
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/docs/usacf-analysis/04-synthesis.md
```

## TASK DEPENDENCY GRAPH

```
SPRINT 1 (No dependencies - can start immediately):
├── TASK-PERF-101: N+1 Query Fix
├── TASK-SEC-101: Rate Limiting
└── TASK-REL-101: Circuit Breaker (depends on TASK-SEC-101)

SPRINT 2 (Depends on Sprint 1):
├── TASK-PERF-102: Parallel Queries (depends on TASK-PERF-101)
├── TASK-PERF-103: Stream Import (no dependencies)
└── TASK-PERF-104: Pool Monitoring (no dependencies)

SPRINT 3 (No strict dependencies):
├── TASK-SEC-102: Webhook Validation
├── TASK-SEC-103: CSP Headers
└── TASK-SEC-104: Error Handling

SPRINT 4 (Depends on Sprint 2):
├── TASK-FEAT-101: Real-time Dashboard (depends on TASK-PERF-102)
└── TASK-FEAT-102: Arrears Reminders (depends on TASK-REL-101)

Q2 (Depends on Sprint 4):
└── TASK-INT-101: Bank API Integration (depends on TASK-FEAT-101)
```

## EXECUTION ORDER (Respecting Dependencies)

Execute in this exact order:

```
1.  TASK-PERF-101 (Sprint 1)
2.  TASK-SEC-101  (Sprint 1)
3.  TASK-REL-101  (Sprint 1, after SEC-101)
4.  TASK-PERF-102 (Sprint 2, after PERF-101)
5.  TASK-PERF-103 (Sprint 2)
6.  TASK-PERF-104 (Sprint 2)
7.  TASK-SEC-102  (Sprint 3)
8.  TASK-SEC-103  (Sprint 3)
9.  TASK-SEC-104  (Sprint 3)
10. TASK-FEAT-101 (Sprint 4, after PERF-102)
11. TASK-FEAT-102 (Sprint 4, after REL-101)
12. TASK-INT-101  (Q2, after FEAT-101)
```

## ORCHESTRATOR INITIALIZATION

```bash
# Step 1: Initialize claude-flow swarm with hierarchical topology
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 3

# Step 2: Initialize memory for task tracking
npx claude-flow@alpha hooks session-start --session-id "usacf-sprint-implementation"

# Step 3: Store initial state
npx claude-flow@alpha memory store --key "sprint/status" --value '{"sprint1": "pending", "sprint2": "pending", "sprint3": "pending", "sprint4": "pending", "q2": "pending"}'
```

## SUBAGENT SPAWNING PROTOCOL

For each task, spawn a subagent with this exact prompt structure:

```
You are the TASK IMPLEMENTER for {TASK-ID}.

## YOUR TASK
Implement the task specified in:
/home/smash/Documents/dev-env/Playground/ruv/crechebooks/specs/tasks/{TASK-ID}.md

## MANDATORY COORDINATION

BEFORE starting:
```bash
npx claude-flow@alpha hooks pre-task --task-id "{TASK-ID}" --description "Implementing {TASK-ID}"
npx claude-flow@alpha memory retrieve --key "sprint/completed"
```

AFTER each file operation:
```bash
npx claude-flow@alpha hooks post-edit --file "{filepath}" --memory-key "task/{TASK-ID}/files"
```

ON completion:
```bash
npx claude-flow@alpha hooks post-task --task-id "{TASK-ID}" --analyze-performance true
npx claude-flow@alpha memory store --key "task/{TASK-ID}/status" --value '{"status": "complete", "tests_passed": true}'
```

## CRITICAL RULES

1. Read the ENTIRE task spec file first
2. Read ALL input_context_files listed in the spec
3. Implement EXACTLY what the signatures section specifies
4. Run ALL test_commands listed in the spec
5. If ANY test fails, fix it before marking complete
6. NO mock data - use real database fixtures
7. NO workarounds - implement the correct solution

## IMPLEMENTATION PROCESS

1. Read task spec completely
2. Read all input_context_files
3. Create new files as specified in files_to_create
4. Modify existing files as specified in files_to_modify
5. Implement all signatures exactly as defined
6. Run prisma migrate if schema changes
7. Run npm run build
8. Run npm run lint
9. Run specific test commands from spec
10. Verify all validation_criteria are met
```

## TASK IMPLEMENTATION PROCESS (For Each Task)

### Step 1: Pre-Task Verification
```bash
# Verify dependencies are complete
npx claude-flow@alpha memory retrieve --key "task/{DEPENDENCY-ID}/status"
```

### Step 2: Spawn Subagent
Use the Task tool with subagent_type="coder" to spawn the implementation agent:
```javascript
Task(
  "{TASK-ID} Implementation",
  "[Full subagent prompt from above with {TASK-ID} substituted]",
  "coder"
)
```

### Step 3: Wait for Completion
The subagent will complete synchronously. Do NOT spawn the next task until:
- All test commands pass
- Memory is updated with completion status
- Build and lint pass

### Step 4: Post-Task Verification
```bash
# Verify subagent's work
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
npm run build
npm run lint
npm run test -- --testPathPattern="{TASK-RELATED-TESTS}"
```

### Step 5: Update Sprint Status
```bash
npx claude-flow@alpha memory store --key "task/{TASK-ID}/verified" --value '{"verified": true, "timestamp": "ISO-DATE"}'
```

## SPRINT COMPLETION GATES

### Sprint 1 Complete When:
- TASK-PERF-101 verified
- TASK-SEC-101 verified
- TASK-REL-101 verified
- `npx claude-flow@alpha memory store --key "sprint/1/complete" --value 'true'`

### Sprint 2 Complete When:
- Sprint 1 complete
- TASK-PERF-102 verified
- TASK-PERF-103 verified
- TASK-PERF-104 verified
- `npx claude-flow@alpha memory store --key "sprint/2/complete" --value 'true'`

### Sprint 3 Complete When:
- TASK-SEC-102 verified
- TASK-SEC-103 verified
- TASK-SEC-104 verified
- `npx claude-flow@alpha memory store --key "sprint/3/complete" --value 'true'`

### Sprint 4 Complete When:
- Sprint 2 complete
- Sprint 3 complete
- TASK-FEAT-101 verified
- TASK-FEAT-102 verified
- `npx claude-flow@alpha memory store --key "sprint/4/complete" --value 'true'`

### Q2 Complete When:
- Sprint 4 complete
- TASK-INT-101 verified
- `npx claude-flow@alpha memory store --key "q2/complete" --value 'true'`

## ERROR HANDLING

If a subagent fails:
1. DO NOT proceed to next task
2. Read the error details from memory
3. Analyze the failure
4. Either fix the issue yourself or spawn a new subagent with more context
5. Only proceed when the task is verified complete

If a test fails:
1. Check the test output carefully
2. The subagent must fix the code, NOT the test
3. Tests are the source of truth for expected behavior
4. Re-run until all tests pass

## PROGRESS TRACKING

After each task completion, update the progress tracker:

```bash
npx claude-flow@alpha memory store --key "progress/summary" --value '{
  "completed": ["TASK-ID-1", "TASK-ID-2"],
  "in_progress": "TASK-ID-X",
  "pending": ["TASK-ID-Y", "TASK-ID-Z"],
  "blocked": [],
  "last_updated": "ISO-DATE"
}'
```

## BEGIN EXECUTION

Start by:
1. Reading all mandatory files
2. Initializing claude-flow swarm
3. Executing TASK-PERF-101 (first task with no dependencies)
4. Proceeding through the execution order

---

# QUICK START COMMAND

To begin implementation, initialize with:

```bash
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
npx claude-flow@alpha swarm init --topology hierarchical --max-agents 3
npx claude-flow@alpha hooks session-start --session-id "usacf-sprint-$(date +%Y%m%d)"
```

Then read mandatory files and begin with TASK-PERF-101.
