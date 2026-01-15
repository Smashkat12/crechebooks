/**
 * Calendar Service Tests
 * TASK-STAFF-007: SA Public Holiday Calendar
 *
 * Comprehensive tests for the CalendarService covering:
 * - Easter calculation using Computus algorithm
 * - Good Friday calculation (2 days before Easter)
 * - Family Day calculation (Monday after Easter)
 * - All 12 SA public holidays generation
 * - Sunday observance rule
 * - Working days calculation
 * - Public holiday pay (BCEA double rate)
 * - Leave deduction calculations
 *
 * CRITICAL: Uses REAL module instantiation for service testing
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CalendarService,
  LeaveDeduction,
  PublicHolidayPayResult,
} from '../../../src/database/services/calendar.service';
import {
  calculateEasterSunday,
  calculateGoodFriday,
  calculateFamilyDay,
  generateHolidaysForYear,
  checkPublicHoliday,
  applySundayObservanceRule,
  KNOWN_EASTER_DATES,
  SUNDAY_HOLIDAY_EXAMPLES,
  SA_PUBLIC_HOLIDAY_DEFINITIONS,
} from '../../../src/database/constants/sa-public-holidays.constants';

describe('CalendarService', () => {
  let service: CalendarService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CalendarService],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  describe('Easter Calculation (Computus Algorithm)', () => {
    it('should calculate Easter 2024 correctly (March 31)', () => {
      const easter = calculateEasterSunday(2024);
      expect(easter.getFullYear()).toBe(2024);
      expect(easter.getMonth()).toBe(2); // March (0-indexed)
      expect(easter.getDate()).toBe(31);
    });

    it('should calculate Easter 2025 correctly (April 20)', () => {
      const easter = calculateEasterSunday(2025);
      expect(easter.getFullYear()).toBe(2025);
      expect(easter.getMonth()).toBe(3); // April (0-indexed)
      expect(easter.getDate()).toBe(20);
    });

    it('should calculate Easter 2026 correctly (April 5)', () => {
      const easter = calculateEasterSunday(2026);
      expect(easter.getFullYear()).toBe(2026);
      expect(easter.getMonth()).toBe(3); // April (0-indexed)
      expect(easter.getDate()).toBe(5);
    });

    it('should calculate Easter 2027 correctly (March 28)', () => {
      const easter = calculateEasterSunday(2027);
      expect(easter.getFullYear()).toBe(2027);
      expect(easter.getMonth()).toBe(2); // March (0-indexed)
      expect(easter.getDate()).toBe(28);
    });

    it('should calculate Easter 2028 correctly (April 16)', () => {
      const easter = calculateEasterSunday(2028);
      expect(easter.getFullYear()).toBe(2028);
      expect(easter.getMonth()).toBe(3); // April (0-indexed)
      expect(easter.getDate()).toBe(16);
    });

    it('should match all known Easter dates', () => {
      for (const [yearStr, expected] of Object.entries(KNOWN_EASTER_DATES)) {
        const year = parseInt(yearStr, 10);
        const easter = calculateEasterSunday(year);
        expect(easter.getMonth()).toBe(expected.month - 1); // Convert to 0-indexed
        expect(easter.getDate()).toBe(expected.day);
      }
    });

    it('should always return a Sunday', () => {
      for (let year = 2020; year <= 2030; year++) {
        const easter = calculateEasterSunday(year);
        expect(easter.getDay()).toBe(0); // 0 = Sunday
      }
    });
  });

  describe('Good Friday Calculation', () => {
    it('should calculate Good Friday 2024 correctly (March 29)', () => {
      const goodFriday = calculateGoodFriday(2024);
      expect(goodFriday.getFullYear()).toBe(2024);
      expect(goodFriday.getMonth()).toBe(2); // March
      expect(goodFriday.getDate()).toBe(29);
    });

    it('should calculate Good Friday 2025 correctly (April 18)', () => {
      const goodFriday = calculateGoodFriday(2025);
      expect(goodFriday.getFullYear()).toBe(2025);
      expect(goodFriday.getMonth()).toBe(3); // April
      expect(goodFriday.getDate()).toBe(18);
    });

    it('should calculate Good Friday 2026 correctly (April 3)', () => {
      const goodFriday = calculateGoodFriday(2026);
      expect(goodFriday.getFullYear()).toBe(2026);
      expect(goodFriday.getMonth()).toBe(3); // April
      expect(goodFriday.getDate()).toBe(3);
    });

    it('should always be 2 days before Easter', () => {
      for (let year = 2020; year <= 2030; year++) {
        const easter = calculateEasterSunday(year);
        const goodFriday = calculateGoodFriday(year);

        const diffDays =
          (easter.getTime() - goodFriday.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(2);
      }
    });

    it('should always be a Friday', () => {
      for (let year = 2020; year <= 2030; year++) {
        const goodFriday = calculateGoodFriday(year);
        expect(goodFriday.getDay()).toBe(5); // 5 = Friday
      }
    });
  });

  describe('Family Day Calculation', () => {
    it('should calculate Family Day 2024 correctly (April 1)', () => {
      const familyDay = calculateFamilyDay(2024);
      expect(familyDay.getFullYear()).toBe(2024);
      expect(familyDay.getMonth()).toBe(3); // April
      expect(familyDay.getDate()).toBe(1);
    });

    it('should calculate Family Day 2025 correctly (April 21)', () => {
      const familyDay = calculateFamilyDay(2025);
      expect(familyDay.getFullYear()).toBe(2025);
      expect(familyDay.getMonth()).toBe(3); // April
      expect(familyDay.getDate()).toBe(21);
    });

    it('should calculate Family Day 2026 correctly (April 6)', () => {
      const familyDay = calculateFamilyDay(2026);
      expect(familyDay.getFullYear()).toBe(2026);
      expect(familyDay.getMonth()).toBe(3); // April
      expect(familyDay.getDate()).toBe(6);
    });

    it('should always be 1 day after Easter (Monday)', () => {
      for (let year = 2020; year <= 2030; year++) {
        const easter = calculateEasterSunday(year);
        const familyDay = calculateFamilyDay(year);

        const diffDays =
          (familyDay.getTime() - easter.getTime()) / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(1);
      }
    });

    it('should always be a Monday', () => {
      for (let year = 2020; year <= 2030; year++) {
        const familyDay = calculateFamilyDay(year);
        expect(familyDay.getDay()).toBe(1); // 1 = Monday
      }
    });
  });

  describe('Holiday Generation', () => {
    it('should generate all 12 base public holidays', () => {
      const holidays = generateHolidaysForYear(2025);

      // Should have at least 12 holidays (more if any fall on Sunday)
      expect(holidays.length).toBeGreaterThanOrEqual(12);

      // Check all base holidays are present
      const holidayIds = holidays.map((h) => h.id);
      expect(holidayIds).toContain('new-years-day');
      expect(holidayIds).toContain('human-rights-day');
      expect(holidayIds).toContain('good-friday');
      expect(holidayIds).toContain('family-day');
      expect(holidayIds).toContain('freedom-day');
      expect(holidayIds).toContain('workers-day');
      expect(holidayIds).toContain('youth-day');
      expect(holidayIds).toContain('national-womens-day');
      expect(holidayIds).toContain('heritage-day');
      expect(holidayIds).toContain('day-of-reconciliation');
      expect(holidayIds).toContain('christmas-day');
      expect(holidayIds).toContain('day-of-goodwill');
    });

    it('should generate fixed date holidays correctly for 2025', () => {
      const holidays = generateHolidaysForYear(2025);

      // New Year's Day
      const newYears = holidays.find((h) => h.id === 'new-years-day');
      expect(newYears).toBeDefined();
      expect(newYears!.date.getMonth()).toBe(0); // January
      expect(newYears!.date.getDate()).toBe(1);

      // Human Rights Day
      const humanRights = holidays.find((h) => h.id === 'human-rights-day');
      expect(humanRights).toBeDefined();
      expect(humanRights!.date.getMonth()).toBe(2); // March
      expect(humanRights!.date.getDate()).toBe(21);

      // Christmas Day
      const christmas = holidays.find((h) => h.id === 'christmas-day');
      expect(christmas).toBeDefined();
      expect(christmas!.date.getMonth()).toBe(11); // December
      expect(christmas!.date.getDate()).toBe(25);
    });

    it('should generate Easter-based holidays correctly for 2025', () => {
      const holidays = generateHolidaysForYear(2025);

      // Good Friday (April 18, 2025)
      const goodFriday = holidays.find((h) => h.id === 'good-friday');
      expect(goodFriday).toBeDefined();
      expect(goodFriday!.date.getMonth()).toBe(3); // April
      expect(goodFriday!.date.getDate()).toBe(18);

      // Family Day (April 21, 2025)
      const familyDay = holidays.find((h) => h.id === 'family-day');
      expect(familyDay).toBeDefined();
      expect(familyDay!.date.getMonth()).toBe(3); // April
      expect(familyDay!.date.getDate()).toBe(21);
    });

    it('should return holidays sorted by date', () => {
      const holidays = generateHolidaysForYear(2025);

      for (let i = 1; i < holidays.length; i++) {
        expect(holidays[i].date.getTime()).toBeGreaterThanOrEqual(
          holidays[i - 1].date.getTime(),
        );
      }
    });

    it('should include year in each holiday', () => {
      const holidays = generateHolidaysForYear(2025);

      for (const holiday of holidays) {
        expect(holiday.year).toBe(2025);
      }
    });
  });

  describe('Sunday Observance Rule', () => {
    it('should move Sunday holidays to Monday', () => {
      const sunday = new Date('2025-04-27'); // Freedom Day 2025 is Sunday
      const result = applySundayObservanceRule(sunday);

      expect(result.wasMovedFromSunday).toBe(true);
      expect(result.observedDate.getDate()).toBe(28);
      expect(result.observedDate.getDay()).toBe(1); // Monday
    });

    it('should not move non-Sunday holidays', () => {
      const friday = new Date('2025-04-18'); // Good Friday
      const result = applySundayObservanceRule(friday);

      expect(result.wasMovedFromSunday).toBe(false);
      expect(result.observedDate.getDate()).toBe(18);
    });

    it('should generate observed holiday for Freedom Day 2025', () => {
      const holidays = generateHolidaysForYear(2025);

      // Original Freedom Day (Sunday)
      const freedomDay = holidays.find((h) => h.id === 'freedom-day');
      expect(freedomDay).toBeDefined();
      expect(freedomDay!.date.getDate()).toBe(27);
      expect(freedomDay!.isObserved).toBe(false);

      // Observed Freedom Day (Monday)
      const freedomDayObserved = holidays.find(
        (h) => h.id === 'freedom-day-observed',
      );
      expect(freedomDayObserved).toBeDefined();
      expect(freedomDayObserved!.date.getDate()).toBe(28);
      expect(freedomDayObserved!.isObserved).toBe(true);
      expect(freedomDayObserved!.originalDate).toBeDefined();
      expect(freedomDayObserved!.originalDate!.getDate()).toBe(27);
    });

    it("should handle Women's Day 2026 Sunday observance", () => {
      const holidays = generateHolidaysForYear(2026);

      // Women's Day is Aug 9, 2026 (Sunday)
      const womensDay = holidays.find((h) => h.id === 'national-womens-day');
      expect(womensDay).toBeDefined();
      expect(womensDay!.date.getDate()).toBe(9);

      // Observed on Monday Aug 10
      const womensDayObserved = holidays.find(
        (h) => h.id === 'national-womens-day-observed',
      );
      expect(womensDayObserved).toBeDefined();
      expect(womensDayObserved!.date.getDate()).toBe(10);
    });

    it('should validate all known Sunday observance examples', () => {
      for (const example of SUNDAY_HOLIDAY_EXAMPLES) {
        const holidays = generateHolidaysForYear(example.year);

        // Find the original holiday
        const original = holidays.find((h) => h.id === example.holidayId);
        expect(original).toBeDefined();

        // Verify original is on Sunday
        const originalDate = new Date(example.sundayDate);
        expect(originalDate.getDay()).toBe(0); // Sunday

        // Find the observed holiday
        const observed = holidays.find(
          (h) => h.id === `${example.holidayId}-observed`,
        );
        expect(observed).toBeDefined();
        expect(observed!.isObserved).toBe(true);
      }
    });

    it('should handle cascading observed holidays (Dec 2022)', () => {
      // Christmas 2022 is Sunday, Day of Goodwill is Dec 26
      // So Christmas observed should be Dec 27
      const holidays = generateHolidaysForYear(2022);

      const christmasObserved = holidays.find(
        (h) => h.id === 'christmas-day-observed',
      );
      expect(christmasObserved).toBeDefined();
      expect(christmasObserved!.date.getMonth()).toBe(11); // December
      expect(christmasObserved!.date.getDate()).toBe(27); // Not 26 (Day of Goodwill)
    });

    it('should handle New Year 2023 Sunday observance', () => {
      const holidays = generateHolidaysForYear(2023);

      // Jan 1, 2023 is Sunday
      const newYears = holidays.find((h) => h.id === 'new-years-day');
      expect(newYears!.date.getDay()).toBe(0); // Sunday

      // Observed on Jan 2
      const newYearsObserved = holidays.find(
        (h) => h.id === 'new-years-day-observed',
      );
      expect(newYearsObserved).toBeDefined();
      expect(newYearsObserved!.date.getDate()).toBe(2);
    });
  });

  describe('isPublicHoliday', () => {
    it('should return true for New Years Day 2025', () => {
      expect(service.isPublicHoliday(new Date('2025-01-01'))).toBe(true);
    });

    it('should return true for Good Friday 2025', () => {
      expect(service.isPublicHoliday(new Date('2025-04-18'))).toBe(true);
    });

    it('should return true for Family Day 2025', () => {
      expect(service.isPublicHoliday(new Date('2025-04-21'))).toBe(true);
    });

    it('should return true for observed holidays', () => {
      // Freedom Day observed 2025 (April 28)
      expect(service.isPublicHoliday(new Date('2025-04-28'))).toBe(true);
    });

    it('should return false for regular weekdays', () => {
      expect(service.isPublicHoliday(new Date('2025-01-02'))).toBe(false);
      expect(service.isPublicHoliday(new Date('2025-06-15'))).toBe(false);
    });

    it('should return false for weekends that are not holidays', () => {
      expect(service.isPublicHoliday(new Date('2025-01-04'))).toBe(false); // Saturday
      expect(service.isPublicHoliday(new Date('2025-01-05'))).toBe(false); // Sunday
    });

    it('should handle dates with time components', () => {
      const withTime = new Date('2025-12-25T14:30:00Z');
      expect(service.isPublicHoliday(withTime)).toBe(true);
    });
  });

  describe('getHolidaysForYear', () => {
    it('should return all holidays for 2025', () => {
      const holidays = service.getHolidaysForYear(2025);
      expect(holidays.length).toBeGreaterThanOrEqual(12);
    });

    it('should return all holidays for 2026', () => {
      const holidays = service.getHolidaysForYear(2026);
      expect(holidays.length).toBeGreaterThanOrEqual(12);
    });

    it('should work for any year', () => {
      const holidays2030 = service.getHolidaysForYear(2030);
      expect(holidays2030.length).toBeGreaterThanOrEqual(12);

      const holidays1994 = service.getHolidaysForYear(1994);
      expect(holidays1994.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe('getHolidaysInRange', () => {
    it('should return holidays within a date range', () => {
      const start = new Date('2025-04-01');
      const end = new Date('2025-04-30');

      const holidays = service.getHolidaysInRange(start, end);

      // April 2025 has: Good Friday (18), Family Day (21), Freedom Day (27), Freedom Day Observed (28)
      expect(holidays.length).toBeGreaterThanOrEqual(4);

      const names = holidays.map((h) => h.name);
      expect(names).toContain('Good Friday');
      expect(names).toContain('Family Day');
      expect(names).toContain('Freedom Day');
    });

    it('should return empty array for range with no holidays', () => {
      const start = new Date('2025-02-01');
      const end = new Date('2025-02-28');

      const holidays = service.getHolidaysInRange(start, end);
      expect(holidays.length).toBe(0);
    });

    it('should handle range spanning multiple years', () => {
      const start = new Date('2024-12-01');
      const end = new Date('2025-01-31');

      const holidays = service.getHolidaysInRange(start, end);

      // Should include Dec 2024 holidays and Jan 2025 holidays
      expect(holidays.length).toBeGreaterThanOrEqual(4);
    });

    it('should include boundary dates', () => {
      const start = new Date('2025-12-25');
      const end = new Date('2025-12-25');

      const holidays = service.getHolidaysInRange(start, end);
      expect(holidays.length).toBe(1);
      expect(holidays[0].name).toBe('Christmas Day');
    });
  });

  describe('getWorkingDaysInRange', () => {
    it('should count weekdays only (Mon-Fri)', () => {
      // January 6-10, 2025 is Mon-Fri (5 weekdays)
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const workingDays = service.getWorkingDaysInRange(start, end);
      expect(workingDays).toBe(5);
    });

    it('should exclude weekends', () => {
      // January 6-12, 2025 is Mon-Sun (7 days, 5 weekdays)
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-12');

      const workingDays = service.getWorkingDaysInRange(start, end);
      expect(workingDays).toBe(5);
    });

    it('should exclude public holidays', () => {
      // December 24-26, 2025: Wed, Thu (Christmas), Fri (Day of Goodwill)
      const start = new Date('2025-12-24');
      const end = new Date('2025-12-26');

      const workingDays = service.getWorkingDaysInRange(start, end);
      expect(workingDays).toBe(1); // Only Dec 24
    });

    it('should exclude Good Friday and Family Day in April 2025', () => {
      // April 14-25, 2025: 2 weeks including Good Friday (18) and Family Day (21)
      const start = new Date('2025-04-14');
      const end = new Date('2025-04-25');

      const workingDays = service.getWorkingDaysInRange(start, end);
      // 10 weekdays - 2 holidays = 8 working days
      expect(workingDays).toBe(8);
    });

    it('should return 0 for weekend-only range', () => {
      const start = new Date('2025-01-04'); // Saturday
      const end = new Date('2025-01-05'); // Sunday

      const workingDays = service.getWorkingDaysInRange(start, end);
      expect(workingDays).toBe(0);
    });

    it('should return 0 when start is after end', () => {
      const start = new Date('2025-01-10');
      const end = new Date('2025-01-06');

      const workingDays = service.getWorkingDaysInRange(start, end);
      expect(workingDays).toBe(0);
    });

    it('should handle single day', () => {
      const monday = new Date('2025-01-06');
      const workingDays = service.getWorkingDaysInRange(monday, monday);
      expect(workingDays).toBe(1);
    });

    it('should include holidays when option is set', () => {
      // December 24-26, 2025: Wed, Thu (Christmas), Fri (Day of Goodwill)
      const start = new Date('2025-12-24');
      const end = new Date('2025-12-26');

      const workingDays = service.getWorkingDaysInRange(start, end, {
        includePublicHolidays: true,
      });
      expect(workingDays).toBe(3); // All 3 weekdays
    });

    it('should respect custom exclusions', () => {
      const start = new Date('2025-01-06');
      const end = new Date('2025-01-10');

      const workingDays = service.getWorkingDaysInRange(start, end, {
        customExclusions: [new Date('2025-01-07'), new Date('2025-01-08')],
      });
      expect(workingDays).toBe(3); // 5 - 2 custom exclusions
    });

    it('should calculate January 2025 working days correctly', () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const workingDays = service.getWorkingDaysInRange(start, end);
      // 31 days - 8 weekend days (4 Sat, 4 Sun) - 1 holiday (New Year) = 22 working days
      expect(workingDays).toBe(22);
    });
  });

  describe('getWorkingDaysInMonth', () => {
    it('should calculate working days in January 2025', () => {
      const workingDays = service.getWorkingDaysInMonth(2025, 1);
      expect(workingDays).toBe(22);
    });

    it('should calculate working days in April 2025 (with Easter holidays)', () => {
      const workingDays = service.getWorkingDaysInMonth(2025, 4);
      // April 2025: 30 days - 8 weekend days - 4 holidays
      // (Good Friday 18, Family Day 21, Freedom Day 27 Sun, Freedom Day Observed 28)
      // But Freedom Day is on Sunday so doesn't reduce working days
      // = 22 weekdays - 3 weekday holidays (GF, FD, FD Obs) = 19
      expect(workingDays).toBe(19);
    });

    it('should calculate working days in December 2025', () => {
      const workingDays = service.getWorkingDaysInMonth(2025, 12);
      // December 2025: 31 days - 8 weekend days - 3 holidays = 20 working days
      // Holidays: Day of Reconciliation (16, Tue), Christmas (25, Thu), Day of Goodwill (26, Fri)
      expect(workingDays).toBe(20);
    });
  });

  describe('getLeaveDeductionDays', () => {
    it('should calculate leave deduction excluding weekends', () => {
      const start = new Date('2025-01-06'); // Monday
      const end = new Date('2025-01-12'); // Sunday

      const result = service.getLeaveDeductionDays(start, end);

      expect(result.totalCalendarDays).toBe(7);
      expect(result.weekendsExcluded).toBe(2);
      expect(result.publicHolidaysExcluded).toBe(0);
      expect(result.daysToDeduct).toBe(5);
    });

    it('should calculate leave deduction excluding holidays', () => {
      // April 14-25, 2025: includes Good Friday and Family Day
      const start = new Date('2025-04-14');
      const end = new Date('2025-04-25');

      const result = service.getLeaveDeductionDays(start, end);

      expect(result.totalCalendarDays).toBe(12);
      expect(result.publicHolidaysExcluded).toBe(2); // Good Friday and Family Day
      expect(result.daysToDeduct).toBe(8); // 10 weekdays - 2 holidays
      expect(result.holidaysInRange.length).toBe(2);
      expect(result.holidaysInRange.map((h) => h.name)).toContain(
        'Good Friday',
      );
      expect(result.holidaysInRange.map((h) => h.name)).toContain('Family Day');
    });

    it('should list holidays that fall within leave period', () => {
      const start = new Date('2025-12-22');
      const end = new Date('2025-12-31');

      const result = service.getLeaveDeductionDays(start, end);

      expect(result.holidaysInRange.length).toBe(2);
      const holidayNames = result.holidaysInRange.map((h) => h.name);
      expect(holidayNames).toContain('Christmas Day');
      expect(holidayNames).toContain('Day of Goodwill');
    });

    it('should not double-count weekend holidays', () => {
      // Freedom Day 2025 is April 27 (Sunday) - should only count as weekend
      const start = new Date('2025-04-26');
      const end = new Date('2025-04-28');

      const result = service.getLeaveDeductionDays(start, end);

      expect(result.totalCalendarDays).toBe(3);
      expect(result.weekendsExcluded).toBe(2); // Sat 26, Sun 27
      // Freedom Day on Sunday is already excluded as weekend
      // Freedom Day Observed (Mon 28) is a weekday holiday
      expect(result.publicHolidaysExcluded).toBe(1); // Only Mon 28 observed
      expect(result.daysToDeduct).toBe(0);
    });

    it('should return correct breakdown for full month', () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      const result = service.getLeaveDeductionDays(start, end);

      expect(result.totalCalendarDays).toBe(31);
      expect(result.weekendsExcluded).toBe(8);
      expect(result.publicHolidaysExcluded).toBe(1); // New Year's Day
      expect(result.workingDays).toBe(22);
      expect(result.daysToDeduct).toBe(22);
    });
  });

  describe('calculatePublicHolidayPay (BCEA Double Rate)', () => {
    it('should calculate double pay for full day work', () => {
      // R500/day = 50000 cents, 8 hours worked
      const result = service.calculatePublicHolidayPay(50000, 8);

      expect(result.regularDailyRateCents).toBe(50000);
      expect(result.hoursWorked).toBe(8);
      expect(result.standardWorkDayHours).toBe(8);
      expect(result.totalPayCents).toBe(100000); // Double pay
      expect(result.breakdown.basePayCents).toBe(50000);
      expect(result.breakdown.additionalPayCents).toBe(50000);
      expect(result.breakdown.proRataFactor).toBe(1);
    });

    it('should calculate double pay for half day work', () => {
      // R500/day = 50000 cents, 4 hours worked (half day)
      const result = service.calculatePublicHolidayPay(50000, 4);

      expect(result.hoursWorked).toBe(4);
      expect(result.breakdown.proRataFactor).toBe(0.5);
      expect(result.totalPayCents).toBe(50000); // Half of double = full day rate
      expect(result.breakdown.basePayCents).toBe(25000);
      expect(result.breakdown.additionalPayCents).toBe(25000);
    });

    it('should calculate double pay for 2 hours work', () => {
      // R400/day = 40000 cents, 2 hours worked
      const result = service.calculatePublicHolidayPay(40000, 2);

      expect(result.breakdown.proRataFactor).toBe(0.25);
      expect(result.totalPayCents).toBe(20000); // 2/8 of double pay
    });

    it('should cap pro-rata factor at 1 for overtime', () => {
      // Working more than 8 hours shouldn't increase the multiplier
      const result = service.calculatePublicHolidayPay(50000, 10);

      expect(result.breakdown.proRataFactor).toBe(1); // Capped at 1
      expect(result.totalPayCents).toBe(100000); // Still double rate
    });

    it('should handle zero hours (no work)', () => {
      const result = service.calculatePublicHolidayPay(50000, 0);

      expect(result.totalPayCents).toBe(0);
      expect(result.breakdown.proRataFactor).toBe(0);
    });

    it('should handle minimum wage scenario', () => {
      // Minimum wage ~R27.58/hour = ~R220.64/day = 22064 cents
      const result = service.calculatePublicHolidayPay(22064, 8);

      expect(result.totalPayCents).toBe(44128); // Double rate
    });
  });

  describe('isWeekend', () => {
    it('should return true for Saturday', () => {
      expect(service.isWeekend(new Date('2025-01-04'))).toBe(true);
    });

    it('should return true for Sunday', () => {
      expect(service.isWeekend(new Date('2025-01-05'))).toBe(true);
    });

    it('should return false for weekdays', () => {
      expect(service.isWeekend(new Date('2025-01-06'))).toBe(false); // Monday
      expect(service.isWeekend(new Date('2025-01-07'))).toBe(false); // Tuesday
      expect(service.isWeekend(new Date('2025-01-08'))).toBe(false); // Wednesday
      expect(service.isWeekend(new Date('2025-01-09'))).toBe(false); // Thursday
      expect(service.isWeekend(new Date('2025-01-10'))).toBe(false); // Friday
    });
  });

  describe('isWorkingDay', () => {
    it('should return true for regular weekdays', () => {
      expect(service.isWorkingDay(new Date('2025-01-06'))).toBe(true);
    });

    it('should return false for weekends', () => {
      expect(service.isWorkingDay(new Date('2025-01-04'))).toBe(false);
      expect(service.isWorkingDay(new Date('2025-01-05'))).toBe(false);
    });

    it('should return false for public holidays', () => {
      expect(service.isWorkingDay(new Date('2025-01-01'))).toBe(false); // New Year
      expect(service.isWorkingDay(new Date('2025-12-25'))).toBe(false); // Christmas
    });
  });

  describe('getNextWorkingDay', () => {
    it('should return same day if already working day', () => {
      const monday = new Date('2025-01-06');
      const result = service.getNextWorkingDay(monday);

      expect(result.getDate()).toBe(6);
    });

    it('should skip weekends', () => {
      const saturday = new Date('2025-01-04');
      const result = service.getNextWorkingDay(saturday);

      expect(result.getDate()).toBe(6); // Monday
    });

    it('should skip public holidays', () => {
      const newYear = new Date('2025-01-01'); // Wednesday
      const result = service.getNextWorkingDay(newYear);

      expect(result.getDate()).toBe(2); // Thursday
    });

    it('should handle consecutive non-working days', () => {
      const christmas = new Date('2025-12-25'); // Thursday
      const result = service.getNextWorkingDay(christmas);

      // Dec 25 (holiday), 26 (holiday), 27 (Sat), 28 (Sun) -> 29 (Mon)
      expect(result.getDate()).toBe(29);
    });
  });

  describe('getEasterSunday / getGoodFriday / getFamilyDay', () => {
    it('should expose Easter calculation', () => {
      const easter = service.getEasterSunday(2025);
      expect(easter.getMonth()).toBe(3); // April
      expect(easter.getDate()).toBe(20);
    });

    it('should expose Good Friday calculation', () => {
      const goodFriday = service.getGoodFriday(2025);
      expect(goodFriday.getMonth()).toBe(3); // April
      expect(goodFriday.getDate()).toBe(18);
    });

    it('should expose Family Day calculation', () => {
      const familyDay = service.getFamilyDay(2025);
      expect(familyDay.getMonth()).toBe(3); // April
      expect(familyDay.getDate()).toBe(21);
    });
  });

  describe('getPublicHolidayDetails', () => {
    it('should return holiday details for public holiday', () => {
      const details = service.getPublicHolidayDetails(new Date('2025-12-25'));

      expect(details).toBeDefined();
      expect(details!.name).toBe('Christmas Day');
      expect(details!.id).toBe('christmas-day');
    });

    it('should return undefined for non-holiday', () => {
      const details = service.getPublicHolidayDetails(new Date('2025-01-02'));
      expect(details).toBeUndefined();
    });

    it('should return observed holiday details', () => {
      const details = service.getPublicHolidayDetails(new Date('2025-04-28'));

      expect(details).toBeDefined();
      expect(details!.name).toBe('Freedom Day (Observed)');
      expect(details!.isObserved).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle year boundaries correctly', () => {
      const dec31 = new Date('2024-12-31');
      const jan1 = new Date('2025-01-01');

      expect(service.isPublicHoliday(dec31)).toBe(false);
      expect(service.isPublicHoliday(jan1)).toBe(true);
    });

    it('should handle leap year February', () => {
      const start = new Date('2024-02-01');
      const end = new Date('2024-02-29');

      const workingDays = service.getWorkingDaysInRange(start, end);
      // Feb 2024: 29 days - 8 weekend days = 21 weekdays
      // No public holidays in Feb
      expect(workingDays).toBe(21);
    });

    it('should handle dates with time components', () => {
      const withTime = new Date('2025-12-25T14:30:00.000Z');
      expect(service.isPublicHoliday(withTime)).toBe(true);

      const details = service.getPublicHolidayDetails(withTime);
      expect(details).toBeDefined();
      expect(details!.name).toBe('Christmas Day');
    });

    it('should work for historical years', () => {
      const holidays1994 = service.getHolidaysForYear(1994);
      expect(holidays1994.length).toBeGreaterThanOrEqual(12);
    });

    it('should work for future years', () => {
      const holidays2050 = service.getHolidaysForYear(2050);
      expect(holidays2050.length).toBeGreaterThanOrEqual(12);
    });

    it('should handle empty date range', () => {
      const sameDay = new Date('2025-01-06');
      const workingDays = service.getWorkingDaysInRange(sameDay, sameDay);
      expect(workingDays).toBe(1);
    });
  });

  describe('Holiday Definitions Completeness', () => {
    it('should have exactly 12 base holiday definitions', () => {
      expect(SA_PUBLIC_HOLIDAY_DEFINITIONS.length).toBe(12);
    });

    it('should have unique IDs for all definitions', () => {
      const ids = SA_PUBLIC_HOLIDAY_DEFINITIONS.map((d) => d.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(12);
    });

    it('should have all required holiday IDs', () => {
      const ids = SA_PUBLIC_HOLIDAY_DEFINITIONS.map((d) => d.id);
      const requiredIds = [
        'new-years-day',
        'human-rights-day',
        'good-friday',
        'family-day',
        'freedom-day',
        'workers-day',
        'youth-day',
        'national-womens-day',
        'heritage-day',
        'day-of-reconciliation',
        'christmas-day',
        'day-of-goodwill',
      ];

      for (const required of requiredIds) {
        expect(ids).toContain(required);
      }
    });
  });
});
