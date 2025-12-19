<task_spec id="TASK-AGENT-001" version="1.0">

<metadata>
  <title>Claude Code Configuration and Context Setup</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>37</sequence>
  <implements>
    <requirement_ref>NFR-SEC-001</requirement_ref>
    <requirement_ref>NFR-PERF-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task establishes the foundational Claude Code agent infrastructure for CrecheBooks.
It creates the .claude/ directory structure, configures MCP servers for Xero, PostgreSQL,
and Email integrations, and sets up context files that agents will use for decision-making.
This includes chart of accounts patterns, payee categorization rules, fee structures,
SARS tax tables for 2025, and tenant-specific configuration. Additionally, it creates
logging infrastructure for agent decisions and escalations to ensure auditability.
</context>

<input_context_files>
  <file purpose="agent_architecture">specs/technical/architecture.md#claude_code_architecture</file>
  <file purpose="mcp_configuration">specs/technical/architecture.md#mcp_server_configuration</file>
  <file purpose="tenant_model">specs/technical/data-model.md#tenant_entity</file>
  <file purpose="sars_requirements">specs/requirements/sars.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-001 completed (NestJS project initialized)</check>
  <check>Claude Code CLI installed and configured</check>
  <check>Node.js 20.x available for MCP servers</check>
  <check>Xero API credentials obtained (client ID, secret)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create .claude/ directory structure
    - Configure settings.json with MCP server definitions
    - Create context files:
      - chart_of_accounts.json (SA creche-specific CoA)
      - payee_patterns.json (transaction categorization rules)
      - fee_structures.json (common creche fee templates)
      - sars_tables_2025.json (PAYE, UIF, VAT thresholds)
      - tenant_config.json (default tenant settings)
    - Set up logging infrastructure:
      - decisions.jsonl (JSONL append-only log)
      - escalations.jsonl (user review queue)
    - Create agent skills directory structure
    - Document MCP tool usage guidelines
  </in_scope>
  <out_of_scope>
    - Actual MCP server implementation (TASK-MCP-*)
    - Agent logic implementation (TASK-AGENT-002+)
    - Xero OAuth flow (TASK-CORE-003)
    - Database schema (TASK-CORE-002)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file=".claude/settings.json">
      {
        "mcpServers": {
          "xero": { "command": "node", "args": [...], "tools": [...] },
          "postgres": { "command": "node", "args": [...], "tools": [...] },
          "email": { "command": "node", "args": [...], "tools": [...] }
        },
        "contextFiles": [...],
        "logFiles": [...]
      }
    </signature>
    <signature file=".claude/context/chart_of_accounts.json">
      {
        "accounts": [
          { "code": "4000", "name": "Tuition Fees", "type": "revenue" },
          { "code": "5000", "name": "Salaries", "type": "expense" },
          ...
        ]
      }
    </signature>
    <signature file=".claude/context/payee_patterns.json">
      {
        "patterns": [
          { "regex": "FNB CHEQUE", "category": "Bank Charges", "confidence": 0.95 },
          { "regex": "SARS", "category": "Tax Payments", "confidence": 1.0 },
          ...
        ]
      }
    </signature>
    <signature file=".claude/context/sars_tables_2025.json">
      {
        "paye": { "taxBrackets": [...], "rebates": {...} },
        "uif": { "rate": 0.01, "maxMonthly": 17712 },
        "vat": { "rate": 0.15, "registrationThreshold": 100000000 }
      }
    </signature>
  </signatures>

  <constraints>
    - All context files must be valid JSON
    - MCP server paths must be relative to project root
    - SARS tables must match 2025 tax year exactly
    - Chart of accounts must follow SA GAAP conventions
    - Log files must use JSONL format (one JSON object per line)
    - All sensitive data (API keys) must use environment variables
  </constraints>

  <verification>
    - .claude/settings.json validates against schema
    - All context JSON files parse without errors
    - claude mcp list shows all three configured servers
    - Log directory is writable
    - README.md in .claude/ documents usage
  </verification>
</definition_of_done>

