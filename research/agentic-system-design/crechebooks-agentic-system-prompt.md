# CrecheBooks Agentic System — Master Prompt

> Feed this prompt to Claude Code to build the two-layer agentic system for CrecheBooks.

---

## Context

You are building a **two-layer agentic system** for CrecheBooks, an AI-powered bookkeeping platform for South African creches (NestJS 11 + Next.js 15 monorepo, PostgreSQL 16, Redis 7).

### Layer 1: The Builder System
An agentic system that **builds and maintains** CrecheBooks — writing features, fixing bugs, running tests, deploying, and evolving the codebase autonomously.

### Layer 2: The Operator System
An agentic system that **operates** CrecheBooks — generating invoices, matching payments, running reconciliation, filing SARS returns, communicating with parents, and managing the day-to-day bookkeeping workflow.

Both layers share the same `.claude/` infrastructure but serve fundamentally different purposes: one writes code, the other runs the business.

---

## Architecture: The 4-Layer Composable Stack

Follow the **IndyDevDan 4-Layer Architecture** adapted for CrecheBooks:

```
Layer 4: Justfile (Entry Points)
  │  Human-callable, CI/CD-callable, agent-callable one-liners
  │  Examples: `just build-feature "add late payment fees"`, `just monthly-close 2026-02`
  │
Layer 3: Commands (Orchestration)      → .claude/commands/
  │  Discover work, spawn parallel agents, aggregate results
  │  Examples: /build-feature, /monthly-close, /deploy-staging, /fix-issue
  │
Layer 2: Subagents (Scale)             → .claude/agents/
  │  Isolated workers with separate context windows
  │  Examples: builder, validator, reviewer, deployer
  │
Layer 1: Skills (Capability)           → .claude/skills/*/SKILL.md
  │  Auto-discovered domain capabilities
  │  Examples: invoices, payments, reconciliation, sars
```

**Key principle:** Enter at any layer. Test a skill directly, spawn a single subagent, run a full orchestration command, or fire a one-liner from the justfile.

---

## What to Build

### Phase 1: Foundation — Self-Validating Agent Infrastructure

**Goal:** Establish the Builder + Validator team pattern with deterministic validation hooks.

#### 1.1 Hook System (`.claude/hooks/`)

Implement the full hook lifecycle using **UV single-file Python scripts**:

```
.claude/hooks/
  send_event.py              # Universal event sender (HTTP POST to observability server)
  pre_tool_use.py            # Security: block dangerous commands, enforce path access
  post_tool_use.py           # Validation: lint, type-check, test after file operations
  stop.py                    # Force continuation if validation fails
  subagent_start.py          # Log subagent spawns, assign colors for observability
  subagent_stop.py           # Validate subagent output, collect metrics
  session_start.py           # Load project context, restore state
  session_end.py             # Export metrics, generate session summary
  user_prompt_submit.py      # Prompt validation, injection prevention
  notification.py            # Route notifications (terminal, webhook, TTS)
  pre_compact.py             # Backup transcript before context compaction
  permission_request.py      # Audit permission requests
```

**Exit code protocol:**
- `0` = allow
- `2` = block (stderr shown to Claude as error)
- JSON stdout = ask user for confirmation

**Damage control patterns** (`.claude/hooks/patterns.yaml`):
```yaml
zeroAccessPaths:
  - "~/.ssh/"
  - "~/.aws/"
  - ".env"
  - ".env.local"
  - "*.pem"

readOnlyPaths:
  - "/etc/"
  - "~/.bashrc"
  - "prisma/migrations/"    # Never modify committed migrations

noDeletePaths:
  - ".claude/hooks/"
  - ".claude/skills/"
  - "apps/api/prisma/schema.prisma"

bashToolPatterns:
  - pattern: "rm -rf"
    action: block
  - pattern: "DROP TABLE"
    action: block
  - pattern: "DELETE FROM.*WHERE"
    action: ask
  - pattern: "prisma migrate reset"
    action: ask
  - pattern: "git push.*--force"
    action: block
  - pattern: "git reset --hard"
    action: ask
```

#### 1.2 Builder + Validator Agent Team

**Builder Agent** (`.claude/agents/team/builder.md`):
- Executes one implementation task at a time
- Has Write, Edit, Bash tools
- PostToolUse hooks auto-validate after every file operation
- Follows TDD London School (mock-first)
- All code must pass lint + type-check before task completion

