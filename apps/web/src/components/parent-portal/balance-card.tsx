'use client';

import { CheckCircle2, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';

interface BalanceCardProps {
  currentBalance: number;
  nextPaymentDue?: { date: string; amount: number };
  currency?: string;
  onPayNow?: () => void;
}

export function BalanceCard({
  currentBalance,
  nextPaymentDue,
  currency = 'R',
  onPayNow,
}: BalanceCardProps) {
  const hasBalance = currentBalance > 0;

  return (
    <Card className={hasBalance ? 'border-primary/50' : 'border-green-500/50'}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
        {hasBalance ? (
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p
            className={`text-3xl font-bold ${hasBalance ? 'text-foreground' : 'text-green-600'}`}
          >
            {formatCurrency(currentBalance)}
          </p>
          {!hasBalance && (
            <p className="text-sm text-green-600 mt-1">
              Your account is up to date
            </p>
          )}
        </div>

        {nextPaymentDue && hasBalance && (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">Next payment due</p>
            <div className="flex items-center justify-between mt-1">
              <span className="font-medium">
                {formatCurrency(nextPaymentDue.amount)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDate(nextPaymentDue.date)}
              </span>
            </div>
          </div>
        )}

        {hasBalance && onPayNow && (
          <Button onClick={onPayNow} className="w-full mt-2">
            <CreditCard className="mr-2 h-4 w-4" />
            Pay Now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
