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
// Mock Data (for development)
// ============================================================================

function getMockProfile(): StaffProfile {
  return {
    personal: {
      fullName: 'Thandi Nkosi',
      idNumber: '******1234085',
      dateOfBirth: new Date(1990, 4, 15),
      phone: '+27 82 123 4567',
      email: 'thandi.nkosi@crechebooks.co.za',
      address: '123 Main Street, Sandton, Johannesburg, Gauteng, 2196',
    },
    employment: {
      position: 'Early Childhood Development Practitioner',
      department: 'Education',
      startDate: new Date(2023, 2, 15),
      employmentType: 'Full-time',
      employeeNumber: 'EMP-001',
      managerName: 'Sarah Manager',
    },
    banking: {
      bankName: 'First National Bank',
      accountNumber: '****4521',
      branchCode: '250655',
      accountType: 'Cheque Account',
      updateNote: 'To update your banking details, please contact HR directly. Changes require verification for your protection.',
    },
    emergency: {
      contactName: 'Sipho Nkosi',
      relationship: 'Spouse',
      contactPhone: '+27 83 987 6543',
      alternatePhone: '+27 11 123 4567',
    },
    lastUpdated: new Date(),
  };
}

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
      const response = await fetch(`${API_URL}/api/staff-portal/profile`, {
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
      console.warn('Profile API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setProfile(getMockProfile());
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
      const response = await fetch(`${API_URL}/api/staff-portal/profile`, {
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
      // Mock success for development
      if (error?.includes('sample data') && profile) {
        const updatedProfile = { ...profile };

        if (data.phone) {
          updatedProfile.personal = { ...updatedProfile.personal, phone: data.phone };
        }
        if (data.email) {
          updatedProfile.personal = { ...updatedProfile.personal, email: data.email };
        }
        if (data.address) {
          updatedProfile.personal = { ...updatedProfile.personal, address: data.address };
        }
        if (data.emergency) {
          updatedProfile.emergency = { ...updatedProfile.emergency, ...data.emergency };
        }

        updatedProfile.lastUpdated = new Date();
        setProfile(updatedProfile);
        return;
      }
      throw err;
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
        <Alert variant="default" className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {error}
          </AlertDescription>
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
