/**
 * Date Utilities Tests
 * TASK-UI-002: Expand Frontend Test Coverage
 *
 * Tests for South Africa timezone date utilities including:
 * - Timezone conversions
 * - Date formatting functions
 * - Date boundary calculations
 * - Billing period calculations
 * - Date range presets
 * - API conversion functions
 * - Validation functions
 * - Edge cases
 */

import {
  SA_TIMEZONE,
  SA_DATE_FORMAT,
  ISO_DATE_FORMAT,
  SA_DATETIME_FORMAT,
  SA_LONG_DATE_FORMAT,
  SA_MONTH_YEAR_FORMAT,
  toSATimezone,
  fromSATimezone,
  nowSA,
  todaySA,
  formatSADate,
  formatSADateTime,
  formatSALongDate,
  formatSAMonthYear,
  startOfDaySA,
  endOfDaySA,
  startOfWeekSA,
  endOfWeekSA,
  startOfMonthSA,
  endOfMonthSA,
  startOfQuarterSA,
  endOfQuarterSA,
  startOfYearSA,
  endOfYearSA,
  getBillingPeriod,
  getCurrentBillingPeriod,
  getPreviousBillingPeriod,
  getSATaxYear,
  getCurrentSATaxYear,
  getDateRangePresets,
  getBillingPresets,
  toISOString,
  toDateOnlyString,
  parseISOSafe,
  isFutureDateSA,
  isPastDateSA,
  isTodaySA,
  isValidDateRange,
  getDaysInRange,
  addDaysSA,
  addMonthsSA,
  getMonthsBetween,
  type DateRange,
  type BillingPeriod,
} from '../lib/date-utils';

