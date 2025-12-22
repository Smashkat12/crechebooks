<constitution version="1.0" last_updated="2025-12-19">

<metadata>
  <project_name>CrecheBooks AI Bookkeeping System</project_name>
  <spec_version>1.0.0</spec_version>
  <authors>CrecheBooks Development Team</authors>
  <prd_reference>PRD-2025-001</prd_reference>
  <description>AI-powered bookkeeping system for South African creches and pre-schools, integrating with Xero and using Claude Code as the multi-agent orchestration layer</description>
</metadata>

<tech_stack>
  <language version="20.x">Node.js/TypeScript</language>
  <framework version="10.x">NestJS</framework>
  <database version="16.x">PostgreSQL</database>
  <orm version="0.3.x">Prisma</orm>
  <frontend version="14.x">Next.js with React</frontend>
  <ai_orchestration>Claude Code CLI (Anthropic)</ai_orchestration>
  <accounting_integration>Xero API via MCP Server</accounting_integration>
  <required_libraries>
    <library version="latest">@anthropic-ai/sdk</library>
    <library version="latest">xero-node</library>
    <library version="latest">@prisma/client</library>
    <library version="latest">bull (queue management)</library>
    <library version="latest">passport (authentication)</library>
    <library version="latest">winston (logging)</library>
    <library version="latest">joi (validation)</library>
    <library version="latest">decimal.js (financial calculations)</library>
  </required_libraries>
</tech_stack>

<directory_structure>
<!-- CrecheBooks Monorepo Structure (pnpm workspaces) -->
crechebooks/
├── .ai/                              # AI context and memory
│   ├── activeContext.md              # Current session state
│   ├── decisionLog.md                # Architectural decisions
│   └── progress.md                   # Roadmap completion status
├── .claude/                          # Claude Code configuration
│   ├── settings.json                 # Claude Code settings
│   ├── context/                      # Agent context files
│   │   ├── chart_of_accounts.json
│   │   ├── payee_patterns.json
│   │   ├── fee_structures.json
│   │   ├── sars_tables_2025.json
│   │   └── tenant_config.json
│   ├── skills/                       # Claude Code skills
│   │   ├── categorize-transaction.md
│   │   ├── generate-invoices.md
│   │   ├── match-payments.md
│   │   └── calculate-sars.md
│   └── logs/                         # Audit trails
│       ├── decisions.jsonl
│       └── escalations.jsonl
├── specs/                            # Specification documents
│   ├── constitution.md
│   ├── functional/
│   ├── technical/
│   └── tasks/
├── apps/                             # Application packages
│   ├── api/                          # NestJS API Server
│   │   ├── src/
│   │   │   ├── api/                  # REST API layer
│   │   │   │   ├── controllers/
│   │   │   │   ├── dto/
│   │   │   │   ├── guards/
│   │   │   │   └── middleware/
│   │   │   ├── agents/               # Claude Code agent definitions
│   │   │   │   ├── orchestrator/
│   │   │   │   ├── transaction-categorizer/
│   │   │   │   ├── billing-agent/
│   │   │   │   ├── payment-matcher/
│   │   │   │   └── sars-agent/
│   │   │   ├── database/
│   │   │   │   ├── entities/
│   │   │   │   ├── migrations/
│   │   │   │   ├── repositories/
│   │   │   │   └── seeds/
│   │   │   ├── integrations/
│   │   │   │   ├── xero/
│   │   │   │   ├── banking/
│   │   │   │   └── email/
│   │   │   ├── mcp/                  # MCP Server implementations
│   │   │   │   ├── xero-mcp/
│   │   │   │   ├── postgres-mcp/
│   │   │   │   └── email-mcp/
│   │   │   ├── shared/
│   │   │   │   ├── constants/
│   │   │   │   ├── decorators/
│   │   │   │   ├── exceptions/
│   │   │   │   ├── interfaces/
│   │   │   │   ├── types/
│   │   │   │   └── utils/
│   │   │   └── config/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   ├── e2e/
│   │   │   └── fixtures/
│   │   └── prisma/
│   │       └── schema.prisma
│   └── web/                          # Next.js Web Application
│       ├── src/
│       │   ├── app/                  # Next.js App Router
│       │   │   ├── (auth)/           # Auth routes
│       │   │   │   ├── login/
│       │   │   │   └── register/
│       │   │   ├── (dashboard)/      # Protected routes
│       │   │   │   ├── dashboard/
│       │   │   │   ├── transactions/
│       │   │   │   ├── invoices/
│       │   │   │   ├── payments/
│       │   │   │   ├── sars/
│       │   │   │   ├── reports/
│       │   │   │   └── settings/
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx
│       │   ├── components/           # React components
│       │   │   ├── ui/               # shadcn/ui components
│       │   │   ├── forms/            # Form components
│       │   │   ├── tables/           # Data tables
│       │   │   ├── charts/           # Dashboard charts
│       │   │   └── layout/           # Layout components
│       │   ├── hooks/                # Custom React hooks
│       │   ├── lib/                  # Utility functions
│       │   │   ├── api/              # API client
│       │   │   ├── auth/             # Auth utilities
│       │   │   └── utils/            # General utilities
│       │   ├── stores/               # Zustand stores
│       │   ├── styles/               # Global styles
│       │   └── types/                # TypeScript types
│       └── public/                   # Static assets
├── packages/                         # Shared packages
│   ├── types/                        # Shared TypeScript types
│   │   └── src/
│   │       ├── common.ts
│   │       ├── transactions.ts
│   │       ├── billing.ts
│   │       ├── payments.ts
│   │       ├── sars.ts
│   │       └── reconciliation.ts
│   └── shared/                       # Shared utilities
├── docs/
│   └── diagrams/
├── pnpm-workspace.yaml               # pnpm workspace config
└── package.json                      # Root package.json
</directory_structure>

