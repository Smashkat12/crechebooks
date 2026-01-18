/**
 * CSV Parser Unit Tests
 * TASK-TRANS-011
 * TASK-RECON-039 - Fee detection and sign correction tests
 */
import {
  CsvParser,
  isFeeTransaction,
} from '../../../src/database/parsers/csv-parser';
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

  /**
   * TASK-RECON-039: Fee Detection Tests
   */
  describe('isFeeTransaction', () => {
    it.each([
      ['Cash Deposit Fee', true],
      ['Bank Charges', true],
      ['Monthly Service Fee', true],
      ['ATM Fee', true],
      ['Debit Order Fee', true],
      ['Transaction Fee', true],
      ['BANK CHARGE', true],
      ['Service Charge', true],
      ['Card Fee - Annual', true],
      ['Account Maintenance Fee', true],
      ['Withdrawal Fee', true],
      ['Cash Handling Fee', true],
      ['Interest Charge', true],
      ['Penalty - Late Payment', true],
      ['Payment Received', false],
      ['Salary Deposit', false],
      ['Transfer from Savings', false],
      ['Purchase - Woolworths', false],
      ['Direct Debit - Insurance', false],
      ['CASH DEPOSIT', false],
      ['EFT PAYMENT', false],
    ])('should detect "%s" as fee: %s', (description, expected) => {
      expect(isFeeTransaction(description)).toBe(expected);
    });
  });

  /**
   * TASK-RECON-039: Fee Sign Correction Tests
   */
  describe('Fee Sign Correction', () => {
    it('should correct fee marked as credit to debit', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,Cash Deposit Fee,Credit,52.64`;

      const result = parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(1);
      expect(result[0].isCredit).toBe(false); // Should be corrected to debit
      expect(result[0].amountCents).toBe(5264);
      expect(result[0].description).toBe('Cash Deposit Fee');
    });

    it('should keep fee as debit when correctly marked', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,Monthly Bank Charges,Debit,25.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(false);
      expect(result[0].amountCents).toBe(2500);
    });

    it('should not affect non-fee credits', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,Salary Deposit,Credit,15000.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(true); // Should remain credit
      expect(result[0].amountCents).toBe(1500000);
    });

    it('should correct multiple fee transactions in same import', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,Cash Deposit,Credit,1000.00
17/10/2025,Cash Deposit Fee,Credit,6.36
18/10/2025,Bank Charges,Credit,25.00
19/10/2025,Salary,Credit,15000.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(4);

      // Cash Deposit - should be credit
      expect(result[0].isCredit).toBe(true);
      expect(result[0].amountCents).toBe(100000);

      // Cash Deposit Fee - CORRECTED to debit
      expect(result[1].isCredit).toBe(false);
      expect(result[1].amountCents).toBe(636);

      // Bank Charges - CORRECTED to debit
      expect(result[2].isCredit).toBe(false);
      expect(result[2].amountCents).toBe(2500);

      // Salary - should be credit
      expect(result[3].isCredit).toBe(true);
      expect(result[3].amountCents).toBe(1500000);
    });

    it('should handle fee in separate debit/credit columns marked as credit', () => {
      const csv = `Date,Description,Debit,Credit
17/10/2025,ATM Fee,,10.00`;

      const result = parser.parse(Buffer.from(csv));

      // Fee in credit column should be corrected to debit
      expect(result[0].isCredit).toBe(false);
      expect(result[0].amountCents).toBe(1000);
    });

    it('should handle mixed case fee descriptions', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,BANK CHARGE,Credit,15.00
17/10/2025,Service FEE,Credit,5.00
17/10/2025,transaction fee,Credit,2.50`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(false);
      expect(result[1].isCredit).toBe(false);
      expect(result[2].isCredit).toBe(false);
    });

    it('should not affect fee correctly marked as debit with negative amount', () => {
      const csv = `Date,Description,Amount
17/10/2025,Bank Charges,-25.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(false);
      expect(result[0].amountCents).toBe(2500);
    });

    it('should correct fee with positive amount when no type column', () => {
      // When no Type column and amount is positive, parser treats as credit
      // Fee should still be corrected to debit
      const csv = `Date,Description,Amount
17/10/2025,Service Fee,10.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(false); // Corrected from positive amount
      expect(result[0].amountCents).toBe(1000);
    });

    it('should handle compound fee descriptions', () => {
      const csv = `Date,Description,Type,Amount
17/10/2025,Monthly Account Maintenance Fee,Credit,50.00
17/10/2025,Debit Order Return - Fee,Credit,35.00
17/10/2025,Card Replacement Fee,Credit,100.00`;

      const result = parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(false);
      expect(result[1].isCredit).toBe(false);
      expect(result[2].isCredit).toBe(false);
    });
  });
});
