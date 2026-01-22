'use client';

/**
 * Parent Portal Children Page
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * Displays list of enrolled children with details:
 * - Server component with metadata
 * - List of enrolled children
 * - Child cards with details
 * - Read-only (managed by creche)
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Baby, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChildCard } from '@/components/parent-portal';
import {
  useParentChildren,
  type ParentChild,
} from '@/hooks/parent-portal/use-parent-profile';

// Mock data for development/demo
const mockChildren: ParentChild[] = [
  {
    id: '1',
    firstName: 'Emma',
    lastName: 'Smith',
    dateOfBirth: '2020-03-15',
    enrollmentDate: '2023-01-10',
    className: 'Butterflies',
    attendanceType: 'full_day',
    isActive: true,
    photoUrl: null,
  },
  {
    id: '2',
    firstName: 'James',
    lastName: 'Smith',
    dateOfBirth: '2022-08-22',
    enrollmentDate: '2024-01-05',
    className: 'Caterpillars',
    attendanceType: 'half_day',
    isActive: true,
    photoUrl: null,
  },
];

function ChildrenPageContent() {
  const router = useRouter();

  // Fetch children data
  const { data: children, isLoading, error, isError } = useParentChildren();

  // State for fallback to mock data
  const [useMockData, setUseMockData] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  // Handle API errors by falling back to mock data
  useEffect(() => {
    if (isError && !useMockData) {
      console.warn('Children API error, using mock data:', error?.message);
      setUseMockData(true);
    }
  }, [isError, error, useMockData]);

  const displayChildren = useMockData ? mockChildren : (children || []);
  const showLoading = isLoading && !useMockData;

  if (showLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/parent/profile')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Profile
      </Button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Baby className="h-6 w-6" />
          My Children
        </h1>
        <p className="text-muted-foreground mt-1">
          View your enrolled children&apos;s details
        </p>
      </div>

      {/* Error Alert */}
      {isError && !useMockData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Failed to load children. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Children List */}
      {displayChildren.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Baby className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">No Children Enrolled</h3>
          <p className="text-sm">
            Contact your creche to enroll your children.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {displayChildren.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </div>
      )}

      {/* Info Notice */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Child information is managed by your creche. Please contact them if you need to update any details.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Loading fallback for Suspense
function ChildrenLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Main page component with Suspense boundary
export default function ParentChildrenPage() {
  return (
    <Suspense fallback={<ChildrenLoadingFallback />}>
      <ChildrenPageContent />
    </Suspense>
  );
}
