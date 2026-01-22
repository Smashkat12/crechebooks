'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';

interface YtdEarningsProps {
  earnings: {
    grossEarnings: number;
    netEarnings: number;
    totalTax: number;
    totalDeductions: number;
  };
}

export function YtdEarnings({ earnings }: YtdEarningsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const stats = [
    {
      label: 'Gross Earnings',
      value: earnings.grossEarnings,
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Net Earnings',
      value: earnings.netEarnings,
      icon: DollarSign,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Total Tax (PAYE)',
      value: earnings.totalTax,
      icon: Percent,
      color: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Total Deductions',
      value: earnings.totalDeductions,
      icon: TrendingDown,
      color: 'text-red-600 dark:text-red-400',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Year-to-Date Earnings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
                <p className="text-lg font-semibold">{formatCurrency(stat.value)}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
