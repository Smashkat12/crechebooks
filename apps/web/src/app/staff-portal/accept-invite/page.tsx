'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Mail,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { acceptStaffInvite } from '@/lib/api/staff';

type PageState = 'idle' | 'loading' | 'success' | 'error';

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<PageState>(token ? 'idle' : 'error');
  const [errorMessage, setErrorMessage] = useState(
    token ? '' : 'No invitation token found in the link. Please check the email you received.',
  );

  const handleAccept = async () => {
    setState('loading');
    setErrorMessage('');
    try {
      await acceptStaffInvite(token);
      setState('success');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again or contact your administrator.';
      setErrorMessage(message);
      setState('error');
    }
  };

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
            <CardDescription className="text-base mt-2">
              Your invitation has been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-muted-foreground">
            <p>
              We&apos;ve sent you a sign-in link. Click it to access your staff
              portal — no password needed.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/staff/login">
                <Mail className="h-4 w-4 mr-2" />
                Go to staff portal login
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Invitation problem</CardTitle>
            <CardDescription className="text-base mt-2">
              {errorMessage || 'This invitation could not be accepted.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p className="text-sm">
              The link may be invalid, already used, or expired. Contact your
              administrator for a new invitation.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button asChild variant="outline" className="w-full">
              <Link href="/staff/login">
                <Mail className="h-4 w-4 mr-2" />
                Go to staff portal login
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Idle / loading state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl font-bold">
            You&apos;ve been invited to CrecheBooks
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Accept your invitation to get access to the staff portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p className="text-sm">
            After accepting, we&apos;ll send you a sign-in link by email. No
            password is required.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
            size="lg"
            onClick={handleAccept}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting invitation...
              </>
            ) : (
              'Accept invitation'
            )}
          </Button>
          <Link
            href="/staff/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Already have an account? Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
              </div>
              <CardTitle className="text-2xl font-bold">Loading...</CardTitle>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
