'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function PaymentCancelledPage() {
  const searchParams = useSearchParams();
  const linkId = searchParams.get('linkId');

  return (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
          <AlertTriangle className="h-8 w-8 text-yellow-600" />
        </div>
        <CardTitle className="text-2xl">Payment Cancelled</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          Your payment was not completed. No charges have been made.
        </p>
      </CardContent>
      {linkId && (
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href={`/pay/${linkId}`}>Try Again</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
