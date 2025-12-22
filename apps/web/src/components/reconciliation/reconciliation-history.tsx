'use client';

import { format } from 'date-fns';
import { CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import type { IReconciliation, ReconciliationStatus } from '@crechebooks/types';

interface ReconciliationHistoryProps {
  reconciliations: IReconciliation[];
  onView?: (reconciliation: IReconciliation) => void;
  isLoading?: boolean;
}

const statusConfig: Record<
  ReconciliationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  IN_PROGRESS: { label: 'In Progress', variant: 'secondary' },
  PENDING_REVIEW: { label: 'Pending Review', variant: 'outline' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  DISCREPANCY: { label: 'Discrepancy', variant: 'destructive' },
};

export function ReconciliationHistory({
  reconciliations,
  onView,
  isLoading = false,
}: ReconciliationHistoryProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reconciliation History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reconciliation History</CardTitle>
      </CardHeader>
      <CardContent>
        {reconciliations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No reconciliations yet</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Bank Balance</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliations.map((recon) => {
                  const status = statusConfig[recon.status];
                  const hasDiscrepancy = recon.discrepancy !== 0;

                  return (
                    <TableRow key={recon.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {format(new Date(recon.periodStart), 'dd MMM')} -{' '}
                            {format(new Date(recon.periodEnd), 'dd MMM yyyy')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(recon.statementBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasDiscrepancy ? (
                          <span className="font-mono text-destructive flex items-center justify-end gap-1">
                            <AlertCircle className="h-4 w-4" />
                            {formatCurrency(Math.abs(recon.discrepancy))}
                          </span>
                        ) : (
                          <span className="font-mono text-green-600 flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            R0.00
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recon.reconciledAt
                          ? format(new Date(recon.reconciledAt), 'dd MMM yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {onView && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onView(recon)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
