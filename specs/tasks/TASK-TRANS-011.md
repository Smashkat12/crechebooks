<task_spec id="TASK-TRANS-011" version="2.0">

<metadata>
  <title>Transaction Import Service</title>
  <status>completed</status>
  <layer>logic</layer>
  <sequence>16</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>EC-TRANS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<reasoning_mode>
REQUIRED: Use systems thinking + analytical reasoning. This task involves:
1. File parsing (CSV/PDF) - requires systematic error handling
2. Duplicate detection - requires algorithmic thinking
3. Queue integration - requires understanding async patterns
4. Multi-tenant isolation - requires security-first thinking
</reasoning_mode>

<context>
This is the FIRST Logic Layer task. Creates TransactionImportService for CSV and PDF bank statement imports. The service validates files, parses transactions, detects duplicates (90-day window), saves to database, and queues categorization jobs via Bull.

CRITICAL: This project does NOT use `src/core/` directory. All services live in `src/database/services/`. Follow existing patterns exactly.
</context>

<current_state>
## Codebase State (as of 2025-12-20)
- Foundation Layer: 100% complete (15 tasks, 631 tests passing)
- Transaction entity: COMPLETE at `src/database/entities/transaction.entity.ts`
- TransactionRepository: COMPLETE at `src/database/repositories/transaction.repository.ts`
- TransactionDTO: COMPLETE at `src/database/dto/transaction.dto.ts`
- DatabaseModule: COMPLETE at `src/database/database.module.ts`

## What Exists
- Transaction entity with: ImportSource enum (BANK_FEED, CSV_IMPORT, PDF_IMPORT, MANUAL)
- TransactionStatus enum (PENDING, CATEGORIZED, REVIEW_REQUIRED, SYNCED)
- TransactionRepository with: create, findById, findByTenant, findPending, update, softDelete, markReconciled
- PrismaService for database access
- Exception classes in `src/shared/exceptions/` (NotFoundException, ConflictException, DatabaseException, ValidationException, BusinessException)
- Decimal utilities in `src/shared/utils/decimal.util.ts`
- Date utilities in `src/shared/utils/date.util.ts`

## What Does NOT Exist (Must Be Created)
- TransactionImportService
- CSV parser classes
- PDF parser classes
- Bull queue configuration
- createMany method on TransactionRepository
- Import DTOs (ParsedTransaction, ImportResult, etc.)
</current_state>

<directory_structure>
## CORRECT Directory Structure (Use These Paths)
src/
  database/
    services/
      transaction-import.service.ts    # NEW - Main service
      transaction-import.service.spec.ts # Co-located test
      index.ts                         # UPDATE - Export service
    repositories/
      transaction.repository.ts        # UPDATE - Add createMany
    dto/
      import.dto.ts                    # NEW - Import DTOs
    parsers/                           # NEW directory
      csv-parser.ts
      pdf-parser.ts
      parse-utils.ts
      index.ts
  config/
    queue.config.ts                    # NEW - Bull queue config
tests/
  database/
    services/
      transaction-import.service.spec.ts  # Integration tests
    parsers/
      csv-parser.spec.ts
      pdf-parser.spec.ts
</directory_structure>

<dependencies_to_install>
## Required NPM Packages (NOT installed yet)
npm install csv-parse pdf-parse @nestjs/bull
npm install --save-dev @types/pdf-parse

## Already Installed
- bull: ^4.16.5
- @prisma/client
- class-validator, class-transformer
- winston (logging)
- decimal.js
</dependencies_to_install>

<prerequisites_check>
Before implementing, verify:
1. [ ] `npm test` passes (631 tests expected)
2. [ ] `npm run build` succeeds
3. [ ] PostgreSQL database accessible
4. [ ] Redis server running (for Bull queue)
5. [ ] Install: `npm install csv-parse pdf-parse @nestjs/bull && npm install -D @types/pdf-parse`
</prerequisites_check>

<scope>
  <in_scope>
    - TransactionImportService in src/database/services/
    - CSV parsing with auto-delimiter detection
    - PDF parsing for SA banks (Standard Bank, FNB, ABSA)
    - Duplicate detection (90-day lookback window)
    - Bulk insert via createMany method
    - Bull queue integration for categorization
    - Import DTOs and result types
    - Comprehensive integration tests using REAL database
  </in_scope>
  <out_of_scope>
    - OFX/QIF parsing
    - Categorization logic (TASK-TRANS-012)
    - Bank feed/API integration
    - File storage (use temp files/buffers)
  </out_of_scope>
