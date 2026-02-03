'use client';

/**
 * TASK-ACCT-UI-001: Trial Balance Page
 * View the trial balance report for month-end reconciliation.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarIcon, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { TrialBalanceTable } from '@/components/accounting/trial-balance-table';
import { useTrialBalance } from '@/hooks/use-accounts';

export default function TrialBalancePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const asOfDate = format(selectedDate, 'yyyy-MM-dd');

  const { data: trialBalance, isLoading, error } = useTrialBalance(asOfDate);

  const handlePrint = () => {
    window.print();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load trial balance</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Link href="/accounting/accounts">
            <Button variant="outline" className="mt-4">
              Back to Accounts
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/accounting/accounts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trial Balance</h1>
            <p className="text-muted-foreground">
              View account balances for month-end reconciliation
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('justify-start text-left font-normal')}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Trial Balance Report */}
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance Report</CardTitle>
          <CardDescription>
            As of {format(selectedDate, 'MMMM d, yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <div className="border rounded-md">
                <div className="grid grid-cols-4 gap-4 p-4 border-b bg-muted/50">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-4 gap-4 p-4 border-b">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ) : trialBalance ? (
            <TrialBalanceTable trialBalance={trialBalance} />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No trial balance data available for the selected date.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {trialBalance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Debits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {new Intl.NumberFormat('en-ZA', {
                  style: 'currency',
                  currency: 'ZAR',
                }).format(trialBalance.totalDebits / 100)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {new Intl.NumberFormat('en-ZA', {
                  style: 'currency',
                  currency: 'ZAR',
                }).format(trialBalance.totalCredits / 100)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Balance Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-bold',
                  trialBalance.isBalanced ? 'text-green-600' : 'text-destructive'
                )}
              >
                {trialBalance.isBalanced ? 'Balanced' : 'Out of Balance'}
              </p>
              {!trialBalance.isBalanced && (
                <p className="text-sm text-destructive mt-1">
                  Difference:{' '}
                  {new Intl.NumberFormat('en-ZA', {
                    style: 'currency',
                    currency: 'ZAR',
                  }).format(Math.abs(trialBalance.totalDebits - trialBalance.totalCredits) / 100)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
