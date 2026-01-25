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

// Mock data for development/demo when API is unavailable
function getMockData(): DashboardData {
  const today = new Date();
  return {
    employmentStatus: {
      position: 'Early Childhood Development Practitioner',
      department: 'Education',
      startDate: new Date('2023-03-15').toISOString(),
      status: 'active',
      employeeNumber: 'EMP-001',
    },
    recentPayslips: [
      {
        id: 'ps-001',
        payDate: new Date(today.getFullYear(), today.getMonth(), 25).toISOString(),
        period: `${today.toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
        grossPay: 18500,
        netPay: 15234.56,
      },
      {
        id: 'ps-002',
        payDate: new Date(today.getFullYear(), today.getMonth() - 1, 25).toISOString(),
        period: `${new Date(today.getFullYear(), today.getMonth() - 1).toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
        grossPay: 18500,
        netPay: 15234.56,
      },
      {
        id: 'ps-003',
        payDate: new Date(today.getFullYear(), today.getMonth() - 2, 25).toISOString(),
        period: `${new Date(today.getFullYear(), today.getMonth() - 2).toLocaleString('default', { month: 'long' })} ${today.getFullYear()}`,
        grossPay: 18500,
        netPay: 15234.56,
      },
    ],
    leaveBalance: {
      annual: 15,
      annualUsed: 5,
      sick: 10,
      sickUsed: 2,
      family: 3,
      familyUsed: 0,
    },
    nextPayDate: new Date(today.getFullYear(), today.getMonth() + 1, 25).toISOString(),
    ytdEarnings: {
      grossEarnings: 111000,
      netEarnings: 91407.36,
      totalTax: 14850,
      totalDeductions: 4742.64,
    },
    announcements: [
      {
        id: 'ann-001',
        title: 'School Closure - Public Holiday',
        content:
          'The school will be closed on Monday for the public holiday. Normal operations resume on Tuesday.',
        createdAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'high',
      },
      {
        id: 'ann-002',
        title: 'Staff Meeting Reminder',
        content: 'Monthly staff meeting this Friday at 2pm in the main hall.',
        createdAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        priority: 'medium',
      },
    ],
  };
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

export default function StaffDashboardPage() {
  const router = useRouter();
  const [staffName, setStaffName] = useState<string>('Staff Member');
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

    // Try to get staff name from stored session data
    const storedName = localStorage.getItem('staff_name');
    if (storedName) {
      setStaffName(storedName);
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
      const response = await fetch(`${API_URL}/api/staff-portal/onboarding`, {
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
      const response = await fetch(`${API_URL}/api/staff-portal/dashboard`, {
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
      // Use mock data for development when API is unavailable
      console.warn('Dashboard API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setDashboardData(getMockData());
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
        <Alert variant="default" className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {error}
          </AlertDescription>
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
