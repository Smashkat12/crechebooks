'use client';

import { AlertTriangle, AlertCircle, Copy, FileQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import type { IReconciliationItem } from '@crechebooks/types';

type DiscrepancyType = 'missing_transaction' | 'amount_mismatch' | 'duplicate';
type Severity = 'low' | 'medium' | 'high';

interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  description: string;
  amount: number;
  bankDate?: string;
  accountingDate?: string;
  severity: Severity;
}

interface DiscrepancyListProps {
  items: IReconciliationItem[];
  onResolve?: (itemId: string) => void;
}

const typeConfig: Record<DiscrepancyType, { label: string; icon: typeof AlertTriangle }> = {
  missing_transaction: { label: 'Missing Transaction', icon: FileQuestion },
  amount_mismatch: { label: 'Amount Mismatch', icon: AlertCircle },
  duplicate: { label: 'Duplicate', icon: Copy },
};

const severityConfig: Record<Severity, { variant: 'default' | 'secondary' | 'destructive' }> = {
  low: { variant: 'secondary' },
  medium: { variant: 'default' },
  high: { variant: 'destructive' },
};

// Convert reconciliation items with discrepancies to our display format
function itemToDiscrepancy(item: IReconciliationItem): Discrepancy | null {
  if (item.matched && !item.discrepancy) return null;

  let type: DiscrepancyType = 'missing_transaction';
  let severity: Severity = 'medium';

  if (item.discrepancy && item.matched) {
    type = 'amount_mismatch';
    severity = Math.abs(item.discrepancy) > 1000 ? 'high' : 'medium';
  } else if (!item.matched) {
    type = 'missing_transaction';
    severity = Math.abs(item.amount) > 5000 ? 'high' : Math.abs(item.amount) > 1000 ? 'medium' : 'low';
  }

  return {
    id: item.id,
    type,
    description: item.description,
    amount: item.discrepancy ?? item.amount,
    bankDate: new Date(item.date).toISOString(),
    severity,
  };
}

export function DiscrepancyList({ items, onResolve }: DiscrepancyListProps) {
  const discrepancies = items
    .map(itemToDiscrepancy)
    .filter((d): d is Discrepancy => d !== null)
    .sort((a, b) => {
      const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  if (discrepancies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Discrepancies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No discrepancies found</p>
            <p className="text-sm">All transactions are matched</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDiscrepancy = discrepancies.reduce((sum, d) => sum + Math.abs(d.amount), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Discrepancies ({discrepancies.length})</CardTitle>
        <Badge variant="destructive">Total: {formatCurrency(totalDiscrepancy / 100)}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {discrepancies.map((discrepancy) => {
            const config = typeConfig[discrepancy.type];
            const severity = severityConfig[discrepancy.severity];
            const Icon = config.icon;

            return (
              <div
                key={discrepancy.id}
                className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="p-2 rounded-full bg-muted">
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{discrepancy.description}</span>
                    <Badge variant={severity.variant} className="text-xs">
                      {discrepancy.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{config.label}</p>
                  {discrepancy.bankDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Date:{' '}
                      {new Date(discrepancy.bankDate).toLocaleDateString('en-ZA', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-mono font-medium text-destructive">
                    {formatCurrency(Math.abs(discrepancy.amount) / 100)}
                  </p>
                  {onResolve && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => onResolve(discrepancy.id)}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