</scope>

<implementation_order>
Execute in this exact order:
1. Install dependencies
2. Create import DTOs (src/database/dto/import.dto.ts)
3. Create parse utilities (src/database/parsers/parse-utils.ts)
4. Create CSV parser (src/database/parsers/csv-parser.ts)
5. Create PDF parser (src/database/parsers/pdf-parser.ts)
6. Add createMany to TransactionRepository
7. Create Bull queue config (src/config/queue.config.ts)
8. Create TransactionImportService
9. Update DatabaseModule to export new service
10. Write integration tests
11. Run all tests to verify
</implementation_order>

<files_to_create>

<file path="src/database/dto/import.dto.ts">
/**
 * Import DTOs for Transaction Import Service
 * TASK-TRANS-011
 */
import { IsUUID, IsString, IsInt, IsBoolean, IsDate, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { ImportSource } from '../entities/transaction.entity';

export interface ParsedTransaction {
  date: Date;
  description: string;
  payeeName: string | null;
  reference: string | null;
  amountCents: number;
  isCredit: boolean;
}

export interface ImportResult {
  importBatchId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileName: string;
  totalParsed: number;
  duplicatesSkipped: number;
  transactionsCreated: number;
  errors: ImportError[];
}

export interface DuplicateCheckResult {
  unique: ParsedTransaction[];
  duplicates: ParsedTransaction[];
}

export interface ImportError {
  row?: number;
  field?: string;
  message: string;
  code: string;
}

export class ImportFileDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  bankAccount!: string;

  @IsEnum(ImportSource)
  source!: ImportSource;
}
</file>

<file path="src/database/parsers/parse-utils.ts">
/**
 * Shared parsing utilities for bank statement imports
 * TASK-TRANS-011
 *
 * CRITICAL: All monetary values converted to cents (integers)
 * South African formats: "1,234.56" or "1 234.56" or "1234,56"
 */
import { ValidationException } from '../../shared/exceptions';

export function parseCurrency(value: string): number {
  if (!value || typeof value !== 'string') {
    throw new ValidationException('Invalid currency value', [
      { field: 'amount', message: 'Amount is required', value }
    ]);
  }

  // Remove spaces and currency symbols
  let cleaned = value.trim().replace(/\s/g, '').replace(/R/gi, '');

  // Handle European format (1234,56 -> 1234.56)
  if (cleaned.match(/^\d+,\d{2}$/) && !cleaned.includes('.')) {
    cleaned = cleaned.replace(',', '.');
  } else {
    // Remove thousand separators (commas)
    cleaned = cleaned.replace(/,/g, '');
  }

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) {
    throw new ValidationException('Invalid currency format', [
      { field: 'amount', message: `Cannot parse: ${value}`, value }
    ]);
  }

  // Convert to cents using integer math to avoid float precision issues
  return Math.round(parsed * 100);
}

export function parseDate(value: string): Date {
  if (!value || typeof value !== 'string') {
    throw new ValidationException('Invalid date value', [
      { field: 'date', message: 'Date is required', value }
    ]);
  }

  const trimmed = value.trim();
  let date: Date;

  // DD/MM/YYYY (South African format)
  if (trimmed.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    const [day, month, year] = trimmed.split('/');
    date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  }
  // YYYY-MM-DD (ISO format)
  else if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(`${trimmed}T00:00:00Z`);
  }
  // DD-MM-YYYY
  else if (trimmed.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [day, month, year] = trimmed.split('-');
    date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  }
  else {
    throw new ValidationException('Invalid date format', [
      { field: 'date', message: `Unsupported format: ${value}. Use DD/MM/YYYY or YYYY-MM-DD`, value }
    ]);
  }

  if (isNaN(date.getTime())) {
    throw new ValidationException('Invalid date', [
      { field: 'date', message: `Invalid date: ${value}`, value }
    ]);
  }

  return date;
}

