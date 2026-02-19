'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CreditCard, AlertTriangle, Clock, Building2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface PaymentLinkData {
  shortCode: string;
  amountCents: number;
  description: string | null;
  status: string;
  expiresAt: string | null;
  parentName: string;
  invoiceNumber: string | null;
  tenantName: string | null;
}

function formatCurrency(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function CheckoutPage() {
  const params = useParams<{ shortCode: string }>();
  const shortCode = params.shortCode;

  const [data, setData] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    async function fetchLink() {
      try {
        const res = await fetch(`${API_URL}/api/v1/yoco/pay/${shortCode}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Payment link not found.');
          } else {
            setError('Something went wrong. Please try again.');
          }
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError('Unable to connect. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    }
    fetchLink();
  }, [shortCode]);

  async function handleCheckout() {
    setCheckingOut(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/yoco/pay/${shortCode}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message || 'Failed to start checkout. Please try again.');
        setCheckingOut(false);
        return;
      }

      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch {
      setError('Unable to connect. Please check your internet connection.');
      setCheckingOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const isInactive = data.status !== 'ACTIVE';

  return (
    <div className="space-y-4">
      {data.tenantName && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm font-medium">{data.tenantName}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Payment</CardTitle>
            <Badge variant={isInactive ? 'destructive' : 'default'}>
              {data.status === 'ACTIVE' ? 'Ready' : data.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">Amount due</p>
            <p className="text-3xl font-bold">{formatCurrency(data.amountCents)}</p>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{data.parentName}</span>
            </div>
            {data.invoiceNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-medium">{data.invoiceNumber}</span>
              </div>
            )}
            {data.expiresAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">
                  {new Date(data.expiresAt).toLocaleDateString('en-ZA', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          {isInactive && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>
                {data.status === 'EXPIRED'
                  ? 'Link Expired'
                  : data.status === 'USED'
                    ? 'Already Paid'
                    : 'Link Unavailable'}
              </AlertTitle>
              <AlertDescription>
                {data.status === 'EXPIRED'
                  ? 'This payment link has expired. Please request a new one from your creche.'
                  : data.status === 'USED'
                    ? 'This payment has already been completed.'
                    : 'This payment link is no longer active.'}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        {!isInactive && (
          <CardFooter>
            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={checkingOut}
            >
              {checkingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to payment...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay {formatCurrency(data.amountCents)}
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
