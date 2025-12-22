'use client';

import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
  isLoading?: boolean;
  limit?: number;
}

export function RecentTransactions({
  transactions,
  isLoading = false,
  limit = 5,
}: RecentTransactionsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const recentTransactions = transactions.slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Recent Transactions</CardTitle>
        <Link href="/transactions">
          <Button variant="ghost" size="sm">
            View all
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {recentTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransactions.map((transaction) => {
              const isIncome = transaction.amount > 0;
              return (
                <div
                  key={transaction.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div
                    className={cn(
                      'p-2 rounded-full',
                      isIncome ? 'bg-green-100' : 'bg-red-100'
                    )}
                  >
                    {isIncome ? (
                      <ArrowDownRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-red-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{transaction.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {format(new Date(transaction.date), 'dd MMM yyyy')}
                      </span>
                      {transaction.category && (
                        <>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">
                            {transaction.category}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>

                  <p
                    className={cn(
                      'font-mono font-medium',
                      isIncome ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {isIncome ? '+' : ''}
                    {formatCurrency(transaction.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
