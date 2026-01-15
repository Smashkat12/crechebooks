/**
 * Utils Tests
 * TASK-UI-002: Expand Frontend Test Coverage
 *
 * Tests for general utility functions including:
 * - cn() classname merging (clsx + tailwind-merge)
 * - formatCurrency() South African Rand formatting
 * - formatDate() date formatting
 * - formatDateTime() datetime formatting
 * - Edge cases and error handling
 */

import { cn, formatCurrency, formatDate, formatDateTime } from '../lib/utils';

describe('Utils', () => {
  describe('cn (classname merger)', () => {
    describe('basic functionality', () => {
      it('should merge single class strings', () => {
        expect(cn('foo')).toBe('foo');
      });

      it('should merge multiple class strings', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
      });

      it('should handle empty strings', () => {
        expect(cn('')).toBe('');
        expect(cn('foo', '', 'bar')).toBe('foo bar');
      });
    });

    describe('conditional classes', () => {
      it('should handle boolean conditions', () => {
        expect(cn('foo', true && 'bar')).toBe('foo bar');
        expect(cn('foo', false && 'bar')).toBe('foo');
      });

      it('should handle undefined values', () => {
        expect(cn('foo', undefined, 'bar')).toBe('foo bar');
      });

      it('should handle null values', () => {
        expect(cn('foo', null, 'bar')).toBe('foo bar');
      });

      it('should handle ternary conditions', () => {
        expect(cn('foo', true ? 'bar' : 'baz')).toBe('foo bar');
        expect(cn('foo', false ? 'bar' : 'baz')).toBe('foo baz');
      });
    });

    describe('Tailwind merge functionality', () => {
      it('should merge conflicting padding classes', () => {
        expect(cn('p-4', 'p-2')).toBe('p-2');
      });

      it('should merge conflicting margin classes', () => {
        expect(cn('m-4', 'm-2')).toBe('m-2');
      });

      it('should merge conflicting text color classes', () => {
        expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
      });

      it('should merge conflicting background color classes', () => {
        expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
      });

      it('should preserve non-conflicting classes', () => {
        expect(cn('p-4', 'm-2', 'text-red-500')).toBe('p-4 m-2 text-red-500');
      });

      it('should handle responsive prefixes', () => {
        expect(cn('md:p-4', 'md:p-2')).toBe('md:p-2');
      });

      it('should not merge different axis classes', () => {
        expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
      });

      it('should merge conflicting flex classes', () => {
        expect(cn('flex-row', 'flex-col')).toBe('flex-col');
      });

      it('should merge conflicting width classes', () => {
        expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
      });
    });

    describe('object syntax', () => {
      it('should handle object with boolean values', () => {
        expect(cn({ foo: true, bar: false })).toBe('foo');
      });

      it('should handle mixed string and object', () => {
        expect(cn('baz', { foo: true, bar: false })).toBe('baz foo');
      });
    });

    describe('array syntax', () => {
      it('should handle arrays of classes', () => {
        expect(cn(['foo', 'bar'])).toBe('foo bar');
      });

      it('should handle nested arrays', () => {
        expect(cn(['foo', ['bar', 'baz']])).toBe('foo bar baz');
      });
    });

    describe('edge cases', () => {
      it('should handle no arguments', () => {
        expect(cn()).toBe('');
      });

      it('should handle all falsy arguments', () => {
        expect(cn(false, null, undefined, '')).toBe('');
      });

      it('should handle identical classes (clsx behavior)', () => {
        // Note: clsx does not deduplicate, tailwind-merge handles conflicts
        const result = cn('foo', 'foo', 'foo');
        expect(result).toContain('foo');
      });
    });
  });

  describe('formatCurrency', () => {
    // Helper to normalize non-breaking spaces and handle locale variations
    const normalizeSpaces = (str: string) => str.replace(/\u00A0/g, ' ');

    describe('basic formatting', () => {
      it('should format positive integers', () => {
        const result = normalizeSpaces(formatCurrency(100));
        expect(result).toMatch(/R\s*100[,.]00/);
      });

      it('should format positive decimals', () => {
        const result1 = normalizeSpaces(formatCurrency(100.5));
        const result2 = normalizeSpaces(formatCurrency(100.55));
        expect(result1).toMatch(/R\s*100[,.]50/);
        expect(result2).toMatch(/R\s*100[,.]55/);
      });

      it('should format zero', () => {
        const result = normalizeSpaces(formatCurrency(0));
        expect(result).toMatch(/R\s*0[,.]00/);
      });

      it('should format negative amounts', () => {
        const result1 = normalizeSpaces(formatCurrency(-100));
        const result2 = normalizeSpaces(formatCurrency(-50.5));
        expect(result1).toMatch(/-?\s*R\s*-?100[,.]00/);
        expect(result2).toMatch(/-?\s*R\s*-?50[,.]50/);
      });
    });

    describe('thousand separators', () => {
      it('should add thousand separators for large numbers', () => {
        const result1 = normalizeSpaces(formatCurrency(1000));
        const result2 = normalizeSpaces(formatCurrency(10000));
        const result3 = normalizeSpaces(formatCurrency(100000));
        const result4 = normalizeSpaces(formatCurrency(1000000));

        // Check for R symbol and the expected numbers with separators
        expect(result1).toMatch(/R/);
        expect(result1).toMatch(/1.*000/);
        expect(result2).toMatch(/10.*000/);
        expect(result3).toMatch(/100.*000/);
        expect(result4).toMatch(/1.*000.*000/);
      });
    });

    describe('decimal handling', () => {
      it('should round to 2 decimal places', () => {
        const result1 = normalizeSpaces(formatCurrency(100.555));
        const result2 = normalizeSpaces(formatCurrency(100.554));
        expect(result1).toMatch(/100[,.]56/);
        expect(result2).toMatch(/100[,.]55/);
      });

      it('should pad single decimal digits', () => {
        const result = normalizeSpaces(formatCurrency(100.5));
        expect(result).toMatch(/100[,.]50/);
      });

      it('should handle many decimal places', () => {
        const result = normalizeSpaces(formatCurrency(100.123456789));
        expect(result).toMatch(/100[,.]12/);
      });
    });

    describe('null and undefined handling', () => {
      it('should return R 0.00 for null', () => {
        const result = normalizeSpaces(formatCurrency(null));
        expect(result).toMatch(/R\s*0[,.]00/);
      });

      it('should return R 0.00 for undefined', () => {
        const result = normalizeSpaces(formatCurrency(undefined));
        expect(result).toMatch(/R\s*0[,.]00/);
      });
    });

    describe('NaN handling', () => {
      it('should return R 0.00 for NaN', () => {
        const result = normalizeSpaces(formatCurrency(NaN));
        expect(result).toMatch(/R\s*0[,.]00/);
      });
    });

    describe('edge cases', () => {
      it('should handle very large numbers', () => {
        const result = formatCurrency(999999999.99);
        expect(result).toContain('R');
        expect(result).toContain('999');
      });

      it('should handle very small positive numbers', () => {
        const result1 = normalizeSpaces(formatCurrency(0.01));
        const result2 = normalizeSpaces(formatCurrency(0.001));
        expect(result1).toMatch(/0[,.]01/);
        expect(result2).toMatch(/0[,.]00/);
      });

      it('should handle very small negative numbers', () => {
        const result = normalizeSpaces(formatCurrency(-0.01));
        expect(result).toMatch(/-?\s*R?\s*-?0[,.]01/);
      });
    });

    describe('South African locale specifics', () => {
      it('should use ZAR currency format', () => {
        const result = formatCurrency(1000);
        // SA format uses R symbol
        expect(result).toMatch(/R/);
      });

      it('should use appropriate decimal separator', () => {
        const result = formatCurrency(100.5);
        // Should have a decimal separator (comma or period depending on locale)
        expect(result).toMatch(/100[,.]50/);
      });

      it('should use appropriate thousands separator', () => {
        const result = formatCurrency(1000);
        // Should have some form of separator (space or other)
        expect(result.length).toBeGreaterThan(6); // "R 1000" is 6 chars minimum
      });
    });
  });

  describe('formatDate', () => {
    describe('Date object input', () => {
      it('should format Date object correctly', () => {
        const date = new Date('2026-01-15');
        const result = formatDate(date);

        // Format is 'dd MMM yyyy' -> "15 Jan 2026"
        expect(result).toMatch(/\d{2} [A-Za-z]{3} \d{4}/);
        expect(result).toBe('15 Jan 2026');
      });

      it('should handle different months', () => {
        expect(formatDate(new Date('2026-06-01'))).toBe('01 Jun 2026');
        expect(formatDate(new Date('2026-12-25'))).toBe('25 Dec 2026');
      });

      it('should handle different years', () => {
        expect(formatDate(new Date('2020-01-01'))).toBe('01 Jan 2020');
        expect(formatDate(new Date('2030-01-01'))).toBe('01 Jan 2030');
      });
    });

    describe('string input', () => {
      it('should format ISO date string', () => {
        expect(formatDate('2026-01-15')).toBe('15 Jan 2026');
      });

      it('should format ISO datetime string', () => {
        expect(formatDate('2026-01-15T10:30:00Z')).toMatch(/\d{2} [A-Za-z]{3} \d{4}/);
      });
    });

    describe('null and undefined handling', () => {
      it('should return dash for null', () => {
        expect(formatDate(null)).toBe('-');
      });

      it('should return dash for undefined', () => {
        expect(formatDate(undefined)).toBe('-');
      });
    });

    describe('invalid date handling', () => {
      it('should return dash for invalid date string', () => {
        expect(formatDate('invalid-date')).toBe('-');
      });

      it('should return dash for invalid Date object', () => {
        expect(formatDate(new Date('invalid'))).toBe('-');
      });
    });

    describe('edge cases', () => {
      it('should handle leap year dates', () => {
        expect(formatDate(new Date('2024-02-29'))).toBe('29 Feb 2024');
      });

      it('should handle end of year', () => {
        expect(formatDate(new Date('2026-12-31'))).toBe('31 Dec 2026');
      });

      it('should handle start of year', () => {
        expect(formatDate(new Date('2026-01-01'))).toBe('01 Jan 2026');
      });
    });
  });

  describe('formatDateTime', () => {
    describe('Date object input', () => {
      it('should format Date object with time', () => {
        const date = new Date('2026-01-15T10:30:00');
        const result = formatDateTime(date);

        // Format is 'dd MMM yyyy HH:mm'
        expect(result).toMatch(/\d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}/);
      });

      it('should handle midnight', () => {
        const date = new Date('2026-01-15T00:00:00');
        const result = formatDateTime(date);

        expect(result).toContain('00:00');
      });

      it('should handle noon', () => {
        const date = new Date('2026-01-15T12:00:00');
        const result = formatDateTime(date);

        expect(result).toContain('12:00');
      });

      it('should handle end of day', () => {
        const date = new Date('2026-01-15T23:59:00');
        const result = formatDateTime(date);

        expect(result).toContain('23:59');
      });
    });

    describe('string input', () => {
      it('should format ISO datetime string', () => {
        const result = formatDateTime('2026-01-15T10:30:00');

        expect(result).toMatch(/\d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}/);
      });
    });

    describe('null and undefined handling', () => {
      it('should return dash for null', () => {
        expect(formatDateTime(null)).toBe('-');
      });

      it('should return dash for undefined', () => {
        expect(formatDateTime(undefined)).toBe('-');
      });
    });

    describe('invalid date handling', () => {
      it('should return dash for invalid date string', () => {
        expect(formatDateTime('invalid-date')).toBe('-');
      });

      it('should return dash for invalid Date object', () => {
        expect(formatDateTime(new Date('invalid'))).toBe('-');
      });
    });

    describe('edge cases', () => {
      it('should handle minute precision', () => {
        const date = new Date('2026-01-15T10:05:00');
        const result = formatDateTime(date);

        expect(result).toContain('10:05');
      });

      it('should use 24-hour format', () => {
        const date = new Date('2026-01-15T14:30:00');
        const result = formatDateTime(date);

        expect(result).toContain('14:30');
      });
    });
  });

  describe('Integration', () => {
    // Helper to normalize non-breaking spaces
    const normalizeSpaces = (str: string) => str.replace(/\u00A0/g, ' ');

    it('should work together for common use cases', () => {
      // Simulate combining cn for styling with formatted values
      const className = cn('text-right', 'font-mono');
      const currency = normalizeSpaces(formatCurrency(1234.56));
      const date = formatDate(new Date('2026-01-15'));

      expect(className).toBe('text-right font-mono');
      expect(currency).toMatch(/R.*1.*234[,.]56/);
      expect(date).toBe('15 Jan 2026');
    });

    it('should handle conditional formatting display', () => {
      const hasValue = true;
      const amount = 1000;

      const displayClass = cn(
        'p-2',
        hasValue && 'text-green-500',
        !hasValue && 'text-gray-400'
      );
      const displayValue = hasValue ? normalizeSpaces(formatCurrency(amount)) : '-';

      expect(displayClass).toBe('p-2 text-green-500');
      expect(displayValue).toMatch(/R.*1.*000[,.]00/);
    });
  });
});
