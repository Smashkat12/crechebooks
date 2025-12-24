'use client';

/**
 * Pro-Rata Timeline Component
 * TASK-WEB-044: Pro-Rata Fee Display Component
 *
 * Visual timeline representation showing the billing period
 * with highlighted charged portion.
 */

import { useMemo } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';

export interface ProRataTimelineProps {
  /** Start of the billing period */
  startDate: Date | string;
  /** End of the billing period */
  endDate: Date | string;
  /** Start of charged period (enrollment start or period start) */
  chargedFrom: Date | string;
  /** End of charged period (enrollment end or period end) */
  chargedTo: Date | string;
}

/**
 * Visual timeline showing the full billing period with
 * the charged portion highlighted.
 */
export function ProRataTimeline({
  startDate,
  endDate,
  chargedFrom,
  chargedTo,
}: ProRataTimelineProps) {
  const { periodStart, periodEnd, chargeStart, chargeEnd, leftOffset, width } =
    useMemo(() => {
      const pStart = typeof startDate === 'string' ? parseISO(startDate) : startDate;
      const pEnd = typeof endDate === 'string' ? parseISO(endDate) : endDate;
      const cStart = typeof chargedFrom === 'string' ? parseISO(chargedFrom) : chargedFrom;
      const cEnd = typeof chargedTo === 'string' ? parseISO(chargedTo) : chargedTo;

      const totalDays = differenceInDays(pEnd, pStart) + 1;
      const chargeStartOffset = differenceInDays(cStart, pStart);
      const chargeDays = differenceInDays(cEnd, cStart) + 1;

      // Calculate percentage positions
      const left = totalDays > 0 ? (chargeStartOffset / totalDays) * 100 : 0;
      const w = totalDays > 0 ? (chargeDays / totalDays) * 100 : 100;

      return {
        periodStart: pStart,
        periodEnd: pEnd,
        chargeStart: cStart,
        chargeEnd: cEnd,
        leftOffset: Math.max(0, left),
        width: Math.min(100, w),
      };
    }, [startDate, endDate, chargedFrom, chargedTo]);

  return (
    <div
      className="w-full"
      role="figure"
      aria-label="Pro-rata billing timeline"
    >
      {/* Date labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span aria-label="Period start">{format(periodStart, 'd MMM')}</span>
        <span aria-label="Period end">{format(periodEnd, 'd MMM yyyy')}</span>
      </div>

      {/* Timeline bar */}
      <div
        className="relative h-6 bg-muted rounded-md overflow-hidden"
        role="progressbar"
        aria-valuenow={width}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(width)}% of period charged`}
      >
        {/* Charged portion */}
        <div
          className="absolute top-0 bottom-0 bg-primary/80 rounded-md transition-all duration-300"
          style={{
            left: `${leftOffset}%`,
            width: `${width}%`,
          }}
        />

        {/* Charged period markers */}
        {leftOffset > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary"
            style={{ left: `${leftOffset}%` }}
            aria-hidden="true"
          />
        )}
        {leftOffset + width < 100 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary"
            style={{ left: `${leftOffset + width}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Charged period labels */}
      <div className="flex justify-between text-xs mt-1">
        <span
          className="text-primary font-medium"
          style={{ marginLeft: `${leftOffset}%` }}
          aria-label="Charged from"
        >
          {format(chargeStart, 'd MMM')}
        </span>
        <span
          className="text-primary font-medium"
          aria-label="Charged to"
        >
          {format(chargeEnd, 'd MMM')}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-muted rounded" aria-hidden="true" />
          <span>Full period</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-primary/80 rounded" aria-hidden="true" />
          <span>Charged days</span>
        </div>
      </div>
    </div>
  );
}
