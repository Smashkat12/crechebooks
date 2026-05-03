'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PaymentTable } from '@/components/payments';
import { useAuth } from '@/hooks/use-auth';
import { ArrowRight } from 'lucide-react';

export default function PaymentsPage() {
  const router = useRouter();
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
        <Button onClick={() => router.push('/transactions')}>
          <ArrowRight className="h-4 w-4 mr-2" />
          Categorize transactions
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Payments are created when income transactions are categorized and allocated to parents.
      </p>

      <Card>
        <CardContent className="pt-6">
          <PaymentTable tenantId={tenantId} />
        </CardContent>
      </Card>
    </div>
  );
}
