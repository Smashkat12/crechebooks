'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminUsers, useAdminUserStats, useDeactivateUser, useActivateUser, useImpersonateUser } from '@/hooks/use-admin-users';
import { useAdminTenants } from '@/hooks/use-admin-tenants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, UserCheck, UserX, Shield, TrendingUp, MoreHorizontal, Eye, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  OWNER: 'bg-blue-100 text-blue-800',
  ADMIN: 'bg-green-100 text-green-800',
  ACCOUNTANT: 'bg-yellow-100 text-yellow-800',
  VIEWER: 'bg-gray-100 text-gray-800',
};

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: usersData, isLoading } = useAdminUsers({ search, role, tenantId, page });
  const { data: stats } = useAdminUserStats();
  const { data: tenantsData } = useAdminTenants({ limit: 100 });
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
      if (result.success) {
        // Store the user ID for impersonation
        localStorage.setItem('impersonation_user_id', result.userId);
        toast({ title: 'Impersonation not yet fully implemented', description: 'This feature requires session management.' });
      }
    }
  };

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
            <div className="text-2xl font-bold">{stats?.newThisMonth || 0}</div>
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : usersData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              usersData?.data?.map((user: any) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge className={roleColors[user.role]}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>{user.tenantName || '—'}</TableCell>
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
              ))
            )}
          </TableBody>
        </Table>
        {usersData?.pagination && usersData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {usersData.pagination.page} of {usersData.pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={usersData.pagination.page <= 1}
                onClick={() => setPage(usersData.pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={usersData.pagination.page >= usersData.pagination.totalPages}
                onClick={() => setPage(usersData.pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
