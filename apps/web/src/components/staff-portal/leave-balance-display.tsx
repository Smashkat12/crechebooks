'use client';

/**
 * Leave Balance Display Component
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Displays leave balances for annual, sick, and family responsibility leave
 * with progress bars and BCEA entitlement information.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Calendar, Thermometer, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface LeaveBalanceItem {
  type: string;
  name: string;
  entitled: number;
  used: number;
  pending: number;
  available: number;
  cyclePeriod?: string;
  bceoInfo?: string;
}

export interface LeaveBalanceDisplayProps {
  balances: LeaveBalanceItem[];
  cycleStartDate?: Date | string;
  cycleEndDate?: Date | string;
  className?: string;
  showBCEAInfo?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

const getLeaveIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'annual':
      return Calendar;
    case 'sick':
      return Thermometer;
    case 'family':
      return Users;
    default:
      return Calendar;
  }
};

const getLeaveColor = (type: string): { bg: string; text: string; progress: string } => {
  switch (type.toLowerCase()) {
    case 'annual':
      return {
        bg: 'bg-blue-50 dark:bg-blue-950',
        text: 'text-blue-600 dark:text-blue-400',
        progress: 'bg-blue-500',
      };
    case 'sick':
      return {
        bg: 'bg-orange-50 dark:bg-orange-950',
        text: 'text-orange-600 dark:text-orange-400',
        progress: 'bg-orange-500',
      };
    case 'family':
      return {
        bg: 'bg-purple-50 dark:bg-purple-950',
        text: 'text-purple-600 dark:text-purple-400',
        progress: 'bg-purple-500',
      };
    default:
      return {
        bg: 'bg-gray-50 dark:bg-gray-900',
        text: 'text-gray-600 dark:text-gray-400',
        progress: 'bg-gray-500',
      };
  }
};

const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ============================================================================
// Leave Balance Card Component
// ============================================================================

interface LeaveBalanceCardProps {
  balance: LeaveBalanceItem;
  showBCEAInfo?: boolean;
}

function LeaveBalanceCardItem({ balance, showBCEAInfo }: LeaveBalanceCardProps) {
  const Icon = getLeaveIcon(balance.type);
  const colors = getLeaveColor(balance.type);
  const usedPercentage = balance.entitled > 0 ? ((balance.used + balance.pending) / balance.entitled) * 100 : 0;
  const isLow = balance.available <= 2 && balance.entitled > 0;

  return (
    <Card className={cn('overflow-hidden', colors.bg)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colors.bg)}>
              <Icon className={cn('h-5 w-5', colors.text)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{balance.name}</h3>
                {showBCEAInfo && balance.bceoInfo && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">{balance.bceoInfo}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {balance.cyclePeriod && (
                <p className="text-xs text-muted-foreground">{balance.cyclePeriod}</p>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="flex items-baseline gap-1">
              <span className={cn('text-2xl font-bold', colors.text)}>
                {balance.available}
              </span>
              <span className="text-sm text-muted-foreground">/ {balance.entitled}</span>
            </div>
            <p className="text-xs text-muted-foreground">days available</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {balance.used} used {balance.pending > 0 && `• ${balance.pending} pending`}
            </span>
            <span className="text-muted-foreground">
              {Math.round(usedPercentage)}% used
            </span>
          </div>
          <Progress value={usedPercentage} className="h-2" />
        </div>

        {isLow && (
          <Badge variant="outline" className="mt-3 text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
            Low balance
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LeaveBalanceDisplay({
  balances,
  cycleStartDate,
  cycleEndDate,
  className,
  showBCEAInfo = true,
}: LeaveBalanceDisplayProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Leave Balances</h2>
          {cycleStartDate && cycleEndDate && (
            <p className="text-sm text-muted-foreground">
              Cycle: {formatDate(cycleStartDate)} - {formatDate(cycleEndDate)}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {balances.map((balance) => (
          <LeaveBalanceCardItem
            key={balance.type}
            balance={balance}
            showBCEAInfo={showBCEAInfo}
          />
        ))}
      </div>
    </div>
  );
}

export default LeaveBalanceDisplay;
