<task_spec id="TASK-ADMIN-006" version="2.0">

<metadata>
  <title>Platform Analytics Dashboard</title>
  <status>ready</status>
  <layer>fullstack</layer>
  <sequence>306</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-ANALYTICS-001</requirement_ref>
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
  - apps/api/src/api/admin/analytics.controller.ts (NEW)
  - apps/api/src/api/admin/analytics.service.ts (NEW)
  - apps/web/src/app/admin/analytics/page.tsx (NEW)
  - apps/web/src/components/admin/PlatformMetricsChart.tsx (NEW)
  - apps/web/src/components/admin/TenantGrowthChart.tsx (NEW)
  - apps/web/src/hooks/use-admin-analytics.ts (NEW)

  **Current Problem:**
  No platform-wide analytics for SUPER_ADMIN to understand platform health,
  growth metrics, usage patterns, and revenue trends.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Analytics Service
  ```typescript
  // apps/api/src/api/admin/analytics.service.ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '@/database/prisma.service';

  @Injectable()
  export class AnalyticsService {
    constructor(private prisma: PrismaService) {}

    async getPlatformMetrics() {
      const [tenants, users, children, invoices, transactions] = await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.user.count(),
        this.prisma.child.count(),
        this.prisma.invoice.aggregate({ _sum: { totalCents: true } }),
        this.prisma.transaction.count(),
      ]);

      return {
        totalTenants: tenants,
        totalUsers: users,
        totalChildren: children,
        totalInvoicedCents: invoices._sum.totalCents || 0,
        totalTransactions: transactions,
      };
    }

    async getTenantGrowth(months: number = 12) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const tenants = await this.prisma.tenant.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      // Group by month
      const monthlyData = new Map<string, number>();
      tenants.forEach((t) => {
        const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
        monthlyData.set(key, (monthlyData.get(key) || 0) + 1);
      });

      return Array.from(monthlyData.entries()).map(([month, count]) => ({
        month,
        newTenants: count,
      }));
    }

    async getUserGrowth(months: number = 12) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const users = await this.prisma.user.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const monthlyData = new Map<string, number>();
      users.forEach((u) => {
        const key = `${u.createdAt.getFullYear()}-${String(u.createdAt.getMonth() + 1).padStart(2, '0')}`;
        monthlyData.set(key, (monthlyData.get(key) || 0) + 1);
      });

      return Array.from(monthlyData.entries()).map(([month, count]) => ({
        month,
        newUsers: count,
      }));
    }

    async getSubscriptionBreakdown() {
      const breakdown = await this.prisma.tenant.groupBy({
        by: ['subscriptionStatus'],
        _count: true,
      });

      return breakdown.map((b) => ({
        status: b.subscriptionStatus,
        count: b._count,
      }));
    }

    async getTopTenantsByChildren(limit: number = 10) {
      const tenants = await this.prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { children: true } },
        },
        orderBy: { children: { _count: 'desc' } },
        take: limit,
      });

      return tenants.map((t) => ({
        id: t.id,
        name: t.name,
        childrenCount: t._count.children,
      }));
    }

    async getRecentActivity(limit: number = 20) {
      const logs = await this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
          tenant: { select: { name: true } },
        },
      });

      return logs;
    }
  }
  ```

  ### 3. Analytics Controller
  ```typescript
  // apps/api/src/api/admin/analytics.controller.ts
  import { Controller, Get, Query, UseGuards } from '@nestjs/common';
  import { AnalyticsService } from './analytics.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { RolesGuard } from '../auth/guards/roles.guard';
  import { Roles } from '../auth/decorators/roles.decorator';

  @Controller('api/v1/admin/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  export class AnalyticsController {
    constructor(private service: AnalyticsService) {}

    @Get('metrics')
    getMetrics() {
      return this.service.getPlatformMetrics();
    }

    @Get('tenant-growth')
    getTenantGrowth(@Query('months') months?: string) {
      return this.service.getTenantGrowth(months ? parseInt(months) : 12);
    }

    @Get('user-growth')
    getUserGrowth(@Query('months') months?: string) {
      return this.service.getUserGrowth(months ? parseInt(months) : 12);
    }

    @Get('subscriptions')
    getSubscriptions() {
      return this.service.getSubscriptionBreakdown();
    }

    @Get('top-tenants')
    getTopTenants(@Query('limit') limit?: string) {
      return this.service.getTopTenantsByChildren(limit ? parseInt(limit) : 10);
    }

    @Get('activity')
    getActivity(@Query('limit') limit?: string) {
      return this.service.getRecentActivity(limit ? parseInt(limit) : 20);
    }
  }
  ```

  ### 4. Analytics Page
  ```typescript
  // apps/web/src/app/admin/analytics/page.tsx
  'use client';

  import { useAdminAnalytics } from '@/hooks/use-admin-analytics';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
  import { PlatformMetricsChart } from '@/components/admin/PlatformMetricsChart';
  import { TenantGrowthChart } from '@/components/admin/TenantGrowthChart';
  import { Building2, Users, Baby, Receipt, ArrowUpRight } from 'lucide-react';

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(cents / 100);
  }

  export default function AnalyticsPage() {
    const { data: metrics, isLoading: metricsLoading } = useAdminAnalytics('metrics');
    const { data: tenantGrowth } = useAdminAnalytics('tenant-growth');
    const { data: userGrowth } = useAdminAnalytics('user-growth');
    const { data: subscriptions } = useAdminAnalytics('subscriptions');
    const { data: topTenants } = useAdminAnalytics('top-tenants');

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Platform Analytics</h1>
          <p className="text-muted-foreground">Platform-wide metrics and insights</p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.totalTenants || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.totalUsers || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Children</CardTitle>
              <Baby className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.totalChildren || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics?.totalInvoicedCents || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.totalTransactions || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tenant Growth</CardTitle>
              <CardDescription>New tenants over the last 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <TenantGrowthChart data={tenantGrowth || []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Subscription Breakdown</CardTitle>
              <CardDescription>Tenants by subscription status</CardDescription>
            </CardHeader>
            <CardContent>
              <PlatformMetricsChart data={subscriptions || []} />
            </CardContent>
          </Card>
        </div>

        {/* Top Tenants */}
        <Card>
          <CardHeader>
            <CardTitle>Top Tenants by Children</CardTitle>
            <CardDescription>Largest creches on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topTenants?.map((t: any, i: number) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
                    <span className="font-medium">{t.name}</span>
                  </div>
                  <span className="text-muted-foreground">{t.childrenCount} children</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Platform-wide metrics (totals)
    - Tenant growth chart
    - User growth chart
    - Subscription breakdown
    - Top tenants by children
    - Recent activity feed
  </in_scope>
  <out_of_scope>
    - Revenue analytics (requires billing)
    - Export functionality
    - Custom date ranges
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - All metrics display correctly
    - Charts render properly
    - Only SUPER_ADMIN can access
  </verification>
</definition_of_done>

</task_spec>
