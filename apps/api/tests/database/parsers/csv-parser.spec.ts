/**
 * CSV Parser Unit Tests
 * TASK-TRANS-011
 */
import { CsvParser } from '../../../src/database/parsers/csv-parser';
import { ValidationException } from '../../../src/shared/exceptions';

describe('CsvParser', () => {
  let parser: CsvParser;

  beforeEach(() => {
    parser = new CsvParser();
  });

  describe('parse', () => {
    it('should parse comma-delimited CSV', () => {
      const csv = `Date,Description,Amount
15/01/2024,Payment from Smith,2500.00
16/01/2024,Electricity bill,-1500.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('Payment from Smith');
      expect(result[0].amountCents).toBe(250000);
      expect(result[0].isCredit).toBe(true);
      expect(result[1].amountCents).toBe(150000);
      expect(result[1].isCredit).toBe(false);
    });

    it('should parse semicolon-delimited CSV', () => {
      const csv = `Date;Description;Amount
15/01/2024;Payment from Smith;2500.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Payment from Smith');
    });

    it('should parse tab-delimited CSV', () => {
      const csv = `Date\tDescription\tAmount
15/01/2024\tPayment\t1000.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(1);
    });

    it('should handle SA currency format with spaces', () => {
      const csv = `Date,Description,Amount
15/01/2024,Payment,1 234 567.89`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].amountCents).toBe(123456789);
    });

    it('should handle debit/credit columns', () => {
      const csv = `Date,Description,Debit,Credit
15/01/2024,Income,,5000.00
16/01/2024,Expense,1000.00,`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(true);
      expect(result[0].amountCents).toBe(500000);
      expect(result[1].isCredit).toBe(false);
      expect(result[1].amountCents).toBe(100000);
    });

    it('should extract payee name from description', () => {
      const csv = `Date,Description,Amount
15/01/2024,POS PURCHASE WOOLWORTHS MENLYN,500.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].payeeName).toBe('WOOLWORTHS MENLYN');
    });

    it('should extract reference when available', () => {
      const csv = `Date,Description,Amount,Reference
15/01/2024,Payment,1000.00,REF123`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].reference).toBe('REF123');
    });

    it('should throw on empty file', () => {
      expect(() => parser.parse(Buffer.from(''))).toThrow(ValidationException);
    });

    it('should throw on no data rows', () => {
      const csv = `Date,Description,Amount`;

      expect(() => parser.parse(Buffer.from(csv))).toThrow(ValidationException);
    });

    it('should throw when too many parsing errors', () => {
      const csv = `Date,Description,Amount
invalid,invalid,invalid
bad,bad,bad
wrong,wrong,wrong`;

      expect(() => parser.parse(Buffer.from(csv))).toThrow(ValidationException);
    });

    it('should skip some bad rows but continue', () => {
      const csv = `Date,Description,Amount
15/01/2024,Good row,1000.00
invalid,bad,xxx`;

      // Only one bad row out of two = 50%, should succeed
      const result = parser.parse(Buffer.from(csv));
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle various date column names', () => {
      const csv = `Transaction Date,Description,Amount
15/01/2024,Payment,100.00`;

      const result = parser.parse(Buffer.from(csv));
      expect(result).toHaveLength(1);
    });

    it('should handle ISO date format', () => {
      const csv = `Date,Description,Amount
2024-01-15,Payment,100.00`;

      const result = parser.parse(Buffer.from(csv));
      expect(result[0].date.getUTCFullYear()).toBe(2024);
    });
  });
});
