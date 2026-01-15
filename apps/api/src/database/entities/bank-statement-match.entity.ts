/**
 * Bank Statement Match Entity Types
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 * TASK-RECON-004: Duplicate Detection
 * TASK-RECON-005: Manual Match Override
 */

// Re-export Prisma-generated enum for type consistency
// Using import/export pattern to make it available both as a type and value
import { BankStatementMatchStatus } from '@prisma/client';
export { BankStatementMatchStatus };

/**
 * TASK-RECON-005: Match type - how the bank statement match was established
 * Renamed to BankMatchType to avoid conflict with payment.entity MatchType
 */
export enum BankMatchType {
  /** Automatic match by the reconciliation algorithm */
  AUTOMATIC = 'AUTOMATIC',
  /** Manual match by a user */
  MANUAL = 'MANUAL',
}

/**
 * TASK-RECON-004: Duplicate detection result
 */
export interface DuplicateDetectionResult {
  /** The new entry being imported */
  newEntry: ParsedBankTransaction;
  /** The existing entry that may be a duplicate */
  existingEntry: {
    id: string;
    bankDate: Date;
    bankDescription: string;
    bankAmountCents: number;
    bankIsCredit: boolean;
    reconciliationId: string;
  };
  /** Confidence that this is a duplicate (0-1) */
  confidence: number;
  /** Composite key used for matching */
  compositeKey: string;
}

/**
 * TASK-RECON-004: Duplicate resolution status
 */
export enum DuplicateResolutionStatus {
  /** Duplicate detected, awaiting user decision */
  PENDING = 'PENDING',
  /** Confirmed as duplicate, entry skipped */
  CONFIRMED_DUPLICATE = 'CONFIRMED_DUPLICATE',
  /** Marked as false positive, entry imported */
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

/**
 * TASK-RECON-004: Duplicate resolution history record
 */
export interface DuplicateResolution {
  id: string;
  tenantId: string;
  /** Composite key: date|amount|reference */
  compositeKey: string;
  /** ID of the existing entry */
  existingEntryId: string;
  /** Resolution status */
  status: DuplicateResolutionStatus;
  /** User who resolved the duplicate */
  resolvedBy: string | null;
  /** When the duplicate was resolved */
  resolvedAt: Date | null;
  /** Notes about the resolution */
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * TASK-RECON-005: Manual match history record
 */
export interface ManualMatchHistory {
  id: string;
  tenantId: string;
  /** The bank statement match ID */
  matchId: string;
  /** Previous transaction ID (null if was unmatched) */
  previousTransactionId: string | null;
  /** New transaction ID (null if unmatching) */
  newTransactionId: string | null;
  /** User who performed the action */
  performedBy: string;
  /** When the action was performed */
  performedAt: Date;
  /** Action type: 'MATCH' or 'UNMATCH' */
  action: 'MATCH' | 'UNMATCH';
  /** Reason for the manual match/unmatch */
  reason: string | null;
}

export interface IBankStatementMatch {
  id: string;
  tenantId: string;
  reconciliationId: string;

  // Bank statement side
  bankDate: Date;
  bankDescription: string;
  bankAmountCents: number;
  bankIsCredit: boolean;

  // Xero/CrecheBooks side (nullable if no match)
  transactionId: string | null;
  xeroDate: Date | null;
  xeroDescription: string | null;
  xeroAmountCents: number | null;
  xeroIsCredit: boolean | null;

  // Match result
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  discrepancyReason: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// Parsed bank statement data
export interface ParsedBankStatement {
  statementPeriod: {
    start: Date;
    end: Date;
  };
  accountNumber: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  transactions: ParsedBankTransaction[];
}

export interface ParsedBankTransaction {
  date: Date;
  description: string;
  amountCents: number;
  isCredit: boolean;
  balanceCents?: number;
  /**
   * Bank charges/fees associated with this transaction (e.g., ADT cash deposit fee).
   * This fee appears on the same line as the transaction but may be deducted
   * separately (immediately, at month-end, or in a later period).
   */
  feeAmountCents?: number;
}

// Reconciliation summary
export interface BankStatementReconciliationResult {
  reconciliationId: string;
  statementPeriod: { start: Date; end: Date };
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  matchSummary: {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    total: number;
  };
  status: 'RECONCILED' | 'DISCREPANCY';
}

// Create DTO for repository
export interface CreateBankStatementMatchDto {
  tenantId: string;
  reconciliationId: string;
  bankDate: Date;
  bankDescription: string;
  bankAmountCents: number;
  bankIsCredit: boolean;
  transactionId: string | null;
  xeroDate: Date | null;
  xeroDescription: string | null;
  xeroAmountCents: number | null;
  xeroIsCredit: boolean | null;
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  discrepancyReason: string | null;
}
