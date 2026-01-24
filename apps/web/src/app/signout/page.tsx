'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/**
 * Sign Out Page
 *
 * This page handles complete sign-out by:
 * 1. Clearing the NextAuth session
 * 2. Redirecting to Auth0's logout endpoint to clear the Auth0 session
 *
 * This ensures the user is fully logged out and will need to re-authenticate.
 */
export default function SignOutPage() {
  const [isSigningOut, setIsSigningOut] = useState(true);

  useEffect(() => {
    const performSignOut = async () => {
      try {
        // First, clear the NextAuth session
        await signOut({ redirect: false });

        // Then redirect to Auth0 logout to clear the Auth0 session
        const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
        const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
        const returnTo = encodeURIComponent(window.location.origin + '/login');

        // Redirect to Auth0 logout endpoint
        window.location.href = `https://${auth0Domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;
      } catch (error) {
        console.error('Sign out error:', error);
        // Fallback: just redirect to login
        window.location.href = '/login';
      }
    };

    performSignOut();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl text-center">Signing Out</CardTitle>
          <CardDescription className="text-center">
            Please wait while we sign you out...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    </div>
  );
}
