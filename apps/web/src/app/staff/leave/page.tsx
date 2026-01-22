'use client';

/**
 * Staff Leave Management Page
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Main page for staff leave management with:
 * - Leave balances display
 * - Leave request form
 * - Leave history/requests list
 * - Calendar view of scheduled leave
 * - BCEA policy information
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  PlusCircle,
  RefreshCw,
  Scale,
} from 'lucide-react';
import { LeaveBalanceDisplay, type LeaveBalanceItem } from '@/components/staff-portal/leave-balance-display';
import { LeaveRequestForm, type LeaveRequestFormData } from '@/components/staff-portal/leave-request-form';
import { LeaveHistory, type LeaveRequest } from '@/components/staff-portal/leave-history';
import { LeaveCalendar, type LeaveEvent } from '@/components/staff-portal/leave-calendar';
import { LeavePolicy } from '@/components/staff-portal/leave-policy';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

interface LeaveBalancesData {
  balances: LeaveBalanceItem[];
  cycleStartDate: Date | string;
  cycleEndDate: Date | string;
  employmentStartDate?: Date | string;
}

// ============================================================================
// Mock Data (for development)
// ============================================================================

function getMockBalances(): LeaveBalancesData {
  const year = new Date().getFullYear();
  return {
    balances: [
      {
        type: 'annual',
        name: 'Annual Leave',
        entitled: 15,
        used: 5,
        pending: 2,
        available: 8,
        cyclePeriod: `Jan - Dec ${year}`,
        bceoInfo: '15 working days per year as per BCEA Section 20',
      },
      {
        type: 'sick',
        name: 'Sick Leave',
        entitled: 30,
        used: 3,
        pending: 0,
        available: 27,
        cyclePeriod: `${year - 2} - ${year}`,
        bceoInfo: '30 days per 3-year cycle as per BCEA Section 22',
      },
      {
        type: 'family',
        name: 'Family Responsibility Leave',
        entitled: 3,
        used: 1,
        pending: 0,
        available: 2,
        cyclePeriod: `Jan - Dec ${year}`,
        bceoInfo: '3 days per year for family emergencies as per BCEA Section 27',
      },
    ],
    cycleStartDate: new Date(year, 0, 1),
    cycleEndDate: new Date(year, 11, 31),
    employmentStartDate: new Date(2023, 2, 15),
  };
}

function getMockRequests(): LeaveRequest[] {
  const today = new Date();
  return [
    {
      id: 'lr-001',
      type: 'annual',
      typeName: 'Annual Leave',
      startDate: new Date(today.getFullYear(), today.getMonth() + 1, 10),
      endDate: new Date(today.getFullYear(), today.getMonth() + 1, 12),
      days: 3,
      status: 'pending',
      reason: 'Family vacation',
      createdAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'lr-002',
      type: 'annual',
      typeName: 'Annual Leave',
      startDate: new Date(today.getFullYear(), today.getMonth() - 1, 15),
      endDate: new Date(today.getFullYear(), today.getMonth() - 1, 19),
      days: 5,
      status: 'approved',
      reason: 'Personal time off',
      createdAt: new Date(today.getFullYear(), today.getMonth() - 1, 5),
      reviewerName: 'Sarah Manager',
      reviewerComments: 'Approved. Enjoy your break!',
      reviewedAt: new Date(today.getFullYear(), today.getMonth() - 1, 6),
    },
    {
      id: 'lr-003',
      type: 'sick',
      typeName: 'Sick Leave',
      startDate: new Date(today.getFullYear(), today.getMonth() - 2, 8),
      endDate: new Date(today.getFullYear(), today.getMonth() - 2, 10),
      days: 3,
      status: 'approved',
      reason: 'Flu',
      createdAt: new Date(today.getFullYear(), today.getMonth() - 2, 8),
      reviewerName: 'Sarah Manager',
      reviewedAt: new Date(today.getFullYear(), today.getMonth() - 2, 8),
    },
    {
      id: 'lr-004',
      type: 'family',
      typeName: 'Family Responsibility Leave',
      startDate: new Date(today.getFullYear(), today.getMonth() - 3, 20),
      endDate: new Date(today.getFullYear(), today.getMonth() - 3, 20),
      days: 1,
      status: 'approved',
      reason: 'Child\'s school event',
      createdAt: new Date(today.getFullYear(), today.getMonth() - 3, 18),
      reviewerName: 'Sarah Manager',
      reviewedAt: new Date(today.getFullYear(), today.getMonth() - 3, 18),
    },
    {
      id: 'lr-005',
      type: 'annual',
      typeName: 'Annual Leave',
      startDate: new Date(today.getFullYear(), today.getMonth() - 4, 1),
      endDate: new Date(today.getFullYear(), today.getMonth() - 4, 3),
      days: 3,
      status: 'rejected',
      reason: 'Weekend trip',
      createdAt: new Date(today.getFullYear(), today.getMonth() - 4, -10),
      reviewerName: 'Sarah Manager',
      reviewerComments: 'Unfortunately this period is during our busiest time. Please consider alternative dates.',
      reviewedAt: new Date(today.getFullYear(), today.getMonth() - 4, -9),
    },
  ];
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64" />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function StaffLeavePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<LeaveBalancesData | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch leave data
  const fetchLeaveData = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch balances
      const balancesResponse = await fetch(`${API_URL}/api/staff-portal/leave/balances`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fetch requests
      const requestsResponse = await fetch(`${API_URL}/api/staff-portal/leave/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (balancesResponse.status === 401 || requestsResponse.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (balancesResponse.ok && requestsResponse.ok) {
        const balancesData = await balancesResponse.json();
        const requestsData = await requestsResponse.json();
        setBalances(balancesData);
        setRequests(requestsData.data || []);
      } else {
        throw new Error('Failed to fetch leave data');
      }
    } catch (err) {
      console.warn('Leave API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setBalances(getMockBalances());
      setRequests(getMockRequests());
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  // Initial load
  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchLeaveData(token);
  }, [router, fetchLeaveData]);

  // Handle leave request submission
  const handleSubmitRequest = async (data: LeaveRequestFormData) => {
    setIsSubmitting(true);
    const token = localStorage.getItem('staff_session_token');

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/leave/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to submit leave request');
      }

      // Refresh data after successful submission
      if (token) {
        await fetchLeaveData(token);
      }
      setActiveTab('history');
    } catch (err) {
      // Mock success for development
      if (error?.includes('sample data')) {
        const newRequest: LeaveRequest = {
          id: `lr-${Date.now()}`,
          type: data.type,
          typeName: data.type.charAt(0).toUpperCase() + data.type.slice(1) + ' Leave',
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          days: Math.ceil(
            (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1,
          status: 'pending',
          reason: data.reason,
          createdAt: new Date(),
        };
        setRequests((prev) => [newRequest, ...prev]);

        // Update pending balance
        if (balances) {
          const updatedBalances = {
            ...balances,
            balances: balances.balances.map((b) =>
              b.type === data.type
                ? { ...b, pending: b.pending + newRequest.days, available: b.available - newRequest.days }
                : b
            ),
          };
          setBalances(updatedBalances);
        }
        setActiveTab('history');
        return;
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle request cancellation
  const handleCancelRequest = async (id: string) => {
    const token = localStorage.getItem('staff_session_token');

    try {
      const response = await fetch(`${API_URL}/api/staff-portal/leave/requests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to cancel leave request');
      }

      // Refresh data
      if (token) {
        await fetchLeaveData(token);
      }
    } catch (err) {
      // Mock success for development
      if (error?.includes('sample data')) {
        const cancelledRequest = requests.find((r) => r.id === id);
        if (cancelledRequest) {
          setRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' as const } : r))
          );

          // Restore balance
          if (balances && cancelledRequest.status === 'pending') {
            const updatedBalances = {
              ...balances,
              balances: balances.balances.map((b) =>
                b.type === cancelledRequest.type
                  ? { ...b, pending: b.pending - cancelledRequest.days, available: b.available + cancelledRequest.days }
                  : b
              ),
            };
            setBalances(updatedBalances);
          }
        }
        return;
      }
      throw err;
    }
  };

  // Refresh handler
  const handleRefresh = () => {
    const token = localStorage.getItem('staff_session_token');
    if (token) {
      fetchLeaveData(token);
    }
  };

  // Convert requests to calendar events
  const calendarEvents: LeaveEvent[] = requests.map((r) => ({
    id: r.id,
    type: r.type,
    typeName: r.typeName,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
  }));

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/staff/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Leave Management</h1>
            <p className="text-muted-foreground">
              Request and track your leave
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="default" className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Leave Balances */}
      {balances && (
        <LeaveBalanceDisplay
          balances={balances.balances}
          cycleStartDate={balances.cycleStartDate}
          cycleEndDate={balances.cycleEndDate}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview" className="gap-2">
            <Calendar className="h-4 w-4 hidden sm:inline" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="request" className="gap-2">
            <PlusCircle className="h-4 w-4 hidden sm:inline" />
            New Request
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4 hidden sm:inline" />
            History
          </TabsTrigger>
          <TabsTrigger value="policy" className="gap-2">
            <Scale className="h-4 w-4 hidden sm:inline" />
            Policy
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Calendar */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <LeaveCalendar events={calendarEvents} />
            <div className="space-y-6">
              <LeaveHistory
                requests={requests.filter((r) => r.status === 'pending' || r.status === 'approved').slice(0, 5)}
                onCancelRequest={handleCancelRequest}
              />
            </div>
          </div>
        </TabsContent>

        {/* Request Tab - Form */}
        <TabsContent value="request">
          <div className="max-w-2xl">
            {balances && (
              <LeaveRequestForm
                balances={balances.balances}
                onSubmit={handleSubmitRequest}
                isSubmitting={isSubmitting}
              />
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <LeaveHistory
            requests={requests}
            onCancelRequest={handleCancelRequest}
          />
        </TabsContent>

        {/* Policy Tab */}
        <TabsContent value="policy">
          <LeavePolicy />
        </TabsContent>
      </Tabs>
    </div>
  );
}
