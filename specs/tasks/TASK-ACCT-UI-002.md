<task_spec id="TASK-ACCT-UI-002" version="2.0">

<metadata>
  <title>General Ledger UI Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>502</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-GL-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-GL-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-002</task_ref>
    <task_ref status="ready">TASK-ACCT-UI-001</task_ref>
    <task_ref status="complete">TASK-WEB-006</task_ref>
    <task_ref status="complete">TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/accounting/general-ledger/page.tsx` (GL Entries List)
  - `apps/web/src/app/(dashboard)/accounting/general-ledger/[accountCode]/page.tsx` (Account Ledger)
  - `apps/web/src/components/accounting/journal-entry-table.tsx` (Journal Entries)
  - `apps/web/src/components/accounting/account-ledger-table.tsx` (Account Transactions)
  - `apps/web/src/components/accounting/gl-date-range-picker.tsx` (Date Range Filter)
  - `apps/web/src/components/accounting/ledger-summary-cards.tsx` (Summary Stats)
  - `apps/web/src/hooks/use-general-ledger.ts` (React Query Hooks)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (ADD general-ledger endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD general-ledger query keys)
  - `apps/web/src/components/layout/sidebar.tsx` (Add GL menu item)

  **Current Problem:**
  - No UI exists for viewing general ledger entries
  - Backend API is complete (GeneralLedgerController at /general-ledger)
  - Tenants cannot view journal entries or account transactions
  - No trial balance visualization exists
  - No ability to drill down from account to transactions

  **Backend API Reference (GeneralLedgerController):**
  - `GET /general-ledger` - Get GL entries (fromDate, toDate, accountCode filters)
  - `GET /general-ledger/account/:accountCode` - Get ledger for specific account
  - `GET /general-ledger/trial-balance` - Get trial balance (asOfDate)
  - `GET /general-ledger/summary` - Get ledger summary

  **Backend DTOs:**
  ```typescript
  interface JournalEntryResponse {
    id: string;
    date: string;
    description: string;
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    sourceType: 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';
    sourceId: string;
    reference?: string;
  }

  interface AccountLedgerResponse {
    accountCode: string;
    accountName: string;
    accountType: string;
    openingBalanceCents: number;
    entries: JournalEntryResponse[];
    closingBalanceCents: number;
  }

  interface TrialBalanceLineResponse {
    accountCode: string;
    accountName: string;
    accountType: string;
    debitBalanceCents: number;
    creditBalanceCents: number;
  }

  interface TrialBalanceResponse {
    asOfDate: string;
    lines: TrialBalanceLineResponse[];
    totalDebitsCents: number;
    totalCreditsCents: number;
    isBalanced: boolean;
  }
  ```

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm dev:web`, `pnpm test`, etc.

  ### 2. API Endpoints Pattern
  ```typescript
  // apps/web/src/lib/api/endpoints.ts - ADD this section
  generalLedger: {
    list: '/general-ledger',
    accountLedger: (accountCode: string) => `/general-ledger/account/${accountCode}`,
    trialBalance: '/general-ledger/trial-balance',
    summary: '/general-ledger/summary',
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
  generalLedger: {
    all: ['general-ledger'] as const,
    lists: () => [...queryKeys.generalLedger.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.generalLedger.lists(), params] as const,
    accountLedger: (accountCode: string, params?: Record<string, unknown>) =>
      [...queryKeys.generalLedger.all, 'account', accountCode, params] as const,
    trialBalance: (asOfDate: string) => [...queryKeys.generalLedger.all, 'trial-balance', asOfDate] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.generalLedger.all, 'summary', params] as const,
  },
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-general-ledger.ts
  import { useQuery } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export type SourceType = 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';

  export interface JournalEntry {
    id: string;
    date: string;
    description: string;
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    sourceType: SourceType;
    sourceId: string;
    reference?: string;
  }

  export interface AccountLedger {
    accountCode: string;
    accountName: string;
    accountType: string;
    openingBalanceCents: number;
    entries: JournalEntry[];
    closingBalanceCents: number;
  }

  export interface TrialBalanceLine {
    accountCode: string;
    accountName: string;
    accountType: string;
    debitBalanceCents: number;
    creditBalanceCents: number;
  }

  export interface TrialBalance {
    asOfDate: string;
    lines: TrialBalanceLine[];
    totalDebitsCents: number;
    totalCreditsCents: number;
    isBalanced: boolean;
  }

  export interface LedgerSummary {
    totalEntries: number;
    totalDebitsCents: number;
    totalCreditsCents: number;
    uniqueAccounts: number;
  }

  export interface GLListParams {
    fromDate: string;
    toDate: string;
    accountCode?: string;
    sourceType?: SourceType;
  }

  // Get general ledger entries
  export function useGeneralLedger(params: GLListParams) {
    return useQuery<JournalEntry[], AxiosError>({
      queryKey: queryKeys.generalLedger.list(params),
      queryFn: async () => {
        const { data } = await apiClient.get<JournalEntry[]>(endpoints.generalLedger.list, {
          params: {
            fromDate: params.fromDate,
            toDate: params.toDate,
            accountCode: params.accountCode,
          },
        });
        return data;
      },
      enabled: !!params.fromDate && !!params.toDate,
    });
  }

  // Get account ledger
  export function useAccountLedger(accountCode: string, fromDate: string, toDate: string) {
    return useQuery<AccountLedger, AxiosError>({
      queryKey: queryKeys.generalLedger.accountLedger(accountCode, { fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<AccountLedger>(
          endpoints.generalLedger.accountLedger(accountCode),
          { params: { fromDate, toDate } }
        );
        return data;
      },
      enabled: !!accountCode && !!fromDate && !!toDate,
    });
  }

  // Get trial balance
  export function useTrialBalance(asOfDate: string) {
    return useQuery<TrialBalance, AxiosError>({
      queryKey: queryKeys.generalLedger.trialBalance(asOfDate),
      queryFn: async () => {
        const { data } = await apiClient.get<TrialBalance>(endpoints.generalLedger.trialBalance, {
          params: { asOfDate },
        });
        return data;
      },
      enabled: !!asOfDate,
    });
  }

  // Get ledger summary
  export function useLedgerSummary(fromDate: string, toDate: string) {
    return useQuery<LedgerSummary, AxiosError>({
      queryKey: queryKeys.generalLedger.summary({ fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<LedgerSummary>(endpoints.generalLedger.summary, {
          params: { fromDate, toDate },
        });
        return data;
      },
      enabled: !!fromDate && !!toDate,
    });
  }
  ```

  ### 5. General Ledger List Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/general-ledger/page.tsx
  'use client';

  import { useState, useMemo } from 'react';
  import Link from 'next/link';
  import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
  import { Calendar, FileSpreadsheet, TrendingUp, TrendingDown } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { DataTable } from '@/components/tables/data-table';
  import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { GLDateRangePicker } from '@/components/accounting/gl-date-range-picker';
  import { LedgerSummaryCards } from '@/components/accounting/ledger-summary-cards';
  import { useGeneralLedger, useLedgerSummary, type SourceType } from '@/hooks/use-general-ledger';
  import { journalEntryColumns } from '@/components/accounting/journal-entry-columns';
  import { formatCentsToZAR } from '@/lib/utils/currency';

  export default function GeneralLedgerPage() {
    const [dateRange, setDateRange] = useState(() => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }));
    const [sourceFilter, setSourceFilter] = useState<SourceType | 'all'>('all');

    const fromDate = format(dateRange.from, 'yyyy-MM-dd');
    const toDate = format(dateRange.to, 'yyyy-MM-dd');

    const { data: entries, isLoading, error } = useGeneralLedger({
      fromDate,
      toDate,
      sourceType: sourceFilter === 'all' ? undefined : sourceFilter,
    });

    const { data: summary } = useLedgerSummary(fromDate, toDate);

    // Calculate totals
    const totals = useMemo(() => {
      if (!entries) return { debits: 0, credits: 0 };
      return entries.reduce(
        (acc, entry) => ({
          debits: acc.debits + entry.debitCents,
          credits: acc.credits + entry.creditCents,
        }),
        { debits: 0, credits: 0 }
      );
    }, [entries]);

    const isBalanced = totals.debits === totals.credits;

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load ledger: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
            <p className="text-muted-foreground">
              View journal entries and account activity
            </p>
          </div>
          <Link href="/accounting/trial-balance">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Trial Balance
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCentsToZAR(totals.debits)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCentsToZAR(totals.credits)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{entries?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {isBalanced ? 'Balanced' : 'Unbalanced'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <GLDateRangePicker value={dateRange} onChange={setDateRange} />
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceType | 'all')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="CATEGORIZATION">Categorization</SelectItem>
                  <SelectItem value="PAYROLL">Payroll</SelectItem>
                  <SelectItem value="INVOICE">Invoice</SelectItem>
                  <SelectItem value="PAYMENT">Payment</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DataTableSkeleton columns={7} rows={10} />
            ) : (
              <DataTable columns={journalEntryColumns} data={entries || []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 6. Journal Entry Columns Pattern
  ```typescript
  // apps/web/src/components/accounting/journal-entry-columns.tsx
  'use client';

  import { ColumnDef } from '@tanstack/react-table';
  import Link from 'next/link';
  import { format } from 'date-fns';
  import { Badge } from '@/components/ui/badge';
  import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { JournalEntry, SourceType } from '@/hooks/use-general-ledger';

  const SOURCE_COLORS: Record<SourceType, string> = {
    CATEGORIZATION: 'bg-blue-100 text-blue-800',
    PAYROLL: 'bg-purple-100 text-purple-800',
    INVOICE: 'bg-green-100 text-green-800',
    PAYMENT: 'bg-amber-100 text-amber-800',
    MANUAL: 'bg-gray-100 text-gray-800',
  };

  export const journalEntryColumns: ColumnDef<JournalEntry>[] = [
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => format(new Date(row.getValue('date')), 'dd/MM/yyyy'),
    },
    {
      accessorKey: 'accountCode',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
      cell: ({ row }) => (
        <Link
          href={`/accounting/general-ledger/${row.original.accountCode}`}
          className="font-mono hover:underline"
        >
          {row.original.accountCode}
        </Link>
      ),
    },
    {
      accessorKey: 'accountName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Account Name" />,
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
      cell: ({ row }) => (
        <div className="max-w-[300px] truncate">{row.getValue('description')}</div>
      ),
    },
    {
      accessorKey: 'debitCents',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Debit" />,
      cell: ({ row }) => {
        const amount = row.getValue('debitCents') as number;
        return amount > 0 ? (
          <span className="font-mono text-right">{formatCentsToZAR(amount)}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'creditCents',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Credit" />,
      cell: ({ row }) => {
        const amount = row.getValue('creditCents') as number;
        return amount > 0 ? (
          <span className="font-mono text-right">{formatCentsToZAR(amount)}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'sourceType',
      header: 'Source',
      cell: ({ row }) => {
        const source = row.getValue('sourceType') as SourceType;
        return (
          <Badge className={SOURCE_COLORS[source]} variant="outline">
            {source}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => {
        const ref = row.getValue('reference') as string | undefined;
        return ref || <span className="text-muted-foreground">-</span>;
      },
    },
  ];
  ```

  ### 7. Account Ledger Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/general-ledger/[accountCode]/page.tsx
  'use client';

  import { useState, use } from 'react';
  import Link from 'next/link';
  import { format, startOfMonth, endOfMonth } from 'date-fns';
  import { ArrowLeft, Calendar } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
  import { DataTable } from '@/components/tables/data-table';
  import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
  import { Badge } from '@/components/ui/badge';
  import { GLDateRangePicker } from '@/components/accounting/gl-date-range-picker';
  import { useAccountLedger } from '@/hooks/use-general-ledger';
  import { journalEntryColumns } from '@/components/accounting/journal-entry-columns';
  import { formatCentsToZAR } from '@/lib/utils/currency';

  export default function AccountLedgerPage({
    params,
  }: {
    params: Promise<{ accountCode: string }>;
  }) {
    const { accountCode } = use(params);
    const [dateRange, setDateRange] = useState(() => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }));

    const fromDate = format(dateRange.from, 'yyyy-MM-dd');
    const toDate = format(dateRange.to, 'yyyy-MM-dd');

    const { data: ledger, isLoading, error } = useAccountLedger(accountCode, fromDate, toDate);

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load account ledger: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/accounting/general-ledger">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Account Ledger: {accountCode}
              </h1>
              <p className="text-muted-foreground">
                {ledger?.accountName || 'Loading...'}
              </p>
            </div>
          </div>
          {ledger && (
            <Badge variant="outline" className="text-lg px-4 py-2">
              {ledger.accountType}
            </Badge>
          )}
        </div>

        {/* Balance Summary */}
        {ledger && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatCentsToZAR(ledger.openingBalanceCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Period Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  {ledger.entries.length} entries
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatCentsToZAR(ledger.closingBalanceCents)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Transactions</CardTitle>
              <GLDateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DataTableSkeleton columns={6} rows={10} />
            ) : (
              <DataTable columns={journalEntryColumns} data={ledger?.entries || []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 8. Trial Balance Table Pattern
  ```typescript
  // apps/web/src/components/accounting/trial-balance-table.tsx
  'use client';

  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
  import { Badge } from '@/components/ui/badge';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { TrialBalance } from '@/hooks/use-general-ledger';

  interface TrialBalanceTableProps {
    data: TrialBalance;
  }

  const ACCOUNT_TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  export function TrialBalanceTable({ data }: TrialBalanceTableProps) {
    // Group by account type
    const groupedLines = ACCOUNT_TYPE_ORDER.map((type) => ({
      type,
      lines: data.lines.filter((l) => l.accountType === type),
    })).filter((g) => g.lines.length > 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">As of {data.asOfDate}</p>
          <Badge variant={data.isBalanced ? 'default' : 'destructive'}>
            {data.isBalanced ? 'Balanced' : 'Not Balanced'}
          </Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead className="text-right w-40">Debit</TableHead>
              <TableHead className="text-right w-40">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedLines.map(({ type, lines }) => (
              <>
                <TableRow key={`header-${type}`} className="bg-muted/50">
                  <TableCell colSpan={4} className="font-semibold">
                    {type}
                  </TableCell>
                </TableRow>
                {lines.map((line) => (
                  <TableRow key={line.accountCode}>
                    <TableCell className="font-mono">{line.accountCode}</TableCell>
                    <TableCell>{line.accountName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {line.debitBalanceCents > 0 ? formatCentsToZAR(line.debitBalanceCents) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {line.creditBalanceCents > 0 ? formatCentsToZAR(line.creditBalanceCents) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-bold">TOTAL</TableCell>
              <TableCell className="text-right font-mono font-bold">
                {formatCentsToZAR(data.totalDebitsCents)}
              </TableCell>
              <TableCell className="text-right font-mono font-bold">
                {formatCentsToZAR(data.totalCreditsCents)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    );
  }
  ```

  ### 9. Currency Formatting Utility
  ```typescript
  // apps/web/src/lib/utils/currency.ts (create if not exists)
  export function formatCentsToZAR(cents: number): string {
    const rands = cents / 100;
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(rands);
  }
  ```

  ### 10. Test Commands
  ```bash
  pnpm dev:web             # Must start without errors
  pnpm build               # Must have 0 errors
  pnpm lint                # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the General Ledger UI for CrecheBooks.

**Business Context:**
1. General Ledger is the core accounting record for all financial transactions
2. Journal entries are created automatically from invoices, payments, payroll, and categorization
3. Each entry has a debit and credit side that must balance
4. Users need to drill down from account to see all transactions
5. Trial balance shows all account balances as of a specific date

**Source Types:**
- CATEGORIZATION: Bank transaction categorization creates GL entries
- PAYROLL: Payroll processing creates salary expense, tax liability entries
- INVOICE: Invoice creation creates accounts receivable entries
- PAYMENT: Payment recording creates cash/bank entries
- MANUAL: Manual journal entries (future feature)

**South African Context:**
- All amounts in ZAR (cents stored, displayed as Rands)
- Tax year runs March to February
- Common month-end date selection needed
</context>

<scope>
  <in_scope>
    - General ledger list page with date range and source filters
    - Account ledger page (drill-down from account code)
    - Trial balance page with balance verification
    - Journal entry data table with sorting
    - Date range picker component
    - Running balance calculations
    - Export to PDF/Excel (print-friendly layout)
    - Color-coded source type badges
  </in_scope>
  <out_of_scope>
    - Manual journal entry creation (future task)
    - Journal entry reversal
    - Period closing/locking
    - Multi-currency support
    - Audit trail viewing (separate feature)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create utility if not exists
# Create/verify apps/web/src/lib/utils/currency.ts

# 3. Create hooks
# Create apps/web/src/hooks/use-general-ledger.ts

# 4. Create components
# Create apps/web/src/components/accounting/journal-entry-columns.tsx
# Create apps/web/src/components/accounting/gl-date-range-picker.tsx
# Create apps/web/src/components/accounting/trial-balance-table.tsx

# 5. Create pages
# Create apps/web/src/app/(dashboard)/accounting/general-ledger/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/general-ledger/[accountCode]/page.tsx

# 6. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values displayed in ZAR format (R 1,234.56)
    - Account codes displayed in monospace font
    - Date range defaults to current month
    - Debit and credit columns properly aligned right
    - Balance status clearly visible (Balanced/Unbalanced)
    - Source type badges are color-coded
    - Loading states during API calls
    - Error states with clear messages
    - Mobile-responsive tables with horizontal scroll
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /accounting/general-ledger loads journal entries
    - Page: /accounting/general-ledger/[code] loads account ledger
    - Filter: Date range filter works correctly
    - Filter: Source type filter works correctly
    - Link: Clicking account code navigates to account ledger
    - Display: Opening, activity, and closing balances shown
    - Display: Trial balance totals match and show balance status
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Display amounts in cents (always convert to Rands for display)
  - Skip loading states during API calls
  - Use left-aligned numbers (always right-align monetary values)
  - Hardcode date formats (use date-fns for formatting)
  - Forget to handle empty states (no entries)
  - Skip error handling for API failures
</anti_patterns>

</task_spec>