**Validator Agent** (`.claude/agents/team/validator.md`):
- **Read-only** — no file modifications
- Reviews builder output for correctness, security, domain rules
- Checks: tenant isolation, amount-in-cents, audit logging, no hardcoded secrets
- Returns structured verdict: PASS/FAIL with specific findings

**Self-correction loop:**
1. Builder writes code
2. PostToolUse hook runs `pnpm lint` + `pnpm tsc --noEmit` → catches syntax/type errors automatically
3. Validator agent reviews for domain correctness
4. If FAIL → Builder receives findings → auto-corrects → Validator re-reviews
5. Loop until PASS or max 3 iterations

#### 1.3 Observability Pipeline

Build a real-time monitoring system for all agent activity:

```
Claude Agents → Hook Scripts → HTTP POST → Bun Server → SQLite → WebSocket → Vue Dashboard
```

**Server** (`tools/agent-observatory/server/`):
- Bun + TypeScript
- SQLite with WAL mode for concurrent writes
- REST endpoints for event ingestion
- WebSocket broadcast for real-time clients
- Event schema: `{ id, timestamp, sessionId, agentId, eventType, toolName, data }`

**Dashboard** (`tools/agent-observatory/client/`):
- Vue 3 + Tailwind
- Real-time event stream with WebSocket
- Filter by: session, agent, event type, time range
- Visual indicators: tool emojis, agent color coding, success/failure states
- Pulse chart showing agent activity over time
- Chat transcript viewer for debugging agent decisions

**Event types to track:**
- PreToolUse / PostToolUse / PostToolUseFailure
- SubagentStart / SubagentStop
- SessionStart / SessionEnd
- Notification / PermissionRequest
- Custom: TaskAssigned, ValidationResult, DeploymentStatus

---

### Phase 2: Builder System — Commands That Build CrecheBooks

**Goal:** Create orchestration commands that automate CrecheBooks development workflows.

#### 2.1 Development Commands (`.claude/commands/`)

**`/build-feature <description>`**
1. Analyze the feature request against existing codebase
2. Generate a specification (what, not how)
3. Spawn parallel subagents:
   - **Architect** → designs API endpoints, DB schema changes, module structure
   - **Builder** → implements the feature (API + Web)
   - **Tester** → writes tests (unit + integration + e2e)
4. Validator reviews all output
5. Run full test suite
6. Create PR with structured description

**`/fix-issue <github-issue-number>`**
1. Fetch issue details from GitHub
2. Reproduce the bug (read logs, query DB, test endpoint)
3. Identify root cause
4. Implement fix with regression test
5. Validate fix doesn't break existing tests
6. Create PR referencing the issue

**`/deploy-staging`**
1. Run full test suite
2. Check for uncommitted changes
3. Push to staging branch
4. Monitor Railway deployment
5. Run smoke tests against staging API
6. Report deployment status

**`/monthly-close <YYYY-MM>`**
1. Generate invoices for all enrolled children
2. Run AI payment matching
3. Execute bank reconciliation
4. Generate arrears report
5. Prepare EMP201 (PAYE/UIF/SDL)
6. Generate financial summary
7. Present results for human review

**`/code-review <pr-number>`**
1. Fetch PR diff
2. Spawn reviewer agent (read-only)
3. Check: security, performance, domain rules, test coverage
4. Post structured review comment on PR

**`/onboard-feature-domain <domain-name>`**
1. Scaffold NestJS module (controller, service, dto, entity)
2. Generate Prisma schema additions
3. Create SKILL.md for the new domain
4. Wire up to existing auth/tenant guards
5. Generate basic CRUD tests
6. Update API guide

#### 2.2 Justfile (Top-Level Entry Points)

```makefile
# Development
build-feature desc:
    claude --print "/build-feature {{desc}}"

fix-issue issue:
    claude --print "/fix-issue {{issue}}"

deploy-staging:
    claude --print "/deploy-staging"

# Operations
monthly-close month:
    claude --print "/monthly-close {{month}}"

generate-invoices month:
    claude --print "/invoices generate --month {{month}}"

match-payments:
    claude --print "/payments match"

# Quality
review-pr pr:
    claude --print "/code-review {{pr}}"

full-test:
    pnpm test && pnpm test:e2e && pnpm lint
```

---

### Phase 3: Operator System — Agents That Run CrecheBooks

**Goal:** Build domain-specific agents that autonomously operate the bookkeeping workflows.