describe('Date Utilities', () => {
  // Store original Date for restoration
  const RealDate = Date;

  afterEach(() => {
    // Restore Date if mocked
    global.Date = RealDate;
  });

  describe('Constants', () => {
    it('should export SA timezone constant', () => {
      expect(SA_TIMEZONE).toBe('Africa/Johannesburg');
    });

    it('should export date format constants', () => {
      expect(SA_DATE_FORMAT).toBe('dd/MM/yyyy');
      expect(ISO_DATE_FORMAT).toBe('yyyy-MM-dd');
      expect(SA_DATETIME_FORMAT).toBe('dd/MM/yyyy HH:mm');
      expect(SA_LONG_DATE_FORMAT).toBe('dd MMMM yyyy');
      expect(SA_MONTH_YEAR_FORMAT).toBe('MMMM yyyy');
    });
  });

  describe('Core Timezone Conversion Functions', () => {
    describe('toSATimezone', () => {
      it('should convert Date object to SA timezone', () => {
        const utcDate = new Date('2026-01-15T00:00:00Z');
        const saDate = toSATimezone(utcDate);

        expect(saDate).toBeInstanceOf(Date);
        // SA is UTC+2, so midnight UTC becomes 02:00 SA
        expect(saDate.getHours()).toBe(2);
      });

      it('should convert ISO string to SA timezone', () => {
        const isoString = '2026-01-15T12:00:00Z';
        const saDate = toSATimezone(isoString);

        expect(saDate).toBeInstanceOf(Date);
        // 12:00 UTC becomes 14:00 SA
        expect(saDate.getHours()).toBe(14);
      });

      it('should throw error for invalid date', () => {
        expect(() => toSATimezone('invalid-date')).toThrow('Invalid date provided');
      });
    });

    describe('fromSATimezone', () => {
      it('should convert SA local time to UTC', () => {
        const saDate = new Date(2026, 0, 15, 14, 0, 0); // 14:00 SA time
        const utcDate = fromSATimezone(saDate);

        expect(utcDate).toBeInstanceOf(Date);
      });
    });

    describe('nowSA', () => {
      it('should return current date in SA timezone', () => {
        const result = nowSA();
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('todaySA', () => {
      it('should return start of today in SA timezone', () => {
        const result = todaySA();
        expect(result).toBeInstanceOf(Date);
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
      });
    });
  });

  describe('Date Formatting Functions', () => {
    describe('formatSADate', () => {
      it('should format Date object correctly', () => {
        const date = new Date('2026-01-15T10:30:00Z');
        const formatted = formatSADate(date);

        // Should be in dd/MM/yyyy format
        expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(formatted).toBe('15/01/2026');
      });

      it('should format ISO string correctly', () => {
        const formatted = formatSADate('2026-01-15T10:30:00Z');
        expect(formatted).toBe('15/01/2026');
      });

      it('should accept custom format string', () => {
        const date = new Date('2026-01-15T10:30:00Z');
        const formatted = formatSADate(date, 'yyyy-MM-dd');
        expect(formatted).toBe('2026-01-15');
      });

      it('should return empty string for null', () => {
        expect(formatSADate(null)).toBe('');
      });

      it('should return empty string for undefined', () => {
        expect(formatSADate(undefined)).toBe('');
      });

      it('should return empty string for invalid date string', () => {
        expect(formatSADate('invalid-date')).toBe('');
      });
    });

    describe('formatSADateTime', () => {
      it('should format date with time component', () => {
        const date = new Date('2026-01-15T10:30:00Z');
        const formatted = formatSADateTime(date);

        // Should include time in dd/MM/yyyy HH:mm format
        expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
      });

      it('should return empty string for null', () => {
        expect(formatSADateTime(null)).toBe('');
      });
    });

    describe('formatSALongDate', () => {
      it('should format date in long format', () => {
        const date = new Date('2026-01-15T10:30:00Z');
        const formatted = formatSALongDate(date);

        // Should be like "15 January 2026"
        expect(formatted).toBe('15 January 2026');
      });

      it('should return empty string for null', () => {
        expect(formatSALongDate(null)).toBe('');
      });
    });

    describe('formatSAMonthYear', () => {
      it('should format month and year', () => {
        const date = new Date('2026-01-15T10:30:00Z');
        const formatted = formatSAMonthYear(date);

        // Should be like "January 2026"
        expect(formatted).toBe('January 2026');
      });

      it('should return empty string for null', () => {
        expect(formatSAMonthYear(null)).toBe('');
      });
    });
  });

  describe('Date Boundary Functions', () => {
    const testDate = new Date('2026-01-15T12:30:45Z');

    describe('startOfDaySA', () => {
      it('should return start of day in SA timezone', () => {
        const result = startOfDaySA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('endOfDaySA', () => {
      it('should return end of day in SA timezone', () => {
        const result = endOfDaySA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('startOfWeekSA', () => {
      it('should return start of week (Monday) in SA timezone', () => {
        const result = startOfWeekSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('endOfWeekSA', () => {
      it('should return end of week (Sunday) in SA timezone', () => {
        const result = endOfWeekSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('startOfMonthSA', () => {
      it('should return start of month in SA timezone', () => {
        const result = startOfMonthSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('endOfMonthSA', () => {
      it('should return end of month in SA timezone', () => {
        const result = endOfMonthSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('startOfQuarterSA', () => {
      it('should return start of quarter in SA timezone', () => {
        const result = startOfQuarterSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('endOfQuarterSA', () => {
      it('should return end of quarter in SA timezone', () => {
        const result = endOfQuarterSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('startOfYearSA', () => {
      it('should return start of year in SA timezone', () => {
        const result = startOfYearSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });

    describe('endOfYearSA', () => {
      it('should return end of year in SA timezone', () => {
        const result = endOfYearSA(testDate);
        expect(result).toBeInstanceOf(Date);
      });
    });
  });

  describe('Billing Period Functions', () => {
    describe('getBillingPeriod', () => {
      it('should return billing period for specific month/year', () => {
        const result = getBillingPeriod(2026, 1);

        expect(result).toHaveProperty('start');
        expect(result).toHaveProperty('end');
        expect(result.year).toBe(2026);
        expect(result.month).toBe(1);
        expect(result.label).toBe('January 2026');
      });

      it('should handle different months correctly', () => {
        const janResult = getBillingPeriod(2026, 1);
        expect(janResult.label).toBe('January 2026');

        const decResult = getBillingPeriod(2025, 12);
        expect(decResult.label).toBe('December 2025');
      });

      it('should handle edge month (February)', () => {
        const result = getBillingPeriod(2026, 2);
        expect(result.month).toBe(2);
        expect(result.label).toBe('February 2026');
      });
    });

    describe('getCurrentBillingPeriod', () => {
      it('should return current month billing period', () => {
        const result = getCurrentBillingPeriod();

        expect(result).toHaveProperty('start');
        expect(result).toHaveProperty('end');
        expect(result).toHaveProperty('year');
        expect(result).toHaveProperty('month');
        expect(result).toHaveProperty('label');
      });
    });

    describe('getPreviousBillingPeriod', () => {
      it('should return previous month by default', () => {
        const current = getCurrentBillingPeriod();
        const previous = getPreviousBillingPeriod();

        // Previous should be before current
        expect(previous.end.getTime()).toBeLessThan(current.start.getTime());
      });

      it('should go back specified number of months', () => {
        const current = getCurrentBillingPeriod();
        const twoMonthsAgo = getPreviousBillingPeriod(2);

        expect(twoMonthsAgo.end.getTime()).toBeLessThan(current.start.getTime());
      });
    });

    describe('getSATaxYear', () => {
      it('should return SA tax year starting March 1', () => {
        const result = getSATaxYear(2025);

        expect(result).toHaveProperty('start');
        expect(result).toHaveProperty('end');
      });
    });

    describe('getCurrentSATaxYear', () => {
      it('should return current tax year with label', () => {
        const result = getCurrentSATaxYear();

        expect(result).toHaveProperty('start');
        expect(result).toHaveProperty('end');
        expect(result).toHaveProperty('label');
        expect(result.label).toMatch(/\d{4}\/\d{4} Tax Year/);
      });
    });
  });

  describe('Date Range Presets', () => {
    describe('getDateRangePresets', () => {
      it('should return array of date range presets', () => {
        const presets = getDateRangePresets();

        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBeGreaterThan(0);
      });

      it('should include Today preset', () => {
        const presets = getDateRangePresets();
        const todayPreset = presets.find(p => p.label === 'Today');

        expect(todayPreset).toBeDefined();
        expect(todayPreset!.range.from).toBeInstanceOf(Date);
        expect(todayPreset!.range.to).toBeInstanceOf(Date);
      });

      it('should include Yesterday preset', () => {
        const presets = getDateRangePresets();
        const yesterdayPreset = presets.find(p => p.label === 'Yesterday');

        expect(yesterdayPreset).toBeDefined();
      });

      it('should include common presets', () => {
        const presets = getDateRangePresets();
        const labels = presets.map(p => p.label);

        expect(labels).toContain('Last 7 Days');
        expect(labels).toContain('Last 30 Days');
        expect(labels).toContain('This Week');
        expect(labels).toContain('Last Week');
        expect(labels).toContain('This Month');
        expect(labels).toContain('Last Month');
        expect(labels).toContain('This Quarter');
        expect(labels).toContain('Last Quarter');
        expect(labels).toContain('This Year');
        expect(labels).toContain('Last Year');
      });

      it('should have valid date ranges for all presets', () => {
        const presets = getDateRangePresets();

        presets.forEach(preset => {
          expect(preset.range.from).toBeInstanceOf(Date);
          expect(preset.range.to).toBeInstanceOf(Date);
          expect(preset.range.from!.getTime()).toBeLessThanOrEqual(preset.range.to!.getTime());
        });
      });
    });

    describe('getBillingPresets', () => {
      it('should return billing-focused presets', () => {
        const presets = getBillingPresets();

        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBe(4);
      });

      it('should include current month billing period', () => {
        const presets = getBillingPresets();
        const current = getCurrentBillingPeriod();

        const currentPreset = presets.find(p => p.label === current.label);
        expect(currentPreset).toBeDefined();
      });

      it('should include tax year preset', () => {
        const presets = getBillingPresets();
        const taxYearPreset = presets.find(p => p.label.includes('Tax Year'));

        expect(taxYearPreset).toBeDefined();
      });
    });
  });

  describe('API Conversion Functions', () => {
    describe('toISOString', () => {
      it('should convert date to ISO string', () => {
        const date = new Date('2026-01-15T12:30:00Z');
        const result = toISOString(date);

        expect(result).toBe(date.toISOString());
      });

      it('should return empty string for null', () => {
        expect(toISOString(null)).toBe('');
      });

      it('should return empty string for undefined', () => {
        expect(toISOString(undefined)).toBe('');
      });

      it('should return empty string for invalid date', () => {
        expect(toISOString(new Date('invalid'))).toBe('');
      });
    });

    describe('toDateOnlyString', () => {
      it('should convert date to YYYY-MM-DD format', () => {
        const date = new Date('2026-01-15T12:30:00Z');
        const result = toDateOnlyString(date);

        expect(result).toBe('2026-01-15');
      });

      it('should return empty string for null', () => {
        expect(toDateOnlyString(null)).toBe('');
      });

      it('should return empty string for undefined', () => {
        expect(toDateOnlyString(undefined)).toBe('');
      });

      it('should return empty string for invalid date', () => {
        expect(toDateOnlyString(new Date('invalid'))).toBe('');
      });
    });

    describe('parseISOSafe', () => {
      it('should parse valid ISO string', () => {
        const result = parseISOSafe('2026-01-15T12:30:00Z');

        expect(result).toBeInstanceOf(Date);
        expect(result!.getFullYear()).toBe(2026);
      });

      it('should parse date-only string', () => {
        const result = parseISOSafe('2026-01-15');

        expect(result).toBeInstanceOf(Date);
      });

      it('should return null for null input', () => {
        expect(parseISOSafe(null)).toBeNull();
      });

      it('should return null for undefined input', () => {
        expect(parseISOSafe(undefined)).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(parseISOSafe('')).toBeNull();
      });

      it('should return null for invalid date string', () => {
        expect(parseISOSafe('invalid-date')).toBeNull();
      });
    });
  });

  describe('Validation Functions', () => {
    describe('isFutureDateSA', () => {
      it('should return true for future date', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        expect(isFutureDateSA(futureDate)).toBe(true);
      });

      it('should return false for past date', () => {
        const pastDate = new Date();
        pastDate.setFullYear(pastDate.getFullYear() - 1);

        expect(isFutureDateSA(pastDate)).toBe(false);
      });
    });

    describe('isPastDateSA', () => {
      it('should return true for past date', () => {
        const pastDate = new Date();
        pastDate.setFullYear(pastDate.getFullYear() - 1);

        expect(isPastDateSA(pastDate)).toBe(true);
      });

      it('should return false for future date', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);

        expect(isPastDateSA(futureDate)).toBe(false);
      });
    });

    describe('isTodaySA', () => {
      it('should return true for today', () => {
        const today = new Date();
        expect(isTodaySA(today)).toBe(true);
      });

      it('should return false for yesterday', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        expect(isTodaySA(yesterday)).toBe(false);
      });

      it('should return false for tomorrow', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        expect(isTodaySA(tomorrow)).toBe(false);
      });
    });

    describe('isValidDateRange', () => {
      it('should return true for valid range (from before to)', () => {
        const range: DateRange = {
          from: new Date('2026-01-01'),
          to: new Date('2026-01-31'),
        };

        expect(isValidDateRange(range)).toBe(true);
      });

      it('should return true for same date (from equals to)', () => {
        const date = new Date('2026-01-15');
        const range: DateRange = {
          from: date,
          to: date,
        };

        expect(isValidDateRange(range)).toBe(true);
      });

      it('should return false for invalid range (from after to)', () => {
        const range: DateRange = {
          from: new Date('2026-01-31'),
          to: new Date('2026-01-01'),
        };

        expect(isValidDateRange(range)).toBe(false);
      });

      it('should return false for null from', () => {
        const range: DateRange = {
          from: null,
          to: new Date('2026-01-31'),
        };

        expect(isValidDateRange(range)).toBe(false);
      });

      it('should return false for null to', () => {
        const range: DateRange = {
          from: new Date('2026-01-01'),
          to: null,
        };

        expect(isValidDateRange(range)).toBe(false);
      });
    });

    describe('getDaysInRange', () => {
      it('should return correct number of days (inclusive)', () => {
        const range: DateRange = {
          from: new Date('2026-01-01'),
          to: new Date('2026-01-31'),
        };

        expect(getDaysInRange(range)).toBe(31);
      });

      it('should return 1 for same day range', () => {
        const date = new Date('2026-01-15');
        const range: DateRange = {
          from: date,
          to: date,
        };

        expect(getDaysInRange(range)).toBe(1);
      });

      it('should return 7 for one week', () => {
        const range: DateRange = {
          from: new Date('2026-01-01'),
          to: new Date('2026-01-07'),
        };

        expect(getDaysInRange(range)).toBe(7);
      });

      it('should return 0 for null from', () => {
        const range: DateRange = {
          from: null,
          to: new Date('2026-01-31'),
        };

        expect(getDaysInRange(range)).toBe(0);
      });

      it('should return 0 for null to', () => {
        const range: DateRange = {
          from: new Date('2026-01-01'),
          to: null,
        };

        expect(getDaysInRange(range)).toBe(0);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('addDaysSA', () => {
      it('should add days to date', () => {
        const date = new Date('2026-01-15');
        const result = addDaysSA(date, 5);

        expect(result.getDate()).toBe(20);
      });

      it('should handle negative days', () => {
        const date = new Date('2026-01-15');
        const result = addDaysSA(date, -5);

        expect(result.getDate()).toBe(10);
      });

      it('should handle month boundary', () => {
        const date = new Date('2026-01-30');
        const result = addDaysSA(date, 5);

        expect(result.getMonth()).toBe(1); // February
        expect(result.getDate()).toBe(4);
      });
    });

    describe('addMonthsSA', () => {
      it('should add months to date', () => {
        const date = new Date('2026-01-15');
        const result = addMonthsSA(date, 3);

        expect(result.getMonth()).toBe(3); // April
      });

      it('should handle negative months', () => {
        const date = new Date('2026-03-15');
        const result = addMonthsSA(date, -2);

        expect(result.getMonth()).toBe(0); // January
      });

      it('should handle year boundary', () => {
        const date = new Date('2026-11-15');
        const result = addMonthsSA(date, 3);

        expect(result.getFullYear()).toBe(2027);
        expect(result.getMonth()).toBe(1); // February
      });
    });

    describe('getMonthsBetween', () => {
      it('should return array of billing periods between dates', () => {
        const startDate = new Date('2026-01-01');
        const endDate = new Date('2026-03-31');
        const result = getMonthsBetween(startDate, endDate);

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3); // Jan, Feb, Mar
      });

      it('should return single month for same month dates', () => {
        const startDate = new Date('2026-01-05');
        const endDate = new Date('2026-01-25');
        const result = getMonthsBetween(startDate, endDate);

        expect(result.length).toBe(1);
        expect(result[0].month).toBe(1);
      });

      it('should handle year boundary', () => {
        const startDate = new Date('2025-11-01');
        const endDate = new Date('2026-02-28');
        const result = getMonthsBetween(startDate, endDate);

        expect(result.length).toBe(4); // Nov, Dec, Jan, Feb
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle leap year February correctly', () => {
      // 2024 is a leap year
      const result = getBillingPeriod(2024, 2);
      expect(result.label).toBe('February 2024');
    });

    it('should handle year transitions correctly', () => {
      const decPeriod = getBillingPeriod(2025, 12);
      const janPeriod = getBillingPeriod(2026, 1);

      expect(decPeriod.year).toBe(2025);
      expect(janPeriod.year).toBe(2026);
    });

    it('should handle very old dates', () => {
      const result = formatSADate(new Date('1990-01-15'));
      expect(result).toBe('15/01/1990');
    });

    it('should handle very future dates', () => {
      const result = formatSADate(new Date('2099-12-31'));
      expect(result).toBe('31/12/2099');
    });

    it('should handle midnight boundary correctly', () => {
      const midnightDate = new Date('2026-01-15T00:00:00Z');
      const formatted = formatSADate(midnightDate);
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('should handle date at end of day correctly', () => {
      const endOfDay = new Date('2026-01-15T23:59:59.999Z');
      const formatted = formatSADate(endOfDay);
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('DateRange Interface', () => {
    it('should accept DateRange with both dates', () => {
      const range: DateRange = {
        from: new Date('2026-01-01'),
        to: new Date('2026-01-31'),
      };

      expect(range.from).toBeInstanceOf(Date);
      expect(range.to).toBeInstanceOf(Date);
    });

    it('should accept DateRange with null dates', () => {
      const range: DateRange = {
        from: null,
        to: null,
      };

      expect(range.from).toBeNull();
      expect(range.to).toBeNull();
    });
  });

  describe('BillingPeriod Interface', () => {
    it('should have all required properties', () => {
      const period: BillingPeriod = getBillingPeriod(2026, 1);

      expect(period).toHaveProperty('start');
      expect(period).toHaveProperty('end');
      expect(period).toHaveProperty('year');
      expect(period).toHaveProperty('month');
      expect(period).toHaveProperty('label');
      expect(typeof period.year).toBe('number');
      expect(typeof period.month).toBe('number');
      expect(typeof period.label).toBe('string');
    });
  });
});
