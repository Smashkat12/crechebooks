'use client';

/**
 * Pro-Rata Display Component
 * TASK-WEB-044: Pro-Rata Fee Display Component
 *
 * Main component for displaying pro-rata fee calculations
 * with optional timeline visualization.
 */

import { Calculator, Calendar, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProRataTimeline } from './ProRataTimeline';
import type { ProRataCalculation } from '@/types/billing.types';

export interface ProRataDisplayProps {
  /** Pro-rata calculation data from backend */
  calculation: ProRataCalculation;
  /** Whether to show the visual timeline (default: true) */
  showTimeline?: boolean;
  /** Compact mode for smaller spaces (default: false) */
  compact?: boolean;
}

/**
 * Format a number as South African Rand currency
 */
function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Displays a pro-rata fee calculation with breakdown
 * and optional visual timeline.
 */
export function ProRataDisplay({
  calculation,
  showTimeline = true,
  compact = false,
}: ProRataDisplayProps) {
  const {
    periodStart,
    periodEnd,
    enrollmentStart,
    enrollmentEnd,
    totalDays,
    chargedDays,
    percentage,
    monthlyFee,
    proratedFee,
  } = calculation;

  // Determine if this is a full month charge
  const isFullMonth = percentage >= 100;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 text-sm"
        role="region"
        aria-label="Pro-rata calculation summary"
      >
        <Calculator className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground">
          {chargedDays}/{totalDays} days
        </span>
        <span className="font-medium">({percentage.toFixed(1)}%)</span>
        <span className="font-semibold text-primary">{formatZAR(proratedFee)}</span>
      </div>
    );
  }

  return (
    <Card
      className="bg-blue-50 border-blue-200"
      role="region"
      aria-label="Pro-rata fee calculation"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Pro-rata Calculation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timeline visualization */}
        {showTimeline && (
          <ProRataTimeline
            startDate={periodStart}
            endDate={periodEnd}
            chargedFrom={enrollmentStart}
            chargedTo={enrollmentEnd || periodEnd}
          />
        )}

        {/* Calculation breakdown */}
        <div className="space-y-2 text-sm">
          {/* Period info */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Billing period: {new Date(periodStart).toLocaleDateString('en-ZA')} -{' '}
              {new Date(periodEnd).toLocaleDateString('en-ZA')}
            </span>
          </div>

          {/* Fee breakdown */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
            <span className="text-muted-foreground">Monthly fee:</span>
            <span className="text-right font-mono">{formatZAR(monthlyFee)}</span>

            <span className="text-muted-foreground">Days in period:</span>
            <span className="text-right font-mono">{totalDays}</span>

            <span className="text-muted-foreground">Days charged:</span>
            <span className="text-right font-mono">{chargedDays}</span>

            <span className="text-muted-foreground flex items-center gap-1">
              <Percent className="h-3 w-3" aria-hidden="true" />
              Percentage:
            </span>
            <span className="text-right font-mono">{percentage.toFixed(1)}%</span>
          </div>

          {/* Total */}
          <div
            className="flex justify-between items-center border-t pt-2 mt-2"
            aria-label="Pro-rated amount"
          >
            <span className="font-medium">
              {isFullMonth ? 'Full month charge:' : 'Pro-rated amount:'}
            </span>
            <span className="text-lg font-semibold text-primary">
              {formatZAR(proratedFee)}
            </span>
          </div>

          {/* Savings indicator for partial months */}
          {!isFullMonth && (
            <div className="text-xs text-muted-foreground text-right">
              Saving {formatZAR(monthlyFee - proratedFee)} from full monthly fee
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
