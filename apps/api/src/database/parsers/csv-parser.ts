import { parse } from 'csv-parse/sync';
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
import { parseCurrency, parseDate, extractPayeeName } from './parse-utils';
import { ValidationException } from '../../shared/exceptions';

/**
 * CSV parser for bank transaction files.
 * Supports flexible column mapping and various CSV formats.
 */
export class CsvParser {
  private readonly logger = new Logger(CsvParser.name);

  /**
   * Parses CSV file buffer into structured transaction data.
   *
   * Features:
   * - Automatic delimiter detection (comma, semicolon, tab)
   * - Flexible column name mapping
   * - Support for single amount or separate debit/credit columns
   * - Robust error handling with configurable failure threshold
   *
   * @param buffer - Raw CSV file buffer
   * @returns Array of parsed transactions
   * @throws ValidationException if file is empty, has no data, or >50% rows fail
   */
  parse(buffer: Buffer): ParsedTransaction[] {
    // Convert buffer to UTF-8 text
    const text = buffer.toString('utf-8').trim();

    if (!text) {
      throw new ValidationException('CSV file is empty', [
        {
          field: 'file',
          message: 'The uploaded CSV file contains no data',
          value: '',
        },
      ]);
    }

    // Detect delimiter automatically
    const delimiter = this.detectDelimiter(text);
    this.logger.log(
      `Detected CSV delimiter: ${delimiter === '\t' ? 'TAB' : delimiter}`,
    );

    // Parse CSV using csv-parse/sync
    let records: Record<string, string>[];
    try {
      records = parse(text, {
        delimiter,
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (error) {
      throw new ValidationException('Failed to parse CSV file', [
        {
          field: 'file',
          message:
            error instanceof Error ? error.message : 'Unknown parsing error',
          value: '',
        },
      ]);
    }

    if (!records || records.length === 0) {
      throw new ValidationException('CSV file has no data rows', [
        {
          field: 'file',
          message: 'The CSV file contains headers but no transaction data',
          value: '',
        },
      ]);
    }

    this.logger.log(`Parsed ${records.length} rows from CSV`);

    // Map columns and parse transactions
    const transactions: ParsedTransaction[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const transaction = this.parseRow(records[i]);
        transactions.push(transaction);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Skipping row ${i + 2}: ${errorMessage}`);
        errors.push({ row: i + 2, error: errorMessage });
      }
    }

    // Check error threshold (>50% = fail)
    const errorRate = errors.length / records.length;
    if (errorRate > 0.5) {
      throw new ValidationException(
        `Too many parsing errors: ${errors.length} of ${records.length} rows failed (${Math.round(errorRate * 100)}%)`,
        errors.map((err) => ({
          field: `row_${err.row}`,
          message: err.error,
          value: '',
        })),
      );
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Successfully parsed ${transactions.length} rows, skipped ${errors.length} rows with errors`,
      );
    }

    return transactions;
  }

  /**
   * Detects CSV delimiter by analyzing first line.
   * Counts occurrences of common delimiters and returns most frequent.
   *
   * @param text - CSV text content
   * @returns Detected delimiter character
   */
  private detectDelimiter(text: string): string {
    const firstLine = text.split('\n')[0];

    const delimiters = [',', ';', '\t'];
    const counts = delimiters.map((d) => ({
      delimiter: d,
      count: (
        firstLine.match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []
      ).length,
    }));

    // Return delimiter with highest count, default to comma
    const detected = counts.reduce((max, current) =>
      current.count > max.count ? current : max,
    );

    return detected.count > 0 ? detected.delimiter : ',';
  }

  /**
   * Parses single CSV row into transaction object.
   * Handles flexible column mapping and amount logic.
   *
   * @param row - CSV row as key-value object
   * @param rowNumber - Row number for error reporting
   * @returns Parsed transaction
   */
  private parseRow(row: Record<string, string>): ParsedTransaction {
    const columns = this.mapColumns(row);

    // Parse date
    if (!columns.date) {
      throw new Error('Missing date column');
    }
    const date = parseDate(columns.date);

    // Parse description
    if (!columns.description) {
      throw new Error('Missing description column');
    }
    const description = columns.description.trim();

    // Extract payee name
    const payeeName = extractPayeeName(description);

    // Extract reference (if available)
    const reference = columns.reference || null;

    // Parse amount and determine credit/debit
    let amountCents: number;
    let isCredit: boolean;

    if (columns.amount !== null) {
      // Single amount column - check for Type column to determine debit/credit
      amountCents = parseCurrency(columns.amount);

      if (columns.type !== null && columns.type.trim() !== '') {
        // Use Type column to determine debit/credit
        const typeValue = columns.type.trim().toLowerCase();
        if (typeValue === 'debit' || typeValue === 'dr' || typeValue === 'd') {
          isCredit = false;
        } else if (
          typeValue === 'credit' ||
          typeValue === 'cr' ||
          typeValue === 'c'
        ) {
          isCredit = true;
        } else {
          // Unknown type value - fall back to sign-based logic
          isCredit = amountCents > 0;
        }
      } else {
        // No Type column - use sign of amount
        isCredit = amountCents > 0;
      }
      amountCents = Math.abs(amountCents); // Store as positive
    } else if (columns.debit !== null || columns.credit !== null) {
      // Separate debit/credit columns
      if (columns.credit !== null && columns.credit.trim() !== '') {
        amountCents = Math.abs(parseCurrency(columns.credit));
        isCredit = true;
      } else if (columns.debit !== null && columns.debit.trim() !== '') {
        amountCents = Math.abs(parseCurrency(columns.debit));
        isCredit = false;
      } else {
        throw new Error('Both debit and credit columns are empty');
      }
    } else {
      throw new Error('No amount, debit, or credit column found');
    }

    return {
      date,
      description,
      payeeName,
      reference,
      amountCents,
      isCredit,
    };
  }

  /**
   * Maps CSV columns to standardized field names.
   * Handles various column naming conventions.
   *
   * @param row - CSV row with original column names
   * @returns Mapped column values
   */
  private mapColumns(row: Record<string, string>): {
    date: string | null;
    description: string | null;
    reference: string | null;
    amount: string | null;
    debit: string | null;
    credit: string | null;
    type: string | null;
  } {
    // Normalize column names for matching
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = value;
    }

    // Date column mapping
    const dateKeys = [
      'date',
      'transaction date',
      'trans date',
      'posting date',
      'value date',
      'transaction_date',
      'trans_date',
      'posting_date',
      'value_date',
    ];
    const dateValue = this.findColumn(normalized, dateKeys);

    // Description column mapping
    const descriptionKeys = [
      'description',
      'narration',
      'narrative',
      'details',
      'transaction description',
      'transaction_description',
      'memo',
      'particulars',
    ];
    const descriptionValue = this.findColumn(normalized, descriptionKeys);

    // Reference column mapping
    const referenceKeys = [
      'reference',
      'ref',
      'transaction reference',
      'transaction_reference',
      'trans_ref',
      'reference number',
      'reference_number',
    ];
    const referenceValue = this.findColumn(normalized, referenceKeys);

    // Amount column mapping (single column)
    const amountKeys = [
      'amount',
      'value',
      'transaction amount',
      'transaction_amount',
    ];
    const amountValue = this.findColumn(normalized, amountKeys);

    // Debit column mapping
    const debitKeys = [
      'debit',
      'dr',
      'debit amount',
      'debit_amount',
      'withdrawal',
      'withdrawals',
    ];
    const debitValue = this.findColumn(normalized, debitKeys);

    // Credit column mapping
    const creditKeys = [
      'credit',
      'cr',
      'credit amount',
      'credit_amount',
      'deposit',
      'deposits',
    ];
    const creditValue = this.findColumn(normalized, creditKeys);

    // Type column mapping (Debit/Credit indicator)
    const typeKeys = [
      'type',
      'transaction type',
      'transaction_type',
      'trans type',
      'trans_type',
      'dr/cr',
      'dr cr',
    ];
    const typeValue = this.findColumn(normalized, typeKeys);

    return {
      date: dateValue,
      description: descriptionValue,
      reference: referenceValue,
      amount: amountValue,
      debit: debitValue,
      credit: creditValue,
      type: typeValue,
    };
  }

  /**
   * Finds first matching column value from list of possible column names.
   *
   * @param normalized - Normalized column map
   * @param keys - Possible column names to search for
   * @returns Column value or null if not found
   */
  private findColumn(
    normalized: Record<string, string>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      if (normalized[key] !== undefined) {
        return normalized[key];
      }
    }
    return null;
  }
}
