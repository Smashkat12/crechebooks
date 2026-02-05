'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function ParentLoginPage() {
  const [email, setEmail] = useState('');
  const [formState, setFormState] = useState<FormState>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFormState('loading');

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/parent/magic-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send magic link');
      }

      setFormState('success');

      // Preserve redirect destination for after magic link verification
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (redirect) {
        sessionStorage.setItem('parent_login_redirect', redirect);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred. Please try again.'
      );
      setFormState('error');
    }
  };

  const handleRetry = () => {
    setFormState('idle');
    setError('');
  };

  // Success state
  if (formState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
            <CardDescription className="text-base mt-2">
              We&apos;ve sent a magic link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-muted-foreground">
            <p>
              Click the link in the email to sign in to your parent portal. The
              link will expire in 15 minutes.
            </p>
            <p className="text-sm">
              Didn&apos;t receive the email? Check your spam folder or{' '}
              <Button
                variant="link"
                className="p-0 h-auto font-normal"
                onClick={handleRetry}
              >
                try again
              </Button>
            </p>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="inline h-4 w-4 mr-1" />
              Back to main site
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Parent Portal</CardTitle>
          <CardDescription className="text-base mt-2">
            Enter your email to receive a magic link to sign in
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {formState === 'error' && error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={formState === 'loading'}
                className="h-12"
              />
              <p className="text-sm text-muted-foreground">
                Use the email registered with the creche
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full h-12"
              size="lg"
              disabled={formState === 'loading' || !email}
            >
              {formState === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending magic link...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Magic Link
                </>
              )}
            </Button>

            <div className="text-center">
              <Link
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to main site
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
