/**
 * South African Public Holidays
 *
 * This file contains all official public holidays for South Africa.
 * Includes observed holidays when they fall on weekends (moved to Monday).
 */

export interface PublicHoliday {
  date: string; // YYYY-MM-DD format
  name: string;
  observed: string; // YYYY-MM-DD if different from date (weekend → Monday)
}

/**
 * South African Public Holidays for 2024
 *
 * Good Friday: 29 March 2024
 * Family Day: 1 April 2024 (Monday after Good Friday)
 */
export const SA_PUBLIC_HOLIDAYS_2024: PublicHoliday[] = [
  {
    date: '2024-01-01',
    name: "New Year's Day",
    observed: '2024-01-01', // Monday
  },
  {
    date: '2024-03-21',
    name: 'Human Rights Day',
    observed: '2024-03-21', // Thursday
  },
  {
    date: '2024-03-29',
    name: 'Good Friday',
    observed: '2024-03-29', // Friday
  },
  {
    date: '2024-04-01',
    name: 'Family Day',
    observed: '2024-04-01', // Monday
  },
  {
    date: '2024-04-27',
    name: 'Freedom Day',
    observed: '2024-04-29', // Saturday → Monday
  },
  {
    date: '2024-05-01',
    name: "Workers' Day",
    observed: '2024-05-01', // Wednesday
  },
  {
    date: '2024-06-16',
    name: 'Youth Day',
    observed: '2024-06-17', // Sunday → Monday
  },
  {
    date: '2024-08-09',
    name: "National Women's Day",
    observed: '2024-08-09', // Friday
  },
  {
    date: '2024-09-24',
    name: 'Heritage Day',
    observed: '2024-09-24', // Tuesday
  },
  {
    date: '2024-12-16',
    name: 'Day of Reconciliation',
    observed: '2024-12-16', // Monday
  },
  {
    date: '2024-12-25',
    name: 'Christmas Day',
    observed: '2024-12-25', // Wednesday
  },
  {
    date: '2024-12-26',
    name: 'Day of Goodwill',
    observed: '2024-12-26', // Thursday
  },
];

/**
 * South African Public Holidays for 2025
 *
 * Good Friday: 18 April 2025
 * Family Day: 21 April 2025 (Monday after Good Friday)
 */
export const SA_PUBLIC_HOLIDAYS_2025: PublicHoliday[] = [
  {
    date: '2025-01-01',
    name: "New Year's Day",
    observed: '2025-01-01', // Wednesday
  },
  {
    date: '2025-03-21',
    name: 'Human Rights Day',
    observed: '2025-03-21', // Friday
  },
  {
    date: '2025-04-18',
    name: 'Good Friday',
    observed: '2025-04-18', // Friday
  },
  {
    date: '2025-04-21',
    name: 'Family Day',
    observed: '2025-04-21', // Monday
  },
  {
    date: '2025-04-27',
    name: 'Freedom Day',
    observed: '2025-04-28', // Sunday → Monday
  },
  {
    date: '2025-05-01',
    name: "Workers' Day",
    observed: '2025-05-01', // Thursday
  },
  {
    date: '2025-06-16',
    name: 'Youth Day',
    observed: '2025-06-16', // Monday
  },
  {
    date: '2025-08-09',
    name: "National Women's Day",
    observed: '2025-08-11', // Saturday → Monday
  },
  {
    date: '2025-09-24',
    name: 'Heritage Day',
    observed: '2025-09-24', // Wednesday
  },
  {
    date: '2025-12-16',
    name: 'Day of Reconciliation',
    observed: '2025-12-16', // Tuesday
  },
  {
    date: '2025-12-25',
    name: 'Christmas Day',
    observed: '2025-12-25', // Thursday
  },
  {
    date: '2025-12-26',
    name: 'Day of Goodwill',
    observed: '2025-12-26', // Friday
  },
];

/**
 * South African Public Holidays for 2026
 *
 * Good Friday: 3 April 2026
 * Family Day: 6 April 2026 (Monday after Good Friday)
 */
export const SA_PUBLIC_HOLIDAYS_2026: PublicHoliday[] = [
  {
    date: '2026-01-01',
    name: "New Year's Day",
    observed: '2026-01-01', // Thursday
  },
  {
    date: '2026-03-21',
    name: 'Human Rights Day',
    observed: '2026-03-23', // Saturday → Monday
  },
  {
    date: '2026-04-03',
    name: 'Good Friday',
    observed: '2026-04-03', // Friday
  },
  {
    date: '2026-04-06',
    name: 'Family Day',
    observed: '2026-04-06', // Monday
  },
  {
    date: '2026-04-27',
    name: 'Freedom Day',
    observed: '2026-04-27', // Monday
  },
  {
    date: '2026-05-01',
    name: "Workers' Day",
    observed: '2026-05-01', // Friday
  },
  {
    date: '2026-06-16',
    name: 'Youth Day',
    observed: '2026-06-16', // Tuesday
  },
  {
    date: '2026-08-09',
    name: "National Women's Day",
    observed: '2026-08-10', // Sunday → Monday
  },
  {
    date: '2026-09-24',
    name: 'Heritage Day',
    observed: '2026-09-24', // Thursday
  },
  {
    date: '2026-12-16',
    name: 'Day of Reconciliation',
    observed: '2026-12-16', // Wednesday
  },
  {
    date: '2026-12-25',
    name: 'Christmas Day',
    observed: '2026-12-25', // Friday
  },
  {
    date: '2026-12-26',
    name: 'Day of Goodwill',
    observed: '2026-12-28', // Saturday → Monday
  },
];

/**
 * All South African public holidays indexed by year
 */
export const SA_PUBLIC_HOLIDAYS: Record<number, PublicHoliday[]> = {
  2024: SA_PUBLIC_HOLIDAYS_2024,
  2025: SA_PUBLIC_HOLIDAYS_2025,
  2026: SA_PUBLIC_HOLIDAYS_2026,
};
