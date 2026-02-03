export const queryKeys = {
  // Transactions
  transactions: {
    all: ['transactions'] as const,
    lists: () => [...queryKeys.transactions.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.transactions.lists(), params] as const,
    detail: (id: string) => [...queryKeys.transactions.all, 'detail', id] as const,
    suggestions: (id: string) => [...queryKeys.transactions.all, 'suggestions', id] as const,
    byIds: (ids: string[]) => [...queryKeys.transactions.all, 'byIds', ids.sort().join(',')] as const,
  },
  // Invoices
  invoices: {
    all: ['invoices'] as const,
    lists: () => [...queryKeys.invoices.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.invoices.lists(), params] as const,
    detail: (id: string) => [...queryKeys.invoices.all, 'detail', id] as const,
    adhocCharges: (invoiceId: string) => [...queryKeys.invoices.all, 'adhoc-charges', invoiceId] as const,
  },
  // Payments
  payments: {
    all: ['payments'] as const,
    lists: () => [...queryKeys.payments.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.payments.lists(), params] as const,
    detail: (id: string) => [...queryKeys.payments.all, 'detail', id] as const,
    unmatched: () => [...queryKeys.payments.all, 'unmatched'] as const,
    suggestions: (id: string) => [...queryKeys.payments.all, 'suggestions', id] as const,
  },
  // Arrears
  arrears: {
    all: ['arrears'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.arrears.all, 'list', params] as const,
    summary: () => [...queryKeys.arrears.all, 'summary'] as const,
  },
  // Parents & Children
  parents: {
    all: ['parents'] as const,
    lists: () => [...queryKeys.parents.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.parents.lists(), params] as const,
    detail: (id: string) => [...queryKeys.parents.all, 'detail', id] as const,
    children: (parentId: string) => [...queryKeys.parents.all, parentId, 'children'] as const,
  },
  children: {
    all: ['children'] as const,
    lists: () => [...queryKeys.children.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.children.lists(), params] as const,
    detail: (id: string) => [...queryKeys.children.all, 'detail', id] as const,
  },
  // Enrollments (uses children API)
  enrollments: {
    all: ['enrollments'] as const,
    lists: () => [...queryKeys.enrollments.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.enrollments.lists(), params] as const,
    detail: (id: string) => [...queryKeys.enrollments.all, 'detail', id] as const,
  },
  // SARS
  sars: {
    all: ['sars'] as const,
    vat201: (period: string) => [...queryKeys.sars.all, 'vat201', period] as const,
    emp201: (period: string) => [...queryKeys.sars.all, 'emp201', period] as const,
    submissions: () => [...queryKeys.sars.all, 'submissions'] as const,
  },
  // Reconciliation
  reconciliation: {
    all: ['reconciliation'] as const,
    lists: () => [...queryKeys.reconciliation.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.reconciliation.lists(), params] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.reconciliation.all, 'summary', params] as const,
    discrepancies: () => [...queryKeys.reconciliation.all, 'discrepancies'] as const,
  },
  // Staff & Payroll
  staff: {
    all: ['staff'] as const,
    lists: () => [...queryKeys.staff.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.staff.lists(), params] as const,
    detail: (id: string) => [...queryKeys.staff.all, 'detail', id] as const,
  },
  payroll: {
    all: ['payroll'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.payroll.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.payroll.all, 'detail', id] as const,
  },
  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    metrics: (period?: string, year?: number) => [...queryKeys.dashboard.all, 'metrics', period, year] as const,
    trends: (period?: string, year?: number) => [...queryKeys.dashboard.all, 'trends', period, year] as const,
    learningMode: () => [...queryKeys.dashboard.all, 'learning-mode'] as const,
    availablePeriods: () => [...queryKeys.dashboard.all, 'available-periods'] as const,
  },
  // Reports
  reports: {
    all: ['reports'] as const,
    incomeStatement: (params?: Record<string, unknown>) => [...queryKeys.reports.all, 'income-statement', params] as const,
    balanceSheet: (params?: Record<string, unknown>) => [...queryKeys.reports.all, 'balance-sheet', params] as const,
    agedReceivables: () => [...queryKeys.reports.all, 'aged-receivables'] as const,
  },
  // Fee Structures
  feeStructures: {
    all: ['feeStructures'] as const,
    lists: () => [...queryKeys.feeStructures.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.feeStructures.lists(), params] as const,
    detail: (id: string) => [...queryKeys.feeStructures.all, 'detail', id] as const,
  },
  // Users & Tenants
  users: {
    all: ['users'] as const,
    tenantUsers: (tenantId: string) => [...queryKeys.users.all, 'tenant', tenantId] as const,
    invitations: (tenantId: string) => [...queryKeys.users.all, 'invitations', tenantId] as const,
  },
  // Tenant (Organization)
  tenant: {
    all: ['tenant'] as const,
    me: () => [...queryKeys.tenant.all, 'me'] as const,
    detail: (id: string) => [...queryKeys.tenant.all, 'detail', id] as const,
  },
  // Xero Integration
  xero: {
    all: ['xero'] as const,
    status: () => [...queryKeys.xero.all, 'status'] as const,
    syncJobs: () => [...queryKeys.xero.all, 'sync-jobs'] as const,
  },
  // Xero Payroll Journals
  xeroJournals: {
    all: ['xeroJournals'] as const,
    lists: () => [...queryKeys.xeroJournals.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.xeroJournals.lists(), params] as const,
    pending: () => [...queryKeys.xeroJournals.all, 'pending'] as const,
    stats: () => [...queryKeys.xeroJournals.all, 'stats'] as const,
    detail: (id: string) => [...queryKeys.xeroJournals.all, 'detail', id] as const,
  },
  // Statements
  statements: {
    all: ['statements'] as const,
    lists: () => [...queryKeys.statements.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.statements.lists(), params] as const,
    detail: (id: string) => [...queryKeys.statements.all, 'detail', id] as const,
    forParent: (parentId: string) => [...queryKeys.statements.all, 'parent', parentId] as const,
    parentAccount: (parentId: string) => [...queryKeys.statements.all, 'account', parentId] as const,
  },
  // Xero Transaction Splits
  xeroSplits: {
    all: ['xeroSplits'] as const,
    lists: () => [...queryKeys.xeroSplits.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.xeroSplits.lists(), params] as const,
    detail: (id: string) => [...queryKeys.xeroSplits.all, 'detail', id] as const,
    summary: () => [...queryKeys.xeroSplits.all, 'summary'] as const,
    byXeroTransaction: (xeroTxnId: string) => [...queryKeys.xeroSplits.all, 'xero-txn', xeroTxnId] as const,
  },
  // Admin Portal
  admin: {
    all: ['admin'] as const,
    contactSubmissions: () => [...queryKeys.admin.all, 'contact-submissions'] as const,
    demoRequests: () => [...queryKeys.admin.all, 'demo-requests'] as const,
  },
  // Chart of Accounts
  accounts: {
    all: ['accounts'] as const,
    lists: () => [...queryKeys.accounts.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.accounts.lists(), params] as const,
    detail: (id: string) => [...queryKeys.accounts.all, 'detail', id] as const,
    byCode: (code: string) => [...queryKeys.accounts.all, 'byCode', code] as const,
    summary: () => [...queryKeys.accounts.all, 'summary'] as const,
    educationExempt: () => [...queryKeys.accounts.all, 'education-exempt'] as const,
    trialBalance: (asOfDate: string) => [...queryKeys.accounts.all, 'trial-balance', asOfDate] as const,
  },
  // Suppliers
  suppliers: {
    all: ['suppliers'] as const,
    lists: () => [...queryKeys.suppliers.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.suppliers.lists(), params] as const,
    detail: (id: string) => [...queryKeys.suppliers.all, 'detail', id] as const,
    statement: (id: string, params?: Record<string, unknown>) =>
      [...queryKeys.suppliers.all, 'statement', id, params] as const,
    payablesSummary: () => [...queryKeys.suppliers.all, 'payables-summary'] as const,
    bills: (supplierId: string) => [...queryKeys.suppliers.all, 'bills', supplierId] as const,
  },
  // General Ledger
  generalLedger: {
    all: ['general-ledger'] as const,
    lists: () => [...queryKeys.generalLedger.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.generalLedger.lists(), params] as const,
    accountLedger: (accountCode: string, params?: Record<string, unknown>) =>
      [...queryKeys.generalLedger.all, 'account', accountCode, params] as const,
    trialBalance: (asOfDate: string) => [...queryKeys.generalLedger.all, 'trial-balance', asOfDate] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.generalLedger.all, 'summary', params] as const,
  },
  // Quotes
  quotes: {
    all: ['quotes'] as const,
    lists: () => [...queryKeys.quotes.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.quotes.lists(), params] as const,
    detail: (id: string) => [...queryKeys.quotes.all, 'detail', id] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.quotes.all, 'summary', params] as const,
  },
  // Cash Flow
  cashFlow: {
    all: ['cash-flow'] as const,
    statement: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'statement', params] as const,
    trend: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'trend', params] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'summary', params] as const,
  },
  // TASK-FIX-005: Bank Fee Configuration
  bankFees: {
    all: ['bank-fees'] as const,
    config: () => [...queryKeys.bankFees.all, 'config'] as const,
    banks: () => [...queryKeys.bankFees.all, 'banks'] as const,
    bankDefaults: (bankCode: string) => [...queryKeys.bankFees.all, 'defaults', bankCode] as const,
  },
} as const;
