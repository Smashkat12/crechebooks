/**
 * Resolve the period for a live ledger query.
 *
 * Defaults:
 *   period_end   → today (now)
 *   period_start → 3 months before period_end
 *
 * Times are normalized so period_start is start-of-day and period_end is
 * end-of-day, making whole-day inclusivity behave intuitively.
 */
export function resolveLedgerPeriod(
  periodStartRaw?: string,
  periodEndRaw?: string,
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : new Date(now);
  periodEnd.setHours(23, 59, 59, 999);

  let periodStart: Date;
  if (periodStartRaw) {
    periodStart = new Date(periodStartRaw);
  } else {
    periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 3);
  }
  periodStart.setHours(0, 0, 0, 0);

  return { periodStart, periodEnd };
}