export function extractPayeeName(description: string): string | null {
  if (!description) return null;

  // Remove common prefixes
  const cleaned = description
    .replace(/^(POS PURCHASE|POS|ATM|EFT|DEBIT ORDER|PAYMENT|TRANSFER)\s*/i, '')
    .trim();

  // Take first meaningful word/phrase
  const words = cleaned.split(/\s+/);
  if (words.length === 0) return null;

  // Return first 2-3 words as payee name (max 50 chars)
  return words.slice(0, 3).join(' ').substring(0, 50) || null;
}
</file>

<file path="src/database/parsers/csv-parser.ts">
/**
 * CSV Parser for Bank Statement Imports
 * TASK-TRANS-011
 *
 * Supports:
 * - Auto-delimiter detection (comma, semicolon, tab)
 * - Flexible column mapping
 * - SA currency formats
 * - DD/MM/YYYY date format
 */
import { parse } from 'csv-parse/sync';
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
import { parseCurrency, parseDate, extractPayeeName } from './parse-utils';
import { ValidationException } from '../../shared/exceptions';

export class CsvParser {
  private readonly logger = new Logger(CsvParser.name);

  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    const text = buffer.toString('utf-8');

    if (!text.trim()) {
      throw new ValidationException('Empty file', [
        { field: 'file', message: 'CSV file is empty' }
      ]);
    }

    const delimiter = this.detectDelimiter(text);
    this.logger.debug(`Detected delimiter: "${delimiter}"`);

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
      this.logger.error('CSV parse error', error);
      throw new ValidationException('Invalid CSV format', [
        { field: 'file', message: `CSV parse error: ${error instanceof Error ? error.message : 'Unknown error'}` }
      ]);
    }

    if (records.length === 0) {
      throw new ValidationException('No data rows', [
        { field: 'file', message: 'CSV contains no data rows' }
      ]);
    }

    const transactions: ParsedTransaction[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const transaction = this.mapColumns(records[i]);
        transactions.push(transaction);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ row: i + 2, message: msg }); // +2 for header + 1-based
        this.logger.warn(`Row ${i + 2}: ${msg}`);
      }
    }

    // Fail if too many errors (> 50%)
    if (errors.length > records.length / 2) {
      throw new ValidationException('Too many parsing errors',
        errors.map(e => ({ field: `row_${e.row}`, message: e.message }))
      );
    }

    this.logger.log(`Parsed ${transactions.length} transactions, ${errors.length} errors`);
    return transactions;
  }

  private detectDelimiter(sample: string): string {
    const firstLine = sample.split('\n')[0] || '';

    // Count occurrences
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (tabs > commas && tabs > semicolons) return '\t';
    if (semicolons > commas) return ';';
    return ',';
  }

  private mapColumns(row: Record<string, string>): ParsedTransaction {
    // Normalize column names (lowercase, trim)
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = value;
    }

    // Find date column
    const dateValue = normalized['date']
      || normalized['transaction date']
      || normalized['trans date']
      || normalized['posting date'];

    // Find description column
    const descValue = normalized['description']
      || normalized['narration']
      || normalized['narrative']
      || normalized['details']
      || normalized['transaction description'];

    // Find amount - could be single column or debit/credit split
    const amountValue = normalized['amount'] || normalized['value'];
    const debitValue = normalized['debit'] || normalized['dr'];
    const creditValue = normalized['credit'] || normalized['cr'];

    if (!dateValue) {
      throw new Error('Missing date column');
    }
    if (!descValue) {
      throw new Error('Missing description column');
    }

    const date = parseDate(dateValue);
    let amountCents: number;
    let isCredit: boolean;

    if (amountValue && amountValue.trim()) {
      // Single amount column (positive = credit, negative = debit)
      const cents = parseCurrency(amountValue);
      amountCents = Math.abs(cents);
      isCredit = cents > 0;
    } else if (debitValue?.trim() || creditValue?.trim()) {
      // Separate debit/credit columns
      if (creditValue && creditValue.trim() && parseCurrency(creditValue) !== 0) {
        amountCents = Math.abs(parseCurrency(creditValue));
        isCredit = true;
      } else if (debitValue && debitValue.trim()) {
        amountCents = Math.abs(parseCurrency(debitValue));
        isCredit = false;
      } else {
        throw new Error('No amount found in debit/credit columns');
      }
    } else {
      throw new Error('Missing amount column');
    }

    return {
      date,
      description: descValue.trim(),
      payeeName: extractPayeeName(descValue),
      reference: normalized['reference'] || normalized['ref'] || null,
      amountCents,
      isCredit,
    };
  }
}
</file>

