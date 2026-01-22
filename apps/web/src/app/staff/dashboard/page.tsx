'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  Loader2,
  Receipt,
  Calendar,
  FileText,
  Clock,
  DollarSign,
  ChevronRight,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StaffDashboardData {
  firstName: string;
  lastName: string;
  email: string;
  position?: string;
  department?: string;
  leaveBalance: {
    annual: number;
    sick: number;
    family: number;
  };
  nextPayday: {
    date: string;
    amount?: number;
  } | null;
  recentPayslips: {
    id: string;
    periodStart: string;
    periodEnd: string;
    netPay: number;
    status: 'available' | 'pending';
  }[];
  pendingLeaveRequests: number;
}

// Mock data for development/demo
const mockData: StaffDashboardData = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  position: 'Teacher',
  department: 'Education',
  leaveBalance: {
    annual: 15,
    sick: 10,
    family: 3,
  },
  nextPayday: {
    date: new Date(new Date().setDate(25)).toISOString(),
    amount: 2500000, // in cents
  },
  recentPayslips: [
    {
      id: '1',
      periodStart: '2024-12-01',
      periodEnd: '2024-12-31',
      netPay: 2450000,
      status: 'available',
    },
    {
      id: '2',
      periodStart: '2024-11-01',
      periodEnd: '2024-11-30',
      netPay: 2450000,
      status: 'available',
    },
    {
      id: '3',
      periodStart: '2024-10-01',
      periodEnd: '2024-10-31',
      netPay: 2350000,
      status: 'available',
    },
  ],
  pendingLeaveRequests: 1,
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatPeriod(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}`;
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      const token = localStorage.getItem('staff_session_token');

      if (!token) {
        router.push('/staff/login');
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/staff-portal/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('staff_session_token');
            router.push('/staff/login');
            return;
          }
          // If API fails, use mock data for development
          console.warn('Dashboard API not available, using mock data');
          setData(mockData);
          setIsLoading(false);
          return;
        }

        const dashboardData = await response.json();
        setData(dashboardData);
      } catch (err) {
        // Use mock data if API is unavailable
        console.warn('Dashboard API error, using mock data:', err);
        setData(mockData);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
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
        <h1 className="text-2xl font-bold">Welcome, {data.firstName}!</h1>
        <p className="text-muted-foreground">
          {data.position && data.department
            ? `${data.position} - ${data.department}`
            : 'Here\'s your employment overview'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Leave Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annual Leave</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.leaveBalance.annual} days</div>
            <p className="text-xs text-muted-foreground">
              Available balance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sick Leave</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.leaveBalance.sick} days</div>
            <p className="text-xs text-muted-foreground">
              Available balance
            </p>
          </CardContent>
        </Card>

        {/* Next Payday */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Payday</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.nextPayday ? formatDate(data.nextPayday.date) : 'N/A'}
            </div>
            {data.nextPayday?.amount && (
              <p className="text-xs text-muted-foreground">
                Est. {formatCurrency(data.nextPayday.amount)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pending Leave */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.pendingLeaveRequests}</div>
            <p className="text-xs text-muted-foreground">
              Leave requests pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks you might need</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
              <Link href="/staff/payslips">
                <Receipt className="h-6 w-6 text-emerald-600" />
                <span>View Payslips</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
              <Link href="/staff/leave">
                <Calendar className="h-6 w-6 text-emerald-600" />
                <span>Request Leave</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
              <Link href="/staff/tax-documents">
                <FileText className="h-6 w-6 text-emerald-600" />
                <span>Tax Documents</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" asChild>
              <Link href="/staff/profile">
                <Clock className="h-6 w-6 text-emerald-600" />
                <span>Update Profile</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Payslips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Payslips</CardTitle>
            <CardDescription>Your latest pay statements</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/staff/payslips">
              View All
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.recentPayslips.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No payslips available yet
            </p>
          ) : (
            <div className="space-y-4">
              {data.recentPayslips.map((payslip) => (
                <div
                  key={payslip.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {formatPeriod(payslip.periodStart, payslip.periodEnd)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(payslip.periodStart)} - {formatDate(payslip.periodEnd)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(payslip.netPay)}</p>
                    <p className="text-xs text-emerald-600">{payslip.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
