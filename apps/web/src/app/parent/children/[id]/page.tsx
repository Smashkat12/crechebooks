'use client';

/**
 * Parent Portal — Child Detail Page
 * Roadmap feature #9
 *
 * Read-only view of a single child's details.
 * Provides the "Edit child info" entry point for the fields
 * parents are permitted to update via the API (b82fc49).
 */

import { useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Baby,
  Calendar,
  Clock,
  GraduationCap,
  Loader2,
  Pencil,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { useParentChild } from '@/hooks/parent-portal/use-parent-profile';

// ============================================================================
// Helpers (mirrored from ChildCard)
// ============================================================================

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (years === 0) return `${months} month${months !== 1 ? 's' : ''}`;
  if (months === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years}y ${months}m`;
}

// ============================================================================
// Detail content
// ============================================================================

function ChildDetailContent({ childId }: { childId: string }) {
  const router = useRouter();

  const { data: child, isLoading, isError, error } = useParentChild(childId);

  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) router.push('/parent/login');
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !child) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/parent/children')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Children
        </Button>
        <Alert variant="destructive">
          <AlertDescription>
            {error?.message || 'Failed to load child information. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const age = child.dateOfBirth ? calculateAge(child.dateOfBirth) : null;

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/parent/children')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Children
      </Button>

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Baby className="h-6 w-6" />
            {child.firstName} {child.lastName}
          </h1>
          {age && (
            <p className="text-muted-foreground mt-1">{age} old</p>
          )}
        </div>
        <Button
          onClick={() => router.push(`/parent/children/${childId}/edit`)}
          className="gap-2 shrink-0"
        >
          <Pencil className="h-4 w-4" />
          Edit child info
        </Button>
      </div>

      {/* Avatar + Status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20 ring-2 ring-primary/10">
              {child.photoUrl ? (
                <AvatarImage
                  src={child.photoUrl}
                  alt={`${child.firstName} ${child.lastName}`}
                />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                {getInitials(child.firstName, child.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold">
                  {child.firstName} {child.lastName}
                </h2>
                <Badge variant={child.isActive ? 'default' : 'secondary'}>
                  {child.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {child.dateOfBirth && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Born {formatDate(child.dateOfBirth)}</span>
                </div>
              )}

              {child.enrollmentDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Baby className="h-4 w-4 shrink-0" />
                  <span>Enrolled {formatDate(child.enrollmentDate)}</span>
                </div>
              )}

              {child.className && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <GraduationCap className="h-4 w-4 shrink-0" />
                  <span>{child.className}</span>
                </div>
              )}

              {child.attendanceType && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    {child.attendanceType === 'full_day'
                      ? 'Full Day'
                      : child.attendanceType === 'half_day'
                        ? 'Half Day'
                        : 'After Care'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health & Emergency card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Health &amp; Emergency Details
          </CardTitle>
          <CardDescription>
            Information visible to creche staff in an emergency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Medical Notes */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              Medical notes / allergies
            </p>
            {child.medicalNotes ? (
              <p className="text-sm whitespace-pre-wrap">{child.medicalNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">None recorded</p>
            )}
          </div>

          {/* Emergency Contact */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              Emergency contact
            </p>
            {child.emergencyContact ? (
              <p className="text-sm">{child.emergencyContact}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">None recorded</p>
            )}
          </div>

          {/* Emergency Phone */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              Emergency phone
            </p>
            {child.emergencyPhone ? (
              <p className="text-sm">{child.emergencyPhone}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">None recorded</p>
            )}
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/parent/children/${childId}/edit`)}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit child info
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Read-only notice */}
      <Alert>
        <AlertDescription>
          To update your child&apos;s name or date of birth, please contact the creche office.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ============================================================================
// Loading fallback + page export
// ============================================================================

function ChildDetailLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function ChildDetailPage() {
  const params = useParams<{ id: string }>();
  const childId = params?.id ?? '';

  return (
    <Suspense fallback={<ChildDetailLoadingFallback />}>
      <ChildDetailContent childId={childId} />
    </Suspense>
  );
}
