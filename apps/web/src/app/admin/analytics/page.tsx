'use client';

import { useAdminAnalytics } from '@/hooks/use-admin-analytics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TenantGrowthChart } from '@/components/admin/TenantGrowthChart';
import { PlatformMetricsChart } from '@/components/admin/PlatformMetricsChart';
import { Building2, Users, Baby, Receipt, ArrowUpRight } from 'lucide-react';

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(cents / 100);
}

export default function AnalyticsPage() {
  const { data: metrics } = useAdminAnalytics('metrics');
  const { data: tenantGrowth } = useAdminAnalytics('tenant-growth');
  const { data: _userGrowth } = useAdminAnalytics('user-growth');
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
          {topTenants && topTenants.length > 0 ? (
            <div className="space-y-4">
              {topTenants.map((t: any, i: number) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
                    <span className="font-medium">{t.name}</span>
                  </div>
                  <span className="text-muted-foreground">{t.childrenCount} children</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No tenant data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
