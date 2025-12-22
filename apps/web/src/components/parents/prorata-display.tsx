'use client';

import { useMemo } from 'react';
import { getDaysInMonth, getDate, format } from 'date-fns';
import { AlertCircle, Calculator } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import type { IFeeStructure } from '@crechebooks/types';

interface ProrataDisplayProps {
  feeStructure: IFeeStructure;
  enrollmentDate: Date;
}

interface ProrataCalculation {
  totalDays: number;
  remainingDays: number;
  dailyRate: number;
  prorataAmount: number;
  isFullMonth: boolean;
  monthName: string;
}

function calculateProrata(feeStructure: IFeeStructure, enrollmentDate: Date): ProrataCalculation {
  const enrollDate = new Date(enrollmentDate);
  const monthDays = getDaysInMonth(enrollDate);
  const dayOfMonth = getDate(enrollDate);
  const remainingDays = monthDays - dayOfMonth + 1;

  // Base amount is stored in cents
  const monthlyAmount = feeStructure.baseAmount / 100;
  const dailyRate = monthlyAmount / monthDays;
  const prorataAmount = dailyRate * remainingDays;

  return {
    totalDays: monthDays,
    remainingDays,
    dailyRate,
    prorataAmount,
    isFullMonth: dayOfMonth === 1,
    monthName: format(enrollDate, 'MMMM yyyy'),
  };
}

export function ProrataDisplay({ feeStructure, enrollmentDate }: ProrataDisplayProps) {
  const prorata = useMemo(() => {
    return calculateProrata(feeStructure, enrollmentDate);
  }, [feeStructure, enrollmentDate]);

  if (prorata.isFullMonth) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Full Month Billing</AlertTitle>
        <AlertDescription>
          Enrollment starts on the 1st of {prorata.monthName}. Full monthly fee of{' '}
          <strong>{formatCurrency(feeStructure.baseAmount / 100)}</strong> will apply.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Pro-rata Calculation for {prorata.monthName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly fee:</span>
            <span>{formatCurrency(feeStructure.baseAmount / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Days in month:</span>
            <span>{prorata.totalDays}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Daily rate:</span>
            <span>{formatCurrency(prorata.dailyRate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Days remaining:</span>
            <span>{prorata.remainingDays}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-2 mt-2">
            <span>First month charge:</span>
            <span className="text-lg text-primary">
              {formatCurrency(prorata.prorataAmount)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
