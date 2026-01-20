/**
 * Stream-based Bank Statement Import Service
 * TASK-PERF-103: Memory-efficient CSV parsing
 *
 * Provides streaming CSV import with:
 * - AsyncGenerator pattern for memory efficiency
 * - Batched database writes (default 100 rows)
 * - Progress tracking every N rows
 * - AbortController support for cancellation
 * - Flat memory usage (<100MB) regardless of file size
 */
import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { parse, Parser } from 'csv-parse';
import { randomUUID } from 'crypto';
import { TransactionRepository } from '../repositories/transaction.repository';
import { ParsedTransaction } from '../dto/import.dto';
import { ImportSource } from '../entities/transaction.entity';
import {
  parseCurrency,
  parseDate,
  extractPayeeName,
} from '../parsers/parse-utils';
import { CreateTransactionDto } from '../dto/transaction.dto';

/**
 * Raw CSV row after parsing (before transformation)
 */
interface CsvRow {
  [key: string]: string;
}

/**
 * Options for stream-based import
 */
export interface StreamImportOptions {
  /** Number of transactions per database write batch (default: 100) */
  batchSize?: number;
  /** Emit progress every N rows (default: 500) */
  progressInterval?: number;
  /** AbortSignal for cancellation support */
  signal?: AbortSignal;
}

/**
 * Progress update emitted during import
 */
export interface ImportProgress {
  /** Total rows processed so far */
  processedRows: number;
  /** Transactions successfully imported */
  importedCount: number;
  /** Rows skipped (e.g., duplicates, errors) */
  skippedCount: number;
  /** Rows with parsing errors */
  errorCount: number;
  /** Current batch number */
  currentBatch: number;
  /** Import status */
  status: 'processing' | 'completed' | 'cancelled' | 'error';
  /** Accumulated errors (last 100 max) */
  errors?: Array<{ row: number; message: string }>;
  /** Import batch ID */
  importBatchId?: string;
}

/**
 * Result of writing a batch to the database
 */
export interface BatchWriteResult {
  /** Transactions successfully imported in this batch */
  imported: number;
  /** Transactions skipped (duplicates) */
  skipped: number;
  /** Parsing errors in this batch */
  errors: Array<{ row: number; message: string }>;
}

/**
 * Internal row with metadata for processing
 */
interface TransactionRowWithMeta {
  transaction: ParsedTransaction;
  rowNumber: number;
}

/**
 * Fee keywords for fee transaction detection
 */
const FEE_KEYWORDS = [
  'fee',
  'charge',
  'bank charge',
  'bank charges',
  'service fee',
  'service charge',
  'debit order fee',
  'cash deposit fee',
  'cash handling fee',
  'withdrawal fee',
  'monthly fee',
  'transaction fee',
  'atm fee',
  'card fee',
  'account fee',
  'maintenance fee',
  'penalty',
  'interest charge',
] as const;

/**
 * Detects if a transaction description indicates a fee/charge
 */
function isFeeTransaction(description: string): boolean {
  const lowerDesc = description.toLowerCase();
  return FEE_KEYWORDS.some((keyword) => lowerDesc.includes(keyword));
}

@Injectable()
export class BankImportStreamService {
  private readonly logger = new Logger(BankImportStreamService.name);

  constructor(private readonly transactionRepo: TransactionRepository) {}

