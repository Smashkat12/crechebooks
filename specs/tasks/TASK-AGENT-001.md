<task_spec id="TASK-AGENT-001" version="3.0">

<metadata>
  <title>Claude Code Configuration and Context Setup</title>
  <status>COMPLETE</status>
  <layer>agent</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>NFR-SEC-001</requirement_ref>
    <requirement_ref>NFR-PERF-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-001</task_ref>
    <task_ref status="COMPLETE">All Logic Layer (TASK-*-01* complete)</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task establishes agent context files for CrecheBooks. The .claude/ directory already exists
with settings.json, hooks, and command structure (from claude-flow setup). This task adds:
- Context JSON files for agent decision-making
- Logging infrastructure for audit trails
- Agent skills directories

**CRITICAL PROJECT RULES (from specs/constitution.md):**
- ALL monetary values are CENTS (integers) - NEVER rands as floats
- Prisma is the ONLY database access layer
- Decimal.js with banker's rounding (ROUND_HALF_EVEN) for calculations
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries

**WHAT ALREADY EXISTS (DO NOT RECREATE):**
- `.claude/settings.json` - Hooks, permissions, MCP servers (claude-flow, ruv-swarm)
- `.claude/commands/` - 15 command directories (agents, analysis, automation, etc.)
- `.claude/helpers/` - Helper utilities
- `src/mcp/xero-mcp/` - Xero MCP server with tools (get_accounts, get_invoices, etc.)
- `src/database/services/` - 22 complete services (categorization, payment-matching, etc.)
- `src/shared/exceptions/` - BusinessException, NotFoundException, etc.
</context>

<project_structure>
ACTUAL current structure (verified 2024-12-21):

```
.claude/
├── settings.json           # ALREADY EXISTS - hooks + MCP servers
├── settings.local.json     # ALREADY EXISTS - local overrides
├── statusline-command.sh   # ALREADY EXISTS
├── checkpoints/            # ALREADY EXISTS
├── commands/               # ALREADY EXISTS - 15 directories
│   └── agents/             # claude-flow agent commands (NOT our agents)
├── helpers/                # ALREADY EXISTS
├── context/                # TO CREATE - context JSON files
│   ├── chart_of_accounts.json
│   ├── payee_patterns.json
│   ├── fee_structures.json
│   ├── sars_tables_2025.json
│   └── tenant_config.json
├── logs/                   # TO CREATE - decision/escalation logs
│   ├── decisions.jsonl
│   └── escalations.jsonl
└── agents/                 # TO CREATE - CrecheBooks agent skills
    ├── orchestrator/
    ├── transaction-categorizer/
    ├── payment-matcher/
    └── sars-agent/

src/mcp/xero-mcp/           # ALREADY EXISTS
├── server.ts               # Main MCP server
├── tools/                  # 9 tool implementations
│   ├── get-accounts.ts
│   ├── get-transactions.ts
│   ├── get-invoices.ts
│   ├── get-contacts.ts
│   ├── create-invoice.ts
│   ├── create-contact.ts
│   ├── apply-payment.ts
│   └── update-transaction.ts
├── auth/                   # OAuth handling
├── types/                  # TypeScript types
└── utils/                  # Helper utilities
```
</project_structure>

<existing_services>
These services exist in src/database/services/ and agents will USE them:

**Transaction Services:**
- CategorizationService - AI-powered transaction categorization
- PatternLearningService - Learn from user corrections
- TransactionImportService - Import from CSV/PDF
- XeroSyncService - Sync with Xero API

**Billing Services:**
- EnrollmentService - Child enrollment management
- InvoiceGenerationService - Create monthly invoices
- InvoiceDeliveryService - Email/WhatsApp delivery
- ProRataService - Calculate partial month fees

**Payment Services:**
- PaymentMatchingService - Match payments to invoices
- PaymentAllocationService - Allocate to multiple invoices
- ArrearsService - Calculate outstanding balances
- ReminderService - Send payment reminders

**SARS Services:**
- VatService - VAT calculations (15% rate)
- PayeService - PAYE calculations (2025 tax tables)
- UifService - UIF calculations (1% capped at R177.12)
- Emp201Service - EMP201 return generation
- Vat201Service - VAT201 return generation

