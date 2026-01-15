/**
 * Batch Import Validator Service
 * TXN-006: Fix Batch Import Validation
 *
 * Validates batch before import:
 * - Check for duplicates
 * - Validate format of each row
 * - Return detailed validation results per row
 * - Support partial import (skip invalid rows)
 * - Track import history with error log
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionRepository } from '../repositories/transaction.repository';
import { TransactionDateService } from './transaction-date.service';
import { format, subDays } from 'date-fns';
import { ValidationException } from '../../shared/exceptions';

/**
 * Validation error severity levels
 */
export enum ValidationSeverity {
  ERROR = 'ERROR', // Row cannot be imported
  WARNING = 'WARNING', // Row can be imported but may have issues
  INFO = 'INFO', // Informational message
}

/**
 * Validation error for a single row
 */
export interface RowValidationError {
  rowNumber: number;
  field: string;
  severity: ValidationSeverity;
  message: string;
  value?: unknown;
  suggestion?: string;
}

/**
 * Row validation result
 */
export interface RowValidationResult {
  rowNumber: number;
  isValid: boolean;
  canImport: boolean; // Can be imported (no ERROR severity)
  errors: RowValidationError[];
  data?: ParsedImportRow;
}

/**
 * Parsed import row
 */
export interface ParsedImportRow {
  date: Date;
  description: string;
  amountCents: number;
  isCredit: boolean;
  payeeName?: string;
  reference?: string;
  originalRow: Record<string, unknown>;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  isValid: boolean;
  canPartialImport: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  duplicateRows: number;
  errors: RowValidationError[];
  rowResults: RowValidationResult[];
  summary: {
    byField: Record<string, number>;
    bySeverity: Record<ValidationSeverity, number>;
    estimatedImportCount: number;
  };
}

/**
 * Import history record
 */
export interface ImportHistoryRecord {
  id: string;
  tenantId: string;
  batchId: string;
  fileName: string;
  importedAt: Date;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorLog: RowValidationError[];
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
}

/**
 * Column mapping for CSV import
 */
export interface ColumnMapping {
  date?: string;
  description?: string;
  amount?: string;
  credit?: string;
  debit?: string;
  payeeName?: string;
  reference?: string;
  balance?: string;
}

const DUPLICATE_LOOKBACK_DAYS = 90;

@Injectable()
export class BatchImportValidatorService {
  private readonly logger = new Logger(BatchImportValidatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionRepository: TransactionRepository,
    private readonly dateService: TransactionDateService,
  ) {}

  /**
   * Validate a batch of transactions before import
   */
  async validateBatch(
    rows: Record<string, unknown>[],
    tenantId: string,
    columnMapping?: ColumnMapping,
  ): Promise<BatchValidationResult> {
    this.logger.log(
      `Validating batch of ${rows.length} rows for tenant ${tenantId}`,
    );

    const rowResults: RowValidationResult[] = [];
    const allErrors: RowValidationError[] = [];

    // Parse and validate each row
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1; // 1-indexed for user display
      const result = this.validateRow(rows[i], rowNumber, columnMapping);
      rowResults.push(result);
      allErrors.push(...result.errors);
    }

    // Check for duplicates within batch
    const inBatchDuplicates = this.findInBatchDuplicates(rowResults);
    allErrors.push(...inBatchDuplicates);

    // Check for duplicates against existing transactions
    const existingDuplicates = await this.findExistingDuplicates(
      rowResults.filter((r) => r.canImport && r.data),
      tenantId,
    );
    allErrors.push(...existingDuplicates);

    // Mark duplicate rows
    const duplicateRowNumbers = new Set<number>();
    for (const error of [...inBatchDuplicates, ...existingDuplicates]) {
      if (error.severity === ValidationSeverity.ERROR) {
        duplicateRowNumbers.add(error.rowNumber);
        const result = rowResults.find((r) => r.rowNumber === error.rowNumber);
        if (result) {
          result.canImport = false;
          result.errors.push(error);
        }
      }
    }

