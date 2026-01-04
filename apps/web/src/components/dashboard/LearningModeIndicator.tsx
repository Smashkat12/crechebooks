'use client';

import { Brain, TrendingUp, X, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { LearningModeProgress } from '@/hooks/useLearningMode';

export interface LearningModeIndicatorProps {
  progress: LearningModeProgress;
  onDismiss?: () => void;
}

/**
 * Learning Mode Indicator Component
 * TASK-TRANS-023: Learning Mode Indicator for New Tenants
 *
 * Displays learning mode status with:
 * - Progress bar showing completion
 * - Days remaining and corrections count
 * - Encouraging messaging
 * - Dismissible UI
 */
export function LearningModeIndicator({
  progress,
  onDismiss,
}: LearningModeIndicatorProps) {
  if (!progress.isLearningMode) {
    return null;
  }

  const {
    daysRemaining,
    correctionsCount,
    correctionsTarget,
    progressPercent,
    currentAccuracy,
  } = progress;

  // Determine which is closer to completion
  const daysProgress = Math.min(
    ((90 - daysRemaining) / 90) * 100,
    100,
  );
  const correctionsProgress = Math.min(
    (correctionsCount / correctionsTarget) * 100,
    100,
  );

  const isDaysCloser = daysProgress > correctionsProgress;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base">
              AI Learning Mode
            </CardTitle>
            <Badge variant="secondary" className="ml-1">
              Active
            </Badge>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Message */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Our AI is learning your transaction patterns. The more corrections you make,
            the smarter it gets! Your accuracy improves with each edit.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-blue-700 dark:text-blue-300">
              Learning Progress
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <Progress
            value={progressPercent}
            className="h-2"
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Days Remaining */}
          <div className="space-y-1 rounded-lg border border-blue-100 bg-white/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">
                Days Remaining
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {daysRemaining}
            </p>
            <p className="text-xs text-muted-foreground">
              of 90 days
            </p>
          </div>

          {/* Corrections Count */}
          <div className="space-y-1 rounded-lg border border-blue-100 bg-white/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">
                Corrections Made
              </span>
            </div>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {correctionsCount}
            </p>
            <p className="text-xs text-muted-foreground">
              of {correctionsTarget} target
            </p>
          </div>
        </div>

        {/* Current Accuracy */}
        {currentAccuracy > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-green-100 bg-green-50/50 p-2.5 dark:border-green-900 dark:bg-green-950/20">
            <span className="text-sm text-muted-foreground">
              Current Accuracy
            </span>
            <span className="text-lg font-bold text-green-700 dark:text-green-400">
              {currentAccuracy.toFixed(1)}%
            </span>
          </div>
        )}

        {/* Next Milestone */}
        <div className="rounded-lg border border-blue-200 bg-blue-100/50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
            💡 Next Milestone:{' '}
            {isDaysCloser
              ? `Make ${correctionsTarget - correctionsCount} more corrections`
              : `Wait ${daysRemaining} more days`}
          </p>
        </div>

        {/* Encouraging Message */}
        <p className="text-center text-xs text-muted-foreground">
          Keep reviewing and correcting transactions to exit learning mode faster!
        </p>
      </CardContent>
    </Card>
  );
}
