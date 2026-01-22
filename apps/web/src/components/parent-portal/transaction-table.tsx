'use client';

/**
 * Transaction Table Component
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Displays transactions in a table with:
 * - Date column
 * - Description column (invoice number or payment reference)
 * - Type column (Invoice, Payment, Credit)
 * - Debit/Credit columns
 * - Running balance column
 * - Mobile-friendly layout (cards on small screens)
 */

import { Receipt, CreditCard, FileText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type TransactionType = 'invoice' | 'payment' | 'credit';

export interface StatementTransaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  debit: number | null;
  credit: number | null;
  balance: number;
}

interface TransactionTableProps {
  transactions: StatementTransaction[];
  isLoading?: boolean;
}

const typeConfig: Record<
  TransactionType,
  {
    label: string;
    variant: 'destructive' | 'success' | 'secondary';
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
  }
> = {
  invoice: {
    label: 'Invoice',
    variant: 'destructive',
    icon: FileText,
    colorClass: 'text-red-600',
  },
  payment: {
    label: 'Payment',
    variant: 'success',
    icon: CreditCard,
    colorClass: 'text-green-600',
  },
  credit: {
    label: 'Credit',
    variant: 'secondary',
    icon: Receipt,
    colorClass: 'text-blue-600',
  },
};

// Loading skeleton for desktop table
function TableSkeleton() {
  return (
    <div className="hidden md:block">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Loading skeleton for mobile cards
function CardsSkeleton() {
  return (
    <div className="md:hidden space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-4 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Empty state
function EmptyState() {
  return (
    <div className="text-center py-8 px-4">
      <Receipt className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
      <h3 className="text-sm font-medium mb-1">No transactions</h3>
      <p className="text-xs text-muted-foreground">
        No transactions recorded for this period.
      </p>
    </div>
  );
}

// Mobile card component
function TransactionCard({ transaction }: { transaction: StatementTransaction }) {
  const config = typeConfig[transaction.type];
  const TypeIcon = config.icon;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header: Date and Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {formatDate(transaction.date)}
            </span>
            <Badge variant={config.variant} className="text-xs">
              <TypeIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>

          {/* Description */}
          <p className="text-sm font-medium line-clamp-2">
            {transaction.description}
          </p>

          {/* Amount and Balance */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1">
              {transaction.debit ? (
                <>
                  <ArrowUpRight className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-600">
                    {formatCurrency(transaction.debit)}
                  </span>
                </>
              ) : transaction.credit ? (
                <>
                  <ArrowDownLeft className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-600">
                    {formatCurrency(transaction.credit)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Balance: </span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  transaction.balance > 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatCurrency(transaction.balance)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TransactionTable({
  transactions,
  isLoading,
}: TransactionTableProps) {
  if (isLoading) {
    return (
      <>
        <TableSkeleton />
        <CardsSkeleton />
      </>
    );
  }

  if (transactions.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[110px] text-right">Debit</TableHead>
                <TableHead className="w-[110px] text-right">Credit</TableHead>
                <TableHead className="w-[110px] text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => {
                const config = typeConfig[transaction.type];
                const TypeIcon = config.icon;

                return (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-sm">
                      {formatDate(transaction.date)}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[300px] truncate">
                      {transaction.description}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={config.variant}
                        className="text-xs whitespace-nowrap"
                      >
                        <TypeIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn('text-right font-medium', config.colorClass)}>
                      {transaction.debit ? formatCurrency(transaction.debit) : '-'}
                    </TableCell>
                    <TableCell className={cn('text-right font-medium', config.colorClass)}>
                      {transaction.credit ? formatCurrency(transaction.credit) : '-'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold',
                        transaction.balance > 0 ? 'text-red-600' : 'text-green-600'
                      )}
                    >
                      {formatCurrency(transaction.balance)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {transactions.map((transaction) => (
          <TransactionCard key={transaction.id} transaction={transaction} />
        ))}
      </div>
    </>
  );
}
