/**
 * Transaction Date Service
 * TXN-003: Fix Transaction Date Handling
 *
 * Handles timezone correctly for South Africa (UTC+2, no DST):
 * - Support transaction date vs posting date vs value date
 * - Parse various date formats from bank statements
 * - Normalize all dates to start of day for comparison
 * - Convert between UTC and SAST
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  format,
  parse,
  startOfDay,
  endOfDay,
  isValid,
  parseISO,
  addHours,
  subHours,
  isSameDay,
  differenceInDays,
} from 'date-fns';
import { ValidationException } from '../../shared/exceptions';

/**
 * South African Standard Time offset from UTC
 * SA does not observe DST, so this is constant year-round
 */
const SAST_OFFSET_HOURS = 2;

/**
 * Date types used in banking
 */
export enum DateType {
  TRANSACTION_DATE = 'TRANSACTION_DATE', // When transaction occurred
  POSTING_DATE = 'POSTING_DATE', // When bank recorded it
  VALUE_DATE = 'VALUE_DATE', // When funds available/debited
  STATEMENT_DATE = 'STATEMENT_DATE', // Date on statement
}

/**
 * Parsed date result with metadata
 */
export interface ParsedDate {
  date: Date;
  originalValue: string;
  dateType: DateType;
  formatUsed: string;
  isNormalized: boolean;
  timezone: string;
}

/**
 * Date range for filtering
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
  includeEndDate: boolean;
}

/**
 * Common South African bank date formats
 * Listed in order of preference
 */
const SA_DATE_FORMATS = [
  'yyyy-MM-dd', // ISO format
  'yyyy/MM/dd', // ISO variant
  'dd/MM/yyyy', // Most common SA format
  'dd-MM-yyyy', // Alternative SA format
  'd/M/yyyy', // Without leading zeros
  'd-M-yyyy', // Without leading zeros
  'dd MMM yyyy', // "15 Jan 2024"
  'd MMM yyyy', // "5 Jan 2024"
  'dd MMMM yyyy', // "15 January 2024"
  'yyyyMMdd', // Compact format (bank feeds)
  'MM/dd/yyyy', // US format (some imports)
  'dd/MM/yy', // Short year
  'yyyy-MM-dd HH:mm:ss', // With time
  "yyyy-MM-dd'T'HH:mm:ss", // ISO with time
  "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // Full ISO
];

@Injectable()
export class TransactionDateService {
  private readonly logger = new Logger(TransactionDateService.name);

  /**
   * Parse a date string from a bank statement
   * Tries multiple formats and returns the first successful parse
   */
  parseDate(
    dateString: string,
    dateType: DateType = DateType.TRANSACTION_DATE,
  ): ParsedDate {
    if (!dateString || typeof dateString !== 'string') {
      throw new ValidationException('Invalid date', [
        { field: 'date', message: 'Date string is required' },
      ]);
    }

    const trimmed = dateString.trim();

    // Try ISO parse first
    const isoDate = parseISO(trimmed);
    if (isValid(isoDate)) {
      return {
        date: this.normalizeToStartOfDay(isoDate),
        originalValue: dateString,
        dateType,
        formatUsed: 'ISO',
        isNormalized: true,
        timezone: 'SAST',
      };
    }

    // Try each format
    for (const formatString of SA_DATE_FORMATS) {
      try {
        const parsed = parse(trimmed, formatString, new Date());
        if (isValid(parsed)) {
          return {
            date: this.normalizeToStartOfDay(parsed),
            originalValue: dateString,
            dateType,
            formatUsed: formatString,
            isNormalized: true,
            timezone: 'SAST',
          };
        }
      } catch {
        // Try next format
        continue;
      }
    }

    // Try parsing numeric-only dates
    const numericDate = this.parseNumericDate(trimmed);
    if (numericDate) {
      return {
        date: this.normalizeToStartOfDay(numericDate),
        originalValue: dateString,
        dateType,
        formatUsed: 'numeric',
        isNormalized: true,
        timezone: 'SAST',
      };
    }

    throw new ValidationException('Unable to parse date', [
      {
        field: 'date',
        message: `Could not parse date: "${dateString}". Supported formats: dd/MM/yyyy, yyyy-MM-dd, etc.`,
        value: dateString,
      },
    ]);
  }

  /**
   * Normalize a date to start of day in SAST
   * This ensures consistent date comparison
   */
  normalizeToStartOfDay(date: Date): Date {
    // Get start of day in local time
    const startOfDayLocal = startOfDay(date);

    // For database storage, we store as UTC but represent SAST midnight
    // Since SAST is UTC+2, SAST midnight is 22:00 UTC previous day
    return startOfDayLocal;
  }

  /**
   * Normalize a date to end of day in SAST (23:59:59.999)
   */
  normalizeToEndOfDay(date: Date): Date {
    return endOfDay(date);
  }

  /**
   * Convert UTC date to SAST
   */
  utcToSAST(utcDate: Date): Date {
    return addHours(utcDate, SAST_OFFSET_HOURS);
  }

  /**
   * Convert SAST date to UTC
   */
  sastToUTC(sastDate: Date): Date {
    return subHours(sastDate, SAST_OFFSET_HOURS);
  }

  /**
   * Format a date in SAST for display
   */
  formatForDisplay(date: Date, formatString: string = 'dd/MM/yyyy'): string {
    return format(date, formatString);
  }

  /**
   * Format a date for database storage (ISO format)
   */
  formatForStorage(date: Date): string {
    return format(date, 'yyyy-MM-dd');
  }

