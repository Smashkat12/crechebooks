'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useStatement, formatCentsToRands, type StatementStatus } from '@/hooks/use-statements';

interface StatementDetailDialogProps {
  statementId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const statusVariants: Record<StatementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  FINAL: 'default',
  DELIVERED: 'outline',
  CANCELLED: 'destructive',
};

const lineTypeLabels: Record<string, string> = {
  OPENING_BALANCE: 'Opening Balance',
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  CREDIT_NOTE: 'Credit Note',
  ADJUSTMENT: 'Adjustment',
  CLOSING_BALANCE: 'Closing Balance',
};

export function StatementDetailDialog({
  statementId,
  isOpen,
  onClose,
}: StatementDetailDialogProps) {
  const { data: statement, isLoading, error } = useStatement(statementId ?? '', isOpen && !!statementId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? (
              <span className="inline-block h-6 w-48 animate-pulse rounded-md bg-primary/10" />
            ) : (
              <>Statement {statement?.statement_number}</>
            )}
          </DialogTitle>
          <DialogDescription>
            {isLoading ? (
              <span className="inline-block h-4 w-64 animate-pulse rounded-md bg-primary/10" />
            ) : statement ? (
              <>
                {statement.parent.name} - {new Date(statement.period_start).toLocaleDateString('en-ZA')} to{' '}
                {new Date(statement.period_end).toLocaleDateString('en-ZA')}
              </>
            ) : (
              'Statement details'
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-center py-8 text-destructive">
            Failed to load statement: {error.message}
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        )}

        {statement && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Opening Balance</div>
                <div className="text-lg font-semibold">
                  {formatCentsToRands(statement.opening_balance_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Total Charges</div>
                <div className="text-lg font-semibold text-red-600">
                  {formatCentsToRands(statement.total_charges_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Total Payments</div>
                <div className="text-lg font-semibold text-green-600">
                  {formatCentsToRands(statement.total_payments_cents)}
                </div>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">Closing Balance</div>
                <div className={`text-lg font-semibold ${statement.closing_balance_cents > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCentsToRands(statement.closing_balance_cents)}
                </div>
              </div>
            </div>

            {/* Status and Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant={statusVariants[statement.status]}>
                  {statement.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Generated: {new Date(statement.generated_at).toLocaleString('en-ZA')}
                </span>
              </div>
              {statement.total_credits_cents > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Credits Applied: </span>
                  <span className="text-green-600 font-medium">
                    {formatCentsToRands(statement.total_credits_cents)}
                  </span>
                </div>
              )}
            </div>

            {/* Transaction Lines */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {new Date(line.date).toLocaleDateString('en-ZA', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </TableCell>
                      <TableCell>{line.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {lineTypeLabels[line.line_type] ?? line.line_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {line.reference_number ?? '-'}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {line.debit_cents > 0 ? formatCentsToRands(line.debit_cents) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {line.credit_cents > 0 ? formatCentsToRands(line.credit_cents) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCentsToRands(line.balance_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Parent Info */}
            <div className="text-sm text-muted-foreground">
              <strong>Parent:</strong> {statement.parent.name}
              {statement.parent.email && <> | {statement.parent.email}</>}
              {statement.parent.phone && <> | {statement.parent.phone}</>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
