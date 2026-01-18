'use client';

/**
 * Leave Balance Card
 * TASK-WEB-051: Display leave balances with progress bars
 *
 * Shows the current leave balances for a staff member including:
 * - Balance progress bars (used/entitled)
 * - Request Leave button
 * - Loading and empty states
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Plus, Clock, AlertCircle } from 'lucide-react';
import { useLeaveBalances, type LeaveBalance } from '@/hooks/use-leave';
import { LeaveRequestDialog } from './LeaveRequestDialog';
// cn imported for future use in styling variants
// import { cn } from '@/lib/utils';

interface LeaveBalanceCardProps {
  staffId: string;
}

/**
 * Get color variant based on balance percentage
 */
function getBalanceColor(used: number, total: number): string {
  if (total === 0) return 'bg-muted';
  const percentage = (used / total) * 100;
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 75) return 'bg-yellow-500';
  return 'bg-primary';
}

/**
 * Format balance display value
 */
function formatBalance(value: number, units: 'days' | 'hours'): string {
  const formatted = Number.isInteger(value) ? value : value.toFixed(1);
  return `${formatted} ${units}`;
}

/**
 * Individual leave type balance row
 */
function LeaveBalanceRow({ balance }: { balance: LeaveBalance }) {
  const totalEntitled = balance.openingBalance + balance.accrued + balance.adjustment;
  const used = balance.taken;
  const pending = balance.pending;
  const available = balance.currentBalance;

  // Calculate percentage used (cap at 100%)
  const usedPercentage = totalEntitled > 0 ? Math.min((used / totalEntitled) * 100, 100) : 0;
  const pendingPercentage =
    totalEntitled > 0 ? Math.min(((used + pending) / totalEntitled) * 100, 100) : 0;

  const progressColor = getBalanceColor(used, totalEntitled);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{balance.leaveTypeName}</span>
        <span className="text-muted-foreground">
          {formatBalance(available, balance.units)} available
        </span>
      </div>

      <div className="relative">
        {/* Base progress bar showing used */}
        <Progress
          value={usedPercentage}
          className="h-2"
          // Apply custom color to indicator
          style={
            {
              '--progress-color': progressColor,
            } as React.CSSProperties
          }
        />

        {/* Pending overlay (striped pattern) */}
        {pending > 0 && (
          <div
            className="absolute top-0 h-2 opacity-50 rounded-full"
            style={{
              left: `${usedPercentage}%`,
              width: `${pendingPercentage - usedPercentage}%`,
              background:
                'repeating-linear-gradient(45deg, hsl(var(--primary)), hsl(var(--primary)) 2px, transparent 2px, transparent 4px)',
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>Used: {formatBalance(used, balance.units)}</span>
          {pending > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Pending: {formatBalance(pending, balance.units)}
            </span>
          )}
        </div>
        <span>Total: {formatBalance(totalEntitled, balance.units)}</span>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for leave balance card
 */
function LeaveBalanceCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-32" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Empty state when no leave balances exist
 */
function EmptyLeaveBalances() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Calendar className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">No leave balances available</p>
      <p className="text-xs text-muted-foreground mt-1">
        Leave types may not be configured for this employee
      </p>
    </div>
  );
}

/**
 * Error state for leave balances
 */
function LeaveBalanceError({ error }: { error: Error | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="rounded-full bg-red-100 p-3 mb-3">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <p className="text-sm text-muted-foreground">Failed to load leave balances</p>
      <p className="text-xs text-muted-foreground mt-1">{error?.message || 'Unknown error'}</p>
    </div>
  );
}

export function LeaveBalanceCard({ staffId }: LeaveBalanceCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: balances, isLoading, error } = useLeaveBalances(staffId);

  // Loading state
  if (isLoading) {
    return <LeaveBalanceCardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Leave Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveBalanceError error={error} />
        </CardContent>
      </Card>
    );
  }

  // Filter to only show active leave types with balances
  const activeBalances = balances?.filter(
    (b) => b.openingBalance > 0 || b.accrued > 0 || b.taken > 0 || b.pending > 0
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5" />
              Leave Balances
            </span>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Request Leave
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!activeBalances || activeBalances.length === 0 ? (
            <EmptyLeaveBalances />
          ) : (
            <div className="space-y-4">
              {activeBalances.map((balance) => (
                <LeaveBalanceRow key={balance.leaveTypeId} balance={balance} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <LeaveRequestDialog staffId={staffId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
