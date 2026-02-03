/**
 * TASK-QUOTE-002: Public Quote Accept Page
 * Form for recipients to confirm acceptance of a quote
 *
 * NO AUTHENTICATION REQUIRED - Access controlled by viewToken (UUID)
 */

'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function AcceptQuotePage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const [confirmedBy, setConfirmedBy] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    message: string;
    nextStep: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmedBy.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    try {
      const response = await fetch(`${apiUrl}/api/public/quotes/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmedBy: confirmedBy.trim(),
          email: email.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to accept quote');
      }

      setSuccess({
        message: data.message,
        nextStep: data.nextStep,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Quote Accepted!</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-4 text-muted-foreground">{success.message}</p>
            <Alert>
              <AlertTitle>What happens next?</AlertTitle>
              <AlertDescription>{success.nextStep}</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => router.push(`/quote/${token}`)}>
              View Quote Details
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="-ml-2"
            >
              <Link href={`/quote/${token}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Quote
              </Link>
            </Button>
          </div>
          <CardTitle className="text-2xl">Accept Quote</CardTitle>
          <CardDescription>
            Please confirm your acceptance by entering your details below.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="confirmedBy">
                Your Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="confirmedBy"
                type="text"
                placeholder="Enter your full name"
                value={confirmedBy}
                onChange={(e) => setConfirmedBy(e.target.value)}
                required
                maxLength={200}
                disabled={isSubmitting}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This will be recorded as the person who accepted the quote.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address (Optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                We&apos;ll send you a confirmation receipt if provided.
              </p>
            </div>

            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>By accepting this quote:</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>You confirm the quoted fees and services are acceptable</li>
                  <li>The creche will contact you to proceed with enrollment</li>
                  <li>This does not constitute a binding contract until enrollment is complete</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              asChild
              className="w-full sm:w-auto"
              disabled={isSubmitting}
            >
              <Link href={`/quote/${token}`}>Cancel</Link>
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={isSubmitting || !confirmedBy.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Acceptance
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
