/**
 * South African Public Holiday Constants
 * TASK-STAFF-007: SA Public Holiday Calendar
 *
 * Comprehensive public holiday definitions with dynamic calculation for
 * Easter-based holidays using the Computus algorithm.
 *
 * References:
 * - Public Holidays Act 36 of 1994
 * - https://www.gov.za/about-sa/public-holidays
 *
 * Sunday Observance Rule:
 * When a public holiday falls on a Sunday, the following Monday becomes
 * an additional observed public holiday (Public Holidays Act, Section 2).
 */

/**
 * Public holiday definition interface
 */
export interface SAPublicHolidayDefinition {
  /** Unique identifier for the holiday */
  id: string;
  /** Official name of the public holiday */
  name: string;
  /** Fixed month (1-12) or null if calculated from Easter */
  month: number | null;
  /** Fixed day of month or null if calculated from Easter */
  day: number | null;
  /** Days offset from Easter Sunday (e.g., -2 for Good Friday) */
  easterOffset: number | null;
  /** Description of the holiday's significance */
  description: string;
}

/**
 * Generated public holiday for a specific year
 */
export interface SAPublicHoliday {
  /** Holiday definition identifier */
  id: string;
  /** Official name of the public holiday */
  name: string;
  /** The date of the holiday */
  date: Date;
  /** Whether this is an observed holiday (moved from Sunday) */
  isObserved: boolean;
  /** The original date if this is an observed holiday */
  originalDate?: Date;
  /** Year of the holiday */
  year: number;
}

/**
 * South African Public Holiday Definitions
 * All 12 statutory public holidays as per the Public Holidays Act
 */
export const SA_PUBLIC_HOLIDAY_DEFINITIONS: SAPublicHolidayDefinition[] = [
  {
    id: 'new-years-day',
    name: "New Year's Day",
    month: 1,
    day: 1,
    easterOffset: null,
    description: 'Celebrates the beginning of a new calendar year',
  },
  {
    id: 'human-rights-day',
    name: 'Human Rights Day',
    month: 3,
    day: 21,
    easterOffset: null,
    description:
      'Commemorates the Sharpeville massacre of 1960 and promotes human rights awareness',
  },
  {
    id: 'good-friday',
    name: 'Good Friday',
    month: null,
    day: null,
    easterOffset: -2,
    description:
      'Christian holiday commemorating the crucifixion of Jesus Christ',
  },
  {
    id: 'family-day',
    name: 'Family Day',
    month: null,
    day: null,
    easterOffset: 1, // Monday after Easter
    description:
      'Public holiday on the Monday following Easter Sunday, celebrating family',
  },
  {
    id: 'freedom-day',
    name: 'Freedom Day',
    month: 4,
    day: 27,
    easterOffset: null,
    description:
      "Commemorates South Africa's first democratic elections held on 27 April 1994",
  },
  {
    id: 'workers-day',
    name: "Workers' Day",
    month: 5,
    day: 1,
    easterOffset: null,
    description: 'International Workers Day, celebrating workers rights',
  },
  {
    id: 'youth-day',
    name: 'Youth Day',
    month: 6,
    day: 16,
    easterOffset: null,
    description:
      'Commemorates the Soweto Uprising of 16 June 1976 when students protested against Apartheid education',
  },
  {
    id: 'national-womens-day',
    name: "National Women's Day",
    month: 8,
    day: 9,
    easterOffset: null,
    description:
      "Commemorates the 1956 women's march to the Union Buildings to protest pass laws",
  },
  {
    id: 'heritage-day',
    name: 'Heritage Day',
    month: 9,
    day: 24,
    easterOffset: null,
    description:
      "Celebrates South Africa's diverse cultural heritage (also known as Braai Day)",
  },
  {
    id: 'day-of-reconciliation',
    name: 'Day of Reconciliation',
    month: 12,
    day: 16,
    easterOffset: null,
    description:
      'Promotes reconciliation and national unity among South Africans',
  },
  {
    id: 'christmas-day',
    name: 'Christmas Day',
    month: 12,
    day: 25,
    easterOffset: null,
    description: 'Christian holiday celebrating the birth of Jesus Christ',
  },
  {
    id: 'day-of-goodwill',
    name: 'Day of Goodwill',
    month: 12,
    day: 26,
    easterOffset: null,
    description:
      'Public holiday following Christmas, formerly known as Boxing Day',
  },
];

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm (Computus)
 *
 * This algorithm calculates the date of Easter Sunday for any year from 1583 onwards.
 * Easter Sunday is defined as the first Sunday after the first full moon
 * occurring on or after the spring equinox (March 21).
 *
 * @param year - The year to calculate Easter Sunday for
 * @returns Date object representing Easter Sunday for the given year
 *
 * @example
 * calculateEasterSunday(2024) // Returns March 31, 2024
 * calculateEasterSunday(2025) // Returns April 20, 2025
 */
