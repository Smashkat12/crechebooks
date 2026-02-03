<task_spec id="TASK-ACCT-UI-004" version="2.0">

<metadata>
  <title>Supplier Management UI Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>504</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-SUPPLIER-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-SUPPLIER-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-013</task_ref>
    <task_ref status="complete">TASK-WEB-006</task_ref>
    <task_ref status="complete">TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/accounting/suppliers/page.tsx` (Supplier List)
  - `apps/web/src/app/(dashboard)/accounting/suppliers/new/page.tsx` (Create Supplier)
  - `apps/web/src/app/(dashboard)/accounting/suppliers/[id]/page.tsx` (Supplier Detail)
  - `apps/web/src/app/(dashboard)/accounting/suppliers/[id]/edit/page.tsx` (Edit Supplier)
  - `apps/web/src/app/(dashboard)/accounting/suppliers/[id]/statement/page.tsx` (Supplier Statement)
  - `apps/web/src/app/(dashboard)/accounting/payables/page.tsx` (Accounts Payable Aging)
  - `apps/web/src/components/accounting/supplier-columns.tsx` (Data Table Columns)
  - `apps/web/src/components/accounting/supplier-form.tsx` (Create/Edit Form)
  - `apps/web/src/components/accounting/bill-form.tsx` (Create Bill Form)
  - `apps/web/src/components/accounting/bill-table.tsx` (Bills List)
  - `apps/web/src/components/accounting/payment-form.tsx` (Record Payment Form)
  - `apps/web/src/components/accounting/payables-aging-table.tsx` (Aging Report)
  - `apps/web/src/hooks/use-suppliers.ts` (React Query Hooks)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (ADD suppliers endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD suppliers query keys)
  - `apps/web/src/components/layout/sidebar.tsx` (Add Suppliers menu item)

  **Current Problem:**
  - No UI exists for managing suppliers
  - Backend API is complete (SupplierController at /suppliers)
  - Tenants cannot create suppliers, record bills, or manage payments
  - No accounts payable aging report
  - No supplier statement view

  **Backend API Reference (SupplierController):**
  - `GET /suppliers` - List suppliers (isActive, search filters)
  - `GET /suppliers/:id` - Get supplier by ID
  - `GET /suppliers/:id/statement` - Get supplier statement (fromDate, toDate)
  - `GET /suppliers/payables-summary` - Get accounts payable summary
  - `POST /suppliers` - Create supplier
  - `PATCH /suppliers/:id` - Update supplier
  - `POST /suppliers/:id/bills` - Create bill for supplier
  - `POST /suppliers/bills/:billId/payments` - Record payment for bill

  **Backend DTOs:**
  ```typescript
  interface CreateSupplierDto {
    name: string;
    tradingName?: string;
    email?: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    registrationNumber?: string;
    paymentTermsDays?: number;
    bankName?: string;
    branchCode?: string;
    accountNumber?: string;
    accountType?: string;
    defaultAccountId?: string;
  }

  interface CreateSupplierBillDto {
    supplierId: string;
    billNumber: string;
    billDate: string;
    dueDate?: string;
    purchaseOrderRef?: string;
    notes?: string;
    attachmentUrl?: string;
    lines: CreateSupplierBillLineDto[];
  }

  interface CreateSupplierBillLineDto {
    description: string;
    quantity?: number;
    unitPriceCents: number;
    vatType?: string;
    accountId?: string;
  }

  interface RecordBillPaymentDto {
    amountCents: number;
    paymentDate: string;
    paymentMethod: string;
    reference?: string;
    transactionId?: string;
  }

  interface SupplierResponse {
    id: string;
    name: string;
    tradingName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    vatNumber: string | null;
    registrationNumber: string | null;
    paymentTermsDays: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  interface SupplierBillResponse {
    id: string;
    supplierId: string;
    supplierName: string;
    billNumber: string;
    billDate: Date;
    dueDate: Date;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    paidCents: number;
    balanceDueCents: number;
    status: string;
    paidDate: Date | null;
    createdAt: Date;
  }

  interface PayablesSummaryResponse {
    totalDueCents: number;
    overdueCents: number;
    dueThisWeekCents: number;
    supplierCount: number;
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
  suppliers: {
    list: '/suppliers',
    detail: (id: string) => `/suppliers/${id}`,
    statement: (id: string) => `/suppliers/${id}/statement`,
    payablesSummary: '/suppliers/payables-summary',
    createBill: (id: string) => `/suppliers/${id}/bills`,
    recordPayment: (billId: string) => `/suppliers/bills/${billId}/payments`,
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
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
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-suppliers.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export interface Supplier {
    id: string;
    name: string;
    tradingName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    vatNumber: string | null;
    registrationNumber: string | null;
    paymentTermsDays: number;
    bankName: string | null;
    branchCode: string | null;
    accountNumber: string | null;
    accountType: string | null;
    defaultAccountId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface SupplierBill {
    id: string;
    supplierId: string;
    supplierName: string;
    billNumber: string;
    billDate: Date;
    dueDate: Date;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    paidCents: number;
    balanceDueCents: number;
    status: 'DRAFT' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
    paidDate: Date | null;
    createdAt: Date;
  }

  export interface PayablesSummary {
    totalDueCents: number;
    overdueCents: number;
    dueThisWeekCents: number;
    supplierCount: number;
  }

  export interface SupplierStatement {
    supplier: Supplier;
    bills: SupplierBill[];
    openingBalanceCents: number;
    closingBalanceCents: number;
    periodStartDate: string;
    periodEndDate: string;
  }

  export interface CreateSupplierDto {
    name: string;
    tradingName?: string;
    email?: string;
    phone?: string;
    address?: string;
    vatNumber?: string;
    registrationNumber?: string;
    paymentTermsDays?: number;
    bankName?: string;
    branchCode?: string;
    accountNumber?: string;
    accountType?: string;
    defaultAccountId?: string;
  }

  export interface CreateBillLineDto {
    description: string;
    quantity?: number;
    unitPriceCents: number;
    vatType?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
    accountId?: string;
  }

  export interface CreateBillDto {
    billNumber: string;
    billDate: string;
    dueDate?: string;
    purchaseOrderRef?: string;
    notes?: string;
    attachmentUrl?: string;
    lines: CreateBillLineDto[];
  }

  export interface RecordPaymentDto {
    amountCents: number;
    paymentDate: string;
    paymentMethod: 'EFT' | 'CASH' | 'CARD' | 'CHEQUE';
    reference?: string;
    transactionId?: string;
  }

  export interface SupplierListParams {
    isActive?: boolean;
    search?: string;
  }

  // List suppliers
  export function useSuppliersList(params?: SupplierListParams) {
    return useQuery<Supplier[], AxiosError>({
      queryKey: queryKeys.suppliers.list(params),
      queryFn: async () => {
        const { data } = await apiClient.get<Supplier[]>(endpoints.suppliers.list, {
          params: {
            isActive: params?.isActive,
            search: params?.search,
          },
        });
        return data;
      },
    });
  }

  // Get single supplier
  export function useSupplier(id: string, enabled = true) {
    return useQuery<Supplier, AxiosError>({
      queryKey: queryKeys.suppliers.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<Supplier>(endpoints.suppliers.detail(id));
        return data;
      },
      enabled: enabled && !!id,
    });
  }

  // Get supplier statement
  export function useSupplierStatement(id: string, fromDate: string, toDate: string) {
    return useQuery<SupplierStatement, AxiosError>({
      queryKey: queryKeys.suppliers.statement(id, { fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<SupplierStatement>(
          endpoints.suppliers.statement(id),
          { params: { fromDate, toDate } }
        );
        return data;
      },
      enabled: !!id && !!fromDate && !!toDate,
    });
  }

  // Get payables summary
  export function usePayablesSummary() {
    return useQuery<PayablesSummary, AxiosError>({
      queryKey: queryKeys.suppliers.payablesSummary(),
      queryFn: async () => {
        const { data } = await apiClient.get<PayablesSummary>(endpoints.suppliers.payablesSummary);
        return data;
      },
    });
  }

  // Create supplier
  export function useCreateSupplier() {
    const queryClient = useQueryClient();

    return useMutation<Supplier, AxiosError, CreateSupplierDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.post<Supplier>(endpoints.suppliers.list, dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      },
    });
  }

  // Update supplier
  export function useUpdateSupplier(id: string) {
    const queryClient = useQueryClient();

    return useMutation<Supplier, AxiosError, Partial<CreateSupplierDto>>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.patch<Supplier>(endpoints.suppliers.detail(id), dto);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(id) });
      },
    });
  }

  // Create bill
  export function useCreateBill(supplierId: string) {
    const queryClient = useQueryClient();

    return useMutation<SupplierBill, AxiosError, CreateBillDto>({
      mutationFn: async (dto) => {
        const { data } = await apiClient.post<SupplierBill>(
          endpoints.suppliers.createBill(supplierId),
          dto
        );
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.detail(supplierId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.bills(supplierId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.payablesSummary() });
      },
    });
  }

  // Record payment
  export function useRecordPayment(billId: string) {
    const queryClient = useQueryClient();

    return useMutation<void, AxiosError, RecordPaymentDto>({
      mutationFn: async (dto) => {
        await apiClient.post(endpoints.suppliers.recordPayment(billId), dto);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.payablesSummary() });
      },
    });
  }
  ```

  ### 5. Supplier List Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/suppliers/page.tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { Plus, Building2, Receipt, DollarSign } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { DataTable } from '@/components/tables/data-table';
  import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
  import { Input } from '@/components/ui/input';
  import { useSuppliersList, usePayablesSummary } from '@/hooks/use-suppliers';
  import { supplierColumns } from '@/components/accounting/supplier-columns';
  import { formatCentsToZAR } from '@/lib/utils/currency';

  export default function SuppliersPage() {
    const [search, setSearch] = useState('');

    const { data: suppliers, isLoading, error } = useSuppliersList({
      search: search || undefined,
    });

    const { data: payablesSummary } = usePayablesSummary();

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load suppliers: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
            <p className="text-muted-foreground">
              Manage suppliers and accounts payable
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/accounting/payables">
              <Button variant="outline">
                <Receipt className="h-4 w-4 mr-2" />
                Payables Aging
              </Button>
            </Link>
            <Link href="/accounting/suppliers/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Supplier
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        {payablesSummary && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatCentsToZAR(payablesSummary.totalDueCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                <Receipt className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-red-600">
                  {formatCentsToZAR(payablesSummary.overdueCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
                <Receipt className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono text-amber-600">
                  {formatCentsToZAR(payablesSummary.dueThisWeekCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Suppliers</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {payablesSummary.supplierCount}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Suppliers Table */}
        <Card>
          <CardHeader>
            <Input
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <DataTableSkeleton columns={6} rows={10} />
            ) : (
              <DataTable columns={supplierColumns} data={suppliers || []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 6. Supplier Form Component Pattern
  ```typescript
  // apps/web/src/components/accounting/supplier-form.tsx
  'use client';

  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { z } from 'zod';
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
  import type { Supplier, CreateSupplierDto } from '@/hooks/use-suppliers';
  import type { Account } from '@/hooks/use-accounts';

  const supplierFormSchema = z.object({
    name: z.string().min(1, 'Supplier name is required').max(200),
    tradingName: z.string().max(200).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(20).optional(),
    address: z.string().optional(),
    vatNumber: z.string().max(20).optional(),
    registrationNumber: z.string().max(50).optional(),
    paymentTermsDays: z.coerce.number().min(0).default(30),
    bankName: z.string().max(100).optional(),
    branchCode: z.string().max(20).optional(),
    accountNumber: z.string().max(50).optional(),
    accountType: z.enum(['CHEQUE', 'SAVINGS', 'CURRENT']).optional(),
    defaultAccountId: z.string().optional(),
  });

  type SupplierFormValues = z.infer<typeof supplierFormSchema>;

  interface SupplierFormProps {
    supplier?: Supplier;
    accounts?: Account[];
    onSubmit: (data: CreateSupplierDto) => void;
    isLoading?: boolean;
    mode: 'create' | 'edit';
  }

  export function SupplierForm({ supplier, accounts, onSubmit, isLoading, mode }: SupplierFormProps) {
    const form = useForm<SupplierFormValues>({
      resolver: zodResolver(supplierFormSchema),
      defaultValues: {
        name: supplier?.name || '',
        tradingName: supplier?.tradingName || '',
        email: supplier?.email || '',
        phone: supplier?.phone || '',
        address: supplier?.address || '',
        vatNumber: supplier?.vatNumber || '',
        registrationNumber: supplier?.registrationNumber || '',
        paymentTermsDays: supplier?.paymentTermsDays || 30,
        bankName: supplier?.bankName || '',
        branchCode: supplier?.branchCode || '',
        accountNumber: supplier?.accountNumber || '',
        accountType: supplier?.accountType as 'CHEQUE' | 'SAVINGS' | 'CURRENT' | undefined,
        defaultAccountId: supplier?.defaultAccountId || '',
      },
    });

    // Filter expense accounts for default account selection
    const expenseAccounts = accounts?.filter(a => a.type === 'EXPENSE') || [];

    const handleSubmit = (data: SupplierFormValues) => {
      // Clean empty strings
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== '')
      ) as CreateSupplierDto;
      onSubmit(cleanData);
    };

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Legal Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ABC Supplies (Pty) Ltd" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tradingName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trading Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ABC Supplies" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="accounts@supplier.co.za" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="011 123 4567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="123 Main Street, Johannesburg, 2000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vatNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="4123456789" />
                      </FormControl>
                      <FormDescription>10-digit VAT registration number</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="registrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Registration</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="2020/123456/07" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Payment Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentTermsDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms (Days)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min={0} />
                      </FormControl>
                      <FormDescription>Number of days until payment is due</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Expense Account</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {expenseAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Default account for bills from this supplier</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle>Bank Details (for EFT Payments)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Standard Bank" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="branchCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch Code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="051001" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="1234567890" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CHEQUE">Cheque</SelectItem>
                          <SelectItem value="SAVINGS">Savings</SelectItem>
                          <SelectItem value="CURRENT">Current</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : mode === 'create' ? 'Create Supplier' : 'Update Supplier'}
            </Button>
          </div>
        </form>
      </Form>
    );
  }
  ```

  ### 7. Bill Form Component Pattern
  ```typescript
  // apps/web/src/components/accounting/bill-form.tsx
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
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { CreateBillDto } from '@/hooks/use-suppliers';
  import type { Account } from '@/hooks/use-accounts';

  const billLineSchema = z.object({
    description: z.string().min(1, 'Description required'),
    quantity: z.coerce.number().min(0).default(1),
    unitPriceCents: z.coerce.number().min(0),
    vatType: z.enum(['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NO_VAT']).default('STANDARD'),
    accountId: z.string().optional(),
  });

  const billFormSchema = z.object({
    billNumber: z.string().min(1, 'Bill number is required'),
    billDate: z.string().min(1, 'Bill date is required'),
    dueDate: z.string().optional(),
    purchaseOrderRef: z.string().optional(),
    notes: z.string().optional(),
    lines: z.array(billLineSchema).min(1, 'At least one line item required'),
  });

  type BillFormValues = z.infer<typeof billFormSchema>;

  interface BillFormProps {
    accounts?: Account[];
    onSubmit: (data: CreateBillDto) => void;
    isLoading?: boolean;
  }

  const VAT_RATE = 0.15; // 15% VAT

  export function BillForm({ accounts, onSubmit, isLoading }: BillFormProps) {
    const form = useForm<BillFormValues>({
      resolver: zodResolver(billFormSchema),
      defaultValues: {
        billNumber: '',
        billDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        purchaseOrderRef: '',
        notes: '',
        lines: [{ description: '', quantity: 1, unitPriceCents: 0, vatType: 'STANDARD', accountId: '' }],
      },
    });

    const { fields, append, remove } = useFieldArray({
      control: form.control,
      name: 'lines',
    });

    const lines = form.watch('lines');
    const expenseAccounts = accounts?.filter(a => a.type === 'EXPENSE') || [];

    // Calculate totals
    const subtotalCents = lines.reduce((sum, line) => {
      return sum + (line.unitPriceCents || 0) * (line.quantity || 1);
    }, 0);

    const vatCents = lines.reduce((sum, line) => {
      const lineTotal = (line.unitPriceCents || 0) * (line.quantity || 1);
      if (line.vatType === 'STANDARD') {
        return sum + Math.round(lineTotal * VAT_RATE);
      }
      return sum;
    }, 0);

    const totalCents = subtotalCents + vatCents;

    const handleSubmit = (data: BillFormValues) => {
      onSubmit(data as CreateBillDto);
    };

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="billNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill Number *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="INV-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill Date *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="purchaseOrderRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PO Reference</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="PO-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Line Items</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ description: '', quantity: 1, unitPriceCents: 0, vatType: 'STANDARD', accountId: '' })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit Price</TableHead>
                  <TableHead className="w-32">VAT Type</TableHead>
                  <TableHead className="w-48">Account</TableHead>
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
                                <Input {...field} type="number" min={0} step={0.01} />
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
                                <Input {...field} type="number" min={0} placeholder="0" />
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
                                <SelectItem value="STANDARD">15% VAT</SelectItem>
                                <SelectItem value="ZERO_RATED">0% (Zero)</SelectItem>
                                <SelectItem value="EXEMPT">Exempt</SelectItem>
                                <SelectItem value="NO_VAT">No VAT</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <FormField
                          control={form.control}
                          name={`lines.${index}.accountId`}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {expenseAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.code}
                                  </SelectItem>
                                ))}
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
                  <TableCell colSpan={5} className="text-right">Subtotal</TableCell>
                  <TableCell className="text-right font-mono">{formatCentsToZAR(subtotalCents)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">VAT</TableCell>
                  <TableCell className="text-right font-mono">{formatCentsToZAR(vatCents)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-bold">Total</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatCentsToZAR(totalCents)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Additional notes..." />
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
              {isLoading ? 'Creating...' : 'Create Bill'}
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
  ```
</critical_patterns>

<context>
This task creates the Supplier Management UI for CrecheBooks.

**Business Context:**
1. Creches have recurring suppliers (food, utilities, cleaning, supplies)
2. Bills need tracking with due dates for cash flow management
3. Payment terms vary by supplier (7, 14, 30 days typical)
4. VAT-registered suppliers require proper VAT tracking
5. Supplier statements needed for reconciliation

**Common Creche Suppliers:**
- Food/catering suppliers
- Cleaning supplies
- Educational materials
- Utilities (electricity, water, internet)
- Maintenance contractors
- Insurance companies

**South African Context:**
- VAT registration threshold R1 million turnover
- Standard VAT rate 15%
- SA bank account types: Cheque, Savings, Current
- Branch codes for EFT payments
</context>

<scope>
  <in_scope>
    - Supplier list page with search
    - Create/edit supplier forms with bank details
    - Supplier detail page with bills list
    - Create bill with line items
    - Record bill payment
    - Supplier statement view
    - Accounts payable aging report
    - VAT tracking per bill line
  </in_scope>
  <out_of_scope>
    - Bulk bill import
    - EFT file generation
    - Automatic payment scheduling
    - Supplier portal
    - Document attachments upload
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-suppliers.ts

# 3. Create components
# Create apps/web/src/components/accounting/supplier-columns.tsx
# Create apps/web/src/components/accounting/supplier-form.tsx
# Create apps/web/src/components/accounting/bill-form.tsx
# Create apps/web/src/components/accounting/bill-table.tsx
# Create apps/web/src/components/accounting/payment-form.tsx
# Create apps/web/src/components/accounting/payables-aging-table.tsx

# 4. Create pages
# Create apps/web/src/app/(dashboard)/accounting/suppliers/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/suppliers/new/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/suppliers/[id]/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/suppliers/[id]/edit/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/suppliers/[id]/statement/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/payables/page.tsx

# 5. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values displayed in ZAR format (R 1,234.56)
    - Bank details securely stored (not displayed in lists)
    - VAT calculated correctly at 15% for STANDARD type
    - Due dates calculated from payment terms if not specified
    - Bill status reflects payment state
    - Overdue bills highlighted in red
    - Loading states during API calls
    - Error states with clear messages
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /accounting/suppliers loads supplier list
    - Page: /accounting/suppliers/new shows create form
    - Page: /accounting/suppliers/:id shows supplier detail
    - Page: /accounting/suppliers/:id/edit shows edit form
    - Page: /accounting/suppliers/:id/statement shows statement
    - Page: /accounting/payables shows aging report
    - Action: Create supplier succeeds
    - Action: Create bill with lines succeeds
    - Action: Record payment succeeds
    - Calc: VAT calculated correctly on bills
    - Calc: Bill totals calculate correctly
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Display full bank account numbers in list views
  - Allow negative bill amounts
  - Allow payments exceeding bill balance
  - Skip VAT type selection on bill lines
  - Forget to validate required fields
  - Allow deleting suppliers with unpaid bills
</anti_patterns>

</task_spec>
