'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface PaymentLinkData {
  amountCents: number;
  invoiceNumber: string | null;
  tenantName: string | null;
  parentName: string;
}

function formatCurrency(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const linkId = searchParams.get('linkId');

  const [data, setData] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(!!linkId);

  useEffect(() => {
    if (!linkId) return;
    async function fetchLink() {
      try {
        const res = await fetch(`${API_URL}/api/v1/yoco/pay/${linkId}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // Non-critical - page still shows success message
      } finally {
        setLoading(false);
      }
    }
    fetchLink();
  }, [linkId]);

  return (
    <Card className="text-center">
      <CardHeader className="pb-2">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <CardTitle className="text-2xl">Payment Successful</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : data ? (
          <div className="space-y-2 text-sm">
            <p className="text-3xl font-bold">{formatCurrency(data.amountCents)}</p>
            {data.invoiceNumber && (
              <p className="text-muted-foreground">
                Invoice: {data.invoiceNumber}
              </p>
            )}
            {data.tenantName && (
              <p className="text-muted-foreground">Paid to {data.tenantName}</p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Your payment has been processed successfully.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          A receipt will be sent to your registered email address. You can safely close this page.
        </p>
      </CardContent>
    </Card>
  );
}
