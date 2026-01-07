'use client';

/**
 * Staff Onboarding Page
 * TASK-STAFF-001: Staff Onboarding Workflow
 *
 * Page component for the staff onboarding wizard.
 * Displays the multi-step onboarding process for a specific staff member.
 */

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { OnboardingWizard } from '@/components/staff/OnboardingWizard';
import { useStaff } from '@/hooks/use-staff';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export default function StaffOnboardingPage() {
  const params = useParams();
  const router = useRouter();
  const staffId = params.id as string;
  const { data: staff, isLoading, error } = useStaff(staffId);

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Error Loading Staff</h2>
          <p className="text-muted-foreground mb-6">
            {error.message || 'Failed to load staff member details.'}
          </p>
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button onClick={() => router.refresh()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!staff) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Staff Member Not Found</h2>
          <p className="text-muted-foreground mb-6">
            The requested staff member could not be found.
          </p>
          <Button asChild>
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/staff/${staffId}`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Staff Onboarding</h1>
          <p className="text-muted-foreground">
            Complete the onboarding process for {staffName}
          </p>
        </div>
      </div>

      {/* Onboarding Wizard */}
      <OnboardingWizard staffId={staffId} staffName={staffName} />
    </div>
  );
}
