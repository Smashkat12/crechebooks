'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  Receipt,
  Calendar,
  FileText,
  User,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EmploymentCard,
  RecentPayslips,
  LeaveBalanceCard,
  NextPayCard,
  Announcements,
  YtdEarnings,
} from '@/components/staff-portal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DashboardData {
  employmentStatus: {
    position: string;
    department?: string;
    startDate: Date | string;
    status: 'active' | 'probation' | 'terminated';
    employeeNumber?: string;
  };
  recentPayslips: Array<{
    id: string;
    payDate: Date | string;
    period: string;
    grossPay: number;
    netPay: number;
  }>;
  leaveBalance: {
    annual: number;
    annualUsed: number;
    sick: number;
    sickUsed: number;
    family: number;
    familyUsed: number;
  };
  nextPayDate: Date | string;
  ytdEarnings: {
    grossEarnings: number;
    netEarnings: number;
    totalTax: number;
    totalDeductions: number;
  };
  announcements: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: Date | string;
    priority: 'low' | 'medium' | 'high';
  }>;
}


function QuickActionCard({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-medium text-center">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

interface OnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  requiredActions: Array<{ id: string; isComplete: boolean; isRequired: boolean }>;
}

interface StaffInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/** Derive the greeting name from staff info fields. */
function resolveGreetingName(info: StaffInfo, fallback?: string): string {
  const fullName = [info.firstName, info.lastName].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  if (fallback) return fallback;
  if (info.email) return info.email;
  return 'there';
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [staffName, setStaffName] = useState<string>('there');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');

    if (!token) {
      router.push('/staff/login');
      return;
    }

    // Resolve greeting name: localStorage value takes precedence (set at login),
    // otherwise fetch from profile endpoint.
    const storedName = localStorage.getItem('staff_name');
    if (storedName) {
      setStaffName(storedName);
    } else {
      fetch(`${API_URL}/api/staff-portal/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          // Profile response shape: { personal: { fullName, email, ... }, ... }
          const info: StaffInfo = {};
          if (data.personal?.fullName) {
            const parts = (data.personal.fullName as string).trim().split(/\s+/);
            info.firstName = parts[0];
            info.lastName = parts.slice(1).join(' ') || undefined;
          }
          if (data.personal?.email) info.email = data.personal.email as string;
          setStaffName(resolveGreetingName(info));
        })
        .catch(() => {
          // keep default 'there'
        });
    }

    fetchDashboardData(token);
    fetchOnboardingStatus(token);
  }, [router]);

  // Redirect to onboarding if required items are incomplete
  useEffect(() => {
    if (onboardingStatus && onboardingStatus.status !== 'COMPLETED') {
      // Check if any required items are incomplete
      const hasRequiredIncomplete = onboardingStatus.requiredActions?.some(
        (action) => action.isRequired && !action.isComplete
      );
      if (hasRequiredIncomplete) {
        router.push('/staff/onboarding');
      }
    }
  }, [onboardingStatus, router]);

  const fetchOnboardingStatus = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/staff-portal/onboarding`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOnboardingStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch onboarding status:', err);
    }
  };

  const fetchDashboardData = async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/staff-portal/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('staff_session_token');
          localStorage.removeItem('staff_name');
          router.push('/staff/login');
          return;
        }
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      setDashboardData(data);
    } catch (err) {
      console.error('Dashboard API error:', err);
      setError('Unable to load dashboard. Please try refreshing.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('staff_session_token');
      if (token) {
        await fetch(`${API_URL}/api/v1/auth/staff/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Continue with logout even if API call fails
    } finally {
      localStorage.removeItem('staff_session_token');
      localStorage.removeItem('staff_name');
      router.push('/staff/login');
    }
  };

  const handleRefresh = () => {
    const token = localStorage.getItem('staff_session_token');
    if (token) {
      fetchDashboardData(token);
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {staffName.split(' ')[0]}!
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s your employment overview
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Onboarding redirect handled in useEffect - staff with incomplete required items are redirected */}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickActionCard href="/staff/payslips" icon={Receipt} label="View Payslips" />
        <QuickActionCard href="/staff/leave" icon={Calendar} label="Request Leave" />
        <QuickActionCard
          href="/staff/tax-documents"
          icon={FileText}
          label="Tax Documents"
        />
        <QuickActionCard href="/staff/profile" icon={User} label="My Profile" />
      </div>

      {dashboardData && (
        <>
          {/* Top Row - Pay and Employment */}
          <div className="grid md:grid-cols-2 gap-6">
            <NextPayCard nextPayDate={dashboardData.nextPayDate} />
            <EmploymentCard {...dashboardData.employmentStatus} />
          </div>

          {/* Middle Row - Payslips and Leave */}
          <div className="grid md:grid-cols-2 gap-6">
            <RecentPayslips payslips={dashboardData.recentPayslips} />
            <LeaveBalanceCard leaveBalance={dashboardData.leaveBalance} />
          </div>

          {/* Bottom Row - YTD and Announcements */}
          <div className="grid md:grid-cols-2 gap-6">
            <YtdEarnings earnings={dashboardData.ytdEarnings} />
            <Announcements announcements={dashboardData.announcements} />
          </div>
        </>
      )}
    </div>
  );
}
