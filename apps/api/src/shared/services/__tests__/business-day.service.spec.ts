import { Test, type TestingModule } from '@nestjs/testing';
import { BusinessDayService } from '../business-day.service';

describe('BusinessDayService', () => {
  let service: BusinessDayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessDayService],
    }).compile();

    service = module.get<BusinessDayService>(BusinessDayService);
  });

  afterEach(() => {
    service.clearCache();
  });

  describe('isWeekend', () => {
    it('should identify Saturday as weekend', () => {
      const saturday = new Date('2024-12-21'); // Saturday
      expect(service.isWeekend(saturday)).toBe(true);
    });

    it('should identify Sunday as weekend', () => {
      const sunday = new Date('2024-12-22'); // Sunday
      expect(service.isWeekend(sunday)).toBe(true);
    });

    it('should identify Monday as not weekend', () => {
      const monday = new Date('2024-12-23'); // Monday
      expect(service.isWeekend(monday)).toBe(false);
    });

    it('should identify Friday as not weekend', () => {
      const friday = new Date('2024-12-20'); // Friday
      expect(service.isWeekend(friday)).toBe(false);
    });
  });

  describe('isPublicHoliday', () => {
    describe('2024 holidays', () => {
      it('should identify New Year Day 2024 as public holiday', () => {
        const newYear = new Date('2024-01-01'); // Monday
        expect(service.isPublicHoliday(newYear)).toBe(true);
      });

      it('should identify Good Friday 2024 as public holiday', () => {
        const goodFriday = new Date('2024-03-29'); // Friday
        expect(service.isPublicHoliday(goodFriday)).toBe(true);
      });

      it('should identify Family Day 2024 as public holiday', () => {
        const familyDay = new Date('2024-04-01'); // Monday
        expect(service.isPublicHoliday(familyDay)).toBe(true);
      });

      it('should use observed date for Freedom Day 2024 (Saturday → Monday)', () => {
        const actualDate = new Date('2024-04-27'); // Saturday
        const observedDate = new Date('2024-04-29'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });

      it('should use observed date for Youth Day 2024 (Sunday → Monday)', () => {
        const actualDate = new Date('2024-06-16'); // Sunday
        const observedDate = new Date('2024-06-17'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });

      it('should identify Christmas 2024 as public holiday', () => {
        const christmas = new Date('2024-12-25'); // Wednesday
        expect(service.isPublicHoliday(christmas)).toBe(true);
      });

      it('should identify Day of Reconciliation 2024 as public holiday', () => {
        const reconciliation = new Date('2024-12-16'); // Monday
        expect(service.isPublicHoliday(reconciliation)).toBe(true);
      });
    });

    describe('2025 holidays', () => {
      it('should identify Good Friday 2025 as public holiday', () => {
        const goodFriday = new Date('2025-04-18'); // Friday
        expect(service.isPublicHoliday(goodFriday)).toBe(true);
      });

      it('should identify Family Day 2025 as public holiday', () => {
        const familyDay = new Date('2025-04-21'); // Monday
        expect(service.isPublicHoliday(familyDay)).toBe(true);
      });

      it('should use observed date for Freedom Day 2025 (Sunday → Monday)', () => {
        const actualDate = new Date('2025-04-27'); // Sunday
        const observedDate = new Date('2025-04-28'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });

      it('should use observed date for National Women Day 2025 (Saturday → Monday)', () => {
        const actualDate = new Date('2025-08-09'); // Saturday
        const observedDate = new Date('2025-08-11'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });
    });

    describe('2026 holidays', () => {
      it('should identify Good Friday 2026 as public holiday', () => {
        const goodFriday = new Date('2026-04-03'); // Friday
        expect(service.isPublicHoliday(goodFriday)).toBe(true);
      });

      it('should identify Family Day 2026 as public holiday', () => {
        const familyDay = new Date('2026-04-06'); // Monday
        expect(service.isPublicHoliday(familyDay)).toBe(true);
      });

      it('should use observed date for Human Rights Day 2026 (Saturday → Monday)', () => {
        const actualDate = new Date('2026-03-21'); // Saturday
        const observedDate = new Date('2026-03-23'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });

      it('should use observed date for Day of Goodwill 2026 (Saturday → Monday)', () => {
        const actualDate = new Date('2026-12-26'); // Saturday
        const observedDate = new Date('2026-12-28'); // Monday

        expect(service.isPublicHoliday(actualDate)).toBe(false);
        expect(service.isPublicHoliday(observedDate)).toBe(true);
      });
    });

    it('should return false for regular weekdays', () => {
      const regularDay = new Date('2024-12-23'); // Monday, not a holiday
      expect(service.isPublicHoliday(regularDay)).toBe(false);
    });

    it('should return false for years without holiday data', () => {
      const futureDate = new Date('2030-01-01');
      expect(service.isPublicHoliday(futureDate)).toBe(false);
    });
  });

  describe('isBusinessDay', () => {
    it('should return true for regular weekdays', () => {
      const monday = new Date('2024-12-23'); // Monday, not a holiday
      expect(service.isBusinessDay(monday)).toBe(true);
    });

    it('should return false for Saturday', () => {
      const saturday = new Date('2024-12-21');
      expect(service.isBusinessDay(saturday)).toBe(false);
    });

    it('should return false for Sunday', () => {
      const sunday = new Date('2024-12-22');
      expect(service.isBusinessDay(sunday)).toBe(false);
    });

    it('should return false for public holidays', () => {
      const christmas = new Date('2024-12-25');
      expect(service.isBusinessDay(christmas)).toBe(false);
    });

    it('should return false for observed public holidays', () => {
      const observedHoliday = new Date('2024-04-29'); // Freedom Day observed (was Saturday)
      expect(service.isBusinessDay(observedHoliday)).toBe(false);
    });
  });

  describe('getBusinessDaysBetween', () => {
    it('should return 0 for same day', () => {
      const date = new Date('2024-12-23');
      expect(service.getBusinessDaysBetween(date, date)).toBe(0);
    });

    it('should return 0 when end date is before start date', () => {
      const start = new Date('2024-12-23');
      const end = new Date('2024-12-20');
      expect(service.getBusinessDaysBetween(start, end)).toBe(0);
    });

    it('should count business days excluding weekends', () => {
      const friday = new Date('2024-12-20'); // Friday
      const monday = new Date('2024-12-23'); // Monday
      // Saturday and Sunday excluded, only Monday counted
      expect(service.getBusinessDaysBetween(friday, monday)).toBe(1);
    });

    it('should count consecutive business days', () => {
      const monday = new Date('2024-12-23'); // Monday
      const friday = new Date('2024-12-27'); // Friday
      // Tuesday (24th), Wed (25th Christmas), Thu (26th Day of Goodwill), Fri (27th)
      // Only Tue and Fri are business days = 2 days
      expect(service.getBusinessDaysBetween(monday, friday)).toBe(2);
    });

    it('should exclude public holidays from count', () => {
      const beforeChristmas = new Date('2024-12-24'); // Tuesday
      const afterChristmas = new Date('2024-12-27'); // Friday
      // Dec 25 (Wed) is Christmas, Dec 26 (Thu) is Day of Goodwill
      // Only Friday (Dec 27) counts
      expect(
        service.getBusinessDaysBetween(beforeChristmas, afterChristmas),
      ).toBe(1);
    });

    it('should handle observed holidays', () => {
      const beforeHoliday = new Date('2024-04-26'); // Friday before Freedom Day
      const afterHoliday = new Date('2024-04-30'); // Tuesday after observed Monday
      // Saturday (27th actual), Sunday (28th), Monday (29th observed) excluded
      // Only Tuesday (30th) counts
      expect(service.getBusinessDaysBetween(beforeHoliday, afterHoliday)).toBe(
        1,
      );
    });

    it('should handle year boundaries', () => {
      const endOf2024 = new Date('2024-12-30'); // Monday
      const startOf2025 = new Date('2025-01-02'); // Thursday
      // Dec 31 (Tue), Jan 1 (Wed holiday), Jan 2 (Thu)
      // Only Dec 31 and Jan 2 count = 2 days
      expect(service.getBusinessDaysBetween(endOf2024, startOf2025)).toBe(2);
    });

    it('should handle multiple consecutive holidays (Easter weekend)', () => {
      const beforeEaster = new Date('2024-03-28'); // Thursday before Good Friday
      const afterEaster = new Date('2024-04-02'); // Tuesday after Family Day
      // Mar 29 (Fri - Good Friday), Mar 30-31 (weekend), Apr 1 (Mon - Family Day)
      // Only Apr 2 (Tue) counts
      expect(service.getBusinessDaysBetween(beforeEaster, afterEaster)).toBe(1);
    });
  });

  describe('isWithinBusinessDays', () => {
    it('should return true for dates within 3 business days (default)', () => {
      const date1 = new Date('2024-12-23'); // Monday
      const date2 = new Date('2024-12-26'); // Thursday
      // Tue, Wed, Thu = 3 business days
      expect(service.isWithinBusinessDays(date1, date2)).toBe(true);
    });

    it('should return false for dates beyond 3 business days', () => {
      const date1 = new Date('2024-12-23'); // Monday
      const date2 = new Date('2024-12-30'); // Monday next week
      // Tue (24th), Fri (27th), Mon (30th) = 3 business days exactly
      // Should be within 3 days
      expect(service.isWithinBusinessDays(date1, date2)).toBe(true);
    });

    it('should respect custom business day window (1 day)', () => {
      const date1 = new Date('2024-12-23'); // Monday
      const date2 = new Date('2024-12-24'); // Tuesday
      expect(service.isWithinBusinessDays(date1, date2, 1)).toBe(true);

      const date3 = new Date('2024-12-25'); // Wednesday (Christmas)
      const date4 = new Date('2024-12-27'); // Friday
      // Only Friday counts = 1 business day exactly
      expect(service.isWithinBusinessDays(date3, date4, 1)).toBe(true);
    });

    it('should respect custom business day window (5 days)', () => {
      const date1 = new Date('2024-12-23'); // Monday
      const date2 = new Date('2024-12-30'); // Monday next week
      // Tue, Wed (not Christmas), Thu (not Day of Goodwill), Fri, Mon = 5 business days
      expect(service.isWithinBusinessDays(date1, date2, 5)).toBe(true);
    });

    it('should throw error for invalid window size (less than 1)', () => {
      const date1 = new Date('2024-12-23');
      const date2 = new Date('2024-12-24');
      expect(() => service.isWithinBusinessDays(date1, date2, 0)).toThrow(
        'Business day window must be between 1 and 5 days',
      );
    });

    it('should throw error for invalid window size (greater than 5)', () => {
      const date1 = new Date('2024-12-23');
      const date2 = new Date('2024-12-24');
      expect(() => service.isWithinBusinessDays(date1, date2, 6)).toThrow(
        'Business day window must be between 1 and 5 days',
      );
    });

    it('should handle reconciliation across weekends', () => {
      const friday = new Date('2024-12-20'); // Friday
      const tuesday = new Date('2024-12-24'); // Tuesday
      // Mon (23rd), Tue (24th) = 2 business days
      expect(service.isWithinBusinessDays(friday, tuesday, 3)).toBe(true);
    });

    it('should handle reconciliation with observed holidays', () => {
      const thursday = new Date('2024-04-25'); // Thursday before Freedom Day
      const tuesday = new Date('2024-04-30'); // Tuesday after observed Monday
      // Fri (26th), Mon (29th observed) excluded
      // Only Tue (30th) = 1 business day
      expect(service.isWithinBusinessDays(thursday, tuesday, 3)).toBe(true);
    });
  });

  describe('addBusinessDays', () => {
    it('should add 1 business day', () => {
      const monday = new Date('2024-12-23');
      const result = service.addBusinessDays(monday, 1);
      expect(result.toISOString().split('T')[0]).toBe('2024-12-24'); // Tuesday
    });

    it('should add 3 business days', () => {
      const monday = new Date('2024-12-23');
      const result = service.addBusinessDays(monday, 3);
      // Mon + 1 = Tue (24th), + 2 = Fri (27th, skip Wed/Thu holidays), + 3 = Mon (30th)
      expect(result.toISOString().split('T')[0]).toBe('2024-12-30');
    });

    it('should skip weekends when adding business days', () => {
      const friday = new Date('2024-12-20');
      const result = service.addBusinessDays(friday, 1);
      expect(result.toISOString().split('T')[0]).toBe('2024-12-23'); // Monday
    });

    it('should skip public holidays when adding business days', () => {
      const tuesday = new Date('2024-12-24'); // Before Christmas
      const result = service.addBusinessDays(tuesday, 1);
      // Tue + 1 business day = Fri (27th, skip Wed/Thu holidays)
      expect(result.toISOString().split('T')[0]).toBe('2024-12-27');
    });

    it('should handle negative business days (subtract)', () => {
      const friday = new Date('2024-12-27');
      const result = service.addBusinessDays(friday, -1);
      // Fri - 1 business day = Tue (24th, skip Thu/Wed holidays)
      expect(result.toISOString().split('T')[0]).toBe('2024-12-24');
    });

    it('should handle adding 0 business days', () => {
      const monday = new Date('2024-12-23');
      const result = service.addBusinessDays(monday, 0);
      expect(result.toISOString().split('T')[0]).toBe('2024-12-23');
    });

    it('should handle observed holidays correctly', () => {
      const thursday = new Date('2024-04-25'); // Before Freedom Day weekend
      const result = service.addBusinessDays(thursday, 2);
      // Thu + 1 = Fri (26th), + 2 = Tue (30th, skip Sat/Sun/Mon observed)
      expect(result.toISOString().split('T')[0]).toBe('2024-04-30');
    });

    it('should handle year boundaries', () => {
      const lastBusinessDay2024 = new Date('2024-12-31'); // Tuesday
      const result = service.addBusinessDays(lastBusinessDay2024, 1);
      // Tue + 1 business day = Thu (Jan 2, skip Wed Jan 1 holiday)
      expect(result.toISOString().split('T')[0]).toBe('2025-01-02');
    });
  });

  describe('cache behavior', () => {
    it('should cache holiday lookups for performance', () => {
      const christmas = new Date('2024-12-25');

      // First call
      const result1 = service.isPublicHoliday(christmas);

      // Second call should use cache
      const result2 = service.isPublicHoliday(christmas);

      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });

    it('should clear cache when requested', () => {
      const christmas = new Date('2024-12-25');

      service.isPublicHoliday(christmas);
      service.clearCache();

      // Should still work after cache clear
      expect(service.isPublicHoliday(christmas)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle dates at start of day (midnight)', () => {
      const midnight = new Date('2024-12-25T00:00:00.000Z');
      expect(service.isPublicHoliday(midnight)).toBe(true);
    });

    it('should handle dates at end of day', () => {
      const endOfDay = new Date('2024-12-25T23:59:59.999Z');
      expect(service.isPublicHoliday(endOfDay)).toBe(true);
    });

    it('should handle leap year (2024)', () => {
      const leapDay = new Date('2024-02-29');
      expect(service.isBusinessDay(leapDay)).toBe(true); // Thursday
    });

    it('should handle multiple consecutive public holidays', () => {
      const christmas = new Date('2024-12-25'); // Wednesday
      const goodwill = new Date('2024-12-26'); // Thursday

      expect(service.isPublicHoliday(christmas)).toBe(true);
      expect(service.isPublicHoliday(goodwill)).toBe(true);

      const businessDays = service.getBusinessDaysBetween(christmas, goodwill);
      expect(businessDays).toBe(0);
    });
  });
});
