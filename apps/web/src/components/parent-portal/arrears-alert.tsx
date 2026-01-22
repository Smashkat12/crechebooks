'use client';

import { AlertTriangle, CreditCard } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface ArrearsAlertProps {
  daysOverdue: number;
  amount: number;
  onPayNow?: () => void;
}

export function ArrearsAlert({ daysOverdue, amount, onPayNow }: ArrearsAlertProps) {
  const isUrgent = daysOverdue >= 30;

  return (
    <Alert variant="destructive" className={isUrgent ? 'border-red-600 bg-red-50' : ''}>
      <AlertTriangle className="h-5 w-5" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full ml-2">
        <div>
          <AlertTitle className="text-base">
            Account Overdue
          </AlertTitle>
          <AlertDescription className="mt-1">
            Your account is <span className="font-semibold">{daysOverdue} days</span> overdue
            with an outstanding balance of{' '}
            <span className="font-semibold">{formatCurrency(amount)}</span>.
            {isUrgent && (
              <span className="block mt-1 text-red-700">
                Please make a payment urgently to avoid service interruption.
              </span>
            )}
            {!isUrgent && ' Please make a payment to avoid late fees.'}
          </AlertDescription>
        </div>
        {onPayNow && (
          <Button
            variant={isUrgent ? 'default' : 'outline'}
            size="sm"
            onClick={onPayNow}
            className={isUrgent ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Pay Now
          </Button>
        )}
      </div>
    </Alert>
  );
}
