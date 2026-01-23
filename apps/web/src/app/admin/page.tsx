'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Admin Portal Page
 *
 * Role-based access control: Only SUPER_ADMIN users can access this page.
 * Regular users are redirected to their dashboard with an error message.
 */
export default function AdminPortalPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) return;

    // Redirect unauthenticated users to login
    if (!isAuthenticated) {
      router.push('/login?error=unauthorized&returnUrl=/admin');
      return;
    }

    // Strict role check: Only SUPER_ADMIN can access
    if (user?.role !== 'SUPER_ADMIN') {
      router.push('/dashboard?error=forbidden');
      return;
    }
  }, [user, isAuthenticated, isLoading, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Shield className="h-12 w-12 text-muted-foreground animate-pulse" />
          </div>
          <p className="text-muted-foreground">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // Don't render admin content until we've verified SUPER_ADMIN role
  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>You do not have permission to access the Admin Portal.</p>
            <Button onClick={() => router.push('/dashboard')} variant="outline" className="w-full">
              Return to Dashboard
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Render admin dashboard for SUPER_ADMIN users
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Admin Portal</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Manage contact submissions and demo requests
          </p>
        </div>
      </div>

      <AdminDashboard />
    </div>
  );
}
