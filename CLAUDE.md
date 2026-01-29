# CrecheBooks - claude-flow v3 Project

## Project Identity

CrecheBooks is an AI-powered bookkeeping system for South African creches and pre-schools.

- **Monorepo**: pnpm workspace with `apps/api` (NestJS 11) and `apps/web` (Next.js 15)
- **Database**: PostgreSQL 16 via Prisma 7 ORM
- **Cache/Queue**: Redis 7
- **Node**: >= 20, pnpm >= 9
- **License**: Proprietary

## claude-flow v3

This project uses **claude-flow v3** (`npx claude-flow@alpha` resolves to `3.0.0-alpha`).

### v3 Features Enabled
- **SONA Learning**: Adaptive learning profiles (default: `balanced`)
- **Flash Attention**: 2.5x target acceleration
- **GNN-Enhanced Search**: HNSW-indexed vector search (384 dimensions)
- **sql.js Backend**: Memory storage via sql.js

### Configuration Files
| File | Purpose |
|------|---------|
| `.claude-flow/config.yaml` | v3 runtime config (SONA, workers, domain settings) |
| `.claude/config.json` | Project metadata, feature flags, agent categories |
| `.claude/settings.json` | Permissions, hooks, env vars, MCP servers |
| `.mcp.json` | MCP server definitions (claude-flow@alpha, ruv-swarm, flow-nexus) |
| `.claude-flow/daemon-state.json` | Daemon worker state (reset on setup) |

### MCP Server
The primary MCP server key is `claude-flow@alpha` (matches `.mcp.json`). The `enabledMcpjsonServers` in settings.json uses this exact key.

### Daemon Workers
| Worker | Status | Notes |
|--------|--------|-------|
| `map` | Enabled | Codebase mapping (12/12 success historically) |
| `consolidate` | Enabled | Memory consolidation (6/6 success) |
| `audit` | Disabled | 1/12 success rate -- investigate before re-enabling |
| `optimize` | Disabled | 0/8 success rate -- investigate before re-enabling |
| `testgaps` | Disabled | 0/6 success rate -- investigate before re-enabling |
| `predict` | Disabled | Not yet configured |
| `document` | Disabled | Not yet configured |

## CrecheBooks Domain Rules

- **Currency**: South African Rand (ZAR)
- **Amounts**: Always stored as integers in cents. Use `Decimal.js` for calculations, convert to cents for storage.
- **Tax Authority**: SARS (South African Revenue Service)
- **Tenant Isolation**: All queries MUST be scoped to `tenantId`. Never expose data across tenants.
- **Audit Logging**: All financial mutations must be audit-logged with userId, timestamp, and before/after values.
- **Date Format**: ISO 8601. Tax year runs March to February.

## Development Workflow

### Quick Start
```bash
./scripts/dev-start.sh        # Full setup: Docker infra + install + migrate + dev servers
```

### Individual Commands
```bash
pnpm dev:infra                # Start PostgreSQL + Redis (Docker)
pnpm dev:infra:down           # Stop infrastructure
pnpm dev:infra:reset          # Wipe data and restart infrastructure
pnpm dev                      # Start API (:3000) + Web (:3001)
pnpm dev:api                  # Start API only
pnpm dev:web                  # Start Web only
```

### Build & Test
```bash
pnpm build                    # Build all packages
pnpm test                     # Run all tests
pnpm test:api                 # API tests only
pnpm test:web                 # Web tests only
pnpm test:e2e                 # End-to-end tests
pnpm test:cov                 # Coverage report
pnpm lint                     # Lint all packages
```

### Prisma
```bash
pnpm prisma:generate          # Generate Prisma client
pnpm prisma:migrate           # Run migrations
pnpm prisma:push              # Push schema (dev only)
pnpm prisma:studio            # Open Prisma Studio
```

### Docker (Production)
```bash
pnpm docker:build             # Build all containers
pnpm docker:up                # Start production stack
pnpm docker:down              # Stop production stack
```