<coding_standards>
  <naming_conventions>
    <files>kebab-case for files (e.g., transaction-categorizer.service.ts)</files>
    <components>PascalCase for React components (e.g., InvoiceList.tsx)</components>
    <classes>PascalCase for classes (e.g., TransactionService)</classes>
    <variables>camelCase for variables (e.g., transactionAmount)</variables>
    <constants>SCREAMING_SNAKE_CASE for constants (e.g., VAT_RATE)</constants>
    <functions>camelCase, verb-first (e.g., calculateVat, matchPayment)</functions>
    <interfaces>PascalCase with I prefix (e.g., ITransaction)</interfaces>
    <types>PascalCase (e.g., TransactionStatus)</types>
    <enums>PascalCase for enum, SCREAMING_SNAKE for values</enums>
    <database_tables>snake_case plural (e.g., transactions, bank_feeds)</database_tables>
    <database_columns>snake_case (e.g., created_at, account_code)</database_columns>
  </naming_conventions>

  <file_organization>
    <rule>One service class per file</rule>
    <rule>Co-locate tests with source files as [name].spec.ts</rule>
    <rule>Co-locate DTOs with their controllers</rule>
    <rule>Shared utilities go in src/shared/utils/</rule>
    <rule>All financial calculations use decimal.js, never floating point</rule>
    <rule>All dates stored as UTC; displayed in SAST (Africa/Johannesburg)</rule>
  </file_organization>

  <error_handling>
    <rule>All async operations must have explicit try-catch handling</rule>
    <rule>Errors must be logged with full context before re-throwing</rule>
    <rule>Use custom exception classes for business errors</rule>
    <rule>Never expose internal error details to clients</rule>
    <rule>Financial operation errors must trigger alerts</rule>
  </error_handling>

  <financial_precision>
    <rule>All monetary values stored as integers (cents) in database</rule>
    <rule>Use Decimal.js for all calculations with precision 2</rule>
    <rule>Use banker's rounding (half-even) for all rounding</rule>
    <rule>Currency is always ZAR (South African Rand)</rule>
    <rule>VAT calculations must reconcile to within R0.01</rule>
  </financial_precision>
</coding_standards>

