'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminTenants, useAdminTenantStats, useSuspendTenant, useActivateTenant } from '@/hooks/use-admin-tenants';
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
import { Building2, Plus, MoreHorizontal, Eye, Pause, Play, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  TRIAL: 'bg-blue-100 text-blue-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-800',
  STARTER: 'bg-purple-100 text-purple-800',
  PROFESSIONAL: 'bg-indigo-100 text-indigo-800',
  ENTERPRISE: 'bg-amber-100 text-amber-800',
};

export default function TenantsPage() {
  const [search, setSearch] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: tenantsData, isLoading } = useAdminTenants({ search, subscriptionStatus, page });
  const { data: stats } = useAdminTenantStats();
  const { toast } = useToast();
  const suspendMutation = useSuspendTenant();
  const activateMutation = useActivateTenant();

  const handleSuspend = async (id: string, name: string) => {
    if (confirm(`Suspend tenant "${name}"? This will disable access for all users.`)) {
      await suspendMutation.mutateAsync({ id });
      toast({ title: 'Tenant suspended' });
    }
  };

  const handleActivate = async (id: string) => {
    await activateMutation.mutateAsync(id);
    toast({ title: 'Tenant activated' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tenants</h1>
          <p className="text-muted-foreground">Manage all tenants on the platform</p>
        </div>
        <Button asChild>
          <Link href="/admin/tenants/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Tenant
          </Link>
        </Button>
      </div>

      {/* Stats */}
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
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.activeSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Trial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.trialSubscriptions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.suspendedTenants || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <Input
          placeholder="Search tenants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={subscriptionStatus || 'all'} onValueChange={(v) => setSubscriptionStatus(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="TRIAL">Trial</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading tenants...
                </TableCell>
              </TableRow>
            ) : tenantsData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No tenants found
                </TableCell>
              </TableRow>
            ) : (
              tenantsData?.data?.map((tenant: any) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>{tenant.email}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[tenant.subscriptionStatus] || 'bg-gray-100'}>
                      {tenant.subscriptionStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={planColors[tenant.subscriptionPlan] || 'bg-gray-100'}>
                      {tenant.subscriptionPlan || 'FREE'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      {tenant.userCount || 0}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.createdAt
                      ? formatDistanceToNow(new Date(tenant.createdAt), { addSuffix: true })
                      : '—'}
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
                          <Link href={`/admin/tenants/${tenant.id}`}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </Link>
                        </DropdownMenuItem>
                        {tenant.subscriptionStatus === 'SUSPENDED' ? (
                          <DropdownMenuItem onClick={() => handleActivate(tenant.id)}>
                            <Play className="mr-2 h-4 w-4" /> Activate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleSuspend(tenant.id, tenant.name)}
                            className="text-red-600"
                          >
                            <Pause className="mr-2 h-4 w-4" /> Suspend
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {tenantsData?.pagination && tenantsData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {tenantsData.pagination.page} of {tenantsData.pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={tenantsData.pagination.page <= 1}
                onClick={() => setPage(tenantsData.pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={tenantsData.pagination.page >= tenantsData.pagination.totalPages}
                onClick={() => setPage(tenantsData.pagination.page + 1)}
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
