'use client';

/**
 * Statement List Component
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Displays list of available statement periods with:
 * - List of months with statements available
 * - Click to view statement preview
 * - Shows statement status (generated vs available)
 * - Transaction count and balance summary
 */

import { FileBarChart2, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export type StatementStatus = 'available' | 'generating' | 'pending';

export interface StatementListItem {
  year: number;
  month: number;
  periodLabel: string;
  transactionCount: number;
  openingBalance: number;
  closingBalance: number;
  status: StatementStatus;
}

interface StatementListProps {
  statements: StatementListItem[];
  isLoading?: boolean;
  selectedYear: number;
  selectedMonth: number | null;
  onSelectStatement: (year: number, month: number) => void;
}

const statusConfig: Record<
  StatementStatus,
  { label: string; variant: 'success' | 'warning' | 'secondary'; icon: React.ComponentType<{ className?: string }> }
> = {
  available: { label: 'Available', variant: 'success', icon: CheckCircle },
  generating: { label: 'Generating', variant: 'warning', icon: Clock },
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
};

// Loading skeleton
function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Empty state
function EmptyState() {
  return (
    <div className="text-center py-8 px-4">
      <FileBarChart2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
      <h3 className="text-sm font-medium mb-1">No statements available</h3>
      <p className="text-xs text-muted-foreground">
        Statements will appear here once transactions are recorded.
      </p>
    </div>
  );
}

export function StatementList({
  statements,
  isLoading,
  selectedYear,
  selectedMonth,
  onSelectStatement,
}: StatementListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4" />
            {selectedYear} Statements
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ListSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <FileBarChart2 className="h-4 w-4" />
          {selectedYear} Statements
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {statements.length === 0 ? (
          <EmptyState />
        ) : (
          <ScrollArea className="h-[400px] pr-3">
            <div className="space-y-2">
              {statements.map((statement) => {
                const status = statusConfig[statement.status];
                const StatusIcon = status.icon;
                const isSelected =
                  statement.year === selectedYear && statement.month === selectedMonth;

                return (
                  <button
                    key={`${statement.year}-${statement.month}`}
                    onClick={() => onSelectStatement(statement.year, statement.month)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors',
                      'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                      isSelected && 'bg-primary/5 border-primary'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {statement.periodLabel}
                          </span>
                          <Badge
                            variant={status.variant}
                            className="text-xs h-5 px-1.5"
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{statement.transactionCount} transactions</span>
                          <span>•</span>
                          <span
                            className={cn(
                              statement.closingBalance > 0 && 'text-red-600',
                              statement.closingBalance < 0 && 'text-green-600'
                            )}
                          >
                            Closing: {formatCurrency(statement.closingBalance)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          'h-5 w-5 text-muted-foreground transition-colors',
                          isSelected && 'text-primary'
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