<file path="src/database/parsers/pdf-parser.ts">
/**
 * PDF Parser for Bank Statement Imports
 * TASK-TRANS-011
 *
 * Supports SA banks: Standard Bank, FNB, ABSA
 * Uses regex patterns to extract transaction data from PDF text
 */
import * as pdfParse from 'pdf-parse';
import { Logger } from '@nestjs/common';
import { ParsedTransaction } from '../dto/import.dto';
import { parseCurrency, parseDate, extractPayeeName } from './parse-utils';
import { ValidationException, BusinessException } from '../../shared/exceptions';

export class PdfParser {
  private readonly logger = new Logger(PdfParser.name);

  async parse(buffer: Buffer): Promise<ParsedTransaction[]> {
    if (buffer.length === 0) {
      throw new ValidationException('Empty file', [
        { field: 'file', message: 'PDF file is empty' }
      ]);
    }

    let text: string;
    try {
      const data = await pdfParse(buffer);
      text = data.text;
    } catch (error) {
      this.logger.error('PDF parse error', error);
      throw new ValidationException('Invalid PDF', [
        { field: 'file', message: `PDF parse error: ${error instanceof Error ? error.message : 'Unknown'}` }
      ]);
    }

    if (!text.trim()) {
      throw new ValidationException('No text in PDF', [
        { field: 'file', message: 'PDF contains no extractable text' }
      ]);
    }

    this.logger.debug(`Extracted ${text.length} chars from PDF`);

    // Detect bank from content
    const upperText = text.toUpperCase();

    if (upperText.includes('STANDARD BANK')) {
      return this.parseStandardBank(text);
    }
    if (upperText.includes('FNB') || upperText.includes('FIRST NATIONAL BANK')) {
      return this.parseFNB(text);
    }
    if (upperText.includes('ABSA')) {
      return this.parseAbsa(text);
    }

    throw new BusinessException(
      'Unsupported bank format. Supported: Standard Bank, FNB, ABSA',
      'UNSUPPORTED_BANK_FORMAT'
    );
  }

  private parseStandardBank(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // Standard Bank format: DD/MM/YYYY Description Amount
    // Amount can be negative (debit) or positive (credit)
    const pattern = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d[\d\s,]*\.?\d*)\s*$/;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        try {
          const [, dateStr, description, amountStr] = match;
          const date = parseDate(dateStr);
          const amountCents = parseCurrency(amountStr);

          transactions.push({
            date,
            description: description.trim(),
            payeeName: extractPayeeName(description),
            reference: null,
            amountCents: Math.abs(amountCents),
            isCredit: amountCents > 0,
          });
        } catch (error) {
          this.logger.debug(`Skipping line: ${line}`);
        }
      }
    }

    this.logger.log(`Standard Bank: Parsed ${transactions.length} transactions`);
    return transactions;
  }

  private parseFNB(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // FNB format: DD MMM YYYY Description Amount
    const pattern = /(\d{2}\s+\w{3}\s+\d{4})\s+(.+?)\s+([-]?R?\s*\d[\d\s,]*\.?\d*)\s*$/i;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        try {
          const [, dateStr, description, amountStr] = match;
          // Convert "DD MMM YYYY" to parseable format
          const dateNormalized = this.normalizeFnbDate(dateStr);
          const date = parseDate(dateNormalized);
          const amountCents = parseCurrency(amountStr);

          transactions.push({
            date,
            description: description.trim(),
            payeeName: extractPayeeName(description),
            reference: null,
            amountCents: Math.abs(amountCents),
            isCredit: amountCents > 0,
          });
        } catch (error) {
          this.logger.debug(`Skipping FNB line: ${line}`);
        }
      }
    }

    this.logger.log(`FNB: Parsed ${transactions.length} transactions`);
    return transactions;
  }

  private normalizeFnbDate(dateStr: string): string {
    const months: Record<string, string> = {
      'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
      'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
      'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    };

    const parts = dateStr.trim().split(/\s+/);
    if (parts.length !== 3) throw new Error('Invalid FNB date');

    const day = parts[0].padStart(2, '0');
    const month = months[parts[1].toLowerCase()];
    const year = parts[2];

    if (!month) throw new Error('Invalid month in FNB date');
    return `${year}-${month}-${day}`;
  }

  private parseAbsa(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    const lines = text.split('\n');

    // ABSA format: YYYY-MM-DD Description Amount
    const pattern = /(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-]?R?\s*\d[\d\s,]*\.?\d*)\s*$/i;

    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        try {
          const [, dateStr, description, amountStr] = match;
          const date = parseDate(dateStr);
          const amountCents = parseCurrency(amountStr);

          transactions.push({
            date,
            description: description.trim(),
            payeeName: extractPayeeName(description),
            reference: null,
            amountCents: Math.abs(amountCents),
            isCredit: amountCents > 0,
          });
        } catch (error) {
          this.logger.debug(`Skipping ABSA line: ${line}`);
        }
      }
    }

    this.logger.log(`ABSA: Parsed ${transactions.length} transactions`);
    return transactions;
  }
}
</file>