  /**
   * Parse CSV stream row-by-row using AsyncGenerator
   * Memory-efficient: processes one row at a time
   *
   * @param stream - Readable stream of CSV data
   * @yields TransactionRowWithMeta for each valid row
   */
  async *parseCSVStream(
    stream: Readable,
  ): AsyncGenerator<TransactionRowWithMeta> {
    const parser: Parser = stream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }),
    );

    let rowNumber = 1; // Row 1 is headers, data starts at row 2

    for await (const record of parser) {
      rowNumber++;
      try {
        const transaction = this.transformRow(record as CsvRow);
        yield { transaction, rowNumber };
      } catch (error) {
        // Log and skip invalid rows, let caller handle errors
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug(`Skipping row ${rowNumber}: ${message}`);
        // Re-throw with row context for batch error collection
        throw new RowParseError(rowNumber, message);
      }
    }
  }

  /**
   * Safe CSV parsing that yields either transactions or errors
   * Does not throw - errors are yielded for collection
   *
   * @param stream - Readable stream of CSV data
   * @yields Either a transaction row or an error object
   */
  async *parseCSVStreamSafe(
    stream: Readable,
  ): AsyncGenerator<
    TransactionRowWithMeta | { error: { row: number; message: string } }
  > {
    const parser: Parser = stream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }),
    );

    let rowNumber = 1;

    for await (const record of parser) {
      rowNumber++;
      try {
        const transaction = this.transformRow(record as CsvRow);
        yield { transaction, rowNumber };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug(`Skipping row ${rowNumber}: ${message}`);
        yield { error: { row: rowNumber, message } };
      }
    }
  }

  /**
   * Process parsed rows in batches
   * Accumulates rows and flushes when batch size is reached
   *
   * @param rows - AsyncGenerator of transaction rows
   * @param tenantId - Tenant ID for database writes
   * @param bankAccount - Bank account identifier
   * @param importBatchId - Import batch identifier
   * @param batchSize - Number of rows per batch
   * @yields BatchWriteResult for each batch
   */
  async *processBatches(
    rows: AsyncGenerator<
      TransactionRowWithMeta | { error: { row: number; message: string } }
    >,
    tenantId: string,
    bankAccount: string,
    importBatchId: string,
    batchSize = 100,
  ): AsyncGenerator<BatchWriteResult> {
    let batch: TransactionRowWithMeta[] = [];
    let batchErrors: Array<{ row: number; message: string }> = [];

    for await (const rowOrError of rows) {
      if ('error' in rowOrError) {
        batchErrors.push(rowOrError.error);
        continue;
      }

      batch.push(rowOrError);

      if (batch.length >= batchSize) {
        const result = await this.writeBatch(
          batch.map((r) => r.transaction),
          tenantId,
          bankAccount,
          importBatchId,
        );
        result.errors.push(...batchErrors);
        yield result;
        batch = [];
        batchErrors = [];
      }
    }

    // Flush remaining batch
    if (batch.length > 0 || batchErrors.length > 0) {
      const result = await this.writeBatch(
        batch.map((r) => r.transaction),
        tenantId,
        bankAccount,
        importBatchId,
      );
      result.errors.push(...batchErrors);
      yield result;
    }
  }

  /**
   * Main import method: streams CSV, batches writes, emits progress
   *
   * @param stream - Readable stream of CSV data
   * @param bankAccount - Bank account identifier
   * @param tenantId - Tenant ID (REQUIRED for tenant isolation)
   * @param options - Import options (batchSize, progressInterval, signal)
   * @yields ImportProgress updates during import
   */
  async *importFromStream(
    stream: Readable,
    bankAccount: string,
    tenantId: string,
    options: StreamImportOptions = {},
  ): AsyncGenerator<ImportProgress> {
    const { batchSize = 100, progressInterval = 500, signal } = options;

    const importBatchId = randomUUID();
    let processedRows = 0;
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let currentBatch = 0;
    const errors: Array<{ row: number; message: string }> = [];

    this.logger.log(
      `Starting stream import: batch=${importBatchId}, bankAccount=${bankAccount}, tenant=${tenantId}`,
    );

    try {
      const rows = this.parseCSVStreamSafe(stream);
      const batches = this.processBatches(
        rows,
        tenantId,
        bankAccount,
        importBatchId,
        batchSize,
      );

      let lastProgressEmit = 0;

      for await (const result of batches) {
        // Check for cancellation
        if (signal?.aborted) {
          this.logger.log(`Import cancelled: batch=${importBatchId}`);
          yield {
            processedRows,
            importedCount,
            skippedCount,
            errorCount,
            currentBatch,
            status: 'cancelled',
            errors: errors.slice(-100), // Last 100 errors
            importBatchId,
          };
          return;
        }

        currentBatch++;
        processedRows +=
          result.imported + result.skipped + result.errors.length;
        importedCount += result.imported;
        skippedCount += result.skipped;
        errorCount += result.errors.length;

        // Accumulate errors (keep last 100)
        for (const err of result.errors) {
          if (errors.length < 100) {
            errors.push(err);
          }
        }

        // Emit progress at intervals
        if (processedRows - lastProgressEmit >= progressInterval) {
          lastProgressEmit = processedRows;
          yield {
            processedRows,
            importedCount,
            skippedCount,
            errorCount,
            currentBatch,
            status: 'processing',
            errors: errors.slice(-100),
            importBatchId,
          };
        }
      }

      this.logger.log(
        `Stream import completed: batch=${importBatchId}, imported=${importedCount}, skipped=${skippedCount}, errors=${errorCount}`,
      );

      yield {
        processedRows,
        importedCount,
        skippedCount,
        errorCount,
        currentBatch,
        status: 'completed',
        errors: errors.slice(-100),
        importBatchId,
      };
    } catch (error) {
      this.logger.error(
        `Stream import failed: batch=${importBatchId}`,
        error instanceof Error ? error.stack : String(error),
      );

      yield {
        processedRows,
        importedCount,
        skippedCount,
        errorCount,
        currentBatch,
        status: 'error',
        errors: [
          ...errors.slice(-99),
          {
            row: 0,
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
        importBatchId,
      };
    }
  }

  /**
   * Write a batch of transactions to the database
   *
   * @param transactions - Array of parsed transactions
   * @param tenantId - Tenant ID (REQUIRED for tenant isolation)
   * @param bankAccount - Bank account identifier
   * @param importBatchId - Import batch identifier
   * @returns BatchWriteResult with counts
   */
  async writeBatch(
    transactions: ParsedTransaction[],
    tenantId: string,
    bankAccount: string,
    importBatchId: string,
  ): Promise<BatchWriteResult> {
    if (transactions.length === 0) {
      return { imported: 0, skipped: 0, errors: [] };
    }

    const dtos: CreateTransactionDto[] = transactions.map((tx) => ({
      tenantId,
      bankAccount,
      date: tx.date,
      description: tx.description,
      payeeName: tx.payeeName ?? undefined,
      reference: tx.reference ?? undefined,
      amountCents: tx.amountCents,
      isCredit: tx.isCredit,
      source: ImportSource.CSV_IMPORT,
      importBatchId,
    }));

    try {
      const created = await this.transactionRepo.createMany(dtos);
      return {
        imported: created.length,
        skipped: transactions.length - created.length,
        errors: [],
      };
    } catch (error) {
      this.logger.warn(
        `Batch write failed for ${transactions.length} transactions`,
        error instanceof Error ? error.message : String(error),
      );
      return {
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, message: 'Batch write failed' }],
      };
    }
  }

  /**
   * Transform a raw CSV row into a ParsedTransaction
   *
   * @param row - Raw CSV row with string values
   * @returns ParsedTransaction object
   * @throws Error if required fields are missing or invalid
   */
  private transformRow(row: CsvRow): ParsedTransaction {
    const columns = this.mapColumns(row);

    // Parse date (required)
    if (!columns.date) {
      throw new Error('Missing date column');
    }
    const date = parseDate(columns.date);

    // Parse description (required)
    if (!columns.description) {
      throw new Error('Missing description column');
    }
    const description = columns.description.trim();

    // Extract payee name
    const payeeName = extractPayeeName(description);

    // Extract reference (optional)
    const reference = columns.reference || null;

    // Parse amount and determine credit/debit
    let amountCents: number;
    let isCredit: boolean;

    if (columns.amount !== null) {
      // Single amount column - check for Type column or is_credit column
      amountCents = parseCurrency(columns.amount);

      if (columns.isCredit !== null) {
        // Use explicit is_credit column
        const isCreditValue = columns.isCredit.trim().toLowerCase();
        isCredit =
          isCreditValue === 'true' ||
          isCreditValue === '1' ||
          isCreditValue === 'yes';
      } else if (columns.type !== null && columns.type.trim() !== '') {
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
          isCredit = amountCents > 0;
        }
      } else {
        isCredit = amountCents > 0;
      }
      amountCents = Math.abs(amountCents);
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

    // Fee correction: Bank fees must ALWAYS be debits
    if (isFeeTransaction(description) && isCredit) {
      this.logger.debug(
        `Fee transaction "${description}" marked as credit, correcting to debit`,
      );
      isCredit = false;
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
   * Map CSV columns to standardized field names
   * Handles various column naming conventions
   *
   * @param row - CSV row with original column names
   * @returns Mapped column values
   */
  private mapColumns(row: CsvRow): {
    date: string | null;
    description: string | null;
    reference: string | null;
    amount: string | null;
    debit: string | null;
    credit: string | null;
    type: string | null;
    isCredit: string | null;
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

    // Is Credit column mapping (boolean indicator)
    const isCreditKeys = [
      'is_credit',
      'iscredit',
      'credit_flag',
      'credit_indicator',
    ];
    const isCreditValue = this.findColumn(normalized, isCreditKeys);

    return {
      date: dateValue,
      description: descriptionValue,
      reference: referenceValue,
      amount: amountValue,
      debit: debitValue,
      credit: creditValue,
      type: typeValue,
      isCredit: isCreditValue,
    };
  }

  /**
   * Find first matching column value from list of possible names
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

/**
 * Custom error for row parsing failures
 */
class RowParseError extends Error {
  constructor(
    public readonly row: number,
    message: string,
  ) {
    super(`Row ${row}: ${message}`);
    this.name = 'RowParseError';
  }
}
