// SPDX-License-Identifier: MIT
// Declarative spec for the `crechebooks` domain MCP tools. Each entry is ONE
// line of intent; tool-factory.js turns it into a full tool (inputSchema +
// handler + the read/preview/confirm/staging-block safety). Adding a tool =
// adding an entry here — no hand-coded handler or inputSchema.
//
// Fields:
//   name           tool name (mcp__crechebooks__<name>)
//   method         GET (read) | POST|PATCH|PUT (guarded write)
//   path           API path under /api/v1 (path params as :name, filled from args)
//   description    one-line tool description
//   params         { <argName>: { type, in:'query'|'body'|'path', required?,
//                    description?, default?, max?, items? } }
//   write          true for mutations (adds a `confirm` arg + preview-default)
//   parentContact  true if the op contacts parents (hard-blocked on staging)
//
// The read allowlist / write allowlist / parent-contact rules in domain-tools.js
// and mutation-tools.js still apply as defence in depth.

export const DOMAIN_SPEC = [
  // ── reads ──────────────────────────────────────────────────────────────
  {
    name: 'tenant_info',
    method: 'GET',
    path: '/tenants/me',
    description: 'Current tenant (creche) details and settings.',
  },
  {
    name: 'dashboard_metrics',
    method: 'GET',
    path: '/dashboard/metrics',
    description: 'Financial dashboard: revenue invoiced vs collected, arrears, enrollment.',
    params: { period: { type: 'string', in: 'query', description: 'e.g. current-month, last-quarter, ytd.' } },
  },
  {
    name: 'list_invoices',
    method: 'GET',
    path: '/invoices',
    description: 'List invoices, optionally filtered by status.',
    params: {
      status: { type: 'string', in: 'query', description: 'DRAFT | SENT | PAID | OVERDUE …' },
      limit: { type: 'number', in: 'query', description: 'Max rows (default 25, cap 100).', default: 25, max: 100 },
    },
  },
  {
    name: 'list_payments',
    method: 'GET',
    path: '/payments',
    description: 'List payments, optionally filtered by status (e.g. UNALLOCATED).',
    params: { status: { type: 'string', in: 'query', description: 'e.g. UNALLOCATED, ALLOCATED.' } },
  },
  {
    name: 'arrears_report',
    method: 'GET',
    path: '/payments/arrears',
    description: 'Outstanding arrears with aging/debtor detail.',
  },
  {
    name: 'reconciliation_summary',
    method: 'GET',
    path: '/reconciliation/summary',
    description: 'Bank reconciliation status summary per period.',
  },

  {
    name: 'list_transactions',
    method: 'GET',
    path: '/transactions',
    description: 'List bank transactions, optionally filtered by status.',
    params: {
      status: { type: 'string', in: 'query', description: 'PENDING | CATEGORIZED | …' },
      limit: { type: 'number', in: 'query', description: 'Max rows (default 25, cap 100).', default: 25, max: 100 },
    },
  },
  {
    name: 'banking_accounts',
    method: 'GET',
    path: '/banking/accounts',
    description: 'List linked bank accounts.',
  },
  {
    name: 'banking_summary',
    method: 'GET',
    path: '/banking/accounts/summary',
    description: 'Bank account summary (balances across linked accounts).',
  },
  {
    name: 'reconciliation_discrepancies',
    method: 'GET',
    path: '/reconciliation/discrepancies',
    description: 'Outstanding bank-reconciliation discrepancies for review.',
  },
  {
    name: 'income_statement',
    method: 'GET',
    path: '/reconciliation/income-statement',
    description: 'Income statement (revenue vs expenses) for a date range, from reconciled data.',
    params: {
      period_start: { type: 'string', in: 'query', required: true, description: 'ISO 8601 start date, e.g. 2026-03-01.' },
      period_end: { type: 'string', in: 'query', required: true, description: 'ISO 8601 end date, e.g. 2026-03-31.' },
    },
  },

  // ── guarded writes (preview-default; confirm:true to execute) ───────────
  {
    name: 'generate_invoices',
    method: 'POST',
    path: '/invoices/generate',
    description: 'Generate monthly DRAFT invoices for enrolled children (does NOT send them).',
    write: true,
    params: { month: { type: 'string', in: 'body', required: true, description: 'Billing month YYYY-MM, e.g. 2026-06.' } },
  },
  {
    name: 'match_payments',
    method: 'POST',
    path: '/payments/match',
    description: 'Run AI payment matching to allocate unallocated payments to invoices (internal).',
    write: true,
    params: { minConfidence: { type: 'number', in: 'body', description: 'Optional confidence threshold 0–1.' } },
  },
  {
    name: 'allocate_payment',
    method: 'POST',
    path: '/payments',
    description: 'Manually allocate a payment/transaction to one or more invoices (internal). Amounts are decimal ZAR.',
    write: true,
    params: {
      transaction_id: { type: 'string', in: 'body', required: true, description: 'The payment/transaction UUID to allocate.' },
      allocations: {
        type: 'array',
        in: 'body',
        required: true,
        description: 'Array of { invoice_id, amount } — amount in decimal ZAR.',
        items: { type: 'object', properties: { invoice_id: { type: 'string' }, amount: { type: 'number' } }, required: ['invoice_id', 'amount'] },
      },
    },
  },
  {
    name: 'send_invoices',
    method: 'POST',
    path: '/invoices/send',
    description: 'Send invoices to parents (email/WhatsApp). PARENT-CONTACTING — hard-blocked on staging, production-only.',
    write: true,
    parentContact: true,
    params: {
      ids: { type: 'array', in: 'body', description: 'Invoice IDs; omit to send all unsent DRAFTs.', items: { type: 'string' } },
      channel: { type: 'string', in: 'body', description: 'email | whatsapp | both.' },
    },
  },
];