<anti_patterns>
  <forbidden>
    <item reason="Type Safety">Do NOT use 'any' type; use proper typing or 'unknown'</item>
    <item reason="Deprecated">Do NOT use var; use const or let</item>
    <item reason="Security">Do NOT store secrets in code; use environment variables</item>
    <item reason="Security">Do NOT log sensitive data (passwords, tokens, personal info)</item>
    <item reason="Financial Precision">Do NOT use JavaScript Number for money; use Decimal.js</item>
    <item reason="Financial Precision">Do NOT use Math.round for financial calculations; use banker's rounding</item>
    <item reason="Data Integrity">Do NOT delete financial records; use soft delete with audit trail</item>
    <item reason="Consistency">Do NOT create new utility files without checking existing src/shared/utils/</item>
    <item reason="Maintainability">Do NOT use magic numbers; define constants in src/shared/constants/</item>
    <item reason="Testing">Do NOT stub data inline; use factories in tests/fixtures/</item>
    <item reason="Architecture">Do NOT call external APIs directly from controllers; use service layer</item>
    <item reason="Architecture">Do NOT bypass the MCP layer for Xero integration</item>
    <item reason="Multi-tenancy">Do NOT access data without tenant context validation</item>
    <item reason="Compliance">Do NOT modify SARS submission data after finalization</item>
  </forbidden>
</anti_patterns>

