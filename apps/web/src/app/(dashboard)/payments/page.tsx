'use client';

import { Card, CardContent } from '@/components/ui/card';
import { PaymentTable } from '@/components/payments';
import { useAuth } from '@/hooks/use-auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import Link from 'next/link';

export default function PaymentsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track and match incoming payments to invoices
          </p>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Payments are created when income transactions are categorized and allocated to parents.{' '}
          <Link href="/transactions" className="font-medium underline underline-offset-4">
            Go to Transactions
          </Link>{' '}
          to categorize income and create payments.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <PaymentTable tenantId={tenantId} />
        </CardContent>
      </Card>
    </div>
  );
}
