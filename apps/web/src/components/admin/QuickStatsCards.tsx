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
    activeTenants: number;
    trialTenants: number;
    suspendedTenants: number;
    newThisMonth: number;
  };
  userStats?: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    superAdmins: number;
    owners: number;
    admins: number;
    newThisMonth: number;
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
            {tenantStats?.activeTenants || 0} active
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
          <div className="text-2xl font-bold">{userStats?.newThisMonth || 0}</div>
          <p className="text-xs text-muted-foreground">This month</p>
        </CardContent>
      </Card>
    </div>
  );
}
