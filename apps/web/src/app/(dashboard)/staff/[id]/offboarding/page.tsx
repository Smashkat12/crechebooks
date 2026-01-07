'use client';

/**
 * Staff Offboarding Page
 * TASK-STAFF-002: Staff Offboarding Workflow
 *
 * Displays the complete offboarding status for a staff member including:
 * - Offboarding status card with settlement info
 * - Asset returns tracking
 * - Document downloads
 */

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, User } from 'lucide-react';
import { OffboardingStatusCard } from '@/components/staff/OffboardingStatusCard';
import { AssetReturns } from '@/components/staff/AssetReturns';
import { OffboardingDialog } from '@/components/staff/OffboardingDialog';
import { useStaff } from '@/hooks/use-staff';
import { useOffboardingStatus } from '@/hooks/use-staff-offboarding';

export default function StaffOffboardingPage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;

  const { data: staff, isLoading: loadingStaff, error: staffError } = useStaff(staffId);
  const { data: offboardingStatus, isLoading: loadingOffboarding } =
    useOffboardingStatus(staffId);

  // Loading state
  if (loadingStaff) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Staff not found
  if (staffError || !staff) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Staff Member Not Found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The staff member you are looking for does not exist or has been removed.
          </p>
          <Button asChild className="mt-4">
            <Link href="/staff">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Staff List
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const staffName = `${staff.firstName} ${staff.lastName}`;
  const hasOffboarding = !!offboardingStatus;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/staff/${staffId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Offboarding: {staffName}</h1>
            <p className="text-sm text-muted-foreground">
              {staff.employeeNumber && `Employee #${staff.employeeNumber} - `}
              {staff.employmentType}
            </p>
          </div>
        </div>

        {/* Show start offboarding button if not already offboarding */}
        {!hasOffboarding && !loadingOffboarding && (
          <OffboardingDialog
            staffId={staffId}
            staffName={staffName}
            onComplete={() => router.refresh()}
          />
        )}
      </div>

      {/* No offboarding status - show prompt to start */}
      {!hasOffboarding && !loadingOffboarding && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <User className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No Offboarding in Progress</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            This staff member is not currently being offboarded. To start the
            offboarding process, click the button above.
          </p>
        </div>
      )}

      {/* Offboarding Status Card */}
      {hasOffboarding && <OffboardingStatusCard staffId={staffId} />}

      {/* Asset Returns */}
      {hasOffboarding && <AssetReturns staffId={staffId} />}

      {/* Quick Links */}
      <div className="flex flex-wrap gap-2 pt-4 border-t">
        <Button variant="outline" asChild>
          <Link href={`/staff/${staffId}`}>
            <User className="mr-2 h-4 w-4" />
            View Staff Profile
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/staff">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Staff List
          </Link>
        </Button>
      </div>
    </div>
  );
}