## Agent Coordination (claude-flow v3 Hooks)

### Protocol for Spawned Agents

**Before work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[task]"
```

**After file edits:**
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "agent/[step]"
```

**After completion:**
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
```

### Batch Execution Rule
All related operations MUST be batched in a single message. Never send sequential messages for parallel-safe work.

## Available Agents (107 files, 28 categories)

Agents are defined in `.claude/agents/` and organized by category. Sourced from [claude-flow](https://github.com/ruvnet/claude-flow/tree/main/.claude/agents) (excluding flow-nexus), plus CrecheBooks domain agents.

### Domain (CrecheBooks-specific)
- `domain/orchestrator` -- Multi-agent task orchestration for bookkeeping workflows
- `domain/transaction-categorizer` -- Categorize financial transactions
- `domain/payment-matcher` -- Match payments to invoices
- `domain/sars-agent` -- SARS PAYE tax calculations

### Core Development
- `core/coder`, `core/planner`, `core/researcher`, `core/reviewer`, `core/tester`

### Analysis
- `analysis/code-analyzer`, `analysis/analyze-code-quality`, `analysis/code-review/analyze-code-quality`

### Architecture
- `architecture/system-design/arch-system-design`

### Backend & Development
- `backend/dev-backend-api`, `development/backend/dev-backend-api`

### Consensus & Distributed
- `consensus/byzantine-coordinator`, `consensus/crdt-synchronizer`, `consensus/gossip-coordinator`, `consensus/performance-benchmarker`, `consensus/quorum-manager`, `consensus/raft-manager`, `consensus/security-manager`

### Data & ML
- `data/ml/data-ml-model`

### DevOps
- `devops/ci-cd/ops-cicd-github`

### Documentation
- `documentation/api-docs/docs-api-openapi`

### GitHub
- `github/code-review-swarm`, `github/github-modes`, `github/issue-tracker`, `github/multi-repo-swarm`, `github/pr-manager`, `github/project-board-sync`, `github/release-manager`, `github/release-swarm`, `github/repo-architect`, `github/swarm-issue`, `github/swarm-pr`, `github/sync-coordinator`, `github/workflow-automation`

### Goal & Reasoning
- `goal/agent`, `goal/code-goal-planner`, `goal/goal-planner`
- `reasoning/agent`, `reasoning/goal-planner`

### Hive-Mind
- `hive-mind/collective-intelligence-coordinator`, `hive-mind/queen-coordinator`, `hive-mind/scout-explorer`, `hive-mind/swarm-memory-manager`, `hive-mind/worker-specialist`

### Neural & SONA
- `neural/safla-neural`
- `sona/sona-learning-optimizer`

### Optimization
- `optimization/benchmark-suite`, `optimization/load-balancer`, `optimization/performance-monitor`, `optimization/resource-allocator`, `optimization/topology-optimizer`

### Payments
- `payments/agentic-payments`

### SPARC Methodology
- `sparc/specification`, `sparc/pseudocode`, `sparc/architecture`, `sparc/refinement`

### Specialized
- `specialized/mobile/spec-mobile-react-native`

### Sublinear
- `sublinear/consensus-coordinator`, `sublinear/matrix-optimizer`, `sublinear/pagerank-analyzer`, `sublinear/performance-optimizer`, `sublinear/trading-predictor`

### Swarm Coordination
- `swarm/adaptive-coordinator`, `swarm/hierarchical-coordinator`, `swarm/mesh-coordinator`

### Templates
- `templates/automation-smart-agent`, `templates/coordinator-swarm-init`, `templates/github-pr-manager`, `templates/implementer-sparc-coder`, `templates/memory-coordinator`, `templates/migration-plan`, `templates/orchestrator-task`, `templates/performance-analyzer`, `templates/sparc-coordinator`

### Testing & Validation
- `testing/tdd-london-swarm`, `testing/production-validator`, `testing/unit/tdd-london-swarm`, `testing/validation/production-validator`

### v3 Specialists
- `v3/v3-integration-architect`, `v3/v3-memory-specialist`, `v3/v3-performance-engineer`, `v3/v3-queen-coordinator`, `v3/v3-security-architect`

### YAML Specialists (root + v3/)
- `database-specialist.yaml`, `project-coordinator.yaml`, `python-specialist.yaml`, `security-auditor.yaml`, `typescript-specialist.yaml`
- `v3/database-specialist.yaml`, `v3/project-coordinator.yaml`, `v3/python-specialist.yaml`, `v3/test-architect.yaml`, `v3/typescript-specialist.yaml`

## File Organization

```
crechebooks/
  apps/
    api/                      # NestJS 11 API
      src/
        modules/              # Feature modules (auth, tenants, invoices, etc.)
        common/               # Shared utilities, guards, decorators
      prisma/                 # Schema and migrations
      test/                   # E2E tests
    web/                      # Next.js 15 frontend
      src/
        app/                  # App router pages
        components/           # React components
        lib/                  # Client utilities
  scripts/                    # Dev and deployment scripts
  .claude/
    agents/                   # 107 agent definitions across 28 categories
    config.json               # v3 master config
    settings.json             # Permissions, hooks, env
  .claude-flow/
    config.yaml               # v3 runtime config
    daemon-state.json          # Worker state
    memory/                   # Persistent memory store
    neural/                   # Neural model data
    metrics/                  # Performance metrics