<file path="src/database/parsers/index.ts">
export { CsvParser } from './csv-parser';
export { PdfParser } from './pdf-parser';
export * from './parse-utils';
</file>

<file path="src/config/queue.config.ts">
/**
 * Bull Queue Configuration
 * TASK-TRANS-011
 */
import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
}));

export const QUEUE_NAMES = {
  CATEGORIZATION: 'transaction-categorization',
} as const;
</file>

<file path="src/database/services/transaction-import.service.ts">
/**
 * Transaction Import Service
 * TASK-TRANS-011
 *
 * Handles CSV and PDF bank statement imports:
 * 1. Validates file (size, format)
 * 2. Parses transactions
 * 3. Detects duplicates (90-day window)
 * 4. Saves unique transactions
 * 5. Queues categorization jobs
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { subDays, format } from 'date-fns';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CsvParser } from '../parsers/csv-parser';
import { PdfParser } from '../parsers/pdf-parser';
import {
  ParsedTransaction,
  ImportResult,
  DuplicateCheckResult,
  ImportError,
} from '../dto/import.dto';
import { ImportSource } from '../entities/transaction.entity';
import { ValidationException, BusinessException } from '../../shared/exceptions';

// File constraints
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['csv', 'pdf'];
const DUPLICATE_LOOKBACK_DAYS = 90;

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
  private readonly pdfParser = new PdfParser();

  constructor(
    private readonly transactionRepo: TransactionRepository,
  ) {}

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

    this.logger.log(`Starting import: batch=${importBatchId}, file=${file.originalname}, tenant=${tenantId}`);

    // 1. Validate file
    this.validateFile(file);

    // 2. Determine source and parse
    const extension = this.getExtension(file.originalname);
    const source = extension === 'csv' ? ImportSource.CSV_IMPORT : ImportSource.PDF_IMPORT;

    let parsedTransactions: ParsedTransaction[];
    try {
      if (extension === 'csv') {
        parsedTransactions = await this.csvParser.parse(file.buffer);
      } else {
        parsedTransactions = await this.pdfParser.parse(file.buffer);
      }
    } catch (error) {
      this.logger.error(`Parse failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      throw error;
    }

    if (parsedTransactions.length === 0) {
      return {
        importBatchId,
        status: 'COMPLETED',
        fileName: file.originalname,
        totalParsed: 0,
        duplicatesSkipped: 0,
        transactionsCreated: 0,
        errors: [{ message: 'No transactions found in file', code: 'NO_TRANSACTIONS' }],
      };
    }

    this.logger.log(`Parsed ${parsedTransactions.length} transactions`);

    // 3. Detect duplicates
    const { unique, duplicates } = await this.detectDuplicates(
      parsedTransactions,
      tenantId,
      bankAccount,
    );

    this.logger.log(`Duplicates: ${duplicates.length}, Unique: ${unique.length}`);

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
    // For now, log the IDs that would be queued
    const transactionIds = created.map(t => t.id);
    this.logger.log(`Would queue ${transactionIds.length} transactions for categorization`);

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
        }
      ]);
    }

    // Check extension
    const extension = this.getExtension(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new ValidationException('Invalid file type', [
        {
          field: 'file',
          message: `File type .${extension} not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`,
        }
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
    bankAccount: string,
  ): Promise<DuplicateCheckResult> {
    if (transactions.length === 0) {
      return { unique: [], duplicates: [] };
    }

    // Find date range in incoming transactions
    const dates = transactions.map(t => t.date.getTime());
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

    this.logger.debug(`Existing transactions in window: ${existingResult.data.length}`);

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
    const dtos = transactions.map(tx => ({
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
</file>

</files_to_create>

<files_to_modify>

<file path="src/database/repositories/transaction.repository.ts" action="add_method">
Add createMany method for bulk inserts. Add after the existing create method:

```typescript
/**
 * Create multiple transactions in a single batch
 * Uses Prisma's createMany for optimal performance
 * @returns Array of created transactions
 * @throws NotFoundException if tenant doesn't exist
 * @throws DatabaseException for database errors
 */
