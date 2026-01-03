import { IsEnum, IsString, IsUUID } from 'class-validator';
import { ImportSource } from '../entities/transaction.entity';

/**
 * Represents a parsed transaction from CSV or PDF import.
 * Contains standardized data extracted from various file formats.
 */
export interface ParsedTransaction {
  /** Transaction date extracted from the source file */
  date: Date;

  /** Full transaction description/narrative */
  description: string;

  /** Extracted payee name, if identifiable */
  payeeName: string | null;

  /** Transaction reference number, if available */
  reference: string | null;

  /** Transaction amount in cents (always positive integer) */
  amountCents: number;

  /** Whether this transaction is a credit (true) or debit (false) */
  isCredit: boolean;
}

/**
 * Parsed transaction with confidence scoring for hybrid parsing.
 * TASK-TRANS-015 - Confidence-based fallback to LLMWhisperer
 */
export interface ParsedTransactionWithConfidence extends ParsedTransaction {
  /** Parsing confidence score 0-100 */
  parsingConfidence: number;

  /** Reasons for confidence adjustments */
  confidenceReasons: string[];
}

/**
 * Categorization statistics from auto-categorization.
 */
export interface CategorizationStats {
  /** Number of transactions auto-categorized with high confidence */
  autoCategorized: number;

  /** Number of transactions requiring manual review */
  reviewRequired: number;
}

/**
 * Result of a transaction import operation.
 * Provides comprehensive feedback about the import process.
 */
export interface ImportResult {
  /** Unique identifier for this import batch */
  importBatchId: string;

  /** Current status of the import operation */
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';

  /** Original filename that was imported */
  fileName: string;

  /** Total number of transactions successfully parsed from file */
  totalParsed: number;

  /** Number of duplicate transactions that were skipped */
  duplicatesSkipped: number;

  /** Number of new transactions created in database */
  transactionsCreated: number;

  /** Collection of errors encountered during import */
  errors: ImportError[];

  /** Auto-categorization statistics (optional, only present if categorization ran) */
  categorization?: CategorizationStats;
}

/**
 * Result of duplicate detection check.
 * Separates unique transactions from duplicates.
 */
export interface DuplicateCheckResult {
  /** Transactions that are not duplicates and can be imported */
  unique: ParsedTransaction[];

  /** Transactions that were identified as duplicates */
  duplicates: ParsedTransaction[];
}

/**
 * Represents an error encountered during import.
 * Provides detailed context for troubleshooting.
 */
export interface ImportError {
  /** Row number in source file where error occurred (optional) */
  row?: number;

  /** Field name that caused the error (optional) */
  field?: string;

  /** Human-readable error message */
  message: string;

  /** Machine-readable error code for categorization */
  code: string;
}

/**
 * DTO for initiating a file import operation.
 * Contains metadata required to process the import.
 */
export class ImportFileDto {
  /** UUID of the tenant performing the import */
  @IsUUID()
  tenantId!: string;

  /** Bank account identifier for the transactions */
  @IsString()
  bankAccount!: string;

  /** Source format of the import file */
  @IsEnum(ImportSource)
  source!: ImportSource;
}
