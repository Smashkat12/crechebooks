<task_spec id="TASK-ACCT-UI-001" version="2.0">

<metadata>
  <title>Chart of Accounts UI Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>501</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-COA-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-COA-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-001</task_ref>
    <task_ref status="complete">TASK-WEB-006</task_ref>
    <task_ref status="complete">TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/accounting/accounts/page.tsx` (Account List Page)
  - `apps/web/src/app/(dashboard)/accounting/accounts/new/page.tsx` (Create Account)
  - `apps/web/src/app/(dashboard)/accounting/accounts/[id]/page.tsx` (Account Detail)
  - `apps/web/src/app/(dashboard)/accounting/accounts/[id]/edit/page.tsx` (Edit Account)
  - `apps/web/src/app/(dashboard)/accounting/trial-balance/page.tsx` (Trial Balance)
  - `apps/web/src/components/accounting/account-columns.tsx` (Data Table Columns)
  - `apps/web/src/components/accounting/account-form.tsx` (Create/Edit Form)
  - `apps/web/src/components/accounting/account-type-badge.tsx` (Type Badge)
  - `apps/web/src/components/accounting/trial-balance-table.tsx` (Trial Balance Display)
  - `apps/web/src/hooks/use-accounts.ts` (React Query Hooks)
  - `apps/web/src/lib/api/endpoints.ts` (ADD accounts endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD accounts query keys)

  **Files to Modify:**
  - `apps/web/src/components/layout/sidebar.tsx` (Add Accounting menu)

  **Current Problem:**
  - No UI exists for managing the Chart of Accounts
  - Backend API is complete (ChartOfAccountController at /accounts)
  - Tenants cannot view, create, or edit accounts from the frontend
  - Trial balance view is not available
  - Education VAT exempt accounts (Section 12(h)) need visual flagging

  **Backend API Reference:**
  - `GET /accounts` - List accounts (supports type, isActive, search filters)
  - `GET /accounts/summary` - Get account summary by type
  - `GET /accounts/education-exempt` - Get Section 12(h) accounts
  - `GET /accounts/:id` - Get account by ID
  - `GET /accounts/code/:code` - Get account by code
  - `POST /accounts` - Create account
  - `PATCH /accounts/:id` - Update account
  - `POST /accounts/seed-defaults` - Seed default SA chart of accounts
  - `POST /accounts/:id/deactivate` - Deactivate account
  - `POST /accounts/:id/reactivate` - Reactivate account

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm dev:web`, `pnpm test`, etc.

  ### 2. API Endpoints Pattern
  ```typescript
  // apps/web/src/lib/api/endpoints.ts - ADD this section
  accounts: {
    list: '/accounts',
    detail: (id: string) => `/accounts/${id}`,
    byCode: (code: string) => `/accounts/code/${code}`,
    summary: '/accounts/summary',
    educationExempt: '/accounts/education-exempt',
    seedDefaults: '/accounts/seed-defaults',
    deactivate: (id: string) => `/accounts/${id}/deactivate`,
    reactivate: (id: string) => `/accounts/${id}/reactivate`,
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
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
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-accounts.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  export type AccountSubType =
    | 'BANK' | 'CURRENT_ASSET' | 'FIXED_ASSET'
    | 'CURRENT_LIABILITY' | 'LONG_TERM_LIABILITY'
    | 'EQUITY' | 'OPERATING_REVENUE' | 'OTHER_REVENUE'
    | 'COST_OF_SALES' | 'OPERATING_EXPENSE' | 'OTHER_EXPENSE';

  export interface Account {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    subType: AccountSubType | null;
    description: string | null;
    parentId: string | null;
    isEducationExempt: boolean;
    isSystem: boolean;
    isActive: boolean;
    xeroAccountId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AccountListParams {
    type?: AccountType;
    isActive?: boolean;
    search?: string;
  }

  export interface CreateAccountDto {
    code: string;
    name: string;
    type: AccountType;
    subType?: AccountSubType;
    description?: string;
    parentId?: string;
    isEducationExempt?: boolean;
    xeroAccountId?: string;
  }

  export interface UpdateAccountDto {
    name?: string;
    description?: string;
    subType?: AccountSubType;
    parentId?: string | null;
    isEducationExempt?: boolean;
    isActive?: boolean;
    xeroAccountId?: string;
  }

  // List accounts with filters
  export function useAccountsList(params?: AccountListParams) {
    return useQuery<Account[], AxiosError>({
      queryKey: queryKeys.accounts.list(params),
      queryFn: async () => {
        const { data } = await apiClient.get<Account[]>(endpoints.accounts.list, {
          params: {
            type: params?.type,
            isActive: params?.isActive,
            search: params?.search,
          },
        });
        return data;
      },
    });
  }

  // Get single account
  export function useAccount(id: string, enabled = true) {
    return useQuery<Account, AxiosError>({
      queryKey: queryKeys.accounts.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<Account>(endpoints.accounts.detail(id));
        return data;
      },
      enabled: enabled && !!id,
    });
  }

  // Get account summary
  export function useAccountSummary() {
    return useQuery<{ type: AccountType; count: number; activeCount: number }[], AxiosError>({
      queryKey: queryKeys.accounts.summary(),
      queryFn: async () => {
        const { data } = await apiClient.get(endpoints.accounts.summary);
        return data;
      },
    });
  }

  // Create account
  export function useCreateAccount() {
    const queryClient = useQueryClient();

    return useMutation<Account, AxiosError, CreateAccountDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.post<Account>(endpoints.accounts.list, dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      },
    });
  }

  // Update account
  export function useUpdateAccount(id: string) {
    const queryClient = useQueryClient();

    return useMutation<Account, AxiosError, UpdateAccountDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.patch<Account>(endpoints.accounts.detail(id), dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.detail(id) });
      },
    });
  }

  // Deactivate/Reactivate account
  export function useDeactivateAccount() {
    const queryClient = useQueryClient();

    return useMutation<Account, AxiosError, string>({
      mutationFn: async (id) => {
        const { data } = await apiClient.post<Account>(endpoints.accounts.deactivate(id));
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      },
    });
  }

  export function useReactivateAccount() {
    const queryClient = useQueryClient();

    return useMutation<Account, AxiosError, string>({
      mutationFn: async (id) => {
        const { data } = await apiClient.post<Account>(endpoints.accounts.reactivate(id));
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      },
    });
  }

  // Seed default accounts
  export function useSeedDefaultAccounts() {
    const queryClient = useQueryClient();

    return useMutation<void, AxiosError>({
      mutationFn: async () => {
        await apiClient.post(endpoints.accounts.seedDefaults);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
      },
    });
  }
  ```

  ### 5. Page Component Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/accounts/page.tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { Plus, BookOpen, RefreshCw } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { DataTable } from '@/components/tables/data-table';
  import { Input } from '@/components/ui/input';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { useAccountsList, useSeedDefaultAccounts, type AccountType } from '@/hooks/use-accounts';
  import { accountColumns } from '@/components/accounting/account-columns';
  import { useToast } from '@/hooks/use-toast';
  import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';

  export default function AccountsPage() {
    const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
    const [search, setSearch] = useState('');
    const { toast } = useToast();

    const { data: accounts, isLoading, error } = useAccountsList({
      type: typeFilter === 'all' ? undefined : typeFilter,
      search: search || undefined,
    });

    const seedDefaults = useSeedDefaultAccounts();

    const handleSeedDefaults = () => {
      seedDefaults.mutate(undefined, {
        onSuccess: () => {
          toast({
            title: 'Default accounts created',
            description: 'South African chart of accounts has been seeded',
          });
        },
        onError: (error) => {
          toast({
            title: 'Failed to seed accounts',
            description: error.message,
            variant: 'destructive',
          });
        },
      });
    };

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load accounts: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
            <p className="text-muted-foreground">
              Manage your account structure for financial reporting
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSeedDefaults} disabled={seedDefaults.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${seedDefaults.isPending ? 'animate-spin' : ''}`} />
              Seed Defaults
            </Button>
            <Link href="/accounting/accounts/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AccountType | 'all')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="ASSET">Assets</SelectItem>
                  <SelectItem value="LIABILITY">Liabilities</SelectItem>
                  <SelectItem value="EQUITY">Equity</SelectItem>
                  <SelectItem value="REVENUE">Revenue</SelectItem>
                  <SelectItem value="EXPENSE">Expenses</SelectItem>
                </SelectContent>
              </Select>
              <Link href="/accounting/trial-balance">
                <Button variant="outline">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Trial Balance
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DataTableSkeleton columns={6} rows={10} />
            ) : (
              <DataTable columns={accountColumns} data={accounts || []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 6. Data Table Columns Pattern
  ```typescript
  // apps/web/src/components/accounting/account-columns.tsx
  'use client';

  import { ColumnDef } from '@tanstack/react-table';
  import Link from 'next/link';
  import { MoreHorizontal, Pencil, Eye, XCircle, CheckCircle } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Badge } from '@/components/ui/badge';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
  import { AccountTypeBadge } from './account-type-badge';
  import type { Account } from '@/hooks/use-accounts';

  export const accountColumns: ColumnDef<Account>[] = [
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <Link href={`/accounting/accounts/${row.original.id}`} className="font-mono font-medium hover:underline">
          {row.getValue('code')}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.getValue('name')}</span>
          {row.original.isEducationExempt && (
            <Badge variant="outline" className="text-xs">VAT Exempt</Badge>
          )}
          {row.original.isSystem && (
            <Badge variant="secondary" className="text-xs">System</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => <AccountTypeBadge type={row.getValue('type')} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'subType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sub Type" />,
      cell: ({ row }) => {
        const subType = row.getValue('subType') as string | null;
        return subType ? (
          <span className="text-sm text-muted-foreground">
            {subType.replace(/_/g, ' ')}
          </span>
        ) : '-';
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const account = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/accounts/${account.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {!account.isSystem && (
                <DropdownMenuItem asChild>
                  <Link href={`/accounting/accounts/${account.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  ```

  ### 7. Account Form Component
  ```typescript
  // apps/web/src/components/accounting/account-form.tsx
  'use client';

  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { z } from 'zod';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Textarea } from '@/components/ui/textarea';
  import { Checkbox } from '@/components/ui/checkbox';
  import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
  import type { Account, AccountType, AccountSubType, CreateAccountDto, UpdateAccountDto } from '@/hooks/use-accounts';

  const accountFormSchema = z.object({
    code: z.string().min(1, 'Account code is required').max(20),
    name: z.string().min(1, 'Account name is required').max(200),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
    subType: z.string().optional(),
    description: z.string().optional(),
    parentId: z.string().optional(),
    isEducationExempt: z.boolean().default(false),
  });

  type AccountFormValues = z.infer<typeof accountFormSchema>;

  interface AccountFormProps {
    account?: Account;
    accounts?: Account[]; // For parent selection
    onSubmit: (data: CreateAccountDto | UpdateAccountDto) => void;
    isLoading?: boolean;
    mode: 'create' | 'edit';
  }

  const ACCOUNT_SUB_TYPES: Record<AccountType, { value: AccountSubType; label: string }[]> = {
    ASSET: [
      { value: 'BANK', label: 'Bank' },
      { value: 'CURRENT_ASSET', label: 'Current Asset' },
      { value: 'FIXED_ASSET', label: 'Fixed Asset' },
    ],
    LIABILITY: [
      { value: 'CURRENT_LIABILITY', label: 'Current Liability' },
      { value: 'LONG_TERM_LIABILITY', label: 'Long-term Liability' },
    ],
    EQUITY: [{ value: 'EQUITY', label: 'Equity' }],
    REVENUE: [
      { value: 'OPERATING_REVENUE', label: 'Operating Revenue' },
      { value: 'OTHER_REVENUE', label: 'Other Revenue' },
    ],
    EXPENSE: [
      { value: 'COST_OF_SALES', label: 'Cost of Sales' },
      { value: 'OPERATING_EXPENSE', label: 'Operating Expense' },
      { value: 'OTHER_EXPENSE', label: 'Other Expense' },
    ],
  };

  export function AccountForm({ account, accounts, onSubmit, isLoading, mode }: AccountFormProps) {
    const form = useForm<AccountFormValues>({
      resolver: zodResolver(accountFormSchema),
      defaultValues: {
        code: account?.code || '',
        name: account?.name || '',
        type: account?.type || 'EXPENSE',
        subType: account?.subType || undefined,
        description: account?.description || '',
        parentId: account?.parentId || undefined,
        isEducationExempt: account?.isEducationExempt || false,
      },
    });

    const selectedType = form.watch('type');
    const availableSubTypes = ACCOUNT_SUB_TYPES[selectedType] || [];
    const availableParents = accounts?.filter(a => a.type === selectedType && a.id !== account?.id) || [];

    const handleSubmit = (data: AccountFormValues) => {
      onSubmit(data as CreateAccountDto | UpdateAccountDto);
    };

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., 4000" disabled={mode === 'edit'} />
                  </FormControl>
                  <FormDescription>Unique code for this account (e.g., 1000, 4100)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Tuition Fees" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={mode === 'edit'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ASSET">Asset</SelectItem>
                      <SelectItem value="LIABILITY">Liability</SelectItem>
                      <SelectItem value="EQUITY">Equity</SelectItem>
                      <SelectItem value="REVENUE">Revenue</SelectItem>
                      <SelectItem value="EXPENSE">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sub Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select sub type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableSubTypes.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {availableParents.length > 0 && (
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Account (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableParents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          {parent.code} - {parent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Group this account under a parent</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Describe this account's purpose" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {selectedType === 'REVENUE' && (
            <FormField
              control={form.control}
              name="isEducationExempt"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>VAT Exempt (Section 12(h))</FormLabel>
                    <FormDescription>
                      Education services are exempt from VAT under SARS Section 12(h).
                      Enable for tuition, registration, and educational fees.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : mode === 'create' ? 'Create Account' : 'Update Account'}
            </Button>
          </div>
        </form>
      </Form>
    );
  }
  ```

  ### 8. Test Commands
  ```bash
  pnpm dev:web             # Must start without errors
  pnpm build               # Must have 0 errors
  pnpm lint                # Must have 0 errors/warnings
  pnpm test --runInBand    # Must pass all tests
  ```
</critical_patterns>

<context>
This task creates the Chart of Accounts UI for CrecheBooks.

**Business Context:**
1. Each creche needs to manage their account structure for financial reporting
2. Default SA chart of accounts can be seeded for new tenants
3. Education-exempt accounts must be visually flagged (Section 12(h) VAT)
4. System accounts cannot be edited (only deactivated)
5. Accounts are hierarchical (parent-child relationships)
6. Trial balance view needed for month-end reconciliation

**South African Context:**
- Currency: South African Rand (ZAR)
- Tax Authority: SARS
- Education services are VAT exempt under Section 12(h)
- Default accounts include PAYE, UIF, SDL payables
</context>

<scope>
  <in_scope>
    - Account list page with search and type filter
    - Create account page with form validation
    - Edit account page (for non-system accounts)
    - Account detail view page
    - Trial balance view page
    - React Query hooks for all API operations
    - Data table with sorting and filtering
    - Account type color-coded badges
    - Education exempt visual indicator
    - Seed defaults button for new tenants
  </in_scope>
  <out_of_scope>
    - Backend API (TASK-ACCT-001, already complete)
    - Journal entry creation (TASK-ACCT-UI-002)
    - Cash flow pages (TASK-ACCT-UI-003)
    - Bulk account import/export
    - Account archiving/deletion
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-accounts.ts

# 3. Create components
# Create apps/web/src/components/accounting/account-columns.tsx
# Create apps/web/src/components/accounting/account-form.tsx
# Create apps/web/src/components/accounting/account-type-badge.tsx
# Create apps/web/src/components/accounting/trial-balance-table.tsx

# 4. Create pages
# Create apps/web/src/app/(dashboard)/accounting/accounts/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/accounts/new/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/accounts/[id]/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/accounts/[id]/edit/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/trial-balance/page.tsx

# 5. Update sidebar navigation
# Edit apps/web/src/components/layout/sidebar.tsx

# 6. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values displayed in ZAR format (R 1,234.56)
    - Account codes are displayed in monospace font
    - Education exempt accounts have visible badge
    - System accounts have "System" badge and cannot be edited
    - Form validation matches backend DTO constraints
    - Loading states shown during API calls
    - Error states with clear messages
    - Mobile-responsive design
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /accounting/accounts loads account list
    - Page: /accounting/accounts/new shows create form
    - Page: /accounting/accounts/:id shows account detail
    - Page: /accounting/accounts/:id/edit shows edit form (non-system only)
    - Page: /accounting/trial-balance shows trial balance
    - Filter: Type filter works correctly
    - Filter: Search filter works correctly
    - Action: Seed defaults creates accounts
    - Action: Create account succeeds with valid data
    - Action: Update account succeeds with valid data
    - Action: Deactivate/reactivate works correctly
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip loading states during API calls
  - Allow editing system accounts (isSystem = true)
  - Show edit button for system accounts
  - Mix snake_case and camelCase in frontend (use camelCase)
  - Forget to handle API errors gracefully
  - Skip form validation
  - Allow duplicate account codes (backend validates)
</anti_patterns>

</task_spec>
