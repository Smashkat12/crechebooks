'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  CreditCard,
  Receipt,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DashboardData {
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    childrenCount: number;
  };
  summary: {
    outstandingBalance: number;
    overdueAmount: number;
    unpaidInvoices: number;
    lastPaymentDate: string | null;
    lastPaymentAmount: number | null;
  };
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      const token = localStorage.getItem('parent_session_token');

      if (!token) {
        router.push('/parent/login');
        return;
      }

      try {
        // Fetch parent info
        const meResponse = await fetch(`${API_URL}/api/v1/auth/parent/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!meResponse.ok) {
          if (meResponse.status === 401) {
            localStorage.removeItem('parent_session_token');
            router.push('/parent/login');
            return;
          }
          throw new Error('Failed to load dashboard');
        }

        const parentData = await meResponse.json();

        // For now, set mock summary data (will be replaced with real API in TASK-PORTAL-012)
        setData({
          parent: {
            firstName: parentData.firstName,
            lastName: parentData.lastName,
            email: parentData.email,
            childrenCount: parentData.childrenCount || 0,
          },
          summary: {
            outstandingBalance: 0,
            overdueAmount: 0,
            unpaidInvoices: 0,
            lastPaymentDate: null,
            lastPaymentAmount: null,
          },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load dashboard'
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button
          className="mt-4 w-full"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome, {data.parent.firstName}!
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your account
        </p>
      </div>

      {/* Outstanding Balance Alert */}
      {data.summary.overdueAmount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have {formatCurrency(data.summary.overdueAmount)} overdue.
            Please make a payment to avoid late fees.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Outstanding Balance
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.summary.outstandingBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.summary.unpaidInvoices} unpaid invoice
              {data.summary.unpaidInvoices !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.summary.lastPaymentAmount
                ? formatCurrency(data.summary.lastPaymentAmount)
                : 'No payments yet'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.summary.lastPaymentDate
                ? new Date(data.summary.lastPaymentDate).toLocaleDateString()
                : 'Make your first payment'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Children</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.parent.childrenCount}</div>
            <p className="text-xs text-muted-foreground">
              Enrolled at the creche
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push('/parent/invoices')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">View Invoices</p>
                  <p className="text-sm text-muted-foreground">
                    See all your invoices
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push('/parent/statements')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Download Statements</p>
                  <p className="text-sm text-muted-foreground">
                    Get monthly statements
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => router.push('/parent/payments')}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Make a Payment</p>
                  <p className="text-sm text-muted-foreground">
                    Pay outstanding balance
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
