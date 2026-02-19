'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle } from 'lucide-react';

export default function PaymentFailedPage() {
  const searchParams = useSearchParams();
  const linkId = searchParams.get('linkId');

  return (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-8 w-8 text-red-600" />
        </div>
        <CardTitle className="text-2xl">Payment Failed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-muted-foreground">
          Your payment could not be processed. Please try again or use an alternative payment method.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {linkId && (
          <Button asChild>
            <Link href={`/pay/${linkId}`}>Try Again</Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href="mailto:support@crechebooks.co.za">Contact Support</a>
        </Button>
      </CardFooter>
    </Card>
  );
}