export function calculateEasterSunday(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

/**
 * Calculate Good Friday (2 days before Easter Sunday)
 *
 * @param year - The year to calculate Good Friday for
 * @returns Date object representing Good Friday
 *
 * @example
 * calculateGoodFriday(2024) // Returns March 29, 2024
 * calculateGoodFriday(2025) // Returns April 18, 2025
 */
export function calculateGoodFriday(year: number): Date {
  const easter = calculateEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  return goodFriday;
}

/**
 * Calculate Family Day (Monday after Easter Sunday)
 *
 * @param year - The year to calculate Family Day for
 * @returns Date object representing Family Day
 *
 * @example
 * calculateFamilyDay(2024) // Returns April 1, 2024
 * calculateFamilyDay(2025) // Returns April 21, 2025
 */
export function calculateFamilyDay(year: number): Date {
  const easter = calculateEasterSunday(year);
  const familyDay = new Date(easter);
  familyDay.setDate(easter.getDate() + 1);
  return familyDay;
}

/**
 * Apply the Sunday observance rule
 *
 * Per the Public Holidays Act, when a public holiday falls on a Sunday,
 * the following Monday becomes an additional public holiday.
 *
 * @param date - The original public holiday date
 * @returns Object with the date and whether it was moved
 */
export function applySundayObservanceRule(date: Date): {
  observedDate: Date;
  wasMovedFromSunday: boolean;
} {
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0) {
    // Sunday
    const observedDate = new Date(date);
    observedDate.setDate(date.getDate() + 1);
    return {
      observedDate,
      wasMovedFromSunday: true,
    };
  }

  return {
    observedDate: new Date(date),
    wasMovedFromSunday: false,
  };
}

/**
 * Calculate the date for a holiday definition for a specific year
 *
 * @param definition - The holiday definition
 * @param year - The year to calculate for
 * @returns The calculated date
 */
export function calculateHolidayDate(
  definition: SAPublicHolidayDefinition,
  year: number,
): Date {
  if (definition.easterOffset !== null) {
    // Easter-based holiday
    const easter = calculateEasterSunday(year);
    const holidayDate = new Date(easter);
    holidayDate.setDate(easter.getDate() + definition.easterOffset);
    return holidayDate;
  } else if (definition.month !== null && definition.day !== null) {
    // Fixed date holiday
    return new Date(year, definition.month - 1, definition.day);
  }

  throw new Error(
    `Invalid holiday definition: ${definition.id} - must have either fixed date or Easter offset`,
  );
}

/**
 * Generate all public holidays for a specific year
 *
 * This function generates both the original holidays and any observed holidays
 * when the original falls on a Sunday.
 *
 * @param year - The year to generate holidays for
 * @returns Array of public holidays including observed holidays
 *
 * @example
 * const holidays2025 = generateHolidaysForYear(2025);
 * // Returns all 12+ holidays for 2025 including observed dates
 */