#### 3.1 Enhance Existing Skills

CrecheBooks already has 16 skills. Upgrade them with:

- **Self-validation hooks** — e.g., after generating invoices, validate total matches sum of line items
- **Deterministic validators** — Python scripts that check domain invariants:
  - All amounts are integers (cents)
  - Tenant isolation is maintained
  - Audit log entries exist for mutations
  - Bank reconciliation balances
- **Structured output templates** — Every skill reports results in a consistent format

#### 3.2 Operator Orchestration Commands

**`/daily-operations`**
1. Sync bank transactions from linked accounts
2. Run AI categorization on uncategorized transactions
3. Run payment matching for unallocated funds
4. Check for overdue invoices → trigger parent notifications
5. Generate daily summary report

**`/billing-cycle <YYYY-MM>`**
1. Verify fee structures are current
2. Generate invoices for all active enrollments
3. Send invoices via configured channels (email/WhatsApp)
4. Schedule payment reminders for 7 and 14 days
5. Report: total invoiced, channels used, delivery failures

**`/tax-compliance <period>`**
1. Calculate PAYE, UIF, SDL for the period
2. Generate EMP201 return
3. If Feb → generate EMP501 annual reconciliation + IRP5s
4. Check VAT threshold and generate VAT201 if applicable
5. Flag upcoming SARS deadlines

**`/parent-comms <template> <recipients>`**
1. Resolve recipient group (all parents, arrears, specific class)
2. Preview message with personalized fields
3. Send via configured channel
4. Track delivery status
5. Log communication for audit

#### 3.3 Drop Zone Automation

Implement **agentic drop zones** for file-triggered workflows:

```yaml
# .claude/drop-zones/drops.yaml
zones:
  - name: bank-statements
    file_patterns: ["*.csv", "*.ofx", "*.mt940"]
    zone_dirs: ["inbox/bank-statements/"]
    events: [created]
    prompt: .claude/drop-zones/prompts/import-bank-statement.md
    description: "Auto-import bank statements when dropped into inbox"

  - name: parent-documents
    file_patterns: ["*.pdf", "*.jpg", "*.png"]
    zone_dirs: ["inbox/parent-docs/"]
    events: [created]
    prompt: .claude/drop-zones/prompts/process-parent-document.md
    description: "OCR and file parent documents (ID, proof of address, etc.)"

  - name: sars-notices
    file_patterns: ["*.pdf"]
    zone_dirs: ["inbox/sars/"]
    events: [created]
    prompt: .claude/drop-zones/prompts/process-sars-notice.md
    description: "Parse SARS notices and flag required actions"
```

---

### Phase 4: Trust Progression — From Supervised to Autonomous

Follow the **three modes of determinism** pattern:

#### Mode 1: Deterministic (Hooks Only)
- Hooks run scripts, no LLM involved
- Used for: linting, type checking, test execution, deployment scripts
- CI/CD pipeline integration

#### Mode 2: Agentic Supervised
- Agent executes but human reviews before critical actions
- Used for: invoice generation (review before send), payment matching (confirm matches), deployments
- `action: ask` in patterns.yaml for mutations

#### Mode 3: Interactive Adaptive
- Agent operates autonomously, asks only when uncertain
- Used for: daily operations, bank statement categorization, routine communications
- Build toward this as trust increases over time

**Trust escalation path:**
1. Start with all mutations requiring confirmation (`ask` mode)
2. Track success rate per operation type
3. Graduate operations to autonomous when >95% accuracy over 30 days
4. Keep irreversible operations (SARS submissions, production deploys) in supervised mode permanently

---

### Phase 5: Multi-Agent Orchestration

#### 5.1 The Lead Agent Pattern

Create a **Lead Agent** (orchestrator) that manages all other agents:

```
Lead Agent (Orchestrator)
  ├── Builder Team
  │   ├── Architect Agent
  │   ├── Coder Agent (x2-3 parallel)
  │   ├── Tester Agent
  │   └── Validator Agent
  ├── Operator Team
  │   ├── Billing Agent
  │   ├── Reconciliation Agent
  │   ├── Tax Agent
  │   └── Communications Agent
  └── Support Team
      ├── Reviewer Agent
      ├── Deployer Agent
      └── Monitor Agent
```

