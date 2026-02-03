/**
 * TASK-QUOTE-002: Public Quote Decline Page
 * Form for recipients to decline a quote with optional reason
 *
 * NO AUTHENTICATION REQUIRED - Access controlled by viewToken (UUID)
 */

'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function DeclineQuotePage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setError(null);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

    try {
      const response = await fetch(`${apiUrl}/api/public/quotes/${token}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to decline quote');
      }

      setSuccess(data.message);
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">Quote Declined</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">{success}</p>
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
          <CardTitle className="text-2xl">Decline Quote</CardTitle>
          <CardDescription>
            We&apos;re sorry to see you go. Your feedback helps us improve.
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
              <Label htmlFor="reason">Reason for declining (optional)</Label>
              <Textarea
                id="reason"
                placeholder="Please let us know why you're declining this quote..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={500}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {reason.length}/500 characters
              </p>
            </div>

            <Alert>
              <AlertTitle>Common reasons for declining:</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>Fees are outside our budget</li>
                  <li>Found a closer location</li>
                  <li>Changed childcare plans</li>
                  <li>Need different services</li>
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
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Declining...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Confirm Decline
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
