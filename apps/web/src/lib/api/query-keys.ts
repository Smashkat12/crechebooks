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
  // Statements
  statements: {
    all: ['statements'] as const,
    lists: () => [...queryKeys.statements.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.statements.lists(), params] as const,
    detail: (id: string) => [...queryKeys.statements.all, 'detail', id] as const,
    forParent: (parentId: string) => [...queryKeys.statements.all, 'parent', parentId] as const,
    parentAccount: (parentId: string) => [...queryKeys.statements.all, 'account', parentId] as const,
  },
} as const;
