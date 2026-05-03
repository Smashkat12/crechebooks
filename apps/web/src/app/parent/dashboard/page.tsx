'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  BalanceCard,
  PendingPopBanner,
  RecentInvoices,
  ChildrenSummary,
  QuickActions,
  ArrearsAlert,
} from '@/components/parent-portal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface OnboardingStatus {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  requiredActions: Array<{ id: string; isComplete: boolean; isRequired: boolean }>;
}

interface DashboardInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

interface DashboardChild {
  id: string;
  name: string;
  dateOfBirth?: string;
  enrollmentStatus: 'active' | 'pending' | 'inactive';
  className?: string;
}

interface DashboardData {
  currentBalance: number;
  recentInvoices: DashboardInvoice[];
  children: DashboardChild[];
  nextPaymentDue: { date: string; amount: number } | null;
  hasArrears: boolean;
  daysOverdue: number | null;
  firstName: string;
  lastName: string;
  email: string;
}

export default function ParentDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [onboardingBannerDismissed, setOnboardingBannerDismissed] = useState(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      const token = localStorage.getItem('parent_session_token');

      if (!token) {
        router.push('/parent/login');
        return;
      }

      // First check onboarding status
      try {
        const onboardingResponse = await fetch(`${API_URL}/api/v1/parent-portal/onboarding`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (onboardingResponse.ok) {
          const status = await onboardingResponse.json();
          setOnboardingStatus(status);
        }
      } catch (err) {
        console.warn('Onboarding check failed:', err);
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/parent-portal/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('parent_session_token');
            router.push('/parent/login');
            return;
          }
          setError('Unable to load your dashboard. Please try again.');
          setIsLoading(false);
          return;
        }

        const dashboardData = await response.json();
        setData(dashboardData);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        setError('Unable to connect to the server. Please check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [router]);

  const handlePayNow = () => {
    router.push('/parent/payments');
  };

  const handleViewAllInvoices = () => {
    router.push('/parent/invoices');
  };

  const handleViewInvoice = (invoiceId: string) => {
    router.push(`/parent/invoices/${invoiceId}`);
  };

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
        <h1 className="text-2xl font-bold">Welcome, {data.firstName}!</h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your account
        </p>
      </div>

      {/* Onboarding incomplete banner */}
      {!onboardingBannerDismissed &&
        onboardingStatus &&
        onboardingStatus.status !== 'COMPLETED' &&
        onboardingStatus.requiredActions?.some(
          (a) => a.isRequired && !a.isComplete
        ) && (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 flex items-start gap-3">
            <AlertDescription className="flex-1 text-blue-900 dark:text-blue-100">
              Complete your profile to unlock all portal features.{' '}
              <Link
                href="/parent/onboarding"
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Complete profile
              </Link>
            </AlertDescription>
            <button
              onClick={() => setOnboardingBannerDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        )}

      {/* Arrears Alert Banner */}
      {data.hasArrears && data.daysOverdue && (
        <ArrearsAlert
          daysOverdue={data.daysOverdue}
          amount={data.currentBalance}
          onPayNow={handlePayNow}
        />
      )}

      {/* Balance and Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <BalanceCard
            currentBalance={data.currentBalance}
            nextPaymentDue={data.nextPaymentDue || undefined}
            onPayNow={data.currentBalance > 0 ? handlePayNow : undefined}
          />
          <PendingPopBanner />
        </div>

        {/* Children Summary */}
        <div className="md:col-span-1 lg:col-span-2">
          <ChildrenSummary enrolledChildren={data.children} />
        </div>
      </div>

      {/* Recent Invoices */}
      <RecentInvoices
        invoices={data.recentInvoices}
        onViewAll={handleViewAllInvoices}
        onViewInvoice={handleViewInvoice}
      />

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}
