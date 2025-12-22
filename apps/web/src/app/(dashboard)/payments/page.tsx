'use client';

import { Upload } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentTable } from '@/components/payments';
import { useAuth } from '@/hooks/use-auth';

export default function PaymentsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track and match incoming payments
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/payments/import">
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Import Statement
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <PaymentTable tenantId={tenantId} />
        </CardContent>
      </Card>
    </div>
  );
}
