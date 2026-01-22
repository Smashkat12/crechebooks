'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type VerifyState = 'loading' | 'success' | 'error' | 'expired';

interface ParentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>('loading');
  const [error, setError] = useState('');
  const [user, setUser] = useState<ParentUser | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setError('No verification token provided');
      return;
    }

    const verifyToken = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/v1/auth/parent/verify?token=${encodeURIComponent(token)}`,
          {
            method: 'GET',
            credentials: 'include',
          }
        );

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
            setState('expired');
          } else {
            setState('error');
            setError(data.message || 'Verification failed');
          }
          return;
        }

        // Store session token in localStorage for parent portal
        if (data.sessionToken) {
          localStorage.setItem('parent_session_token', data.sessionToken);
        }

        setUser(data.parent);
        setState('success');

        // Redirect to dashboard after a brief success message
        setTimeout(() => {
          router.push('/parent/dashboard');
        }, 2000);
      } catch (err) {
        setState('error');
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred during verification'
        );
      }
    };

    verifyToken();
  }, [token, router]);

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <CardTitle className="text-2xl font-bold">Verifying...</CardTitle>
            <CardDescription className="text-base mt-2">
              Please wait while we verify your magic link
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Welcome back!</CardTitle>
            <CardDescription className="text-base mt-2">
              {user
                ? `Hello, ${user.firstName}! Redirecting to your dashboard...`
                : 'Redirecting to your dashboard...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Expired state
  if (state === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Link Expired</CardTitle>
            <CardDescription className="text-base mt-2">
              This magic link has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p>Magic links are valid for 15 minutes for your security.</p>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button asChild className="w-full h-12" size="lg">
              <Link href="/parent/login">
                <Mail className="mr-2 h-4 w-4" />
                Request New Link
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Verification Failed
          </CardTitle>
          <CardDescription className="text-base mt-2">
            {error || 'We could not verify your magic link'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p>
            The link may be invalid or already used. Please try requesting a new
            magic link.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button asChild className="w-full h-12" size="lg">
            <Link href="/parent/login">
              <Mail className="mr-2 h-4 w-4" />
              Try Again
            </Link>
          </Button>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Back to main site
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ParentVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
              <CardTitle className="text-2xl font-bold">Loading...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
