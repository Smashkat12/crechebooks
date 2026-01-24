'use client';

import Link from 'next/link';
import { useAdminAnalytics } from '@/hooks/use-admin-analytics';
import { useAdminTenantStats } from '@/hooks/use-admin-tenants';
import { useAdminUserStats } from '@/hooks/use-admin-users';
import { useContactSubmissions, useDemoRequests } from '@/hooks/useAdminSubmissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QuickStatsCards } from '@/components/admin/QuickStatsCards';
import { RecentActivityFeed } from '@/components/admin/RecentActivityFeed';
import {
  Building2,
  Users,
  Mail,
  Calendar,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

export default function AdminOverviewPage() {
  const { data: metrics } = useAdminAnalytics('metrics');
  const { data: tenantStats } = useAdminTenantStats();
  const { data: userStats } = useAdminUserStats();
  const { data: contactData } = useContactSubmissions();
  const { data: demoData } = useDemoRequests();
  const { data: recentActivity } = useAdminAnalytics('activity');

  const pendingSubmissions = (contactData?.pending || 0) + (demoData?.pending || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Admin Overview</h1>
        <p className="text-muted-foreground">Platform administration dashboard</p>
      </div>

      {/* Alert Banner for Pending Items */}
      {pendingSubmissions > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium text-yellow-800">
                {pendingSubmissions} pending submissions require attention
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/submissions">View Submissions</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <QuickStatsCards
        metrics={metrics}
        tenantStats={tenantStats}
        userStats={userStats}
      />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/admin/tenants/new">
                <Building2 className="mr-2 h-4 w-4" />
                Create New Tenant
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/admin/audit-logs">
                <TrendingUp className="mr-2 h-4 w-4" />
                View Audit Logs
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/admin/analytics">
                <TrendingUp className="mr-2 h-4 w-4" />
                Platform Analytics
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Pending Submissions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Pending Submissions</CardTitle>
              <CardDescription>Contact and demo requests</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/submissions">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>Contact Submissions</span>
                </div>
                <Badge variant={contactData?.pending ? 'default' : 'secondary'}>
                  {contactData?.pending || 0} pending
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Demo Requests</span>
                </div>
                <Badge variant={demoData?.pending ? 'default' : 'secondary'}>
                  {demoData?.pending || 0} pending
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
            <CardDescription>Tenant subscription breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Active</span>
                </div>
                <span className="font-medium">{tenantStats?.activeTenants || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>Trial</span>
                </div>
                <span className="font-medium">{tenantStats?.trialTenants || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span>Suspended</span>
                </div>
                <span className="font-medium">{tenantStats?.suspendedTenants || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions across the platform</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/audit-logs">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <RecentActivityFeed activities={recentActivity || []} />
        </CardContent>
      </Card>
    </div>
  );
}