<pseudo_code>
Directory Structure:
  .claude/
    settings.json             # MCP server configuration
    README.md                 # Agent usage documentation
    context/
      chart_of_accounts.json  # SA creche CoA
      payee_patterns.json     # Transaction categorization rules
      fee_structures.json     # Common fee templates
      sars_tables_2025.json   # Tax tables for 2025
      tenant_config.json      # Default tenant settings
    logs/
      decisions.jsonl         # Agent decision log
      escalations.jsonl       # User review queue
    agents/
      orchestrator/           # Main orchestrator
      transaction-categorizer/ # Categorization agent
      payment-matcher/        # Payment matching agent
      sars-agent/             # Tax calculation agent

MCP Configuration (.claude/settings.json):
  {
    "mcpServers": {
      "xero": {
        "command": "node",
        "args": ["./src/mcp/xero-mcp/server.js"],
        "env": {
          "XERO_CLIENT_ID": "${XERO_CLIENT_ID}",
          "XERO_CLIENT_SECRET": "${XERO_CLIENT_SECRET}",
          "XERO_TENANT_ID": "${XERO_TENANT_ID}"
        },
        "tools": [
          "get_accounts", "get_transactions", "update_transaction",
          "create_invoice", "get_invoices", "apply_payment",
          "get_contacts", "create_contact"
        ]
      },
      "postgres": {
        "command": "node",
        "args": ["./src/mcp/postgres-mcp/server.js"],
        "env": { "DATABASE_URL": "${DATABASE_URL}" },
        "tools": ["query", "get_tenant_context"]
      },
      "email": {
        "command": "node",
        "args": ["./src/mcp/email-mcp/server.js"],
        "env": {
          "SMTP_HOST": "${SMTP_HOST}",
          "SMTP_USER": "${SMTP_USER}",
          "SMTP_PASS": "${SMTP_PASS}",
          "WHATSAPP_TOKEN": "${WHATSAPP_TOKEN}"
        },
        "tools": ["send_email", "send_whatsapp", "check_delivery_status"]
      }
    }
  }

Chart of Accounts (chart_of_accounts.json):
  {
    "accounts": [
      { "code": "1000", "name": "Bank - Current Account", "type": "asset" },
      { "code": "1200", "name": "Accounts Receivable", "type": "asset" },
      { "code": "2100", "name": "Accounts Payable", "type": "liability" },
      { "code": "2200", "name": "VAT Payable", "type": "liability" },
      { "code": "4000", "name": "Tuition Fees", "type": "revenue" },
      { "code": "4100", "name": "Registration Fees", "type": "revenue" },
      { "code": "4200", "name": "After Care Fees", "type": "revenue" },
      { "code": "5000", "name": "Salaries and Wages", "type": "expense" },
      { "code": "5100", "name": "PAYE", "type": "expense" },
      { "code": "5110", "name": "UIF", "type": "expense" },
      { "code": "6000", "name": "Rent", "type": "expense" },
      { "code": "6100", "name": "Utilities", "type": "expense" },
      { "code": "6200", "name": "Food and Supplies", "type": "expense" },
      { "code": "6300", "name": "Bank Charges", "type": "expense" }
    ]
  }

Payee Patterns (payee_patterns.json):
  {
    "patterns": [
      { "regex": "^FNB CHEQUE", "category": "Bank Charges", "account": "6300", "confidence": 0.95 },
      { "regex": "^SARS", "category": "Tax Payment", "account": "2200", "confidence": 1.0 },
      { "regex": "CAPITEC|FNB|NEDBANK|STANDARD", "category": "Bank Transfer", "confidence": 0.7 },
      { "regex": "ESKOM|CITY POWER", "category": "Utilities - Electricity", "account": "6100", "confidence": 0.9 },
      { "regex": "VODACOM|MTN|TELKOM", "category": "Utilities - Telecom", "account": "6100", "confidence": 0.9 },
      { "regex": "SHOPRITE|PICK N PAY|WOOLWORTHS", "category": "Food and Supplies", "account": "6200", "confidence": 0.8 }
    ]
  }

