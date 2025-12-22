'use client';

import { type LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  format?: 'currency' | 'number' | 'percentage';
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel = 'vs last period',
  icon: Icon,
  format = 'currency',
  className,
}: MetricCardProps) {
  const formatValue = (val: number) => {
    switch (format) {
      case 'currency':
        return formatCurrency(val);
      case 'percentage':
        return `${val.toFixed(1)}%`;
      case 'number':
      default:
        return val.toLocaleString('en-ZA');
    }
  };

  const isPositiveChange = change !== undefined && change > 0;
  const isNegativeChange = change !== undefined && change < 0;
  const hasNoChange = change === undefined || change === 0;

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold font-mono">{formatValue(value)}</p>
          </div>
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>

        {change !== undefined && (
          <div className="mt-4 flex items-center gap-1 text-sm">
            {isPositiveChange && (
              <>
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-600">+{Math.abs(change).toFixed(1)}%</span>
              </>
            )}
            {isNegativeChange && (
              <>
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="font-medium text-destructive">-{Math.abs(change).toFixed(1)}%</span>
              </>
            )}
            {hasNoChange && (
              <>
                <Minus className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-muted-foreground">0%</span>
              </>
            )}
            <span className="text-muted-foreground ml-1">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
