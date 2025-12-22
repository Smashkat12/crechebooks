/**
 * South African Public Holidays 2025-2026
 * TASK-BILL-014: Pro-rata Calculation Service
 *
 * Source: https://www.gov.za/about-sa/public-holidays
 *
 * Note: When a public holiday falls on a Sunday, the following Monday
 * becomes a public holiday. This is reflected in the dates below.
 */

/**
 * South African public holidays for 2025
 */
export const PUBLIC_HOLIDAYS_2025: Date[] = [
  new Date('2025-01-01'), // New Year's Day
  new Date('2025-03-21'), // Human Rights Day
  new Date('2025-04-18'), // Good Friday
  new Date('2025-04-21'), // Family Day
  new Date('2025-04-27'), // Freedom Day
  new Date('2025-04-28'), // Freedom Day observed (27th is Sunday)
  new Date('2025-05-01'), // Workers' Day
  new Date('2025-06-16'), // Youth Day
  new Date('2025-08-09'), // National Women's Day
  new Date('2025-09-24'), // Heritage Day
  new Date('2025-12-16'), // Day of Reconciliation
  new Date('2025-12-25'), // Christmas Day
  new Date('2025-12-26'), // Day of Goodwill
];

/**
 * South African public holidays for 2026
 */
export const PUBLIC_HOLIDAYS_2026: Date[] = [
  new Date('2026-01-01'), // New Year's Day
  new Date('2026-03-21'), // Human Rights Day
  new Date('2026-04-03'), // Good Friday
  new Date('2026-04-06'), // Family Day
  new Date('2026-04-27'), // Freedom Day
  new Date('2026-05-01'), // Workers' Day
  new Date('2026-06-16'), // Youth Day
  new Date('2026-08-09'), // National Women's Day
  new Date('2026-08-10'), // Women's Day observed (9th is Sunday)
  new Date('2026-09-24'), // Heritage Day
  new Date('2026-12-16'), // Day of Reconciliation
  new Date('2026-12-25'), // Christmas Day
  new Date('2026-12-26'), // Day of Goodwill
];

/**
 * Get public holidays for a specific year
 * @param year - The year to get holidays for (2025 or 2026 supported)
 * @returns Array of Date objects representing public holidays
 */
export function getPublicHolidays(year: number): Date[] {
  switch (year) {
    case 2025:
      return PUBLIC_HOLIDAYS_2025;
    case 2026:
      return PUBLIC_HOLIDAYS_2026;
    default:
      // Future: Could fetch from database or external API
      return [];
  }
}

/**
 * Check if a date is a South African public holiday
 * @param date - The date to check
 * @returns true if the date is a public holiday
 */
export function isPublicHoliday(date: Date): boolean {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);

  const year = normalized.getFullYear();
  const holidays = getPublicHolidays(year);

  for (const holiday of holidays) {
    const holidayNormalized = new Date(holiday);
    holidayNormalized.setHours(0, 0, 0, 0);

    if (normalized.getTime() === holidayNormalized.getTime()) {
      return true;
    }
  }

  return false;
}
