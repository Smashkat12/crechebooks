<task_spec id="TASK-ADMIN-005" version="2.0">

<metadata>
  <title>User Management - Frontend UI</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>305</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-USER-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ADMIN-001</task_ref>
    <task_ref status="ready">TASK-ADMIN-004</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/app/admin/users/page.tsx (NEW)
  - apps/web/src/app/admin/users/[id]/page.tsx (NEW)
  - apps/web/src/components/admin/UserTable.tsx (NEW)
  - apps/web/src/components/admin/UserDetailCard.tsx (NEW)
  - apps/web/src/components/admin/UserActivityLog.tsx (NEW)
  - apps/web/src/hooks/use-admin-users.ts (NEW)

  **Dependency:**
  Requires TASK-ADMIN-001 (layout) and TASK-ADMIN-004 (API) to be complete.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Admin Users Hook
  ```typescript
  // apps/web/src/hooks/use-admin-users.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { apiClient } from '@/lib/api-client';

  interface ListUsersParams {
    search?: string;
    tenantId?: string;
    role?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }

  export function useAdminUsers(params: ListUsersParams = {}) {
    return useQuery({
      queryKey: ['admin', 'users', params],
      queryFn: async () => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.set(key, String(value));
        });
        return apiClient.get(`/api/v1/admin/users?${searchParams}`);
      },
    });
  }

  export function useAdminUser(id: string) {
    return useQuery({
      queryKey: ['admin', 'users', id],
      queryFn: () => apiClient.get(`/api/v1/admin/users/${id}`),
      enabled: !!id,
    });
  }

  export function useAdminUserStats() {
    return useQuery({
      queryKey: ['admin', 'users', 'stats'],
      queryFn: () => apiClient.get('/api/v1/admin/users/stats'),
    });
  }

  export function useUserActivity(id: string) {
    return useQuery({
      queryKey: ['admin', 'users', id, 'activity'],
      queryFn: () => apiClient.get(`/api/v1/admin/users/${id}/activity`),
      enabled: !!id,
    });
  }

  export function useDeactivateUser() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient.post(`/api/v1/admin/users/${id}/deactivate`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    });
  }

  export function useActivateUser() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient.post(`/api/v1/admin/users/${id}/activate`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    });
  }

  export function useImpersonateUser() {
    return useMutation({
      mutationFn: (id: string) => apiClient.post(`/api/v1/admin/users/${id}/impersonate`),
    });
  }
  ```

  ### 3. Users List Page
  ```typescript
  // apps/web/src/app/admin/users/page.tsx
  'use client';

  import { useState } from 'react';
  import { useAdminUsers, useAdminUserStats, useAdminTenants } from '@/hooks/use-admin-users';
  import { UserTable } from '@/components/admin/UserTable';
  import { Input } from '@/components/ui/input';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
  import { Users, UserCheck, UserX, Shield, TrendingUp } from 'lucide-react';

  export default function UsersPage() {
    const [search, setSearch] = useState('');
    const [role, setRole] = useState<string>('');
    const [tenantId, setTenantId] = useState<string>('');
    const [page, setPage] = useState(1);

    const { data: usersData, isLoading } = useAdminUsers({ search, role, tenantId, page });
    const { data: stats } = useAdminUserStats();
    const { data: tenantsData } = useAdminTenants({ limit: 100 });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage all users across the platform</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <UserCheck className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.activeUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Inactive</CardTitle>
              <UserX className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.inactiveUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
              <Shield className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.superAdmins || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">New This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.newUsersThisMonth || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Roles</SelectItem>
              <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              <SelectItem value="OWNER">Owner</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
              <SelectItem value="VIEWER">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="All Tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Tenants</SelectItem>
              {tenantsData?.data?.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* User Table */}
        <UserTable
          data={usersData?.data || []}
          isLoading={isLoading}
          pagination={usersData?.pagination}
          onPageChange={setPage}
        />
      </div>
    );
  }
  ```

  ### 4. User Table Component
  ```typescript
  // apps/web/src/components/admin/UserTable.tsx
  'use client';

  import Link from 'next/link';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
  import { MoreHorizontal, Eye, UserX, UserCheck, LogIn } from 'lucide-react';
  import { useDeactivateUser, useActivateUser, useImpersonateUser } from '@/hooks/use-admin-users';
  import { useToast } from '@/hooks/use-toast';
  import { formatDistanceToNow } from 'date-fns';

  interface UserTableProps {
    data: any[];
    isLoading: boolean;
    pagination?: { page: number; totalPages: number; total: number };
    onPageChange: (page: number) => void;
  }

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: 'bg-purple-100 text-purple-800',
    OWNER: 'bg-blue-100 text-blue-800',
    ADMIN: 'bg-green-100 text-green-800',
    ACCOUNTANT: 'bg-yellow-100 text-yellow-800',
    VIEWER: 'bg-gray-100 text-gray-800',
  };

  export function UserTable({ data, isLoading, pagination, onPageChange }: UserTableProps) {
    const { toast } = useToast();
    const deactivateMutation = useDeactivateUser();
    const activateMutation = useActivateUser();
    const impersonateMutation = useImpersonateUser();

    const handleDeactivate = async (id: string, email: string) => {
      if (confirm(`Deactivate ${email}?`)) {
        await deactivateMutation.mutateAsync(id);
        toast({ title: 'User deactivated' });
      }
    };

    const handleActivate = async (id: string) => {
      await activateMutation.mutateAsync(id);
      toast({ title: 'User activated' });
    };

    const handleImpersonate = async (id: string, email: string) => {
      if (confirm(`Impersonate ${email}? You will be logged in as this user.`)) {
        const result = await impersonateMutation.mutateAsync(id);
        // Store impersonation token and redirect
        localStorage.setItem('impersonation_token', result.token);
        window.location.href = '/dashboard';
      }
    };

    if (isLoading) return <div className="py-8 text-center">Loading users...</div>;

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge className={roleColors[user.role]}>{user.role}</Badge>
                </TableCell>
                <TableCell>{user.tenant?.name || '—'}</TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'default' : 'secondary'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.lastLoginAt
                    ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                    : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/users/${user.id}`}>
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </Link>
                      </DropdownMenuItem>
                      {user.role !== 'SUPER_ADMIN' && (
                        <>
                          {user.isActive ? (
                            <DropdownMenuItem
                              onClick={() => handleDeactivate(user.id, user.email)}
                              className="text-red-600"
                            >
                              <UserX className="mr-2 h-4 w-4" /> Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleActivate(user.id)}>
                              <UserCheck className="mr-2 h-4 w-4" /> Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleImpersonate(user.id, user.email)}>
                            <LogIn className="mr-2 h-4 w-4" /> Impersonate
                          </DropdownMenuItem>
                        </>
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
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</Button>
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
    - User list page with search and filters
    - Stats dashboard cards
    - User detail page with activity log
    - Activate/deactivate actions
    - Impersonate user functionality
    - Pagination
  </in_scope>
  <out_of_scope>
    - Create users
    - Delete users
    - Edit user details (role changes only)
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - User list loads and displays
    - Search and filters work
    - Pagination works
    - Activate/deactivate works
    - Impersonation works
  </verification>
</definition_of_done>

</task_spec>
