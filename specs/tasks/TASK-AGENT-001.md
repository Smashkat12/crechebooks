<task_spec id="TASK-AGENT-001" version="4.0">

<metadata>
  <title>Claude Code Configuration and Context Setup</title>
  <status>completed</status>
  <layer>agent</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>NFR-SEC-001</requirement_ref>
    <requirement_ref>NFR-PERF-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-001</task_ref>
    <task_ref status="COMPLETE">All Logic Layer Tasks (37 complete)</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-015 (LLMWhisperer PDF Extraction)</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<current_state>
## WHAT ALREADY EXISTS (Implemented 2025-12-21)

**Context Files (Created):**
- `.claude/context/chart_of_accounts.json` - SA IFRS chart of accounts
- `.claude/context/payee_patterns.json` - Regex patterns for categorization
- `.claude/context/fee_structures.json` - Creche fee templates
- `.claude/context/sars_tables_2025.json` - SARS 2025 tax tables (ALL VALUES IN CENTS)
- `.claude/context/tenant_config.json` - Default tenant configuration

**Agent Skill Directories (Created):**
- `.claude/agents/orchestrator/` - Orchestrator skill docs
- `.claude/agents/transaction-categorizer/` - Categorizer skill docs
- `.claude/agents/payment-matcher/` - Payment matcher skill docs
- `.claude/agents/sars-agent/` - SARS agent skill docs

**Log Directories:**
- `.claude/logs/` - Needs verification for decisions.jsonl and escalations.jsonl

## WHAT NEEDS FIXING

**CRITICAL: Test Setup Missing**
The `.env.test` file is MISSING, causing 56 agent test failures with "DATABASE_URL not set".

**Action Required:**
1. Create `.env.test` from `.env.example`:
   ```bash
   cp .env.example .env.test
   # Then update DATABASE_URL to point to test database:
   # DATABASE_URL=postgresql://user:password@localhost:5432/crechebooks_test?schema=public
   ```

2. Verify `.claude/logs/` directory is writable
3. Run tests to confirm: `npm run test -- --testPathPatterns="agents"`
</current_state>

<context>
This task establishes the Claude Code agent infrastructure for CrecheBooks. Most implementation is complete - this task is primarily about verification and fixing the test setup.

**CRITICAL PROJECT RULES (from specs/constitution.md):**
- ALL monetary values are CENTS (integers) - NEVER rands as floats
- Prisma is the ONLY database access layer
- Decimal.js with banker's rounding (ROUND_HALF_EVEN) for calculations
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries

**RECENTLY COMPLETED (affects agent context):**
- TASK-TRANS-015: LLMWhisperer PDF Extraction
  - Cloud OCR fallback for low-confidence PDF parsing
  - Hybrid parser with confidence-based routing (local first, LLMWhisperer fallback)
  - 62 parser tests passing
</context>

<project_structure>
VERIFIED current structure (2024-12-21):

```
.claude/
├── settings.json           # EXISTS - hooks + MCP servers configured
├── settings.local.json     # EXISTS - local overrides
├── context/                # EXISTS - ALL 5 FILES PRESENT
│   ├── chart_of_accounts.json   (3.6KB - SA IFRS accounts)
│   ├── payee_patterns.json      (6.6KB - categorization patterns)
│   ├── fee_structures.json      (3.2KB - fee templates)
│   ├── sars_tables_2025.json    (3.3KB - tax tables in CENTS)
│   └── tenant_config.json       (2.3KB - default config)
├── logs/                   # EXISTS - verify writability
├── agents/                 # EXISTS - 4 subdirectories
│   ├── orchestrator/
│   ├── transaction-categorizer/
│   ├── payment-matcher/
│   └── sars-agent/
├── commands/               # EXISTS - claude-flow commands
└── helpers/                # EXISTS

src/agents/                 # EXISTS - ALL AGENT CODE IMPLEMENTED
├── transaction-categorizer/
│   ├── categorizer.agent.ts
│   ├── categorizer.module.ts
│   ├── context-loader.ts
│   ├── pattern-matcher.ts
│   ├── confidence-scorer.ts
│   ├── decision-logger.ts
│   └── interfaces/
├── payment-matcher/
│   ├── matcher.agent.ts
│   ├── matcher.module.ts
│   ├── decision-logger.ts
│   └── interfaces/
├── sars-agent/
│   ├── sars.agent.ts
│   ├── sars.module.ts
│   ├── decision-logger.ts
│   ├── context-validator.ts
│   └── interfaces/
└── orchestrator/
    ├── orchestrator.agent.ts
    ├── orchestrator.module.ts
    ├── workflow-router.ts
    ├── escalation-manager.ts
    └── interfaces/

tests/agents/               # EXISTS - ALL TEST FILES PRESENT
├── transaction-categorizer/categorizer.agent.spec.ts
├── payment-matcher/matcher.agent.spec.ts
├── sars-agent/sars.agent.spec.ts
└── orchestrator/orchestrator.agent.spec.ts
```
</project_structure>

<existing_services>
These services exist and agents USE them:

**PDF Parsing (TASK-TRANS-015 - Just Completed):**
- HybridPdfParser - Confidence-based routing (local first, cloud fallback)
- LLMWhispererParser - Cloud OCR API for scanned PDFs
- PdfParser - Local pdfjs-dist parsing
- Confidence threshold: 70% (below = LLMWhisperer fallback)

**Transaction Services:**
- CategorizationService - AI-powered categorization
- PatternLearningService - Learn from corrections
- TransactionImportService - Import CSV/PDF
- XeroSyncService - Xero API sync

**Billing Services:**
- EnrollmentService, InvoiceGenerationService, InvoiceDeliveryService, ProRataService

**Payment Services:**
- PaymentMatchingService, PaymentAllocationService, ArrearsService, ReminderService

**SARS Services (ALL IN CENTS):**
- VatService (15% rate)
- PayeService (2025 tax brackets)
- UifService (1% capped at R177.12)
- Emp201Service, Vat201Service
</existing_services>

<implementation_actions>
## REQUIRED ACTIONS

### Step 1: Create .env.test
```bash
# Copy from example
cp .env.example .env.test

# Edit .env.test and set:
DATABASE_URL=postgresql://user:password@localhost:5432/crechebooks_test?schema=public
NODE_ENV=test
```

### Step 2: Ensure test database exists
```bash
# Create test database if not exists
createdb crechebooks_test

# Run migrations against test DB
DATABASE_URL=postgresql://user:password@localhost:5432/crechebooks_test?schema=public npx prisma migrate deploy
```

### Step 3: Verify log directory
```bash
mkdir -p .claude/logs
touch .claude/logs/.gitkeep
# Verify in .gitignore: .claude/logs/*.jsonl
```

### Step 4: Run agent tests
```bash
npm run test -- --testPathPatterns="agents" --verbose
```

### Step 5: Verify context files load
```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/context/chart_of_accounts.json')))"
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/context/payee_patterns.json')))"
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/context/sars_tables_2025.json')))"
```
</implementation_actions>

<validation_criteria>
- `.env.test` exists with valid DATABASE_URL
- Test database exists and has schema applied
- All 5 context JSON files parse successfully
- `.claude/logs/` directory exists and is writable
- All agent tests pass: `npm run test -- --testPathPatterns="agents"`
- TypeScript compiles: `npm run build`
- Lint passes: `npm run lint`
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPatterns="agents" --verbose
</test_commands>

</task_spec>