export function generateHolidaysForYear(year: number): SAPublicHoliday[] {
  const holidays: SAPublicHoliday[] = [];
  const observedDatesSet = new Set<string>();

  for (const definition of SA_PUBLIC_HOLIDAY_DEFINITIONS) {
    const baseDate = calculateHolidayDate(definition, year);
    const { observedDate, wasMovedFromSunday } =
      applySundayObservanceRule(baseDate);

    // Add the original holiday
    holidays.push({
      id: definition.id,
      name: definition.name,
      date: new Date(baseDate),
      isObserved: false,
      year,
    });

    // If the holiday was on Sunday, add the observed Monday holiday
    if (wasMovedFromSunday) {
      const observedKey = `${observedDate.getFullYear()}-${observedDate.getMonth()}-${observedDate.getDate()}`;

      // Check if there's already a holiday on the observed date
      const existingHolidayOnObservedDate = SA_PUBLIC_HOLIDAY_DEFINITIONS.some(
        (def) => {
          const defDate = calculateHolidayDate(def, year);
          return (
            defDate.getFullYear() === observedDate.getFullYear() &&
            defDate.getMonth() === observedDate.getMonth() &&
            defDate.getDate() === observedDate.getDate()
          );
        },
      );

      if (existingHolidayOnObservedDate) {
        // Move observed holiday to the next available day
        const nextDay = new Date(observedDate);
        nextDay.setDate(observedDate.getDate() + 1);

        // Keep moving until we find a day without a holiday
        while (observedDatesSet.has(getDateKey(nextDay))) {
          nextDay.setDate(nextDay.getDate() + 1);
        }

        observedDatesSet.add(getDateKey(nextDay));
        holidays.push({
          id: `${definition.id}-observed`,
          name: `${definition.name} (Observed)`,
          date: nextDay,
          isObserved: true,
          originalDate: new Date(baseDate),
          year,
        });
      } else {
        observedDatesSet.add(observedKey);
        holidays.push({
          id: `${definition.id}-observed`,
          name: `${definition.name} (Observed)`,
          date: observedDate,
          isObserved: true,
          originalDate: new Date(baseDate),
          year,
        });
      }
    }
  }

  // Sort by date
  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Helper to get a unique date key
 */
function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Check if a specific date is a public holiday
 *
 * @param date - The date to check
 * @returns Object with isHoliday flag and holiday details if applicable
 */
export function checkPublicHoliday(date: Date): {
  isHoliday: boolean;
  holiday?: SAPublicHoliday;
} {
  const year = date.getFullYear();
  const holidays = generateHolidaysForYear(year);

  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  const found = holidays.find((h) => {
    const holidayDate = new Date(h.date);
    holidayDate.setHours(0, 0, 0, 0);
    return holidayDate.getTime() === normalizedDate.getTime();
  });

  return {
    isHoliday: !!found,
    holiday: found,
  };
}

/**
 * Get holidays within a date range
 *
 * @param startDate - Start of the range (inclusive)
 * @param endDate - End of the range (inclusive)
 * @returns Array of holidays within the range
 */
export function getHolidaysInRange(
  startDate: Date,
  endDate: Date,
): SAPublicHoliday[] {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  const holidays: SAPublicHoliday[] = [];

  // Generate holidays for each year in the range
  for (let year = startYear; year <= endYear; year++) {
    holidays.push(...generateHolidaysForYear(year));
  }

  // Normalize dates for comparison
  const normalizedStart = new Date(startDate);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedEnd = new Date(endDate);
  normalizedEnd.setHours(23, 59, 59, 999);

  // Filter to only holidays in range
  return holidays.filter((h) => {
    const holidayDate = new Date(h.date);
    holidayDate.setHours(12, 0, 0, 0);
    return holidayDate >= normalizedStart && holidayDate <= normalizedEnd;
  });
}

/**
 * Known Easter dates for validation and testing
 * Source: Verified astronomical calculations
 */
export const KNOWN_EASTER_DATES: Record<
  number,
  { month: number; day: number }
> = {
  2020: { month: 4, day: 12 },
  2021: { month: 4, day: 4 },
  2022: { month: 4, day: 17 },
  2023: { month: 4, day: 9 },
  2024: { month: 3, day: 31 },
  2025: { month: 4, day: 20 },
  2026: { month: 4, day: 5 },
  2027: { month: 3, day: 28 },
  2028: { month: 4, day: 16 },
  2029: { month: 4, day: 1 },
  2030: { month: 4, day: 21 },
};

/**
 * Years where specific holidays fall on Sunday (for testing observance rule)
 */
export const SUNDAY_HOLIDAY_EXAMPLES: Array<{
  year: number;
  holidayId: string;
  sundayDate: string;
  observedDate: string;
}> = [
  {
    year: 2022,
    holidayId: 'christmas-day',
    sundayDate: '2022-12-25',
    observedDate: '2022-12-27', // Dec 26 is Day of Goodwill
  },
  {
    year: 2023,
    holidayId: 'new-years-day',
    sundayDate: '2023-01-01',
    observedDate: '2023-01-02',
  },
  {
    year: 2025,
    holidayId: 'freedom-day',
    sundayDate: '2025-04-27',
    observedDate: '2025-04-28',
  },
  {
    year: 2026,
    holidayId: 'national-womens-day',
    sundayDate: '2026-08-09',
    observedDate: '2026-08-10',
  },
];