    // Calculate summary
    const validRows = rowResults.filter((r) => r.isValid).length;
    const invalidRows = rowResults.filter((r) => !r.canImport).length;
    const warningRows = rowResults.filter(
      (r) =>
        r.canImport &&
        r.errors.some((e) => e.severity === ValidationSeverity.WARNING),
    ).length;

    const summary = this.calculateSummary(allErrors, rowResults);

    return {
      isValid:
        allErrors.filter((e) => e.severity === ValidationSeverity.ERROR)
          .length === 0,
      canPartialImport: rowResults.filter((r) => r.canImport).length > 0,
      totalRows: rows.length,
      validRows,
      invalidRows,
      warningRows,
      duplicateRows: duplicateRowNumbers.size,
      errors: allErrors,
      rowResults,
      summary,
    };
  }

  /**
   * Validate a single row
   */
  validateRow(
    row: Record<string, unknown>,
    rowNumber: number,
    columnMapping?: ColumnMapping,
  ): RowValidationResult {
    const errors: RowValidationError[] = [];
    const mapping = columnMapping || this.detectColumnMapping(row);

    // Parse date
    let date: Date | undefined;
    const dateField = mapping.date || 'date';
    const dateValue = row[dateField];

    if (!dateValue) {
      errors.push({
        rowNumber,
        field: 'date',
        severity: ValidationSeverity.ERROR,
        message: 'Date is required',
      });
    } else {
      try {
        const parsed = this.dateService.parseDate(String(dateValue));
        date = parsed.date;

        if (!this.dateService.validateTransactionDate(date)) {
          errors.push({
            rowNumber,
            field: 'date',
            severity: ValidationSeverity.WARNING,
            message: 'Date is outside normal range (7 years to 1 day future)',
            value: dateValue,
          });
        }
      } catch (error) {
        errors.push({
          rowNumber,
          field: 'date',
          severity: ValidationSeverity.ERROR,
          message: `Invalid date format: ${dateValue}`,
          value: dateValue,
          suggestion: 'Use format dd/MM/yyyy or yyyy-MM-dd',
        });
      }
    }

    // Parse description
    const descriptionField = mapping.description || 'description';
    const description = row[descriptionField];

    if (!description || String(description).trim().length === 0) {
      errors.push({
        rowNumber,
        field: 'description',
        severity: ValidationSeverity.ERROR,
        message: 'Description is required',
      });
    } else if (String(description).length > 500) {
      errors.push({
        rowNumber,
        field: 'description',
        severity: ValidationSeverity.WARNING,
        message: 'Description will be truncated to 500 characters',
        value: String(description).length,
      });
    }

    // Parse amount
    let amountCents: number | undefined;
    let isCredit = false;

    if (mapping.credit && mapping.debit) {
      // Separate credit/debit columns
      const creditValue = row[mapping.credit];
      const debitValue = row[mapping.debit];

      if (creditValue && this.parseAmount(creditValue) > 0) {
        amountCents = this.parseAmount(creditValue);
        isCredit = true;
      } else if (debitValue && this.parseAmount(debitValue) > 0) {
        amountCents = this.parseAmount(debitValue);
        isCredit = false;
      } else if (!creditValue && !debitValue) {
        errors.push({
          rowNumber,
          field: 'amount',
          severity: ValidationSeverity.ERROR,
          message: 'Either credit or debit amount is required',
        });
      }
    } else {
      // Single amount column
      const amountField = mapping.amount || 'amount';
      const amountValue = row[amountField];

      if (!amountValue && amountValue !== 0) {
        errors.push({
          rowNumber,
          field: 'amount',
          severity: ValidationSeverity.ERROR,
          message: 'Amount is required',
        });
      } else {
        amountCents = this.parseAmount(amountValue);
        isCredit = amountCents > 0;
        amountCents = Math.abs(amountCents);

        if (amountCents === 0) {
          errors.push({
            rowNumber,
            field: 'amount',
            severity: ValidationSeverity.WARNING,
            message: 'Zero amount transaction',
            value: amountValue,
          });
        }
      }
    }

    // Validate amount range
    if (amountCents !== undefined) {
      if (amountCents > 100_000_000_00) {
        // R100 million
        errors.push({
          rowNumber,
          field: 'amount',
          severity: ValidationSeverity.WARNING,
          message: 'Unusually large amount - please verify',
          value: amountCents,
        });
      }
    }

    // Parse optional fields
    const payeeName = mapping.payeeName
      ? String(row[mapping.payeeName] || '').trim()
      : undefined;
    const reference = mapping.reference
      ? String(row[mapping.reference] || '').trim()
      : undefined;

    const hasErrors = errors.some(
      (e) => e.severity === ValidationSeverity.ERROR,
    );

    const result: RowValidationResult = {
      rowNumber,
      isValid: errors.length === 0,
      canImport: !hasErrors,
      errors,
    };

    if (!hasErrors && date && description && amountCents !== undefined) {
      result.data = {
        date,
        description: String(description).trim().substring(0, 500),
        amountCents,
        isCredit,
        payeeName: payeeName || undefined,
        reference: reference || undefined,
        originalRow: row,
      };
    }

    return result;
  }

  /**
   * Find duplicates within the batch itself
   */
  private findInBatchDuplicates(
    rowResults: RowValidationResult[],
  ): RowValidationError[] {
    const errors: RowValidationError[] = [];
    const seen = new Map<string, number>();

    for (const result of rowResults) {
      if (!result.data) continue;

      const hash = this.createTransactionHash(result.data);

      if (seen.has(hash)) {
        const originalRow = seen.get(hash)!;
        errors.push({
          rowNumber: result.rowNumber,
          field: 'row',
          severity: ValidationSeverity.ERROR,
          message: `Duplicate of row ${originalRow} in this batch`,
          suggestion: 'Remove duplicate row before import',
        });
      } else {
        seen.set(hash, result.rowNumber);
      }
    }

    return errors;
  }

  /**
   * Find duplicates against existing transactions in database
   */
  private async findExistingDuplicates(
    rowResults: RowValidationResult[],
    tenantId: string,
  ): Promise<RowValidationError[]> {
    if (rowResults.length === 0) return [];

    const errors: RowValidationError[] = [];

    // Find date range in incoming transactions
    const dates = rowResults
      .filter((r) => r.data)
      .map((r) => r.data!.date.getTime());

    if (dates.length === 0) return [];

    const oldestIncoming = new Date(Math.min(...dates));
    const lookbackDate = subDays(oldestIncoming, DUPLICATE_LOOKBACK_DAYS);
    const newestIncoming = new Date(Math.max(...dates));

    // Get existing transactions in window
    const existingResult = await this.transactionRepository.findByTenant(
      tenantId,
      {
        dateFrom: lookbackDate,
        dateTo: newestIncoming,
        limit: 10000,
      },
    );

    // Build hash set
    const existingSet = new Set<string>();
    for (const tx of existingResult.data) {
      const dateStr = format(tx.date, 'yyyy-MM-dd');
      const hash = `${dateStr}|${tx.description}|${tx.amountCents}`;
      existingSet.add(hash);
    }

    // Check each row
    for (const result of rowResults) {
      if (!result.data) continue;

      const hash = this.createTransactionHash(result.data);

      if (existingSet.has(hash)) {
        errors.push({
          rowNumber: result.rowNumber,
          field: 'row',
          severity: ValidationSeverity.WARNING,
          message: 'Potential duplicate of existing transaction',
          suggestion: 'Review before import - may already exist in system',
        });
      }
    }

    return errors;
  }

  /**
   * Create hash for duplicate detection
   */
  private createTransactionHash(data: ParsedImportRow): string {
    const dateStr = format(data.date, 'yyyy-MM-dd');
    return `${dateStr}|${data.description}|${data.amountCents}`;
  }

  /**
   * Parse amount from various formats
   */
  private parseAmount(value: unknown): number {
    if (typeof value === 'number') {
      // Assume it's in Rands, convert to cents
      return Math.round(value * 100);
    }

    const str = String(value).trim();

    // Remove currency symbols and spaces
    const cleaned = str.replace(/[R$\s,]/g, '').replace(/\u00A0/g, ''); // nbsp

    // Handle parentheses for negative (accounting format)
    const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
    const numStr = isNegative ? cleaned.slice(1, -1) : cleaned;

    const num = parseFloat(numStr);

    if (isNaN(num)) {
      return 0;
    }

    // Convert to cents
    let cents = Math.round(num * 100);
    if (isNegative || str.startsWith('-')) {
      cents = -Math.abs(cents);
    }

    return cents;
  }

  /**
   * Detect column mapping from row keys
   */
  private detectColumnMapping(row: Record<string, unknown>): ColumnMapping {
    const keys = Object.keys(row).map((k) => k.toLowerCase());
    const mapping: ColumnMapping = {};

    // Date column detection
    const datePatterns = [
      'date',
      'transaction date',
      'txn date',
      'posting date',
    ];
    for (const pattern of datePatterns) {
      const match = keys.find((k) => k.includes(pattern));
      if (match) {
        mapping.date = Object.keys(row).find((k) => k.toLowerCase() === match);
        break;
      }
    }

    // Description column detection
    const descPatterns = [
      'description',
      'desc',
      'narrative',
      'particulars',
      'details',
    ];
    for (const pattern of descPatterns) {
      const match = keys.find((k) => k.includes(pattern));
      if (match) {
        mapping.description = Object.keys(row).find(
          (k) => k.toLowerCase() === match,
        );
        break;
      }
    }

    // Amount column detection
    const amountPatterns = ['amount', 'value', 'transaction amount'];
    for (const pattern of amountPatterns) {
      const match = keys.find((k) => k.includes(pattern));
      if (match) {
        mapping.amount = Object.keys(row).find(
          (k) => k.toLowerCase() === match,
        );
        break;
      }
    }

    // Credit/Debit column detection
    const creditMatch = keys.find(
      (k) => k.includes('credit') || k.includes('deposits'),
    );
    const debitMatch = keys.find(
      (k) => k.includes('debit') || k.includes('withdrawals'),
    );

    if (creditMatch && debitMatch) {
      mapping.credit = Object.keys(row).find(
        (k) => k.toLowerCase() === creditMatch,
      );
      mapping.debit = Object.keys(row).find(
        (k) => k.toLowerCase() === debitMatch,
      );
    }

    // Reference column detection
    const refPatterns = ['reference', 'ref', 'cheque', 'check'];
    for (const pattern of refPatterns) {
      const match = keys.find((k) => k.includes(pattern));
      if (match) {
        mapping.reference = Object.keys(row).find(
          (k) => k.toLowerCase() === match,
        );
        break;
      }
    }

    // Payee column detection
    const payeePatterns = ['payee', 'beneficiary', 'recipient', 'name'];
    for (const pattern of payeePatterns) {
      const match = keys.find((k) => k.includes(pattern));
      if (match) {
        mapping.payeeName = Object.keys(row).find(
          (k) => k.toLowerCase() === match,
        );
        break;
      }
    }

    return mapping;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    errors: RowValidationError[],
    rowResults: RowValidationResult[],
  ): BatchValidationResult['summary'] {
    const byField: Record<string, number> = {};
    const bySeverity: Record<ValidationSeverity, number> = {
      [ValidationSeverity.ERROR]: 0,
      [ValidationSeverity.WARNING]: 0,
      [ValidationSeverity.INFO]: 0,
    };

    for (const error of errors) {
      byField[error.field] = (byField[error.field] || 0) + 1;
      bySeverity[error.severity]++;
    }

    return {
      byField,
      bySeverity,
      estimatedImportCount: rowResults.filter((r) => r.canImport).length,
    };
  }

  /**
   * Save import history record
   */
  saveImportHistory(
    record: Omit<ImportHistoryRecord, 'id'>,
  ): ImportHistoryRecord {
    const id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // TODO: Store in database table when available
    // For now, log and return
    this.logger.log(
      `Import history: tenant=${record.tenantId}, batch=${record.batchId}, ` +
        `status=${record.status}, imported=${record.importedRows}/${record.totalRows}`,
    );

    return { id, ...record };
  }

  /**
   * Get import history for a tenant
   */
  getImportHistory(
    _tenantId: string,
    _limit: number = 20,
  ): ImportHistoryRecord[] {
    // TODO: Implement when database table is available
    return [];
  }
}
