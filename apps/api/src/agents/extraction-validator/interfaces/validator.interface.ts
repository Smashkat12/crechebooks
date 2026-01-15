/**
 * Extraction Validator Interfaces
 * TASK-AGENT-006
 *
 * Interfaces for PDF extraction validation agent
 */
import { ParsedBankStatement } from '../../../database/entities/bank-statement-match.entity';

/**
 * Result of balance reconciliation check
 */
export interface ReconciliationResult {
  reconciled: boolean;
  calculatedBalance: number; // In cents
  expectedBalance: number; // In cents (closing balance from statement)
  difference: number; // Absolute difference in cents
  percentDifference: number; // Percentage difference
  credits: number; // Total credits in cents
  debits: number; // Total debits in cents
}

/**
 * Suggested correction for OCR errors
 */
export interface Correction {
  type: 'AMOUNT' | 'DATE' | 'DESCRIPTION' | 'BALANCE';
  field: string;
  original: string | number;
  corrected: string | number;
  confidence: number; // 0-100
  reason: string;
}

/**
 * Validation flag for issues detected
 */
export interface ValidationFlag {
  severity: 'INFO' | 'WARNING' | 'ERROR';
  code: string;
  message: string;
  affectedField?: string;
  lineNumber?: number;
  suggestedValue?: string | number;
}

/**
 * Result of amount sanity check
 */
export interface SanityResult {
  valid: boolean;
  flag?: string;
  message?: string;
  suggestedCorrection?: number | null;
}

/**
 * Full validation result
 */
export interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0-100
  balanceReconciled: boolean;
  balanceDifference: number; // In cents
  corrections: Correction[];
  flags: ValidationFlag[];
  reasoning: string; // Human-readable explanation
  reconciliation?: ReconciliationResult;
}

/**
 * Validated bank statement with corrections applied
 */
export interface ValidatedBankStatement extends ParsedBankStatement {
  validation: ValidationResult;
  originalOpeningBalanceCents?: number; // Original before correction
  originalClosingBalanceCents?: number; // Original before correction
}

/**
 * Escalation request for invalid extractions
 */
export interface ExtractionEscalation {
  type: 'EXTRACTION_INVALID';
  tenantId: string;
  fileName?: string;
  validation: ValidationResult;
  rawData: ParsedBankStatement;
  timestamp: Date;
}
