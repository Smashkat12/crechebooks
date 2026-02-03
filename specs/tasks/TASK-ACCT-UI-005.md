<task_spec id="TASK-ACCT-UI-005" version="2.0">

<metadata>
  <title>Quote System UI Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>505</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-QUOTE-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-QUOTE-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-012</task_ref>
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
  - `apps/web/src/app/(dashboard)/accounting/quotes/page.tsx` (Quote List)
  - `apps/web/src/app/(dashboard)/accounting/quotes/new/page.tsx` (Create Quote)
  - `apps/web/src/app/(dashboard)/accounting/quotes/[id]/page.tsx` (Quote Detail)
  - `apps/web/src/app/(dashboard)/accounting/quotes/[id]/edit/page.tsx` (Edit Quote)
  - `apps/web/src/components/accounting/quote-columns.tsx` (Data Table Columns)
  - `apps/web/src/components/accounting/quote-form.tsx` (Create/Edit Form)
  - `apps/web/src/components/accounting/quote-preview.tsx` (PDF Preview)
  - `apps/web/src/components/accounting/quote-status-badge.tsx` (Status Badge)
  - `apps/web/src/components/accounting/quote-actions.tsx` (Action Buttons)
  - `apps/web/src/hooks/use-quotes.ts` (React Query Hooks)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (ADD quotes endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD quotes query keys)
  - `apps/web/src/components/layout/sidebar.tsx` (Add Quotes menu item)

  **Current Problem:**
  - No UI exists for managing quotes
  - Backend API is complete (QuoteController at /quotes)
  - Tenants cannot create or send quotes to prospective parents
  - No quote tracking or conversion to enrollment workflow
  - No quote summary/analytics view

  **Backend API Reference (QuoteController):**
  - `GET /quotes` - List quotes (status, parentId, recipientEmail, limit, offset)
  - `GET /quotes/:id` - Get quote by ID
  - `GET /quotes/summary` - Get quotes summary (fromDate, toDate)
  - `POST /quotes` - Create quote
  - `PATCH /quotes/:id` - Update quote
  - `POST /quotes/:id/send` - Send quote to recipient
  - `POST /quotes/:id/accept` - Mark quote as accepted
  - `POST /quotes/:id/decline` - Mark quote as declined
  - `POST /quotes/:id/convert` - Convert accepted quote to enrollment

  **Backend DTOs:**
  ```typescript
  interface CreateQuoteLineDto {
    description: string;
    quantity?: number;
    unitPriceCents: number;
    vatType?: string;
    feeStructureId?: string;
    lineType?: string;
    accountId?: string;
  }

  interface CreateQuoteDto {
    recipientName: string;
    recipientEmail: string;
    recipientPhone?: string;
    parentId?: string;
    childName?: string;
    childDob?: string;
    expectedStartDate?: string;
    validityDays?: number;
    notes?: string;
    lines: CreateQuoteLineDto[];
  }

  interface QuoteResponse {
    id: string;
    quoteNumber: string;
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string | null;
    parentId: string | null;
    childName: string | null;
    childDob: Date | null;
    expectedStartDate: Date | null;
    quoteDate: Date;
    expiryDate: Date;
    validityDays: number;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    status: 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED';
    sentAt: Date | null;
    viewedAt: Date | null;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    declineReason: string | null;
    convertedToInvoiceId: string | null;
    notes: string | null;
    lines: QuoteLineResponse[];
    createdAt: Date;
  }

  interface QuoteSummaryResponse {
    totalQuotes: number;
    draftCount: number;
    sentCount: number;
    acceptedCount: number;
    declinedCount: number;
    expiredCount: number;
    convertedCount: number;
    totalValueCents: number;
    pendingValueCents: number;
    conversionRate: number;
  }
  ```

  **Quote Status Flow:**
  DRAFT -> SENT -> VIEWED -> ACCEPTED -> CONVERTED
                         \-> DECLINED
                         \-> EXPIRED

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm dev:web`, `pnpm test`, etc.

  ### 2. API Endpoints Pattern
  ```typescript
  // apps/web/src/lib/api/endpoints.ts - ADD this section
  quotes: {
    list: '/quotes',
    detail: (id: string) => `/quotes/${id}`,
    summary: '/quotes/summary',
    send: (id: string) => `/quotes/${id}/send`,
    accept: (id: string) => `/quotes/${id}/accept`,
    decline: (id: string) => `/quotes/${id}/decline`,
    convert: (id: string) => `/quotes/${id}/convert`,
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
  quotes: {
    all: ['quotes'] as const,
    lists: () => [...queryKeys.quotes.all, 'list'] as const,
    list: (params?: Record<string, unknown>) => [...queryKeys.quotes.lists(), params] as const,
    detail: (id: string) => [...queryKeys.quotes.all, 'detail', id] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.quotes.all, 'summary', params] as const,
  },
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-quotes.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export type QuoteStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED';

  export interface QuoteLine {
    id: string;
    lineNumber: number;
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    vatType: string;
    feeStructureId: string | null;
    lineType: string | null;
  }

  export interface Quote {
    id: string;
    quoteNumber: string;
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string | null;
    parentId: string | null;
    childName: string | null;
    childDob: Date | null;
    expectedStartDate: Date | null;
    quoteDate: Date;
    expiryDate: Date;
    validityDays: number;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    status: QuoteStatus;
    sentAt: Date | null;
    viewedAt: Date | null;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    declineReason: string | null;
    convertedToInvoiceId: string | null;
    notes: string | null;
    lines: QuoteLine[];
    createdAt: Date;
  }

  export interface QuoteSummary {
    totalQuotes: number;
    draftCount: number;
    sentCount: number;
    acceptedCount: number;
    declinedCount: number;
    expiredCount: number;
    convertedCount: number;
    totalValueCents: number;
    pendingValueCents: number;
    conversionRate: number;
  }

  export interface CreateQuoteLineDto {
    description: string;
    quantity?: number;
    unitPriceCents: number;
    vatType?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
    feeStructureId?: string;
    lineType?: string;
    accountId?: string;
  }

  export interface CreateQuoteDto {
    recipientName: string;
    recipientEmail: string;
    recipientPhone?: string;
    parentId?: string;
    childName?: string;
    childDob?: string;
    expectedStartDate?: string;
    validityDays?: number;
    notes?: string;
    lines: CreateQuoteLineDto[];
  }

  export interface UpdateQuoteDto {
    recipientName?: string;
    recipientEmail?: string;
    recipientPhone?: string;
    childName?: string;
    childDob?: string;
    expectedStartDate?: string;
    validityDays?: number;
    notes?: string;
  }

  export interface QuoteListParams {
    status?: QuoteStatus;
    parentId?: string;
    recipientEmail?: string;
    limit?: number;
    offset?: number;
  }

  // List quotes
  export function useQuotesList(params?: QuoteListParams) {
    return useQuery<Quote[], AxiosError>({
      queryKey: queryKeys.quotes.list(params),
      queryFn: async () => {
        const { data } = await apiClient.get<Quote[]>(endpoints.quotes.list, { params });
        return data;
      },
    });
  }

  // Get single quote
  export function useQuote(id: string, enabled = true) {
    return useQuery<Quote, AxiosError>({
      queryKey: queryKeys.quotes.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<Quote>(endpoints.quotes.detail(id));
        return data;
      },
      enabled: enabled && !!id,
    });
  }

  // Get quotes summary
  export function useQuoteSummary(fromDate?: string, toDate?: string) {
    return useQuery<QuoteSummary, AxiosError>({
      queryKey: queryKeys.quotes.summary({ fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<QuoteSummary>(endpoints.quotes.summary, {
          params: { fromDate, toDate },
        });
        return data;
      },
    });
  }

  // Create quote
  export function useCreateQuote() {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, CreateQuoteDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.post<Quote>(endpoints.quotes.list, dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
      },
    });
  }

  // Update quote
  export function useUpdateQuote(id: string) {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, UpdateQuoteDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.patch<Quote>(endpoints.quotes.detail(id), dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      },
    });
  }

  // Send quote
  export function useSendQuote() {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, string>({
      mutationFn: async (id) => {
        const { data } = await apiClient.post<Quote>(endpoints.quotes.send(id));
        return data;
      },
      onSuccess: (_, id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      },
    });
  }

  // Accept quote
  export function useAcceptQuote() {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, string>({
      mutationFn: async (id) => {
        const { data } = await apiClient.post<Quote>(endpoints.quotes.accept(id));
        return data;
      },
      onSuccess: (_, id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      },
    });
  }

  // Decline quote
  export function useDeclineQuote() {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, { id: string; reason?: string }>({
      mutationFn: async ({ id, reason }) => {
        const { data } = await apiClient.post<Quote>(endpoints.quotes.decline(id), { reason });
        return data;
      },
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      },
    });
  }

  // Convert quote to enrollment
  export function useConvertQuote() {
    const queryClient = useQueryClient();

    return useMutation<Quote, AxiosError, { id: string; dueDate?: string; notes?: string }>({
      mutationFn: async ({ id, dueDate, notes }) => {
        const { data } = await apiClient.post<Quote>(endpoints.quotes.convert(id), { dueDate, notes });
        return data;
      },
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(id) });
      },
    });
  }
  ```

  ### 5. Quote List Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/quotes/page.tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { Plus, FileText, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { DataTable } from '@/components/tables/data-table';
  import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { useQuotesList, useQuoteSummary, type QuoteStatus } from '@/hooks/use-quotes';
  import { quoteColumns } from '@/components/accounting/quote-columns';
  import { formatCentsToZAR } from '@/lib/utils/currency';

  export default function QuotesPage() {
    const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');

    const { data: quotes, isLoading, error } = useQuotesList({
      status: statusFilter === 'all' ? undefined : statusFilter,
    });

    const { data: summary } = useQuoteSummary();

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load quotes: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
            <p className="text-muted-foreground">
              Send fee quotes to prospective parents
            </p>
          </div>
          <Link href="/accounting/quotes/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Quote
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatCentsToZAR(summary.totalValueCents)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.totalQuotes} quotes
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600">
                  {formatCentsToZAR(summary.pendingValueCents)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.sentCount} sent, {summary.draftCount} drafts
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accepted</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {summary.acceptedCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.convertedCount} converted
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Declined</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {summary.declinedCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.expiredCount} expired
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summary.conversionRate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Quotes to enrollments
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quotes Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | 'all')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="VIEWED">Viewed</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="DECLINED">Declined</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="CONVERTED">Converted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DataTableSkeleton columns={7} rows={10} />
            ) : (
              <DataTable columns={quoteColumns} data={quotes || []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 6. Quote Columns Pattern
  ```typescript
  // apps/web/src/components/accounting/quote-columns.tsx
  'use client';

  import { ColumnDef } from '@tanstack/react-table';
  import Link from 'next/link';
  import { format } from 'date-fns';
  import { MoreHorizontal, Eye, Send, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
  import { QuoteStatusBadge } from './quote-status-badge';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { Quote } from '@/hooks/use-quotes';

  export const quoteColumns: ColumnDef<Quote>[] = [
    {
      accessorKey: 'quoteNumber',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Quote #" />,
      cell: ({ row }) => (
        <Link href={`/accounting/quotes/${row.original.id}`} className="font-medium hover:underline">
          {row.getValue('quoteNumber')}
        </Link>
      ),
    },
    {
      accessorKey: 'recipientName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recipient" />,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.recipientName}</div>
          <div className="text-sm text-muted-foreground">{row.original.recipientEmail}</div>
        </div>
      ),
    },
    {
      accessorKey: 'childName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Child" />,
      cell: ({ row }) => row.original.childName || <span className="text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'quoteDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => format(new Date(row.getValue('quoteDate')), 'dd MMM yyyy'),
    },
    {
      accessorKey: 'expiryDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
      cell: ({ row }) => {
        const expiry = new Date(row.getValue('expiryDate'));
        const isExpired = expiry < new Date();
        return (
          <span className={isExpired ? 'text-red-600' : ''}>
            {format(expiry, 'dd MMM yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'totalCents',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <span className="font-mono">{formatCentsToZAR(row.getValue('totalCents'))}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <QuoteStatusBadge status={row.getValue('status')} />,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const quote = row.original;
        const canSend = quote.status === 'DRAFT';
        const canAccept = quote.status === 'SENT' || quote.status === 'VIEWED';
        const canConvert = quote.status === 'ACCEPTED';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/quotes/${quote.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canSend && (
                <DropdownMenuItem asChild>
                  <Link href={`/accounting/quotes/${quote.id}?action=send`}>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Link>
                </DropdownMenuItem>
              )}
              {canAccept && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/quotes/${quote.id}?action=accept`}>
                      <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                      Mark Accepted
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/quotes/${quote.id}?action=decline`}>
                      <XCircle className="mr-2 h-4 w-4 text-red-600" />
                      Mark Declined
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              {canConvert && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/quotes/${quote.id}?action=convert`}>
                      <ArrowRight className="mr-2 h-4 w-4 text-blue-600" />
                      Convert to Enrollment
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
  ```

  ### 7. Quote Status Badge Pattern
  ```typescript
  // apps/web/src/components/accounting/quote-status-badge.tsx
  import { Badge } from '@/components/ui/badge';
  import type { QuoteStatus } from '@/hooks/use-quotes';

  interface QuoteStatusBadgeProps {
    status: QuoteStatus;
  }

  const STATUS_CONFIG: Record<QuoteStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    DRAFT: { label: 'Draft', variant: 'secondary' },
    SENT: { label: 'Sent', variant: 'outline' },
    VIEWED: { label: 'Viewed', variant: 'outline' },
    ACCEPTED: { label: 'Accepted', variant: 'default' },
    DECLINED: { label: 'Declined', variant: 'destructive' },
    EXPIRED: { label: 'Expired', variant: 'secondary' },
    CONVERTED: { label: 'Converted', variant: 'default' },
  };

  export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
    const config = STATUS_CONFIG[status];

    return (
      <Badge variant={config.variant}>
        {config.label}
      </Badge>
    );
  }
  ```

  ### 8. Quote Form Pattern
  ```typescript
  // apps/web/src/components/accounting/quote-form.tsx
  'use client';

  import { useFieldArray, useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { z } from 'zod';
  import { Plus, Trash2 } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Textarea } from '@/components/ui/textarea';
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
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { Quote, CreateQuoteDto } from '@/hooks/use-quotes';
  import type { FeeStructure } from '@/hooks/use-fee-structures';

  const quoteLineSchema = z.object({
    description: z.string().min(1, 'Description required'),
    quantity: z.coerce.number().min(1).default(1),
    unitPriceCents: z.coerce.number().min(0),
    vatType: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT']).default('EXEMPT'),
    feeStructureId: z.string().optional(),
  });

  const quoteFormSchema = z.object({
    recipientName: z.string().min(1, 'Recipient name is required'),
    recipientEmail: z.string().email('Valid email required'),
    recipientPhone: z.string().optional(),
    childName: z.string().optional(),
    childDob: z.string().optional(),
    expectedStartDate: z.string().optional(),
    validityDays: z.coerce.number().min(1).default(30),
    notes: z.string().optional(),
    lines: z.array(quoteLineSchema).min(1, 'At least one line item required'),
  });

  type QuoteFormValues = z.infer<typeof quoteFormSchema>;

  interface QuoteFormProps {
    quote?: Quote;
    feeStructures?: FeeStructure[];
    onSubmit: (data: CreateQuoteDto) => void;
    isLoading?: boolean;
    mode: 'create' | 'edit';
  }

  export function QuoteForm({ quote, feeStructures, onSubmit, isLoading, mode }: QuoteFormProps) {
    const form = useForm<QuoteFormValues>({
      resolver: zodResolver(quoteFormSchema),
      defaultValues: {
        recipientName: quote?.recipientName || '',
        recipientEmail: quote?.recipientEmail || '',
        recipientPhone: quote?.recipientPhone || '',
        childName: quote?.childName || '',
        childDob: quote?.childDob ? new Date(quote.childDob).toISOString().split('T')[0] : '',
        expectedStartDate: quote?.expectedStartDate ? new Date(quote.expectedStartDate).toISOString().split('T')[0] : '',
        validityDays: quote?.validityDays || 30,
        notes: quote?.notes || '',
        lines: quote?.lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          vatType: l.vatType as 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT',
          feeStructureId: l.feeStructureId || undefined,
        })) || [{ description: '', quantity: 1, unitPriceCents: 0, vatType: 'EXEMPT' as const }],
      },
    });

    const { fields, append, remove } = useFieldArray({
      control: form.control,
      name: 'lines',
    });

    const lines = form.watch('lines');

    // Add fee structure as line
    const addFeeStructure = (fs: FeeStructure) => {
      append({
        description: fs.name,
        quantity: 1,
        unitPriceCents: fs.monthlyFeeCents,
        vatType: fs.isEducationExempt ? 'EXEMPT' : 'STANDARD',
        feeStructureId: fs.id,
      });
    };

    // Calculate totals (education services are VAT exempt)
    const subtotalCents = lines.reduce((sum, line) => {
      return sum + (line.unitPriceCents || 0) * (line.quantity || 1);
    }, 0);

    const vatCents = lines.reduce((sum, line) => {
      const lineTotal = (line.unitPriceCents || 0) * (line.quantity || 1);
      if (line.vatType === 'STANDARD') {
        return sum + Math.round(lineTotal * 0.15);
      }
      return sum;
    }, 0);

    const totalCents = subtotalCents + vatCents;

    const handleSubmit = (data: QuoteFormValues) => {
      onSubmit(data as CreateQuoteDto);
    };

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Recipient Information */}
          <Card>
            <CardHeader>
              <CardTitle>Recipient Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="recipientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Parent name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recipientEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="parent@email.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recipientPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="082 123 4567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Child Information */}
          <Card>
            <CardHeader>
              <CardTitle>Child Information (for Enrollment)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="childName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Child Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Child's name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="childDob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedStartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Start Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quote Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="validityDays"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>Valid For (Days)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} />
                    </FormControl>
                    <FormDescription>Quote expires after this many days</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Fee Breakdown</CardTitle>
                <div className="flex gap-2">
                  {feeStructures && feeStructures.length > 0 && (
                    <Select onValueChange={(id) => {
                      const fs = feeStructures.find(f => f.id === id);
                      if (fs) addFeeStructure(fs);
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Add fee structure" />
                      </SelectTrigger>
                      <SelectContent>
                        {feeStructures.map((fs) => (
                          <SelectItem key={fs.id} value={fs.id}>
                            {fs.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ description: '', quantity: 1, unitPriceCents: 0, vatType: 'EXEMPT' })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Description</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-32">Amount (cents)</TableHead>
                    <TableHead className="w-32">VAT Type</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const lineTotal = (lines[index]?.unitPriceCents || 0) * (lines[index]?.quantity || 1);
                    return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} placeholder="Item description" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} type="number" min={1} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.unitPriceCents`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} type="number" min={0} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.vatType`}
                            render={({ field }) => (
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="EXEMPT">Exempt (Education)</SelectItem>
                                  <SelectItem value="STANDARD">15% VAT</SelectItem>
                                  <SelectItem value="ZERO_RATED">0% (Zero)</SelectItem>
                                  <SelectItem value="NO_VAT">No VAT</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCentsToZAR(lineTotal)}
                        </TableCell>
                        <TableCell>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right">Subtotal</TableCell>
                    <TableCell className="text-right font-mono">{formatCentsToZAR(subtotalCents)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right">VAT</TableCell>
                    <TableCell className="text-right font-mono">{formatCentsToZAR(vatCents)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">Total</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatCentsToZAR(totalCents)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Terms & Conditions</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Terms, conditions, and additional notes..." rows={4} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : mode === 'create' ? 'Create Quote' : 'Update Quote'}
            </Button>
          </div>
        </form>
      </Form>
    );
  }
  ```

  ### 9. Test Commands
  ```bash
  pnpm dev:web             # Must start without errors
  pnpm build               # Must have 0 errors
  pnpm lint                # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the Quote System UI for CrecheBooks.

**Business Context:**
1. Creches send quotes to prospective parents before enrollment
2. Quotes include fee breakdown (tuition, registration, meals, etc.)
3. Accepted quotes convert to parent registration and first invoice
4. Quote tracking helps measure marketing effectiveness
5. Expiry dates create urgency for decision-making

**Quote Lifecycle:**
1. DRAFT - Quote created but not sent
2. SENT - Quote emailed to prospective parent
3. VIEWED - Parent opened the quote (tracked via link)
4. ACCEPTED - Parent confirms they want to enroll
5. CONVERTED - Quote converted to enrollment + invoice
6. DECLINED - Parent decided not to proceed
7. EXPIRED - Quote validity period passed

**South African Context:**
- Education services are VAT exempt (Section 12(h))
- Most quote items should default to VAT exempt
- Currency: South African Rand (ZAR)
</context>

<scope>
  <in_scope>
    - Quote list page with status filter and summary
    - Create quote form with line items
    - Quote detail page with actions
    - Send quote via email
    - Accept/decline quote actions
    - Convert quote to enrollment
    - Quote status badges
    - Quote validity/expiry tracking
    - Fee structure integration
  </in_scope>
  <out_of_scope>
    - Quote PDF generation (use browser print)
    - Email template customization
    - Quote versioning
    - Quote cloning
    - Bulk quote operations
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-quotes.ts

# 3. Create components
# Create apps/web/src/components/accounting/quote-columns.tsx
# Create apps/web/src/components/accounting/quote-form.tsx
# Create apps/web/src/components/accounting/quote-status-badge.tsx
# Create apps/web/src/components/accounting/quote-actions.tsx
# Create apps/web/src/components/accounting/quote-preview.tsx

# 4. Create pages
# Create apps/web/src/app/(dashboard)/accounting/quotes/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/quotes/new/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/quotes/[id]/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/quotes/[id]/edit/page.tsx

# 5. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values displayed in ZAR format (R 1,234.56)
    - Default VAT type is EXEMPT for education services
    - Quote numbers are unique and auto-generated
    - Expiry dates calculated from validity days
    - Status transitions follow proper flow
    - Conversion rate calculated correctly
    - Loading states during API calls
    - Error states with clear messages
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /accounting/quotes loads quote list
    - Page: /accounting/quotes/new shows create form
    - Page: /accounting/quotes/:id shows quote detail
    - Action: Create quote succeeds
    - Action: Send quote succeeds
    - Action: Accept quote succeeds
    - Action: Decline quote succeeds
    - Action: Convert quote succeeds
    - Display: Summary shows correct counts
    - Display: Status badges show correct colors
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Default VAT type to STANDARD (education is exempt)
  - Allow sending already-sent quotes
  - Allow editing sent/accepted quotes
  - Skip quote number generation
  - Forget expiry date validation
  - Allow conversion of non-accepted quotes
</anti_patterns>

</task_spec>
