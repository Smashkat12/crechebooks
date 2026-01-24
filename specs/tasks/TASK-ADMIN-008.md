<task_spec id="TASK-ADMIN-008" version="2.0">

<metadata>
  <title>Admin Portal Overview Dashboard</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>308</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-OVERVIEW-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ADMIN-001</task_ref>
    <task_ref status="ready">TASK-ADMIN-002</task_ref>
    <task_ref status="ready">TASK-ADMIN-006</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Modify:**
  - apps/web/src/app/admin/page.tsx (REWRITE - complete overhaul)

  **Files to Create:**
  - apps/web/src/components/admin/QuickStatsCards.tsx (NEW)
  - apps/web/src/components/admin/RecentActivityFeed.tsx (NEW)
  - apps/web/src/components/admin/QuickActionsPanel.tsx (NEW)

  **Current Problem:**
  The admin overview page only shows contact submissions and demo requests.
  It should be a comprehensive dashboard with platform metrics, quick actions,
  and recent activity for SUPER_ADMIN users.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Admin Overview Page
  ```typescript
  // apps/web/src/app/admin/page.tsx
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
                  <span className="font-medium">{tenantStats?.activeSubscriptions || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span>Trial</span>
                  </div>
                  <span className="font-medium">{tenantStats?.trialSubscriptions || 0}</span>
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
  ```

  ### 3. Quick Stats Cards
  ```typescript
  // apps/web/src/components/admin/QuickStatsCards.tsx
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Building2, Users, Baby, Receipt, TrendingUp } from 'lucide-react';

  interface QuickStatsCardsProps {
    metrics?: {
      totalTenants: number;
      totalUsers: number;
      totalChildren: number;
      totalInvoicedCents: number;
    };
    tenantStats?: {
      totalTenants: number;
      activeSubscriptions: number;
    };
    userStats?: {
      totalUsers: number;
      activeUsers: number;
      newUsersThisMonth: number;
    };
  }

  export function QuickStatsCards({ metrics, tenantStats, userStats }: QuickStatsCardsProps) {
    const formatCurrency = (cents: number) =>
      new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(cents / 100);

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalTenants || tenantStats?.totalTenants || 0}</div>
            <p className="text-xs text-muted-foreground">
              {tenantStats?.activeSubscriptions || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalUsers || userStats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {userStats?.activeUsers || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Children</CardTitle>
            <Baby className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalChildren || 0}</div>
            <p className="text-xs text-muted-foreground">Enrolled across platform</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.totalInvoicedCents || 0)}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Users</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats?.newUsersThisMonth || 0}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 4. Recent Activity Feed
  ```typescript
  // apps/web/src/components/admin/RecentActivityFeed.tsx
  'use client';

  import { formatDistanceToNow } from 'date-fns';
  import { Badge } from '@/components/ui/badge';

  interface Activity {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    createdAt: string;
    user?: { name: string; email: string };
    tenant?: { name: string };
  }

  interface RecentActivityFeedProps {
    activities: Activity[];
  }

  const actionColors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    LOGIN: 'bg-purple-100 text-purple-800',
  };

  export function RecentActivityFeed({ activities }: RecentActivityFeedProps) {
    if (!activities.length) {
      return <p className="text-muted-foreground text-center py-4">No recent activity</p>;
    }

    return (
      <div className="space-y-4">
        {activities.slice(0, 10).map((activity) => (
          <div key={activity.id} className="flex items-start justify-between text-sm">
            <div className="flex items-start gap-3">
              <Badge
                className={actionColors[activity.action?.split('_')[0]] || 'bg-gray-100'}
                variant="secondary"
              >
                {activity.action}
              </Badge>
              <div>
                <p className="font-medium">
                  {activity.user?.name || 'System'} • {activity.resourceType}
                </p>
                <p className="text-muted-foreground text-xs">
                  {activity.tenant?.name || 'Platform'}
                </p>
              </div>
            </div>
            <span className="text-muted-foreground whitespace-nowrap">
              {activity.createdAt
                ? formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })
                : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Comprehensive overview dashboard
    - Key platform metrics
    - Quick action buttons
    - Pending submissions summary
    - Subscription breakdown
    - Recent activity feed
    - Alert banners for pending items
  </in_scope>
  <out_of_scope>
    - Real-time updates
    - Custom dashboard widgets
    - Drag-and-drop layout
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - All stats display correctly
    - Quick actions navigate correctly
    - Recent activity shows latest logs
    - Pending submissions badge shows count
  </verification>
</definition_of_done>

</task_spec>