SARS Tables 2025 (sars_tables_2025.json):
  {
    "paye": {
      "taxYear": "2025",
      "taxBrackets": [
        { "from": 0, "to": 23740000, "rate": 0.18, "threshold": 0 },
        { "from": 23740001, "to": 37080000, "rate": 0.26, "threshold": 427320 },
        { "from": 37080001, "to": 51210000, "rate": 0.31, "threshold": 773760 },
        { "from": 51210001, "to": 67340000, "rate": 0.36, "threshold": 1211100 },
        { "from": 67340001, "to": 85710000, "rate": 0.39, "threshold": 1791780 },
        { "from": 85710001, "to": 181270000, "rate": 0.41, "threshold": 2509050 },
        { "from": 181270001, "to": 999999999999, "rate": 0.45, "threshold": 6425670 }
      ],
      "rebates": {
        "primary": 1760000,
        "secondary": 975000,
        "tertiary": 325500
      }
    },
    "uif": {
      "rate": 0.01,
      "employerRate": 0.01,
      "employeeRate": 0.01,
      "maxMonthlyEarnings": 1771200
    },
    "vat": {
      "rate": 0.15,
      "registrationThreshold": 100000000
    }
  }

Logging Function:
  function logDecision(agent, decision, confidence):
    const entry = {
      timestamp: new Date().toISOString(),
      agent: agent,
      decision: decision,
      confidence: confidence,
      tenantId: currentTenantId
    }
    appendToFile('.claude/logs/decisions.jsonl', JSON.stringify(entry) + '\n')

  function logEscalation(type, details, reason):
    const entry = {
      timestamp: new Date().toISOString(),
      type: type,
      details: details,
      reason: reason,
      status: 'pending',
      tenantId: currentTenantId
    }
    appendToFile('.claude/logs/escalations.jsonl', JSON.stringify(entry) + '\n')
</pseudo_code>

<files_to_create>
  <file path=".claude/settings.json">MCP server configuration and context file references</file>
  <file path=".claude/README.md">Agent usage documentation and guidelines</file>
  <file path=".claude/context/chart_of_accounts.json">SA creche-specific chart of accounts</file>
  <file path=".claude/context/payee_patterns.json">Transaction categorization patterns</file>
  <file path=".claude/context/fee_structures.json">Common creche fee templates</file>
  <file path=".claude/context/sars_tables_2025.json">2025 PAYE, UIF, VAT tables</file>
  <file path=".claude/context/tenant_config.json">Default tenant configuration</file>
  <file path=".claude/logs/.gitkeep">Ensure logs directory exists</file>
  <file path=".claude/agents/orchestrator/.gitkeep">Orchestrator agent directory</file>
  <file path=".claude/agents/transaction-categorizer/.gitkeep">Categorizer agent directory</file>
  <file path=".claude/agents/payment-matcher/.gitkeep">Payment matcher agent directory</file>
  <file path=".claude/agents/sars-agent/.gitkeep">SARS agent directory</file>
  <file path=".gitignore">Add .claude/logs/*.jsonl to prevent committing logs</file>
</files_to_create>

<files_to_modify>
  <file path=".env.example">
    Add MCP server environment variables:
    - XERO_CLIENT_ID
    - XERO_CLIENT_SECRET
    - XERO_TENANT_ID
    - SMTP_HOST, SMTP_USER, SMTP_PASS
    - WHATSAPP_TOKEN
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>.claude/settings.json is valid JSON and references all three MCP servers</criterion>
  <criterion>All context JSON files parse successfully</criterion>
  <criterion>SARS tax tables match 2025 official rates</criterion>
  <criterion>Chart of accounts follows SA GAAP naming conventions</criterion>
  <criterion>Payee patterns compile as valid regex</criterion>
  <criterion>Log directory is writable</criterion>
  <criterion>Agent directory structure created</criterion>
</validation_criteria>

<test_commands>
  <command>node -c .claude/settings.json</command>
  <command>node -c .claude/context/chart_of_accounts.json</command>
  <command>node -c .claude/context/payee_patterns.json</command>
  <command>node -c .claude/context/sars_tables_2025.json</command>
  <command>test -w .claude/logs</command>
  <command>ls -la .claude/agents/</command>
</test_commands>

</task_spec>
