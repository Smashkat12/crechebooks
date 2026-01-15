/**
 * Transaction Import Service
 * TASK-TRANS-011, TASK-AGENT-006
 *
 * Handles CSV and PDF bank statement imports:
 * 1. Validates file (size, format)
 * 2. Parses transactions
 * 3. Validates PDF extraction quality (TASK-AGENT-006)
 * 4. Detects duplicates (90-day window)
 * 5. Saves unique transactions
 * 6. Queues categorization jobs (placeholder for TASK-TRANS-012)
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { subDays, format } from 'date-fns';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationService } from './categorization.service';
import { CsvParser } from '../parsers/csv-parser';
import { HybridPdfParser } from '../parsers/hybrid-pdf-parser';
import {
  ParsedTransaction,
  ImportResult,
  DuplicateCheckResult,
  ImportError,
} from '../dto/import.dto';
import { ImportSource } from '../entities/transaction.entity';
import {
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';
import { ExtractionValidatorAgent } from '../../agents/extraction-validator';

// File constraints
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['csv', 'pdf'];
const DUPLICATE_LOOKBACK_DAYS = 90;

// Bank charge patterns for splitting combined transactions
// These patterns indicate a transaction was categorized as "Bank charges"
// but actually contains a deposit/payment with accrued fees
const BANK_CHARGE_DESCRIPTION_PATTERNS = [
  /^bank\s*charges?$/i,
  /^bank\s*fees?$/i,
  /^service\s*charges?$/i,
];

// Patterns in payee/reference that indicate the original transaction type
// Fee amounts based on actual FNB bank statement analysis
const DEPOSIT_REFERENCE_PATTERNS = [
  {
    pattern: /ADT\s*Cash\s*Deposit/i,
    type: 'ADT_CASH_DEPOSIT',
    feeAmountCents: 1470,
  }, // R14.70 (FNB ADT deposit fee)
  { pattern: /Cash\s*Deposit/i, type: 'CASH_DEPOSIT', feeAmountCents: 1470 }, // R14.70
  { pattern: /ATM\s*Deposit/i, type: 'ATM_DEPOSIT', feeAmountCents: 500 }, // R5.00
];

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

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationService: CategorizationService,
    @Optional() private readonly extractionValidator?: ExtractionValidatorAgent,
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

    // 2b. Split transactions with accrued bank charges
    parsedTransactions = this.splitAccruedBankCharges(parsedTransactions);
    this.logger.log(
      `After bank charge split: ${parsedTransactions.length} transactions`,
    );

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

    // 5. Auto-categorize imported transactions
    const transactionIds = created.map((t) => t.id);
    this.logger.log(
      `Auto-categorizing ${transactionIds.length} imported transactions`,
    );

    let categorizationResult;
    try {
      categorizationResult =
        await this.categorizationService.categorizeTransactions(
          transactionIds,
          tenantId,
        );
      this.logger.log(
        `Categorization complete: ${categorizationResult.autoCategorized} auto-categorized, ${categorizationResult.reviewRequired} need review`,
      );
    } catch (error) {
      this.logger.warn(
        `Categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Don't fail import if categorization fails - transactions are still saved
    }

    return {
      importBatchId,
      status: 'COMPLETED',
      fileName: file.originalname,
      totalParsed: parsedTransactions.length,
      duplicatesSkipped: duplicates.length,
      transactionsCreated: created.length,
      errors,
      categorization: categorizationResult
        ? {
            autoCategorized: categorizationResult.autoCategorized,
            reviewRequired: categorizationResult.reviewRequired,
          }
        : undefined,
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

  /**
   * Split transactions that have accrued bank charges combined with the original transaction.
   *
   * This handles cases where:
   * 1. Xero categorizes a deposit as "Bank charges" because the fee was shown on the same line
   * 2. The payee/reference field contains the actual transaction details (e.g., "ADT Cash Deposit")
   * 3. The amount includes both the original transaction and the bank fee
   *
   * Example:
   * Input: { description: "Bank charges", payeeName: "ADT Cash Deposit 09741002 Bokamoso Mbewe", amount: R510.95 }
   * Output: [
   *   { description: "ADT Cash Deposit - Bokamoso Mbewe", amount: R500.00, isCredit: true },
   *   { description: "Bank Charges - ADT Cash Deposit Fee", amount: R10.95, isCredit: false }
   * ]
   *
   * Note: The bank charge may be deducted in a different period than when it appears on the statement.
   */
  private splitAccruedBankCharges(
    transactions: ParsedTransaction[],
  ): ParsedTransaction[] {
    const result: ParsedTransaction[] = [];

    for (const tx of transactions) {
      const splitResult = this.tryDetectAndSplitBankCharge(tx);
      if (splitResult) {
        this.logger.log(
          `Split bank charge transaction: "${tx.description}" (${tx.amountCents}c) -> ` +
            `"${splitResult.mainTransaction.description}" (${splitResult.mainTransaction.amountCents}c) + ` +
            `"${splitResult.feeTransaction.description}" (${splitResult.feeTransaction.amountCents}c)`,
        );
        result.push(splitResult.mainTransaction);
        result.push(splitResult.feeTransaction);
      } else {
        result.push(tx);
      }
    }

    return result;
  }

  /**
   * Attempt to detect if a transaction is a combined deposit + bank charge
   * and split it into two separate transactions.
   */
  private tryDetectAndSplitBankCharge(tx: ParsedTransaction): {
    mainTransaction: ParsedTransaction;
    feeTransaction: ParsedTransaction;
  } | null {
    // Check if description matches bank charge pattern
    const isBankChargeDescription = BANK_CHARGE_DESCRIPTION_PATTERNS.some(
      (pattern) => pattern.test(tx.description),
    );

    if (!isBankChargeDescription) {
      return null;
    }

    // Check if payee/reference indicates original transaction type
    const payeeOrRef = tx.payeeName || tx.reference || '';
    const depositPattern = DEPOSIT_REFERENCE_PATTERNS.find((p) =>
      p.pattern.test(payeeOrRef),
    );

    if (!depositPattern) {
      return null;
    }

    // Extract meaningful name from payee field
    // e.g., "ADT Cash Deposit 09741002 Bokamoso Mbewe" -> "Bokamoso Mbewe"
    const payeeName = this.extractPayeeFromDepositReference(payeeOrRef);

    // Calculate split amounts
    const feeAmountCents = depositPattern.feeAmountCents;
    const depositAmountCents = tx.amountCents - feeAmountCents;

    // Validate split makes sense (deposit should be positive after fee removal)
    if (depositAmountCents <= 0) {
      this.logger.warn(
        `Cannot split transaction: amount ${tx.amountCents}c is less than expected fee ${feeAmountCents}c`,
      );
      return null;
    }

    // Create the main deposit transaction
    const mainTransaction: ParsedTransaction = {
      date: tx.date,
      description: `${depositPattern.type.replace(/_/g, ' ')} - ${payeeName}`,
      payeeName: payeeName,
      reference: tx.reference,
      amountCents: depositAmountCents,
      isCredit: true, // Deposits are credits
    };

    // Create the bank charge transaction
    // Note: Bank charges might be deducted in a later period
    const feeTransaction: ParsedTransaction = {
      date: tx.date,
      description: `Bank Charges - ${depositPattern.type.replace(/_/g, ' ')} Fee`,
      payeeName: 'Bank Charges',
      reference: `Fee for ${payeeName}`,
      amountCents: feeAmountCents,
      isCredit: false, // Bank charges are debits
    };

    return { mainTransaction, feeTransaction };
  }

  /**
   * Extract payee name from a deposit reference string.
   * e.g., "ADT Cash Deposit 09741002 Bokamoso Mbewe" -> "Bokamoso Mbewe"
   */
  private extractPayeeFromDepositReference(reference: string): string {
    // Remove common prefixes
    let cleaned = reference
      .replace(/ADT\s*Cash\s*Deposit/gi, '')
      .replace(/Cash\s*Deposit/gi, '')
      .replace(/ATM\s*Deposit/gi, '')
      .trim();

    // Remove leading numbers/reference codes (e.g., "09741002")
    cleaned = cleaned.replace(/^\d+\s*/, '').trim();

    // If nothing left, return original
    return cleaned || reference;
  }

  /**
   * Validate a parsed bank statement for extraction quality
   * TASK-AGENT-006: PDF Extraction Validation Agent
   *
   * This method validates the quality of PDF extraction using the ExtractionValidatorAgent.
   * It checks:
   * - Balance reconciliation (opening + transactions = closing)
   * - Amount sanity (reasonable values for creche business)
   * - OCR error detection (common decimal point errors)
   *
   * @param statement - Full parsed bank statement with balances
   * @param tenantId - Tenant ID for logging
   * @returns Validation result with confidence score and any flags
   *
   * @example
   * // Use when you have full statement data (e.g., from reconciliation flow)
   * const validation = await importService.validateBankStatement(statement, tenantId);
   * if (!validation.isValid) {
   *   // Handle invalid extraction - flag for manual review
   * }
   */
  async validateBankStatement(
    statement: import('../entities/bank-statement-match.entity').ParsedBankStatement,
    tenantId: string,
  ) {
    if (!this.extractionValidator) {
      this.logger.warn(
        'ExtractionValidatorAgent not available - skipping validation',
      );
      return {
        isValid: true,
        confidence: 0,
        balanceReconciled: true,
        balanceDifference: 0,
        flags: [],
        corrections: [],
        reasoning: 'Validation skipped - validator not available',
      };
    }

    this.logger.log(
      `Validating bank statement extraction for tenant ${tenantId}`,
    );

    const result = await this.extractionValidator.validate(statement, tenantId);

    this.logger.log(
      `Validation result: valid=${result.isValid}, confidence=${result.confidence}, ` +
        `reconciled=${result.balanceReconciled}, flags=${result.flags.length}`,
    );

    return result;
  }
}
