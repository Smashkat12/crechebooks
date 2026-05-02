'use client';

/**
 * Staff Profile Page
 * TASK-PORTAL-025: Staff Portal Tax Documents and Profile
 *
 * Main page for staff profile management with:
 * - Personal info section (some editable, some read-only)
 * - Employment info section (read-only)
 * - Banking details section (read-only, masked account numbers)
 * - Emergency contact section (editable)
 * - Address update capability
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  StaffProfileForm,
  type StaffProfile,
  type UpdateProfileData,
} from '@/components/staff-portal/staff-profile-form';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';


// ============================================================================
// Loading Skeleton
// ============================================================================

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function StaffProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  // Fetch profile data
  const fetchProfile = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/staff-portal/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else {
        throw new Error('Failed to fetch profile');
      }
    } catch (err) {
      console.error('Profile API error:', err);
      setError('Unable to load profile. Please try refreshing.');
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
    fetchProfile(token);
  }, [router, fetchProfile]);

  // Handle profile update
  const handleUpdateProfile = async (data: UpdateProfileData) => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/staff-portal/profile`, {
        method: 'PUT',
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
        throw new Error(errorData.message || 'Failed to update profile');
      }

      // Refresh profile data
      await fetchProfile(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  // Refresh handler
  const handleRefresh = () => {
    const token = localStorage.getItem('staff_session_token');
    if (token) {
      fetchProfile(token);
    }
  };

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
            <h1 className="text-2xl font-bold">My Profile</h1>
            <p className="text-muted-foreground">
              View and manage your information
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Profile Form */}
      {profile && (
        <StaffProfileForm
          profile={profile}
          onUpdateProfile={handleUpdateProfile}
        />
      )}
    </div>
  );
}