```

**Rules:**
- Source code lives in `apps/` subdirectories
- Tests are colocated with source (`.spec.ts` next to `.ts`) or in `test/` for E2E
- Scripts go in `scripts/`
- Never save working files, text, markdown, or tests to the project root

## Tech Stack Reference

### API (`apps/api`)
NestJS 11, Prisma 7, PostgreSQL 16, Redis 7 (via BullMQ), Passport (JWT + API key), class-validator, class-transformer, Decimal.js, pdfkit, exceljs, mailgun.js

### Web (`apps/web`)
Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, next-auth

## CLI Tool (@crechebooks/cli)

The CLI provides terminal-based access to CrecheBooks operations.

### Installation
```bash
pnpm cli:build                # Build the CLI package
pnpm cli:link                 # Link globally for 'cb' command
```

### Authentication
```bash
cb auth login                 # Authenticate with API key or OAuth
cb auth status                # Show current authentication state
cb auth logout                # Clear stored credentials
```

### Invoice Commands
```bash
# List invoices
cb invoices list                           # All invoices
cb invoices list --status DRAFT            # Filter by status
cb invoices list --from 2025-01-01 --to 2025-01-31
cb invoices list --format json             # JSON output

# Generate invoices
cb invoices generate --month 2025-01       # Generate for all enrolled children
cb invoices generate --month 2025-01 --dry-run  # Preview without creating

# Send invoices
cb invoices send                           # Send all unsent DRAFT invoices
cb invoices send --ids INV-001,INV-002     # Send specific invoices
cb invoices send --channel whatsapp        # Send via WhatsApp
cb invoices send --channel both            # Send via email and WhatsApp

# Download invoices
cb invoices download INV-001               # Download single PDF
cb invoices download --month 2025-01       # Download all for month as ZIP
```

### Payment Commands
```bash
# List payments
cb payments list                           # All payments
cb payments list --unallocated             # Unallocated only
cb payments list --from 2025-01-01         # Filter by date
cb payments list --format csv > payments.csv

# AI payment matching
cb payments match                          # Run AI matcher
cb payments match --dry-run                # Preview matches
cb payments match --min-confidence 0.9     # Set confidence threshold

# Manual allocation
cb payments allocate --payment TX-001 --invoice INV-001
cb payments allocate --payment TX-001 --invoice INV-001 --amount 150000
```

### Output Formats
```bash
--format table                # Default tabular output
--format json                 # JSON output for scripting
--format csv                  # CSV output for spreadsheets
```

All amounts are displayed in ZAR and stored internally as cents.

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Never save working files, text/mds and tests to the root folder.
