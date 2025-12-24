/**
 * Billing Types
 * TASK-WEB-044: Pro-Rata Fee Display Component
 *
 * @module types/billing
 * @description TypeScript types for billing components including pro-rata calculations.
 */

/**
 * Pro-rata calculation details from backend
 * Matches the backend ProRataCalculation interface structure
 */
export interface ProRataCalculation {
  /** Billing period start date (ISO string) */
  periodStart: string;
  /** Billing period end date (ISO string) */
  periodEnd: string;
  /** Enrollment start date (ISO string) */
  enrollmentStart: string;
  /** Enrollment end date if applicable (ISO string) */
  enrollmentEnd?: string;
  /** Total calendar days in the billing period */
  totalDays: number;
  /** Number of days actually charged */
  chargedDays: number;
  /** Percentage of month being charged (0-100) */
  percentage: number;
  /** Full monthly fee amount in ZAR (not cents) */
  monthlyFee: number;
  /** Pro-rated fee amount in ZAR (not cents) */
  proratedFee: number;
}

/**
 * Pro-rata calculation from backend (cents-based)
 * Used when receiving data from API
 */
export interface ProRataCalculationCents {
  /** Original monthly fee in cents */
  originalAmountCents: number;
  /** Calculated pro-rata amount in cents */
  proRataAmountCents: number;
  /** Daily rate in cents */
  dailyRateCents: number;
  /** Total calendar days in the month */
  totalDaysInMonth: number;
  /** Number of school days in the full month */
  schoolDaysInMonth: number;
  /** Number of days actually billed */
  billedDays: number;
  /** Billing period start date */
  startDate: string;
  /** Billing period end date */
  endDate: string;
}

/**
 * Convert cents-based calculation to display format
 */
export function toDisplayCalculation(
  calc: ProRataCalculationCents,
  enrollmentStart: string,
  enrollmentEnd?: string
): ProRataCalculation {
  const percentage = calc.schoolDaysInMonth > 0
    ? (calc.billedDays / calc.schoolDaysInMonth) * 100
    : 0;

  return {
    periodStart: calc.startDate,
    periodEnd: calc.endDate,
    enrollmentStart,
    enrollmentEnd,
    totalDays: calc.totalDaysInMonth,
    chargedDays: calc.billedDays,
    percentage: Math.round(percentage * 10) / 10,
    monthlyFee: calc.originalAmountCents / 100,
    proratedFee: calc.proRataAmountCents / 100,
  };
}