async createMany(dtos: CreateTransactionDto[]): Promise<Transaction[]> {
  if (dtos.length === 0) {
    return [];
  }

  try {
    // Verify tenant exists (check first dto's tenant)
    const tenantId = dtos[0].tenantId;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // Bulk insert
    await this.prisma.transaction.createMany({
      data: dtos,
      skipDuplicates: true, // Skip any xeroTransactionId conflicts
    });

    // Fetch the created transactions
    const importBatchId = dtos[0].importBatchId;
    if (importBatchId) {
      return await this.prisma.transaction.findMany({
        where: {
          tenantId,
          importBatchId,
        },
        orderBy: { date: 'asc' },
      });
    }

    // If no batch ID, return empty (shouldn't happen in import flow)
    return [];
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw error;
    }
    this.logger.error(
      `Failed to create batch of ${dtos.length} transactions`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'createMany',
      'Failed to create transactions batch',
      error instanceof Error ? error : undefined,
    );
  }
}
```
</file>

<file path="src/database/services/index.ts" action="update">
Update to export TransactionImportService:

```typescript
export { AuditLogService } from './audit-log.service';
export { TransactionImportService } from './transaction-import.service';
```
</file>

<file path="src/database/database.module.ts" action="update">
Add TransactionImportService to providers and exports:

```typescript
import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { AuditLogService } from './services/audit-log.service';
import { TransactionImportService } from './services/transaction-import.service';

