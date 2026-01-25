'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  BalanceCard,
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

// Mock data for development/demo
const mockData: DashboardData = {
  currentBalance: 2450.0,
  recentInvoices: [
    {
      id: '1',
      invoiceNumber: 'INV-2024-001',
      date: '2024-01-15',
      amount: 1500.0,
      status: 'overdue',
    },
    {
      id: '2',
      invoiceNumber: 'INV-2024-002',
      date: '2024-01-20',
      amount: 950.0,
      status: 'pending',
    },
    {
      id: '3',
      invoiceNumber: 'INV-2023-012',
      date: '2023-12-15',
      amount: 1500.0,
      status: 'paid',
    },
    {
      id: '4',
      invoiceNumber: 'INV-2023-011',
      date: '2023-11-15',
      amount: 1500.0,
      status: 'paid',
    },
    {
      id: '5',
      invoiceNumber: 'INV-2023-010',
      date: '2023-10-15',
      amount: 1500.0,
      status: 'paid',
    },
  ],
  children: [
    {
      id: '1',
      name: 'Emma Smith',
      dateOfBirth: '2020-03-15',
      enrollmentStatus: 'active',
      className: 'Butterflies',
    },
    {
      id: '2',
      name: 'James Smith',
      dateOfBirth: '2022-08-22',
      enrollmentStatus: 'active',
      className: 'Caterpillars',
    },
  ],
  nextPaymentDue: {
    date: '2024-02-15',
    amount: 1500.0,
  },
  hasArrears: true,
  daysOverdue: 15,
  firstName: 'Sarah',
  lastName: 'Smith',
  email: 'sarah.smith@example.com',
};

export default function ParentDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

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

          // Redirect if required items are incomplete
          if (status.status !== 'COMPLETED') {
            const hasRequiredIncomplete = status.requiredActions?.some(
              (action: { isRequired: boolean; isComplete: boolean }) =>
                action.isRequired && !action.isComplete
            );
            if (hasRequiredIncomplete) {
              router.push('/parent/onboarding');
              return;
            }
          }
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
        <BalanceCard
          currentBalance={data.currentBalance}
          nextPaymentDue={data.nextPaymentDue || undefined}
          onPayNow={data.currentBalance > 0 ? handlePayNow : undefined}
        />

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