**The Lead Agent:**
- Receives high-level objectives ("prepare for month-end close")
- Decomposes into tasks and assigns to appropriate team
- Monitors progress via observability pipeline
- Handles failures (reassign, retry, escalate to human)
- Maintains context via shared memory

#### 5.2 Agent Communication Protocol

**Shared memory** (`.claude-flow/memory/`):
```
memory/
  agents/
    builder/current-task.json
    validator/last-review.json
    billing/monthly-status.json
  shared/
    project-state.json
    deployment-status.json
    active-issues.json
```

**Event-driven coordination:**
- Agents publish events via hooks
- Observability server routes events
- Dependent agents react to upstream completions
- Deadlock detection via timeout + escalation

---

## Existing Infrastructure (Already Built)

CrecheBooks already has significant agentic infrastructure. **Build on it, don't replace it:**

### Skills (16 operational)
`banking`, `children`, `communications`, `dashboard`, `fee-structures`, `invoices`, `monthly-close`, `parents`, `payments`, `reconciliation`, `reports`, `sars`, `staff`, `tenant`, `transactions`, `_api-guide`

### Agents (26 defined)
Core (5), Analysis (3), SPARC (4), v3 (5), GitHub (4), Domain (4 — orchestrator, payment-matcher, transaction-categorizer, sars-agent)

### Helpers
- `cb-api.sh` — API calls with auth headers
- `cb-db.sh` — Direct DB queries with tenant scoping

### Configuration
- `.claude/settings.json` — Permissions, hooks, env vars
- `.claude-flow/config.yaml` — Runtime config
- `.mcp.json` — MCP server definitions

---

## Implementation Principles

1. **Focused Agent + Specialized Validation = Trusted Automation** — Every agent does one thing. Every output is validated deterministically.

2. **Prompts are the fundamental unit of programming** — Treat `.md` files in `.claude/commands/` and `.claude/skills/` with the same rigor as source code. Version them, test them, review them.

3. **Progressive disclosure** — Don't load everything at once. Skills auto-discover on demand. Commands load when invoked. Subagents get fresh contexts.

4. **The self-correction loop** — Builder writes → Hook validates → Failure feeds back → Builder corrects → Hook re-validates. The agent never needs to be told it failed.

5. **Enter at any layer** — Every component is independently testable: run a skill directly, test a hook in isolation, invoke a command standalone, fire from the justfile.

6. **What > How** — Commands and prompts specify objectives, constraints, and acceptance criteria. Agents choose implementation details.

7. **Trust through verification** — Start supervised, graduate to autonomous based on tracked success rates. Never trust blindly.

8. **Batch everything** — Multiple related operations in a single message. Parallel execution is mandatory, not optional.

---

## Deliverables Checklist

### Phase 1: Foundation
- [ ] Hook system (12 UV single-file Python scripts)
- [ ] Damage control patterns.yaml
- [ ] Builder + Validator agent definitions
- [ ] Self-correction loop wiring
- [ ] Observability server (Bun + SQLite)
- [ ] Observability dashboard (Vue 3)

### Phase 2: Builder System
- [ ] `/build-feature` command
- [ ] `/fix-issue` command
- [ ] `/deploy-staging` command
- [ ] `/code-review` command
- [ ] `/onboard-feature-domain` command
- [ ] Justfile with all entry points

### Phase 3: Operator System
- [ ] Enhanced skills with self-validation
- [ ] Domain-specific validators
- [ ] `/daily-operations` command
- [ ] `/billing-cycle` command
- [ ] `/tax-compliance` command
- [ ] `/parent-comms` command
- [ ] Drop zone automation (bank statements, documents, SARS notices)

### Phase 4: Trust Progression
- [ ] Three-mode operation (deterministic, supervised, adaptive)
- [ ] Success rate tracking per operation type
- [ ] Trust escalation configuration
- [ ] Permanent supervision list for irreversible operations

### Phase 5: Multi-Agent Orchestration
- [ ] Lead Agent definition
- [ ] Team topology (Builder, Operator, Support)
- [ ] Shared memory protocol
- [ ] Event-driven coordination
- [ ] Deadlock detection and escalation

---

## Constraints

- All files under 500 lines
- No hardcoded secrets — use env vars
- Input validation at all boundaries
- Typed interfaces for all public APIs
- Tests colocated with source (`.spec.ts`)
- Domain amounts always in cents (integer)
- All queries scoped to tenantId
- All mutations audit-logged
- Working files go in `tools/` or `research/`, never project root