@Module({
  providers: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
    TransactionImportService,
  ],
  exports: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
    TransactionImportService,
  ],
})
export class DatabaseModule {}
```
</file>

<file path="src/database/dto/index.ts" action="update">
Add import DTO exports:

```typescript
// Add to existing exports:
export * from './import.dto';
```
</file>

</files_to_modify>

<test_files>

<file path="tests/database/services/transaction-import.service.spec.ts">
/**
 * TransactionImportService Integration Tests
 * TASK-TRANS-011
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests actual parsing, deduplication, and storage
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { TransactionImportService, ImportFile } from '../../../src/database/services/transaction-import.service';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import { Tenant } from '@prisma/client';
import { ValidationException } from '../../../src/shared/exceptions';

describe('TransactionImportService', () => {
  let service: TransactionImportService;
  let transactionRepo: TransactionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        TransactionImportService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    service = module.get<TransactionImportService>(TransactionImportService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('importFromFile - CSV', () => {
    it('should import valid CSV file', async () => {
      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT SMITH J Jan Fees,2500.00
16/01/2024,DEBIT ORDER Insurance,-500.00
17/01/2024,POS PURCHASE WOOLWORTHS,-150.50`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      const result = await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      expect(result.status).toBe('PROCESSING');
      expect(result.totalParsed).toBe(3);
      expect(result.transactionsCreated).toBe(3);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.importBatchId).toBeDefined();

      // Verify in database
      const dbResult = await transactionRepo.findByTenant(testTenant.id, {});
      expect(dbResult.total).toBe(3);
    });

    it('should detect and skip duplicates', async () => {
      // First import
      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT SMITH J,2500.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      // Second import with same transaction
      const result = await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      expect(result.totalParsed).toBe(1);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.transactionsCreated).toBe(0);
    });

    it('should handle debit/credit columns', async () => {
      const csvContent = `Date,Description,Debit,Credit
15/01/2024,Parent Payment,,2500.00
16/01/2024,Electricity,1500.00,`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      const result = await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      expect(result.transactionsCreated).toBe(2);

      const dbResult = await transactionRepo.findByTenant(testTenant.id, {});
      const credit = dbResult.data.find(t => t.description === 'Parent Payment');
      const debit = dbResult.data.find(t => t.description === 'Electricity');

      expect(credit?.isCredit).toBe(true);
      expect(credit?.amountCents).toBe(250000);
      expect(debit?.isCredit).toBe(false);
      expect(debit?.amountCents).toBe(150000);
    });

    it('should reject file larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const file: ImportFile = {
        buffer: largeBuffer,
        originalname: 'large.csv',
        mimetype: 'text/csv',
        size: largeBuffer.length,
      };

      await expect(
        service.importFromFile(file, 'FNB Cheque', testTenant.id)
      ).rejects.toThrow(ValidationException);
    });

    it('should reject invalid file extension', async () => {
      const file: ImportFile = {
        buffer: Buffer.from('test'),
        originalname: 'file.xlsx',
        mimetype: 'application/vnd.ms-excel',
        size: 4,
      };

      await expect(
        service.importFromFile(file, 'FNB Cheque', testTenant.id)
      ).rejects.toThrow(ValidationException);
    });
  });

  describe('importFromFile - tenant isolation', () => {
    it('should not detect duplicates across tenants', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Rainbow Kids',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@rainbowkids.co.za`,
        },
      });

      const csvContent = `Date,Description,Amount
15/01/2024,EFT PAYMENT,2500.00`;

      const file: ImportFile = {
        buffer: Buffer.from(csvContent),
        originalname: 'statement.csv',
        mimetype: 'text/csv',
        size: csvContent.length,
      };

      // Import to tenant 1
      await service.importFromFile(file, 'FNB Cheque', testTenant.id);

      // Same import to tenant 2 - should NOT be duplicate
      const result = await service.importFromFile(file, 'FNB Cheque', otherTenant.id);

      expect(result.transactionsCreated).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
    });
  });

  describe('createMany', () => {
    it('should bulk create transactions', async () => {
      const dtos = [
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2024-01-15'),
          description: 'Transaction 1',
          amountCents: 100000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          importBatchId: 'test-batch-001',
        },
        {
          tenantId: testTenant.id,
          bankAccount: 'FNB Cheque',
          date: new Date('2024-01-16'),
          description: 'Transaction 2',
          amountCents: 200000,
          isCredit: false,
          source: ImportSource.CSV_IMPORT,
          importBatchId: 'test-batch-001',
        },
      ];

      const created = await transactionRepo.createMany(dtos);

      expect(created).toHaveLength(2);
      expect(created[0].description).toBe('Transaction 1');
      expect(created[1].description).toBe('Transaction 2');
    });
  });
});
</file>

<file path="tests/database/parsers/csv-parser.spec.ts">
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
    it('should parse comma-delimited CSV', async () => {
      const csv = `Date,Description,Amount
15/01/2024,Payment from Smith,2500.00
16/01/2024,Electricity bill,-1500.00`;

      const result = await parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe('Payment from Smith');
      expect(result[0].amountCents).toBe(250000);
      expect(result[0].isCredit).toBe(true);
      expect(result[1].amountCents).toBe(150000);
      expect(result[1].isCredit).toBe(false);
    });

    it('should parse semicolon-delimited CSV', async () => {
      const csv = `Date;Description;Amount
15/01/2024;Payment from Smith;2500.00`;

      const result = await parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Payment from Smith');
    });

    it('should parse tab-delimited CSV', async () => {
      const csv = `Date\tDescription\tAmount
15/01/2024\tPayment\t1000.00`;

      const result = await parser.parse(Buffer.from(csv));

      expect(result).toHaveLength(1);
    });

    it('should handle SA currency format with spaces', async () => {
      const csv = `Date,Description,Amount
15/01/2024,Payment,1 234 567.89`;

      const result = await parser.parse(Buffer.from(csv));

      expect(result[0].amountCents).toBe(123456789);
    });

    it('should handle debit/credit columns', async () => {
      const csv = `Date,Description,Debit,Credit
15/01/2024,Income,,5000.00
16/01/2024,Expense,1000.00,`;

      const result = await parser.parse(Buffer.from(csv));

      expect(result[0].isCredit).toBe(true);
      expect(result[0].amountCents).toBe(500000);
      expect(result[1].isCredit).toBe(false);
      expect(result[1].amountCents).toBe(100000);
    });

    it('should throw on empty file', async () => {
      await expect(parser.parse(Buffer.from(''))).rejects.toThrow(ValidationException);
    });

    it('should throw when too many parsing errors', async () => {
      const csv = `Date,Description,Amount
invalid,invalid,invalid
bad,bad,bad`;

      await expect(parser.parse(Buffer.from(csv))).rejects.toThrow(ValidationException);
    });
  });
});
</file>