**Reconciliation Services:**
- ReconciliationService - Bank reconciliation
- DiscrepancyService - Detect mismatches
- FinancialReportService - Income statement, balance sheet
</existing_services>

<files_to_create>
1. .claude/context/chart_of_accounts.json
2. .claude/context/payee_patterns.json
3. .claude/context/fee_structures.json
4. .claude/context/sars_tables_2025.json
5. .claude/context/tenant_config.json
6. .claude/logs/.gitkeep
7. .claude/agents/orchestrator/.gitkeep
8. .claude/agents/transaction-categorizer/.gitkeep
9. .claude/agents/payment-matcher/.gitkeep
10. .claude/agents/sars-agent/.gitkeep
</files_to_create>

<files_to_modify>
1. .claude/settings.json - ADD contextFiles array referencing new files
2. .gitignore - ADD .claude/logs/*.jsonl to ignore log files
</files_to_modify>

<implementation_reference>

## Chart of Accounts (.claude/context/chart_of_accounts.json)
SA creche-specific chart matching src/database/constants/chart-of-accounts.constants.ts

```json
{
  "version": "2025.1",
  "description": "South African Creche Chart of Accounts per IFRS for SMEs",
  "accounts": [
    { "code": "1000", "name": "Bank - Current Account", "type": "asset", "category": "current" },
    { "code": "1100", "name": "Petty Cash", "type": "asset", "category": "current" },
    { "code": "1200", "name": "Accounts Receivable", "type": "asset", "category": "current" },
    { "code": "1300", "name": "Prepaid Expenses", "type": "asset", "category": "current" },
    { "code": "1500", "name": "Equipment", "type": "asset", "category": "non-current" },
    { "code": "1510", "name": "Furniture and Fittings", "type": "asset", "category": "non-current" },
    { "code": "2100", "name": "Accounts Payable", "type": "liability", "category": "current" },
    { "code": "2200", "name": "VAT Payable", "type": "liability", "category": "current" },
    { "code": "2300", "name": "PAYE Payable", "type": "liability", "category": "current" },
    { "code": "2310", "name": "UIF Payable", "type": "liability", "category": "current" },
    { "code": "2400", "name": "Accrued Expenses", "type": "liability", "category": "current" },
    { "code": "3000", "name": "Owner's Equity", "type": "equity", "category": "equity" },
    { "code": "3100", "name": "Retained Earnings", "type": "equity", "category": "equity" },
    { "code": "4000", "name": "School Fees Income", "type": "revenue", "category": "income" },
    { "code": "4010", "name": "Registration Fees", "type": "revenue", "category": "income" },
    { "code": "4020", "name": "After Care Fees", "type": "revenue", "category": "income" },
    { "code": "4030", "name": "Extra Activities Income", "type": "revenue", "category": "income" },
    { "code": "4100", "name": "Other Income", "type": "revenue", "category": "income" },
    { "code": "5000", "name": "Salaries and Wages", "type": "expense", "category": "expense" },
    { "code": "5010", "name": "Employer UIF Contribution", "type": "expense", "category": "expense" },
    { "code": "5100", "name": "Rent", "type": "expense", "category": "expense" },
    { "code": "5200", "name": "Utilities - Electricity", "type": "expense", "category": "expense" },
    { "code": "5210", "name": "Utilities - Water", "type": "expense", "category": "expense" },
    { "code": "5300", "name": "Educational Supplies", "type": "expense", "category": "expense" },
    { "code": "5400", "name": "Food and Catering", "type": "expense", "category": "expense" },
    { "code": "5500", "name": "Insurance", "type": "expense", "category": "expense" },
    { "code": "5600", "name": "Cleaning and Hygiene", "type": "expense", "category": "expense" },
    { "code": "5700", "name": "Maintenance and Repairs", "type": "expense", "category": "expense" },
    { "code": "8000", "name": "Advertising and Marketing", "type": "expense", "category": "expense" },
    { "code": "8100", "name": "Bank Charges", "type": "expense", "category": "expense" },
    { "code": "8200", "name": "Professional Fees", "type": "expense", "category": "expense" },
    { "code": "8300", "name": "Telephone and Internet", "type": "expense", "category": "expense" }
  ],
  "accountRanges": {
    "assets": { "start": 1000, "end": 1999 },
    "currentAssets": { "start": 1000, "end": 1499 },
    "nonCurrentAssets": { "start": 1500, "end": 1999 },
    "liabilities": { "start": 2000, "end": 2999 },
    "currentLiabilities": { "start": 2000, "end": 2499 },
    "nonCurrentLiabilities": { "start": 2500, "end": 2999 },
    "equity": { "start": 3000, "end": 3999 },
    "income": { "start": 4000, "end": 4999 },
    "expenses": { "start": 5000, "end": 8999 }
  }
}
```

## Payee Patterns (.claude/context/payee_patterns.json)
Transaction categorization patterns for South African bank statements

```json
{
  "version": "2025.1",
  "description": "Payee pattern matching rules for SA creche transactions",
  "autoApplyConfidenceThreshold": 0.80,
  "patterns": [
    {
      "id": "bank-fnb-cheque",
      "regex": "^FNB CHEQUE",
      "accountCode": "8100",
      "accountName": "Bank Charges",
      "confidence": 0.95,
      "vatType": "NO_VAT"
    },
    {
      "id": "bank-fnb-fee",
      "regex": "FNB.*SERVICE FEE|FNB.*ADMIN",
      "accountCode": "8100",
      "accountName": "Bank Charges",
      "confidence": 0.95,
      "vatType": "NO_VAT"
    },
    {
      "id": "sars-payment",
      "regex": "^SARS|SOUTH AFRICAN REVENUE",
      "accountCode": "2200",
      "accountName": "VAT Payable",
      "confidence": 1.0,
      "vatType": "NO_VAT",
      "flagForReview": true,
      "reviewReason": "Tax payment - verify correct tax type"
    },
    {
      "id": "utility-eskom",
      "regex": "ESKOM|CITY POWER|MUNICIPALITY.*ELEC",
      "accountCode": "5200",
      "accountName": "Utilities - Electricity",
      "confidence": 0.90,
      "vatType": "STANDARD"
    },
    {
      "id": "utility-water",
      "regex": "WATER.*BOARD|MUNICIPALITY.*WATER|RAND WATER",
      "accountCode": "5210",
      "accountName": "Utilities - Water",
      "confidence": 0.90,
      "vatType": "ZERO_RATED"
    },
    {
      "id": "telecom",
      "regex": "VODACOM|MTN|TELKOM|CELL C|AFRIHOST|RAIN",
      "accountCode": "8300",
      "accountName": "Telephone and Internet",
      "confidence": 0.90,
      "vatType": "STANDARD"
    },
    {
      "id": "groceries",
      "regex": "SHOPRITE|PICK N PAY|WOOLWORTHS|CHECKERS|SPAR|MAKRO",
      "accountCode": "5400",
      "accountName": "Food and Catering",
      "confidence": 0.75,
      "vatType": "STANDARD",
      "requiresAmountCheck": true,
      "maxAmountCents": 500000
    },
    {
      "id": "school-fee-deposit",
      "regex": "DEPOSIT|SCHOOL.*FEE|TUITION",
      "accountCode": "4000",
      "accountName": "School Fees Income",
      "confidence": 0.70,
      "vatType": "EXEMPT",
      "isCredit": true
    },
    {
      "id": "salary-payment",
      "regex": "SALARY|WAGE|PAY.*EMP",
      "accountCode": "5000",
      "accountName": "Salaries and Wages",
      "confidence": 0.85,
      "vatType": "NO_VAT"
    },
    {
      "id": "insurance",
      "regex": "OUTSURANCE|SANLAM|OLD MUTUAL|DISCOVERY|MOMENTUM|SANTAM",
      "accountCode": "5500",
      "accountName": "Insurance",
      "confidence": 0.90,
      "vatType": "EXEMPT"
    }
  ]
}
```

## SARS Tables 2025 (.claude/context/sars_tables_2025.json)
CRITICAL: ALL MONETARY VALUES IN CENTS

```json
{
  "version": "2025",
  "effectiveFrom": "2025-03-01",
  "effectiveTo": "2026-02-28",
  "source": "SARS Tax Tables 2025",
  "paye": {
    "taxYear": "2025",
    "description": "Individual tax brackets - values in CENTS",
    "taxBrackets": [
      {
        "bracketNumber": 1,
        "fromCents": 0,
        "toCents": 23740000,
        "rate": 0.18,
        "baseTaxCents": 0
      },
      {
        "bracketNumber": 2,
        "fromCents": 23740001,
        "toCents": 37080000,
        "rate": 0.26,
        "baseTaxCents": 427320
      },
      {
        "bracketNumber": 3,
        "fromCents": 37080001,
        "toCents": 51210000,
        "rate": 0.31,
        "baseTaxCents": 773760
      },
      {
        "bracketNumber": 4,
        "fromCents": 51210001,
        "toCents": 67340000,
        "rate": 0.36,
        "baseTaxCents": 1211100
      },
      {
        "bracketNumber": 5,
        "fromCents": 67340001,
        "toCents": 85710000,
        "rate": 0.39,
        "baseTaxCents": 1791780
      },
      {
        "bracketNumber": 6,
        "fromCents": 85710001,
        "toCents": 181270000,
        "rate": 0.41,
        "baseTaxCents": 2509050
      },
      {
        "bracketNumber": 7,
        "fromCents": 181270001,
        "toCents": 999999999999,
        "rate": 0.45,
        "baseTaxCents": 6425670
      }
    ],
    "rebates": {
      "description": "Tax rebates in CENTS - deducted from calculated tax",
      "primary": {
        "amountCents": 1760000,
        "ageRequirement": null
      },
      "secondary": {
        "amountCents": 975000,
        "ageRequirement": 65
      },
      "tertiary": {
        "amountCents": 325500,
        "ageRequirement": 75
      }
    },
    "taxThresholds": {
      "description": "Annual income below which no tax is payable (in CENTS)",
      "under65": 9540000,
      "age65to74": 14795800,
      "age75plus": 16531400
    }
  },
  "uif": {
    "description": "Unemployment Insurance Fund - values in CENTS",
    "employeeRate": 0.01,
    "employerRate": 0.01,
    "maxMonthlyEarningsCents": 1771200,
    "maxMonthlyContributionCents": 17712
  },
  "vat": {
    "description": "Value Added Tax",
    "standardRate": 0.15,
    "zeroRatedItems": ["basic foodstuffs", "exports", "illuminating paraffin"],
    "exemptItems": ["educational services", "public transport", "residential rentals"],
    "registrationThresholdCents": 100000000
  }
}
```

## Fee Structures (.claude/context/fee_structures.json)

```json
{
  "version": "2025.1",
  "description": "Common creche fee templates - all amounts in CENTS",
  "defaultCurrency": "ZAR",
  "templates": [
    {
      "id": "standard-full-day",
      "name": "Full Day Care (07:00-17:00)",
      "feeType": "FULL_DAY",
      "monthlyFeeCents": 400000,
      "registrationFeeCents": 75000,
      "includesVat": false,
      "vatExempt": true
    },
    {
      "id": "standard-half-day",
      "name": "Half Day Care (07:00-13:00)",
      "feeType": "HALF_DAY",
      "monthlyFeeCents": 280000,
      "registrationFeeCents": 75000,
      "includesVat": false,
      "vatExempt": true
    },
    {
      "id": "after-care",
      "name": "After Care Only (14:00-17:00)",
      "feeType": "CUSTOM",
      "monthlyFeeCents": 150000,
      "registrationFeeCents": 50000,
      "includesVat": false,
      "vatExempt": true
    }
  ],
  "extraActivities": [
    { "name": "Swimming Lessons", "weeklyCents": 15000, "vatExempt": true },
    { "name": "Music Classes", "weeklyCents": 12000, "vatExempt": true },
    { "name": "Extra Meals", "dailyCents": 2500, "vatExempt": true }
  ],
  "discounts": [
    { "type": "sibling", "percentage": 10, "description": "10% sibling discount" },
    { "type": "annual", "percentage": 5, "description": "5% annual payment discount" }
  ],
  "lateFees": {
    "afterHoursPickupCents": 5000,
    "perMinuteAfter30Cents": 500,
    "latePaymentPercentage": 0.02
  }
}
```

## Tenant Config (.claude/context/tenant_config.json)

```json
{
  "version": "2025.1",
  "description": "Default tenant configuration for new creches",
  "defaults": {
    "taxStatus": "NOT_REGISTERED",
    "vatRate": 0.15,
    "currency": "ZAR",
    "timezone": "Africa/Johannesburg",
    "locale": "en-ZA",
    "fiscalYearEnd": "February",
    "billingDayOfMonth": 1,
    "paymentTermsDays": 7,
    "reminderDaysBefore": [7, 3, 1],
    "reminderDaysAfter": [1, 7, 14, 30],
    "preferredContact": "WHATSAPP",
    "enableAutoCategorization": true,
    "autoCategorizeConfidenceThreshold": 0.80,
    "enableAutoPaymentMatching": true,
    "autoPaymentMatchConfidenceThreshold": 0.90,
    "sarsSubmissionRequired": true,
    "sarsAlwaysRequireReview": true
  },
  "autonomyLevels": {
    "L3_FULL_AUTO": {
      "description": "Full autonomy - auto-apply decisions",
      "requiresReview": false,
      "confidenceThreshold": 0.95,
      "applicableTo": ["high-confidence categorization", "exact payment matches"]
    },
    "L2_DRAFT": {
      "description": "Draft for review - SARS submissions",
      "requiresReview": true,
      "applicableTo": ["SARS calculations", "tax submissions", "financial reports"]
    },
    "L1_SUGGEST": {
      "description": "Suggest only - user must confirm",
      "requiresReview": true,
      "applicableTo": ["low-confidence categorization", "ambiguous payment matches"]
    }
  },
  "agentBehavior": {
    "alwaysEscalate": ["SARS submissions", "amounts > R50000", "unknown payees"],
    "logAllDecisions": true,
    "maxRetries": 3,
    "timeoutSeconds": 30
  }
}
```

## Settings.json Update
ADD to existing .claude/settings.json (do not replace existing content):

```json
{
  "contextFiles": [
    ".claude/context/chart_of_accounts.json",
    ".claude/context/payee_patterns.json",
    ".claude/context/fee_structures.json",
    ".claude/context/sars_tables_2025.json",
    ".claude/context/tenant_config.json"
  ],
  "logFiles": {
    "decisions": ".claude/logs/decisions.jsonl",
    "escalations": ".claude/logs/escalations.jsonl"
  }
}
```

## Logging Format

decisions.jsonl entries:
```json
{"timestamp":"2025-01-15T10:30:00.000Z","agent":"transaction-categorizer","tenantId":"uuid","transactionId":"uuid","decision":"categorize","accountCode":"8100","confidence":0.95,"source":"RULE_BASED","autoApplied":true}
```

escalations.jsonl entries:
```json
{"timestamp":"2025-01-15T10:30:00.000Z","agent":"sars-agent","tenantId":"uuid","type":"SARS_CALCULATION","period":"2025-01","details":{"emp201Total":15000000},"reason":"SARS submission requires human review","status":"pending"}
```
</implementation_reference>

<validation_criteria>
- All context JSON files parse successfully (node -c filename.json)
- SARS tax tables match official 2025 rates
- All monetary values are in CENTS (integers, not floats)
- Chart of accounts follows SA IFRS for SMEs conventions
- Payee patterns compile as valid regex
- .claude/logs directory exists and is writable
- .claude/agents subdirectories exist
- settings.json is valid JSON after update
- .gitignore includes .claude/logs/*.jsonl
</validation_criteria>

<test_commands>
npm run build
node -e "JSON.parse(require('fs').readFileSync('.claude/context/chart_of_accounts.json'))"
node -e "JSON.parse(require('fs').readFileSync('.claude/context/payee_patterns.json'))"
node -e "JSON.parse(require('fs').readFileSync('.claude/context/sars_tables_2025.json'))"
node -e "JSON.parse(require('fs').readFileSync('.claude/context/fee_structures.json'))"
node -e "JSON.parse(require('fs').readFileSync('.claude/context/tenant_config.json'))"
test -d .claude/logs && echo "logs dir exists"
test -d .claude/agents/orchestrator && echo "agents dirs exist"
</test_commands>

</task_spec>
