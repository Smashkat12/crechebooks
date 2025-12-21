/**
 * Transaction Import Service
 * TASK-TRANS-011
 *
 * Handles CSV and PDF bank statement imports:
 * 1. Validates file (size, format)
 * 2. Parses transactions
 * 3. Detects duplicates (90-day window)
 * 4. Saves unique transactions
 * 5. Queues categorization jobs (placeholder for TASK-TRANS-012)
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { subDays, format } from 'date-fns';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CsvParser } from '../parsers/csv-parser';
import { HybridPdfParser } from '../parsers/hybrid-pdf-parser';
import {
  ParsedTransaction,
  ImportResult,
  DuplicateCheckResult,
  ImportError,
} from '../dto/import.dto';
import { ImportSource } from '../entities/transaction.entity';
import { ValidationException } from '../../shared/exceptions';

// File constraints
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['csv', 'pdf'];
const DUPLICATE_LOOKBACK_DAYS = 90;

/**
 * File upload interface
 */
export interface ImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class TransactionImportService {
  private readonly logger = new Logger(TransactionImportService.name);
  private readonly csvParser = new CsvParser();
  private readonly pdfParser = new HybridPdfParser();

  constructor(private readonly transactionRepo: TransactionRepository) {}

  /**
   * Import transactions from a file (CSV or PDF)
   * @throws ValidationException for invalid files
   * @throws BusinessException for parsing failures
   */
  async importFromFile(
    file: ImportFile,
    bankAccount: string,
    tenantId: string,
  ): Promise<ImportResult> {
    const importBatchId = randomUUID();
    const errors: ImportError[] = [];

    this.logger.log(
      `Starting import: batch=${importBatchId}, file=${file.originalname}, tenant=${tenantId}`,
    );

    // 1. Validate file
    this.validateFile(file);

    // 2. Determine source and parse
    const extension = this.getExtension(file.originalname);
    const source =
      extension === 'csv' ? ImportSource.CSV_IMPORT : ImportSource.PDF_IMPORT;

    let parsedTransactions: ParsedTransaction[];
    try {
      if (extension === 'csv') {
        parsedTransactions = this.csvParser.parse(file.buffer);
      } else {
        parsedTransactions = await this.pdfParser.parse(file.buffer);
      }
    } catch (error) {
      this.logger.error(
        `Parse failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      throw error; // Re-throw - don't wrap in BusinessException
    }

    if (parsedTransactions.length === 0) {
      return {
        importBatchId,
        status: 'COMPLETED',
        fileName: file.originalname,
        totalParsed: 0,
        duplicatesSkipped: 0,
        transactionsCreated: 0,
        errors: [
          { message: 'No transactions found in file', code: 'NO_TRANSACTIONS' },
        ],
      };
    }

    this.logger.log(`Parsed ${parsedTransactions.length} transactions`);

    // 3. Detect duplicates
    const { unique, duplicates } = await this.detectDuplicates(
      parsedTransactions,
      tenantId,
    );

    this.logger.log(
      `Duplicates: ${duplicates.length}, Unique: ${unique.length}`,
    );

    if (unique.length === 0) {
      return {
        importBatchId,
        status: 'COMPLETED',
        fileName: file.originalname,
        totalParsed: parsedTransactions.length,
        duplicatesSkipped: duplicates.length,
        transactionsCreated: 0,
        errors: [],
      };
    }

    // 4. Store transactions
    const created = await this.storeBatch(
      unique,
      tenantId,
      source,
      bankAccount,
      importBatchId,
    );

    // 5. Queue categorization (TODO: Implement in TASK-TRANS-012)
    const transactionIds = created.map((t) => t.id);
    this.logger.log(
      `Would queue ${transactionIds.length} transactions for categorization`,
    );

    return {
      importBatchId,
      status: 'PROCESSING',
      fileName: file.originalname,
      totalParsed: parsedTransactions.length,
      duplicatesSkipped: duplicates.length,
      transactionsCreated: created.length,
      errors,
    };
  }

  private validateFile(file: ImportFile): void {
    // Check size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationException('File too large', [
        {
          field: 'file',
          message: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum 10MB`,
        },
      ]);
    }

    // Check extension
    const extension = this.getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new ValidationException('Invalid file type', [
        {
          field: 'file',
          message: `File type .${extension} not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`,
        },
      ]);
    }
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  async detectDuplicates(
    transactions: ParsedTransaction[],
    tenantId: string,
  ): Promise<DuplicateCheckResult> {
    if (transactions.length === 0) {
      return { unique: [], duplicates: [] };
    }

    // Find date range in incoming transactions
    const dates = transactions.map((t) => t.date.getTime());
    const oldestIncoming = new Date(Math.min(...dates));
    const lookbackDate = subDays(oldestIncoming, DUPLICATE_LOOKBACK_DAYS);

    // Get existing transactions in the lookback window
    const existingResult = await this.transactionRepo.findByTenant(tenantId, {
      dateFrom: lookbackDate,
      limit: 10000, // High limit to get all in window
    });

    // Build hash set for O(1) lookup: date|description|amount
    const existingSet = new Set<string>();
    for (const tx of existingResult.data) {
      const dateStr = format(tx.date, 'yyyy-MM-dd');
      const hash = `${dateStr}|${tx.description}|${tx.amountCents}`;
      existingSet.add(hash);
    }

    this.logger.debug(
      `Existing transactions in window: ${existingResult.data.length}`,
    );

    const unique: ParsedTransaction[] = [];
    const duplicates: ParsedTransaction[] = [];

    for (const tx of transactions) {
      const dateStr = format(tx.date, 'yyyy-MM-dd');
      const hash = `${dateStr}|${tx.description}|${tx.amountCents}`;

      if (existingSet.has(hash)) {
        duplicates.push(tx);
      } else {
        unique.push(tx);
        existingSet.add(hash); // Prevent intra-file duplicates
      }
    }

    return { unique, duplicates };
  }

  private async storeBatch(
    transactions: ParsedTransaction[],
    tenantId: string,
    source: ImportSource,
    bankAccount: string,
    importBatchId: string,
  ) {
    const dtos = transactions.map((tx) => ({
      tenantId,
      bankAccount,
      date: tx.date,
      description: tx.description,
      payeeName: tx.payeeName ?? undefined,
      reference: tx.reference ?? undefined,
      amountCents: tx.amountCents,
      isCredit: tx.isCredit,
      source,
      importBatchId,
    }));

    // Use bulk insert for performance
    return await this.transactionRepo.createMany(dtos);
  }
}