<file path="tests/database/parsers/parse-utils.spec.ts">
/**
 * Parse Utils Unit Tests
 * TASK-TRANS-011
 */
import { parseCurrency, parseDate, extractPayeeName } from '../../../src/database/parsers/parse-utils';
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

    it('should throw on invalid value', () => {
      expect(() => parseCurrency('abc')).toThrow(ValidationException);
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

    it('should throw on invalid format', () => {
      expect(() => parseDate('01/2024')).toThrow(ValidationException);
    });
  });

  describe('extractPayeeName', () => {
    it('should extract from POS description', () => {
      expect(extractPayeeName('POS PURCHASE WOOLWORTHS SANDTON')).toBe('WOOLWORTHS SANDTON');
    });

    it('should extract from EFT description', () => {
      expect(extractPayeeName('EFT PAYMENT SMITH J')).toBe('PAYMENT SMITH J');
    });

    it('should return null for empty', () => {
      expect(extractPayeeName('')).toBeNull();
    });

    it('should limit to 50 chars', () => {
      const long = 'A'.repeat(100);
      const result = extractPayeeName(long);
      expect(result?.length).toBeLessThanOrEqual(50);
    });
  });
});
</file>

</test_files>

<validation_checklist>
Run these commands in order after implementation:

1. Install dependencies:
   npm install csv-parse pdf-parse @nestjs/bull
   npm install -D @types/pdf-parse

2. Create parsers directory:
   mkdir -p src/database/parsers

3. Build project:
   npm run build

4. Run all tests:
   npm test

5. Verify new tests pass:
   npm test -- --grep "TransactionImportService"
   npm test -- --grep "CsvParser"
   npm test -- --grep "Parse Utils"

Expected: All existing 631 tests pass + new tests pass
</validation_checklist>

<error_handling>
## CRITICAL: No Fallbacks, Fail Fast

All errors MUST:
1. Throw immediately with descriptive message
2. Include error code for programmatic handling
3. Log full context before throwing
4. Include stack trace in DatabaseException

## Exception Types to Use
- ValidationException: Invalid file, format, or data
- BusinessException: Unsupported bank format, business rule violations
- DatabaseException: Database operation failures
- NotFoundException: Missing tenant

## Logging Pattern
```typescript
this.logger.error(
  `Operation failed: ${context}`,
  error instanceof Error ? error.stack : String(error)
);
throw new SpecificException(...);
```
</error_handling>

<testing_requirements>
## CRITICAL: Real Database, No Mocks

All tests MUST:
1. Use real PostgreSQL via PrismaService
2. Clean database in beforeEach (FK order)
3. Create real test data
4. Assert on actual database state
5. Test tenant isolation

## Test Categories Required
1. Unit tests: Parse utils, CSV parser, PDF parser
2. Integration tests: Full import flow with database
3. Error tests: Validation failures, duplicate detection
4. Isolation tests: Multi-tenant data separation
</testing_requirements>

<success_criteria>
1. `npm run build` succeeds with no TypeScript errors
2. All 631+ existing tests pass
3. New tests pass: CsvParser, PdfParser, ParseUtils, TransactionImportService
4. CSV import creates transactions in database
5. Duplicate detection prevents re-import of same transactions
6. Multi-tenant isolation verified
7. File validation rejects oversized/wrong-type files
8. SA date/currency formats handled correctly
</success_criteria>

</task_spec>
