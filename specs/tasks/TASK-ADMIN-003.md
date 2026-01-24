<task_spec id="TASK-ADMIN-003" version="2.0">

<metadata>
  <title>Tenant Management - Frontend UI</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>303</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-TENANT-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ADMIN-001</task_ref>
    <task_ref status="ready">TASK-ADMIN-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/app/admin/tenants/page.tsx (NEW)
  - apps/web/src/app/admin/tenants/[id]/page.tsx (NEW)
  - apps/web/src/app/admin/tenants/new/page.tsx (NEW)
  - apps/web/src/components/admin/TenantTable.tsx (NEW)
  - apps/web/src/components/admin/TenantForm.tsx (NEW)
  - apps/web/src/components/admin/TenantDetailCard.tsx (NEW)
  - apps/web/src/hooks/use-admin-tenants.ts (NEW)

  **Dependency:**
  Requires TASK-ADMIN-001 (layout) and TASK-ADMIN-002 (API) to be complete.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Admin Tenants Hook
  ```typescript
  // apps/web/src/hooks/use-admin-tenants.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { apiClient } from '@/lib/api-client';

  interface ListTenantsParams {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }

  export function useAdminTenants(params: ListTenantsParams = {}) {
    return useQuery({
      queryKey: ['admin', 'tenants', params],
      queryFn: async () => {
        const searchParams = new URLSearchParams();
        if (params.search) searchParams.set('search', params.search);
        if (params.status) searchParams.set('status', params.status);
        if (params.page) searchParams.set('page', params.page.toString());
        if (params.limit) searchParams.set('limit', params.limit.toString());
        return apiClient.get(`/api/v1/admin/tenants?${searchParams}`);
      },
    });
  }

  export function useAdminTenant(id: string) {
    return useQuery({
      queryKey: ['admin', 'tenants', id],
      queryFn: () => apiClient.get(`/api/v1/admin/tenants/${id}`),
      enabled: !!id,
    });
  }

  export function useAdminTenantStats() {
    return useQuery({
      queryKey: ['admin', 'tenants', 'stats'],
      queryFn: () => apiClient.get('/api/v1/admin/tenants/stats'),
    });
  }

  export function useCreateTenant() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: any) => apiClient.post('/api/v1/admin/tenants', data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    });
  }

  export function useUpdateTenant() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: any }) =>
        apiClient.patch(`/api/v1/admin/tenants/${id}`, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    });
  }

  export function useSuspendTenant() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient.post(`/api/v1/admin/tenants/${id}/suspend`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    });
  }

  export function useActivateTenant() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient.post(`/api/v1/admin/tenants/${id}/activate`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    });
  }
  ```

  ### 3. Tenant List Page
  ```typescript
  // apps/web/src/app/admin/tenants/page.tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { useAdminTenants, useAdminTenantStats } from '@/hooks/use-admin-tenants';
  import { TenantTable } from '@/components/admin/TenantTable';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { Plus, Building2, Users, CheckCircle, AlertCircle } from 'lucide-react';

  export default function TenantsPage() {
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string>('');
    const [page, setPage] = useState(1);

    const { data: tenantsData, isLoading } = useAdminTenants({ search, status, page });
    const { data: stats } = useAdminTenantStats();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tenant Management</h1>
            <p className="text-muted-foreground">Manage all tenants on the platform</p>
          </div>
          <Button asChild>
            <Link href="/admin/tenants/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Tenant
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalTenants || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeSubscriptions || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Trial</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.trialSubscriptions || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <Input
            placeholder="Search tenants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="TRIAL">Trial</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tenant Table */}
        <TenantTable
          data={tenantsData?.data || []}
          isLoading={isLoading}
          pagination={tenantsData?.pagination}
          onPageChange={setPage}
        />
      </div>
    );
  }
  ```

  ### 4. Tenant Table Component
  ```typescript
  // apps/web/src/components/admin/TenantTable.tsx
  'use client';

  import Link from 'next/link';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/components/ui/table';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { MoreHorizontal, Eye, Edit, Ban, CheckCircle } from 'lucide-react';
  import { useSuspendTenant, useActivateTenant } from '@/hooks/use-admin-tenants';
  import { useToast } from '@/hooks/use-toast';

  interface TenantTableProps {
    data: any[];
    isLoading: boolean;
    pagination?: { page: number; totalPages: number; total: number };
    onPageChange: (page: number) => void;
  }

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    TRIAL: 'bg-yellow-100 text-yellow-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };

  export function TenantTable({ data, isLoading, pagination, onPageChange }: TenantTableProps) {
    const { toast } = useToast();
    const suspendMutation = useSuspendTenant();
    const activateMutation = useActivateTenant();

    const handleSuspend = async (id: string, name: string) => {
      if (confirm(`Are you sure you want to suspend ${name}?`)) {
        await suspendMutation.mutateAsync(id);
        toast({ title: 'Tenant suspended' });
      }
    };

    const handleActivate = async (id: string) => {
      await activateMutation.mutateAsync(id);
      toast({ title: 'Tenant activated' });
    };

    if (isLoading) {
      return <div className="py-8 text-center">Loading tenants...</div>;
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Children</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell>{tenant.email}</TableCell>
                <TableCell>
                  <Badge className={statusColors[tenant.subscriptionStatus]}>
                    {tenant.subscriptionStatus}
                  </Badge>
                </TableCell>
                <TableCell>{tenant._count?.users || 0}</TableCell>
                <TableCell>{tenant._count?.children || 0}</TableCell>
                <TableCell>{new Date(tenant.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/tenants/${tenant.id}`}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/tenants/${tenant.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </Link>
                      </DropdownMenuItem>
                      {tenant.subscriptionStatus === 'SUSPENDED' ? (
                        <DropdownMenuItem onClick={() => handleActivate(tenant.id)}>
                          <CheckCircle className="mr-2 h-4 w-4" /> Activate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => handleSuspend(tenant.id, tenant.name)}
                          className="text-red-600"
                        >
                          <Ban className="mr-2 h-4 w-4" /> Suspend
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Tenant list page with search and filters
    - Stats dashboard cards
    - Tenant detail page
    - Create tenant form
    - Edit tenant form
    - Suspend/activate actions
    - Pagination
  </in_scope>
  <out_of_scope>
    - Tenant deletion (too dangerous)
    - Billing management
    - Data export
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - Tenant list loads and displays
    - Search filters work
    - Status filter works
    - Pagination works
    - Create tenant works
    - Suspend/activate works
  </verification>
</definition_of_done>

</task_spec>
