export const endpoints = {
  auth: {
    login: '/auth/login',
    callback: '/auth/callback',
    refresh: '/auth/refresh',
    me: '/auth/me',
  },
  transactions: {
    list: '/transactions',
    detail: (id: string) => `/transactions/${id}`,
    import: '/transactions/import',
    categorize: (id: string) => `/transactions/${id}/categorize`,
    batchCategorize: '/transactions/categorize/batch',
    suggestions: (id: string) => `/transactions/${id}/suggestions`,
  },
  invoices: {
    list: '/invoices',
    detail: (id: string) => `/invoices/${id}`,
    generate: '/invoices/generate',
    send: '/invoices/send',
  },
  payments: {
    list: '/payments',
    detail: (id: string) => `/payments/${id}`,
    match: '/payments/match',
    allocate: (id: string) => `/payments/${id}/allocate`,
    suggestions: (id: string) => `/payments/${id}/suggestions`,
  },
  arrears: {
    list: '/arrears',
    summary: '/arrears/summary',
    sendReminder: '/arrears/reminder',
  },
  parents: {
    list: '/parents',
    detail: (id: string) => `/parents/${id}`,
    children: (id: string) => `/parents/${id}/children`,
  },
  children: {
    list: '/children',
    detail: (id: string) => `/children/${id}`,
    enroll: '/children/enroll',
  },
  sars: {
    vat201: '/sars/vat201',
    emp201: '/sars/emp201',
    submit: (id: string) => `/sars/${id}/submit`,
    submissions: '/sars/submissions',
  },
  reconciliation: {
    reconcile: '/reconciliation',
    summary: '/reconciliation/summary',
    incomeStatement: '/reconciliation/income-statement',
  },
  staff: {
    list: '/staff',
    detail: (id: string) => `/staff/${id}`,
  },
  payroll: {
    list: '/payroll',
    detail: (id: string) => `/payroll/${id}`,
    process: '/payroll/process',
  },
  dashboard: {
    metrics: '/dashboard/metrics',
    trends: '/dashboard/trends',
  },
  feeStructures: {
    list: '/fee-structures',
    detail: (id: string) => `/fee-structures/${id}`,
  },
} as const;