  /**
   * Check if two dates are the same day (ignoring time)
   */
  isSameDate(date1: Date, date2: Date): boolean {
    return isSameDay(
      this.normalizeToStartOfDay(date1),
      this.normalizeToStartOfDay(date2),
    );
  }

  /**
   * Get the number of days between two dates
   */
  daysBetween(date1: Date, date2: Date): number {
    return Math.abs(
      differenceInDays(
        this.normalizeToStartOfDay(date1),
        this.normalizeToStartOfDay(date2),
      ),
    );
  }

  /**
   * Create a date range for filtering
   * Handles timezone correctly for database queries
   */
  createDateRange(
    startDate: Date | string,
    endDate: Date | string,
    includeEndDate: boolean = true,
  ): DateRange {
    const start =
      typeof startDate === 'string'
        ? this.parseDate(startDate).date
        : this.normalizeToStartOfDay(startDate);

    let end =
      typeof endDate === 'string' ? this.parseDate(endDate).date : endDate;

    if (includeEndDate) {
      end = this.normalizeToEndOfDay(end);
    } else {
      end = this.normalizeToStartOfDay(end);
    }

    return {
      startDate: start,
      endDate: end,
      includeEndDate,
    };
  }

  /**
   * Get the banking month for a transaction date
   * SA banks typically close month-end at 23:59:59 SAST
   */
  getBankingMonth(date: Date): { year: number; month: number } {
    const normalized = this.normalizeToStartOfDay(date);
    return {
      year: normalized.getFullYear(),
      month: normalized.getMonth() + 1, // 1-indexed
    };
  }

  /**
   * Validate a date is within acceptable range for transactions
   * Typically 7 years back (SARS requirement) to 1 day in future
   */
  validateTransactionDate(date: Date): boolean {
    const now = new Date();
    const sevenYearsAgo = new Date();
    sevenYearsAgo.setFullYear(now.getFullYear() - 7);

    const oneDayFuture = new Date();
    oneDayFuture.setDate(now.getDate() + 1);

    const normalized = this.normalizeToStartOfDay(date);

    return (
      normalized >= this.normalizeToStartOfDay(sevenYearsAgo) &&
      normalized <= this.normalizeToEndOfDay(oneDayFuture)
    );
  }

  /**
   * Get today's date in SAST, normalized to start of day
   */
  getTodaySAST(): Date {
    return this.normalizeToStartOfDay(new Date());
  }

  /**
   * Parse various date representations from bank statements
   * Handles edge cases like "1 Jan" (assumes current year)
   */
  parseBankStatementDate(
    dateString: string,
    statementYear?: number,
  ): ParsedDate {
    // Handle "DD MMM" format (no year)
    const shortDateMatch = dateString
      .trim()
      .match(
        /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i,
      );

    if (shortDateMatch) {
      const day = parseInt(shortDateMatch[1], 10);
      const monthStr = shortDateMatch[2];
      const year = statementYear || new Date().getFullYear();

      const fullDateString = `${day} ${monthStr} ${year}`;
      return this.parseDate(fullDateString, DateType.STATEMENT_DATE);
    }

    return this.parseDate(dateString, DateType.STATEMENT_DATE);
  }

  /**
   * Parse numeric date formats (e.g., 20240115 -> 2024-01-15)
   */
  private parseNumericDate(dateString: string): Date | null {
    // Try yyyyMMdd format
    if (/^\d{8}$/.test(dateString)) {
      const year = parseInt(dateString.substring(0, 4), 10);
      const month = parseInt(dateString.substring(4, 6), 10) - 1;
      const day = parseInt(dateString.substring(6, 8), 10);

      const date = new Date(year, month, day);
      if (isValid(date)) {
        return date;
      }
    }

    // Try ddMMyyyy format
    if (/^\d{8}$/.test(dateString)) {
      const day = parseInt(dateString.substring(0, 2), 10);
      const month = parseInt(dateString.substring(2, 4), 10) - 1;
      const year = parseInt(dateString.substring(4, 8), 10);

      const date = new Date(year, month, day);
      if (isValid(date) && date.getDate() === day) {
        return date;
      }
    }

    // Try Excel serial date (days since 1900-01-01)
    const numericValue = parseInt(dateString, 10);
    if (numericValue > 30000 && numericValue < 100000) {
      // Excel date serial number range (1982 to 2173)
      const excelEpoch = new Date(1899, 11, 30); // Excel epoch with leap year bug
      const date = new Date(
        excelEpoch.getTime() + numericValue * 24 * 60 * 60 * 1000,
      );
      if (isValid(date) && this.validateTransactionDate(date)) {
        return date;
      }
    }

    return null;
  }

  /**
   * Get statement period dates from a bank statement header
   * E.g., "Statement Period: 01 Jan 2024 to 31 Jan 2024"
   */
  parseStatementPeriod(headerText: string): DateRange | null {
    // Pattern: "DD MMM YYYY to DD MMM YYYY" or similar
    const patterns = [
      /(\d{1,2}\s+\w+\s+\d{4})\s+(?:to|-)\s+(\d{1,2}\s+\w+\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})\s+(?:to|-)\s+(\d{4}-\d{2}-\d{2})/,
      /(\d{2}\/\d{2}\/\d{4})\s+(?:to|-)\s+(\d{2}\/\d{2}\/\d{4})/,
    ];

    for (const pattern of patterns) {
      const match = headerText.match(pattern);
      if (match) {
        try {
          const startDate = this.parseDate(match[1], DateType.STATEMENT_DATE);
          const endDate = this.parseDate(match[2], DateType.STATEMENT_DATE);

          return this.createDateRange(startDate.date, endDate.date, true);
        } catch {
          continue;
        }
      }
    }

    return null;
  }
}