<security_requirements>
  <rule id="SEC-01">All user input must be validated and sanitized using Joi schemas</rule>
  <rule id="SEC-02">Authentication via OAuth 2.0 / OIDC (Auth0 or similar)</rule>
  <rule id="SEC-03">Role-based access control: Owner, Admin, Viewer, Accountant roles</rule>
  <rule id="SEC-04">All API endpoints require authentication except /health and /auth/*</rule>
  <rule id="SEC-05">Data encrypted at rest using AES-256</rule>
  <rule id="SEC-06">Data encrypted in transit using TLS 1.2+</rule>
  <rule id="SEC-07">Xero OAuth tokens stored in secrets manager, never in database</rule>
  <rule id="SEC-08">All data access logged with timestamp, user, and action</rule>
  <rule id="SEC-09">Tenant isolation enforced at database query level</rule>
  <rule id="SEC-10">POPIA compliance: personal data handling with consent tracking</rule>
  <rule id="SEC-11">Rate limiting: 100 requests/minute per user</rule>
  <rule id="SEC-12">Claude Code session access restricted by tenant</rule>
</security_requirements>

<performance_budgets>
  <metric name="transaction_categorization">Less than 2 seconds p95 per transaction</metric>
  <metric name="invoice_batch_generation">Less than 60 seconds for 100 invoices</metric>
  <metric name="dashboard_load">Less than 3 seconds time to interactive</metric>
  <metric name="api_response">Less than 200ms p95 for CRUD operations</metric>
  <metric name="database_query">Less than 100ms p95</metric>
  <metric name="xero_sync">Less than 30 seconds for full account sync</metric>
  <metric name="bank_import">1000+ transactions per minute</metric>
</performance_budgets>

<testing_requirements>
  <coverage_minimum>80% line coverage</coverage_minimum>
  <required_tests>
    <test_type>Unit tests for all business logic and calculations</test_type>
    <test_type>Unit tests for all financial calculations with edge cases</test_type>
    <test_type>Integration tests for all API endpoints</test_type>
    <test_type>Integration tests for Xero MCP interactions</test_type>
    <test_type>E2E tests for critical user journeys (categorization, billing, SARS)</test_type>
    <test_type>Performance tests for batch operations</test_type>
  </required_tests>
  <test_data>
    <rule>Use factories for generating test data</rule>
    <rule>Never use production data in tests</rule>
    <rule>Include South African-specific test cases (VAT, PAYE tables)</rule>
  </test_data>
</testing_requirements>

<compliance_requirements>
  <rule id="COMP-01">POPIA: All personal data handling must have consent; data minimization applied</rule>
  <rule id="COMP-02">SARS: Tax calculations must use current year's official tax tables</rule>
  <rule id="COMP-03">SARS: VAT201 format must match current SARS specifications</rule>
  <rule id="COMP-04">SARS: EMP201 format must match current SARS specifications</rule>
  <rule id="COMP-05">Retention: Financial records retained for minimum 5 years</rule>
  <rule id="COMP-06">Audit Trail: All changes to financial data must be logged immutably</rule>
  <rule id="COMP-07">GAAP: Reports formatted for South African accounting standards</rule>
</compliance_requirements>

<agent_autonomy_levels>
  <!-- L1: Operator - Agent proposes; human always approves -->
  <!-- L2: Collaborator - Agent and human jointly work; frequent interaction -->
  <!-- L3: Consultant - Agent acts on routine items; escalates significant decisions -->
  <!-- L4: Approver - Agent acts autonomously; human reviews outcomes -->
  <!-- L5: Observer - Fully autonomous; human monitors for anomalies -->

  <function name="transaction_categorization_high_confidence" level="L4">
    <description>Auto-categorize when confidence >= 80%</description>
  </function>
  <function name="transaction_categorization_low_confidence" level="L2">
    <description>Require human review when confidence < 80%</description>
  </function>
  <function name="invoice_generation" level="L3">
    <description>Generate as drafts; owner reviews before send</description>
  </function>
  <function name="invoice_sending" level="L3">
    <description>Owner approves batch; system sends</description>
  </function>
  <function name="payment_matching_exact" level="L4">
    <description>Auto-apply exact matches</description>
  </function>
  <function name="payment_matching_ambiguous" level="L2">
    <description>Require human selection for ambiguous matches</description>
  </function>
  <function name="arrears_reminders" level="L3">
    <description>Follow configured rules; owner can override</description>
  </function>
  <function name="sars_calculations" level="L2">
    <description>Always require human review before submission</description>
  </function>
  <function name="bank_reconciliation" level="L4">
    <description>Auto-reconcile clear items; flag discrepancies</description>
  </function>
</agent_autonomy_levels>

<guardrails>
  <financial>
    <guard id="GUARD-FIN-001">All monetary calculations use Decimal.js with 2 decimal places; banker's rounding</guard>
    <guard id="GUARD-FIN-002">Bank balance must reconcile within R0.01</guard>
    <guard id="GUARD-FIN-003">VAT calculations must match Xero to within R0.01</guard>
    <guard id="GUARD-FIN-004">No transaction can be deleted; only recategorized with audit trail</guard>
  </financial>
  <data_integrity>
    <guard id="GUARD-DATA-001">Finalized SARS submissions cannot be modified</guard>
    <guard id="GUARD-DATA-002">All changes logged with timestamp, user, before/after values</guard>
    <guard id="GUARD-DATA-003">Tenant data isolation enforced at query level</guard>
    <guard id="GUARD-DATA-004">Financial data backed up every 6 hours</guard>
  </data_integrity>
  <ai_safety>
    <guard id="GUARD-AI-001">Low-confidence (&lt;80%) categorizations require human review</guard>
    <guard id="GUARD-AI-002">User corrections limited to 50/day to prevent adversarial training</guard>
    <guard id="GUARD-AI-003">Agent cannot create invoices for non-existent children</guard>
    <guard id="GUARD-AI-004">Agent cannot access data outside assigned tenant</guard>
    <guard id="GUARD-AI-005">Claude Code usage monitored; alert if exceeds limits</guard>
    <guard id="GUARD-AI-006">All agent decisions logged to audit trail</guard>
  </ai_safety>
</guardrails>

<south_african_context>
  <currency>ZAR (South African Rand)</currency>
  <timezone>Africa/Johannesburg (SAST, UTC+2)</timezone>
  <vat_rate>15%</vat_rate>
  <vat_registration_threshold>R1,000,000 annual turnover</vat_registration_threshold>
  <vat_submission_deadline>25th of following month</vat_submission_deadline>
  <emp201_submission_deadline>7th of following month</emp201_submission_deadline>
  <uif_rate_employee>1%</uif_rate_employee>
  <uif_rate_employer>1%</uif_rate_employer>
  <uif_max_contribution>R177.12 per month</uif_max_contribution>
  <data_retention_years>5</data_retention_years>
  <primary_bank>FNB (First National Bank)</primary_bank>
</south_african_context>

</constitution>
