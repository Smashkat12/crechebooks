'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { BreakdownTable } from './breakdown-table';
import { ValidationWarnings } from './validation-warnings';

interface VAT201Data {
  period: string;
  totalSales: number;
  totalPurchases: number;
  outputVat: number;
  inputVat: number;
  netVat: number;
  transactions: {
    id: string;
    description: string;
    amount: number;
    vat: number;
    category: string;
  }[];
}

interface VAT201PreviewProps {
  data: VAT201Data;
  period: string;
}

export function VAT201Preview({ data, period }: VAT201PreviewProps) {
  const salesTransactions = useMemo(
    () => data.transactions.filter((t) => t.amount > 0),
    [data.transactions]
  );

  const purchaseTransactions = useMemo(
    () => data.transactions.filter((t) => t.amount < 0).map((t) => ({
      ...t,
      amount: Math.abs(t.amount),
      vat: Math.abs(t.vat),
    })),
    [data.transactions]
  );

  const warnings = useMemo(() => {
    const result: { type: 'error' | 'warning' | 'info'; field?: string; message: string }[] = [];

    if (data.outputVat < 0) {
      result.push({ type: 'error', field: 'Output VAT', message: 'Output VAT cannot be negative' });
    }

    if (data.totalSales === 0 && data.totalPurchases === 0) {
      result.push({ type: 'warning', message: 'No transactions found for this period' });
    }

    if (data.netVat < 0) {
      result.push({ type: 'info', message: 'VAT refund position - SARS may require additional documentation' });
    }

    return result;
  }, [data]);

  const formatPeriod = (p: string) => {
    const [year, month] = p.split('-');
    const endMonth = parseInt(month);
    const startMonth = endMonth - 1;
    const startMonthName = new Date(parseInt(year), startMonth - 1).toLocaleString('en-ZA', { month: 'long' });
    const endMonthName = new Date(parseInt(year), endMonth - 1).toLocaleString('en-ZA', { month: 'long' });
    return `${startMonthName} - ${endMonthName} ${year}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl">VAT201 Return</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Tax Period: {formatPeriod(period)}
            </p>
          </div>
          <Badge variant={data.netVat >= 0 ? 'default' : 'secondary'}>
            {data.netVat >= 0 ? 'Payable' : 'Refund'}
          </Badge>
        </CardHeader>
        <CardContent>
          <ValidationWarnings warnings={warnings} className="mb-6" />

          {/* Summary Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Total Sales (excl VAT)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.totalSales)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Output VAT (15%)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.outputVat)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Total Purchases (excl VAT)</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.totalPurchases)}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">Input VAT</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(data.inputVat)}</p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* VAT Calculation */}
          <div className="bg-primary/5 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Output VAT (collected)</span>
              <span className="font-mono">{formatCurrency(data.outputVat)}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Less: Input VAT (paid)</span>
              <span className="font-mono">({formatCurrency(data.inputVat)})</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between items-center">
              <span className="font-medium">
                {data.netVat >= 0 ? 'VAT Payable to SARS' : 'VAT Refund from SARS'}
              </span>
              <span className="font-mono font-bold text-lg">
                {formatCurrency(Math.abs(data.netVat))}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Breakdowns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <BreakdownTable
            title="Sales (Output)"
            rows={salesTransactions}
            showVat={true}
            totalLabel="Total Sales"
          />

          <BreakdownTable
            title="Purchases (Input)"
            rows={purchaseTransactions}
            showVat={true}
            totalLabel="Total Purchases"
          />
        </CardContent>
      </Card>
    </div>
  );
}
