/**
 * Transaction Date Service Tests
 * TXN-003: Fix Transaction Date Handling
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  TransactionDateService,
  DateType,
} from '../../../src/database/services/transaction-date.service';
import { ValidationException } from '../../../src/shared/exceptions';

describe('TransactionDateService', () => {
  let service: TransactionDateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionDateService],
    }).compile();

    service = module.get<TransactionDateService>(TransactionDateService);
  });

  describe('parseDate', () => {
    it('should parse ISO format yyyy-MM-dd', () => {
      const result = service.parseDate('2024-01-15');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getMonth()).toBe(0); // January
      expect(result.date.getDate()).toBe(15);
      expect(result.isNormalized).toBe(true);
    });

    it('should parse SA format dd/MM/yyyy', () => {
      const result = service.parseDate('15/01/2024');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getMonth()).toBe(0);
      expect(result.date.getDate()).toBe(15);
    });

    it('should parse SA format dd-MM-yyyy', () => {
      const result = service.parseDate('15-01-2024');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getDate()).toBe(15);
    });

    it('should parse format without leading zeros d/M/yyyy', () => {
      const result = service.parseDate('5/1/2024');

      expect(result.date.getMonth()).toBe(0);
      expect(result.date.getDate()).toBe(5);
    });

    it('should parse text month format dd MMM yyyy', () => {
      const result = service.parseDate('15 Jan 2024');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getMonth()).toBe(0);
    });

    it('should parse full month name dd MMMM yyyy', () => {
      const result = service.parseDate('15 January 2024');

      expect(result.date.getMonth()).toBe(0);
    });

    it('should parse compact format yyyyMMdd', () => {
      const result = service.parseDate('20240115');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getMonth()).toBe(0);
      expect(result.date.getDate()).toBe(15);
    });

    it('should parse ISO format with time', () => {
      const result = service.parseDate('2024-01-15T10:30:00');

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getDate()).toBe(15);
      // Time should be normalized to start of day
      expect(result.date.getHours()).toBe(0);
    });

    it('should handle short year format dd/MM/yy', () => {
      const result = service.parseDate('15/01/24');

      expect(result.date.getFullYear()).toBe(2024);
    });

    it('should preserve original value', () => {
      const result = service.parseDate('15/01/2024');

      expect(result.originalValue).toBe('15/01/2024');
    });

    it('should set date type', () => {
      const result = service.parseDate('2024-01-15', DateType.POSTING_DATE);

      expect(result.dateType).toBe(DateType.POSTING_DATE);
    });

    it('should throw for invalid date strings', () => {
      expect(() => service.parseDate('invalid')).toThrow(ValidationException);
      expect(() => service.parseDate('')).toThrow(ValidationException);
      expect(() => service.parseDate('32/13/2024')).toThrow(
        ValidationException,
      );
    });

    it('should throw for null/undefined', () => {
      expect(() => service.parseDate(null as any)).toThrow(ValidationException);
      expect(() => service.parseDate(undefined as any)).toThrow(
        ValidationException,
      );
    });
  });

  describe('normalizeToStartOfDay', () => {
    it('should set time to midnight', () => {
      const date = new Date('2024-01-15T14:30:45');
      const normalized = service.normalizeToStartOfDay(date);

      expect(normalized.getHours()).toBe(0);
      expect(normalized.getMinutes()).toBe(0);
      expect(normalized.getSeconds()).toBe(0);
      expect(normalized.getMilliseconds()).toBe(0);
    });

    it('should preserve date', () => {
      const date = new Date('2024-01-15T23:59:59');
      const normalized = service.normalizeToStartOfDay(date);

      expect(normalized.getFullYear()).toBe(2024);
      expect(normalized.getMonth()).toBe(0);
      expect(normalized.getDate()).toBe(15);
    });
  });

  describe('normalizeToEndOfDay', () => {
    it('should set time to end of day', () => {
      const date = new Date('2024-01-15T14:30:45');
      const normalized = service.normalizeToEndOfDay(date);

      expect(normalized.getHours()).toBe(23);
      expect(normalized.getMinutes()).toBe(59);
      expect(normalized.getSeconds()).toBe(59);
    });
  });

  describe('utcToSAST and sastToUTC', () => {
    it('should add 2 hours for UTC to SAST', () => {
      const utc = new Date('2024-01-15T10:00:00Z');
      const sast = service.utcToSAST(utc);

      expect(sast.getUTCHours()).toBe(12); // UTC 10:00 + 2 = SAST 12:00
    });

    it('should subtract 2 hours for SAST to UTC', () => {
      const sast = new Date('2024-01-15T12:00:00');
      const utc = service.sastToUTC(sast);

      // SAST 12:00 - 2 = UTC 10:00
      expect(utc.getTime()).toBe(sast.getTime() - 2 * 60 * 60 * 1000);
    });

    it('should be reversible', () => {
      const original = new Date('2024-01-15T10:00:00Z');
      const converted = service.sastToUTC(service.utcToSAST(original));

      expect(converted.getTime()).toBe(original.getTime());
    });
  });

  describe('formatForDisplay', () => {
    it('should format with default format', () => {
      const date = new Date(2024, 0, 15);
      const formatted = service.formatForDisplay(date);

      expect(formatted).toBe('15/01/2024');
    });

    it('should format with custom format', () => {
      const date = new Date(2024, 0, 15);
      const formatted = service.formatForDisplay(date, 'yyyy-MM-dd');

      expect(formatted).toBe('2024-01-15');
    });
  });

  describe('formatForStorage', () => {
    it('should format as ISO date', () => {
      const date = new Date(2024, 0, 15);
      const formatted = service.formatForStorage(date);

      expect(formatted).toBe('2024-01-15');
    });
  });

  describe('isSameDate', () => {
    it('should return true for same dates', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T20:00:00');

      expect(service.isSameDate(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-16T10:00:00');

      expect(service.isSameDate(date1, date2)).toBe(false);
    });
  });

  describe('daysBetween', () => {
    it('should return 0 for same day', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T20:00:00');

      expect(service.daysBetween(date1, date2)).toBe(0);
    });

    it('should return positive difference', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');

      expect(service.daysBetween(date1, date2)).toBe(5);
    });

    it('should handle dates in either order', () => {
      const date1 = new Date('2024-01-20');
      const date2 = new Date('2024-01-15');

      expect(service.daysBetween(date1, date2)).toBe(5);
    });
  });

  describe('createDateRange', () => {
    it('should create range with start and end', () => {
      const range = service.createDateRange('2024-01-01', '2024-01-31');

      expect(range.startDate.getDate()).toBe(1);
      expect(range.endDate.getDate()).toBe(31);
      expect(range.includeEndDate).toBe(true);
    });

    it('should handle Date objects', () => {
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 0, 31);
      const range = service.createDateRange(start, end);

      expect(range.startDate.getDate()).toBe(1);
      expect(range.endDate.getDate()).toBe(31);
    });

    it('should normalize start to start of day', () => {
      const range = service.createDateRange(
        new Date('2024-01-01T14:30:00'),
        new Date('2024-01-31T14:30:00'),
      );

      expect(range.startDate.getHours()).toBe(0);
    });

    it('should normalize end to end of day when included', () => {
      const range = service.createDateRange('2024-01-01', '2024-01-31', true);

      expect(range.endDate.getHours()).toBe(23);
      expect(range.endDate.getMinutes()).toBe(59);
    });
  });

  describe('getBankingMonth', () => {
    it('should return year and month', () => {
      const date = new Date('2024-03-15');
      const result = service.getBankingMonth(date);

      expect(result.year).toBe(2024);
      expect(result.month).toBe(3); // March (1-indexed)
    });

    it('should handle end of month', () => {
      const date = new Date('2024-01-31T23:59:59');
      const result = service.getBankingMonth(date);

      expect(result.month).toBe(1); // January
    });
  });

  describe('validateTransactionDate', () => {
    it('should accept recent dates', () => {
      const today = new Date();
      expect(service.validateTransactionDate(today)).toBe(true);
    });

    it('should accept dates within 7 years', () => {
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

      expect(service.validateTransactionDate(fiveYearsAgo)).toBe(true);
    });

    it('should accept tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(service.validateTransactionDate(tomorrow)).toBe(true);
    });

    it('should reject dates more than 7 years ago', () => {
      const eightYearsAgo = new Date();
      eightYearsAgo.setFullYear(eightYearsAgo.getFullYear() - 8);

      expect(service.validateTransactionDate(eightYearsAgo)).toBe(false);
    });

    it('should reject dates far in future', () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      expect(service.validateTransactionDate(nextYear)).toBe(false);
    });
  });

  describe('getTodaySAST', () => {
    it('should return start of today', () => {
      const today = service.getTodaySAST();

      expect(today.getHours()).toBe(0);
      expect(today.getMinutes()).toBe(0);
      expect(today.getSeconds()).toBe(0);
    });
  });

  describe('parseBankStatementDate', () => {
    it('should parse short date with statement year', () => {
      const result = service.parseBankStatementDate('15 Jan', 2024);

      expect(result.date.getFullYear()).toBe(2024);
      expect(result.date.getMonth()).toBe(0);
      expect(result.date.getDate()).toBe(15);
      expect(result.dateType).toBe(DateType.STATEMENT_DATE);
    });

    it('should use current year if not specified', () => {
      const result = service.parseBankStatementDate('15 Jan');

      expect(result.date.getFullYear()).toBe(new Date().getFullYear());
    });

    it('should parse full dates', () => {
      const result = service.parseBankStatementDate('15/01/2024');

      expect(result.date.getFullYear()).toBe(2024);
    });
  });

  describe('parseStatementPeriod', () => {
    it('should parse "DD MMM YYYY to DD MMM YYYY" format', () => {
      const range = service.parseStatementPeriod(
        'Statement Period: 01 Jan 2024 to 31 Jan 2024',
      );

      expect(range).not.toBeNull();
      expect(range!.startDate.getDate()).toBe(1);
      expect(range!.endDate.getDate()).toBe(31);
    });

    it('should parse ISO format with dash separator', () => {
      const range = service.parseStatementPeriod(
        'Period: 2024-01-01 - 2024-01-31',
      );

      expect(range).not.toBeNull();
    });

    it('should return null for invalid format', () => {
      const range = service.parseStatementPeriod('Invalid period text');

      expect(range).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle leap year dates', () => {
      const result = service.parseDate('29/02/2024'); // 2024 is leap year

      expect(result.date.getMonth()).toBe(1);
      expect(result.date.getDate()).toBe(29);
    });

    it('should handle year boundaries', () => {
      const dec31 = service.parseDate('31/12/2024');
      const jan1 = service.parseDate('01/01/2025');

      expect(service.daysBetween(dec31.date, jan1.date)).toBe(1);
    });

    it('should handle single digit dates in text', () => {
      const result = service.parseDate('1 Jan 2024');

      expect(result.date.getDate()).toBe(1);
    });
  });
});
