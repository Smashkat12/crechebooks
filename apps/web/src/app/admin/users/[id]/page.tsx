'use client';

import { use } from 'react';
import Link from 'next/link';
import { useAdminUser, useUserActivity, useDeactivateUser, useActivateUser, useImpersonateUser } from '@/hooks/use-admin-users';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User, Mail, Building2, Calendar, Shield, Clock, Activity, UserX, UserCheck, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  OWNER: 'bg-blue-100 text-blue-800',
  ADMIN: 'bg-green-100 text-green-800',
  ACCOUNTANT: 'bg-yellow-100 text-yellow-800',
  VIEWER: 'bg-gray-100 text-gray-800',
};

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function UserDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: user, isLoading, error } = useAdminUser(id);
  const { data: activity, isLoading: activityLoading } = useUserActivity(id);
  const { toast } = useToast();
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const impersonateMutation = useImpersonateUser();

  const handleDeactivate = async () => {
    if (confirm(`Deactivate user "${user?.name}"? This will prevent them from logging in.`)) {
      await deactivateMutation.mutateAsync(id);
      toast({ title: 'User deactivated' });
    }
  };

  const handleActivate = async () => {
    await activateMutation.mutateAsync(id);
    toast({ title: 'User activated' });
  };

  const handleImpersonate = async () => {
    if (confirm(`Impersonate ${user?.email}? You will be logged in as this user.`)) {
      const result = await impersonateMutation.mutateAsync(id);
      if (result.success) {
        localStorage.setItem('impersonation_user_id', result.userId);
        toast({ title: 'Impersonation started', description: 'This feature requires session management.' });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <Link href="/admin/users" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">User not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{user.name}</h1>
              <Badge className={roleColors[user.role] || 'bg-gray-100'}>
                {user.role}
              </Badge>
              <Badge variant={user.isActive ? 'default' : 'secondary'}>
                {user.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {user.role !== 'SUPER_ADMIN' && (
            <>
              {user.isActive ? (
                <Button variant="destructive" onClick={handleDeactivate} disabled={deactivateMutation.isPending}>
                  <UserX className="mr-2 h-4 w-4" />
                  Deactivate
                </Button>
              ) : (
                <Button onClick={handleActivate} disabled={activateMutation.isPending}>
                  <UserCheck className="mr-2 h-4 w-4" />
                  Activate
                </Button>
              )}
              <Button variant="outline" onClick={handleImpersonate} disabled={impersonateMutation.isPending}>
                <LogIn className="mr-2 h-4 w-4" />
                Impersonate
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Role</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge className={roleColors[user.role] || 'bg-gray-100'}>
              {user.role}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={user.isActive ? 'default' : 'secondary'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Login</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.lastLoginAt
                ? formatDistanceToNow(new Date(user.lastLoginAt), { addSuffix: true })
                : 'Never'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>User account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{user.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <Badge className={roleColors[user.role] || 'bg-gray-100'}>{user.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tenant Association */}
        <Card>
          <CardHeader>
            <CardTitle>Tenant Association</CardTitle>
            <CardDescription>Organization membership</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.tenantId && user.tenantName ? (
              <>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Tenant</p>
                    <Link
                      href={`/admin/tenants/${user.tenantId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {user.tenantName}
                    </Link>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tenant ID</p>
                  <p className="font-mono text-sm">{user.tenantId}</p>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No tenant associated (Super Admin)</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest actions by this user</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-4">
              {activity.slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-start justify-between text-sm border-b pb-3 last:border-0">
                  <div className="flex items-start gap-3">
                    <Badge
                      className={actionColors[log.action?.split('_')[0]] || 'bg-gray-100'}
                      variant="secondary"
                    >
                      {log.action}
                    </Badge>
                    <div>
                      <p className="font-medium">{log.resourceType}</p>
                      {log.resourceId && (
                        <p className="text-muted-foreground text-xs">{log.resourceId}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {log.createdAt
                      ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No recent activity</p>
          )}
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">User ID</p>
              <p className="font-mono text-sm">{user.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm">{format(new Date(user.createdAt), 'PPpp')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm">{format(new Date(user.updatedAt), 'PPpp')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
