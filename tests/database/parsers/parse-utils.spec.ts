/**
 * Parse Utils Unit Tests
 * TASK-TRANS-011
 */
import {
  parseCurrency,
  parseDate,
  extractPayeeName,
} from '../../../src/database/parsers/parse-utils';
import { ValidationException } from '../../../src/shared/exceptions';

describe('Parse Utils', () => {
  describe('parseCurrency', () => {
    it('should parse standard format: 1234.56', () => {
      expect(parseCurrency('1234.56')).toBe(123456);
    });

    it('should parse with thousand separator: 1,234.56', () => {
      expect(parseCurrency('1,234.56')).toBe(123456);
    });

    it('should parse SA format with spaces: 1 234.56', () => {
      expect(parseCurrency('1 234.56')).toBe(123456);
    });

    it('should parse negative: -500.00', () => {
      expect(parseCurrency('-500.00')).toBe(-50000);
    });

    it('should parse with R symbol: R1000.00', () => {
      expect(parseCurrency('R1000.00')).toBe(100000);
    });

    it('should parse European format: 1234,56', () => {
      expect(parseCurrency('1234,56')).toBe(123456);
    });

    it('should parse whole number', () => {
      expect(parseCurrency('1000')).toBe(100000);
    });

    it('should throw on invalid value', () => {
      expect(() => parseCurrency('abc')).toThrow(ValidationException);
    });

    it('should throw on empty string', () => {
      expect(() => parseCurrency('')).toThrow(ValidationException);
    });

    it('should throw on null', () => {
      expect(() => parseCurrency(null as unknown as string)).toThrow(
        ValidationException,
      );
    });
  });

  describe('parseDate', () => {
    it('should parse DD/MM/YYYY', () => {
      const date = parseDate('15/01/2024');
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(15);
    });

    it('should parse YYYY-MM-DD', () => {
      const date = parseDate('2024-01-15');
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0);
      expect(date.getUTCDate()).toBe(15);
    });

    it('should parse DD-MM-YYYY', () => {
      const date = parseDate('15-01-2024');
      expect(date.getUTCFullYear()).toBe(2024);
    });

    it('should handle single digit day and month', () => {
      const date = parseDate('1/2/2024');
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(1); // February
      expect(date.getUTCDate()).toBe(1);
    });

    it('should throw on invalid format', () => {
      expect(() => parseDate('01/2024')).toThrow(ValidationException);
    });

    it('should throw on empty string', () => {
      expect(() => parseDate('')).toThrow(ValidationException);
    });

    it('should throw on invalid month', () => {
      expect(() => parseDate('15/13/2024')).toThrow(ValidationException);
    });
  });

  describe('extractPayeeName', () => {
    it('should extract from POS description', () => {
      const result = extractPayeeName('POS PURCHASE WOOLWORTHS SANDTON');
      expect(result).toBe('WOOLWORTHS SANDTON');
    });

    it('should extract from EFT description', () => {
      const result = extractPayeeName('EFT PAYMENT SMITH J');
      expect(result).toBe('SMITH J');
    });

    it('should extract from DEBIT ORDER description', () => {
      const result = extractPayeeName('DEBIT ORDER INSURANCE CO');
      expect(result).toBe('INSURANCE CO');
    });

    it('should return null for empty', () => {
      expect(extractPayeeName('')).toBeNull();
    });

    it('should return null for whitespace only', () => {
      expect(extractPayeeName('   ')).toBeNull();
    });

    it('should limit to 50 chars', () => {
      const long = 'AAAAA '.repeat(20);
      const result = extractPayeeName(long);
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(50);
    });

    it('should return null for null input', () => {
      expect(extractPayeeName(null as unknown as string)).toBeNull();
    });
  });
});
