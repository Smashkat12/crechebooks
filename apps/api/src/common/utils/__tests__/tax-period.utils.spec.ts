/**
 * Tax Period Utilities Tests
 * TASK-SARS-004: Fix Tax Period Boundaries
 * TASK-BILL-005: Fix Billing Period Edge Cases
 *
 * Tests South African tax year utilities including:
 * - Tax year calculation (April to March)
 * - VAT period calculation (bi-monthly)
 * - EMP201 period calculation (monthly)
 * - Billing period edge cases (leap years, month boundaries)
 * - Timezone handling for South Africa (UTC+2)
 */

import {
  getTaxYear,
  getTaxPeriodBoundaries,
  getVatPeriod,
  getVatPeriodsForYear,
  getEmp201Period,
  getBillingPeriod,
  getLastDayOfMonth,
  isLeapYear,
  toSATimezone,
  getStartOfDaySA,
  getEndOfDaySA,
  parseBillingMonth,
  formatBillingMonth,
  getPreviousBillingMonth,
  getNextBillingMonth,
  isDateInBillingPeriod,
  getDaysInPeriod,
  SA_TIMEZONE_OFFSET_HOURS,
} from '../tax-period.utils';

describe('Tax Period Utilities', () => {
  describe('getTaxYear()', () => {
    it('should return correct tax year for April (start of tax year)', () => {
      expect(getTaxYear(new Date('2025-04-01'))).toBe(2025);
      expect(getTaxYear(new Date('2025-04-15'))).toBe(2025);
      expect(getTaxYear(new Date('2025-04-30'))).toBe(2025);
    });

    it('should return correct tax year for May-December', () => {
      expect(getTaxYear(new Date('2025-05-01'))).toBe(2025);
      expect(getTaxYear(new Date('2025-06-15'))).toBe(2025);
      expect(getTaxYear(new Date('2025-09-30'))).toBe(2025);
      expect(getTaxYear(new Date('2025-12-31'))).toBe(2025);
    });

    it('should return PREVIOUS tax year for January-March', () => {
      // Jan-Mar 2026 belongs to tax year 2025
      expect(getTaxYear(new Date('2026-01-01'))).toBe(2025);
      expect(getTaxYear(new Date('2026-02-15'))).toBe(2025);
      expect(getTaxYear(new Date('2026-03-31'))).toBe(2025);
    });

    it('should handle tax year boundary correctly', () => {
      // March 31, 2026 is the last day of tax year 2025
      expect(getTaxYear(new Date('2026-03-31'))).toBe(2025);
      // April 1, 2026 is the first day of tax year 2026
      expect(getTaxYear(new Date('2026-04-01'))).toBe(2026);
    });

    it('should handle leap year dates correctly', () => {
      // Feb 29, 2024 (leap year) - belongs to tax year 2023
      expect(getTaxYear(new Date('2024-02-29'))).toBe(2023);
    });
  });

  describe('getTaxPeriodBoundaries()', () => {
    it('should return correct start date (April 1)', () => {
      const { start } = getTaxPeriodBoundaries(2025);

      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(3); // April (0-indexed)
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
    });

    it('should return correct end date (March 31 next year)', () => {
      const { end } = getTaxPeriodBoundaries(2025);

      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(2); // March (0-indexed)
      expect(end.getDate()).toBe(31);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
    });

    it('should span exactly one year', () => {
      const { start, end } = getTaxPeriodBoundaries(2025);
      const msInYear = 365 * 24 * 60 * 60 * 1000;
      const actualMs = end.getTime() - start.getTime();

      // Allow for leap year variance (365-366 days)
      expect(actualMs).toBeGreaterThanOrEqual(msInYear - 24 * 60 * 60 * 1000);
      expect(actualMs).toBeLessThanOrEqual(msInYear + 24 * 60 * 60 * 1000);
    });
  });

  describe('getVatPeriod()', () => {
    it('should return period 1 for January-February', () => {
      const jan = getVatPeriod(new Date('2025-01-15'));
      const feb = getVatPeriod(new Date('2025-02-28'));

      expect(jan.period).toBe(1);
      expect(feb.period).toBe(1);
    });

    it('should return period 2 for March-April', () => {
      const mar = getVatPeriod(new Date('2025-03-15'));
      const apr = getVatPeriod(new Date('2025-04-30'));

      expect(mar.period).toBe(2);
      expect(apr.period).toBe(2);
    });

    it('should return period 3 for May-June', () => {
      const may = getVatPeriod(new Date('2025-05-01'));
      const jun = getVatPeriod(new Date('2025-06-30'));

      expect(may.period).toBe(3);
      expect(jun.period).toBe(3);
    });

    it('should return period 4 for July-August', () => {
      const jul = getVatPeriod(new Date('2025-07-15'));
      const aug = getVatPeriod(new Date('2025-08-31'));

      expect(jul.period).toBe(4);
      expect(aug.period).toBe(4);
    });

    it('should return period 5 for September-October', () => {
      const sep = getVatPeriod(new Date('2025-09-01'));
      const oct = getVatPeriod(new Date('2025-10-31'));

      expect(sep.period).toBe(5);
      expect(oct.period).toBe(5);
    });

    it('should return period 6 for November-December', () => {
      const nov = getVatPeriod(new Date('2025-11-15'));
      const dec = getVatPeriod(new Date('2025-12-31'));

      expect(nov.period).toBe(6);
      expect(dec.period).toBe(6);
    });

    it('should return correct period boundaries for March-April', () => {
      const { start, end } = getVatPeriod(new Date('2025-03-15'));

      expect(start.getMonth()).toBe(2); // March
      expect(start.getDate()).toBe(1);
      expect(end.getMonth()).toBe(3); // April
      expect(end.getDate()).toBe(30);
    });

    it('should handle leap year February correctly', () => {
      const { end } = getVatPeriod(new Date('2024-02-15'));

      expect(end.getMonth()).toBe(1); // February
      expect(end.getDate()).toBe(29); // Leap year
    });

    it('should handle non-leap year February correctly', () => {
      const { end } = getVatPeriod(new Date('2025-02-15'));

      expect(end.getMonth()).toBe(1); // February
      expect(end.getDate()).toBe(28); // Non-leap year
    });
  });

  describe('getVatPeriodsForYear()', () => {
    it('should return 6 VAT periods', () => {
      const periods = getVatPeriodsForYear(2025);

      expect(periods).toHaveLength(6);
    });

    it('should return periods numbered 1-6', () => {
      const periods = getVatPeriodsForYear(2025);

      expect(periods.map((p) => p.period)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('should cover all 12 months without gaps', () => {
      const periods = getVatPeriodsForYear(2025);

      // First period should start January 1
      expect(periods[0].start.getMonth()).toBe(0);
      expect(periods[0].start.getDate()).toBe(1);

      // Last period should end December 31
      expect(periods[5].end.getMonth()).toBe(11);
      expect(periods[5].end.getDate()).toBe(31);
    });
  });

  describe('getEmp201Period()', () => {
    it('should return correct period for mid-month date', () => {
      const result = getEmp201Period(new Date('2025-06-15'));

      expect(result.periodMonth).toBe(6);
      expect(result.periodYear).toBe(2025);
    });

    it('should return correct start and end dates', () => {
      const result = getEmp201Period(new Date('2025-06-15'));

      expect(result.start.getMonth()).toBe(5); // June (0-indexed)
      expect(result.start.getDate()).toBe(1);
      expect(result.end.getMonth()).toBe(5);
      expect(result.end.getDate()).toBe(30);
    });

    it('should handle December correctly (deadline in next year)', () => {
      const result = getEmp201Period(new Date('2025-12-15'));

      expect(result.periodMonth).toBe(12);
      expect(result.periodYear).toBe(2025);
    });

    it('should handle February in leap year', () => {
      const result = getEmp201Period(new Date('2024-02-15'));

      expect(result.end.getDate()).toBe(29);
    });

    it('should handle February in non-leap year', () => {
      const result = getEmp201Period(new Date('2025-02-15'));

      expect(result.end.getDate()).toBe(28);
    });
  });

  describe('getBillingPeriod()', () => {
    it('should return correct start date (first day of month)', () => {
      const { start } = getBillingPeriod(2025, 6);

      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(5); // June (0-indexed)
      expect(start.getDate()).toBe(1);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    });

    it('should return correct end date (last day of month)', () => {
      const { end } = getBillingPeriod(2025, 6);

      expect(end.getFullYear()).toBe(2025);
      expect(end.getMonth()).toBe(5); // June
      expect(end.getDate()).toBe(30);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
    });

    it('should handle months with 31 days', () => {
      const jan = getBillingPeriod(2025, 1);
      const mar = getBillingPeriod(2025, 3);
      const jul = getBillingPeriod(2025, 7);

      expect(jan.end.getDate()).toBe(31);
      expect(mar.end.getDate()).toBe(31);
      expect(jul.end.getDate()).toBe(31);
    });

    it('should handle months with 30 days', () => {
      const apr = getBillingPeriod(2025, 4);
      const jun = getBillingPeriod(2025, 6);
      const sep = getBillingPeriod(2025, 9);

      expect(apr.end.getDate()).toBe(30);
      expect(jun.end.getDate()).toBe(30);
      expect(sep.end.getDate()).toBe(30);
    });

    it('should handle February in leap year (29 days)', () => {
      const { end } = getBillingPeriod(2024, 2);

      expect(end.getDate()).toBe(29);
    });

    it('should handle February in non-leap year (28 days)', () => {
      const { end } = getBillingPeriod(2025, 2);

      expect(end.getDate()).toBe(28);
    });

    it('should throw error for invalid month (0)', () => {
      expect(() => getBillingPeriod(2025, 0)).toThrow('Invalid month');
    });

    it('should throw error for invalid month (13)', () => {
      expect(() => getBillingPeriod(2025, 13)).toThrow('Invalid month');
    });

    it('should handle December correctly (month 12)', () => {
      const { start, end } = getBillingPeriod(2025, 12);

      expect(start.getMonth()).toBe(11); // December (0-indexed)
      expect(end.getMonth()).toBe(11);
      expect(end.getDate()).toBe(31);
    });
  });

  describe('getLastDayOfMonth()', () => {
    it('should return 31 for January', () => {
      expect(getLastDayOfMonth(2025, 1)).toBe(31);
    });

    it('should return 28 for February in non-leap year', () => {
      expect(getLastDayOfMonth(2025, 2)).toBe(28);
    });

    it('should return 29 for February in leap year', () => {
      expect(getLastDayOfMonth(2024, 2)).toBe(29);
    });

    it('should return 30 for April', () => {
      expect(getLastDayOfMonth(2025, 4)).toBe(30);
    });
  });

  describe('isLeapYear()', () => {
    it('should return true for years divisible by 4', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2028)).toBe(true);
    });

    it('should return false for years not divisible by 4', () => {
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
    });

    it('should return false for years divisible by 100 but not 400', () => {
      expect(isLeapYear(1900)).toBe(false);
      expect(isLeapYear(2100)).toBe(false);
    });

    it('should return true for years divisible by 400', () => {
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(2400)).toBe(true);
    });
  });

  describe('toSATimezone()', () => {
    it('should export SA_TIMEZONE_OFFSET_HOURS as 2', () => {
      expect(SA_TIMEZONE_OFFSET_HOURS).toBe(2);
    });

    it('should convert UTC date to SA timezone', () => {
      // This test verifies the function runs without error
      // and returns a Date object
      const utcDate = new Date('2025-01-15T10:00:00Z');
      const saDate = toSATimezone(utcDate);

      expect(saDate).toBeInstanceOf(Date);
    });
  });

  describe('getStartOfDaySA()', () => {
    it('should return start of day with hours, minutes, seconds as 0', () => {
      const date = new Date('2025-01-15T14:30:45');
      const startOfDay = getStartOfDaySA(date);

      expect(startOfDay.getHours()).toBe(0);
      expect(startOfDay.getMinutes()).toBe(0);
      expect(startOfDay.getSeconds()).toBe(0);
      expect(startOfDay.getMilliseconds()).toBe(0);
    });
  });

  describe('getEndOfDaySA()', () => {
    it('should return end of day with hours, minutes, seconds as 23:59:59.999', () => {
      const date = new Date('2025-01-15T14:30:45');
      const endOfDay = getEndOfDaySA(date);

      expect(endOfDay.getHours()).toBe(23);
      expect(endOfDay.getMinutes()).toBe(59);
      expect(endOfDay.getSeconds()).toBe(59);
      expect(endOfDay.getMilliseconds()).toBe(999);
    });
  });

  describe('parseBillingMonth()', () => {
    it('should parse valid billing month string', () => {
      const result = parseBillingMonth('2025-06');

      expect(result).toEqual({ year: 2025, month: 6 });
    });

    it('should parse January correctly', () => {
      const result = parseBillingMonth('2025-01');

      expect(result).toEqual({ year: 2025, month: 1 });
    });

    it('should parse December correctly', () => {
      const result = parseBillingMonth('2025-12');

      expect(result).toEqual({ year: 2025, month: 12 });
    });

    it('should return null for invalid format (missing dash)', () => {
      expect(parseBillingMonth('202506')).toBeNull();
    });

    it('should return null for invalid format (wrong separator)', () => {
      expect(parseBillingMonth('2025/06')).toBeNull();
    });

    it('should return null for invalid month (00)', () => {
      expect(parseBillingMonth('2025-00')).toBeNull();
    });

    it('should return null for invalid month (13)', () => {
      expect(parseBillingMonth('2025-13')).toBeNull();
    });

    it('should return null for partial year', () => {
      expect(parseBillingMonth('25-06')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseBillingMonth('')).toBeNull();
    });
  });

  describe('formatBillingMonth()', () => {
    it('should format billing month correctly', () => {
      expect(formatBillingMonth(2025, 6)).toBe('2025-06');
    });

    it('should pad single-digit months with zero', () => {
      expect(formatBillingMonth(2025, 1)).toBe('2025-01');
      expect(formatBillingMonth(2025, 9)).toBe('2025-09');
    });

    it('should not pad double-digit months', () => {
      expect(formatBillingMonth(2025, 10)).toBe('2025-10');
      expect(formatBillingMonth(2025, 12)).toBe('2025-12');
    });
  });

  describe('getPreviousBillingMonth()', () => {
    it('should return previous month in same year', () => {
      expect(getPreviousBillingMonth(2025, 6)).toEqual({
        year: 2025,
        month: 5,
      });
      expect(getPreviousBillingMonth(2025, 12)).toEqual({
        year: 2025,
        month: 11,
      });
    });

    it('should return December of previous year for January', () => {
      expect(getPreviousBillingMonth(2025, 1)).toEqual({
        year: 2024,
        month: 12,
      });
    });
  });

  describe('getNextBillingMonth()', () => {
    it('should return next month in same year', () => {
      expect(getNextBillingMonth(2025, 6)).toEqual({ year: 2025, month: 7 });
      expect(getNextBillingMonth(2025, 1)).toEqual({ year: 2025, month: 2 });
    });

    it('should return January of next year for December', () => {
      expect(getNextBillingMonth(2025, 12)).toEqual({ year: 2026, month: 1 });
    });
  });

  describe('isDateInBillingPeriod()', () => {
    it('should return true for date within period', () => {
      const { start, end } = getBillingPeriod(2025, 6);
      const date = new Date('2025-06-15');

      expect(isDateInBillingPeriod(date, start, end)).toBe(true);
    });

    it('should return true for date at period start', () => {
      const { start, end } = getBillingPeriod(2025, 6);
      const date = new Date('2025-06-01T00:00:00');

      expect(isDateInBillingPeriod(date, start, end)).toBe(true);
    });

    it('should return true for date at period end', () => {
      const { start, end } = getBillingPeriod(2025, 6);
      const date = new Date('2025-06-30T23:59:59');

      expect(isDateInBillingPeriod(date, start, end)).toBe(true);
    });

    it('should return false for date before period', () => {
      const { start, end } = getBillingPeriod(2025, 6);
      const date = new Date('2025-05-31');

      expect(isDateInBillingPeriod(date, start, end)).toBe(false);
    });

    it('should return false for date after period', () => {
      const { start, end } = getBillingPeriod(2025, 6);
      const date = new Date('2025-07-01');

      expect(isDateInBillingPeriod(date, start, end)).toBe(false);
    });
  });

  describe('getDaysInPeriod()', () => {
    it('should return correct days for June (30 days)', () => {
      const { start, end } = getBillingPeriod(2025, 6);

      expect(getDaysInPeriod(start, end)).toBe(30);
    });

    it('should return correct days for January (31 days)', () => {
      const { start, end } = getBillingPeriod(2025, 1);

      expect(getDaysInPeriod(start, end)).toBe(31);
    });

    it('should return correct days for February in leap year (29 days)', () => {
      const { start, end } = getBillingPeriod(2024, 2);

      expect(getDaysInPeriod(start, end)).toBe(29);
    });

    it('should return correct days for February in non-leap year (28 days)', () => {
      const { start, end } = getBillingPeriod(2025, 2);

      expect(getDaysInPeriod(start, end)).toBe(28);
    });

    it('should return 1 for same day', () => {
      const date = new Date('2025-06-15');

      expect(getDaysInPeriod(date, date)).toBe(1);
    });
  });

  describe('Integration: Tax Year and VAT Period', () => {
    it('should correctly identify VAT period within tax year', () => {
      const date = new Date('2025-05-15');

      const taxYear = getTaxYear(date);
      const vatPeriod = getVatPeriod(date);

      expect(taxYear).toBe(2025);
      expect(vatPeriod.period).toBe(3); // May-June
    });

    it('should handle January in previous tax year', () => {
      const date = new Date('2026-01-15');

      const taxYear = getTaxYear(date);
      const vatPeriod = getVatPeriod(date);

      expect(taxYear).toBe(2025); // January 2026 is in tax year 2025
      expect(vatPeriod.period).toBe(1); // Jan-Feb period
    });
  });

  describe('Edge Cases: Month Boundaries', () => {
    it('should handle transition from 31st to 1st correctly', () => {
      const janEnd = getBillingPeriod(2025, 1);
      const febStart = getBillingPeriod(2025, 2);

      // January ends on 31st
      expect(janEnd.end.getDate()).toBe(31);
      // February starts on 1st
      expect(febStart.start.getDate()).toBe(1);
      // There should be no gap
      const gap = febStart.start.getTime() - janEnd.end.getTime();
      expect(gap).toBe(1); // 1 millisecond between end of Jan and start of Feb
    });

    it('should handle transition from 28/29 Feb to March 1st', () => {
      // Leap year
      const feb2024 = getBillingPeriod(2024, 2);
      const mar2024 = getBillingPeriod(2024, 3);

      expect(feb2024.end.getDate()).toBe(29);
      expect(mar2024.start.getDate()).toBe(1);

      // Non-leap year
      const feb2025 = getBillingPeriod(2025, 2);
      const mar2025 = getBillingPeriod(2025, 3);

      expect(feb2025.end.getDate()).toBe(28);
      expect(mar2025.start.getDate()).toBe(1);
    });

    it('should handle year transition from December to January', () => {
      const dec2025 = getBillingPeriod(2025, 12);
      const jan2026 = getBillingPeriod(2026, 1);

      expect(dec2025.end.getFullYear()).toBe(2025);
      expect(dec2025.end.getMonth()).toBe(11);
      expect(dec2025.end.getDate()).toBe(31);

      expect(jan2026.start.getFullYear()).toBe(2026);
      expect(jan2026.start.getMonth()).toBe(0);
      expect(jan2026.start.getDate()).toBe(1);
    });
  });
});
